const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeHolidayDays, dayNameForDate, isHoliday } = require('./holiday-rules.cjs')

test('holiday day names normalize Jumat and Ahad', () => {
  assert.deepEqual(normalizeHolidayDays('["jumat", "ahad"]'), ['jumat', 'minggu'])
  assert.equal(dayNameForDate('2026-08-21'), 'jumat')
  assert.equal(dayNameForDate('2026-08-23'), 'minggu')
})

test('configured weekly holidays suppress notifications', () => {
  assert.equal(isHoliday({ date: '2026-08-21', holidayDays: ['jumat'] }), true)
  assert.equal(isHoliday({ date: '2026-08-23', holidayDays: ['ahad'] }), true)
  assert.equal(isHoliday({ date: '2026-08-20', holidayDays: ['jumat', 'minggu'] }), false)
})

test('calendar libur event suppresses notifications', () => {
  assert.equal(isHoliday({ date: '2026-08-20', calendarEvents: [{ jenis: 'libur' }] }), true)
  assert.equal(isHoliday({ date: '2026-08-20', calendarEvents: [{ jenis: 'kbm_aktif' }] }), false)
})

test('invalid dates are not treated as holidays', () => {
  assert.equal(isHoliday({ date: 'not-a-date', holidayDays: ['jumat'] }), false)
})