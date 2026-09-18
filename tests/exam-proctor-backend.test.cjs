const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { monitorStatus, sanitizeExamForMonitor } = require('../server/exam-proctor.cjs')
const server = fs.readFileSync(path.join(__dirname, '../server/index.cjs'), 'utf8')

test('monitorStatus uses explicit server time and heartbeat thresholds', () => {
  const now = new Date('2026-09-18T10:00:00.000Z')
  assert.equal(monitorStatus({ sessionStatus: null, now }), 'belum')
  assert.equal(monitorStatus({ sessionStatus: 'selesai', lastSeenAt: '2026-09-18T09:59:59.000Z', now }), 'selesai')
  assert.equal(monitorStatus({ sessionStatus: 'mengerjakan', lastSeenAt: '2026-09-18T09:59:30.000Z', now }), 'online')
  assert.equal(monitorStatus({ sessionStatus: 'mengerjakan', lastSeenAt: '2026-09-18T09:59:29.999Z', now }), 'stale')
  assert.equal(monitorStatus({ sessionStatus: 'mengerjakan', lastSeenAt: '2026-09-18T09:58:00.000Z', now }), 'stale')
  assert.equal(monitorStatus({ sessionStatus: 'mengerjakan', lastSeenAt: '2026-09-18T09:57:59.999Z', now }), 'offline')
  assert.equal(monitorStatus({ sessionStatus: 'mengerjakan', lastSeenAt: 'invalid', now }), 'offline')
})

test('sanitizeExamForMonitor allowlists fields and parses ids safely', () => {
  const safe = sanitizeExamForMonitor({
    id: 'p1', nama: 'STS', mapel_id: 'm1', mapel_nama: 'Matematika',
    jenis: 'sts', model: 'cbt', tingkat: '8', tahun_ajaran: '2026/2027', semester: '1',
    durasi_menit: 90, status: 'aktif', mulai: '2026-09-18T10:00:00Z', selesai: null,
    soal_ids: '["s1","s2"]', rombel_ids: '["r1"]',
    password: 'secret', token: 'secret', kunci_jawaban: 'A', jawaban: 'A', pembahasan: 'secret',
    api_key: 'secret', created_by: 'u1'
  })

  assert.deepEqual(safe, {
    id: 'p1', nama: 'STS', mapel_id: 'm1', mapel_nama: 'Matematika',
    jenis: 'sts', model: 'cbt', tingkat: '8', tahun_ajaran: '2026/2027', semester: '1',
    durasi_menit: 90, status: 'aktif', mulai: '2026-09-18T10:00:00Z', selesai: null,
    rombel_ids: ['r1'], jumlah_soal: 2
  })
  assert.deepEqual(sanitizeExamForMonitor({ soal_ids: 'bad', rombel_ids: null }).rombel_ids, [])
  assert.equal(sanitizeExamForMonitor({ soal_ids: 'bad' }).jumlah_soal, 0)
})

test('proctor remains outside content, package, and correction role guards', () => {
  const staffGuard = server.match(/const STAFF\s*=\s*requireRole\(([^\n]+)\)/)?.[1] || ''
  const examGuard = server.match(/const EXAM_ROLES\s*=\s*requireRole\(([^\n]+)\)/)?.[1] || ''
  assert.doesNotMatch(staffGuard, /proktor/)
  assert.doesNotMatch(examGuard, /proktor/)
  assert.match(server, /app\.post\('\/api\/paket-ujian', STAFF/)
  assert.match(server, /app\.get\('\/api\/ujian\/:paketId\/koreksi\/:siswaId', STAFF/)
})

test('proctor mutations are scoped and audited', () => {
  assert.match(server, /canMonitorExam\(req, req\.params\.paketId, student\.rombel_id\)/)
  assert.match(server, /proctorAudit\(req, req\.params\.paketId, student\.id, 'force-submit'/)
  assert.match(server, /proctorAudit\(req, req\.params\.paketId, student\.id, 'tambah-waktu'/)
  assert.match(server, /minutes < 1 \|\| minutes > 180/)
  assert.match(server, /total > 360/)
})
