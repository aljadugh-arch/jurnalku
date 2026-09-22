const PDFDocument = require('pdfkit')
const QRCode = require('qrcode')
const path = require('path')
const fs = require('fs')

// Rapor siswa siap-cetak (server-side PDF), mengikuti struktur referensi:
// halaman 1: sampul, halaman 2: identitas peserta didik, halaman 3: capaian hasil belajar.
// Query data (kehadiran, kepribadian, ekstrakurikuler, pelengkap) mengikuti pola
// persis /api/rapor/ringkasan di index.cjs agar konsisten dengan tampilan browser-print.

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

// Rentang tanggal semester — duplikat kecil dari index.cjs (fungsi lokal, bukan exported)
// supaya service ini tidak circular-require index.cjs.
function semesterRange(tahunAjaran, semester) {
  const [thn1, thn2] = String(tahunAjaran).split('/')
  const y1 = thn1, y2 = thn2 || thn1
  const from = semester === 'ganjil' ? `${y1}-07-01` : `${y2}-01-01`
  const to = semester === 'ganjil' ? `${y1}-12-31` : `${y2}-06-30`
  return { from, to }
}

async function createRaporSiswaPdf(db, options) {
  const { tenantId, siswaId, tahunAjaran, semester, jenis, uploadDir } = options

  const siswa = db.prepare(`
    SELECT s.*, r.nama AS rombel_nama, r.tingkat, g.nama AS wali_kelas_nama, g.nip AS wali_kelas_nip
    FROM siswa s LEFT JOIN rombel r ON s.rombel_id=r.id AND r.tenant_id=s.tenant_id
    LEFT JOIN gtk g ON r.wali_kelas_id=g.id AND g.tenant_id=s.tenant_id
    WHERE s.id=? AND s.tenant_id=?
  `).get(siswaId, tenantId)
  if (!siswa) return null

  const settings = db.prepare('SELECT * FROM settings WHERE tenant_id=?').get(tenantId) || {}

  const rapor = db.prepare(`
    SELECT r.*, m.nama AS mapel_nama
    FROM rapor r LEFT JOIN mapel m ON r.mapel_id = m.id AND m.tenant_id = r.tenant_id
    WHERE r.tenant_id=? AND r.siswa_id=? AND r.tahun_ajaran=? AND r.semester=? AND r.jenis=?
    ORDER BY m.nama
  `).all(tenantId, siswaId, tahunAjaran, semester, jenis)
  if (rapor.length === 0) return { error: 'RAPOR_NOT_GENERATED' }

  const { from, to } = semesterRange(tahunAjaran, semester)

  const absensiRows = db.prepare(`SELECT lower(status) AS status, COUNT(DISTINCT tanggal) AS jumlah
    FROM absensi_siswa WHERE siswa_id=? AND tenant_id=? AND tanggal>=? AND tanggal<=? GROUP BY lower(status)`)
    .all(siswaId, tenantId, from, to)
  const kehadiran = { hadir: 0, sakit: 0, izin: 0, alpa: 0 }
  for (const row of absensiRows) {
    const key = ['alpha', 'tanpa_keterangan'].includes(row.status) ? 'alpa' : row.status
    if (Object.hasOwn(kehadiran, key)) kehadiran[key] += Number(row.jumlah) || 0
  }

  const kepribadian = db.prepare(`SELECT sikap_spiritual,sikap_sosial,sikap_umum,kelakuan,kerajinan,kerapian,kedisiplinan,catatan_wali_kelas,saran
    FROM catatan_kepribadian WHERE siswa_id=? AND tahun_ajaran=? AND semester=? AND tenant_id=? ORDER BY updated_at DESC LIMIT 1`)
    .get(siswaId, tahunAjaran, semester, tenantId) || {}

  const pelengkap = db.prepare(`SELECT * FROM rapor_pelengkap WHERE tenant_id=? AND siswa_id=? AND tahun_ajaran=? AND semester=? AND jenis=?`)
    .get(tenantId, siswaId, tahunAjaran, semester, jenis) || {}
  let prestasi = []
  try { prestasi = JSON.parse(pelengkap.prestasi || '[]') } catch { prestasi = [] }

  const ekstrakurikuler = db.prepare(`SELECT e.id,e.nama,e.jenis_kegiatan,
      COUNT(a.id) AS total_pertemuan,
      SUM(CASE WHEN lower(a.status)='hadir' THEN 1 ELSE 0 END) AS hadir
    FROM ekskul_anggota ea JOIN ekskul e ON e.id=ea.ekskul_id AND e.tenant_id=ea.tenant_id
    LEFT JOIN absensi_ekskul a ON a.ekskul_id=e.id AND a.siswa_id=ea.siswa_id AND a.tenant_id=ea.tenant_id AND a.tanggal>=? AND a.tanggal<=?
    WHERE ea.siswa_id=? AND ea.tenant_id=? GROUP BY e.id,e.nama,e.jenis_kegiatan ORDER BY e.jenis_kegiatan,e.nama`)
    .all(from, to, siswaId, tenantId)
    .map(row => ({ ...row, nilai: row.total_pertemuan ? Math.round((row.hadir / row.total_pertemuan) * 100) : null }))

  const rataAkhir = rapor.length ? Math.round(rapor.reduce((sum, r) => sum + (Number(r.nilai_akhir) || 0), 0) / rapor.length) : 0
  const jenisLabel = jenis === 'rapor_sas' ? 'AKHIR SEMESTER (SAS)' : 'TENGAH SEMESTER (STS)'

  const qrDataUrl = await QRCode.toDataURL(`Rapor - ${siswa.nama} - Kepsek: ${settings.kepala_sekolah || '-'} - Diverifikasi digital`)
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64')

  const fotoPath = resolveUploadPath(uploadDir, siswa.foto)
  const settingsLogoPath = resolveUploadPath(uploadDir, settings.logo)
  const hasLogo = !!settingsLogoPath

  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true })
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right

  // ---------- Halaman 1: Sampul ----------
  doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).lineWidth(2).stroke()
  doc.rect(36, 36, doc.page.width - 72, doc.page.height - 72).lineWidth(0.5).stroke()

  doc.moveDown(4)
  if (hasLogo) { try { doc.image(settingsLogoPath, doc.page.width / 2 - 45, doc.y, { width: 90 }); doc.moveDown(6) } catch {} }
  doc.font('Helvetica-Bold').fontSize(22).text('RAPOR PESERTA DIDIK', { align: 'center' })
  doc.moveDown(0.3)
  doc.font('Helvetica-Bold').fontSize(14).text(String(settings.jenjang || '').toUpperCase() || 'SATUAN PENDIDIKAN', { align: 'center' })
  doc.moveDown(0.6)
  doc.font('Helvetica-Bold').fontSize(11).fillColor('white')
  const badgeText = `  ${jenisLabel}  `
  const badgeWidth = doc.widthOfString(badgeText) + 10
  const badgeX = (doc.page.width - badgeWidth) / 2
  const badgeY = doc.y
  doc.rect(badgeX, badgeY, badgeWidth, 22).fill('black')
  doc.fillColor('white').text(badgeText, badgeX + 5, badgeY + 5, { align: 'center', width: badgeWidth - 10 })
  doc.fillColor('black')
  doc.y = badgeY + 32
  doc.moveDown(3)

  const boxY = doc.y
  const boxWidth = pageWidth * 0.8
  const boxX = doc.page.margins.left + (pageWidth - boxWidth) / 2
  doc.rect(boxX, boxY, boxWidth, 120).lineWidth(1).stroke()
  doc.font('Helvetica').fontSize(11).text('Nama Peserta Didik :', boxX, boxY + 15, { width: boxWidth, align: 'center' })
  doc.font('Helvetica-Bold').fontSize(18).text(safeText(siswa.nama).toUpperCase(), boxX, boxY + 32, { width: boxWidth, align: 'center' })
  doc.font('Helvetica').fontSize(11).text('NIS / NISN :', boxX, boxY + 65, { width: boxWidth, align: 'center' })
  doc.font('Helvetica-Bold').fontSize(13).text(`${safeText(siswa.nis)} / ${safeText(siswa.nisn)}`, boxX, boxY + 82, { width: boxWidth, align: 'center' })
  doc.y = boxY + 140
  doc.moveDown(2)

  doc.font('Helvetica-Bold').fontSize(15).text(safeText(settings.nama_lembaga, 'Nama Lembaga').toUpperCase(), { align: 'center' })
  if (settings.alamat) doc.font('Helvetica').fontSize(10).text(settings.alamat, { align: 'center' })

  // ---------- Halaman 2: Identitas Peserta Didik ----------
  doc.addPage({ size: 'A4', margin: 50 })
  drawReportHeader(doc, settings, hasLogo ? settingsLogoPath : null, pageWidth)
  doc.moveDown(1)
  doc.font('Helvetica-Bold').fontSize(14).text('IDENTITAS PESERTA DIDIK', { align: 'center', underline: true })
  doc.moveDown(1.2)

  const identityRows = [
    ['1.', 'Nama Lengkap', safeText(siswa.nama)],
    ['2.', 'NIS / NISN', `${safeText(siswa.nis)} / ${safeText(siswa.nisn)}`],
    ['3.', 'Tempat, Tanggal Lahir', `${safeText(siswa.tempat_lahir)}, ${safeText(siswa.tanggal_lahir)}`],
    ['4.', 'Jenis Kelamin', siswa.jenis_kelamin === 'P' ? 'Perempuan' : 'Laki-laki'],
    ['5.', 'Agama', safeText(siswa.agama, 'Islam')],
    ['6.', 'Status dalam Keluarga', safeText(siswa.status_keluarga, 'Anak Kandung')],
    ['7.', 'Anak Ke', safeText(siswa.anak_ke, '1')],
    ['8.', 'Alamat Peserta Didik', safeText(siswa.alamat)],
    ['9.', 'Nomor Telepon', safeText(siswa.no_hp)],
    ['10.', 'Sekolah Asal (SD/MI)', safeText(siswa.asal_sekolah)],
    ['11.', 'Kelas', safeText(siswa.rombel_nama)],
    ['12.', 'Nama Ayah', safeText(siswa.nama_ayah || siswa.nama_ortu)],
    ['13.', 'Nama Ibu', safeText(siswa.nama_ibu)],
    ['14.', 'Pekerjaan Ayah', safeText(siswa.kerja_ayah)],
    ['15.', 'Pekerjaan Ibu', safeText(siswa.kerja_ibu)],
    ['16.', 'Nama Wali', safeText(siswa.nama_wali)],
    ['17.', 'Pekerjaan Wali', safeText(siswa.kerja_wali)],
  ]

  const labelX = doc.page.margins.left + 20
  const colonX = labelX + 170
  const valueX = colonX + 12
  const valueWidth = pageWidth - (valueX - doc.page.margins.left) - 10
  let rowY = doc.y
  for (const [no, label, value] of identityRows) {
    doc.font('Helvetica').fontSize(10)
    const textHeight = doc.heightOfString(value, { width: valueWidth })
    const rowHeight = Math.max(16, textHeight + 4)
    if (rowY + rowHeight > doc.page.height - doc.page.margins.bottom - 150) {
      doc.addPage({ size: 'A4', margin: 50 })
      drawReportHeader(doc, settings, hasLogo ? settingsLogoPath : null, pageWidth)
      rowY = doc.y + 10
    }
    doc.font('Helvetica').fontSize(10).text(no, doc.page.margins.left, rowY, { width: 18 })
    doc.font('Helvetica-Bold').fontSize(10).text(label, labelX, rowY, { width: 150 })
    doc.font('Helvetica').fontSize(10).text(':', colonX, rowY)
    doc.font('Helvetica').fontSize(10).text(value, valueX, rowY, { width: valueWidth })
    rowY += rowHeight
  }
  doc.y = rowY + 20

  // Foto + tanda tangan kepala sekolah
  if (doc.y + 130 > doc.page.height - doc.page.margins.bottom) {
    doc.addPage({ size: 'A4', margin: 50 })
    drawReportHeader(doc, settings, hasLogo ? settingsLogoPath : null, pageWidth)
    doc.moveDown(1)
  }
  const sigBlockY = doc.y
  if (fotoPath) { try { doc.image(fotoPath, doc.page.margins.left + 20, sigBlockY, { width: 85, height: 113, fit: [85, 113] }); doc.rect(doc.page.margins.left + 20, sigBlockY, 85, 113).stroke() } catch {} }
  else { doc.rect(doc.page.margins.left + 20, sigBlockY, 85, 113).stroke(); doc.fontSize(8).text('PAS FOTO\n3 X 4', doc.page.margins.left + 20, sigBlockY + 45, { width: 85, align: 'center' }) }

  const sigX = doc.page.margins.left + pageWidth / 2
  const tanggalRapor = safeText(pelengkap.tanggal_pembagian, new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))
  doc.font('Helvetica').fontSize(10).text(`${safeText(settings.kota_cetak, 'Bondowoso')}, ${tanggalRapor}`, sigX, sigBlockY, { width: pageWidth / 2 - 20, align: 'center' })
  doc.text('Kepala Sekolah', sigX, sigBlockY + 14, { width: pageWidth / 2 - 20, align: 'center' })
  try { doc.image(qrBuffer, sigX + (pageWidth / 2 - 20) / 2 - 25, sigBlockY + 30, { width: 50 }) } catch {}
  doc.font('Helvetica-Bold').fontSize(10).text(safeText(settings.kepala_sekolah, '( .................................... )'), sigX, sigBlockY + 85, { width: pageWidth / 2 - 20, align: 'center', underline: true })

  // ---------- Halaman 3: Capaian Hasil Belajar ----------
  doc.addPage({ size: 'A4', margin: 50 })
  drawReportHeader(doc, settings, hasLogo ? settingsLogoPath : null, pageWidth)
  doc.moveDown(0.6)
  doc.font('Helvetica-Bold').fontSize(13).text(`CAPAIAN HASIL BELAJAR ${jenisLabel}`, { align: 'center', underline: true })
  doc.moveDown(0.8)
  doc.font('Helvetica').fontSize(9)
  doc.text(`Nama: ${safeText(siswa.nama)}     NIS/NISN: ${safeText(siswa.nis)}/${safeText(siswa.nisn)}`, doc.page.margins.left, doc.y)
  doc.text(`Kelas: ${safeText(siswa.rombel_nama)}     Semester: ${semester === 'genap' ? 'Genap' : 'Ganjil'} (${tahunAjaran})`, doc.page.margins.left, doc.y)
  doc.moveDown(0.8)

  const cols = [
    { key: 'no', label: 'No', w: 0.05 },
    { key: 'mapel_nama', label: 'Mata Pelajaran', w: 0.30 },
    { key: 'nilai_harian', label: 'Harian', w: 0.11 },
    { key: 'nilai_sts', label: 'STS', w: 0.11 },
    { key: 'nilai_sas', label: 'SAS', w: 0.11, hideIf: jenis !== 'rapor_sas' },
    { key: 'nilai_akhir', label: 'Akhir', w: 0.11 },
    { key: 'predikat', label: 'Predikat', w: 0.11 },
  ].filter(c => !c.hideIf)
  const totalRatio = cols.reduce((s, c) => s + c.w, 0)
  cols.forEach(c => { c.width = (c.w / totalRatio) * pageWidth })

  const rowH = 18
  let tableY = doc.y
  const startX = doc.page.margins.left

  function drawTableRow(cells, isHeader) {
    let x = startX
    if (isHeader) { doc.rect(startX, tableY, pageWidth, rowH).fill('#D3D3D3'); doc.fillColor('black') }
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
    for (const col of cols) {
      doc.fillColor('black').text(String(cells[col.key] ?? ''), x + 3, tableY + 4, { width: col.width - 6, align: col.key === 'mapel_nama' ? 'left' : 'center' })
      x += col.width
    }
    doc.rect(startX, tableY, pageWidth, rowH).stroke()
    tableY += rowH
  }

  const headerLabels = {}
  cols.forEach(c => { headerLabels[c.key] = c.label })
  drawTableRow(headerLabels, true)
  rapor.forEach((row, index) => {
    if (tableY + rowH > doc.page.height - doc.page.margins.bottom - 220) {
      doc.addPage({ size: 'A4', margin: 50 })
      tableY = doc.page.margins.top
      drawTableRow(headerLabels, true)
    }
    drawTableRow({
      no: index + 1,
      mapel_nama: row.mapel_nama,
      nilai_harian: row.nilai_harian ?? 0,
      nilai_sts: row.nilai_sts ?? 0,
      nilai_sas: row.nilai_sas ?? 0,
      nilai_akhir: row.nilai_akhir,
      predikat: row.predikat,
    }, false)
  })
  doc.y = tableY + 10
  doc.font('Helvetica').fontSize(8).text(
    jenis === 'rapor_sas'
      ? 'Nilai Akhir = (Nilai Harian x 40%) + (Asesmen STS x 20%) + (Asesmen SAS x 40%)'
      : 'Nilai Akhir = (Nilai Harian x 60%) + (Asesmen STS x 40%)',
    doc.page.margins.left,
  )
  doc.font('Helvetica-Bold').fontSize(9).text(`Rata-rata: ${rataAkhir}`, doc.page.margins.left)
  doc.moveDown(0.6)

  const boxTop = doc.y
  const halfW = (pageWidth - 10) / 2
  doc.rect(startX, boxTop, halfW, 60).stroke()
  doc.font('Helvetica-Bold').fontSize(9).text('Sikap dan Kepribadian', startX + 5, boxTop + 5)
  doc.font('Helvetica').fontSize(8)
    .text(`Spiritual: ${safeText(kepribadian.sikap_spiritual || kepribadian.sikap_umum, '-')}   Sosial: ${safeText(kepribadian.sikap_sosial || kepribadian.sikap_umum, '-')}`, startX + 5, boxTop + 20, { width: halfW - 10 })
    .text(`Kelakuan: ${safeText(kepribadian.kelakuan, 'Baik')}   Kedisiplinan: ${safeText(kepribadian.kedisiplinan, 'Baik')}`, startX + 5, boxTop + 35, { width: halfW - 10 })

  doc.rect(startX + halfW + 10, boxTop, halfW, 60).stroke()
  doc.font('Helvetica-Bold').fontSize(9).text('Kehadiran', startX + halfW + 15, boxTop + 5)
  doc.font('Helvetica').fontSize(8)
    .text(`Hadir: ${kehadiran.hadir}   Sakit: ${kehadiran.sakit}   Izin: ${kehadiran.izin}   Tanpa Keterangan: ${kehadiran.alpa}`, startX + halfW + 15, boxTop + 22, { width: halfW - 20 })
  doc.y = boxTop + 70

  const boxTop2 = doc.y
  doc.rect(startX, boxTop2, halfW, 55).stroke()
  doc.font('Helvetica-Bold').fontSize(9).text('Ekstrakurikuler', startX + 5, boxTop2 + 5)
  doc.font('Helvetica').fontSize(8)
  const ekstraLines = ekstrakurikuler.length
    ? ekstrakurikuler.slice(0, 3).map(e => `${e.nama}: ${e.nilai ?? '-'}`).join('\n')
    : 'Tidak mengikuti kegiatan ekstrakurikuler.'
  doc.text(ekstraLines, startX + 5, boxTop2 + 20, { width: halfW - 10 })

  doc.rect(startX + halfW + 10, boxTop2, halfW, 55).stroke()
  doc.font('Helvetica-Bold').fontSize(9).text('Prestasi', startX + halfW + 15, boxTop2 + 5)
  doc.font('Helvetica').fontSize(8)
  const prestasiLines = prestasi.length
    ? prestasi.slice(0, 3).map(p => `${p.jenis || '-'}: ${p.keterangan || '-'}`).join('\n')
    : 'Belum ada catatan prestasi.'
  doc.text(prestasiLines, startX + halfW + 15, boxTop2 + 20, { width: halfW - 20 })
  doc.y = boxTop2 + 65

  const catatanY = doc.y
  doc.rect(startX, catatanY, pageWidth, 40).stroke()
  doc.font('Helvetica-Bold').fontSize(9).text('Catatan Wali Kelas:', startX + 5, catatanY + 5)
  doc.font('Helvetica-Oblique').fontSize(8).text(
    safeText(pelengkap.catatan_wali_kelas || kepribadian.catatan_wali_kelas || kepribadian.saran, 'Tingkatkan terus kedisiplinan dan semangat belajarmu.'),
    startX + 5, catatanY + 18, { width: pageWidth - 10 },
  )
  doc.y = catatanY + 50

  if (doc.y + 150 > doc.page.height - doc.page.margins.bottom) {
    doc.addPage({ size: 'A4', margin: 50 })
    drawReportHeader(doc, settings, hasLogo ? settingsLogoPath : null, pageWidth)
    doc.moveDown(1)
  }
  doc.moveDown(1)
  const sigY = doc.y
  const thirdW = pageWidth / 3
  doc.font('Helvetica').fontSize(9)
  doc.text('Orang Tua / Wali', startX, sigY, { width: thirdW, align: 'center' })
  doc.font('Helvetica-Bold').text('( .................................... )', startX, sigY + 60, { width: thirdW, align: 'center' })

  doc.font('Helvetica').text('Kepala Sekolah', startX + thirdW, sigY, { width: thirdW, align: 'center' })
  try { doc.image(qrBuffer, startX + thirdW + thirdW / 2 - 22, sigY + 14, { width: 44 }) } catch {}
  doc.font('Helvetica-Bold').text(safeText(settings.kepala_sekolah, '( .................................... )'), startX + thirdW, sigY + 60, { width: thirdW, align: 'center', underline: true })

  doc.font('Helvetica').text(`${safeText(settings.kota_cetak, 'Bondowoso')}, ${tanggalRapor}\nWali Kelas ${safeText(siswa.rombel_nama)}`, startX + thirdW * 2, sigY, { width: thirdW, align: 'center' })
  doc.font('Helvetica-Bold').text(safeText(siswa.wali_kelas_nama, '( .................................... )'), startX + thirdW * 2, sigY + 60, { width: thirdW, align: 'center', underline: true })

  return doc
}

function drawReportHeader(doc, settings, logoPath, pageWidth) {
  const startY = doc.y
  if (logoPath) { try { doc.image(logoPath, doc.page.margins.left, startY, { width: 50, height: 50, fit: [50, 50] }) } catch {} }
  doc.font('Helvetica-Bold').fontSize(11).text(safeText(settings.nama_lembaga, 'Nama Lembaga').toUpperCase(), doc.page.margins.left + 60, startY, { width: pageWidth - 120, align: 'center' })
  const npsnLine = [settings.npsn && `NPSN: ${settings.npsn}`, settings.nsm && `NSM: ${settings.nsm}`].filter(Boolean).join('  |  ')
  if (npsnLine) doc.font('Helvetica').fontSize(8).text(npsnLine, doc.page.margins.left + 60, doc.y, { width: pageWidth - 120, align: 'center' })
  if (settings.alamat) doc.font('Helvetica').fontSize(8).text(settings.alamat, doc.page.margins.left + 60, doc.y, { width: pageWidth - 120, align: 'center' })
  doc.y = Math.max(doc.y, startY + 50) + 5
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageWidth, doc.y).lineWidth(1.5).stroke()
  doc.moveDown(0.5)
}

module.exports = { createRaporSiswaPdf }
