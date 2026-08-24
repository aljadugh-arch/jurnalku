const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('dashboard guru menyediakan tombol Masuk Kelas yang membuka jurnal mengajar', () => {
  const source = read('src/pages/guru/GuruDashboard.tsx')
  assert.match(source, />\s*Masuk Kelas\s*</)
  assert.match(source, /onClick=\{\(\) => navigate\('\/guru\/jurnal'\)\}/)
})

test('landing page memakai istilah lembaga dan tidak memakai sekolah pada copy publik', () => {
  const source = read('src/pages/LandingPage.tsx')
  assert.doesNotMatch(source, />[^<{]*(?:Sekolah|sekolah)[^<{]*</)
  assert.match(source, /Kelola Lembaga/)
  assert.match(source, /100\+ Lembaga/)
  assert.match(source, /Digitalisasi Lembaga Anda/)
})
