import { Calendar } from 'lucide-react'
import MonthFilter, { NAMA_BULAN, bulanSekarang } from './MonthFilter'

// Pemilih periode bersama untuk laporan keuangan: Harian / Mingguan / Bulanan.
// Satu kontrol di semua halaman supaya bendahara tidak menebak format di tiap
// menu (prinsip yang sama dengan MonthFilter).
//
// Nilai yang dikirim: { mode: 'hari'|'minggu'|'bulan', mulai: string, selesai: string }
// - hari   : mulai == selesai == YYYY-MM-DD
// - minggu : mulai = Senin minggu itu, selesai = Minggu (7 hari)
// - bulan  : mulai = tanggal 1, selesai = hari terakhir bulan itu
// Endpoint menerima `mulai` & `selesai` (YYYY-MM-DD) atau `bulan` (YYYY-MM).

export type PeriodeNilai = {
  mode: 'hari' | 'minggu' | 'bulan'
  mulai: string
  selesai: string
}

const MODE = [
  { key: 'hari', label: 'Harian' },
  { key: 'minggu', label: 'Mingguan' },
  { key: 'bulan', label: 'Bulanan' },
] as const

// 'YYYY-MM-DD' dalam waktu lokal (bukan UTC — toISOString bergeser sehari
// pada jam 00:00–06:59 WIB).
export function tanggalLokal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Senin dari minggu yang memuat tanggal ini (minggu Indonesia: Senin–Minggu).
export function seninMinggu(d: Date): Date {
  const r = new Date(d)
  const hari = r.getDay() // 0 = Minggu
  const jarak = hari === 0 ? 6 : hari - 1
  r.setDate(r.getDate() - jarak)
  return r
}

export function rentangPeriode(mode: PeriodeNilai['mode'], acuan: string): PeriodeNilai {
  if (mode === 'hari') {
    return { mode, mulai: acuan, selesai: acuan }
  }
  if (mode === 'minggu') {
    const [y, m, d] = acuan.split('-').map(Number)
    const tgl = new Date(y, m - 1, d)
    const senin = seninMinggu(tgl)
    const minggu = new Date(senin)
    minggu.setDate(senin.getDate() + 6)
    return { mode, mulai: tanggalLokal(senin), selesai: tanggalLokal(minggu) }
  }
  // bulan: acuan = YYYY-MM
  const [y, m] = acuan.split('-').map(Number)
  const akhir = new Date(y, m, 0).getDate()
  return {
    mode,
    mulai: `${acuan}-01`,
    selesai: `${acuan}-${String(akhir).padStart(2, '0')}`,
  }
}

// Label manusiawi untuk subtitle laporan: "14 Oktober 2026", "13–19 Oktober 2026",
// "1–31 Oktober 2026".
export function labelPeriode(p: PeriodeNilai): string {
  const fmt = (t: string) => {
    const [y, m, d] = t.split('-').map(Number)
    return `${d} ${NAMA_BULAN[m - 1]} ${y}`
  }
  if (p.mode === 'hari') return fmt(p.mulai)
  if (p.mode === 'bulan') {
    const [y, m] = p.mulai.split('-').map(Number)
    return `${NAMA_BULAN[m - 1]} ${y}`
  }
  // minggu: rentang ringkas tanpa tahun ganda
  const [ay, am, ad] = p.mulai.split('-').map(Number)
  const [by, bm, bd] = p.selesai.split('-').map(Number)
  if (ay === by && am === bm) return `${ad}–${bd} ${NAMA_BULAN[am - 1]} ${ay}`
  return `${ad} ${NAMA_BULAN[am - 1]} ${ay} – ${bd} ${NAMA_BULAN[bm - 1]} ${by}`
}

type Props = {
  nilai: PeriodeNilai
  onUbah: (nilai: PeriodeNilai) => void
  label?: string
  className?: string
}

export default function PeriodeFilter({ nilai, onUbah, label = 'Periode', className = '' }: Props) {
  const acuan = nilai.mode === 'bulan' ? nilai.mulai.slice(0, 7) : nilai.mulai
  const bulanAcuan = bulanSekarang()

  const gantiMode = (mode: PeriodeNilai['mode']) => {
    onUbah(rentangPeriode(mode, mode === 'bulan' ? bulanAcuan : tanggalLokal(new Date())))
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <div className="inline-flex overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        {MODE.map(m => (
          <button
            key={m.key}
            type="button"
            onClick={() => gantiMode(m.key)}
            className={
              'px-3 py-2 text-xs font-semibold transition ' +
              (nilai.mode === m.key ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800')
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {nilai.mode === 'bulan' ? (
        <MonthFilter
          nilai={acuan}
          onUbah={b => onUbah(rentangPeriode('bulan', b))}
          izinkanSemua={false}
          label={`${label} (bulan)`}
        />
      ) : (
        <label className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <Calendar size={15} className="shrink-0 text-gray-400" />
          <span className="sr-only">{label}</span>
          <input
            type="date"
            value={acuan}
            onChange={e => e.target.value && onUbah(rentangPeriode(nilai.mode, e.target.value))}
            className="bg-transparent text-sm font-medium text-gray-700 outline-none dark:text-gray-200"
          />
        </label>
      )}
    </div>
  )
}
