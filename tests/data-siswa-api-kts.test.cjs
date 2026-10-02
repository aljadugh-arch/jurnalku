'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')

test('API siswa menerima filter jenis kelamin L/P secara tenant-scoped', () => {
  const source = fs.readFileSync('server/index.cjs', 'utf8')
  const route = source.slice(source.indexOf("app.get('/api/siswa'"))
  assert.match(route, /jenis_kelamin.*req\.query/)
  assert.match(route, /UPPER\(s\.jenis_kelamin\)/)
  assert.match(route, /\['L', 'P'\]/)
})

test('KTS memakai artwork depan dan belakang masing-masing tanpa menukar sisi', () => {
  const source = fs.readFileSync('server/kts-pdf-service.cjs', 'utf8')
  assert.match(source, /const frontBg = resolveUpload\(uploadDir, settings\.kts_depan\)/)
  assert.match(source, /const backBg = resolveUpload\(uploadDir, settings\.kts_belakang\)/)
  assert.match(source, /doc\.image\(frontBg, 0, 0/)
  assert.match(source, /doc\.image\(backBg, 0, 0/)
  assert.match(source, /siswa\.nama/)
})
