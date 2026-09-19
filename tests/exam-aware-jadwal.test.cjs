const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')
const jadwalPage = fs.readFileSync(path.join(root, 'src/pages/admin/JadwalPage.tsx'), 'utf8')
const kalenderPage = fs.readFileSync(path.join(root, 'src/pages/admin/KalenderKBMPage.tsx'), 'utf8')

// ============================================================
// Poin 1 & 2: hari ujian di Kalender KBM -> jadwal hari-ini/tanggal
// otomatis pakai baris jadwal bertemplate jenis 'ujian', bukan reguler.
// ============================================================

test('helper examModeForDate menentukan mode ujian dari kalender_kbm + template_jadwal', () => {
  assert.match(server, /function examModeForDate/)
})

test('endpoint /api/jadwal/hari-ini memakai examModeForDate untuk filter template_id', () => {
  const start = server.indexOf("app.get('/api/jadwal/hari-ini'")
  const end = server.indexOf('\n})', start)
  const block = server.slice(start, end)
  assert.match(block, /examModeForDate/)
})

test('endpoint /api/jadwal/tanggal memakai examModeForDate untuk filter template_id', () => {
  const start = server.indexOf("app.get('/api/jadwal/tanggal'")
  const end = server.indexOf('\n})', start)
  const block = server.slice(start, end)
  assert.match(block, /examModeForDate/)
})

test('teacherScheduleForDay (dashboard guru) menerima parameter mode ujian', () => {
  const start = server.indexOf('function teacherScheduleForDay')
  const end = server.indexOf('\n}', start)
  const block = server.slice(start, end)
  assert.match(block, /examTemplateId|isExamMode/)
})

test('/api/guru/dashboard meneruskan examModeForDate ke teacherScheduleForDay', () => {
  const start = server.indexOf("app.get('/api/guru/dashboard'")
  const end = server.indexOf('\n})', start)
  const block = server.slice(start, end)
  assert.match(block, /examModeForDate/)
})

test('/api/jurnal/jadwal-hari-ini (dashboard jurnal guru) sadar mode ujian', () => {
  const start = server.indexOf("app.get('/api/jurnal/jadwal-hari-ini'")
  const end = server.indexOf('\n})', start)
  const block = server.slice(start, end)
  assert.match(block, /examModeForDate/)
})

test('/api/siswa/dashboard (jadwal hari ini siswa) sadar mode ujian', () => {
  const start = server.indexOf("app.get('/api/siswa/dashboard'")
  const end = server.indexOf('\n})', start)
  const block = server.slice(start, end)
  assert.match(block, /examModeForDate/)
})

// ============================================================
// Poin 3: saat template ujian dipilih, guru pengawas/penjaga boleh beda
// dari guru mapel yang terdaftar di menu Pengajar untuk rombel itu.
// ============================================================

test('backend POST/PUT /api/jadwal tidak menolak guru berbeda saat template jenis ujian (tidak ada hard-block guru_valid)', () => {
  // guru_valid di backend HANYA indikator display (JOIN gtk id not null),
  // bukan constraint block — pastikan tidak ada guard baru yang menolak submit
  // jadwal 'mapel' dengan template ujian karena guru tidak terdaftar di pengajar.
  const start = server.indexOf("app.post('/api/jadwal', ADMIN")
  const end = server.indexOf("app.put('/api/jadwal/:id'", start)
  const block = server.slice(start, end)
  assert.doesNotMatch(block, /pengajar.*WHERE.*gtk_id=\?.*mapel_id=\?.*rombel_id=\?.*\.get\(gtk_id/s)
})

test('JadwalPage tidak menampilkan peringatan guru "belum terdaftar" saat jenis template aktif = ujian', () => {
  assert.match(jadwalPage, /templateIsUjian|jenisTemplateAktif === .ujian.|isExamTemplate/)
})

test('KalenderKBMPage menampilkan indikator jadwal ujian aktif dan tautan ke Jadwal Pelajaran template ujian', () => {
  assert.match(kalenderPage, /ujian/i)
})

console.log('exam-aware-jadwal RED tests defined')
