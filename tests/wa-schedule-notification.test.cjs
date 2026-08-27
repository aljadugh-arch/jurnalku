const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { setupWA, queueDueSchedules, honorificTeacherName } = require('../server/wa-queue.cjs')

test('sapaan guru otomatis memakai Pak dan Ibu sesuai jenis kelamin', () => {
  assert.equal(honorificTeacherName('Ahmad', 'L'), 'Pak Ahmad')
  assert.equal(honorificTeacherName('Siti', 'P'), 'Ibu Siti')
})

test('jadwal mapel tetap masuk antrean dengan template bawaan saat template tenant kosong', () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE settings (tenant_id TEXT PRIMARY KEY, nama_lembaga TEXT, hari_libur TEXT);
    CREATE TABLE kalender_kbm (tenant_id TEXT, tanggal TEXT, jenis TEXT);
    CREATE TABLE notif_settings (tenant_id TEXT PRIMARY KEY, notif_jadwal_guru INTEGER, template_jadwal_guru TEXT);
    CREATE TABLE tahun_ajaran (tenant_id TEXT, aktif INTEGER, tanggal_mulai TEXT, tanggal_selesai TEXT);
    CREATE TABLE gtk (id TEXT, tenant_id TEXT, nama TEXT, no_hp TEXT, status TEXT);
    CREATE TABLE mapel (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE rombel (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE jadwal (id TEXT, tenant_id TEXT, gtk_id TEXT, mapel_id TEXT, rombel_id TEXT, hari TEXT, jam_mulai TEXT, jam_selesai TEXT);
  `)
  setupWA(db)
  db.prepare('INSERT INTO settings VALUES (?,?,?)').run('t1', 'Sekolah Uji', '[]')
  db.prepare('INSERT INTO notif_settings VALUES (?,?,?)').run('t1', 1, '')
  db.prepare('INSERT INTO tahun_ajaran VALUES (?,?,?,?)').run('t1', 1, '2026-07-01', '2026-12-31')
  db.prepare('INSERT INTO gtk VALUES (?,?,?,?,?)').run('g1', 't1', 'Guru Uji', '081234567890', 'aktif')
  db.prepare('INSERT INTO mapel VALUES (?,?,?)').run('m1', 't1', 'Matematika')
  db.prepare('INSERT INTO rombel VALUES (?,?,?)').run('r1', 't1', 'VII A')
  db.prepare('INSERT INTO jadwal VALUES (?,?,?,?,?,?,?,?)').run('j1', 't1', 'g1', 'm1', 'r1', 'Senin', '08:05', '08:45')

  const result = queueDueSchedules(db, { tenantId: 't1', date: '2026-08-24', time: '08:00' })
  const queued = db.prepare('SELECT phone,message,status FROM wa_queue').get()

  assert.equal(result.queued, 1)
  assert.equal(queued.phone, '6281234567890')
  assert.equal(queued.status, 'pending')
  assert.match(queued.message, /Guru Uji/)
  assert.match(queued.message, /Matematika/)
  assert.match(queued.message, /VII A/)
})
