const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const dashboard = fs.readFileSync(path.join(root, 'src/pages/guru/GuruDashboard.tsx'), 'utf8')
const jurnal = fs.readFileSync(path.join(root, 'src/pages/guru/GuruJurnalPage.tsx'), 'utf8')
const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')

test('dashboard schedule opens journal with the exact selected schedule', () => {
  assert.match(dashboard, /navigate\(`\/guru\/jurnal\?jadwal_id=\$\{encodeURIComponent\(j\.id\)\}`\)/)
  assert.match(jurnal, /useSearchParams/)
  assert.match(jurnal, /searchParams\.get\('jadwal_id'\)/)
  assert.match(jurnal, /x\.jadwal_id === requestedJadwalId/)
})

test('journal schedule API matches the dashboard mapel-only tenant-scoped contract', () => {
  const route = server.slice(server.indexOf("app.get('/api/jurnal/jadwal-hari-ini'"), server.indexOf("app.get('/api/jurnal/me'"))
  assert.match(route, /j\.jenis_kegiatan = 'mapel'/)
  assert.match(route, /m\.tenant_id = j\.tenant_id/)
  assert.match(route, /r\.tenant_id = j\.tenant_id/)
})

test('teacher journal writes must match an assigned mapel-rombel pair', () => {
  const route = server.slice(server.indexOf("app.post('/api/jurnal', STAFF"), server.indexOf("app.put('/api/jurnal/:id'"))
  assert.match(route, /Jadwal\/rombel tidak sesuai dengan penugasan guru/)
  assert.match(route, /FROM jadwal WHERE gtk_id=\? AND mapel_id=\? AND rombel_id=\? AND tenant_id=\?/) 
})
