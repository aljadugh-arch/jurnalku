const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { setupWA, queueWaliAttendance } = require('../server/wa-queue.cjs')

// Regresi: tabel `users` produksi TIDAK punya kolom `phone`. Query lama ke
// `u.phone` melempar dan ditelan catch kosong, sehingga notif absen ke wali
// TIDAK PERNAH masuk antrean di semua lembaga. Sekarang harus tetap terkirim
// via siswa.no_hp (kontak orang tua), bukan gagal diam-diam.

function fixture() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE settings (id TEXT, tenant_id TEXT, nama_lembaga TEXT, hari_libur TEXT);
    CREATE TABLE kalender_kbm (tenant_id TEXT, tanggal TEXT, jenis TEXT);
    CREATE TABLE notif_settings (tenant_id TEXT PRIMARY KEY, absensi_siswa_ke_wali INTEGER, template_absensi_wali TEXT);
    CREATE TABLE siswa (id TEXT, tenant_id TEXT, nis TEXT, nama TEXT, nama_ortu TEXT, no_hp TEXT);
    CREATE TABLE users (id TEXT, tenant_id TEXT, nama TEXT, role TEXT, nis TEXT);
    CREATE TABLE user_students (tenant_id TEXT, user_id TEXT, student_id TEXT);
  `)
  setupWA(db)
  db.prepare('INSERT INTO settings VALUES (?,?,?,?)').run('main_t1', 't1', 'Sekolah Uji', '[]')
  db.prepare('INSERT INTO notif_settings VALUES (?,?,?)').run('t1', 1, 'Anak {nama} {status} pada {tanggal} - {lembaga}')
  db.prepare('INSERT INTO siswa VALUES (?,?,?,?,?,?)').run('s1', 't1', '001', 'Ahmad', 'Bapak Budi', '081234567890')
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('u1', 't1', 'Bapak Budi', 'wali_murid', '001')
  db.prepare('INSERT INTO user_students VALUES (?,?,?)').run('t1', 'u1', 's1')
  return db
}

test('queueWaliAttendance: terkirim via siswa.no_hp walau users tak punya kolom phone', () => {
  const db = fixture()
  // 2026-08-24 = Senin (bukan libur, hari_libur kosong).
  const r = queueWaliAttendance(db, { tenantId: 't1', studentId: 's1', date: '2026-08-24', session: 'masuk', status: 'hadir' })
  assert.equal(r.queued, true, JSON.stringify(r))
  const row = db.prepare('SELECT phone, message FROM wa_queue').get()
  assert.equal(row.phone, '6281234567890')
  assert.match(row.message, /Ahmad/)
})

test('queueWaliAttendance: tidak melempar saat users.phone tidak ada (fallback no_hp)', () => {
  const db = fixture()
  // Pastikan tidak ada exception terlempar keluar fungsi.
  let threw = false
  try {
    queueWaliAttendance(db, { tenantId: 't1', studentId: 's1', date: '2026-08-24', session: 'pulang', status: 'hadir' })
  } catch (e) {
    threw = true
  }
  assert.equal(threw, false)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM wa_queue').get().c, 1)
})

test('queueWaliAttendance: missing_phone bila no_hp kosong dan tak ada phone wali', () => {
  const db = fixture()
  db.prepare('UPDATE siswa SET no_hp=? WHERE id=?').run('', 's1')
  const r = queueWaliAttendance(db, { tenantId: 't1', studentId: 's1', date: '2026-08-24', session: 'masuk', status: 'hadir' })
  assert.equal(r.queued, false)
  assert.equal(r.reason, 'missing_phone')
})

test('queueWaliAttendance: disabled bila toggle absensi_siswa_ke_wali mati', () => {
  const db = fixture()
  db.prepare('UPDATE notif_settings SET absensi_siswa_ke_wali=0 WHERE tenant_id=?').run('t1')
  const r = queueWaliAttendance(db, { tenantId: 't1', studentId: 's1', date: '2026-08-24', session: 'masuk', status: 'hadir' })
  assert.equal(r.queued, false)
  assert.equal(r.reason, 'disabled')
})
