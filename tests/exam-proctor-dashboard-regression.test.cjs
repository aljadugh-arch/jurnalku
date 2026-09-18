const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const serverPath = path.join(root, 'server/index.cjs')
const server = fs.readFileSync(serverPath, 'utf8')
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
const menu = fs.readFileSync(path.join(root, 'src/lib/menuItems.tsx'), 'utf8')
const roles = fs.readFileSync(path.join(root, 'src/lib/roles.ts'), 'utf8')
const types = fs.readFileSync(path.join(root, 'src/types/index.ts'), 'utf8')
const usersPage = fs.readFileSync(path.join(root, 'src/pages/admin/UserManagementPage.tsx'), 'utf8')

const loadExamHelpers = () => require(path.join(root, 'server/exam-proctor.cjs'))

test('RED: role Proktor tersedia end-to-end tanpa mendapat akses CRUD soal', () => {
  assert.match(types, /'proktor'/)
  assert.match(roles, /proktor:\s*['"]Proktor['"]/) 
  assert.match(usersPage, /value:\s*['"]proktor['"]/)
  assert.match(server, /ASSIGNABLE_ROLES[^\n]*['"]proktor['"]/)
  assert.match(server, /const PROCTOR\s*=\s*requireRole\([^\n]*['"]proktor['"]/) 
  assert.doesNotMatch(server, /const STAFF\s*=\s*requireRole\([^\n]*['"]proktor['"]/, 'Proktor tidak boleh masuk role CRUD umum')
})

test('RED: schema menyimpan penugasan proktor dan audit aksi secara tenant-scoped', () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS ujian_proktor_assignments/)
  assert.match(server, /UNIQUE\s*\(tenant_id,\s*paket_id,\s*user_id,\s*rombel_id\)/)
  assert.match(server, /CREATE TABLE IF NOT EXISTS ujian_proktor_audit/)
  assert.match(server, /actor_id TEXT NOT NULL/)
  assert.match(server, /action TEXT NOT NULL/)
})

test('RED: admin dapat mengelola assignment dan proktor hanya memonitor assignment sendiri', () => {
  assert.match(server, /app\.get\('\/api\/ujian\/proktor\/assignments', ADMIN/)
  assert.match(server, /app\.put\('\/api\/ujian\/:paketId\/proktor\/assignments', ADMIN/)
  assert.match(server, /app\.get\('\/api\/ujian\/:paketId\/monitor', PROCTOR/)
  assert.match(server, /function canMonitorExam/)
  assert.match(server, /req\.user\?\.role === 'proktor'/)
})

test('RED: halaman siswa mengirim heartbeat periodik agar status monitor nyata', () => {
  const siswaUjian = fs.readFileSync(path.join(root, 'src/pages/siswa/SiswaUjianPage.tsx'), 'utf8')
  assert.match(siswaUjian, /\/ujian\/.*\/heartbeat/)
  assert.match(siswaUjian, /setInterval\(sendHeartbeat/)
  assert.match(siswaUjian, /current_question_id/)
})

test('RED: setiap tindakan proktor mewajibkan alasan dan mencatatnya di audit', () => {
  assert.match(server, /function proctorAudit/)
  assert.match(server, /ujian_proktor_audit/)
  assert.match(server, /action TEXT NOT NULL/)
})

test('RED: monitoring menyediakan status, progress, heartbeat, dan tindakan proktor terbatas', () => {
  assert.match(server, /last_seen_at/)
  assert.match(server, /extra_time_minutes/)
  assert.match(server, /answered_count/)
  assert.match(server, /app\.post\('\/api\/ujian\/:paketId\/heartbeat'/)
  assert.match(server, /app\.post\('\/api\/ujian\/:paketId\/proktor\/:siswaId\/(force-submit|tambah-waktu)'/)
  assert.match(server, /app\.post\('\/api\/ujian\/:paketId\/proktor\/:siswaId\/tambah-waktu'/)
})

test('RED: frontend memiliki route dan menu dashboard Proktor khusus', () => {
  assert.match(app, /ProktorDashboardPage/)
  assert.match(app, /path=['"]\/proktor['"]/)
  assert.match(app, /allowedRoles=\{\[['"]proktor['"],?\]\}/)
  assert.match(menu, /proktorMenuItems/)
  assert.match(menu, /Monitor Ujian/)
  assert.ok(fs.existsSync(path.join(root, 'src/pages/proktor/ProktorDashboardPage.tsx')))
})

test('status monitoring ditentukan dengan clock server secara deterministik', () => {
  const { monitorStatus } = loadExamHelpers()
  const now = new Date('2026-09-18T10:00:00.000Z')
  assert.equal(monitorStatus({ sessionStatus: null, lastSeenAt: null, now }), 'belum')
  assert.equal(monitorStatus({ sessionStatus: 'selesai', lastSeenAt: null, now }), 'selesai')
  assert.equal(monitorStatus({ sessionStatus: 'mengerjakan', lastSeenAt: '2026-09-18T09:59:45.000Z', now }), 'online')
  assert.equal(monitorStatus({ sessionStatus: 'mengerjakan', lastSeenAt: '2026-09-18T09:59:00.000Z', now }), 'stale')
  assert.equal(monitorStatus({ sessionStatus: 'mengerjakan', lastSeenAt: '2026-09-18T09:57:00.000Z', now }), 'offline')
})

test('payload paket untuk proktor tidak membocorkan password atau kunci', () => {
  const { sanitizeExamForMonitor } = loadExamHelpers()
  const safe = sanitizeExamForMonitor({
    id: 'p1', nama: 'STS', password: 'RAHASIA', token: 'ABC123',
    kunci_jawaban: 'A', pembahasan: 'rahasia', soal_ids: '["s1"]', rombel_ids: '["r1"]'
  })
  assert.deepEqual(safe.rombel_ids, ['r1'])
  assert.equal(safe.jumlah_soal, 1)
  for (const secret of ['password', 'token', 'kunci_jawaban', 'pembahasan']) {
    assert.equal(Object.hasOwn(safe, secret), false, `${secret} tidak boleh ada`)
  }
})
