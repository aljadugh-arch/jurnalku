'use strict'

const PDFDocument = require('pdfkit')
const fs = require('fs')
const path = require('path')
const { terbilang, nilaiKeAbjad } = require('./rapor-k13-service.cjs')

const A4 = { w: 595.28, h: 841.89 }
const MARGIN = { top: 56, right: 56, bottom: 56, left: 56 }
const NAMA_INSTANSI = 'KEMENTERIAN AGAMA REPUBLIK INDONESIA'

function safe(str, fallback = '') {
  return str == null ? fallback : String(str)
}
function upper(str) { return safe(str).toUpperCase() }

// Logo raster dari settings (path /uploads/...). SVG tidak didukung PDFKit -> diabaikan.
function resolveUpload(uploadDir, value) {
  if (!value || !String(value).startsWith('/uploads/')) return null
  const full = path.resolve(uploadDir, path.basename(value))
  return full.startsWith(path.resolve(uploadDir)) && fs.existsSync(full) ? full : null
}

function drawHeader(doc, settings, logoPath) {
  const y = 50
  // Logo kemenag / lembaga kiri (placeholder bila tidak ada raster).
  doc.save().roundedRect(40, y, 54, 54, 6).stroke('#000')
  doc.fontSize(8).fillColor('#666').text('LOGO', 40, y + 22, { width: 54, align: 'center' })
  doc.restore()
  if (logoPath) { try { doc.image(logoPath, 40, y, { fit: [54, 54] }) } catch {} }
  doc.font('Helvetica-Bold').fillColor('#000')
  doc.fontSize(11).text(NAMA_INSTANSI, 100, y, { width: A4.w - 200, align: 'center' })
  doc.fontSize(16).fillColor('#166534').text(upper(settings.nama_lembaga || ''), 100, y + 18, { width: A4.w - 200, align: 'center' })
  const idLine = []
  if (settings.nsm) idLine.push(`NSM: ${settings.nsm}`)
  if (settings.npsn) idLine.push(`NPSN: ${settings.npsn}`)
  doc.fontSize(9).fillColor('#000').text(idLine.join('   |   '), 100, y + 40, { width: A4.w - 200, align: 'center' })
  if (settings.alamat) doc.fontSize(8).text(safe(settings.alamat), 100, y + 52, { width: A4.w - 200, align: 'center' })
  doc.moveTo(40, y + 68).lineTo(A4.w - 40, y + 68).lineWidth(1.5).stroke('#000')
  return y + 68
}

function drawSiswaInfo(doc, s, semester, tahunAjaran) {
  const y = 120
  doc.fontSize(9).fillColor('#000')
  doc.text(`Nama       : ${upper(safe(s.nama))}`, 40, y)
  doc.text(`NIS/NISN   : ${safe(s.nis)} / ${safe(s.nisn)}`, 40, y + 14)
  doc.text(`Kelas      : ${safe(s.rombel_tingkat || s.rombel_nama)}`, A4.w / 2, y)
  doc.text(`Semester   : ${safe(semester)} (${safe(tahunAjaran)})`, A4.w / 2, y + 14)
}

async function createRaporK13Pdf({ studentList, settings = {}, uploadDir }) {
  const list = Array.isArray(studentList) ? studentList : []
  if (!list.length) throw new Error('Tidak ada siswa untuk rapor')
  const doc = new PDFDocument({ size: [A4.w, A4.h], margin: 0, autoFirstPage: false })
  const chunks = []
  doc.on('data', c => chunks.push(c))
  const done = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject) })
  const logoPath = resolveUpload(uploadDir, settings.logo)

  for (const item of list) {
    const s = item.siswa || item
    const mapel = item.mapel || []
    const sikap = item.sikap || null
    const ketidakhadiran = item.ketidakhadiran || { sakit: 0, izin: 0, alpa: 0 }
    const rank = item.rank
    const totalSiswa = item.totalSiswa

    // ===== COVER =====
    doc.addPage({ size: [A4.w, A4.h], margin: 0 })
    doc.rect(30, 30, A4.w - 60, A4.h - 60).lineWidth(3).stroke('#000')
    doc.rect(34, 34, A4.w - 68, A4.h - 68).lineWidth(1).stroke('#000')
    if (logoPath) { try { doc.image(logoPath, A4.w / 2 - 30, 110, { fit: [60, 60] }) } catch {} }
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#000').text('RAPOR PESERTA DIDIK', 40, 185, { width: A4.w - 80, align: 'center' })
    doc.fontSize(14).text('MADRASAH TSANAWIYAH (MTs)', 40, 218, { width: A4.w - 80, align: 'center' })
    doc.fontSize(11).text('KURIKULUM 2013', 40, 240, { width: A4.w - 80, align: 'center' })
    doc.fontSize(11).fillColor('#fff')
    const namaBoxY = 290
    doc.rect(80, namaBoxY, A4.w - 160, 120).fillAndStroke('#111', '#000')
    doc.fillColor('#fff').fontSize(11).text('Nama Peserta Didik', 95, namaBoxY + 18)
    doc.fontSize(18).text(upper(safe(s.nama)), 95, namaBoxY + 40)
    doc.fontSize(11).text('NIS / NISN', 95, namaBoxY + 82)
    doc.fontSize(13).text(`${safe(s.nis)} / ${safe(s.nisn)}`, 95, namaBoxY + 98)
    doc.font('Helvetica-Bold').fillColor('#000').fontSize(16).text(upper(settings.nama_lembaga || ''), 40, 470, { width: A4.w - 80, align: 'center' })
    doc.fontSize(11).text(NAMA_INSTANSI, 40, 494, { width: A4.w - 80, align: 'center' })

    // ===== IDENTITAS =====
    doc.addPage({ size: [A4.w, A4.h], margin: 0 })
    drawHeader(doc, settings, logoPath)
    doc.fontSize(13).fillColor('#000').text('IDENTITAS PESERTA DIDIK', 40, 130, { width: A4.w - 80, align: 'center' })
    const biodata = [
      ['1.', 'Nama Lengkap', upper(safe(s.nama))],
      ['2.', 'NIS / NISN', `${safe(s.nis)} / ${safe(s.nisn)}`],
      ['3.', 'Tempat, Tanggal Lahir', `${safe(s.tempat_lahir)}, ${safe(s.tanggal_lahir)}`],
      ['4.', 'Jenis Kelamin', safe(s.jenis_kelamin)],
      ['5.', 'Agama', safe(s.agama || 'Islam')],
      ['6.', 'Status dalam Keluarga', safe(s.status_keluarga || 'Anak Kandung')],
      ['7.', 'Anak Ke', safe(s.anak_ke)],
      ['8.', 'Alamat Peserta Didik', safe(s.alamat)],
      ['9.', 'Nomor Telepon Rumah', safe(s.no_hp)],
      ['10.', 'Sekolah Asal (SD/MI)', safe(s.asal_sekolah)],
      ['11.', 'Nama Ayah', safe(s.nama_ayah || s.nama_ortu)],
      ['12.', 'Nama Ibu', safe(s.nama_ibu)],
      ['13.', 'Pekerjaan Ayah', safe(s.kerja_ayah)],
      ['14.', 'Pekerjaan Ibu', safe(s.kerja_ibu)],
      ['15.', 'Nama Wali', safe(s.nama_wali)],
      ['16.', 'Pekerjaan Wali', safe(s.kerja_wali)],
    ]
    let by = 160
    doc.fontSize(10).fillColor('#000')
    for (const [no, label, val] of biodata) {
      doc.font('Helvetica-Bold').text(`${no} ${label}`, 50, by, { width: 150 })
      doc.font('Helvetica').text(`:  ${upper(val || '-')}`, 205, by, { width: A4.w - 250 })
      by += 20
    }
    // Pas foto + TTD kepala.
    doc.rect(50, by + 10, 86, 113).stroke('#000')
    doc.fontSize(8).fillColor('#999').text('PAS FOTO\n3 x 4', 50, by + 50, { width: 86, align: 'center' })
    if (settings.logo && s.foto) { /* pas foto siswa bisa ditambahkan dari s.foto */ }
    doc.fontSize(10).fillColor('#000').text(`${safe(settings.kota_cetak)}, ${safe(item.tanggalRapor || '')}`, A4.w - 230, by + 10, { width: 190, align: 'center' })
    doc.text('Kepala Madrasah', A4.w - 230, by + 26, { width: 190, align: 'center' })
    doc.moveTo(A4.w - 200, by + 80).lineTo(A4.w - 40, by + 80).stroke('#000')
    doc.font('Helvetica-Bold').text(upper(safe(settings.kepala_sekolah)), A4.w - 230, by + 86, { width: 190, align: 'center', underline: true })

    // ===== NILAI =====
    doc.addPage({ size: [A4.w, A4.h], margin: 0 })
    drawHeader(doc, settings, logoPath)
    doc.fontSize(13).fillColor('#000').text('CAPAIAN HASIL BELAJAR', 40, 130, { width: A4.w - 80, align: 'center' })
    drawSiswaInfo(doc, s, item.semester || 'Ganjil', item.tahunAjaran || '')

    const tableTop = 165
    const colX = [40, 60, 330, 385, 430, 480]
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000')
    const th = ['No', 'Mata Pelajaran', 'KKM', 'Nilai', 'Huruf', 'Capaian']
    th.forEach((h, i) => doc.text(h, colX[i], tableTop, { width: i === 1 ? 260 : 55, align: i === 1 ? 'left' : 'center' }))
    doc.moveTo(40, tableTop + 18).lineTo(A4.w - 40, tableTop + 18).stroke('#000')
    let ty = tableTop + 22
    doc.font('Helvetica').fontSize(9)
    let total = 0
    mapel.forEach((m, i) => {
      total += Number(m.nilai || 0)
      doc.text(String(i + 1), colX[0], ty, { width: 20, align: 'center' })
      doc.text(safe(m.nama), colX[1], ty, { width: 260 })
      doc.text(String(m.kkm ?? 75), colX[2], ty, { width: 55, align: 'center' })
      doc.text(String(m.nilai ?? 0), colX[3], ty, { width: 55, align: 'center' })
      doc.font('Helvetica-Oblique').text(upper(terbilang(m.nilai)), colX[4], ty, { width: 90, align: 'center' }).font('Helvetica')
      doc.text(Number(m.nilai || 0) >= Number(m.kkm ?? 75) ? 'Tercapai' : 'Belum', colX[5], ty, { width: 80, align: 'center' })
      ty += 16
    })
    const rata = mapel.length ? total / mapel.length : 0
    doc.moveTo(40, ty).lineTo(A4.w - 40, ty).stroke('#000')
    ty += 4
    doc.font('Helvetica-Bold').text('JUMLAH', 165, ty, { width: 160, align: 'right' })
    doc.text(String(total), 385, ty, { width: 55, align: 'center' })
    ty += 16
    doc.text('RATA-RATA', 165, ty, { width: 160, align: 'right' })
    doc.text(rata.toFixed(1), 385, ty, { width: 55, align: 'center' })
    if (rank) doc.fontSize(8).fillColor('#b91c1c').text(`Peringkat: ${rank} dari ${totalSiswa} Siswa`, 430, ty, { width: 90, align: 'center' }).font('Helvetica-Bold').fontSize(9).fillColor('#000')
    ty += 22

    // Sikap
    doc.font('Helvetica-Bold').fontSize(10).text('PENILAIAN SIKAP WALI KELAS', 40, ty, { width: A4.w - 80, align: 'center' })
    ty += 18
    doc.font('Helvetica').fontSize(9)
    const aspek = [['Kelakuan', 'kelakuan'], ['Kerajinan', 'kerajinan'], ['Kerapian', 'kerapian'], ['Kebersihan', 'kebersihan'], ['Kedisiplinan', 'kedisiplinan'], ['Ketaatan', 'ketaatan']]
    aspek.forEach(([label, key], i) => {
      const col = i % 3
      const row = Math.floor(i / 3)
      const x = 40 + col * 180
      const y = ty + row * 20
      doc.text(label, x, y, { width: 90 })
      doc.font('Helvetica-Bold').text(nilaiKeAbjad(sikap?.[key]), x + 95, y, { width: 40, align: 'center' }).font('Helvetica')
    })
    ty += 2 * 20 + 14

    // Ekstrakurikuler + ketidakhadiran
    doc.text(`Ekstrakurikuler: ${safe(sikap?.ekstrakurikuler, '-')}`, 40, ty, { width: A4.w - 80 })
    ty += 16
    doc.text(`Sakit: ${ketidakhadiran.sakit} hari    Izin: ${ketidakhadiran.izin} hari    Tanpa Keterangan: ${ketidakhadiran.alpa} hari`, 40, ty, { width: A4.w - 80 })
    ty += 24

    // Catatan wali kelas
    doc.rect(40, ty, A4.w - 80, 40).stroke('#000')
    doc.text(`CATATAN WALI KELAS: ${safe(sikap?.catatan, 'Tingkatkan terus kedisiplinan dan semangat belajarmu.')}`, 46, ty + 8, { width: A4.w - 92 })
    ty += 56

    // TTD
    doc.font('Helvetica').fontSize(9).fillColor('#000')
    doc.text('Mengetahui,\nOrang Tua / Wali', 40, ty, { width: 160, align: 'center' })
    doc.text('Kepala Madrasah', A4.w / 2 - 80, ty, { width: 160, align: 'center' })
    doc.text(`Wali Kelas`, A4.w - 200, ty, { width: 160, align: 'center' })
    doc.moveTo(80, ty + 60).lineTo(160, ty + 60).stroke('#000')
    doc.moveTo(A4.w / 2 - 20, ty + 60).lineTo(A4.w / 2 + 20, ty + 60).lineTo(A4.w / 2, ty + 42).lineTo(A4.w / 2 - 20, ty + 60).stroke('#000').fill('#000')
    doc.moveTo(A4.w - 160, ty + 60).lineTo(A4.w / 2 + 120, ty + 60).stroke('#000')
    doc.font('Helvetica-Bold').fontSize(8)
    doc.text(upper(safe(item.waliKelas?.nama || item.waliKelas || '')) || '..............................', A4.w - 200, ty + 64, { width: 160, align: 'center', underline: true })
    doc.text(upper(safe(settings.kepala_sekolah)), A4.w / 2 - 100, ty + 64, { width: 200, align: 'center', underline: true })
  }

  doc.end()
  return done
}

// Legger nilai K-13: A4 landscape, grid per siswa (baris) x mapel (kolom),
// meniru legger.ejs rapor-app (18 mapel tetap di sana; di sini mapel dinamis).
async function createK13LedgerPdf({ ledger, settings = {}, rombelNama, semester, tahunAjaran }) {
  const mapel = Array.isArray(ledger?.mapel) ? ledger.mapel : []
  const rows = Array.isArray(ledger?.rows) ? ledger.rows : []
  const LAND = { w: 841.89, h: 595.28 }
  const doc = new PDFDocument({ size: [LAND.w, LAND.h], margin: 0, autoFirstPage: false })
  const chunks = []
  doc.on('data', c => chunks.push(c))
  const done = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject) })
  doc.addPage({ size: [LAND.w, LAND.h], margin: 0 })

  // Kop
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#000')
    .text('LEGGER HASIL BELAJAR PESERTA DIDIK', 30, 30, { width: LAND.w - 60, align: 'center' })
  doc.fontSize(11).text(`${upper(safe(settings.nama_lembaga))} - Tahun Ajaran ${safe(tahunAjaran)}`, 30, 50, { width: LAND.w - 60, align: 'center' })
  doc.font('Helvetica').fontSize(9)
    .text(`Kelas: ${safe(rombelNama)}    Semester: ${upper(safe(semester))}`, 30, 66, { width: LAND.w - 60, align: 'center' })

  // Tabel
  const colW = Math.min(40, (LAND.w - 60 - 130 - 50 - 50 - 20) / Math.max(1, mapel.length))
  const nameW = 130
  const startX = 30
  const startY = 86
  const rowH = 14
  let ty = startY

  // Header baris 1
  doc.font('Helvetica-Bold').fontSize(7.5)
  doc.text('Rank', startX, ty, { width: 30, align: 'center' })
  doc.text('Nama Peserta Didik', startX + 30, ty, { width: nameW, align: 'left' })
  const mapelStartX = startX + 30 + nameW
  let mx = mapelStartX
  for (const m of mapel) { doc.text(m.nama, mx, ty, { width: colW, align: 'center' }); mx += colW }
  doc.text('JML', mx, ty, { width: 50, align: 'center' })
  doc.text('RATA', mx + 50, ty, { width: 50, align: 'center' })
  ty += rowH
  doc.moveTo(startX, ty).lineTo(LAND.w - 30, ty).lineWidth(0.5).stroke('#000')

  doc.font('Helvetica').fontSize(7)
  for (const r of rows) {
    if (ty > LAND.h - 80) { doc.addPage({ size: [LAND.w, LAND.h], margin: 0 }); ty = 40 }
    doc.text(String(r.rank || ''), startX, ty + 3, { width: 30, align: 'center' })
    doc.font('Helvetica-Bold').text(safe(r.nama), startX + 30, ty + 3, { width: nameW, align: 'left', lineBreak: false }).font('Helvetica')
    mx = mapelStartX
    for (const m of mapel) { const v = r.nilai?.[m.id]; doc.text(v ? String(v) : '-', mx, ty + 3, { width: colW, align: 'center' }); mx += colW }
    doc.font('Helvetica-Bold').text(String(r.total || 0), mx, ty + 3, { width: 50, align: 'center' })
    doc.text((r.rata ?? 0).toFixed(1), mx + 50, ty + 3, { width: 50, align: 'center' }).font('Helvetica')
    doc.moveTo(startX, ty + rowH).lineTo(LAND.w - 30, ty + rowH).lineWidth(0.3).stroke('#000')
    ty += rowH
  }

  // TTD
  const tyy = Math.max(ty + 30, LAND.h - 100)
  doc.font('Helvetica').fontSize(9).fillColor('#000')
  doc.text('Kepala Madrasah,', startX, tyy, { width: 180, align: 'center' })
  doc.text(`${safe(settings.kota_cetak)}, ${safe(tahunAjaran)}`, LAND.w - 30 - 180, tyy, { width: 180, align: 'center' })
  doc.text('Wali Kelas,', LAND.w - 30 - 180, tyy + 18, { width: 180, align: 'center' })
  doc.moveTo(startX + 40, tyy + 55).lineTo(startX + 140, tyy + 55).stroke('#000')
  doc.moveTo(LAND.w - 170, tyy + 55).lineTo(LAND.w - 70, tyy + 55).stroke('#000')
  doc.font('Helvetica-Bold').fontSize(8)
  doc.text(upper(safe(settings.kepala_sekolah)), startX, tyy + 58, { width: 180, align: 'center', underline: true })

  doc.end()
  return done
}

module.exports = { createRaporK13Pdf, createK13LedgerPdf }