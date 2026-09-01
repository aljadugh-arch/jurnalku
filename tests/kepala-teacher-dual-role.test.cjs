const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const server = read('server/index.cjs')
const app = read('src/App.tsx')
const authStore = read('src/stores/authStore.ts')
const userManagement = read('src/pages/admin/UserManagementPage.tsx')
const sidebar = read('src/components/layout/Sidebar.tsx')
const header = read('src/components/layout/Header.tsx')

function block(start, end) {
  const from = server.indexOf(start)
  assert.notEqual(from, -1, `blok tidak ditemukan: ${start}`)
  const to = server.indexOf(end, from)
  return server.slice(from, to === -1 ? server.length : to)
}

test('akun kepala menyimpan capability mengajar tanpa role atau profil GTK kedua', () => {
  assert.match(server, /can_teach INTEGER NOT NULL DEFAULT 0/)
  assert.match(server, /ALTER TABLE users ADD COLUMN can_teach INTEGER NOT NULL DEFAULT 0/)
  assert.match(server, /SELECT id, nama, email, role, nip, nis, avatar, gtk_id, can_teach FROM users WHERE id = \? AND tenant_id = \?/)
  assert.match(userManagement, /can_teach/)
  assert.match(userManagement, /Kepala ini juga mengajar/)
})

test('token dan respons auth memuat capability mengajar akun yang sama', () => {
  const login = block("app.post('/api/auth/login'", "app.get('/api/auth/me'")
  assert.match(login, /can_teach: !!user\.can_teach/)
  assert.match(authStore, /can_teach/)
  assert.match(read('src/types/index.ts'), /can_teach\?: boolean/)
})

test('kepala yang mengajar dapat membuka dashboard guru dan berpindah konteks', () => {
  assert.match(app, /canAccessRole\(user, allowedRoles\)/)
  assert.match(app, /allowedRoles=\{\['guru', 'wali_kelas'\]\}/)
  assert.match(sidebar, /Mode Guru/)
  assert.match(sidebar, /Mode Manajemen/)
  assert.match(header, /Mode Guru/)
  assert.match(header, /Mode Manajemen/)
})

test('API guru menerima capability kepala tetapi tetap memakai GTK tenant yang tertaut', () => {
  assert.match(server, /const TEACHER = requireCapability\('teacher'\)/)
  assert.match(server, /userHasCapability\(req\.user, 'teacher'\)/)
  assert.match(server, /!!stored\?\.can_teach && !!resolveGtkForUser\(user\.id, user\.tenant_id\)/)
})
