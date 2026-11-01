'use strict'
// Keamanan akun: audit login, 2FA TOTP (authenticator), tautan verifikasi email,
// dan login tanpa sandi (username + kode TOTP).
//
// Prinsip yang dijaga:
//   1. Rahasia TOTP disimpan terenkripsi AES-256-GCM, bukan teks biasa.
//   2. Kode TOTP sekali pakai: step terakhir dicatat, kode lama ditolak.
//   3. Token tautan/kode disimpan sebagai hash, berlaku singkat, sekali pakai.
//   4. Balasan permintaan tautan selalu generik (tidak membocorkan akun).
//   5. Semua percobaan masuk dicatat di auth_audit (IP + user agent).

const crypto = require('crypto')
const bcrypt = require('bcryptjs')

const MASA_TAUTAN_MENIT = 10
const MASA_CHALLENGE_MENIT = 5
const MAKS_PERCOBAAN_CHALLENGE = 5
const LANGKAH_TOTP = 30
const TOLERANSI_TOTP = 1

// ---------------------------------------------------------------- util dasar

function sekarang() { return Math.floor(Date.now() / 1000) }

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

function tokenAcak(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

function ipDari(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '')
    .split(',')[0].trim().slice(0, 64)
}

// --------------------------------------------------------------- TOTP (RFC 6238)

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function b32decode(s) {
  let bits = 0, val = 0
  const out = []
  for (const c of String(s).replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(c)
    if (i < 0) continue
    val = (val << 5) | i
    bits += 5
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8 }
  }
  return Buffer.from(out)
}

function b32encode(buf) {
  let bits = 0, val = 0, out = ''
  for (const b of buf) {
    val = (val << 8) | b
    bits += 8
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31]
  return out
}

function hotp(secret, counter) {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const h = crypto.createHmac('sha1', b32decode(secret)).update(buf).digest()
  const o = h[h.length - 1] & 0x0f
  const code = ((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1000000
  return String(code).padStart(6, '0')
}

// Mengembalikan step yang cocok (0 = tidak cocok). Toleransi ±1 langkah untuk
// jam perangkat yang meleset sedikit.
function verifikasiTotp(secret, kode, toleransi = TOLERANSI_TOTP) {
  const bersih = String(kode || '').replace(/\D/g, '')
  if (bersih.length !== 6) return 0
  const langkah = Math.floor(sekarang() / LANGKAH_TOTP)
  for (let d = -toleransi; d <= toleransi; d++) {
    if (hotp(secret, langkah + d) === bersih) return langkah + d
  }
  return 0
}

// ---------------------------------------------------- enkripsi rahasia TOTP

let KUNCI_CACHE = null
function kunciEnkripsi() {
  // scrypt mahal (~100ms). Tanpa cache, tiap login menambah detik.
  if (KUNCI_CACHE) return KUNCI_CACHE
  const bahan = process.env.TOTP_ENC_KEY || process.env.JWT_SECRET || 'jurnalku-dev'
  KUNCI_CACHE = crypto.scryptSync(bahan, 'jurnalku-totp-v1', 32)
  return KUNCI_CACHE
}

function enkripsi(teks) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', kunciEnkripsi(), iv)
  const isi = Buffer.concat([c.update(String(teks), 'utf8'), c.final()])
  return [iv, c.getAuthTag(), isi].map(b => b.toString('base64')).join('.')
}

function dekripsi(paket) {
  const [iv, tag, isi] = String(paket).split('.').map(x => Buffer.from(x, 'base64'))
  const d = crypto.createDecipheriv('aes-256-gcm', kunciEnkripsi(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(isi), d.final()]).toString('utf8')
}

// ---------------------------------------------------------------- tabel

function siapkanTabel(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_audit (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      user_id TEXT,
      identifier TEXT,
      metode TEXT NOT NULL,
      hasil TEXT NOT NULL,
      alasan TEXT,
      ip TEXT,
      ua TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_auth_audit_waktu ON auth_audit(tenant_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS user_totp (
      user_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      secret_enc TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      last_step INTEGER NOT NULL DEFAULT 0,
      recovery_hash TEXT,
      confirmed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auth_challenge (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      jenis TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      meta TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_auth_challenge_token ON auth_challenge(token_hash);
  `)
}

function catatAudit(db, { tenantId, userId, identifier, metode, hasil, alasan, req }) {
  try {
    db.prepare(`INSERT INTO auth_audit(id,tenant_id,user_id,identifier,metode,hasil,alasan,ip,ua)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(
      crypto.randomUUID(), tenantId || null, userId || null, String(identifier || '').slice(0, 120),
      metode, hasil, alasan || null, ipDari(req), String(req?.headers?.['user-agent'] || '').slice(0, 200),
    )
  } catch { /* audit tidak boleh menggagalkan login */ }
}

// ---------------------------------------------------------------- sesi

function terbitkanSesi(ctx, res, user) {
  const { jwt, JWT_SECRET, JWT_EXPIRES_IN } = ctx
  const token = jwt.sign({
    id: user.id, role: user.role, nama: user.nama, email: user.email, tenant_id: user.tenant_id,
    gtk_id: user.gtk_id || null, siswa_id: user.siswa_id || null, nis: user.nis || null,
    can_teach: !!user.can_teach,
  }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
  return res.json({
    token,
    user: {
      id: user.id, nama: user.nama, email: user.email, role: user.role, nip: user.nip,
      nis: user.nis, siswa_id: user.siswa_id, gtk_id: user.gtk_id, avatar: user.avatar,
      can_teach: !!user.can_teach,
    },
  })
}

// ---------------------------------------------------------------- challenge

function buatChallenge(db, { userId, tenantId, jenis, menit, meta }) {
  const token = tokenAcak(32)
  db.prepare(`INSERT INTO auth_challenge(id,user_id,tenant_id,jenis,token_hash,expires_at,meta)
    VALUES(?,?,?,?,?,datetime('now',?),?)`).run(
    crypto.randomUUID(), userId, tenantId, jenis, hashToken(token), `+${menit} minutes`, meta ? JSON.stringify(meta) : null,
  )
  return token
}

function ambilChallenge(db, token, jenis) {
  if (!token) return null
  return db.prepare(`SELECT * FROM auth_challenge WHERE token_hash=? AND jenis=? AND used=0
    AND expires_at > datetime('now')`).get(hashToken(token), jenis) || null
}

function pakaiChallenge(db, row) {
  db.prepare('UPDATE auth_challenge SET used=1 WHERE id=?').run(row.id)
}

// ---------------------------------------------------------------- status 2FA

function statusTotp(db, userId) {
  const row = db.prepare('SELECT enabled, confirmed_at FROM user_totp WHERE user_id=?').get(userId)
  return { aktif: !!row && Number(row.enabled) === 1, sejak: row?.confirmed_at || null }
}

// Dipakai route login: kalau 2FA aktif dan kode belum benar, kembalikan tantangan.
function perluVerifikasi(db, user, kodeDariBody) {
  const row = db.prepare('SELECT * FROM user_totp WHERE user_id=? AND enabled=1').get(user.id)
  if (!row) return null
  if (kodeDariBody) {
    const cek = cekKodeTotp(db, row, kodeDariBody)
    if (cek.ok) return null
    return { mfa_required: true, salah: true, pesan: 'Kode authenticator salah atau sudah dipakai.' }
  }
  const token = buatChallenge(db, { userId: user.id, tenantId: user.tenant_id, jenis: 'mfa', menit: MASA_CHALLENGE_MENIT })
  return { mfa_required: true, challenge_token: token, metode: ['totp', 'recovery'] }
}

// Verifikasi kode + anti-replay (step harus lebih besar dari yang terakhir dipakai).
function cekKodeTotp(db, row, kode) {
  let secret
  try { secret = dekripsi(row.secret_enc) } catch { return { ok: false, alasan: 'secret_rusak' } }
  const step = verifikasiTotp(secret, kode)
  if (!step) return { ok: false, alasan: 'kode_salah' }
  if (step <= Number(row.last_step || 0)) return { ok: false, alasan: 'kode_dipakai_ulang' }
  db.prepare('UPDATE user_totp SET last_step=? WHERE user_id=?').run(step, row.user_id)
  return { ok: true, step }
}

function cekRecovery(db, row, kode) {
  const bersih = String(kode || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  if (bersih.length < 8) return false
  const daftar = String(row.recovery_hash || '').split(',').filter(Boolean)
  const hash = crypto.createHash('sha256').update(bersih).digest('hex')
  const idx = daftar.indexOf(hash)
  if (idx < 0) return false
  daftar.splice(idx, 1)
  db.prepare('UPDATE user_totp SET recovery_hash=? WHERE user_id=?').run(daftar.join(','), row.user_id)
  return true
}

function buatKodeRecovery() {
  const kode = []
  for (let i = 0; i < 10; i++) {
    const t = crypto.randomBytes(5).toString('hex').toUpperCase().slice(0, 8)
    kode.push(`${t.slice(0, 4)}-${t.slice(4)}`)
  }
  return kode
}

// ---------------------------------------------------------------- route

function daftarkanRouteKeamanan(app, ctx) {
  const { db, authMiddleware } = ctx
  siapkanTabel(db)
  const tenantDari = (req) => {
    if (req.tenantId) return req.tenantId
    try { return ctx.tenantDariHost(ctx.hostPermintaan(req)) || 'default' } catch { return 'default' }
  }

  // ---- status 2FA akun sendiri
  app.get('/api/auth/2fa/status', authMiddleware, (req, res) => {
    res.json(statusTotp(db, req.user.id))
  })

  // ---- mulai pendaftaran authenticator (belum aktif sampai kode diverifikasi)
  app.post('/api/auth/2fa/setup', authMiddleware, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)
    if (!user) return res.status(404).json({ error: 'Akun tidak ditemukan.' })
    const secret = b32encode(crypto.randomBytes(20))
    db.prepare(`INSERT INTO user_totp(user_id,tenant_id,secret_enc,enabled,last_step,recovery_hash)
      VALUES(?,?,?,0,0,NULL)
      ON CONFLICT(user_id) DO UPDATE SET secret_enc=excluded.secret_enc, enabled=0, last_step=0, recovery_hash=NULL`)
      .run(user.id, user.tenant_id, enkripsi(secret))
    const label = encodeURIComponent(`${user.email || user.nama}@JURNALKU`)
    res.json({
      secret,
      otpauth: `otpauth://totp/${label}?secret=${secret}&issuer=JURNALKU&algorithm=SHA1&digits=6&period=30`,
      petunjuk: 'Pindai QR di Google Authenticator / Authy, lalu masukkan kode 6 digit untuk mengaktifkan.',
    })
  })

  // ---- aktifkan 2FA (wajib kode valid)
  app.post('/api/auth/2fa/enable', authMiddleware, (req, res) => {
    const row = db.prepare('SELECT * FROM user_totp WHERE user_id=?').get(req.user.id)
    if (!row) return res.status(400).json({ error: 'Mulai pendaftaran authenticator dulu.' })
    const cek = cekKodeTotp(db, row, req.body?.code)
    if (!cek.ok) {
      catatAudit(db, { tenantId: row.tenant_id, userId: req.user.id, metode: '2fa_enable', hasil: 'gagal', alasan: cek.alasan, req })
      return res.status(400).json({ error: 'Kode salah. Pastikan jam HP Anda otomatis.' })
    }
    const kodeRecovery = buatKodeRecovery()
    const hash = kodeRecovery.map(k => crypto.createHash('sha256').update(k.replace(/-/g, '')).digest('hex')).join(',')
    db.prepare(`UPDATE user_totp SET enabled=1, recovery_hash=?, confirmed_at=datetime('now') WHERE user_id=?`)
      .run(hash, req.user.id)
    catatAudit(db, { tenantId: row.tenant_id, userId: req.user.id, metode: '2fa_enable', hasil: 'sukses', req })
    res.json({ ok: true, recovery_codes: kodeRecovery, pesan: '2FA aktif. Simpan kode pemulihan ini di tempat aman — hanya ditampilkan sekali.' })
  })

  // ---- matikan 2FA (butuh sandi + kode)
  app.post('/api/auth/2fa/disable', authMiddleware, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)
    const row = db.prepare('SELECT * FROM user_totp WHERE user_id=? AND enabled=1').get(req.user.id)
    if (!row) return res.status(400).json({ error: '2FA belum aktif.' })
    if (!bcrypt.compareSync(String(req.body?.password || ''), user.password)) {
      return res.status(400).json({ error: 'Sandi salah.' })
    }
    const cek = cekKodeTotp(db, row, req.body?.code)
    if (!cek.ok) return res.status(400).json({ error: 'Kode authenticator salah.' })
    db.prepare('UPDATE user_totp SET enabled=0 WHERE user_id=?').run(req.user.id)
    catatAudit(db, { tenantId: user.tenant_id, userId: user.id, metode: '2fa_disable', hasil: 'sukses', req })
    res.json({ ok: true })
  })

  // ---- langkah kedua saat login (password sudah benar)
  app.post('/api/auth/2fa/verify', ctx.authLimiter, (req, res) => {
    const { challenge_token, code } = req.body || {}
    const row = ambilChallenge(db, challenge_token, 'mfa')
    if (!row) return res.status(400).json({ error: 'Sesi verifikasi kedaluwarsa. Masuk ulang.' })
    if (row.attempts >= MAKS_PERCOBAAN_CHALLENGE) return res.status(429).json({ error: 'Terlalu banyak percobaan. Masuk ulang.' })

    const totp = db.prepare('SELECT * FROM user_totp WHERE user_id=? AND enabled=1').get(row.user_id)
    if (!totp) return res.status(400).json({ error: '2FA tidak aktif untuk akun ini.' })

    let ok = false
    const bersih = String(code || '').replace(/[^a-zA-Z0-9-]/g, '')
    if (/^\d{6}$/.test(bersih)) ok = cekKodeTotp(db, totp, bersih).ok
    else ok = cekRecovery(db, totp, bersih)

    if (!ok) {
      db.prepare('UPDATE auth_challenge SET attempts=attempts+1 WHERE id=?').run(row.id)
      catatAudit(db, { tenantId: row.tenant_id, userId: row.user_id, metode: '2fa_verify', hasil: 'gagal', alasan: 'kode_salah', req })
      return res.status(400).json({ error: 'Kode salah.' })
    }

    pakaiChallenge(db, row)
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(row.user_id)
    if (!user) return res.status(404).json({ error: 'Akun tidak ditemukan.' })
    catatAudit(db, { tenantId: row.tenant_id, userId: row.user_id, metode: '2fa_verify', hasil: 'sukses', req })
    return terbitkanSesi(ctx, res, user)
  })

  // ---- login tanpa sandi: username/email/NIS + kode authenticator
  app.post('/api/auth/totp-login', ctx.authLimiter, (req, res) => {
    const tenantId = tenantDari(req)
    const ident = String(req.body?.identifier || req.body?.email || '').trim()
    const kode = String(req.body?.code || '').replace(/\D/g, '')
    const generic = { error: 'Username atau kode salah.' }
    if (!ident || kode.length !== 6) return res.status(400).json(generic)

    let user = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?) AND tenant_id=?').get(ident, tenantId)
    if (!user) {
      const siswa = db.prepare("SELECT * FROM siswa WHERE tenant_id=? AND status='aktif' AND (nis=? OR nisn=?)").get(tenantId, ident, ident)
      if (siswa) user = db.prepare("SELECT * FROM users WHERE tenant_id=? AND siswa_id=?").get(tenantId, siswa.id)
    }
    if (!user) {
      const g = db.prepare("SELECT * FROM gtk WHERE tenant_id=? AND (nip=? OR (kode_guru<>'' AND lower(kode_guru)=lower(?)))").get(tenantId, ident, ident)
      if (g) user = db.prepare('SELECT * FROM users WHERE tenant_id=? AND gtk_id=?').get(tenantId, g.id)
    }
    if (!user) {
      catatAudit(db, { tenantId, identifier: ident, metode: 'totp_login', hasil: 'gagal', alasan: 'akun_tidak_ada', req })
      return res.status(401).json(generic)
    }
    const row = db.prepare('SELECT * FROM user_totp WHERE user_id=? AND enabled=1').get(user.id)
    if (!row) {
      catatAudit(db, { tenantId, userId: user.id, identifier: ident, metode: 'totp_login', hasil: 'gagal', alasan: '2fa_belum_aktif', req })
      return res.status(400).json({ error: 'Akun ini belum mengaktifkan 2FA. Masuk dengan sandi.' })
    }
    const cek = cekKodeTotp(db, row, kode)
    if (!cek.ok) {
      catatAudit(db, { tenantId, userId: user.id, identifier: ident, metode: 'totp_login', hasil: 'gagal', alasan: cek.alasan, req })
      return res.status(401).json(generic)
    }
    catatAudit(db, { tenantId, userId: user.id, identifier: ident, metode: 'totp_login', hasil: 'sukses', req })
    return terbitkanSesi(ctx, res, user)
  })

  // ---- tautan verifikasi lewat email
  app.post('/api/auth/magic/request', ctx.authLimiter, async (req, res) => {
    const tenantId = tenantDari(req)
    const ident = String(req.body?.email || req.body?.identifier || '').trim().toLowerCase()
    const balasan = { ok: true, pesan: 'Jika akun terdaftar, tautan masuk sudah dikirim ke email.' }
    if (!ident) return res.json(balasan)

    const user = db.prepare('SELECT * FROM users WHERE lower(email)=? AND tenant_id=?').get(ident, tenantId)
    if (!user) {
      catatAudit(db, { tenantId, identifier: ident, metode: 'magic_link', hasil: 'gagal', alasan: 'akun_tidak_ada', req })
      return res.json(balasan)
    }
    if (!user.email || user.email.endsWith('@wali.jurnalku')) return res.json(balasan)

    const token = buatChallenge(db, { userId: user.id, tenantId, jenis: 'magic', menit: MASA_TAUTAN_MENIT })
    const host = ctx.hostPermintaan(req)
    const basis = /^https?:\/\//.test(host) ? host : `https://${host}`
    const tautan = `${basis}/login?magic=${encodeURIComponent(token)}`
    const html = `<p>Halo ${user.nama || ''},</p>
      <p>Klik tautan di bawah untuk masuk ke JURNALKU. Tautan berlaku ${MASA_TAUTAN_MENIT} menit dan hanya bisa dipakai sekali.</p>
      <p><a href="${tautan}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:8px;text-decoration:none">Masuk ke JURNALKU</a></p>
      <p style="color:#666;font-size:12px">Jika Anda tidak meminta tautan ini, abaikan email ini. Jangan teruskan tautan ke siapa pun.</p>`
    try {
      await ctx.kirimEmail({ to: user.email, subject: 'Tautan masuk JURNALKU', html, text: `Masuk: ${tautan} (berlaku ${MASA_TAUTAN_MENIT} menit)` })
      catatAudit(db, { tenantId, userId: user.id, identifier: ident, metode: 'magic_link', hasil: 'sukses', alasan: 'terkirim', req })
    } catch (e) {
      catatAudit(db, { tenantId, userId: user.id, identifier: ident, metode: 'magic_link', hasil: 'gagal', alasan: 'email_gagal', req })
      console.warn('[magic] gagal kirim email:', e.message)
    }
    return res.json(balasan)
  })

  // Halaman konfirmasi membaca info tanpa menghanguskan token (aman dari pemindai).
  app.get('/api/auth/magic/peek', ctx.authLimiter, (req, res) => {
    const row = ambilChallenge(db, String(req.query.token || ''), 'magic')
    if (!row) return res.status(400).json({ error: 'Tautan tidak valid atau sudah kedaluwarsa.' })
    const user = db.prepare('SELECT nama, email FROM users WHERE id=?').get(row.user_id)
    const email = String(user?.email || '')
    const [nama, domain] = email.split('@')
    const tersamar = nama ? `${nama.slice(0, 2)}${'*'.repeat(Math.max(2, nama.length - 2))}@${domain}` : ''
    res.json({ email: tersamar, nama: user?.nama || '', tenant_id: row.tenant_id })
  })

  app.post('/api/auth/magic/consume', ctx.authLimiter, (req, res) => {
    const row = ambilChallenge(db, String(req.body?.token || ''), 'magic')
    if (!row) return res.status(400).json({ error: 'Tautan tidak valid atau sudah kedaluwarsa.' })
    pakaiChallenge(db, row)
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(row.user_id)
    if (!user) return res.status(404).json({ error: 'Akun tidak ditemukan.' })
    // Tautan email TIDAK boleh melewati 2FA: kalau aktif, minta kode dulu.
    const totp = db.prepare('SELECT 1 FROM user_totp WHERE user_id=? AND enabled=1').get(user.id)
    if (totp) {
      const token = buatChallenge(db, { userId: user.id, tenantId: row.tenant_id, jenis: 'mfa', menit: MASA_CHALLENGE_MENIT })
      catatAudit(db, { tenantId: row.tenant_id, userId: user.id, identifier: user.email, metode: 'magic_link', hasil: 'perlu_2fa', req })
      return res.json({ mfa_required: true, challenge_token: token, metode: ['totp', 'recovery'] })
    }
    catatAudit(db, { tenantId: row.tenant_id, userId: user.id, identifier: user.email, metode: 'magic_link', hasil: 'sukses', alasan: 'dipakai', req })
    return terbitkanSesi(ctx, res, user)
  })

  // ---- reset 2FA oleh super admin (akun kehilangan HP)
  app.post('/api/auth/2fa/reset', authMiddleware, (req, res) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Hanya super admin.' })
    const target = String(req.body?.user_id || '')
    const row = db.prepare('SELECT * FROM user_totp WHERE user_id=?').get(target)
    if (!row) return res.status(404).json({ error: 'Pengguna tidak punya 2FA.' })
    db.prepare('DELETE FROM user_totp WHERE user_id=?').run(target)
    catatAudit(db, { tenantId: row.tenant_id, userId: req.user.id, identifier: target, metode: '2fa_reset', hasil: 'sukses', req })
    res.json({ ok: true })
  })

  // ---- riwayat audit (super admin / admin lembaga)
  app.get('/api/auth/audit', authMiddleware, (req, res) => {
    if (!['super_admin', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Tidak berwenang.' })
    const batas = Math.min(200, Math.max(1, Number(req.query.limit) || 50))
    const rows = req.user.role === 'super_admin'
      ? db.prepare('SELECT * FROM auth_audit ORDER BY created_at DESC LIMIT ?').all(batas)
      : db.prepare('SELECT * FROM auth_audit WHERE tenant_id=? ORDER BY created_at DESC LIMIT ?').all(req.tenantId, batas)
    res.json(rows)
  })
}

module.exports = {
  daftarkanRouteKeamanan, siapkanTabel, perluVerifikasi, catatAudit, terbitkanSesi,
  // diekspor untuk pengujian perilaku
  hotp, verifikasiTotp, b32encode, b32decode, enkripsi, dekripsi,
  buatKodeRecovery, hashToken, cekKodeTotp, cekRecovery,
}
