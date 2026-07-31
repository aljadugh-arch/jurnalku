// Jalankan di VPS: node seed_demo_users.cjs <path-ke-db>
const path = process.argv[2]
if (!path) { console.error('usage: node seed_demo_users.cjs <db-path>'); process.exit(1) }
const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')
const { randomUUID } = require('crypto')
const db = new Database(path)

const TENANT_SLUG = 'demo'
const tenant = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(TENANT_SLUG)
if (!tenant) { console.error('tenant demo tidak ditemukan'); process.exit(1) }
const tid = tenant.id

const PWD_HASH = bcrypt.hashSync('demo123', 10)

const accounts = [
  { email: 'guru@jurnal.cc.cd', nama: 'Ahmad Fauzi (Demo Guru)', role: 'guru', nip: 'NIP951625' },
  { email: 'kepala@jurnal.cc.cd', nama: 'Siti Rahma (Demo Kepala)', role: 'kepala', nip: 'NIP514383' },
  { email: 'walikelas@jurnal.cc.cd', nama: 'Budi Santoso (Demo Wali Kelas)', role: 'wali_kelas', nip: 'NIP551894' },
]

const upsertGtkUser = db.prepare(`
  INSERT INTO users (id, nama, email, password, role, nip, tenant_id) VALUES (?,?,?,?,?,?,?)
  ON CONFLICT(email) DO UPDATE SET password=excluded.password, role=excluded.role, nip=excluded.nip
`)
for (const a of accounts) {
  upsertGtkUser.run(randomUUID(), a.nama, a.email, PWD_HASH, a.role, a.nip, tid)
  console.log('OK', a.email, a.role)
}

// siswa demo: link ke siswa NIS1000 (Ahmad Rizki, rombel I-A)
const siswaEmail = 'siswa@jurnal.cc.cd'
const upsertSiswaUser = db.prepare(`
  INSERT INTO users (id, nama, email, password, role, nis, tenant_id) VALUES (?,?,?,?,?,?,?)
  ON CONFLICT(email) DO UPDATE SET password=excluded.password, role=excluded.role, nis=excluded.nis
`)
upsertSiswaUser.run(randomUUID(), 'Ahmad Rizki (Demo Siswa)', siswaEmail, PWD_HASH, 'siswa', 'NIS1000', tid)
console.log('OK', siswaEmail, 'siswa')

// set wali kelas rombel I-A ke Budi Santoso (gtk id)
const gtkBudi = db.prepare('SELECT id FROM gtk WHERE nip = ? AND tenant_id = ?').get('NIP551894', tid)
if (gtkBudi) {
  db.prepare('UPDATE rombel SET wali_kelas_id = ? WHERE nama = ? AND tenant_id = ?').run(gtkBudi.id, 'I-A', tid)
  console.log('OK set wali_kelas_id rombel I-A ->', gtkBudi.id)
}

console.log('DONE')
