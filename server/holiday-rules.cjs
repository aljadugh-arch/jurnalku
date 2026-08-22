const DAY_NAMES = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']

function normalizeDay(value) {
  const v = String(value || '').trim().toLowerCase()
  return v === 'ahad' ? 'minggu' : v
}

function normalizeHolidayDays(value) {
  let days = value
  if (typeof value === 'string') {
    try { days = JSON.parse(value) } catch { days = value.split(',') }
  }
  if (!Array.isArray(days)) return []
  return [...new Set(days.map(normalizeDay).filter(day => DAY_NAMES.includes(day)))]
}

// YYYY-MM-DD is interpreted at UTC noon so the weekday is stable on every server timezone.
function dayNameForDate(date) {
  const match = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? '' : DAY_NAMES[parsed.getUTCDay()]
}

function isHoliday({ date, holidayDays = [], calendarEvents = [] }) {
  const day = dayNameForDate(date)
  if (!day) return false
  if (normalizeHolidayDays(holidayDays).includes(day)) return true
  return calendarEvents.some(event => String(event?.jenis || '').toLowerCase() === 'libur')
}

module.exports = { DAY_NAMES, normalizeHolidayDays, dayNameForDate, isHoliday }
