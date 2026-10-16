// Menu Administrasi — surat-menyurat lembaga.
// Satu sumber: tabel surat_jenis (master jenis + template HTML yang bisa diedit
// admin) dan surat_keluar (arsip surat terbit). Penomoran berurutan per jenis
// per tahun lewat surat_counter. PDF/JPEG dirender dari HTML yang sama seperti
// modul invoice (satu sumber tampilan, bukan dua).

const BULAN_ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

function pad(n, len = 3) { return String(n).padStart(len, '0') }

function escapeHtml(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function formatTanggalId(tanggal) {
  if (!tanggal) return ''
  const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(tanggal))
  if (!m) return String(tanggal)
  return `${parseInt(m[3], 10)} ${bulan[parseInt(m[2], 10) - 1]} ${m[1]}`
}

// Tanda tangan penutup — dipakai semua template lewat placeholder {{ttd}}.
function blokTtd(ctx, jabatan = 'Kepala') {
  return `<div class="ttd">
    <div>${escapeHtml(ctx.kota_cetak || '')}, ${escapeHtml(ctx.tanggal_surat || '')}</div>
    <div>${escapeHtml(jabatan)} ${escapeHtml(ctx.nama_lembaga || '')},</div>
    <div class="ttd-space"></div>
    <div class="ttd-nama">${escapeHtml(ctx.kepala_sekolah || '........................................')}</div>
    <div>NIP. ${escapeHtml(ctx.nip_kepala || '-')}</div>
  </div>`
}

const CSS_SURAT = `
  @page { size: A4; margin: 20mm 22mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 13pt; line-height: 1.55; color: #111; margin: 0; }
  .surat { width: 100%; }
  .kop { text-align: center; border-bottom: 3px double #111; padding-bottom: 8px; margin-bottom: 4px; }
  .kop-nama { font-size: 17pt; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
  .kop-alamat { font-size: 10.5pt; }
  .judul { text-align: center; font-size: 15pt; font-weight: 700; text-decoration: underline; margin: 18px 0 2px; letter-spacing: 1px; }
  .nomor { text-align: center; margin: 0 0 16px; }
  .biodata { margin: 8px 0 8px 24px; border-collapse: collapse; }
  .biodata td { padding: 1px 4px; vertical-align: top; }
  .biodata td:nth-child(2) { width: 12px; }
  .ttd { margin-top: 28px; width: 260px; margin-left: auto; text-align: left; }
  .ttd-space { height: 58px; }
  .ttd-nama { font-weight: 700; text-decoration: underline; }
  table.instrumen { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11.5pt; }
  table.instrumen th, table.instrumen td { border: 1px solid #333; padding: 5px 7px; vertical-align: top; }
  table.instrumen th { background: #f0f0f0; text-align: center; }
  .kv { margin: 4px 0 4px 0; }
  .kv td { padding: 2px 6px 2px 0; vertical-align: top; }
  .muted { color: #555; }
  .box { border: 1px solid #999; padding: 8px 10px; margin: 8px 0; min-height: 34px; }
  .center { text-align: center; }
`

// Template bawaan. Placeholder {{...}} diisi dari field jenis + data umum lembaga.
const TEMPLATE_SK_SISWA = `<div class="surat">
  <div class="kop"><div class="kop-nama">{{nama_lembaga}}</div><div class="kop-alamat">{{alamat_lembaga}}</div></div>
  <h1 class="judul">SURAT KETERANGAN</h1>
  <div class="nomor">Nomor: {{nomor}}</div>
  <p>Yang bertanda tangan di bawah ini, Kepala {{nama_lembaga}}, dengan ini menerangkan bahwa:</p>
  <table class="biodata">
    <tr><td>Nama</td><td>:</td><td><strong>{{nama}}</strong></td></tr>
    <tr><td>NISN</td><td>:</td><td>{{nisn}}</td></tr>
    <tr><td>Tempat/Tanggal Lahir</td><td>:</td><td>{{ttl}}</td></tr>
    <tr><td>Kelas</td><td>:</td><td>{{kelas}}</td></tr>
    <tr><td>Alamat</td><td>:</td><td>{{alamat}}</td></tr>
  </table>
  <p>adalah benar siswa pada {{nama_lembaga}} dan berstatus <strong>aktif</strong> pada tahun pelajaran berjalan.</p>
  <p>Surat keterangan ini dibuat untuk keperluan <strong>{{keperluan}}</strong>.</p>
  <p>Demikian surat keterangan ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.</p>
  {{ttd}}
</div>`

const TEMPLATE_SK_GURU = `<div class="surat">
  <div class="kop"><div class="kop-nama">{{nama_lembaga}}</div><div class="kop-alamat">{{alamat_lembaga}}</div></div>
  <h1 class="judul">SURAT KETERANGAN AKTIF MENGAJAR</h1>
  <div class="nomor">Nomor: {{nomor}}</div>
  <p>Yang bertanda tangan di bawah ini, Kepala {{nama_lembaga}}, menerangkan bahwa:</p>
  <table class="biodata">
    <tr><td>Nama</td><td>:</td><td><strong>{{nama}}</strong></td></tr>
    <tr><td>NIP</td><td>:</td><td>{{nip}}</td></tr>
    <tr><td>Jabatan</td><td>:</td><td>{{jabatan}}</td></tr>
    <tr><td>Mata Pelajaran</td><td>:</td><td>{{mapel}}</td></tr>
  </table>
  <p>adalah benar guru/tenaga kependidikan pada {{nama_lembaga}} dan <strong>aktif mengajar</strong> pada tahun pelajaran {{tahun_ajaran}} dengan jumlah jam mengajar sesuai ketentuan yang berlaku.</p>
  <p>Surat keterangan ini dibuat untuk keperluan <strong>{{keperluan}}</strong>.</p>
  <p>Demikian surat keterangan ini dibuat untuk dipergunakan sebagaimana mestinya.</p>
  {{ttd}}
</div>`

const TEMPLATE_TUGAS = `<div class="surat">
  <div class="kop"><div class="kop-nama">{{nama_lembaga}}</div><div class="kop-alamat">{{alamat_lembaga}}</div></div>
  <h1 class="judul">SURAT TUGAS</h1>
  <div class="nomor">Nomor: {{nomor}}</div>
  <p>Yang bertanda tangan di bawah ini, Kepala {{nama_lembaga}}, dengan ini menugaskan kepada:</p>
  <table class="biodata">
    <tr><td>Nama</td><td>:</td><td><strong>{{nama}}</strong></td></tr>
    <tr><td>NIP</td><td>:</td><td>{{nip}}</td></tr>
    <tr><td>Jabatan</td><td>:</td><td>{{jabatan}}</td></tr>
  </table>
  <p>Untuk melaksanakan tugas: <strong>{{tugas}}</strong> yang dilaksanakan pada {{tanggal_mulai}} sampai {{tanggal_selesai}} bertempat di {{tempat}}.</p>
  <p>Demikian surat tugas ini dibuat untuk dilaksanakan dengan penuh tanggung jawab dan melaporkan hasilnya kepada Kepala {{nama_lembaga}}.</p>
  {{ttd}}
</div>`

const TEMPLATE_UNDANGAN = `<div class="surat">
  <div class="kop"><div class="kop-nama">{{nama_lembaga}}</div><div class="kop-alamat">{{alamat_lembaga}}</div></div>
  <h1 class="judul">SURAT UNDANGAN</h1>
  <div class="nomor">Nomor: {{nomor}}</div>
  <p>Kepada Yth.<br/><strong>{{tujuan}}</strong><br/>di Tempat</p>
  <p>Dengan hormat, sehubungan dengan pelaksanaan kegiatan {{nama_lembaga}}, kami mengharap kehadiran Bapak/Ibu/Saudara pada:</p>
  <table class="biodata">
    <tr><td>Hari</td><td>:</td><td>{{hari}}</td></tr>
    <tr><td>Tanggal</td><td>:</td><td>{{tanggal_kegiatan}}</td></tr>
    <tr><td>Waktu</td><td>:</td><td>{{waktu}}</td></tr>
    <tr><td>Tempat</td><td>:</td><td>{{tempat}}</td></tr>
    <tr><td>Acara</td><td>:</td><td>{{acara}}</td></tr>
  </table>
  <p>{{catatan}}</p>
  <p>Demikian undangan ini kami sampaikan. Atas perhatian dan kehadirannya kami ucapkan terima kasih.</p>
  {{ttd}}
</div>`

const TEMPLATE_SPPD = `<div class="surat">
  <div class="kop"><div class="kop-nama">{{nama_lembaga}}</div><div class="kop-alamat">{{alamat_lembaga}}</div></div>
  <h1 class="judul">SURAT PERJALANAN DINAS (SPPD)</h1>
  <div class="nomor">Nomor: {{nomor}}</div>
  <table class="biodata">
    <tr><td>Nama</td><td>:</td><td><strong>{{nama}}</strong></td></tr>
    <tr><td>NIP</td><td>:</td><td>{{nip}}</td></tr>
    <tr><td>Jabatan</td><td>:</td><td>{{jabatan}}</td></tr>
    <tr><td>Maksud Perjalanan</td><td>:</td><td>{{maksud}}</td></tr>
    <tr><td>Tempat Berangkat</td><td>:</td><td>{{tempat_berangkat}}</td></tr>
    <tr><td>Tempat Tujuan</td><td>:</td><td>{{tempat_tujuan}}</td></tr>
    <tr><td>Tanggal Berangkat</td><td>:</td><td>{{tanggal_mulai}}</td></tr>
    <tr><td>Tanggal Kembali</td><td>:</td><td>{{tanggal_selesai}}</td></tr>
    <tr><td>Alat Angkut</td><td>:</td><td>{{alat_angkut}}</td></tr>
    <tr><td>Pengikut</td><td>:</td><td>{{pengikut}}</td></tr>
  </table>
  <div class="box"><strong>Rincian Biaya:</strong><br/>{{biaya}}</div>
  <p>Demikian Surat Perjalanan Dinas ini dibuat untuk dipergunakan sebagaimana mestinya.</p>
  {{ttd}}
</div>`

const JENIS_BAWAAN = [
  {
    kode: 'SK-SISWA', nama: 'Surat Keterangan Siswa', kategori: 'keterangan', urutan: 1,
    fields: [
      { key: 'nama', label: 'Nama Siswa', type: 'text' },
      { key: 'nisn', label: 'NISN', type: 'text' },
      { key: 'ttl', label: 'Tempat/Tanggal Lahir', type: 'text' },
      { key: 'kelas', label: 'Kelas', type: 'text' },
      { key: 'alamat', label: 'Alamat', type: 'textarea' },
      { key: 'keperluan', label: 'Keperluan', type: 'text' },
    ],
    template: TEMPLATE_SK_SISWA,
  },
  {
    kode: 'SK-GURU', nama: 'Surat Keterangan Aktif Mengajar', kategori: 'keterangan', urutan: 2,
    fields: [
      { key: 'nama', label: 'Nama Guru', type: 'text' },
      { key: 'nip', label: 'NIP', type: 'text' },
      { key: 'jabatan', label: 'Jabatan', type: 'text' },
      { key: 'mapel', label: 'Mata Pelajaran', type: 'text' },
      { key: 'tahun_ajaran', label: 'Tahun Pelajaran', type: 'text' },
      { key: 'keperluan', label: 'Keperluan', type: 'text' },
    ],
    template: TEMPLATE_SK_GURU,
  },
  {
    kode: 'ST', nama: 'Surat Tugas', kategori: 'penugasan', urutan: 3,
    fields: [
      { key: 'nama', label: 'Nama', type: 'text' },
      { key: 'nip', label: 'NIP', type: 'text' },
      { key: 'jabatan', label: 'Jabatan', type: 'text' },
      { key: 'tugas', label: 'Uraian Tugas', type: 'textarea' },
      { key: 'tempat', label: 'Tempat Pelaksanaan', type: 'text' },
      { key: 'tanggal_mulai', label: 'Tanggal Mulai', type: 'date' },
      { key: 'tanggal_selesai', label: 'Tanggal Selesai', type: 'date' },
    ],
    template: TEMPLATE_TUGAS,
  },
  {
    kode: 'SU', nama: 'Surat Undangan', kategori: 'undangan', urutan: 4,
    fields: [
      { key: 'tujuan', label: 'Ditujukan Kepada', type: 'text' },
      { key: 'hari', label: 'Hari', type: 'text' },
      { key: 'tanggal_kegiatan', label: 'Tanggal Kegiatan', type: 'text' },
      { key: 'waktu', label: 'Waktu', type: 'text' },
      { key: 'tempat', label: 'Tempat', type: 'text' },
      { key: 'acara', label: 'Acara', type: 'text' },
      { key: 'catatan', label: 'Catatan Tambahan', type: 'textarea' },
    ],
    template: TEMPLATE_UNDANGAN,
  },
  {
    kode: 'SPPD', nama: 'Nota/SPPD Perjalanan Dinas', kategori: 'perjalanan', urutan: 5,
    fields: [
      { key: 'nama', label: 'Nama', type: 'text' },
      { key: 'nip', label: 'NIP', type: 'text' },
      { key: 'jabatan', label: 'Jabatan', type: 'text' },
      { key: 'maksud', label: 'Maksud Perjalanan Dinas', type: 'textarea' },
      { key: 'tempat_berangkat', label: 'Tempat Berangkat', type: 'text' },
      { key: 'tempat_tujuan', label: 'Tempat Tujuan', type: 'text' },
      { key: 'tanggal_mulai', label: 'Tanggal Berangkat', type: 'date' },
      { key: 'tanggal_selesai', label: 'Tanggal Kembali', type: 'date' },
      { key: 'alat_angkut', label: 'Alat Angkut', type: 'text' },
      { key: 'pengikut', label: 'Pengikut', type: 'text' },
      { key: 'biaya', label: 'Rincian Biaya', type: 'textarea' },
    ],
    template: TEMPLATE_SPPD,
  },
]

function setupAdministrasiTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS surat_jenis (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
    kode TEXT NOT NULL, nama TEXT NOT NULL, kategori TEXT DEFAULT 'lainnya',
    fields TEXT DEFAULT '[]', template TEXT DEFAULT '', aktif INTEGER DEFAULT 1,
    urutan INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(tenant_id, kode))`)
  db.exec(`CREATE TABLE IF NOT EXISTS surat_keluar (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
    jenis_id TEXT, kode TEXT, nomor TEXT,
    perihal TEXT, kepada TEXT, data TEXT DEFAULT '{}',
    tanggal TEXT, penandatangan TEXT,
    created_by TEXT, created_at TEXT DEFAULT (datetime('now')))`)
  db.exec(`CREATE TABLE IF NOT EXISTS surat_counter (
    tenant_id TEXT NOT NULL, kode TEXT NOT NULL, tahun INTEGER NOT NULL,
    urut INTEGER DEFAULT 0, PRIMARY KEY (tenant_id, kode, tahun))`)
  db.exec('CREATE INDEX IF NOT EXISTS idx_surat_keluar_tenant ON surat_keluar(tenant_id, created_at DESC)')
}

// Isi jenis bawaan untuk tenant yang belum punya (idempoten per kode).
function seedJenisBawaan(db, tenantId, makeId) {
  const ada = db.prepare('SELECT kode FROM surat_jenis WHERE tenant_id=?').all(tenantId).map(r => r.kode)
  const insert = db.prepare(`INSERT INTO surat_jenis (id, tenant_id, kode, nama, kategori, fields, template, aktif, urutan)
    VALUES (?,?,?,?,?,?,?,1,?)`)
  for (const j of JENIS_BAWAAN) {
    if (ada.includes(j.kode)) continue
    insert.run(makeId(), tenantId, j.kode, j.nama, j.kategori, JSON.stringify(j.fields), j.template, j.urutan)
  }
}

function barisJenis(jenis) {
  if (!jenis) return null
  let fields = []
  try { fields = JSON.parse(jenis.fields || '[]') } catch { fields = [] }
  return { ...jenis, fields }
}

function daftarJenis(db, tenantId) {
  return db.prepare('SELECT * FROM surat_jenis WHERE tenant_id=? ORDER BY urutan, nama').all(tenantId).map(barisJenis)
}

function nomorSuratBaru(db, tenantId, kode, tanggal) {
  const m = /^(\d{4})-(\d{2})/.exec(String(tanggal || ''))
  const now = new Date()
  const tahun = m ? parseInt(m[1], 10) : now.getUTCFullYear()
  const bulan = m ? parseInt(m[2], 10) : now.getUTCMonth() + 1
  db.prepare('INSERT INTO surat_counter (tenant_id, kode, tahun, urut) VALUES (?,?,?,0) ON CONFLICT(tenant_id, kode, tahun) DO NOTHING')
    .run(tenantId, kode, tahun)
  db.prepare('UPDATE surat_counter SET urut=urut+1 WHERE tenant_id=? AND kode=? AND tahun=?').run(tenantId, kode, tahun)
  const row = db.prepare('SELECT urut FROM surat_counter WHERE tenant_id=? AND kode=? AND tahun=?').get(tenantId, kode, tahun)
  return `${pad(row.urut)}/${kode}/${BULAN_ROMAWI[bulan - 1]}/${tahun}`
}

// Render template {{placeholder}} -> nilai. Data mentah user TIDAK dipercaya.
function renderTemplate(template, vars) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) =>
    escapeHtml(vars[key] === undefined || vars[key] === null ? '' : vars[key]))
}

function buildSuratHtml({ jenis, surat, settings = {}, jabatanTtd = 'Kepala' }) {
  const data = (() => { try { return JSON.parse(surat.data || '{}') } catch { return {} } })()
  const ctx = {
    nomor: surat.nomor || '',
    nama_lembaga: settings.nama_lembaga || 'Madrasah Digital',
    alamat_lembaga: settings.alamat || '',
    kota_cetak: settings.kota_cetak || settings.kota || '',
    kepala_sekolah: surat.penandatangan || settings.kepala_sekolah || '',
    nip_kepala: settings.nip_kepala || '',
    tanggal_surat: formatTanggalId(surat.tanggal || new Date().toISOString().slice(0, 10)),
    ...data,
  }
  const vars = { ...ctx, ttd: blokTtd(ctx, jabatanTtd) }
  const isi = renderTemplate(jenis.template, vars)
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"/><title>${escapeHtml(surat.nomor || 'Surat')}</title><style>${CSS_SURAT}</style></head><body>${isi}</body></html>`
}

module.exports = {
  setupAdministrasiTables,
  seedJenisBawaan,
  JENIS_BAWAAN,
  daftarJenis,
  barisJenis,
  nomorSuratBaru,
  renderTemplate,
  buildSuratHtml,
  formatTanggalId,
  escapeHtml,
}