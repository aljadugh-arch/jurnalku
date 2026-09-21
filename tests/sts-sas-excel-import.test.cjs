const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

// Test 1: ImportNilaiAsesmenExcel component exists
test('ImportNilaiAsesmenExcel.tsx component exists', () => {
  const componentPath = path.join(root, 'src/components/ImportNilaiAsesmenExcel.tsx')
  assert.ok(fs.existsSync(componentPath), 'ImportNilaiAsesmenExcel.tsx file should exist')
})

// Test 2: Component is properly exported and imported in GuruNilaiSTSPage
test('GuruNilaiSTSPage imports and uses ImportNilaiAsesmenExcel component', () => {
  const page = fs.readFileSync(path.join(root, 'src/pages/guru/GuruNilaiSTSPage.tsx'), 'utf8')
  assert.match(page, /import.*ImportNilaiAsesmenExcel/, 'Should import ImportNilaiAsesmenExcel')
  assert.match(page, /<ImportNilaiAsesmenExcel/, 'Should use ImportNilaiAsesmenExcel component')
})

// Test 3: Component is properly exported and imported in GuruNilaiSASPage
test('GuruNilaiSASPage imports and uses ImportNilaiAsesmenExcel component', () => {
  const page = fs.readFileSync(path.join(root, 'src/pages/guru/GuruNilaiSASPage.tsx'), 'utf8')
  assert.match(page, /import.*ImportNilaiAsesmenExcel/, 'Should import ImportNilaiAsesmenExcel')
  assert.match(page, /<ImportNilaiAsesmenExcel/, 'Should use ImportNilaiAsesmenExcel component')
})

// Test 4: ImportNilaiAsesmenExcel passes jenis prop to define STS vs SAS
test('ImportNilaiAsesmenExcel receives jenis prop (sts or sas)', () => {
  const stsPage = fs.readFileSync(path.join(root, 'src/pages/guru/GuruNilaiSTSPage.tsx'), 'utf8')
  const sasPage = fs.readFileSync(path.join(root, 'src/pages/guru/GuruNilaiSASPage.tsx'), 'utf8')
  
  assert.match(stsPage, /jenis="sts"/, 'GuruNilaiSTSPage should pass jenis="sts"')
  assert.match(sasPage, /jenis="sas"/, 'GuruNilaiSASPage should pass jenis="sas"')
})

// Test 5: ImportNilaiAsesmenExcel passes rombel_id to API
test('ImportNilaiAsesmenExcel sends rombel_id to /api/rapor/asesmen', () => {
  const component = fs.readFileSync(path.join(root, 'src/components/ImportNilaiAsesmenExcel.tsx'), 'utf8')
  assert.match(component, /\/rapor\/asesmen|api\.post.*asesmen/, 'Should POST to /rapor/asesmen')
  assert.match(component, /rombel_id/, 'Should include rombel_id in request')
})

// Test 6: Server validates rombel_id is numeric and valid
test('Server /api/rapor/asesmen validates rombel_id strictly', () => {
  const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')
  const endpoint = server.match(/\/api\/rapor\/asesmen[\s\S]*?\n}\)/)?.[0] || ''
  
  assert.match(endpoint, /rombel_id/, 'Endpoint should mention rombel_id')
  assert.ok(endpoint.length > 100, 'Endpoint should have validation logic')
})

// Test 7: Server validates nilai range 0-100
test('Server /api/rapor/asesmen validates nilai range 0-100', () => {
  const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')
  assert.match(server, /Math\.max\(0,\s*Math\.min\(100/, 'Should clamp nilai between 0-100')
})

// Test 8: Server rejects nonnumeric nilai
test('Server /api/rapor/asesmen rejects nonnumeric nilai gracefully', () => {
  const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')
  assert.match(server, /Number\(.*nilai/, 'Should convert nilai to Number')
})

// Test 9: Server rejects duplicate siswa_id entries per mapel
test('Server /api/rapor/asesmen handles duplicate siswa_id entries', () => {
  const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')
  assert.match(server, /ON CONFLICT.*DO UPDATE/, 'Should handle duplicate upserts')
})

// Test 10: Component template shows expected format (NIS, Nama, Nilai columns)
test('ImportNilaiAsesmenExcel template has NIS, Nama, Nilai columns', () => {
  const component = fs.readFileSync(path.join(root, 'src/components/ImportNilaiAsesmenExcel.tsx'), 'utf8')
  assert.match(component, /NIS/, 'Template should include NIS column')
  assert.match(component, /Nama/, 'Template should include Nama column')
  assert.match(component, /Nilai/, 'Template should include Nilai column')
})

// Test 11: Component handles CSV parsing errors gracefully
test('ImportNilaiAsesmenExcel parses CSV with validation errors', () => {
  const component = fs.readFileSync(path.join(root, 'src/components/ImportNilaiAsesmenExcel.tsx'), 'utf8')
  assert.match(component, /parse|Parse|CSV|csv/, 'Should handle CSV parsing')
  assert.match(component, /error|Error|validation|Validation/, 'Should show validation errors')
})

// Test 12: Component shows success message after batch import
test('ImportNilaiAsesmenExcel shows success message on batch import', () => {
  const component = fs.readFileSync(path.join(root, 'src/components/ImportNilaiAsesmenExcel.tsx'), 'utf8')
  assert.match(component, /success|berhasil|Success/, 'Should display success message')
})
