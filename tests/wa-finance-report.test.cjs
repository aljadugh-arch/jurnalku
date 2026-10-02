const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { setupWA, queueFinanceReports } = require('../server/wa-queue.cjs')

function fixture() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE settings (tenant_id TEXT PRIMARY KEY, nama_lembaga TEXT, hari_libur TEXT);
    CREATE TABLE kalender_kbm (tenant_id TEXT, tanggal TEXT, jenis TEXT);
    CREATE TABLE notif_settings (tenant_id TEXT PRIMARY KEY, notif_keuangan_wali INTEGER, keuangan_frekuensi TEXT, keuangan_hari TEXT, keuangan_jam TEXT, template_keuangan_wali TEXT);
    CREATE TABLE siswa (id TEXT, tenant_id TEXT, nis TEXT, nama TEXT, nama_ortu TEXT, no_hp TEXT);
    CREATE TABLE users (id TEXT, tenant_id TEXT, nama TEXT, role TEXT, phone TEXT, nis TEXT);
    CREATE TABLE user_students (tenant_id TEXT, user_id TEXT, student_id TEXT);
    CREATE TABLE jenis_tagihan (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE tagihan (id TEXT, tenant_id TEXT, siswa_id TEXT, jenis_tagihan_id TEXT, status TEXT, nominal REAL, bulan TEXT, tahun TEXT, tanggal_bayar TEXT);
    CREATE TABLE tabungan (id TEXT, tenant_id TEXT, siswa_id TEXT, saldo_akhir REAL, created_at TEXT);
  `)
  setupWA(db)
  db.prepare('INSERT INTO settings VALUES (?,?,?)').run('t1', 'Sekolah Uji', '[]')
  db.prepare("INSERT INTO notif_settings VALUES (?,?,?,?,?,?)").run('t1', 1, 'bulanan', '24', '08:00', '')
  db.prepare("INSERT INTO siswa VALUES (?,?,?,?,?,?)").run('s1', 't1', '001', 'Ahmad', 'Bapak Budi', '081234567890')
  db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?)").run('u1', 't1', 'Bapak Budi', 'wali_murid', '081234567890', '001')
  db.prepare("INSERT INTO user_students VALUES (?,?,?)").run('t1', 'u1', 's1')
  db.prepare("INSERT INTO jenis_tagihan VALUES (?,?,?)").run('jt1', 't1', 'SPP')
  db.prepare("INSERT INTO tagihan VALUES (?,?,?,?,?,?,?,?,?)").run('tg1', 't1', 's1', 'jt1', 'belum_bayar', 250000, 'Agustus', '2026', null)
  db.prepare("INSERT INTO tabungan VALUES (?,?,?,?,?)").run('tb1', 't1', 's1', 120000, '2026-08-20 10:00:00')
  return db
}

test('queueFinanceReports: kirim pada tanggal & jam yang cocok (bulanan)', () => {
  const db = fixture()
  const result = queueFinanceReports(db, { tenantId: 't1', date: '2026-08-24', time: '08:00' })
  assert.equal(result.queued, 1)
  const row = db.prepare('SELECT phone,message FROM wa_queue').get()
  assert.equal(row.phone, '6281234567890')
  assert.match(row.message, /Ahmad/)
  assert.match(row.message, /SPP/)
  assert.match(row.message, /250\.000/)
  assert.match(row.message, /120\.000/)
})

test('queueFinanceReports: tidak kirim di luar hari/jam yang diatur', () => {
  const db = fixture()
  assert.equal(queueFinanceReports(db, { tenantId: 't1', date: '2026-08-23', time: '08:00' }).queued, 0)
  assert.equal(queueFinanceReports(db, { tenantId: 't1', date: '2026-08-24', time: '09:00' }).queued, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM wa_queue').get().c, 0)
})

test('queueFinanceReports: idempoten per periode (tidak duplikat)', () => {
  const db = fixture()
  assert.equal(queueFinanceReports(db, { tenantId: 't1', date: '2026-08-24', time: '08:00' }).queued, 1)
  assert.equal(queueFinanceReports(db, { tenantId: 't1', date: '2026-08-24', time: '08:00' }).queued, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM wa_queue').get().c, 1)
})

test('queueFinanceReports: nonaktif berarti tidak kirim', () => {
  const db = fixture()
  db.prepare('UPDATE notif_settings SET notif_keuangan_wali=0 WHERE tenant_id=?').run('t1')
  assert.equal(queueFinanceReports(db, { tenantId: 't1', date: '2026-08-24', time: '08:00' }).queued, 0)
})

test('queueFinanceReports: mingguan pada hari yang cocok', () => {
  const db = fixture()
  db.prepare("UPDATE notif_settings SET keuangan_frekuensi='mingguan', keuangan_hari='senin' WHERE tenant_id=?").run('t1')
  // 2026-08-24 = Senin
  assert.equal(queueFinanceReports(db, { tenantId: 't1', date: '2026-08-24', time: '08:00' }).queued, 1)
  // 2026-08-25 = Selasa -> tidak kirim
  assert.equal(queueFinanceReports(db, { tenantId: 't1', date: '2026-08-25', time: '08:00' }).queued, 0)
})
