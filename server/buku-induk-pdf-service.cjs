// Buku Induk Siswa — dokumen arsip per siswa.
//
// Bedanya dengan rapor:
//   rapor      = satu periode (semester/jenis), 3 halaman, untuk dibagikan ke wali
//   buku induk = SELURUH riwayat siswa, untuk arsip sekolah
//
// Isi per siswa:
//   1. Sampul + identitas lengkap (biodata + orang tua/wali + domisili)
//   2. Rekap nilai SEMUA periode yang tersedia (STS/SAS, tiap semester)
//   3. Rekap kehadiran per semester
//   4. Catatan: prestasi, pelanggaran/BK, ekstrakurikuler, catatan wali
//
// Sumber nilai memakai `computeRaporLive` (jalur yang sama dengan cetak rapor),
// BUKAN tabel `rapor` ter-materialisasi — tabel itu tidak pernah diisi karena
// cetak/pratinjau menghitung langsung.

const PDFDocument = require('pdfkit')
const path = require('path')
const fs = require('fs')
const { formatTanggalLahir } = require('./format-tanggal.cjs')
const { getTenantSettings } = require('./tenant-settings.cjs')
const { terbilang, nilaiKeAbjad, semesterRange } = require('./rapor-format-service.cjs')
const { computeRaporLive } = require('./rapor-grade-service.cjs')

const W = 595.28
const H = 841.89
const M = 34

function safeText(value, fallback = '-') {
  const s = String(value ?? '').trim()
  return s || fallback
}

function resolveUploadPath(uploadDir, url) {
  if (!url) return null
  const relative = decodeURIComponent(String(url).split('?')[0]).replace(/^\/+/, '')
  if (!relative.startsWith('uploads/')) return null
  const resolved = path.join(uploadDir, relative.replace(/^uploads\//, ''))
  return fs.existsSync(resolved) ? resolved : null
}

// PDFKit hanya membaca JPEG/PNG; logo Kemenag sering WebP.
// Ukuran dibatasi: foto siswa 900x1200 dan logo 1607x1569 dipakai berulang di
// setiap halaman/siswa, sehingga arsip satu kelas membengkak jadi puluhan MB
// (terukur 81 MB untuk 34 siswa). Di-resize ke ukuran cetak (~300 dpi) dan
// dikompres — kualitas cetak tetap, ukuran file turun drastis.
//
// PENTING: hasil resize ditulis ke BERKAS, bukan Buffer. PDFKit hanya
// melakukan deduplikasi objek gambar bila diberi path; Buffer yang sama
// ditanam ulang di setiap halaman. Terukur: 136 halaman dengan Buffer =
// 544 objek gambar / 13,6 MB; dengan path = 2 objek / ratusan KB.
const _cacheGambar = new Map()
const _dirCache = path.join(require('os').tmpdir(), 'jurnalku-pdf-img')
async function siapkanGambar(filePath, maxW = 420) {
  if (!filePath) return null
  const kunci = `${filePath}|${maxW}`
  if (_cacheGambar.has(kunci)) return _cacheGambar.get(kunci)
  let hasil = null
  try {
    const sharp = require('sharp')
    const ext = path.extname(filePath).toLowerCase()
    const meta = await sharp(filePath).metadata()
    if (['.jpg', '.jpeg', '.png'].includes(ext) && (meta.width || 0) <= maxW) {
      hasil = filePath
    } else {
      await fs.promises.mkdir(_dirCache, { recursive: true })
      const tujuan = path.join(_dirCache, `${require('crypto').createHash('sha1').update(kunci).digest('hex')}.png`)
      if (!fs.existsSync(tujuan)) {
        await sharp(filePath)
          .resize({ width: maxW, withoutEnlargement: true })
          .png({ compressionLevel: 9, palette: true })
          .toFile(tujuan)
      }
      hasil = tujuan
    }
  } catch {
    hasil = null
  }
  _cacheGambar.set(kunci, hasil)
  return hasil
}

function namaJenjang(j) {
  const k = String(j || '').toUpperCase()
  if (k === 'MI') return 'Madrasah Ibtidaiyah (MI)'
  if (k === 'MA') return 'Madrasah Aliyah (MA)'
  if (k === 'MTS') return 'Madrasah Tsanawiyah (MTs)'
  return safeText(j, 'Madrasah')
}

// Daftar periode yang BENAR-BENAR punya nilai untuk siswa ini.
//
// `penilaian_harian` TIDAK menyimpan tahun_ajaran/semester — hanya `tanggal`.
// Periode diturunkan dari tanggal: Jul–Des = ganjil tahun pertama, Jan–Jun =
// genap tahun kedua. Tabel `rapor` (baris asesmen STS/SAS) punya kolomnya
// langsung, jadi kedua sumber digabung setelah dinormalisasi.
function periodeTersedia(db, { tenantId, siswaId, rombelId }) {
  const hasil = new Map()

  const dariRapor = db.prepare(
    "SELECT DISTINCT tahun_ajaran, semester FROM rapor WHERE tenant_id=? AND siswa_id=? AND tahun_ajaran IS NOT NULL AND semester IS NOT NULL"
  ).all(tenantId, siswaId)
  for (const r of dariRapor) hasil.set(`${r.tahun_ajaran}|${r.semester}`, { tahun_ajaran: r.tahun_ajaran, semester: r.semester })

  // Turunkan periode dari tanggal penilaian harian.
  const harian = db.prepare(
    "SELECT DISTINCT tanggal FROM penilaian_harian WHERE tenant_id=? AND siswa_id=? AND tanggal IS NOT NULL"
  ).all(tenantId, siswaId)
  for (const h of harian) {
    const m = /^(\d{4})-(\d{2})/.exec(String(h.tanggal))
    if (!m) continue
    const tahun = Number(m[1]); const bulan = Number(m[2])
    // Tahun ajaran dimulai Juli: bulan >= 7 masuk TA tahun ini/tahun+1 (ganjil),
    // bulan <= 6 masuk TA tahun-1/tahun (genap).
    const ta = bulan >= 7 ? `${tahun}/${tahun + 1}` : `${tahun - 1}/${tahun}`
    const semester = bulan >= 7 ? 'ganjil' : 'genap'
    hasil.set(`${ta}|${semester}`, { tahun_ajaran: ta, semester })
  }

  if (hasil.size) return [...hasil.values()].sort((a, b) => a.tahun_ajaran.localeCompare(b.tahun_ajaran) || a.semester.localeCompare(b.semester))

  // Belum ada nilai sama sekali: pakai tahun ajaran rombel supaya dokumen tetap
  // bisa dicetak (halaman nilai akan menyatakan belum ada nilai).
  const r = db.prepare('SELECT tahun_ajaran FROM rombel WHERE id=? AND tenant_id=?').get(rombelId, tenantId)
  return r?.tahun_ajaran ? [{ tahun_ajaran: r.tahun_ajaran, semester: 'ganjil' }] : []
}

// Kehadiran satu semester dari absensi_siswa (tidak ada kolom semester —
// dihitung dari rentang tanggal).
function kehadiranSemester(db, { tenantId, siswaId, tahunAjaran, semester }) {
  const r = semesterRange(semester, tahunAjaran)
  if (!r) return { sakit: 0, izin: 0, alpa: 0, total: 0 }
  const rows = db.prepare(`SELECT lower(status) status, COUNT(DISTINCT tanggal) n
    FROM absensi_siswa WHERE siswa_id=? AND tenant_id=? AND tanggal>=? AND tanggal<=?
    GROUP BY lower(status)`).all(siswaId, tenantId, r.from, r.to)
  const out = { sakit: 0, izin: 0, alpa: 0 }
  for (const row of rows) {
    const key = ['alpha', 'tanpa_keterangan'].includes(row.status) ? 'alpa' : row.status
    if (Object.hasOwn(out, key)) out[key] += Number(row.n) || 0
  }
  return { ...out, total: out.sakit + out.izin + out.alpa }
}

async function loadBukuInduk(db, { tenantId, siswaId, uploadDir, fotoMaxW = 420 }) {
  const siswa = db.prepare(`
    SELECT s.*, r.nama AS rombel_nama, r.tingkat, r.tahun_ajaran AS rombel_tahun, r.wali_kelas_id,
           g.nama AS wali_kelas_nama
    FROM siswa s
    LEFT JOIN rombel r ON s.rombel_id = r.id AND r.tenant_id = s.tenant_id
    LEFT JOIN gtk g ON r.wali_kelas_id = g.id AND g.tenant_id = s.tenant_id
    WHERE s.id = ? AND s.tenant_id = ?
  `).get(siswaId, tenantId)
  if (!siswa) return null

  const settings = getTenantSettings(db, tenantId) || {}

  const periode = periodeTersedia(db, { tenantId, siswaId, rombelId: siswa.rombel_id })
  const riwayat = []
  for (const p of periode) {
    const jenisList = ['rapor_sts', 'rapor_sas']
    const perJenis = {}
    for (const jenis of jenisList) {
      try {
        const live = computeRaporLive(db, {
          tenantId, siswaId, rombelId: siswa.rombel_id,
          tahunAjaran: p.tahun_ajaran, semester: p.semester, jenis,
        })
        if (live.rows.length) perJenis[jenis] = { rows: live.rows, jumlah: live.jumlah, rata: live.rata }
      } catch { /* periode tanpa nilai dilewati */ }
    }
    if (Object.keys(perJenis).length) {
      riwayat.push({ ...p, jenis: perJenis, kehadiran: kehadiranSemester(db, { tenantId, siswaId, tahunAjaran: p.tahun_ajaran, semester: p.semester }) })
    }
  }

  // Catatan pendukung arsip
  const kepribadian = db.prepare(`SELECT * FROM catatan_kepribadian
    WHERE siswa_id=? AND tenant_id=? ORDER BY tahun_ajaran DESC, semester DESC LIMIT 4`).all(siswaId, tenantId)

  const pelanggaran = (() => {
    try {
      // Kolom nyata bk_pelanggaran: jenis, tingkat, poin, keterangan, tindakan.
      // TIDAK ada `tindak_lanjut` (namanya `tindakan`) dan tidak ada bk_prestasi.
      return db.prepare(`SELECT tanggal, jenis, tingkat, poin, keterangan, tindakan FROM bk_pelanggaran
        WHERE siswa_id=? AND tenant_id=? ORDER BY tanggal DESC LIMIT 20`).all(siswaId, tenantId)
    } catch { return [] }
  })()

  const prestasi = (() => {
    try {
      return db.prepare(`SELECT tanggal, nama, tingkat, peringkat, keterangan FROM bk_prestasi
        WHERE siswa_id=? AND tenant_id=? ORDER BY tanggal DESC LIMIT 20`).all(siswaId, tenantId)
    } catch { return [] }
  })()

  const ekskul = db.prepare(`
    SELECT e.nama, e.jenis_kegiatan FROM ekskul_anggota ea
    JOIN ekskul e ON e.id = ea.ekskul_id AND e.tenant_id = ea.tenant_id
    WHERE ea.siswa_id=? AND ea.tenant_id=? ORDER BY e.nama
  `).all(siswaId, tenantId)

  const mutasi = (() => {
    try {
      return db.prepare(`SELECT jenis, tanggal, keterangan FROM mutasi_siswa
        WHERE siswa_id=? AND tenant_id=? ORDER BY tanggal DESC LIMIT 10`).all(siswaId, tenantId)
    } catch { return [] }
  })()

  const fotoPath = await siapkanGambar(resolveUploadPath(uploadDir, siswa.foto), fotoMaxW)
  const kemenagUpload = resolveUploadPath(uploadDir, settings.logo_kemenag)
  const kemenagPath = kemenagUpload || path.join(__dirname, 'assets', 'kemenag-logo.svg')
  const logo = {
    kemenagPath: await siapkanGambar(fs.existsSync(kemenagPath) ? kemenagPath : null),
    lembagaLogoPath: await siapkanGambar(resolveUploadPath(uploadDir, settings.logo)),
  }

  return { siswa, settings, riwayat, kepribadian, pelanggaran, prestasi, ekskul, mutasi, fotoPath, logo }
}

function drawKop(doc, settings, logo, y) {
  const width = doc.page.width
  const margin = doc.page.margins.left
  if (logo.kemenagPath) { try { doc.image(logo.kemenagPath, margin, y, { fit: [46, 46] }) } catch {} }
  if (logo.lembagaLogoPath) { try { doc.image(logo.lembagaLogoPath, width - margin - 46, y, { fit: [46, 46] }) } catch {} }
  const tx = margin + 54
  const tw = width - 2 * (margin + 54)
  doc.font('Helvetica-Bold').fontSize(10).fillColor('black')
  doc.text('KEMENTERIAN AGAMA REPUBLIK INDONESIA', tx, y, { width: tw, align: 'center', lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(12)
  doc.text(safeText(settings.nama_lembaga, '').toUpperCase(), tx, y + 13, { width: tw, align: 'center', lineBreak: false })
  const idn = [settings.nsm ? `NSM : ${settings.nsm}` : '', settings.npsn ? `NPSN : ${settings.npsn}` : ''].filter(Boolean).join('   |   ')
  doc.font('Helvetica').fontSize(8)
  if (idn) doc.text(idn, tx, y + 28, { width: tw, align: 'center', lineBreak: false })
  if (settings.alamat) doc.text(safeText(settings.alamat), tx, y + 39, { width: tw, align: 'center', lineBreak: false })
  const ruleY = y + 54
  doc.moveTo(margin, ruleY).lineTo(width - margin, ruleY).lineWidth(1.6).strokeColor('black').stroke()
  return ruleY + 8
}

// Baris label:nilai dua kolom, dengan pemecah halaman otomatis.
function baris(doc, y, label, value, { labelW = 165, size = 9, bold = false } = {}) {
  if (y > H - 80) {
    doc.addPage({ size: 'A4', margin: M })
    y = 60
  }
  doc.font('Helvetica').fontSize(size)
  doc.text(label, M + 6, y, { width: labelW, lineBreak: false })
  doc.text(':', M + 6 + labelW, y, { width: 8, lineBreak: false })
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size)
  doc.text(safeText(value), M + 20 + labelW, y, { width: W - 2 * M - 26 - labelW, lineBreak: false })
  return y + size + 7
}

function judulBagian(doc, y, teks) {
  if (y > H - 90) { doc.addPage({ size: 'A4', margin: M }); y = 60 }
  doc.font('Helvetica-Bold').fontSize(10)
  doc.rect(M, y, W - 2 * M, 18).fillAndStroke('#e5e7eb', 'black')
  doc.fillColor('black').text(teks, M, y + 4, { width: W - 2 * M, align: 'center', lineBreak: false })
  return y + 24
}

function tabelNilai(doc, y, labelJenis, data) {
  const kolom = [
    { key: 'no', judul: 'No', x: M, w: 22, align: 'center' },
    { key: 'mapel', judul: 'Mata Pelajaran', x: M + 22, w: 200, align: 'left' },
    { key: 'kkm', judul: 'KKM', x: M + 222, w: 32, align: 'center' },
    { key: 'nilai', judul: 'Nilai', x: M + 254, w: 38, align: 'center' },
    { key: 'predikat', judul: 'Predikat', x: M + 292, w: 55, align: 'center' },
    { key: 'huruf', judul: 'Terbilang', x: M + 347, w: W - M - (M + 347), align: 'left' },
  ]
  if (y > H - 140) { doc.addPage({ size: 'A4', margin: M }); y = 60 }
  doc.font('Helvetica-Bold').fontSize(8)
  doc.rect(M, y, W - 2 * M, 16).fillAndStroke('#f3f4f6', 'black')
  doc.fillColor('black')
  for (const c of kolom) doc.text(c.judul, c.x, y + 4, { width: c.w, align: c.align, lineBreak: false })
  y += 16

  const rowH = 15
  data.rows.forEach((r, i) => {
    if (y + rowH > H - 70) {
      doc.addPage({ size: 'A4', margin: M })
      y = 60
      doc.font('Helvetica-Bold').fontSize(8)
      doc.rect(M, y, W - 2 * M, 16).fillAndStroke('#f3f4f6', 'black')
      doc.fillColor('black')
      for (const c of kolom) doc.text(c.judul, c.x, y + 4, { width: c.w, align: c.align, lineBreak: false })
      y += 16
    }
    const nilai = Number(r.nilai_akhir) || 0
    doc.font('Helvetica').fontSize(8)
    doc.rect(M, y, W - 2 * M, rowH).stroke()
    for (const c of kolom.slice(1)) doc.moveTo(c.x, y).lineTo(c.x, y + rowH).stroke()
    doc.text(String(i + 1), kolom[0].x, y + 3, { width: kolom[0].w, align: 'center', lineBreak: false })
    doc.text(safeText(r.mapel_nama), kolom[1].x + 3, y + 3, { width: kolom[1].w - 6, lineBreak: false })
    doc.text(String(r.kkm || '-'), kolom[2].x, y + 3, { width: kolom[2].w, align: 'center', lineBreak: false })
    doc.text(String(nilai), kolom[3].x, y + 3, { width: kolom[3].w, align: 'center', lineBreak: false })
    doc.text(nilaiKeAbjad(nilai), kolom[4].x, y + 3, { width: kolom[4].w, align: 'center', lineBreak: false })
    doc.text(terbilang(nilai), kolom[5].x + 3, y + 3, { width: kolom[5].w - 6, lineBreak: false })
    y += rowH
  })

  doc.font('Helvetica-Bold').fontSize(8)
  doc.rect(M, y, W - 2 * M, rowH).stroke()
  doc.text(`Jumlah: ${data.jumlah}   |   Rata-rata: ${Number(data.rata || 0).toFixed(2)}`, M + 3, y + 3, { width: W - 2 * M - 6, lineBreak: false })
  return y + rowH + 6
}

// Render satu siswa. `bagian`: 'lengkap' (default) | 'identitas' | 'nilai'.
function renderBukuInduk(doc, data, bagian = 'lengkap') {
  const { siswa, settings, riwayat, kepribadian, pelanggaran, prestasi, ekskul, mutasi, fotoPath, logo } = data
  const cetakIdentitas = bagian === 'lengkap' || bagian === 'identitas'
  const cetakNilai = bagian === 'lengkap' || bagian === 'nilai'

  // ---------- SAMPUL ----------
  //
  // Tata letak mengikuti dokumen resmi "IDENTITAS RAPOR.docx" (proporsi sama
  // dengan sampul rapor): logo instansi di atas, logo lembaga, judul besar,
  // nama lembaga, NSM/NPSN, kotak identitas, lalu kaki halaman. Sebelumnya
  // buku induk memakai susunan sendiri dengan pas foto di tengah — bentuknya
  // berbeda dari rapor, padahal keduanya dokumen resmi madrasah yang sama.
  doc.addPage({ size: 'A4', margin: M })
  doc.rect(18, 18, W - 36, H - 36).lineWidth(4).strokeColor('black').stroke()
  doc.rect(26, 26, W - 52, H - 52).lineWidth(1).stroke()

  // Proporsi sama dengan sampul rapor (diukur dari dokumen acuan):
  //   logo Kemenag  7.3% .. 20.3%
  //   judul         24.6%
  //   jenjang       31.6%
  //   nama lembaga  35.7% (2 baris)
  //   NSM / NPSN    47.7%
  //   logo lembaga  53.3% .. 67.4%   <-- di bawah NSM/NPSN, bukan di atas judul
  //   kotak data    70.0%
  //
  // Sebelumnya logo lembaga ditaruh di 21.4% sehingga menimpa judul
  // "BUKU INDUK" dan baris jenjang. Sudah dikoreksi ke posisi acuan.
  if (logo.kemenagPath) { try { doc.image(logo.kemenagPath, W / 2 - 67, H * 0.073, { fit: [135, 121] }) } catch {} }
  if (logo.lembagaLogoPath) { try { doc.image(logo.lembagaLogoPath, W / 2 - 67, H * 0.533, { fit: [135, 132] }) } catch {} }

  doc.font('Helvetica-Bold').fontSize(34).fillColor('black')
  doc.text('BUKU INDUK', M, H * 0.246, { width: W - 2 * M, align: 'center', characterSpacing: 2 })
  doc.font('Helvetica-Bold').fontSize(17)
  doc.text(namaJenjang(settings.jenjang).toUpperCase(), M, H * 0.316, { width: W - 2 * M, align: 'center' })

  doc.font('Helvetica-Bold').fontSize(22)
  doc.text(safeText(settings.nama_lembaga, '').toUpperCase(), M, H * 0.357, {
    width: W - 2 * M, align: 'center', lineGap: 2,
  })

  const idn = [settings.nsm ? `NSM: ${settings.nsm}` : '', settings.npsn ? `NPSN: ${settings.npsn}` : ''].filter(Boolean).join('    ')
  if (idn) {
    doc.font('Helvetica').fontSize(12)
    doc.text(idn, M, H * 0.477, { width: W - 2 * M, align: 'center' })
  }

  // Kotak identitas: nama, NIS/NISN, kelas.
  //
  // Ukuran dikoreksi: sebelumnya boxH=150 membuat kotak berakhir di 87.8%
  // halaman, sedangkan kaki (KEMENTERIAN AGAMA ...) mulai di 85.7% — teks
  // menembus garis bawah kotak.
  // Kotak juga digeser turun: logo lembaga berakhir di 580.7pt, kotak lama
  // mulai 579.2pt sehingga garis kotak menempel pada logo (−1.5pt).
  const boxY = H * 0.702
  const boxW = 340
  const boxH = 120
  doc.rect(W / 2 - boxW / 2, boxY, boxW, boxH).lineWidth(1.5).strokeColor('black').stroke()

  // Jarak dalam kotak diseimbangkan. Sebelumnya baris NIS/NISN dan KELAS
  // berdesakan (label KELAS hanya 1pt di bawah nilai NIS) karena boxH=110
  // dipakai untuk tiga pasang label+nilai.
  doc.font('Helvetica').fontSize(11).fillColor('black')
  doc.text('NAMA PESERTA DIDIK', W / 2 - boxW / 2 + 18, boxY + 10, { width: boxW - 36, align: 'center', lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(15)
  doc.text(safeText(siswa.nama, '').toUpperCase(), W / 2 - boxW / 2 + 12, boxY + 24, { width: boxW - 24, align: 'center' })

  doc.font('Helvetica').fontSize(11)
  doc.text('NIS / NISN', W / 2 - boxW / 2 + 18, boxY + 50, { width: boxW - 36, align: 'center', lineBreak: false })
  const nisnSampul = String(siswa.nisn || '').split('#')[1] || safeText(siswa.nisn, '')
  doc.font('Helvetica-Bold').fontSize(13)
  doc.text(`${safeText(siswa.nis, '')} / ${nisnSampul}`, W / 2 - boxW / 2 + 12, boxY + 66, { width: boxW - 24, align: 'center', lineBreak: false })

  doc.font('Helvetica').fontSize(11)
  doc.text('KELAS', W / 2 - boxW / 2 + 18, boxY + 88, { width: boxW - 36, align: 'center', lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(13)
  doc.text(safeText(siswa.rombel_nama, '-'), W / 2 - boxW / 2 + 12, boxY + 102, { width: boxW - 24, align: 'center', lineBreak: false })

  // Kaki halaman.
  doc.font('Helvetica-Bold').fontSize(11)
  const instansiSampul = safeText(settings.nama_instansi, 'KEMENTERIAN AGAMA REPUBLIK INDONESIA')
  doc.text(instansiSampul.toUpperCase(), M, H - 120, { width: W - 2 * M, align: 'center' })
  if (settings.yayasan_nama) {
    doc.font('Helvetica').fontSize(10)
    doc.text(String(settings.yayasan_nama).toUpperCase(), M, H - 104, { width: W - 2 * M, align: 'center' })
  }
  const kaki = [settings.alamat, [settings.telepon ? `Telp. ${settings.telepon}` : '', settings.email || ''].filter(Boolean).join(' | ')].filter(Boolean).join('\n')
  if (kaki) {
    doc.font('Helvetica').fontSize(8)
    doc.text(kaki, M, H - 86, { width: W - 2 * M, align: 'center', lineGap: 1 })
  }

  // ---------- IDENTITAS LENGKAP ----------
  if (cetakIdentitas) {
    doc.addPage({ size: 'A4', margin: M })
    let y = drawKop(doc, settings, logo, 30)
    doc.font('Helvetica-Bold').fontSize(12)
    doc.text('A.  IDENTITAS PESERTA DIDIK', M, y + 4, { width: W - 2 * M, align: 'center', underline: true })
    y += 26

    const identitas = [
      ['Nama Lengkap', String(siswa.nama || '').toUpperCase()],
      ['Nama Panggilan', siswa.nama_panggilan],
      ['NIS', siswa.nis],
      ['NISN', String(siswa.nisn || '').split('#')[1] || siswa.nisn],
      ['NIK', siswa.nik],
      ['Jenis Kelamin', siswa.jenis_kelamin === 'L' ? 'Laki-laki' : siswa.jenis_kelamin === 'P' ? 'Perempuan' : siswa.jenis_kelamin],
      ['Tempat Lahir', siswa.tempat_lahir],
      ['Tanggal Lahir', formatTanggalLahir(siswa.tanggal_lahir)],
      ['Agama', siswa.agama],
      ['Status dalam Keluarga', siswa.status_keluarga],
      ['Anak Ke', siswa.anak_ke],
      ['Alamat Peserta Didik', siswa.alamat],
      ['Nomor Telepon', siswa.no_hp],
      ['Sekolah Asal', siswa.asal_sekolah],
      ['Diterima di Kelas', siswa.rombel_nama],
      ['Tahun Ajaran', siswa.rombel_tahun],
      ['Status Siswa', siswa.status],
      ['RFID', siswa.rfid_uid],
    ]
    for (const [l, v] of identitas) y = baris(doc, y, l, v)

    y += 6
    doc.font('Helvetica-Bold').fontSize(11)
    doc.text('B.  DATA ORANG TUA / WALI', M, y, { width: W - 2 * M, lineBreak: false })
    y += 18
    const ortu = [
      ['Nama Ayah', siswa.nama_ayah],
      ['Pekerjaan Ayah', siswa.kerja_ayah],
      ['Nama Ibu', siswa.nama_ibu],
      ['Pekerjaan Ibu', siswa.kerja_ibu],
      ['Nama Wali', siswa.nama_wali],
      ['Pekerjaan Wali', siswa.kerja_wali],
      ['Nama Orang Tua/Wali (teks bebas)', siswa.nama_ortu],
    ]
    for (const [l, v] of ortu) y = baris(doc, y, l, v)

    // Peringatan jujur bila biodata memang kosong di DB — jangan diamkan.
    const kosong = ['nama_ayah', 'nama_ibu', 'kerja_ayah', 'kerja_ibu', 'asal_sekolah', 'anak_ke']
      .filter(k => !String(siswa[k] ?? '').trim())
    if (kosong.length) {
      y += 4
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#b45309')
      doc.text(`Catatan: ${kosong.length} field biodata belum diisi di sistem (${kosong.join(', ')}). Lengkapi lewat Data Siswa agar buku induk utuh.`, M + 6, y, { width: W - 2 * M - 12 })
      doc.fillColor('black')
      y += 18
    }

    // Tanda tangan
    const sigY = Math.max(y + 20, 700)
    if (sigY < H - 90) {
      doc.font('Helvetica').fontSize(9)
      doc.text(`${safeText(settings.kota_cetak || settings.kota, '')}${(settings.kota_cetak || settings.kota) ? ', ' : ''}${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, W - M - 190, sigY, { width: 180, align: 'center', lineBreak: false })
      doc.text('Kepala Madrasah', W - M - 190, sigY + 16, { width: 180, align: 'center', lineBreak: false })
      doc.font('Helvetica-Bold')
      doc.text(safeText(settings.kepala_sekolah, '................................').toUpperCase(), W - M - 190, sigY + 62, { width: 180, align: 'center', underline: true, lineBreak: false })
    }
  }

  // ---------- RIWAYAT NILAI ----------
  if (cetakNilai) {
    if (!riwayat.length) {
      doc.addPage({ size: 'A4', margin: M })
      let y = drawKop(doc, settings, logo, 30)
      doc.font('Helvetica-Bold').fontSize(11)
      doc.text('C.  RIWAYAT NILAI', M, y + 6, { width: W - 2 * M, align: 'center', lineBreak: false })
      doc.font('Helvetica').fontSize(9)
      doc.text('Belum ada nilai tercatat untuk siswa ini pada periode mana pun.', M, y + 34, { width: W - 2 * M, align: 'center' })
    } else {
      doc.addPage({ size: 'A4', margin: M })
      let y = drawKop(doc, settings, logo, 30)
      doc.font('Helvetica-Bold').fontSize(12)
      doc.text('C.  RIWAYAT NILAI', M, y + 4, { width: W - 2 * M, align: 'center', underline: true })
      y += 26

      for (const p of riwayat) {
        const judul = `${p.semester === 'ganjil' ? 'Semester Ganjil' : 'Semester Genap'} — ${p.tahun_ajaran}`
        y = judulBagian(doc, y, judul)
        for (const jenis of ['rapor_sts', 'rapor_sas']) {
          const d = p.jenis[jenis]
          if (!d) continue
          if (y > H - 160) { doc.addPage({ size: 'A4', margin: M }); y = 60 }
          doc.font('Helvetica-Bold').fontSize(9)
          doc.text(jenis === 'rapor_sts' ? 'Sumatif Tengah Semester (STS)' : 'Sumatif Akhir Semester (SAS)', M + 4, y, { width: W - 2 * M - 8, lineBreak: false })
          y += 14
          y = tabelNilai(doc, y, jenis, d)
        }
        // Kehadiran periode ini
        const k = p.kehadiran || {}
        doc.font('Helvetica').fontSize(8.5)
        doc.text(`Kehadiran: Sakit ${k.sakit || 0} hari · Izin ${k.izin || 0} hari · Tanpa Keterangan ${k.alpa || 0} hari`, M + 4, y, { width: W - 2 * M - 8, lineBreak: false })
        y += 20
      }
    }
  }

  // ---------- CATATAN PENDUKUNG (hanya mode lengkap) ----------
  if (bagian === 'lengkap') {
    doc.addPage({ size: 'A4', margin: M })
    let y = drawKop(doc, settings, logo, 30)
    doc.font('Helvetica-Bold').fontSize(12)
    doc.text('D.  CATATAN PENDUKUNG', M, y + 4, { width: W - 2 * M, align: 'center', underline: true })
    y += 26

    y = judulBagian(doc, y, 'Ekstrakurikuler')
    if (!ekskul.length) { y = baris(doc, y, 'Ekstrakurikuler', 'Belum terdaftar') }
    else for (const e of ekskul) y = baris(doc, y, safeText(e.nama), safeText(e.jenis_kegiatan, 'Anggota'))

    y = judulBagian(doc, y, 'Catatan Wali Kelas / Kepribadian')
    if (!kepribadian.length) y = baris(doc, y, 'Catatan', 'Belum ada')
    else for (const k of kepribadian) {
      y = baris(doc, y, `${k.semester === 'ganjil' ? 'Ganjil' : 'Genap'} ${k.tahun_ajaran}`, safeText(k.catatan_wali_kelas || k.saran, '-'))
    }

    y = judulBagian(doc, y, 'Prestasi')
    if (!prestasi.length) y = baris(doc, y, 'Prestasi', 'Belum ada catatan')
    else for (const p of prestasi) y = baris(doc, y, `${p.tanggal || '-'} — ${safeText(p.nama)}`, `${safeText(p.tingkat, '-')}${p.peringkat ? ' · ' + p.peringkat : ''}`)

    y = judulBagian(doc, y, 'Pelanggaran / Tindak Lanjut BK')
    if (!pelanggaran.length) y = baris(doc, y, 'Pelanggaran', 'Tidak ada catatan')
    else for (const p of pelanggaran) {
      y = baris(doc, y, `${p.tanggal || '-'} — ${safeText(p.jenis)}`, `${p.poin || 0} poin (${safeText(p.tingkat, '-')}) · ${safeText(p.tindakan || p.keterangan, '-')}`)
    }

    if (mutasi.length) {
      y = judulBagian(doc, y, 'Mutasi')
      for (const m of mutasi) y = baris(doc, y, `${m.tanggal || '-'} — ${safeText(m.jenis)}`, safeText(m.keterangan, '-'))
    }
  }
}

async function createBukuIndukPdf(db, options) {
  const { tenantId, siswaId, uploadDir, bagian = 'lengkap' } = options
  const data = await loadBukuInduk(db, { tenantId, siswaId, uploadDir })
  if (!data) return null
  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, autoFirstPage: false })
  renderBukuInduk(doc, data, bagian)
  return doc
}

// Massal: satu PDF untuk satu rombel (atau seluruh siswa tenant).
//
// Foto diperkecil ke 260px (bukan 420px) karena di arsip massal foto muncul
// puluhan kali. Pada ukuran cetak 90x120 pt, 260px sudah ~2x kerapatan yang
// dibutuhkan mata — 420px hanya menambah byte tanpa beda yang terlihat.
const FOTO_MASSAL_MAXW = 260
async function createBukuIndukPdfBulk(db, options) {
  const { tenantId, rombelId, uploadDir, bagian = 'lengkap', fotoMaxW = FOTO_MASSAL_MAXW } = options
  const siswaList = rombelId
    ? db.prepare("SELECT id, nama FROM siswa WHERE tenant_id=? AND rombel_id=? AND COALESCE(status,'aktif')='aktif' ORDER BY nama").all(tenantId, rombelId)
    : db.prepare("SELECT id, nama FROM siswa WHERE tenant_id=? AND COALESCE(status,'aktif')='aktif' ORDER BY nama").all(tenantId)

  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, autoFirstPage: false })
  let dicetak = 0
  const dilewati = []
  for (const s of siswaList) {
    try {
      const data = await loadBukuInduk(db, { tenantId, siswaId: s.id, uploadDir, fotoMaxW })
      if (!data) { dilewati.push(s.nama); continue }
      renderBukuInduk(doc, data, bagian)
      dicetak++
    } catch (e) {
      // Satu siswa bermasalah tidak boleh menggagalkan seluruh arsip kelas.
      dilewati.push(s.nama)
    }
  }
  doc.meta = { dicetak, dilewati: dilewati.length, total: siswaList.length, namaDilewati: dilewati.slice(0, 10) }
  return doc
}

module.exports = { createBukuIndukPdf, createBukuIndukPdfBulk, loadBukuInduk }
