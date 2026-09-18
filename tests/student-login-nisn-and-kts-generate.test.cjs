const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')

test('RED: siswa dapat login dengan NIS atau NISN tanpa menambah akun di setting', () => {
  // Langkah 1: Ada helper/rute yang mencoba NIS + NISN saat mencari akun siswa
  assert.match(server, /ensureStudentUser|byNis|byNisn/, 'Helper mencari siswa berdasarkan NIS atau NISN')
  
  // Langkah 2: Login route menerima email/NIS dan mencoba cocokkan dengan NIS atau NISN
  assert.match(server, /SELECT.*FROM users.*WHERE.*(nis|nisn)|nis.*=.*nisn/, 'Query login cocokkan NIS/NISN')
  
  // Langkah 3: Password awal NIS atau NISN disimpan saat akun dibuat
  assert.match(server, /studentInitialPassword|bcrypt.hashSync.*nis|bcrypt.hashSync.*nisn/, 'Hash password awal siswa')
})

test('RED: template KTS dapat diunduh dari menu Settings', () => {
  // Langkah 1: Ada route untuk mengambil template KTS
  assert.match(server, /\/api\/(settings|kts).*template|GET.*kts.*template/, 'Route GET template KTS')
  
  // Langkah 2: Template KTS disimpan per tenant
  assert.match(server, /kts_template|template_kts|settings.*kts/, 'Penyimpanan template KTS per tenant')
})

test('RED: generate KTS endpoint menggabungkan template, QR, dan data siswa', () => {
  // Langkah 1: Ada route POST untuk generate KTS
  assert.match(server, /\/api\/(siswa|kts).*generate|generate.*kts/, 'Route POST generate KTS')
  
  // Langkah 2: Endpoint dapat menerima siswa_id atau daftar siswa
  assert.match(server, /siswa_id|siswa.*list|bulk.*kts/, 'Generate KTS per siswa atau massal')
  
  // Langkah 3: Output adalah file PDF atau gambar dengan QR tertanam
  assert.match(server, /pdf|png|image.*qr|qr.*generate/, 'Output berisi QR dan format media')
})

test('RED: QR siswa sudah tersedia dari rute sebelumnya', () => {
  // Langkah 1: Route QR siswa sudah ada di codebase
  assert.match(server, /\/api\/(qr|siswa).*qr|qr.*siswa/, 'Route untuk generate/ambil QR siswa')
})

test('RED: data siswa lengkap tersedia untuk template KTS', () => {
  // Langkah 1: Ada query yang menggabungkan siswa, QR, dan rombel
  assert.match(server, /SELECT.*siswa.*qr|JOIN.*qr_siswa|siswa_id.*qr/, 'Query gabung siswa dengan QR')
  
  // Langkah 2: Template bisa menerima object { siswa, qr, rombel, tenant, ... }
  assert.match(server, /rombel|nama|nis|nisn/, 'Field data siswa untuk template')
})
