const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('absensi mapel disimpan terpisah dari QR masuk/pulang dengan konteks jadwal', () => {
  const server = read('server/index.cjs')
  const guru = read('src/pages/guru/GuruAbsensiSiswaPage.tsx')
  assert.match(server, /absensi_mapel/)
  assert.match(server, /tenant_id,siswa_id,jadwal_id,tanggal|absensi_mapel/)
  assert.match(server, /absensi_mapel|absensi-siswa/)
  assert.match(server, /app\.post\('\/api\/absensi-mapel\/bulk'/)
  assert.match(server, /teacherCanTeachPair/)
  assert.match(guru, /api\.get\('\/absensi-mapel'/)
  assert.match(guru, /api\.post\('\/absensi-mapel\/bulk'/)
  assert.match(guru, /Absensi per Mata Pelajaran/)
  assert.doesNotMatch(guru, /jenis:\s*sesi/)
})

test('riwayat absensi mapel tidak dapat dibaca siswa dan guru dibatasi ke jadwalnya', () => {
  const server = read('server/index.cjs')
  const start = server.indexOf("app.get('/api/absensi-mapel'")
  const end = server.indexOf("app.post('/api/absensi-mapel/bulk'", start)
  const route = server.slice(start, end)
  assert.match(route, /app\.get\('\/api\/absensi-mapel', STAFF/)
  assert.match(route, /\['guru','wali_kelas'\]\.includes\(req\.user\.role\)/)
  assert.match(route, /teacherCanTeachPair/)
  assert.match(route, /Jadwal bukan yang Anda ampu/)
})

test('tanggal tanpa jadwal membersihkan daftar lama dan tombol simpan dinonaktifkan', () => {
  const guru = read('src/pages/guru/GuruAbsensiSiswaPage.tsx')
  assert.match(guru, /if \(!first\)[\s\S]*setSiswaList\(\[\]\)[\s\S]*setAbsensi\(\{\}\)/)
  assert.match(guru, /disabled=\{saving \|\| !selectedJadwal \|\| siswaList\.length === 0\}/)
})

test('dashboard siswa memisahkan seluruh kategori rekap kehadiran', () => {
  const summary = read('server/attendance-summary.cjs')
  const dashboard = read('src/pages/siswa/SiswaDashboard.tsx')
  const attendance = read('src/pages/siswa/SiswaAbsensiPage.tsx')
  for (const key of ['qr_masuk_pulang', 'mapel', 'jamaah', 'kokurikuler', 'ekskul', 'kegiatan_lain']) {
    assert.match(summary, new RegExp(`${key}:`))
  }
  assert.match(summary, /FROM absensi_mapel am/)
  assert.match(summary, /FROM tahfidz_absensi ta/)
  assert.match(dashboard, /QR Masuk\/Pulang/)
  assert.match(dashboard, /Mata Pelajaran/)
  assert.match(dashboard, /Jamaah/)
  assert.match(dashboard, /Kokurikuler/)
  assert.match(dashboard, /Ekstrakurikuler/)
  assert.match(dashboard, /Kegiatan Lain/)
  for (const tab of ['qr', 'mapel', 'jamaah', 'kokurikuler', 'ekskul', 'kegiatan']) {
    assert.match(attendance, new RegExp(`key:'${tab}'`))
  }
})

test('dashboard admin mendapat rekap kehadiran tenant-scoped seluruh kategori', () => {
  const server = read('server/index.cjs')
  const dashboard = read('src/pages/admin/AdminDashboard.tsx')
  assert.match(server, /app\.get\('\/api\/admin\/rekap-kehadiran'/)
  assert.match(server, /getAttendanceOverview\(db, req\.tenantId/)
  assert.match(dashboard, /api\.get\('\/admin\/rekap-kehadiran'/)
  assert.match(dashboard, /Rekap Kehadiran Siswa/)
  for (const label of ['QR Masuk/Pulang', 'Mata Pelajaran', 'Jamaah', 'Kokurikuler', 'Ekstrakurikuler', 'Kegiatan Lain']) {
    assert.match(dashboard, new RegExp(label.replace('/', '\\/')))
  }
})

test('dashboard kehadiran menampilkan rincian status lengkap dan pemilih tanggal admin', () => {
  const student = read('src/pages/siswa/SiswaDashboard.tsx')
  const admin = read('src/pages/admin/AdminDashboard.tsx')
  const attendance = read('src/pages/siswa/SiswaAbsensiPage.tsx')
  for (const label of ['Hadir', 'Sakit', 'Izin', 'Alpha', 'Lain']) {
    assert.match(student, new RegExp(label))
    assert.match(admin, new RegExp(label))
  }
  assert.match(admin, /type="date"/)
  assert.match(admin, /tanggal:/)
  assert.match(student, /status_pulang/)
  assert.match(attendance, /status_pulang/)
})

test('selesai kelas meminta sesi aktif spesifik dan backend mengembalikan status selesai', () => {
  const server = read('server/index.cjs')
  const dashboard = read('src/pages/guru/GuruDashboard.tsx')
  assert.match(dashboard, /api\.post\('\/guru\/sesi-kelas\/selesai',\s*\{\s*sesi_id:/)
  assert.match(server, /const sesiId = String\(req\.body\?\.sesi_id/)
  assert.match(server, /active\.id !== sesiId/)
  assert.match(server, /if \(!updated \|\| updated\.status !== 'selesai'/)
  assert.match(server, /eventType: 'class_session_finished'/)
  assert.match(dashboard, /setData\(\(current: any\) => \(\{ \.\.\.current, sesi_kelas_aktif: null \}\)\)/)
})
