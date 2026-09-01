const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ExcelJS = require('exceljs')
const { exportFinance, financeExportFilename } = require('../server/finance-excel.cjs')

const root = path.join(__dirname, '..')
const attendance = fs.readFileSync(path.join(root, 'src/pages/admin/RekapAbsensiPage.tsx'), 'utf8')
const jamaah = fs.readFileSync(path.join(root, 'src/pages/admin/AbsensiJamaahPage.tsx'), 'utf8')
const financePanel = fs.readFileSync(path.join(root, 'src/components/FinanceExcelPanel.tsx'), 'utf8')

function fakeFinanceDb(settingsByTenant) {
  return {
    prepare(sql) {
      if (/FROM settings/.test(sql)) return { get: tenant => settingsByTenant[tenant] }
      if (/FROM tenants/.test(sql)) return { get: tenant => ({ nama: settingsByTenant[tenant]?.nama_lembaga || tenant }) }
      return { all: () => [] }
    },
  }
}

test('rekap absensi tidak memuat identitas MTs Plus secara hardcoded dan memakai settings tenant', () => {
  assert.doesNotMatch(attendance, /MADRASAH TSANAWIYAH PLUS SUNAN DRAJAT 7 PALANG/)
  assert.match(attendance, /useSettingsStore/)
  assert.match(attendance, /tenantIdentity\(settings\)/)
  assert.match(attendance, /tenantExportFilename/)

  assert.doesNotMatch(jamaah, /MADRASAH TSANAWIYAH PLUS SUNAN DRAJAT 7 PALANG/)
  assert.match(jamaah, /useSettingsStore/)
  assert.match(jamaah, /tenantExportFilename/)
})

test('nama file dan isi workbook keuangan terisolasi untuk dua tenant', async () => {
  const db = fakeFinanceDb({
    mimifdangimbang: { nama_lembaga: 'MI Mifda Ngimbang', alamat: 'Ngimbang', logo: '/uploads/mifda.jpg' },
    mtsplussd7: { nama_lembaga: 'MTs Plus Sunan Drajat 7 Palang', alamat: 'Palang', logo: '/uploads/mts.jpg' },
  })

  assert.equal(financeExportFilename('MI Mifda Ngimbang', '2026-09-01'), 'Rekap_Keuangan_MI_Mifda_Ngimbang_2026-09-01.xlsx')
  assert.equal(financeExportFilename('MTs Plus Sunan Drajat 7 Palang', '2026-09-01'), 'Rekap_Keuangan_MTs_Plus_Sunan_Drajat_7_Palang_2026-09-01.xlsx')

  const mifdaWorkbook = new ExcelJS.Workbook()
  await mifdaWorkbook.xlsx.load(await exportFinance(db, 'mimifdangimbang'))
  assert.equal(mifdaWorkbook.creator, 'MI Mifda Ngimbang')
  assert.equal(mifdaWorkbook.company, 'MI Mifda Ngimbang')
  assert.equal(mifdaWorkbook.getWorksheet('Ringkasan').getCell('A2').value, 'MI Mifda Ngimbang')
  assert.equal(mifdaWorkbook.getWorksheet('Ringkasan').getCell('A3').value, 'Ngimbang')
  assert.doesNotMatch(JSON.stringify(mifdaWorkbook.getWorksheet('Ringkasan').getSheetValues()), /Sunan Drajat/)

  const mtsWorkbook = new ExcelJS.Workbook()
  await mtsWorkbook.xlsx.load(await exportFinance(db, 'mtsplussd7'))
  assert.equal(mtsWorkbook.getWorksheet('Ringkasan').getCell('A2').value, 'MTs Plus Sunan Drajat 7 Palang')
  assert.doesNotMatch(JSON.stringify(mtsWorkbook.getWorksheet('Ringkasan').getSheetValues()), /Mifda/)
})

test('panel keuangan menyediakan Excel dan PDF bernama tenant tanpa fallback bendahara.xlsx', () => {
  assert.match(financePanel, /useSettingsStore/)
  assert.match(financePanel, /Ekspor PDF/)
  assert.match(financePanel, /tenantExportFilename/)
  assert.doesNotMatch(financePanel, /a\.download='bendahara\.xlsx'/)
})

test('ekspor keuangan server mengambil identitas berdasarkan tenant id aktif', () => {
  const server = fs.readFileSync(path.join(root, 'server/finance-excel.cjs'), 'utf8')
  assert.match(server, /FROM settings WHERE tenant_id=\?/)
  assert.match(server, /exportFinance\(db, req\.tenantId\)/)
  assert.match(server, /financeExportFilename/)
})
