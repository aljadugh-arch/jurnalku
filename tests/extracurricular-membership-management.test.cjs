const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const server = read('server/index.cjs')
const tenant = read('server/tenant.cjs')
const ekskulPage = read('src/pages/admin/EkskulPage.tsx')
const attendancePage = read('src/pages/admin/AbsensiEkskulPage.tsx')
const membershipHelper = read('server/extracurricular-membership.cjs')

function routeBody(start, end) {
  const from = server.indexOf(start)
  assert.notEqual(from, -1, `route tidak ditemukan: ${start}`)
  const to = server.indexOf(end, from + start.length)
  assert.notEqual(to, -1, `batas route tidak ditemukan: ${end}`)
  return server.slice(from, to)
}

test('skema anggota ekskul dimigrasikan dan diindeks unik per tenant', () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS ekskul_anggota[\s\S]*tenant_id TEXT NOT NULL[\s\S]*UNIQUE\(tenant_id, ekskul_id, siswa_id\)/)
  assert.match(server, /setupEkskulMembership\(db\)/)
  assert.match(membershipHelper, /CREATE UNIQUE INDEX IF NOT EXISTS idx_ekskul_anggota_tenant_unique ON ekskul_anggota\(tenant_id, ekskul_id, siswa_id\)/)
  assert.match(tenant, /'ekskul_anggota'/)
})

test('API simpan anggota menolak ekskul dan siswa milik tenant lain sebelum replace', () => {
  const route = routeBody("app.post('/api/ekskul/:id/anggota', ADMIN", '// Absensi ekskul')
  assert.match(route, /SELECT id FROM ekskul WHERE id=\? AND tenant_id=\?/)
  assert.match(route, /SELECT id FROM siswa WHERE tenant_id=\? AND id IN/)
  assert.match(route, /new Set/)
  assert.match(route, /Siswa tidak valid atau bukan milik lembaga ini/)
  assert.match(route, /DELETE FROM ekskul_anggota WHERE ekskul_id = \? AND tenant_id = \?/)
  assert.match(route, /INSERT INTO ekskul_anggota \(id, ekskul_id, siswa_id, tenant_id\)/)
})

test('API simpan absensi memastikan kegiatan tenant aktif sebelum menerima anggota', () => {
  const route = routeBody("app.post('/api/absensi-ekskul/bulk', STAFF", '// ==================== KEGIATAN KHUSUS')
  assert.match(route, /SELECT id,pembina_id FROM ekskul WHERE id=\? AND tenant_id=\?/)
  assert.match(route, /Ekstrakurikuler tidak ditemukan/)
  assert.match(route, /allowedMember\.get\(ekskul_id, d\.siswa_id, req\.tenantId\)/)
})

test('API daftar anggota hanya join siswa dan rombel pada tenant aktif', () => {
  const route = routeBody("app.get('/api/ekskul/:id/anggota', authMiddleware", '// Set anggota')
  assert.match(route, /SELECT 1 FROM ekskul WHERE id=\? AND tenant_id=\?/)
  assert.match(route, /JOIN siswa s ON ea\.siswa_id = s\.id AND s\.tenant_id = ea\.tenant_id/)
  assert.match(route, /LEFT JOIN rombel r ON s\.rombel_id = r\.id AND r\.tenant_id = s\.tenant_id/)
  assert.match(route, /ea\.ekskul_id = \? AND ea\.tenant_id = \?/)
})

test('halaman pengelolaan ekskul menyediakan pemilih anggota generik dengan cari dan filter rombel', () => {
  assert.match(ekskulPage, /Atur Anggota/)
  assert.match(ekskulPage, /api\.get\('\/ekskul\/' \+ ekskul\.id \+ '\/anggota'\)/)
  assert.match(ekskulPage, /api\.post\('\/ekskul\/' \+ memberEkskul\.id \+ '\/anggota', \{ siswa_ids:/)
  assert.match(ekskulPage, /Cari nama atau NIS/)
  assert.match(ekskulPage, /Semua Rombel/)
  assert.match(ekskulPage, /Pilih semua yang tampil/)
  assert.match(ekskulPage, /aria-label=\{`Pilih \$\{s\.nama\}/)
})

test('halaman absensi admin memuat hanya anggota kegiatan terpilih, bukan semua siswa', () => {
  assert.match(attendancePage, /api\.get\('\/ekskul\/' \+ selectedEkskul \+ '\/anggota'\)/)
  assert.doesNotMatch(attendancePage, /api\.get\('\/siswa'\)/)
  assert.match(attendancePage, /Belum ada peserta yang ditetapkan/)
  assert.match(attendancePage, /siswaList\.map/)
})

test('daftar ekskul admin menampilkan jumlah anggota tenant-scoped', () => {
  const route = routeBody("app.get('/api/ekskul', authMiddleware", "app.get('/api/guru/ekskul'")
  assert.match(route, /COUNT\(\*\) FROM ekskul_anggota ea/)
  assert.match(route, /ea\.ekskul_id=e\.id AND ea\.tenant_id=e\.tenant_id/)
  assert.match(ekskulPage, /jumlah_anggota/)
})
