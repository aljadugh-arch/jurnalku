const ExcelJS = require('exceljs')

function normalizeLedgerJenis(jenis) {
  return ['rapor_sts', 'rapor_sas', 'semua'].includes(jenis) ? jenis : 'semua'
}

function getAuthorizedLedgerRombels(db, options) {
  const { tenantId, role, gtkId } = options
  if (role === 'wali_kelas') {
    if (!gtkId) return []
    return db.prepare(`SELECT id, nama, tahun_ajaran FROM rombel
      WHERE tenant_id=? AND wali_kelas_id=? ORDER BY nama`).all(tenantId, gtkId)
  }
  if (!['admin', 'super_admin'].includes(role)) return []
  return db.prepare(`SELECT id, nama, tahun_ajaran FROM rombel
    WHERE tenant_id=? ORDER BY nama`).all(tenantId)
}

function getLedgerRows(db, options) {
  const {
    tenantId, rombelId, tahunAjaran, semester, from, to,
  } = options
  const jenis = normalizeLedgerJenis(options.jenis)
  const includeSts = jenis !== 'rapor_sas'
  const includeSas = jenis !== 'rapor_sts'

  return db.prepare(`
    WITH candidates AS (
      SELECT ph.siswa_id, ph.mapel_id
      FROM penilaian_harian ph
      JOIN siswa s ON s.id=ph.siswa_id AND s.tenant_id=ph.tenant_id
      JOIN mapel m ON m.id=ph.mapel_id AND m.tenant_id=ph.tenant_id
      WHERE s.rombel_id=? AND ph.tenant_id=? AND ph.tanggal BETWEEN ? AND ?
      UNION
      SELECT r.siswa_id, r.mapel_id
      FROM rapor r
      JOIN siswa s ON s.id=r.siswa_id AND s.tenant_id=r.tenant_id
      JOIN mapel m ON m.id=r.mapel_id AND m.tenant_id=r.tenant_id
      WHERE s.rombel_id=? AND r.tenant_id=? AND r.tahun_ajaran=? AND r.semester=?
        AND r.jenis IN (${includeSts && includeSas ? "'sts','sas','rapor_sts','rapor_sas'" : includeSts ? "'sts','rapor_sts'" : "'sas','rapor_sas'"})
    ),
    daily AS (
      SELECT ph.siswa_id, ph.mapel_id,
        AVG(ph.pengetahuan*0.5 + ph.keaktifan*0.3 + ph.sikap*0.2) AS nilai_harian
      FROM penilaian_harian ph
      JOIN siswa s ON s.id=ph.siswa_id AND s.tenant_id=ph.tenant_id
      WHERE s.rombel_id=? AND ph.tenant_id=? AND ph.tanggal BETWEEN ? AND ?
      GROUP BY ph.siswa_id, ph.mapel_id
    ),
    report_values AS (
      SELECT r.siswa_id, r.mapel_id,
        ${includeSts ? "MAX(CASE WHEN r.jenis='sts' THEN r.nilai_sts END)" : 'NULL'} AS nilai_sts,
        ${includeSas ? "MAX(CASE WHEN r.jenis='sas' THEN r.nilai_sts END)" : 'NULL'} AS nilai_sas,
        ${includeSts ? "MAX(CASE WHEN r.jenis='rapor_sts' THEN r.nilai_akhir END)" : 'NULL'} AS nilai_akhir_sts,
        ${includeSas ? "MAX(CASE WHEN r.jenis='rapor_sas' THEN r.nilai_akhir END)" : 'NULL'} AS nilai_akhir_sas
      FROM rapor r
      JOIN siswa s ON s.id=r.siswa_id AND s.tenant_id=r.tenant_id
      WHERE s.rombel_id=? AND r.tenant_id=? AND r.tahun_ajaran=? AND r.semester=?
      GROUP BY r.siswa_id, r.mapel_id
    )
    SELECT s.id AS siswa_id, s.nama AS siswa_nama, s.nis AS siswa_nis,
      m.id AS mapel_id, m.nama AS mapel_nama,
      CASE WHEN d.nilai_harian IS NULL THEN 0 ELSE ROUND(d.nilai_harian) END AS nilai_harian,
      rv.nilai_sts, rv.nilai_sas, rv.nilai_akhir_sts, rv.nilai_akhir_sas
    FROM candidates c
    JOIN siswa s ON s.id=c.siswa_id AND s.tenant_id=? AND s.rombel_id=?
    JOIN mapel m ON m.id=c.mapel_id AND m.tenant_id=?
    LEFT JOIN daily d ON d.siswa_id=c.siswa_id AND d.mapel_id=c.mapel_id
    LEFT JOIN report_values rv ON rv.siswa_id=c.siswa_id AND rv.mapel_id=c.mapel_id
    ORDER BY s.nama, m.nama
  `).all(
    rombelId, tenantId, from, to,
    rombelId, tenantId, tahunAjaran, semester,
    rombelId, tenantId, from, to,
    rombelId, tenantId, tahunAjaran, semester,
    tenantId, rombelId, tenantId,
  ).map(row => ({
    ...row,
    nilai_harian: Number(row.nilai_harian),
  }))
}

function createLedgerWorkbook(rows, details) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Ledger')
  worksheet.columns = [
    { header: 'No', key: 'no', width: 5 },
    { header: 'NIS', key: 'siswa_nis', width: 12 },
    { header: 'Nama Siswa', key: 'siswa_nama', width: 25 },
    { header: 'Mapel', key: 'mapel_nama', width: 20 },
    { header: 'Nilai Harian', key: 'nilai_harian', width: 12 },
    { header: 'Nilai STS', key: 'nilai_sts', width: 12 },
    { header: 'Nilai SAS', key: 'nilai_sas', width: 12 },
    { header: 'Nilai Akhir STS', key: 'nilai_akhir_sts', width: 15 },
    { header: 'Nilai Akhir SAS', key: 'nilai_akhir_sas', width: 15 },
  ]
  const titleRow = worksheet.insertRow(1, [])
  titleRow.getCell(1).value = `Ledger Nilai - ${details.rombelNama} - ${details.tahunAjaran} ${details.semester}`
  titleRow.font = { bold: true, size: 14 }
  worksheet.mergeCells(1, 1, 1, 9)
  worksheet.insertRow(2, [])
  rows.forEach((row, index) => worksheet.addRow({ no: index + 1, ...row }))
  const headerRow = worksheet.getRow(3)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } }
  worksheet.views = [{ state: 'frozen', ySplit: 3 }]
  return workbook
}

module.exports = { normalizeLedgerJenis, getAuthorizedLedgerRombels, getLedgerRows, createLedgerWorkbook }
