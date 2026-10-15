const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

const server = read('server/backup-drive.cjs')
const page = read('src/pages/admin/BackupRestorePage.tsx')

test('pesan galat token Google diterjemahkan ke tindakan (invalid_grant)', () => {
  assert.match(server, /function googleTokenError/, 'helper googleTokenError ada')
  assert.match(server, /invalid_grant/, 'mendeteksi invalid_grant')
  assert.match(server, /Hubungkan ulang Google/, 'pesan menyuruh hubungkan ulang')
  // kedua jalur (SA & OAuth2) memakai helper
  assert.equal((server.match(/googleTokenError\('(SA|OAuth2)'/g) || []).length, 2, 'SA + OAuth2 pakai helper')
})

test('status mengembalikan reauth_required saat token kedaluwarsa', () => {
  assert.match(server, /reauth_required/, 'flag reauth_required ada')
  assert.match(server, /kedaluwarsa atau dicabut\|invalid_grant\|expired or revoked/, 'regex deteksi reauth')
})

test('endpoint putus koneksi Google Drive ada', () => {
  assert.match(server, /app\.delete\('\/api\/google-drive\/connection'/, 'route DELETE connection')
  assert.match(server, /tenantTokenPath\(req\.tenantId\)/, 'menghapus token per-tenant')
})

test('UI: tombol hubungkan-ulang + putus + banner reauth', () => {
  assert.match(page, /reauth_required/, 'UI membaca reauth_required')
  assert.match(page, /Hubungkan ulang Google/, 'label tombol hubungkan ulang')
  assert.match(page, /disconnectDrive/, 'fungsi putus koneksi')
  assert.match(page, /api\.delete\('\/google-drive\/connection'\)/, 'memanggil endpoint putus')
  assert.match(page, /sudah kedaluwarsa \/ dicabut/, 'banner penjelasan')
})
