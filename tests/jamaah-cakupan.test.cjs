// Cakupan sesi absensi jamaah: bisa dibatasi ke rombel tertentu + siswa tertentu.
//
// Yang dijaga:
//   1. Sesi menyimpan cakupannya (rombel_id + daftar siswa_ids) sehingga bisa dibuka
//      lagi persis sama, bukan selalu seluruh sekolah.
//   2. Menyimpan absensi harian HANYA mengirim siswa yang lolos filter rombel DAN
//      dicentang — sebelumnya menulis absensi untuk SELURUH siswa lembaga (filter
//      rombel tidak berpengaruh) sehingga siswa di luar sesi ikut tercatat "hadir".

process.env.JWT_SECRET = process.env.JWT_SECRET || 'kunci-uji-jurnalku-jamaah-00000'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')

test('backend: sesi jamaah menyimpan cakupan rombel + daftar siswa', () => {
  const idx = read('server/index.cjs')
  assert.match(idx, /ALTER TABLE jamaah_sesi ADD COLUMN \$\{kolom\}/, 'migrasi kolom cakupan')
  const awal = idx.indexOf("app.post('/api/jamaah/sesi-baru'")
  const rute = idx.slice(awal, idx.indexOf("app.get('/api/jamaah/absensi'", awal))
  assert.match(rute, /rombel_id, siswa_ids \} = req\.body/, 'terima cakupan dari klien')
  assert.match(rute, /rombel_id,siswa_ids/, 'INSERT menyimpan cakupan')
  assert.match(idx, /SELECT id,nama,mulai,selesai,minimal_hadir,rombel_id,siswa_ids FROM jamaah_sesi/, 'daftar sesi mengembalikan cakupan')
})

test('frontend: simpan absensi hanya mengirim siswa terfilter + tercentang', () => {
  const page = read('src/pages/admin/AbsensiJamaahPage.tsx')
  assert.match(page, /filter\(s => ikut\[s\.id\] !== false\)/, 'hormati centang per siswa')
  assert.match(page, /s\.rombel_id === filterRombel/, 'hormati filter rombel')
  assert.ok(!/const data = siswa\.map/.test(page), 'jangan lagi mengirim SELURUH sekolah')
  assert.match(page, /siswa_ids: sasaran\.map/, 'sesi menyimpan daftar siswa terpilih')
  assert.match(page, /const pilihSesi = /, 'pilih sesi menerapkan cakupannya')
  assert.match(page, /setFilterRombel\(s\.rombel_id \|\| ''\)/, 'cakupan rombel diterapkan saat sesi dipilih')
})
