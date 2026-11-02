// Kontrak UI keamanan akun: tab masuk, langkah 2FA, tautan email, kartu profil.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const baca = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')

test('login punya tiga cara masuk: sandi, OTP WA, tautan email', () => {
  const s = baca('src/pages/auth/LoginPage.tsx')
  assert.ok(s.includes("['sandi', 'Sandi']") && s.includes("['otp', 'OTP WA']") && s.includes("['tautan', 'Tautan Email']"))
  assert.ok(s.includes('/auth/magic/peek'), 'tautan dibaca dulu tanpa menghanguskan token')
  assert.ok(s.includes('mfa_required'), 'login menangani tantangan 2FA')
})

test('login tanpa sandi memakai kode authenticator', () => {
  const s = baca('src/pages/auth/LoginPage.tsx')
  assert.ok(s.includes('masukDenganTotp'), 'memanggil endpoint totp-login')
  assert.ok(s.includes('Masuk Tanpa Sandi'))
})

test('profil menyediakan aktivasi 2FA + kode pemulihan', () => {
  const s = baca('src/pages/ProfilePage.tsx')
  assert.ok(s.includes("api.post('/auth/2fa/setup')"))
  assert.ok(s.includes("api.post('/auth/2fa/enable'"))
  assert.ok(s.includes('QRCodeSVG'), 'QR authenticator dirender lokal')
  assert.ok(s.includes('recovery_codes'), 'kode pemulihan ditampilkan sekali')
  assert.ok(s.includes('Simpan kode pemulihan'), 'peringatan menyimpan kode')
})

test('kartu install PWA tidak menutupi form login', () => {
  const s = baca('src/components/PwaInstallPrompt.tsx')
  assert.ok(s.includes('useLocation'), 'memakai pathname')
  assert.ok(s.includes('RUTE_TANPA_PROMPT'), 'punya daftar rute tanpa prompt')
  for (const r of ['login', 'register', 'forgot-password']) {
    assert.ok(s.includes(r), `rute ${r} dikecualikan`)
  }
  assert.ok(s.includes('if (RUTE_TANPA_PROMPT.test(pathname)) return null'), 'berhenti sebelum render')
})

test('LoginPage: tidak ada hook setelah early return (React #300)', () => {
  const s = baca('src/pages/auth/LoginPage.tsx')
  const baris = s.split('\n')
  const batas = baris.findIndex(l => l.includes('if (authReady && isAuthenticated'))
  assert.ok(batas > 0, 'early return ditemukan')
  const pelanggaran = baris
    .map((l, i) => ({ l, i }))
    .filter(({ l, i }) => i > batas && /^\s*(use[A-Z]\w*|useEffect|useState|useMemo|useRef|useCallback)\s*\(/.test(l))
  assert.deepEqual(pelanggaran.map(p => p.i + 1), [], 'hook setelah return akan memicu React error #300')
  // Hook yang dipakai wajib berada sebelum return.
  assert.ok(baris.slice(0, batas).some(l => l.includes('useEffect(() => {')), 'useEffect magic ada sebelum return')
})
