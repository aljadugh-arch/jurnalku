const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const server = read('server/backup-drive.cjs')
const page = read('src/pages/admin/BackupRestorePage.tsx')

test('endpoint unduh backup lokal ada & tanpa Google Drive', () => {
  assert.match(server, /app\.get\('\/api\/backup\/download'/, 'route GET /api/backup/download')
  assert.match(server, /function buildBackup|const buildBackup/, 'helper buildBackup dipakai bersama')
  // buildBackup tidak memanggil resolveAuth/driveUpload
  const fn = server.slice(server.indexOf('const buildBackup'), server.indexOf('const runBackupForTenant'))
  assert.doesNotMatch(fn, /resolveAuth|driveUpload/, 'buildBackup tidak menyentuh Drive')
  assert.match(server, /application\/gzip/, 'content-type gzip')
  assert.match(server, /Content-Disposition.*attachment/, 'attachment header')
})

test('backup/run memakai buildBackup (artefak sama dengan unduhan)', () => {
  const run = server.slice(server.indexOf("app.post('/api/backup/run'"), server.indexOf("app.get('/api/backup/download'"))
  assert.match(run, /buildBackup\(req\.tenantId\)/, 'run memakai buildBackup')
})

test('UI: tombol unduh lokal + petunjuk saat backup Drive gagal', () => {
  assert.match(page, /downloadLocalBackup/, 'fungsi unduh lokal')
  assert.match(page, /api\.get\('\/backup\/download', \{ responseType: 'blob' \}\)/, 'memanggil endpoint unduh')
  assert.match(page, /Unduh backup \(lokal\)/, 'label tombol')
  assert.match(page, /tetap bisa memakai tombol "Unduh backup \(lokal\)"/, 'pesan saat backup gagal mengarahkan ke unduhan')
})
