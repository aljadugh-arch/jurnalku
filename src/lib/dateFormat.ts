// Utilitas tanggal — SENGAJA tanpa dependensi.
//
// JANGAN tambahkan `import ... from 'xlsx'` di sini. Berkas ini dipakai ~20
// halaman, jadi apa pun yang diimpor di sini ikut ke chunk awal dan menahan
// render pertama. Dulu ada `XLSX.SSF.parse_date_code` hanya untuk mengubah
// nomor seri Excel menjadi tanggal — itu menarik seluruh library xlsx
// (1,25 MB mentah) ke jalur kritis. Penggantinya ada di bawah, 6 baris.

// Serial date Excel: hari ke-1 = 1900-01-01, dengan bug 1900 bukan kabisat.
// 25569 = jumlah hari antara 1899-12-30 dan 1970-01-01.
const EXCEL_EPOCH_HARI = 25569

export function serialExcelKeIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 2958465) return null
  const hari = Math.floor(serial)
  // Excel menganggap 1900-02-29 ada (hari ke-60). Tanggal itu tidak nyata,
  // tetapi dikembalikan apa adanya supaya hasilnya identik dengan xlsx.
  if (hari === 60) return '1900-02-29'
  // Untuk serial < 61 tanggal sebenarnya mundur satu hari dari hitungan linear.
  const koreksi = hari < 61 ? 1 : 0
  const ms = Math.round((hari - EXCEL_EPOCH_HARI + koreksi) * 86400000)
  const d = new Date(ms)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

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
    const iso = serialExcelKeIso(value)
    if (iso) return iso
  }
  const s = String(value).trim()
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const iso = serialExcelKeIso(Number(s))
    if (iso) return iso
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
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  return d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'long', year: 'numeric' })
}
