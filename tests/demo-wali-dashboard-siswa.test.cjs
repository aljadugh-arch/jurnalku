'use strict'
// Kontrak tiga permintaan user:
//   1. Akun demo HARUS muncul di halaman login jurnal (bukan hanya demo.*)
//   2. Wali murid bisa masuk dengan NOMOR WHATSAPP
//   3. Dashboard siswa mengikuti tata letak referensi (header, kartu pelajaran,
//      kartu kehadiran, grid 8 menu, tugas mendatang)
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

// ── 1. AKUN DEMO ──────────────────────────────────────────────────────────────
test('blok akun demo tampil di semua domain, bukan hanya demo.*', () => {
  const s = baca('src/pages/auth/LoginPage.tsx')
  assert.ok(!/\{\/\^\(demo\\.\|demo-\)\/\.test\(window\.location\.hostname\)/.test(s),
    'kondisi host demo.* harus dihapus agar tombol tampil di jurnal.cc.cd')
  assert.ok(/Akun demo/.test(s))
})

test('demo menyertakan peran wali murid', () => {
  const s = baca('src/pages/auth/LoginPage.tsx')
  assert.ok(/'siswa', 'wali_murid'/.test(s), 'tombol wali murid harus ada')
  const v = baca('server/index.cjs')
  assert.ok(/const allowed = \['admin','kepala','guru','wali_kelas','bendahara','siswa','wali_murid','proktor'\]/.test(v),
    'server harus mengizinkan wali_murid di /api/auth/demo')
})

test('akun demo wali murid ditautkan ke siswa, bukan kosong', () => {
  const s = baca('server/index.cjs')
  assert.ok(/if \(actualRole === 'wali_murid'\)/.test(s),
    'harus ada cabang pembuatan wali_murid demo')
  assert.ok(/INSERT OR IGNORE INTO user_students/.test(s),
    'wali demo wajib punya relasi user_students, kalau tidak dashboardnya nol semua')
})

// ── 2. LOGIN WALI DENGAN NOMOR WA ─────────────────────────────────────────────
test('login menerima nomor WhatsApp wali (setelah cek guru & siswa)', () => {
  const s = baca('server/index.cjs')
  assert.ok(/4\) WALI MURID: login dengan NOMOR WHATSAPP/.test(s))
  assert.ok(/siswa\.no_hp/.test(s) || /COALESCE\(no_hp,''\)/.test(s),
    'nomor wali dibaca dari siswa.no_hp')
  // Urutan penting: cek guru (NIP) & siswa (NIS) HARUS sebelum cek wali via
  // nomor, supaya guru/siswa yang nomornya kebetulan sama dengan no_hp wali
  // siswa tidak salah masuk (terdeteksi) sebagai wali murid.
  assert.ok(s.indexOf('// 2) Kode guru / NIP') < s.indexOf('// 4) WALI MURID'),
    'cek guru harus mendahului cek wali via nomor')
  assert.ok(s.indexOf('// 3) NIS / NISN siswa') < s.indexOf('// 4) WALI MURID'),
    'cek siswa harus mendahului cek wali via nomor')
})

test('nomor dinormalisasi 0../62../+62.. agar format apa pun cocok', () => {
  const s = baca('server/index.cjs')
  assert.ok(/hanyaDigit\.startsWith\('62'\)/.test(s))
  assert.ok(/hanyaDigit\.startsWith\('0'\)/.test(s))
  assert.ok(/hanyaDigit\.startsWith\('8'\)/.test(s))
  assert.ok(/REPLACE\(REPLACE\(REPLACE\(REPLACE\(COALESCE\(no_hp/.test(s),
    'perbandingan harus membersihkan spasi, strip, plus, dan titik')
})

test('password tetap wajib — nomor saja tidak cukup', () => {
  const s = baca('server/index.cjs')
  assert.ok(/sandiDefault = digit\.slice\(-6\)/.test(s), 'sandi default 6 digit terakhir')
  assert.ok(/String\(password\) === sandiDefault/.test(s),
    'harus membandingkan password, bukan langsung meloloskan nomor')
  assert.ok(/bcrypt\.compareSync/.test(s))
})

test('satu nomor wali menautkan SEMUA anak (kakak-adik)', () => {
  const s = baca('server/index.cjs')
  assert.ok(/for \(const a of anakAnak\)/.test(s),
    'harus menautkan setiap anak dengan nomor yang sama')
})

test('halaman login menyediakan tab OTP untuk wali', () => {
  // Keterangan panjang di halaman login sengaja dihapus atas permintaan
  // pemilik produk. Yang harus tetap ada adalah JALANNYA: tab OTP dan tombol
  // kirim kode — bukan paragraf penjelasan.
  const s = baca('src/pages/auth/LoginPage.tsx')
  assert.ok(/Nomor WA \(OTP\)/.test(s), 'tab OTP harus ada')
  assert.ok(/Kirim Kode ke WhatsApp/.test(s), 'tombol kirim kode harus ada')
  assert.ok(/Nomor WhatsApp/.test(s), 'kolom nomor harus ada')
})

// ── 3. DASHBOARD SISWA ────────────────────────────────────────────────────────
test('dashboard punya 5 blok sesuai referensi', () => {
  const s = baca('src/pages/siswa/MobileSiswaDashboard.tsx')
  assert.ok(/Halo, \{namaPanggilan/.test(s), 'header sapaan')
  assert.ok(/Pelajaran berikutnya/.test(s) && /Sedang berlangsung/.test(s), 'kartu pelajaran')
  assert.ok(/Kehadiran Anda:/.test(s), 'kartu kehadiran')
  assert.ok(/Tugas Mendatang/.test(s) && /Lihat Semua/.test(s), 'tugas mendatang')
  assert.ok(/Scan/.test(s) && /Kehadiran</.test(s), 'tombol scan kehadiran')
})

test('grid menu 8 tile, 4 kolom, warna pastel berbeda', () => {
  const s = baca('src/pages/siswa/MobileSiswaDashboard.tsx')
  assert.ok(/grid-cols-4/.test(s))
  // 'Lainnya' memakai bg-slate-100 (bukan -50), jadi pola harus menerima
  // nuansa 50 maupun 100 tanpa melemahkan jumlah tile.
  const tile = s.match(/\{ label: '[^']+', icon: \w+, path: '[^']+', bg: 'bg-[a-z]+-\d{2,3}'/g) || []
  assert.strictEqual(tile.length, 8, `harus 8 tile, dapat ${tile.length}`)
  assert.ok(/Nilai/.test(s) && /Keuangan/.test(s) && /Tabungan/.test(s) && /Perpus/.test(s))
  assert.ok(/Kalender/.test(s) && /Ujian/.test(s) && /Konseling/.test(s) && /Lainnya/.test(s))
})

test('header memakai rombel dan nama lembaga dari server', () => {
  const s = baca('src/pages/siswa/MobileSiswaDashboard.tsx')
  assert.ok(/rombel_nama/.test(s) && /nama_lembaga/.test(s))
  const v = baca('server/index.cjs')
  assert.ok(/r\.nama AS rombel_nama FROM siswa s/.test(v),
    'server harus mengirim rombel_nama')
  assert.ok(/siswa\.nama_lembaga = String\(set\?\.nama_lembaga/.test(v),
    'server harus mengirim nama_lembaga')
})

test('setiap tile menu menunjuk rute yang benar-benar ada', () => {
  const fs2 = require('node:fs')
  const app = fs2.readFileSync(path.join(AKAR, 'src/App.tsx'), 'utf8')
  const dash = baca('src/pages/siswa/MobileSiswaDashboard.tsx')
  const rute = new Set(['/siswa'])
  for (const m of app.matchAll(/<Route path="([a-z0-9-]+)"/g)) rute.add('/siswa/' + m[1])
  const dipakai = [...dash.matchAll(/path: '(\/siswa\/[a-z0-9-]+)'/g)].map(m => m[1])
  assert.ok(dipakai.length >= 8)
  const mati = dipakai.filter(p => !rute.has(p))
  assert.deepStrictEqual(mati, [], `tile menu menunjuk rute yang tidak ada: ${mati.join(', ')}`)
})

test('login me-resolve tenant dari host, tidak selalu jatuh ke default', () => {
  const v = baca('server/index.cjs')
  const i = v.indexOf("app.post('/api/auth/login'")
  const blok = v.slice(i, i + 900)
  assert.ok(/if \(!req\.tenantId\)/.test(blok),
    'login harus mengisi req.tenantId dari host bila kosong')
  assert.ok(/tenantDariHost\(hostPermintaan\(req\)\)/.test(blok),
    'tanpa ini login dari domain lembaga mencari user di tenant yang salah')
})

test('ada middleware GLOBAL yang mengisi req.tenantId dari host', () => {
  const v = baca('server/index.cjs')
  const i = v.indexOf('Resolusi tenant GLOBAL dari host')
  assert.ok(i > 0, 'middleware resolusi tenant harus ada')
  const blok = v.slice(i, i + 900)
  assert.ok(/app\.use\(\(req, _res, next\) =>/.test(blok))
  assert.ok(/if \(!req\.tenantId\)/.test(blok), 'hanya mengisi bila kosong')
  assert.ok(/tenantDariHost\(hostPermintaan\(req\)\)/.test(blok))
  // Harus terpasang SEBELUM route login & settings, kalau tidak tidak berpengaruh.
  const iLogin = v.indexOf("app.post('/api/auth/login'")
  const iSettings = v.indexOf("app.get('/api/settings'")
  assert.ok(i < iLogin && i < iSettings,
    'middleware harus berada sebelum route login dan /api/settings')
  // TAPI juga harus SETELAH `const db = new Database(...)`.
  // Kalau dipasang sebelum db dibuat, tenantDariHost melempar ReferenceError
  // (TDZ) di setiap request, ditelan catch, dan req.tenantId tetap kosong —
  // middleware tampak terpasang tetapi tidak pernah bekerja.
  const iDb = v.indexOf('const db = new Database(dbPath)')
  assert.ok(iDb > 0 && i > iDb,
    'middleware tenant harus setelah db dibuat, kalau tidak selalu gagal diam-diam')
})

test('isolasi tenant tidak melemah: JWT tetap menimpa tenant dari host', () => {
  const v = baca('server/index.cjs')
  const auth = v.slice(v.indexOf('function authMiddleware'), v.indexOf('function authMiddleware') + 900)
  assert.ok(/if \(req\.user\.tenant_id\) req\.tenantId = req\.user\.tenant_id/.test(auth),
    'tenant dari token harus tetap menimpa tenant dari host')
})

test('tenantMiddleware membaca x-forwarded-host, bukan hanya host', () => {
  const t = baca('server/tenant.cjs')
  const i = t.indexOf('function tenantMiddleware')
  const blok = t.slice(i, i + 1400)
  assert.ok(/req\.headers\['x-forwarded-host'\]/.test(blok),
    'di belakang Caddy, headers.host adalah 127.0.0.1:3002 — domain asli ada di x-forwarded-host')
  assert.ok(/split\(','\)\[0\]/.test(blok), 'harus ambil host pertama bila berantai')
})

test('base_domain dipakai tepat satu lembaga hanya untuk domain non-kanonik', () => {
  const t = baca('server/tenant.cjs')
  assert.ok(/base_domain.*AND aktif=1/.test(t),
    'query base_domain tetap ada (untuk domain custom yang bukan pintu platform)')
  assert.ok(/rows\.length === 1/.test(t),
    'domain yang dipakai banyak tenant (jurnal.cc.cd) TIDAK boleh dianggap milik satu lembaga')
  assert.ok(/if \(!tenant && !canonicalHost\)/.test(t),
    'root domain kanonik (jurnalmadrasah.web.id dst) jadi pintu platform, TIDAK diresolusi ke lembaga')
})

test('tombol demo hanya tampil di host yang benar-benar dilayani server', () => {
  const login = baca('src/pages/auth/LoginPage.tsx')
  const srv = baca('server/index.cjs')

  // Server harus membaca x-forwarded-host. Tanpa ini, di belakang Caddy semua
  // host terlihat sebagai 127.0.0.1:3002 dan tombol demo selalu dibalas 404.
  const blok = srv.slice(srv.indexOf("app.post('/api/auth/demo'"))
  const awal = blok.slice(0, 700)
  assert.ok(/x-forwarded-host/.test(awal),
    'route demo harus membaca x-forwarded-host, bukan headers.host')

  // Visibilitas tombol harus mengikuti daftar host server, bukan `true`.
  assert.ok(/demoHostAktif/.test(login), 'tombol demo butuh penjaga host')
  assert.ok(!/\{true && \(/.test(login),
    'jangan tampilkan tombol demo tanpa syarat di domain lembaga')
  // Sumber kebenaran daftar host ada di SERVER (/api/demo-status), bukan
  // diduplikasi di frontend — satu aturan supaya tampilan dan route tidak bisa
  // melenceng. Frontend cukup memanggil endpoint itu.
  assert.ok(/demo-status/.test(login),
    'frontend harus memakai /api/demo-status, bukan daftar host hardcoded')
})
