import * as XLSX from 'xlsx'

export const todayWib = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
export const nowWib = () => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
export const yearWib = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric' }).format(new Date()))

export function addDaysWib(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d + days))
  return utc.toISOString().slice(0, 10)
}

export function normalizeDate(value: any) {
  if (value === undefined || value === null || value === '') return ''
  if (value instanceof Date && !isNaN(value.getTime())) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]))
    return `${p.year}-${p.month}-${p.day}`
  }
  if (typeof value === 'number' && value > 1 && value < 60000) {
    const d = XLSX.SSF.parse_date_code(value)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(value).trim()
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = XLSX.SSF.parse_date_code(Number(s))
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const dmy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/)
  if (dmy) {
    const y = dmy[3].length === 2 ? '20' + dmy[3] : dmy[3]
    return `${y}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  const bulan: Record<string, string> = { januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06', juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12' }
  const id = s.toLowerCase().match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/)
  if (id && bulan[id[2]]) return `${id[3]}-${bulan[id[2]]}-${id[1].padStart(2, '0')}`
  return s
}

export function formatTanggal(value: any) {
  const iso = normalizeDate(value)
  if (!iso) return '-'
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return String(value)
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'long', year: 'numeric' })
}
