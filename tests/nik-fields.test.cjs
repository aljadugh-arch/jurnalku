const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')

const server = fs.readFileSync('server/index.cjs', 'utf8')
const siswa = fs.readFileSync('src/pages/admin/DataSiswaPage.tsx', 'utf8')
const gtk = fs.readFileSync('src/pages/admin/DataGTKPage.tsx', 'utf8')
const tenant = fs.readFileSync('server/tenant.cjs', 'utf8')

test('schema migrates NIK columns for existing tenant databases', () => {
  assert.match(server + tenant, /ADD COLUMN \$\{column\} TEXT|ADD COLUMN nik TEXT/)
  assert.match(server, /nik TEXT,/)
})

test('student API accepts, searches, and persists tenant-scoped NIK', () => {
  assert.match(server, /s\.nik LIKE \?/)
  assert.match(server, /INSERT INTO siswa \(id, nik, nis, nisn/)
  assert.match(server, /UPDATE siswa SET/)
  assert.match(server, /nik/)
})

test('GTK API accepts, searches, and persists tenant-scoped NIK', () => {
  assert.match(server, /g\.nik LIKE \?/)
  assert.match(server, /INSERT INTO gtk \(id, nik, nip, nuptk/)
  assert.match(server, /UPDATE gtk SET nik=\?, nip=\?/)
})

test('student and GTK screens expose NIK in form, detail, import, and export', () => {
  for (const source of [siswa, gtk]) {
    assert.match(source, /nik/)
    assert.match(source, /NIK/)
    assert.match(source, /columnMap=.*nik|nik.*columnMap/s)
  }
})

test('NIK validation rejects non-16-digit values', () => {
  assert.match(server + tenant, /nik.*16|16.*nik/i)
})
