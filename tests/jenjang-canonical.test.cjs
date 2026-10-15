const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server', 'index.cjs'), 'utf8')
const jenjangLib = fs.readFileSync(path.join(root, 'src', 'lib', 'jenjang.ts'), 'utf8')
const jadwalPage = fs.readFileSync(path.join(root, 'src', 'pages', 'admin', 'JadwalPage.tsx'), 'utf8')

// Ekstrak & jalankan canonicalJenjang dari lib frontend (TS -> JS sederhana).
function loadFrontendCanonical() {
  const start = jenjangLib.indexOf('const JENJANG_ALIAS')
  const end = jenjangLib.indexOf('/** RA/TK dan MI/SD')
  const body = jenjangLib.slice(start, end)
    .replace('export function canonicalJenjang(jenjang?: string): string', 'function canonicalJenjang(jenjang)')
    .replace('const JENJANG_ALIAS: Array<[RegExp, string]> = [', 'const JENJANG_ALIAS = [')
  const mod = new Function('return (() => {' + body + '; return canonicalJenjang})()')()
  return mod
}

test('server menormalkan label jenjang panjang ke kode kanonik', () => {
  assert.match(server, /function canonicalJenjang/, 'helper server ada')
  assert.match(server, /madrasah\\s\+tsanawiyah\|tsanawiyah/i, 'alias MTs ada')
  assert.match(server, /tenantUsesClassTeacherDailyAttendance\(tenantId\) \{\s*return \['RA', 'TK', 'MI', 'SD'\]\.includes\(canonicalJenjang\(tenantId\)\)/s, 'cek guru-kelas pakai canonical')
  assert.match(server, /tenantUsesLegacyStudentQrWindow\(tenantId\) \{\s*return \[[^\]]*'MTs'[^\]]*\]\.includes\(canonicalJenjang\(tenantId\)\)/s, 'cek MTs pakai canonical')
})

test('server tidak lagi membandingkan nilai jenjang mentah', () => {
  // pola lama: const jenjang = ...; ['RA','TK','MI','SD'].includes(jenjang)
  assert.doesNotMatch(server, /includes\(jenjang\)\)/, 'tidak ada includes(jenjang) mentah yang tersisa')
})

test('canonicalJenjang frontend: label panjang & kode pendek', () => {
  const c = loadFrontendCanonical()
  assert.equal(c('Madrasah Tsanawiyah'), 'MTs')
  assert.equal(c('Madrasah Ibtidaiyah'), 'MI')
  assert.equal(c('MI'), 'MI')
  assert.equal(c('mts'), 'MTs')
  assert.equal(c('Sekolah Dasar'), 'SD')
  assert.equal(c('Sekolah Menengah Pertama'), 'SMP')
  assert.equal(c(''), '')
  assert.equal(c('Madrasah Aliyah'), 'MA')
})

test('isGuruKelasJenjang benar untuk label panjang (bug 403 jadwal)', () => {
  // MTs (label panjang) BUKAN guru-kelas -> panel MI/SD tidak muncul, tak panggil endpoint 403
  const c = loadFrontendCanonical()
  const guruKelas = (j) => ['RA', 'TK', 'MI', 'SD'].includes(c(j))
  assert.equal(guruKelas('Madrasah Tsanawiyah'), false, 'MTs tidak dianggap guru-kelas')
  assert.equal(guruKelas('Madrasah Ibtidaiyah'), true, 'MI dianggap guru-kelas')
  assert.equal(guruKelas('MI'), true)
})

test('JadwalPage memakai helper kanonik (bukan daftar sempit sendiri)', () => {
  assert.match(jadwalPage, /isGuruKelasJenjangCode/, 'memakai helper kanonik')
  assert.doesNotMatch(jadwalPage, /\['mi', 'sd'\]\.includes\(jenjang\.toLowerCase\(\)\)/, 'bukan lagi cek sempit bawaan')
  // Endpoint jam pulang hanya dipanggil utk jenjang guru-kelas (hindari 403 utk MTs).
  assert.match(jadwalPage, /isGuruKelasJenjang \? api\.get\('\/rombel-jam-pulang'\)/, 'panggilan jam pulang dijaga kondisi jenjang')
})
