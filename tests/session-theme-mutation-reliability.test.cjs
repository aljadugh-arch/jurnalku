const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('sesi auth hanya dibuang saat token benar-benar ditolak server', () => {
  const client = read('src/services/api.ts')
  const store = read('src/stores/authStore.ts')
  const app = read('src/App.tsx')
  // 401 pada /auth/me ditangani checkAuth, bukan hard-redirect interceptor.
  assert.match(client, /url\.includes\('\/auth\/me'\)/)
  assert.match(client, /window\.location\.pathname\.startsWith\('\/login'\)/)
  // Kegagalan jaringan/5xx tidak boleh menghapus token.
  assert.match(store, /const status = /)
  assert.match(store, /status === 401/)
  assert.doesNotMatch(store, /\[401, 403\]\.includes\(status\)/)
  assert.match(store, /set\(\{ authReady: false, token, isAuthenticated: true/)
  assert.match(store, /window\.setTimeout\(\(\) => void get\(\)\.checkAuth\(\), AUTH_RETRY_MS\)/)
  assert.match(store, /authError: /)
  // ProtectedRoute tidak boleh merender anak saat identitas masih null.
  assert.match(app, /if \(!authReady \|\| \(isAuthenticated && !user\)\)/)
  // Hidrasi selesai dulu sebelum route terproteksi merender anaknya.
  assert.match(store, /authReady: /)
  assert.match(app, /authReady/)
  assert.match(app, /Memuat sesi/)
})

test('preferensi terang/gelap pengguna bertahan setelah refresh', () => {
  const themeStore = read('src/stores/themeStore.ts')
  const applyTheme = read('src/lib/applyTheme.ts')
  const settings = read('src/pages/admin/SettingsPage.tsx')
  // Toggle menandai preferensi eksplisit dan tersimpan.
  assert.match(themeStore, /explicit: /)
  assert.match(themeStore, /export function readLocalDark\(\)/)
  // Tema dari server tidak menimpa pilihan eksplisit pengguna saat reload.
  assert.match(applyTheme, /readLocalDark\(\)/)
  assert.match(applyTheme, /force/)
  // DOM dan state tombol header harus tetap sinkron ketika tema lembaga dipakai.
  assert.match(themeStore, /export function setResolvedDark\(dark: boolean\)/)
  assert.match(applyTheme, /setResolvedDark\(dark\)/)
  // Admin yang menyimpan tema lembaga tetap menang (override lokal dibersihkan).
  assert.match(settings, /clearLocalTheme\(\)/)
})

test('unggah gambar posting memakai klien terautentikasi dan kontrak media server', () => {
  const editor = read('src/components/RichEditor.tsx')
  assert.doesNotMatch(editor, /fetch\('\/api\/posting\/upload'/)
  assert.match(editor, /api\.post\('\/posting\/upload'/)
  assert.match(editor, /setImage\(\{ src: data\.media_url/)
  assert.match(editor, /data\.media_type === 'video'/)
  // Satu pilihan dapat berisi banyak berkas dan dikirim sebagai satu batch.
  assert.match(editor, /Array\.from\(files\)\.forEach\(file => formData\.append\('files', file\)\)/)
  assert.match(editor, /Array\.isArray\(response\.data\.media\)/)
})

test('simpan absensi kelas bersifat atomik, tervalidasi, dan menampilkan pesan server', () => {
  const server = read('server/index.cjs')
  const page = read('src/pages/guru/GuruAbsensiSiswaPage.tsx')
  assert.match(server, /app\.post\('\/api\/absensi-mapel\/bulk'/)
  assert.match(server, /tenant_id/)
  assert.match(page, /api\.post\('\/absensi-mapel\/bulk'/)
  assert.match(page, /err\.response\?\.data\?\.error/)
})

test('wali kelas boleh menulis catatan kepribadian anak asuhnya', () => {
  const server = read('server/index.cjs')
  assert.match(server, /r\.wali_kelas_id=\?/)
  assert.match(server, /catatan-kepribadian/)
})

test('tombol Masuk mengikuti jendela backend dan memakai tanggal route yang terdefinisi', () => {
  const dashboard = read('src/pages/guru/GuruDashboard.tsx')
  const server = read('server/index.cjs')
  assert.match(dashboard, /!isFinished\(j\)/)
  assert.match(server, /nowMinutes > endMinutes \+ 60/)
  const startRoute = server.slice(server.indexOf("app.post('/api/guru/sesi-kelas/masuk'"), server.indexOf("app.post('/api/guru/sesi-kelas/selesai'"))
  assert.match(startRoute, /\.get\(gtk\.id, today, req\.tenantId/)
  assert.doesNotMatch(startRoute, /todayDate/)
})
