// Menu Supervisi (kepala lembaga) — akademik & manajerial.
// Bank instrumen + butir yang bisa diedit admin, sesi supervisi dengan skor
// per butir, rekomendasi + tindak lanjut, cetak laporan PDF/JPEG, dan rekap tren.
// Instrumen/butir disimpan per tenant supaya tiap lembaga bisa menyesuaikan.

function escapeHtml(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const ASPEK = ['akademik', 'manajerial']

function labelAspek(aspek) {
  return aspek === 'akademik' ? 'Supervisi Akademik' : aspek === 'manajerial' ? 'Supervisi Manajerial' : 'Supervisi'
}

// Predikat mengikuti ambang lazim: A >= 90, B >= 80, C >= 70, sisanya D.
function predikatDari(persen) {
  const p = Number(persen) || 0
  if (p >= 90) return 'A (Sangat Baik)'
  if (p >= 80) return 'B (Baik)'
  if (p >= 70) return 'C (Cukup)'
  return 'D (Perlu Pembinaan)'
}

const BUTIR_AKADEMIK = [
  { pertanyaan: 'Menyusun program tahunan dan semester', indikator: 'Ada dokumen prota/promes yang sesuai kalender pendidikan' },
  { pertanyaan: 'Menyusun RPP/modul ajar per pertemuan', indikator: 'RPP lengkap: tujuan, langkah, asesmen' },
  { pertanyaan: 'Melaksanakan pembelajaran sesuai RPP', indikator: 'Urutan kegiatan sesuai rencana, terdokumentasi jurnal' },
  { pertanyaan: 'Menggunakan media/alat bantu pembelajaran', indikator: 'Media relevan dan menunjang tujuan' },
  { pertanyaan: 'Melaksanakan penilaian sesuai teknik yang direncanakan', indikator: 'Instrumen penilaian tersedia dan terdokumentasi' },
  { pertanyaan: 'Menganalisis hasil penilaian dan menindaklanjuti', indikator: 'Ada analisis + program perbaikan/pengayaan' },
  { pertanyaan: 'Mengelola kelas secara efektif', indikator: 'Kelas kondusif, disiplin terbangun' },
  { pertanyaan: 'Memanfaatkan hasil supervisi untuk perbaikan', indikator: 'Ada refleksi dan rencana tindak lanjut' },
]

const BUTIR_MANAJERIAL = [
  { pertanyaan: 'Kelengkapan administrasi pembelajaran', indikator: 'Buku kerja guru 1-4 terisi' },
  { pertanyaan: 'Ketertiban dan kehadiran sesuai aturan lembaga', indikator: 'Presensi guru tertib, tanpa pelanggaran' },
  { pertanyaan: 'Pengelolaan sarana pendukung pembelajaran', indikator: 'Alat/bahan tersedia dan terawat' },
  { pertanyaan: 'Pelibatan orang tua/wali dalam pendampingan', indikator: 'Ada komunikasi dan pelaporan berkala' },
  { pertanyaan: 'Kontribusi pada kegiatan lembaga', indikator: 'Terlibat panitia/kegiatan lembaga' },
  { pertanyaan: 'Pengembangan diri (diklat, MGMP, literasi)', indikator: 'Ada bukti pengembangan kompetensi' },
  { pertanyaan: 'Kerja sama dalam tim (kolegial)', indikator: 'Berbagi praktik baik, kolaboratif' },
  { pertanyaan: 'Keteladanan dan etika profesi', indikator: 'Menjadi contoh, menjaga kode etik' },
]

function setupSupervisiTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS supervisi_instrumen (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, aspek TEXT NOT NULL,
    nama TEXT NOT NULL, deskripsi TEXT DEFAULT '', aktif INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')))`)
  db.exec(`CREATE TABLE IF NOT EXISTS supervisi_butir (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, instrumen_id TEXT NOT NULL,
    urutan INTEGER DEFAULT 0, pertanyaan TEXT NOT NULL, indikator TEXT DEFAULT '',
    max_skor INTEGER DEFAULT 4)`)
  db.exec(`CREATE TABLE IF NOT EXISTS supervisi_sesi (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, instrumen_id TEXT,
    aspek TEXT, guru_id TEXT, nama_terperiksa TEXT, jabatan TEXT,
    supervisor_nama TEXT, tanggal TEXT, skor_total REAL DEFAULT 0,
    skor_maks REAL DEFAULT 0, persen REAL DEFAULT 0, predikat TEXT,
    catatan TEXT DEFAULT '', rekomendasi TEXT DEFAULT '', tindak_lanjut TEXT DEFAULT '',
    status TEXT DEFAULT 'draft', created_by TEXT, created_at TEXT DEFAULT (datetime('now')))`)
  db.exec(`CREATE TABLE IF NOT EXISTS supervisi_skor (
    id TEXT PRIMARY KEY, sesi_id TEXT NOT NULL, butir_id TEXT,
    skor REAL DEFAULT 0, catatan TEXT DEFAULT '')`)
  db.exec('CREATE INDEX IF NOT EXISTS idx_supervisi_sesi_tenant ON supervisi_sesi(tenant_id, tanggal DESC)')
}

function seedInstrumenBawaan(db, tenantId, makeId) {
  const ada = db.prepare('SELECT aspek FROM supervisi_instrumen WHERE tenant_id=?').all(tenantId).map(r => r.aspek)
  const insIns = db.prepare('INSERT INTO supervisi_instrumen (id, tenant_id, aspek, nama, deskripsi, aktif) VALUES (?,?,?,?,?,1)')
  const insButir = db.prepare('INSERT INTO supervisi_butir (id, tenant_id, instrumen_id, urutan, pertanyaan, indikator, max_skor) VALUES (?,?,?,?,?,?,4)')
  const paket = [
    { aspek: 'akademik', nama: 'Instrumen Supervisi Akademik', deskripsi: 'Penilaian perencanaan, pelaksanaan, dan penilaian pembelajaran', butir: BUTIR_AKADEMIK },
    { aspek: 'manajerial', nama: 'Instrumen Supervisi Manajerial', deskripsi: 'Penilaian administrasi, ketertiban, dan pengembangan diri', butir: BUTIR_MANAJERIAL },
  ]
  for (const p of paket) {
    if (ada.includes(p.aspek)) continue // sudah ada -> idempoten, jangan gandakan butir
    const iid = makeId()
    insIns.run(iid, tenantId, p.aspek, p.nama, p.deskripsi)
    p.butir.forEach((b, idx) => insButir.run(makeId(), tenantId, iid, idx + 1, b.pertanyaan, b.indikator))
  }
}

function daftarInstrumen(db, tenantId, aspek = null) {
  const rows = aspek
    ? db.prepare('SELECT * FROM supervisi_instrumen WHERE tenant_id=? AND aspek=? ORDER BY created_at').all(tenantId, aspek)
    : db.prepare('SELECT * FROM supervisi_instrumen WHERE tenant_id=? ORDER BY aspek, created_at').all(tenantId)
  const butirOf = db.prepare('SELECT * FROM supervisi_butir WHERE instrumen_id=? ORDER BY urutan, rowid')
  return rows.map(i => ({ ...i, butir: butirOf.all(i.id) }))
}

function hitungSesi(butir, skorList) {
  const maxOf = new Map(butir.map(b => [b.id, Number(b.max_skor) || 4]))
  let total = 0; let maks = 0
  for (const b of butir) maks += maxOf.get(b.id)
  for (const s of skorList) {
    const m = maxOf.get(s.butir_id)
    if (m === undefined) continue
    const v = Math.max(0, Math.min(Number(s.skor) || 0, m))
    total += v
  }
  const persen = maks > 0 ? Math.round((total / maks) * 1000) / 10 : 0
  return { skor_total: total, skor_maks: maks, persen, predikat: predikatDari(persen) }
}

const CSS_LAPORAN = `
  @page { size: A4; margin: 16mm 16mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #111; margin: 0; }
  h1 { font-size: 15pt; text-align: center; margin: 0 0 2px; }
  .sub { text-align: center; color: #555; font-size: 10pt; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { border: 1px solid #444; padding: 5px 7px; vertical-align: top; font-size: 10.5pt; }
  th { background: #eef2f7; text-align: center; }
  td.c { text-align: center; }
  .kv td { border: none; padding: 2px 6px 2px 0; }
  .ringkas { display: flex; gap: 10px; margin: 10px 0; }
  .kotak { flex: 1; border: 1px solid #999; border-radius: 6px; padding: 8px 10px; text-align: center; }
  .kotak .n { font-size: 18pt; font-weight: 700; }
  .kotak .l { font-size: 9pt; color: #555; }
  .blok { border: 1px solid #999; border-radius: 6px; padding: 8px 10px; margin: 8px 0; min-height: 40px; white-space: pre-wrap; }
  .ttd { margin-top: 26px; width: 260px; margin-left: auto; text-align: center; }
  .ttd-space { height: 56px; }
  .ttd-nama { font-weight: 700; text-decoration: underline; }
`

function buildLaporanHtml({ sesi, butir, skor, settings = {} }) {
  const skorOf = new Map((skor || []).map(s => [s.butir_id, s]))
  const barisHtml = butir.map((b, i) => {
    const s = skorOf.get(b.id)
    return `<tr><td class="c">${i + 1}</td><td>${escapeHtml(b.pertanyaan)}<br/><span style="color:#666;font-size:9.5pt">${escapeHtml(b.indikator || '')}</span></td>
      <td class="c">${s ? s.skor : '-'}</td><td class="c">${b.max_skor}</td>
      <td>${escapeHtml(s && s.catatan ? s.catatan : '')}</td></tr>`
  }).join('')
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"/><title>Laporan Supervisi</title><style>${CSS_LAPORAN}</style></head><body>
    <h1>LAPORAN ${escapeHtml(labelAspek(sesi.aspek).toUpperCase())}</h1>
    <div class="sub">${escapeHtml(settings.nama_lembaga || '')}</div>
    <table class="kv">
      <tr><td>Nama Terperiksa</td><td>: <strong>${escapeHtml(sesi.nama_terperiksa || '-')}</strong></td>
          <td>Tanggal</td><td>: ${escapeHtml(sesi.tanggal || '-')}</td></tr>
      <tr><td>Jabatan</td><td>: ${escapeHtml(sesi.jabatan || '-')}</td>
          <td>Supervisor</td><td>: ${escapeHtml(sesi.supervisor_nama || '-')}</td></tr>
    </table>
    <table>
      <thead><tr><th style="width:28px">No</th><th>Butir Penilaian</th><th style="width:60px">Skor</th><th style="width:52px">Maks</th><th style="width:180px">Catatan</th></tr></thead>
      <tbody>${barisHtml}</tbody>
    </table>
    <div class="ringkas">
      <div class="kotak"><div class="n">${sesi.skor_total}/${sesi.skor_maks}</div><div class="l">Total Skor</div></div>
      <div class="kotak"><div class="n">${sesi.persen}%</div><div class="l">Capaian</div></div>
      <div class="kotak"><div class="n" style="font-size:13pt">${escapeHtml(sesi.predikat || '-')}</div><div class="l">Predikat</div></div>
    </div>
    <div><strong>Catatan Umum</strong><div class="blok">${escapeHtml(sesi.catatan || '-')}</div></div>
    <div><strong>Rekomendasi</strong><div class="blok">${escapeHtml(sesi.rekomendasi || '-')}</div></div>
    <div><strong>Tindak Lanjut</strong><div class="blok">${escapeHtml(sesi.tindak_lanjut || '-')}</div></div>
    <div class="ttd">
      <div>${escapeHtml(settings.kota_cetak || settings.kota || '')}, ${escapeHtml(sesi.tanggal || '')}</div>
      <div>Supervisor,</div>
      <div class="ttd-spati"></div><div class="ttd-space"></div>
      <div class="ttd-nama">${escapeHtml(sesi.supervisor_nama || settings.kepala_sekolah || '.....................')}</div>
    </div>
  </body></html>`
}

module.exports = {
  setupSupervisiTables,
  seedInstrumenBawaan,
  daftarInstrumen,
  hitungSesi,
  predikatDari,
  labelAspek,
  buildLaporanHtml,
  ASPEK,
  escapeHtml,
}