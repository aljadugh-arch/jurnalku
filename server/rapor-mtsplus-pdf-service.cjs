// Rapor siswa siap-cetak — LAYOUT ALTERNATIF "MTs Plus" (mirip rapor.mtsplussd7.cc.cd).
// Dipakai saat admin memilih format "mtsplus" di menu cetak. Struktur:
//   halaman 1: cover "RAPOR PESERTA DIDIK" + jenis rapor (STS/SAS)
//   halaman 2: kop + IDENTITAS PESERTA DIDIK (biodata bernomor) + pas foto + TTD
//   halaman 3: kop + CAPAIAN HASIL BELAJAR (6 kolom: No|Mapel|KKM|Nilai|Huruf|Capaian)
//              + Penilaian Sikap + Ekstrakurikuler + Ketidakhadiran + Catatan + TTD
// Layout default (createRaporSiswaPdf) tetap tersedia; keduanya berbagi sumber
// data yang sama (query identik) supaya isinya konsisten.

const PDFDocument = require('pdfkit')
const QRCode = require('qrcode')
const { getTenantSettings } = require('./tenant-settings.cjs')
const { terbilang, nilaiKeAbjad, semesterRange } = require('./rapor-k13-service.cjs')
const { buildCapaianKompetensi } = require('./rapor-siswa-pdf-service.cjs')
const path = require('path')
const fs = require('fs')

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

function romawi(n) {
  const table = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII' }
  const num = parseInt(n, 10)
  return table[num] || String(n || '')
}

function jenisLabel(jenis) {
  return jenis === 'rapor_sas' ? 'SUMATIF AKHIR SEMESTER (SAS)' : 'SUMATIF TENGAH SEMESTER (STS)'
}

// Peringkat siswa dalam satu rombel berdasarkan rata-rata nilai akhir pada
// periode (tahun_ajaran, semester, jenis) yang sama.
function hitungRank(db, tenantId, rombelId, tahunAjaran, semester, jenis, siswaId) {
  const rows = db.prepare(`
    SELECT r.siswa_id, AVG(COALESCE(r.nilai_akhir, 0)) AS rata
    FROM rapor r JOIN siswa s ON s.id = r.siswa_id AND s.tenant_id = r.tenant_id
    WHERE r.tenant_id=? AND s.rombel_id=? AND r.tahun_ajaran=? AND r.semester=? AND r.jenis=?
      AND COALESCE(s.status,'aktif')='aktif'
    GROUP BY r.siswa_id
  `).all(tenantId, rombelId, tahunAjaran, semester, jenis)
  if (!rows.length) return { rank: 0, totalSiswa: 0 }
  rows.sort((a, b) => b.rata - a.rata)
  const idx = rows.findIndex(r => r.siswa_id === siswaId)
  return { rank: idx >= 0 ? idx + 1 : 0, totalSiswa: rows.length }
}

// Kop surat: logo kemenag (kiri) + nama instansi/lembaga/NSM/NPSN/alamat (tengah)
// + logo lembaga (kanan), garis bawah. Mengembalikan y setelah kop.
function drawKop(doc, settings, logo, y) {
  const W = doc.page.width
  const M = doc.page.margins.left
  const cx = W / 2
  const kemenag = logo.kemenagPath
  const lembagaLogo = logo.lembagaPath

  if (kemenag) {
    try { doc.image(kemenag, M, y, { fit: [52, 52] }) } catch { /* tanpa logo */ }
  }
  if (lembagaLogo) {
    try { doc.image(lembagaLogo, W - M - 52, y, { fit: [52, 52] }) } catch { /* tanpa logo */ }
  }

  const tx = M + 60
  const tw = W - 2 * (M + 60)
  doc.font('Helvetica-Bold').fontSize(11).fillColor('black')
  doc.text(safeText(settings.nama_instansi, 'KEMENTERIAN AGAMA REPUBLIK INDONESIA').toUpperCase(), tx, y, { width: tw, align: 'center', lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(13)
  doc.text(safeText(settings.nama_lembaga, 'Nama Lembaga').toUpperCase(), tx, y + 14, { width: tw, align: 'center', lineBreak: false })
  const nsmNpsn = [settings.nsm ? `NSM : ${settings.nsm}` : '', settings.npsn ? `NPSN : ${settings.npsn}` : ''].filter(Boolean).join('  |  ')
  doc.font('Helvetica-Bold').fontSize(9)
  if (nsmNpsn) doc.text(nsmNpsn, tx, y + 30, { width: tw, align: 'center', lineBreak: false })
  doc.font('Helvetica').fontSize(8)
  if (settings.alamat) doc.text(safeText(settings.alamat), tx, y + 43, { width: tw, align: 'center', lineBreak: false })
  const kontak = [settings.email ? `Email: ${settings.email}` : '', settings.telepon ? `Telp: ${settings.telepon}` : ''].filter(Boolean).join('  |  ')
  if (kontak) doc.text(kontak, tx, y + 53, { width: tw, align: 'center', lineBreak: false })

  const ruleY = y + 66
  doc.moveTo(M, ruleY).lineTo(W - M, ruleY).lineWidth(2).strokeColor('black').stroke()
  return ruleY + 8
}

async function createRaporMtsplusPdf(db, options) {
  const { tenantId, siswaId, tahunAjaran, semester, jenis, uploadDir } = options
  const bagian = options.bagian || 'lengkap'
  const cetakCover = bagian === 'cover' || bagian === 'lengkap'
  const cetakIdentitas = bagian === 'identitas' || bagian === 'lengkap'
  const butuhNilai = bagian === 'nilai' || bagian === 'lengkap'

  // ---- Sumber data (query identik dengan renderer RDM) ----
  const siswa = db.prepare(`
    SELECT s.*, r.nama AS rombel_nama, r.tingkat, g.nama AS wali_kelas_nama
    FROM siswa s LEFT JOIN rombel r ON s.rombel_id=r.id AND r.tenant_id=s.tenant_id
    LEFT JOIN gtk g ON r.wali_kelas_id=g.id AND g.tenant_id=s.tenant_id
    WHERE s.id=? AND s.tenant_id=?
  `).get(siswaId, tenantId)
  if (!siswa) return null

  const settings = getTenantSettings(db, tenantId) || {}

  const rapor = db.prepare(`
    SELECT r.*, m.nama AS mapel_nama, m.kelompok AS mapel_kelompok
    FROM rapor r LEFT JOIN mapel m ON r.mapel_id = m.id AND m.tenant_id = r.tenant_id
    WHERE r.tenant_id=? AND r.siswa_id=? AND r.tahun_ajaran=? AND r.semester=? AND r.jenis=?
    ORDER BY COALESCE(m.kelompok,'wajib'), m.nama
  `).all(tenantId, siswaId, tahunAjaran, semester, jenis)
  if (butuhNilai && rapor.length === 0) return { error: 'RAPOR_NOT_GENERATED' }

  const { from, to } = semesterRange(semester, tahunAjaran)
  const absensiRows = db.prepare(`SELECT lower(status) AS status, COUNT(DISTINCT tanggal) AS jumlah
    FROM absensi_siswa WHERE siswa_id=? AND tenant_id=? AND tanggal>=? AND tanggal<=? GROUP BY lower(status)`)
    .all(siswaId, tenantId, from, to)
  const kehadiran = { sakit: 0, izin: 0, alpa: 0 }
  for (const row of absensiRows) {
    const key = ['alpha', 'tanpa_keterangan'].includes(row.status) ? 'alpa' : row.status
    if (Object.hasOwn(kehadiran, key)) kehadiran[key] += Number(row.jumlah) || 0
  }

  const kepribadian = db.prepare(`SELECT sikap_spiritual,sikap_sosial,sikap_umum,kelakuan,kerajinan,kerapian,kedisiplinan,catatan_wali_kelas,saran
    FROM catatan_kepribadian WHERE siswa_id=? AND tahun_ajaran=? AND semester=? AND tenant_id=? ORDER BY updated_at DESC LIMIT 1`)
    .get(siswaId, tahunAjaran, semester, tenantId) || {}

  const pelengkap = db.prepare(`SELECT prestasi,catatan_wali_kelas,tanggapan_orang_tua,tanggal_pembagian FROM rapor_pelengkap WHERE tenant_id=? AND siswa_id=? AND tahun_ajaran=? AND semester=? AND jenis=?`)
    .get(tenantId, siswaId, tahunAjaran, semester, jenis) || {}

  const ekstrakurikuler = db.prepare(`SELECT e.id,e.nama,e.jenis_kegiatan,
      COUNT(a.id) AS total_pertemuan,
      SUM(CASE WHEN lower(a.status)='hadir' THEN 1 ELSE 0 END) AS hadir
    FROM ekskul_anggota ea JOIN ekskul e ON e.id=ea.ekskul_id AND e.tenant_id=ea.tenant_id
    LEFT JOIN absensi_ekskul a ON a.ekskul_id=e.id AND a.siswa_id=ea.siswa_id AND a.tenant_id=ea.tenant_id AND a.tanggal>=? AND a.tanggal<=?
    WHERE ea.siswa_id=? AND ea.tenant_id=? GROUP BY e.id,e.nama,e.jenis_kegiatan ORDER BY e.jenis_kegiatan,e.nama`)
    .all(from, to, siswaId, tenantId)
    .map(row => ({ ...row, nilai: row.total_pertemuan ? Math.round((row.hadir / row.total_pertemuan) * 100) : null }))

  const jumlahNilai = rapor.reduce((sum, r) => sum + (Number(r.nilai_akhir) || 0), 0)
  const rataAkhir = rapor.length ? jumlahNilai / rapor.length : 0
  const rank = hitungRank(db, tenantId, siswa.rombel_id, tahunAjaran, semester, jenis, siswaId)

  const qrDataUrl = await QRCode.toDataURL(`Rapor - ${siswa.nama} - Kepsek: ${settings.kepala_sekolah || '-'} - Diverifikasi digital`)
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64')

  const fotoPath = resolveUploadPath(uploadDir, siswa.foto)
  const kemenagUpload = resolveUploadPath(uploadDir, settings.logo_kemenag)
  const kemenagPath = kemenagUpload || path.join(__dirname, 'assets', 'kemenag-logo.svg')
  const lembagaLogoPath = resolveUploadPath(uploadDir, settings.logo)
  const logo = { kemenagPath: fs.existsSync(kemenagPath) ? kemenagPath : null, lembagaLogoPath }

  const tglRapor = safeText(pelengkap.tanggal_pembagian, new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))
  const kota = safeText(settings.kota_cetak || settings.kota, '')
  const namaKepsek = safeText(settings.kepala_sekolah, '................................................')

  const doc = new PDFDocument({ size: 'A4', margin: 34, bufferPages: true, autoFirstPage: false })
  const W = 595.28
  const H = 841.89
  const M = 34

  // ---------- HALAMAN 1: COVER ----------
  if (cetakCover) {
    doc.addPage({ size: 'A4', margin: 34 })
    doc.rect(18, 18, W - 36, H - 36).lineWidth(4).strokeColor('black').stroke()
    doc.rect(26, 26, W - 52, H - 52).lineWidth(1).stroke()

    if (logo.kemenagPath) {
      try { doc.image(logo.kemenagPath, W / 2 - 40, 70, { fit: [80, 80] }) } catch { /* tanpa logo */ }
    }
    if (logo.lembagaLogoPath) {
      try { doc.image(logo.lembagaLogoPath, W / 2 - 30, 160, { fit: [60, 60] }) } catch { /* tanpa logo */ }
    }

    doc.font('Helvetica-Bold').fontSize(22).fillColor('black')
    doc.text('RAPOR PESERTA DIDIK', M, 250, { width: W - 2 * M, align: 'center', characterSpacing: 1 })
    doc.font('Helvetica-Bold').fontSize(14)
    doc.text('Madrasah Tsanawiyah (MTs)', M, 285, { width: W - 2 * M, align: 'center' })

    // Badge jenis rapor (kotak hitam teks putih)
    const jenisTxt = jenisLabel(jenis)
    doc.font('Helvetica-Bold').fontSize(12)
    const badgeW = doc.widthOfString(jenisTxt) + 24
    const badgeX = W / 2 - badgeW / 2
    const badgeY = 325
    doc.rect(badgeX, badgeY, badgeW, 22).fill('#000000')
    doc.fillColor('white').text(jenisTxt, badgeX, badgeY + 5, { width: badgeW, align: 'center' })

    // Kotak nama peserta didik
    const boxY = 390
    doc.rect(W / 2 - 160, boxY, 320, 120).lineWidth(2).strokeColor('black').stroke()
    doc.font('Helvetica').fontSize(11).fillColor('black')
    doc.text('Nama Peserta Didik :', W / 2 - 145, boxY + 15, { width: 130 })
    doc.font('Helvetica-Bold').fontSize(17)
    doc.text(safeText(siswa.nama).toUpperCase(), W / 2 - 145, boxY + 38, { width: 290 })
    doc.font('Helvetica').fontSize(11)
    doc.text('NIS / NISN :', W / 2 - 145, boxY + 75, { width: 130 })
    doc.font('Helvetica-Bold').fontSize(14)
    doc.text(`${safeText(siswa.nis)} / ${safeText(siswa.nisn)}`, W / 2 - 145, boxY + 95, { width: 290 })

    doc.font('Helvetica-Bold').fontSize(18)
    doc.text(safeText(settings.nama_lembaga).toUpperCase(), M, 600, { width: W - 2 * M, align: 'center' })
    doc.font('Helvetica-Bold').fontSize(12)
    doc.text(safeText(settings.nama_instansi, 'KEMENTERIAN AGAMA REPUBLIK INDONESIA').toUpperCase(), M, 630, { width: W - 2 * M, align: 'center' })
  }

  // ---------- HALAMAN 2: IDENTITAS ----------
  if (cetakIdentitas) {
    doc.addPage({ size: 'A4', margin: 34 })
    let y = drawKop(doc, settings, logo, 30)

    doc.font('Helvetica-Bold').fontSize(14)
    doc.text('IDENTITAS PESERTA DIDIK', M, y + 6, { width: W - 2 * M, align: 'center', underline: true })
    y += 36

    const nisData = String(siswa.nisn || '-').split('#')
    const nisLokal = safeText(siswa.nis)
    const nisnNasional = nisData[1] || safeText(siswa.nisn)
    const rows = [
      ['1.', 'Nama Lengkap', safeText(siswa.nama).toUpperCase()],
      ['2.', 'NIS / NISN', `${nisLokal} / ${nisnNasional}`],
      ['3.', 'Tempat, Tanggal Lahir', `${safeText(siswa.tempat_lahir)}, ${safeText(siswa.tanggal_lahir)}`],
      ['4.', 'Jenis Kelamin', safeText(siswa.jenis_kelamin)],
      ['5.', 'Agama', safeText(siswa.agama, 'Islam')],
      ['6.', 'Status dalam Keluarga', safeText(siswa.status_keluarga, 'Anak Kandung')],
      ['7.', 'Anak Ke', safeText(siswa.anak_ke)],
      ['8.', 'Alamat Peserta Didik', safeText(siswa.alamat)],
      ['9.', 'Nomor Telepon Rumah', safeText(siswa.no_hp)],
      ['10.', 'Sekolah Asal (SD/MI)', safeText(siswa.asal_sekolah)],
      ['', 'a. Nama Ayah', safeText(siswa.nama_ayah)],
      ['', 'b. Nama Ibu', safeText(siswa.nama_ibu)],
      ['', 'c. Alamat', safeText(siswa.alamat_ortu || siswa.alamat)],
      ['', 'a. Pekerjaan Ayah', safeText(siswa.kerja_ayah)],
      ['', 'b. Pekerjaan Ibu', safeText(siswa.kerja_ibu)],
      ['', 'Nama Wali Peserta Didik', safeText(siswa.nama_wali)],
      ['', 'Pekerjaan Wali', safeText(siswa.kerja_wali)],
    ]
    doc.fontSize(11)
    for (const [no, label, val] of rows) {
      if (y > 720) { doc.addPage({ size: 'A4', margin: 34 }); y = 50 }
      const isSection = no === ''
      doc.font(isSection ? 'Helvetica-Bold' : 'Helvetica')
      const labelTxt = isSection ? label : `${no} ${label}`
      doc.text(labelTxt, M + 10, y, { width: 150, lineBreak: false })
      doc.text(':', M + 160, y, { width: 10, lineBreak: false })
      doc.text(val, M + 172, y, { width: W - M - 172 - 10, lineBreak: false })
      y += 20
    }

    // Foto + TTD kepala
    const sigY = Math.max(y + 20, 660)
    if (fotoPath) {
      try { doc.image(fotoPath, M + 20, sigY, { fit: [85, 113] }) } catch { /* tanpa foto */ }
    } else {
      doc.rect(M + 20, sigY, 85, 113).lineWidth(1).stroke()
      doc.font('Helvetica').fontSize(8).text('PAS FOTO\n3 X 4', M + 20, sigY + 45, { width: 85, align: 'center', lineBreak: false })
    }
    doc.font('Helvetica-Bold').fontSize(11)
    doc.text(`${kota}${kota ? ', ' : ''}${tglRapor}`, W - M - 200, sigY, { width: 190, align: 'center', lineBreak: false })
    doc.font('Helvetica').fontSize(11)
    doc.text('Kepala Madrasah', W - M - 200, sigY + 20, { width: 190, align: 'center', lineBreak: false })
    if (qrBuffer) { try { doc.image(qrBuffer, W - M - 160, sigY + 40, { fit: [50, 50] }) } catch { /* tanpa QR */ } }
    doc.font('Helvetica-Bold').fontSize(11)
    doc.text(namaKepsek.toUpperCase(), W - M - 200, sigY + 95, { width: 190, align: 'center', underline: true, lineBreak: false })
  }

  // ---------- HALAMAN 3: NILAI ----------
  if (butuhNilai) {
    doc.addPage({ size: 'A4', margin: 34 })
    let y = drawKop(doc, settings, logo, 30)

    doc.font('Helvetica-Bold').fontSize(13)
    doc.text(`CAPAIAN HASIL BELAJAR ${jenisLabel(jenis)}`, M, y + 4, { width: W - 2 * M, align: 'center', underline: true })
    y += 30

    // Info siswa: Nama/NIS-NISN | Kelas/Semester
    doc.font('Helvetica-Bold').fontSize(9)
    doc.text('Nama', M, y, { width: 40, lineBreak: false })
    doc.text(`: ${safeText(siswa.nama).toUpperCase()}`, M + 42, y, { width: 200, lineBreak: false })
    doc.text('Kelas', W / 2 + 30, y, { width: 30, lineBreak: false })
    doc.text(`: ${romawi(siswa.rombel_nama) || safeText(siswa.rombel_nama)}`, W / 2 + 62, y, { width: 100, lineBreak: false })
    doc.text('NIS/NISN', M, y + 14, { width: 40, lineBreak: false })
    doc.text(`: ${safeText(siswa.nis)} / ${safeText(siswa.nisn)}`, M + 42, y + 14, { width: 200, lineBreak: false })
    doc.text('Semester', W / 2 + 30, y + 14, { width: 40, lineBreak: false })
    doc.text(`: ${semester === 'ganjil' ? 'Ganjil' : 'Genap'} (${tahunAjaran})`, W / 2 + 62, y + 14, { width: 150, lineBreak: false })
    y += 34

    // Tabel nilai 6 kolom
    const cols = { no: { x: M, w: 22 }, mapel: { x: M + 22, w: 190 }, kkm: { x: M + 212, w: 32 }, nilai: { x: M + 244, w: 32 }, huruf: { x: M + 276, w: 120 }, capaian: { x: M + 396, w: W - M - 396 } }
    const drawHeader = () => {
      doc.font('Helvetica-Bold').fontSize(8)
      doc.rect(M, y, W - 2 * M, 18).lineWidth(1).stroke()
      doc.text('No', cols.no.x, y + 5, { width: cols.no.w, align: 'center', lineBreak: false })
      doc.text('Mata Pelajaran', cols.mapel.x, y + 5, { width: cols.mapel.w, align: 'left', lineBreak: false })
      doc.text('KKM', cols.kkm.x, y + 5, { width: cols.kkm.w, align: 'center', lineBreak: false })
      doc.text('Nilai', cols.nilai.x, y + 5, { width: cols.nilai.w, align: 'center', lineBreak: false })
      doc.text('Huruf (Terbilang)', cols.huruf.x, y + 5, { width: cols.huruf.w, align: 'center', lineBreak: false })
      doc.text('Capaian', cols.capaian.x, y + 5, { width: cols.capaian.w, align: 'center', lineBreak: false })
      y += 18
    }
    const rowH = 17
    const drawRow = (no, nama, kkm, nilai, huruf, capaian, bold = false) => {
      if (y + rowH > 760) { doc.addPage({ size: 'A4', margin: 34 }); y = 50; drawHeader() }
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
      doc.rect(M, y, W - 2 * M, rowH).lineWidth(0.7).stroke()
      doc.moveTo(cols.mapel.x, y).lineTo(cols.mapel.x, y + rowH).stroke()
      doc.moveTo(cols.kkm.x, y).lineTo(cols.kkm.x, y + rowH).stroke()
      doc.moveTo(cols.nilai.x, y).lineTo(cols.nilai.x, y + rowH).stroke()
      doc.moveTo(cols.huruf.x, y).lineTo(cols.huruf.x, y + rowH).stroke()
      doc.moveTo(cols.capaian.x, y).lineTo(cols.capaian.x, y + rowH).stroke()
      doc.text(String(no ?? ''), cols.no.x, y + 4, { width: cols.no.w, align: 'center', lineBreak: false })
      doc.text(safeText(nama), cols.mapel.x + 4, y + 4, { width: cols.mapel.w - 8, lineBreak: false })
      doc.text(String(kkm ?? ''), cols.kkm.x, y + 4, { width: cols.kkm.w, align: 'center', lineBreak: false })
      doc.text(String(nilai ?? ''), cols.nilai.x, y + 4, { width: cols.nilai.w, align: 'center', lineBreak: false })
      doc.text(safeText(huruf), cols.huruf.x + 3, y + 4, { width: cols.huruf.w - 6, lineBreak: false })
      doc.text(safeText(capaian), cols.capaian.x + 3, y + 4, { width: cols.capaian.w - 6, lineBreak: false })
      y += rowH
    }

    drawHeader()
    rapor.forEach((r, i) => {
      const nilai = Number(r.nilai_akhir) || 0
      const kkm = Number(r.kkm) || 70
      drawRow(i + 1, r.mapel_nama, kkm, nilai, terbilang(nilai), nilai >= kkm ? 'Tercapai' : 'Belum Tercapai')
    })
    drawRow('', 'Jumlah Total', '', jumlahNilai, terbilang(jumlahNilai), '', true)
    drawRow('', 'Rata-Rata', '', rataAkhir.toFixed(1), '', `Peringkat: ${rank.rank} dari ${rank.totalSiswa}`, true)

    // Penilaian Sikap Wali Kelas
    y += 4
    const sikap = [
      ['Kelakuan', kepribadian.kelakuan],
      ['Kerajinan', kepribadian.kerajinan],
      ['Kerapian', kepribadian.kerapian],
      ['Kedisiplinan', kepribadian.kedisiplinan],
      ['Sikap Spiritual', kepribadian.sikap_spiritual],
      ['Sikap Sosial', kepribadian.sikap_sosial],
    ].filter(([, v]) => v !== undefined && v !== null && v !== '')
    if (sikap.length) {
      doc.font('Helvetica-Bold').fontSize(8)
      doc.rect(M, y, W - 2 * M, 16).lineWidth(1).stroke()
      doc.text('Penilaian Sikap Wali Kelas', M, y + 4, { width: W - 2 * M, align: 'center', lineBreak: false })
      y += 16
      doc.font('Helvetica').fontSize(8)
      let sx = M
      sikap.forEach(([label, v], i) => {
        const cellW = (W - 2 * M) / sikap.length
        doc.rect(sx, y, cellW, 16).lineWidth(0.7).stroke()
        doc.text(label, sx + 3, y + 3, { width: cellW - 6, align: 'left', lineBreak: false })
        doc.font('Helvetica-Bold')
        const abjad = nilaiKeAbjad(v)
        doc.text(abjad !== '-' ? abjad : safeText(v), sx + 3, y + 3, { width: cellW - 6, align: 'right', lineBreak: false })
        doc.font('Helvetica')
        sx += cellW
      })
      y += 20
    }

    // Ekstrakurikuler + Ketidakhadiran
    const halfW = (W - 2 * M - 10) / 2
    const ex = M
    const ax = M + halfW + 10
    doc.font('Helvetica-Bold').fontSize(8)
    doc.rect(ex, y, halfW, 16).lineWidth(1).stroke()
    doc.text('Ekstrakurikuler', ex, y + 4, { width: halfW, align: 'center', lineBreak: false })
    doc.rect(ax, y, halfW, 16).lineWidth(1).stroke()
    doc.text('Ketidakhadiran', ax, y + 4, { width: halfW, align: 'center', lineBreak: false })
    y += 16
    doc.font('Helvetica').fontSize(8)
    const eksRows = ekstrakurikuler.slice(0, 2)
    let ey = y
    for (const e of eksRows) {
      doc.text(safeText(e.nama), ex + 3, ey + 3, { width: halfW - 30, lineBreak: false })
      doc.text(e.nilai != null ? String(e.nilai) : '-', ex + halfW - 25, ey + 3, { width: 22, align: 'center', lineBreak: false })
      ey += 14
    }
    if (!eksRows.length) doc.text('..............................', ex + 3, ey + 3, { width: halfW - 30, lineBreak: false })
    const abs = [['Sakit', kehadiran.sakit], ['Izin', kehadiran.izin], ['Tanpa Keterangan', kehadiran.alpa]]
    abs.forEach(([lbl, v]) => {
      doc.text(lbl, ax + 3, y + 3, { width: halfW - 50, lineBreak: false })
      doc.text(`${v} hari`, ax + halfW - 40, y + 3, { width: 38, align: 'right', lineBreak: false })
      y += 14
    })
    y = Math.max(y, ey) + 8

    // Catatan Wali Kelas
    doc.font('Helvetica-Bold').fontSize(8)
    doc.rect(M, y, W - 2 * M, 26).lineWidth(1).stroke()
    doc.text('Catatan Wali Kelas:', M + 4, y + 4, { width: W - 2 * M - 8, lineBreak: false })
    doc.font('Helvetica-Oblique').fontSize(8)
    doc.text(`"${safeText(pelengkap.catatan_wali_kelas || kepribadian.catatan_wali_kelas || kepribadian.saran, 'Tingkatkan terus kedisiplinan dan semangat belajarmu.')}"`, M + 4, y + 15, { width: W - 2 * M - 8, lineBreak: false })
    y += 34

    // TTD 3 kolom
    const ttdY = Math.max(y + 20, 700)
    doc.font('Helvetica').fontSize(9)
    doc.text('Mengetahui,\nOrang Tua / Wali', M, ttdY, { width: (W - 2 * M) / 3, align: 'center' })
    doc.font('Helvetica-Bold').text('( ...................................... )', M, ttdY + 50, { width: (W - 2 * M) / 3, align: 'center' })

    doc.font('Helvetica').fontSize(9)
    doc.text('Kepala Madrasah', M + (W - 2 * M) / 3, ttdY, { width: (W - 2 * M) / 3, align: 'center' })
    if (qrBuffer) { try { doc.image(qrBuffer, M + (W - 2 * M) / 3 + ((W - 2 * M) / 3 - 34) / 2, ttdY + 16, { fit: [34, 34] }) } catch { /* tanpa QR */ } }
    doc.font('Helvetica-Bold')
    doc.text(namaKepsek.toUpperCase(), M + (W - 2 * M) / 3, ttdY + 52, { width: (W - 2 * M) / 3, align: 'center', underline: true })

    doc.font('Helvetica').fontSize(9)
    doc.text(`${kota}${kota ? ', ' : ''}${tglRapor}\nWali Kelas ${romawi(siswa.rombel_nama) || ''}`, M + 2 * (W - 2 * M) / 3, ttdY, { width: (W - 2 * M) / 3, align: 'center' })
    doc.font('Helvetica-Bold')
    doc.text(safeText(siswa.wali_kelas_nama).toUpperCase(), M + 2 * (W - 2 * M) / 3, ttdY + 52, { width: (W - 2 * M) / 3, align: 'center', underline: true })
  }

  return doc
}

module.exports = { createRaporMtsplusPdf, jenisLabel }
