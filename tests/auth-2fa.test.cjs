// Kontrak keamanan akun: TOTP RFC 6238, anti-replay, enkripsi rahasia,
// kode pemulihan sekali pakai, dan ketersediaan rute.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Database = require('better-sqlite3')
const sec = require('../server/auth-security.cjs')

const SECRET_RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' // "12345678901234567890"

test('HOTP sesuai vektor RFC 6238 (6 digit)', () => {
  // T=59s -> step 1 -> 287082 (versi 6 digit dari 94287082)
  assert.strictEqual(sec.hotp(SECRET_RFC, 1), '287082')
  assert.strictEqual(sec.hotp(SECRET_RFC, 37037036), '081804')
})

test('base32 bolak-balik dan enkripsi rahasia', () => {
  const buf = Buffer.from('rahasia-totp-uji')
  assert.strictEqual(sec.b32decode(sec.b32encode(buf)).toString(), 'rahasia-totp-uji')
  const paket = sec.enkripsi('JBSWY3DPEHPK3PXP')
  assert.ok(!paket.includes('JBSWY3DPEHPK3PXP'), 'rahasia tidak boleh tampak')
  assert.strictEqual(sec.dekripsi(paket), 'JBSWY3DPEHPK3PXP')
})

test('verifikasiTotp menerima kode sekarang dan menolak yang salah', () => {
  const now = Date.now()
  const asli = Date.now
  Date.now = () => now
  try {
    const step = Math.floor(now / 1000 / 30)
    assert.strictEqual(sec.verifikasiTotp(SECRET_RFC, sec.hotp(SECRET_RFC, step)), step)
    assert.strictEqual(sec.verifikasiTotp(SECRET_RFC, sec.hotp(SECRET_RFC, step + 5)), 0)
    assert.strictEqual(sec.verifikasiTotp(SECRET_RFC, '123'), 0)
  } finally { Date.now = asli }
})

function dbUji() {
  const file = path.join(os.tmpdir(), `jk-2fa-${process.pid}-${Date.now()}.db`)
  const db = new Database(file)
  db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT, email TEXT, role TEXT, password TEXT);
           CREATE TABLE auth_challenge(id TEXT PRIMARY KEY, user_id TEXT, tenant_id TEXT, jenis TEXT, token_hash TEXT,
             expires_at TEXT, used INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, meta TEXT, created_at TEXT DEFAULT (datetime('now')));
           CREATE TABLE user_totp(user_id TEXT PRIMARY KEY, tenant_id TEXT, secret_enc TEXT, enabled INTEGER DEFAULT 0,
             last_step INTEGER DEFAULT 0, recovery_hash TEXT, confirmed_at TEXT, created_at TEXT DEFAULT (datetime('now')));`)
  db.prepare('INSERT INTO users(id,tenant_id,nama,email,role,password) VALUES(?,?,?,?,?,?)')
    .run('u1', 't1', 'Uji', 'uji@contoh.id', 'admin', 'x')
  return { db, file }
}

test('2FA: belum aktif -> tanpa tantangan; aktif -> kode benar sekali pakai', () => {
  const { db, file } = dbUji()
  const asli = Date.now
  const now = asli()
  Date.now = () => now
  try {
    const user = db.prepare('SELECT * FROM users WHERE id=?').get('u1')
    assert.strictEqual(sec.perluVerifikasi(db, user, ''), null, 'belum aktif tidak menantang')

    const step = Math.floor(now / 1000 / 30)
    const secret = SECRET_RFC
    db.prepare('INSERT INTO user_totp(user_id,tenant_id,secret_enc,enabled) VALUES(?,?,?,1)')
      .run('u1', 't1', sec.enkripsi(secret))

    const tantangan = sec.perluVerifikasi(db, user, '')
    assert.ok(tantangan && tantangan.mfa_required && tantangan.challenge_token)

    const kode = sec.hotp(secret, step)
    assert.strictEqual(sec.perluVerifikasi(db, user, kode), null, 'kode benar meloloskan')
    const ulang = sec.perluVerifikasi(db, user, kode)
    assert.ok(ulang && ulang.salah, 'kode yang sama tidak boleh dipakai dua kali')
  } finally { Date.now = asli; db.close(); fs.unlinkSync(file) }
})

test('kode pemulihan sekali pakai', () => {
  const kode = sec.buatKodeRecovery()
  assert.strictEqual(kode.length, 10)
  const hash = kode.map(k => require('crypto').createHash('sha256').update(k.replace(/-/g, '')).digest('hex')).join(',')
  const row = { user_id: 'u1', recovery_hash: hash }
  // Tiru UPDATE: simpan sisa kode ke row seperti database sungguhan.
  const db = { prepare: () => ({ run: (sisa) => { row.recovery_hash = sisa } }) }
  assert.strictEqual(sec.cekRecovery(db, row, kode[0]), true)
  // Setelah dipakai, hash-nya dibuang dari daftar.
  assert.strictEqual(row.recovery_hash.split(',').length, 9)
  assert.strictEqual(sec.cekRecovery(db, row, kode[0]), false)
})

test('rute keamanan terdaftar dan login memakai gerbang 2FA', () => {
  const s = fs.readFileSync(path.join(__dirname, '../server/index.cjs'), 'utf8')
  const m = fs.readFileSync(path.join(__dirname, '../server/auth-security.cjs'), 'utf8')
  for (const r of ['/api/auth/2fa/verify', '/api/auth/2fa/setup', '/api/auth/totp-login', '/api/auth/magic/request', '/api/auth/magic/consume']) {
    assert.ok(m.includes(r), `rute ${r} ada`)
  }
  assert.ok(s.includes('perluVerifikasi(db, user'), 'login memanggil gerbang 2FA')
  assert.ok(s.includes("metode: 'sandi'"), 'login dicatat di audit')
})
