const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')

test('INTEGRATION: guru dashboard menampilkan jadwal saat ujian', () => {
  // Scenario: tanggal dijadwalkan sebagai ujian (kalender_kbm jenis='ujian')
  // Expected: jadwal tetap tampil (tidak kosong), examTemplateId digunakan
  
  const guruDashboardSection = server.match(/app\.get\(['\"`]\/api\/guru\/dashboard['\"`][\s\S]*?\n\}\)/)[0] || ''
  
  // Check: examModeForDate dipanggil unconditionally
  assert.match(guruDashboardSection, /const\s+examTemplateId\s*=\s*examModeForDate/, 
    'examModeForDate harus dipanggil tanpa syarat holiday')
  
  // Check: isActualHoliday hanya true jika holiday AND tidak exam mode
  assert.match(guruDashboardSection, /const\s+isActualHoliday\s*=\s*holidayToday\s*&&\s*!examTemplateId/,
    'isActualHoliday combine holiday status + exam mode')
  
  // Check: jadwal hanya kosong saat isActualHoliday, bukan holidayToday
  assert.match(guruDashboardSection, /const\s+jadwal\s*=\s*isActualHoliday\s*\?\s*\[\]\s*:\s*teacherScheduleForDay/,
    'jadwal kosong hanya saat isActualHoliday (libur murni)')
  
  // Check: stats dihitung jika ada KBM (ujian juga count sebagai KBM aktif)
  assert.match(guruDashboardSection, /const\s+absensiHariIni\s*=\s*isActualHoliday\s*\?\s*0\s*:/,
    'absensi diperhitungkan saat ujian')
  assert.match(guruDashboardSection, /const\s+siswaRombelCount\s*=\s*isActualHoliday\s*\?\s*0\s*:/,
    'siswa rombol diperhitungkan saat ujian')
})

test('INTEGRATION: endpoint jurnal guru tidak mengosongkan jadwal ujian karena kalender libur', () => {
  const routeStart = server.indexOf("app.get('/api/jurnal/jadwal-hari-ini'")
  const routeEnd = server.indexOf("app.get('/api/jurnal/me'", routeStart)
  const route = server.slice(routeStart, routeEnd)
  assert.ok(route.indexOf('examModeForDate') < route.indexOf('tenantIsHoliday'),
    'mode ujian harus diketahui sebelum keputusan hari libur')
  assert.match(route, /tenantIsHoliday\(req\.tenantId, tgl\)\s*&&\s*!examTemplateId/,
    'hari ujian aktif tidak boleh dikosongkan oleh flag libur')
})

test('INTEGRATION: siswa dashboard tetap menampilkan jadwal saat ujian', () => {
  // Scenario: sama dengan guru, tapi untuk siswa
  // Expected: jadwal tampil, mode_ujian flag set
  
  // Check: examModeForDate dipanggil
  assert.match(server, /examModeForDate\(req\.tenantId, todayDate\).*jadwalUntukRombelHari/s,
    'siswa dashboard juga check exam mode dan pass ke jadwalUntukRombelHari')
  
  // Check: mode_ujian flag di-return
  assert.match(server, /mode_ujian\s*:\s*!!examTemplateId/,
    'siswa dashboard set mode_ujian flag')
})

test('INTEGRATION: kegiatan_lain juga harus tampil jadwal', () => {
  // Scenario: kalender_kbm jenis='kegiatan_lain' (bukan libur, bukan ujian)
  // Expected: jadwal tetap tampil
  // Note: kegiatan_lain akan di-cek di examModeForDate, tapi bahkan jika tidak ada
  // template khusus kegiatan_lain, jadwal reguler tetap tampil (karena !isActualHoliday)
  
  const holidayRulesPath = path.join(root, 'server/holiday-rules.cjs')
  const holidayRules = fs.readFileSync(holidayRulesPath, 'utf8')
  
  // isHoliday hanya return true untuk jenis='libur'
  assert.match(holidayRules, /jenis.*===.*['"]libur['"]/, 
    'isHoliday check jenis="libur" only')
  
  // Tidak ada logic yang treat kegiatan_lain sebagai holiday
  const wrongLogic = /kegiatan_lain.*holiday|holiday.*kegiatan_lain|kegiatan_lain.*libur/i
  assert.ok(!wrongLogic.test(holidayRules),
    'isHoliday tidak treat kegiatan_lain sebagai libur')
})

test('INTEGRATION: tenantIsHoliday dan examModeForDate terpisah', () => {
  // Bug yang diperbaiki: sebelumnya examModeForDate hanya dipanggil jika !holidayToday
  // Ini salah karena ujian bukan hari libur
  
  // Check: tenantIsHoliday hanya cek kalender event jenis='libur'
  assert.match(server, /function\s+tenantIsHoliday[\s\S]*?jenis.*'libur'/,
    'tenantIsHoliday distinguish libur dari ujian/kegiatan_lain')
  
  // Check: examModeForDate dipanggil unconditionally di guru/dashboard
  assert.match(server, /const\s+examTemplateId\s*=\s*examModeForDate\(req\.tenantId/,
    'examModeForDate dipanggil TANPA syarat holiday')
  
  // Check: logic uses isActualHoliday, not holidayToday
  assert.match(server, /const\s+isActualHoliday\s*=\s*holidayToday\s*&&\s*!examTemplateId/,
    'isActualHoliday combine holiday + exam check')
})

test('Regression: mobile variants tidak perlu perubahan (fetch dari endpoint yang sudah fixed)', () => {
  // MobileGuruDashboard dan MobileSiswaDashboard fetch dari endpoint yang sudah fixed
  // Mereka hanya perlu display jadwal_hari_ini dari response
  
  const mobileGuruPath = path.join(root, 'src/pages/guru/MobileGuruDashboard.tsx')
  const mobileSiswaPath = path.join(root, 'src/pages/siswa/MobileSiswaDashboard.tsx')
  
  if (fs.existsSync(mobileGuruPath)) {
    const code = fs.readFileSync(mobileGuruPath, 'utf8')
    assert.match(code, /jadwal_hari_ini/, 'MobileGuruDashboard menggunakan jadwal_hari_ini')
    assert.match(code, /\/guru\/dashboard/, 'MobileGuruDashboard fetch dari endpoint')
  }
  
  if (fs.existsSync(mobileSiswaPath)) {
    const code = fs.readFileSync(mobileSiswaPath, 'utf8')
    assert.match(code, /jadwal_hari_ini/, 'MobileSiswaDashboard menggunakan jadwal_hari_ini')
  }
})
