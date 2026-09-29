'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')

test('menu Generate KTS mengunduh PDF, bukan hanya menampilkan toast data JSON', () => {
  const page = fs.readFileSync('src/pages/admin/DataSiswaPage.tsx', 'utf8')
  assert.match(page, /responseType:\s*'blob'/)
  assert.match(page, /kartu-tanda-siswa\.pdf/)
  assert.match(page, /URL\.createObjectURL/)
})

test('endpoint Generate KTS menghasilkan PDF dan memakai kts_depan/kts_belakang', () => {
  const source = fs.readFileSync('server/index.cjs', 'utf8')
  const route = source.slice(source.indexOf("app.post('/api/siswa/generate-kts'"))
  assert.match(route, /Content-Type.*application\/pdf/)
  assert.match(route, /kts_depan, kts_belakang/)
  assert.doesNotMatch(route, /SELECT kts_template FROM settings/)
})
