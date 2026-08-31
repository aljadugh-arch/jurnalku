const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { setupWA, queueDueSchedules } = require('../server/wa-queue.cjs')
const { setupMonitoring, logActivity, getMonitoring } = require('../server/notification-monitor.cjs')

function scheduleDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE settings (tenant_id TEXT PRIMARY KEY, nama_lembaga TEXT, hari_libur TEXT);
    CREATE TABLE kalender_kbm (tenant_id TEXT, tanggal TEXT, jenis TEXT);
    CREATE TABLE notif_settings (tenant_id TEXT PRIMARY KEY, notif_jadwal_guru INTEGER, template_jadwal_guru TEXT);
    CREATE TABLE tahun_ajaran (tenant_id TEXT, aktif INTEGER, tanggal_mulai TEXT, tanggal_selesai TEXT);
    CREATE TABLE gtk (id TEXT, tenant_id TEXT, nama TEXT, no_hp TEXT, status TEXT);
    CREATE TABLE mapel (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE rombel (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE jadwal (id TEXT, tenant_id TEXT, gtk_id TEXT, mapel_id TEXT, rombel_id TEXT, hari TEXT, jam_mulai TEXT, jam_selesai TEXT, jenis_kegiatan TEXT DEFAULT 'mapel');
  `)
  setupWA(db)
  db.prepare('INSERT INTO settings VALUES (?,?,?)').run('t1', 'Sekolah Uji', '[]')
  db.prepare('INSERT INTO notif_settings VALUES (?,?,?)').run('t1', 1, '')
  db.prepare('INSERT INTO tahun_ajaran VALUES (?,?,?,?)').run('t1', 1, '2026-07-01', '2026-12-31')
  db.prepare('INSERT INTO gtk VALUES (?,?,?,?,?)').run('g1', 't1', 'Guru Uji', '081234567890', 'aktif')
  db.prepare('INSERT INTO mapel VALUES (?,?,?)').run('m1', 't1', 'Matematika')
  db.prepare('INSERT INTO rombel VALUES (?,?,?)').run('r1', 't1', 'VII A')
  return db
}

test('dua JTM berurutan yang sama hanya mengantrekan satu notif pada jam pertama', () => {
  const db = scheduleDb()
  const insert = db.prepare('INSERT INTO jadwal VALUES (?,?,?,?,?,?,?,?,?)')
  insert.run('j1', 't1', 'g1', 'm1', 'r1', 'Senin', '08:00', '08:40', 'mapel')
  insert.run('j2', 't1', 'g1', 'm1', 'r1', 'Senin', '08:40', '09:20', 'mapel')

  const first = queueDueSchedules(db, { tenantId: 't1', date: '2026-08-24', time: '08:00' })
  const second = queueDueSchedules(db, { tenantId: 't1', date: '2026-08-24', time: '08:40' })

  assert.equal(first.queued, 1)
  assert.equal(second.queued, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM wa_queue').get().c, 1)
  assert.match(db.prepare('SELECT message FROM wa_queue').get().message, /08:00.*09:20/)
})

test('monitoring menggabungkan penugasan, masuk kelas, QR siswa, dan ceklok secara tenant-scoped', () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tugas_siswa (id TEXT, guru_id TEXT, rombel_id TEXT, judul TEXT, deadline TEXT, tenant_id TEXT, created_at TEXT);
    CREATE TABLE gtk (id TEXT, nama TEXT, tenant_id TEXT);
    CREATE TABLE siswa (id TEXT, nama TEXT, rombel_id TEXT, tenant_id TEXT);
    CREATE TABLE rombel (id TEXT, nama TEXT, tenant_id TEXT);
    CREATE TABLE sesi_kelas_guru (id TEXT, guru_id TEXT, rombel_id TEXT, tanggal TEXT, waktu_masuk TEXT, waktu_selesai TEXT, status TEXT, tenant_id TEXT);
    CREATE TABLE absensi_siswa (id TEXT, siswa_id TEXT, tanggal TEXT, metode TEXT, waktu_masuk TEXT, waktu_pulang TEXT, status TEXT, status_pulang TEXT, tenant_id TEXT);
    CREATE TABLE absensi_guru (id TEXT, gtk_id TEXT, tanggal TEXT, waktu_masuk TEXT, waktu_pulang TEXT, status TEXT, tenant_id TEXT);
  `)
  setupMonitoring(db)
  db.prepare('INSERT INTO gtk VALUES (?,?,?)').run('g1', 'Guru Satu', 't1')
  db.prepare('INSERT INTO rombel VALUES (?,?,?)').run('r1', 'VII A', 't1')
  db.prepare('INSERT INTO siswa VALUES (?,?,?,?)').run('s1', 'Siswa Satu', 'r1', 't1')
  db.prepare('INSERT INTO tugas_siswa VALUES (?,?,?,?,?,?,?)').run('t1', 'g1', 'r1', 'Tugas 1', '2026-08-30', 't1', '2026-08-24 08:00:00')
  db.prepare('INSERT INTO sesi_kelas_guru VALUES (?,?,?,?,?,?,?,?)').run('k1', 'g1', 'r1', '2026-08-24', '08:01', null, 'aktif', 't1')
  db.prepare('INSERT INTO absensi_siswa VALUES (?,?,?,?,?,?,?,?,?)').run('a1', 's1', '2026-08-24', 'qr', '07:05', null, 'hadir', null, 't1')
  db.prepare('INSERT INTO absensi_guru VALUES (?,?,?,?,?,?,?)').run('a2', 'g1', '2026-08-24', '07:00', null, 'hadir', 't1')
  logActivity(db, { tenantId: 't1', eventType: 'assignment_created', actorId: 'g1', entityId: 't1' })
  db.prepare("UPDATE notification_activity SET created_at='2026-08-24 08:00:00' WHERE tenant_id='t1'").run()
  logActivity(db, { tenantId: 't2', eventType: 'assignment_created', actorId: 'other', entityId: 'other' })

  const result = getMonitoring(db, 't1', '2026-08-24')
  assert.equal(result.assignments.total, 1)
  assert.equal(result.assignments.students, 1)
  assert.equal(result.class_sessions.total, 1)
  assert.equal(result.student_qr.total, 1)
  assert.equal(result.teacher_checkins.total, 1)
  assert.equal(result.activity.length, 1)
})