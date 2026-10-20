'use strict'
// Kontrak: OTP WhatsApp + blokir lembaga nonaktif.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const server = baca('server/index.cjs')
const otp = baca('server/otp-login.cjs')
const tenant = baca('server/tenant.cjs')

// ---------- OTP ----------

test('OTP: nomor dinormalisasi ke format 62', () => {
  const { normalNomor } = require(path.join(AKAR, 'server/otp-login.cjs'))
  assert.strictEqual(normalNomor('081234567890'), '6281234567890')
  assert.strictEqual(normalNomor('+6281234567890'), '6281234567890')
  assert.strictEqual(normalNomor('6281234567890'), '6281234567890')
  assert.strictEqual(normalNomor('81234567890'), '6281234567890')
  assert.strictEqual(normalNomor('abc'), '')
  assert.strictEqual(normalNomor(''), '')
})

test('OTP: kode disimpan sebagai hash, bukan teks biasa', () => {
  assert.ok(otp.includes('crypto.createHash'), 'harus memakai hash')
  assert.ok(otp.includes('kode_hash'), 'kolom kode harus hash')
  assert.ok(!/INSERT INTO otp_login[^`]*\bkode\b\s*,/.test(otp), 'kode mentah tidak boleh disimpan')
  assert.ok(otp.includes('timingSafeEqual'), 'perbandingan hash harus constant-time')
})

test('OTP: satu kode hanya bisa dipakai sekali', () => {
  assert.ok(otp.includes('SET used=1'), 'kode harus dimatikan setelah dipakai')
  assert.ok(/AND used=0/.test(otp), 'hanya kode yang belum dipakai yang dicari')
})

test('OTP: berlaku 5 menit dan dibatasi 5 percobaan', () => {
  assert.ok(otp.includes('MASA_BERLAKU_MENIT = 5'), 'masa berlaku 5 menit')
  assert.ok(otp.includes('MAKS_PERCOBAAN = 5'), 'maksimal 5 percobaan')
  assert.ok(otp.includes('attempts=attempts+1'), 'percobaan salah harus dicatat')
})

test('OTP: dibatasi per nomor supaya tidak jadi alat spam', () => {
  assert.ok(otp.includes('JEDA_KIRIM_DETIK'), 'harus ada jeda kirim')
  assert.ok(otp.includes('MAKS_KIRIM_PER_JAM'), 'harus ada batas per jam')
  assert.ok(otp.includes('status(429)'), 'permintaan berlebih harus 429')
})

test('OTP: nomor tak terdaftar tidak membocorkan apa pun', () => {
  // Balasan untuk nomor tak terdaftar harus sama dengan balasan sukses.
  // Sejak perbaikan, cabang ini juga mencatat ke log server (untuk diagnosis)
  // tetapi TETAP membalas objek `balasan` yang sama.
  const i = otp.indexOf('if (!anak.length) {')
  assert.ok(i > 0, 'harus ada cabang nomor tak terdaftar')
  const blok = otp.slice(i, i + 700)
  assert.ok(/return res\.json\(balasan\)/.test(blok), 'balasan harus tetap generik')
  assert.ok(!/res\.status\(4\d\d\)/.test(blok), 'tidak boleh membedakan status HTTP')
  assert.ok(/console\.warn/.test(blok), 'harus dicatat di log untuk diagnosis admin')
})

test('OTP: akun wali memakai sandi acak, bukan 6 digit nomor', () => {
  assert.ok(otp.includes('crypto.randomBytes(24)'), 'sandi cadangan harus acak')
  assert.ok(!/digit\.slice\(-6\)/.test(otp), 'OTP tidak boleh memakai pola 6 digit nomor')
})

test('OTP: route terdaftar di server', () => {
  assert.ok(server.includes("daftarkanRouteOtp"), 'modul OTP harus didaftarkan')
  assert.ok(otp.includes("'/api/auth/otp/request'"), 'endpoint minta kode')
  assert.ok(otp.includes("'/api/auth/otp/verify'"), 'endpoint verifikasi kode')
})

test('OTP: login page menyediakan pilihan masuk lewat WA', () => {
  const ui = baca('src/pages/auth/LoginPage.tsx')
  assert.ok(ui.includes('Nomor WA (OTP)'), 'harus ada tab OTP')
  assert.ok(ui.includes('Kirim Kode ke WhatsApp'), 'harus ada tombol kirim kode')
  assert.ok(ui.includes('handleVerifikasiOtp'), 'harus ada alur verifikasi')
})

// ---------- Lembaga nonaktif ----------

test('lembaga nonaktif TIDAK jatuh ke tenant default', () => {
  // Sebelum perbaikan: host lembaga nonaktif tidak ditemukan (query selalu
  // menyaring aktif=1), lalu kode jatuh ke tenant `default` — subdomainnya
  // tetap menjawab 200. Sekarang harus ditolak 403.
  assert.ok(tenant.includes('TENANT_INACTIVE'), 'harus ada kode penolakan')
  assert.ok(tenant.includes('req.tenantNonaktif'), 'harus menandai tenant nonaktif')
  const iMati = tenant.indexOf('COALESCE(aktif,1)<>1')
  const iFallback = tenant.indexOf('SELECT * FROM tenants WHERE id = ?')
  assert.ok(iMati > 0, 'harus mencari tenant nonaktif secara eksplisit')
  assert.ok(iMati < iFallback, 'pemeriksaan nonaktif harus SEBELUM fallback ke default')
})

test('token lama tidak bisa menembus lembaga nonaktif', () => {
  const blok = server.slice(server.indexOf('function authMiddleware'), server.indexOf('function requireRole'))
  assert.ok(blok.includes('TENANT_INACTIVE'), 'authMiddleware harus menolak tenant nonaktif')
  assert.ok(blok.includes("role !== 'super_admin'"), 'super_admin harus tetap boleh')
  const blokRole = server.slice(server.indexOf('function requireRole'), server.indexOf('function requireRole') + 1400)
  assert.ok(blokRole.includes('TENANT_INACTIVE'), 'requireRole juga harus menolak')
})

test('login menolak lembaga nonaktif', () => {
  const i = server.indexOf("app.post('/api/auth/login'")
  const blok = server.slice(i, i + 2500)
  assert.ok(blok.includes('TENANT_INACTIVE'), 'login harus menolak tenant nonaktif')
})
