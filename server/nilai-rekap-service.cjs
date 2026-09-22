const ExcelJS = require('exceljs')
const PDFDocument = require('pdfkit')

// Konteks mapel+rombel yang diajar seorang guru (dari tabel pengajar, fallback jadwal).
function getTeacherMapelRombelContext(db, options) {
  const { tenantId, gtkId } = options
  if (!gtkId) return []
  return db.prepare(`
    SELECT DISTINCT m.id AS mapel_id, m.nama AS mapel_nama,
      rb.id AS rombel_id, rb.nama AS rombel_nama, rb.tahun_ajaran
    FROM pengajar p
    JOIN mapel m ON m.id = p.mapel_id AND m.tenant_id = p.tenant_id
    JOIN rombel rb ON rb.id = p.rombel_id AND rb.tenant_id = p.tenant_id
    WHERE p.gtk_id = ? AND p.tenant_id = ?
    UNION
    SELECT DISTINCT m.id AS mapel_id, m.nama AS mapel_nama,
      rb.id AS rombel_id, rb.nama AS rombel_nama, rb.tahun_ajaran
    FROM jadwal j
    JOIN mapel m ON m.id = j.mapel_id AND m.tenant_id = j.tenant_id
    JOIN rombel rb ON rb.id = j.rombel_id AND rb.tenant_id = j.tenant_id
    WHERE j.gtk_id = ? AND j.tenant_id = ?
    ORDER BY rombel_nama, mapel_nama
  `).all(gtkId, tenantId, gtkId, tenantId)
}

// Daftar guru (gtk) yang punya minimal satu penugasan mengajar — untuk admin memilih guru.
function getGuruWithAssignments(db, tenantId) {
  return db.prepare(`
    SELECT DISTINCT g.id, g.nama, g.kode_guru
    FROM gtk g
    WHERE g.tenant_id = ? AND (
      EXISTS (SELECT 1 FROM pengajar p WHERE p.gtk_id = g.id AND p.tenant_id = g.tenant_id)
      OR EXISTS (SELECT 1 FROM jadwal j WHERE j.gtk_id = g.id AND j.tenant_id = g.tenant_id)
    )
    ORDER BY g.nama
  `).all(tenantId)
}

function isTeacherAssignedToPair(db, options) {
  const { tenantId, gtkId, mapelId, rombelId } = options
  return !!db.prepare(`SELECT 1 FROM pengajar WHERE gtk_id=? AND mapel_id=? AND rombel_id=? AND tenant_id=?`)
    .get(gtkId, mapelId, rombelId, tenantId)
    || !!db.prepare(`SELECT 1 FROM jadwal WHERE gtk_id=? AND mapel_id=? AND rombel_id=? AND tenant_id=?`)
    .get(gtkId, mapelId, rombelId, tenantId)
}

function normalizeRekapJenis(jenis) {
  return ['harian', 'sts', 'sas', 'semua'].includes(jenis) ? jenis : 'semua'
}

// Baris rekap per-siswa untuk satu mapel+rombel yang diajar guru tertentu.
function getRekapNilaiRows(db, options) {
  const { tenantId, rombelId, mapelId, tahunAjaran, semester, from, to } = options
  const jenis = normalizeRekapJenis(options.jenis)
  const includeHarian = jenis === 'harian' || jenis === 'semua'
  const includeSts = jenis === 'sts' || jenis === 'semua'
  const includeSas = jenis === 'sas' || jenis === 'semua'

  const rows = db.prepare(`
    SELECT s.id AS siswa_id, s.nama AS siswa_nama, s.nis AS siswa_nis,
      d.nilai_harian AS nilai_harian_raw,
      d.jumlah AS jumlah_harian,
      rv.nilai_sts, rv.nilai_sas
    FROM siswa s
    LEFT JOIN (
      SELECT siswa_id,
        AVG(pengetahuan*0.5 + keaktifan*0.3 + sikap*0.2) AS nilai_harian,
        COUNT(*) AS jumlah
      FROM penilaian_harian
      WHERE mapel_id=? AND tenant_id=? AND tanggal BETWEEN ? AND ?
      GROUP BY siswa_id
    ) d ON d.siswa_id = s.id
    LEFT JOIN (
      SELECT siswa_id,
        MAX(CASE WHEN jenis='sts' THEN nilai_sts END) AS nilai_sts,
        MAX(CASE WHEN jenis='sas' THEN nilai_sts END) AS nilai_sas
      FROM rapor
      WHERE mapel_id=? AND tenant_id=? AND tahun_ajaran=? AND semester=?
      GROUP BY siswa_id
    ) rv ON rv.siswa_id = s.id
    WHERE s.rombel_id=? AND s.tenant_id=?
    ORDER BY s.nama
  `).all(
    mapelId, tenantId, from, to,
    mapelId, tenantId, tahunAjaran, semester,
    rombelId, tenantId,
  )

  return rows.map(row => ({
    siswa_id: row.siswa_id,
    siswa_nama: row.siswa_nama,
    siswa_nis: row.siswa_nis,
    nilai_harian: includeHarian ? (row.jumlah_harian ? Math.round(Number(row.nilai_harian_raw)) : 0) : null,
    nilai_sts: includeSts ? (row.nilai_sts == null ? null : Number(row.nilai_sts)) : null,
    nilai_sas: includeSas ? (row.nilai_sas == null ? null : Number(row.nilai_sas)) : null,
  }))
}

function rekapColumns(jenis) {
  const cols = [
    { header: 'No', key: 'no', width: 5 },
    { header: 'NIS', key: 'siswa_nis', width: 12 },
    { header: 'Nama Siswa', key: 'siswa_nama', width: 28 },
  ]
  if (jenis === 'harian' || jenis === 'semua') cols.push({ header: 'Nilai Harian', key: 'nilai_harian', width: 14 })
  if (jenis === 'sts' || jenis === 'semua') cols.push({ header: 'Nilai STS', key: 'nilai_sts', width: 14 })
  if (jenis === 'sas' || jenis === 'semua') cols.push({ header: 'Nilai SAS', key: 'nilai_sas', width: 14 })
  return cols
}

function createRekapWorkbook(rows, details) {
  const jenis = normalizeRekapJenis(details.jenis)
  const columns = rekapColumns(jenis)
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Rekap Nilai')
  worksheet.columns = columns

  const titleRow = worksheet.insertRow(1, [])
  titleRow.getCell(1).value = `Rekap Nilai - ${details.mapelNama} - ${details.rombelNama} - ${details.tahunAjaran} ${details.semester}`
  titleRow.font = { bold: true, size: 14 }
  worksheet.mergeCells(1, 1, 1, columns.length)

  const subtitleRow = worksheet.insertRow(2, [])
  subtitleRow.getCell(1).value = `Guru: ${details.guruNama || '-'}`
  subtitleRow.font = { italic: true, size: 10 }
  worksheet.mergeCells(2, 1, 2, columns.length)

  worksheet.insertRow(3, [])
  rows.forEach((row, index) => worksheet.addRow({ no: index + 1, ...row }))

  const headerRow = worksheet.getRow(4)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } }
  worksheet.views = [{ state: 'frozen', ySplit: 4 }]
  return workbook
}

function createRekapPdf(rows, details) {
  const jenis = normalizeRekapJenis(details.jenis)
  const columns = rekapColumns(jenis).filter(c => c.key !== 'no' || true)
  const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' })

  doc.fontSize(14).font('Helvetica-Bold')
    .text(`Rekap Nilai - ${details.mapelNama} - ${details.rombelNama}`, { align: 'center' })
  doc.fontSize(10).font('Helvetica')
    .text(`${details.tahunAjaran} - Semester ${details.semester === 'ganjil' ? 'Ganjil' : 'Genap'}`, { align: 'center' })
  doc.text(`Guru: ${details.guruNama || '-'}`, { align: 'center' })
  doc.moveDown(1)

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const colWidths = {
    no: pageWidth * 0.06,
    siswa_nis: pageWidth * 0.14,
    siswa_nama: pageWidth * 0.36,
    nilai_harian: pageWidth * 0.14,
    nilai_sts: pageWidth * 0.14,
    nilai_sas: pageWidth * 0.16,
  }
  const headerLabel = { no: 'No', siswa_nis: 'NIS', siswa_nama: 'Nama Siswa', nilai_harian: 'Nilai Harian', nilai_sts: 'Nilai STS', nilai_sas: 'Nilai SAS' }
  const allCols = ['no', 'siswa_nis', 'siswa_nama', ...columns.filter(c => c.key !== 'no' && c.key !== 'siswa_nis' && c.key !== 'siswa_nama').map(c => c.key)]

  const rowHeight = 20
  const startX = doc.page.margins.left
  let y = doc.y

  function drawRow(cells, isHeader) {
    let x = startX
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
    if (isHeader) {
      doc.rect(startX, y, pageWidth, rowHeight).fill('#D3D3D3').fillColor('black')
    }
    for (const key of allCols) {
      const w = colWidths[key]
      doc.fillColor('black').text(String(cells[key] ?? ''), x + 3, y + 5, { width: w - 6, align: key === 'siswa_nama' ? 'left' : 'center' })
      x += w
    }
    doc.rect(startX, y, pageWidth, rowHeight).stroke()
    y += rowHeight
  }

  drawRow(headerLabel, true)
  rows.forEach((row, index) => {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage({ size: 'A4', margin: 40, layout: 'landscape' })
      y = doc.page.margins.top
      drawRow(headerLabel, true)
    }
    drawRow({
      no: index + 1,
      siswa_nis: row.siswa_nis,
      siswa_nama: row.siswa_nama,
      nilai_harian: row.nilai_harian == null ? '-' : row.nilai_harian,
      nilai_sts: row.nilai_sts == null ? '-' : row.nilai_sts,
      nilai_sas: row.nilai_sas == null ? '-' : row.nilai_sas,
    }, false)
  })

  return doc
}

module.exports = {
  normalizeRekapJenis,
  getTeacherMapelRombelContext,
  getGuruWithAssignments,
  isTeacherAssignedToPair,
  getRekapNilaiRows,
  createRekapWorkbook,
  createRekapPdf,
}
