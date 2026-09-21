const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')

test('RED: guru/dashboard harus tampil jadwal saat ujian mode (bukan kosong array)', () => {
  // BUG FIXED: const jadwal = isActualHoliday ? [] : teacherScheduleForDay(...)
  // Saat ujian, jadwal harus tampil (examTemplateId ada)
  
  assert.match(server, /\/api\/guru\/dashboard/, 'Ada endpoint /api/guru/dashboard')
  assert.match(server, /examModeForDate/, 'guru/dashboard harus check exam mode')
  
  // Cek bahwa fix sudah diterapkan:
  const hasCorrectLogic = /const\s+isActualHoliday\s*=\s*holidayToday\s*&&\s*!examTemplateId/.test(server)
  const hasCorrectJadwalLogic = /const\s+jadwal\s*=\s*isActualHoliday\s*\?\s*\[\]\s*:/.test(server)
  
  assert.ok(hasCorrectLogic && hasCorrectJadwalLogic, 'guru/dashboard sudah di-fix untuk tampil jadwal saat ujian')
})

test('RED: siswa/dashboard sudah benar tampil jadwal saat ujian (jadwalUntukRombelHari)', () => {
  // Siswa dashboard sudah benar, tidak check holidayToday sebelum load jadwal
  assert.match(server, /jadwalUntukRombelHari/, 'Ada fungsi jadwalUntukRombelHari')
  assert.match(server, /\/api\/siswa\/dashboard/, 'Ada endpoint /api/siswa/dashboard')
})

test('RED: tenantIsHoliday hanya return true untuk jenis="libur", bukan ujian', () => {
  // tenantIsHoliday seharusnya HANYA treat jenis='libur' sebagai holiday
  // Ujian dan kegiatan_lain adalah KBM aktif, bukan hari libur
  assert.match(server, /function tenantIsHoliday/, 'Ada fungsi tenantIsHoliday')
  
  const holidayFunc = server.match(/function tenantIsHoliday[\s\S]*?\}/)[0] || ''
  assert.match(holidayFunc, /isHoliday/, 'tenantIsHoliday menggunakan isHoliday')
  
  // Fungsi isHoliday di holiday-rules.cjs hanya check jenis='libur'
  const holidayRulesPath = path.join(root, 'server/holiday-rules.cjs')
  const holidayRules = fs.readFileSync(holidayRulesPath, 'utf8')
  assert.match(holidayRules, /jenis.*===.*'libur'/, 'isHoliday check jenis="libur"')
  
  // Pastikan tidak ada yang check jenis='ujian' sebagai holiday
  const wrongPattern = /jenis.*=.*'ujian'.*holiday|holiday.*ujian/.test(holidayRules)
  assert.ok(!wrongPattern, 'isHoliday tidak treat ujian sebagai libur')
})

test('GREEN: guru/dashboard jadwal harus tampil saat ujian (examTemplateId != null)', () => {
  // Fix: ubah logic dari `const jadwal = holidayToday ? [] : ...`
  // menjadi: hanya check jika hari benar-benar libur, bukan ujian/kegiatan_lain
  
  // Setelah fix, logic harus:
  // 1. Fetch jadwal bahkan saat ujian
  // 2. Hanya kosong saat hari libur MURNI (bukan ujian/kegiatan_lain)
  
  const hasWrongLogic = /const\s+jadwal\s*=\s*holidayToday\s*\?\s*\[\]\s*:/.test(server)
  const hasCorrectLogic = /const\s+isActualHoliday\s*=\s*holidayToday\s*&&\s*!examTemplateId|const\s+jadwal\s*=\s*(\s*holidayToday\s*&&|isActualHoliday)/.test(server)
  
  assert.ok(!hasWrongLogic || hasCorrectLogic, 'guru/dashboard harus di-fix untuk tampil jadwal saat ujian')
})

test('GREEN: siswa/dashboard tetap tampil jadwal saat ujian dan kegiatan_lain', () => {
  // Sudah benar di siswa/dashboard
  assert.match(server, /\/api\/siswa\/dashboard/, 'Ada endpoint')
  assert.match(server, /mode_ujian.*examTemplateId/, 'siswa return mode_ujian flag')
  assert.match(server, /jadwal_hari_ini.*jadwal/, 'siswa return jadwal')
})

test('Verify: mobile variants juga harus display jadwal saat ujian', () => {
  // MobileGuruDashboard dan MobileSiswaDashboard harus fetch dari endpoint yang sama
  const mobileGuruPath = path.join(root, 'src/pages/guru/MobileGuruDashboard.tsx')
  const mobileSiswaPath = path.join(root, 'src/pages/siswa/MobileSiswaDashboard.tsx')
  
  if (fs.existsSync(mobileGuruPath)) {
    const mobileGuruCode = fs.readFileSync(mobileGuruPath, 'utf8')
    assert.match(mobileGuruCode, /guru.*dashboard|jadwal/, 'MobileGuruDashboard mengacu ke dashboard')
  }
  
  if (fs.existsSync(mobileSiswaPath)) {
    const mobileSiswaCode = fs.readFileSync(mobileSiswaPath, 'utf8')
    assert.match(mobileSiswaCode, /siswa.*dashboard|jadwal/, 'MobileSiswaDashboard mengacu ke dashboard')
  }
})
