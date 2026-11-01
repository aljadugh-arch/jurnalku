'use strict'
// Lanjutan: sebutan di halaman LMS/Beasiswa/Kantin/Cashless/Monitoring/Foundation/
// Program Peserta, dan filter Rombel pada ekspor jurnal (per kelas).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const baca = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

test('halaman transaksi memakai sebutan tipe institusi, bukan "Siswa" mati', () => {
  const files = [
    'src/pages/admin/LmsPage.tsx', 'src/pages/admin/BeasiswaPage.tsx',
    'src/pages/admin/KantinOrdersPage.tsx', 'src/pages/admin/CashlessTopupPage.tsx',
    'src/pages/admin/AdminMonitoringNilaiPage.tsx', 'src/pages/admin/FoundationSyncPage.tsx',
    'src/pages/admin/ProgramPesertaPage.tsx',
  ]
  for (const f of files) {
    const s = baca(f)
    assert.match(s, /useTerminologi/, `${f}: harus memakai hook terminologi`)
    assert.match(s, /\{t\.siswa\}/, `${f}: label siswa memakai t.siswa`)
    assert.doesNotMatch(s, />Siswa<\/th>/, `${f}: masih ada header "Siswa" hardcoded`)
    assert.doesNotMatch(s, />Siswa<\/label>/, `${f}: masih ada label "Siswa" hardcoded`)
  }
})

test('server /api/jurnal menerima filter rombel_id', () => {
  const srv = baca('server/index.cjs')
  const blok = srv.slice(srv.indexOf("app.get('/api/jurnal'"), srv.indexOf("app.post('/api/jurnal'"))
  assert.match(blok, /rombel_id \} = req\.query/, 'destructure rombel_id')
  assert.match(blok, /where\.push\('j\.rombel_id = \?'\)/, 'WHERE rombel_id')
})

test('ekspor jurnal memakai filter rombel (per kelas)', () => {
  const jurnal = baca('src/pages/admin/JurnalPage.tsx')
  assert.match(jurnal, /rombel_id: ''/, 'state filter rombel')
  assert.match(jurnal, /params\.rombel_id = filter\.rombel_id/, 'ekspor mengirim rombel_id')
  assert.match(jurnal, /<\option value="">\{t\.rombel\} — semua<\/option>/, 'opsi "semua rombel" berlabel terminologi')
  assert.match(jurnal, /Jurnal_Mengajar_\$\{String\(namaRombel\)/, 'nama berkas menyertakan rombel')
})
