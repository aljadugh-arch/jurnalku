const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')
const cashless = fs.readFileSync(path.join(root, 'server/portal-cashless.cjs'), 'utf8')
const kantinPage = fs.readFileSync(path.join(root, 'src/pages/siswa/SiswaKantinPage.tsx'), 'utf8')

const routeBlock = (source, signature) => {
  const start = source.indexOf(signature)
  assert.ok(start >= 0, `route ${signature} must exist`)
  const end = source.indexOf('\n  app.', start + signature.length)
  return source.slice(start, end > start ? end : source.length)
}

test('student assessment selector is imported by the server route', () => {
  assert.match(server, /const \{[^\n]*selectPenilaianStudentId[^\n]*\} = require\('\.\/portal-cashless\.cjs'\)/)
})

test('deleting an activity only deletes attendance in the current tenant', () => {
  const block = routeBlock(server, "app.delete('/api/kegiatan-khusus/:id'")
  assert.match(block, /DELETE FROM absensi_kegiatan WHERE kegiatan_id = \? AND tenant_id = \?'/)
  assert.match(block, /run\(req\.params\.id, req\.tenantId\)/)
})

test('assignment writes require an explicit teacher role', () => {
  assert.match(server, /const TEACHER = requireRole\([^\n]*'guru'[^\n]*'wali_kelas'[^\n]*\)/)
  assert.match(server, /app\.post\('\/api\/guru\/tugas', TEACHER,/)
  assert.match(server, /app\.delete\('\/api\/guru\/tugas\/:id', TEACHER,/)
})

test('cafeteria orders authorize student and parent ownership before mutation', () => {
  const block = routeBlock(cashless, "app.post('/api/kantin/orders'")
  assert.match(block, /linkedStudentIds\(db, req\.tenantId, req\.user\.id\)/)
  assert.match(block, /\['siswa', 'wali_murid'\]\.includes\(req\.user\.role\)/)
  assert.match(block, /status\(403\)/)
  assert.ok(block.indexOf('status(403)') < block.indexOf("INSERT INTO kantin_orders"), 'ownership guard must run before order mutation')
})

test('student cafeteria page uses Axios-relative existing routes and sends linked student id', () => {
  assert.doesNotMatch(kantinPage, /api\.(?:get|post)\(['"]\/api\//)
  assert.match(kantinPage, /api\.get(?:<[^\n]+>)?\(['"]\/portal\/children['"]\)/)
  assert.match(kantinPage, /api\.get\(`\/portal\/summary\?student_id=/)
  assert.match(kantinPage, /api\.post\(['"]\/kantin\/orders['"], \{ student_id:/)
})

test('student schedule resolution and joins are tenant scoped', () => {
  const block = routeBlock(server, "app.get('/api/siswa/jadwal'")
  assert.match(block, /selectLinkedStudent\(req\)/)
  assert.match(block, /siswa WHERE id = \? AND tenant_id = \?/)
  assert.match(block, /WHERE j\.rombel_id = \? AND j\.tenant_id = \?/)
  assert.match(block, /m\.tenant_id = j\.tenant_id/)
  assert.match(block, /g\.tenant_id = j\.tenant_id/)
})
