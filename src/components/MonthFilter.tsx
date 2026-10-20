import { Calendar } from 'lucide-react'

// Pemilih bulan bersama untuk semua halaman keuangan bendahara.
//
// Kenapa satu komponen: sebelumnya tiap halaman punya kontrol periode sendiri
// (ada yang dua input tanggal, ada yang tidak sama sekali), sehingga bendahara
// harus menebak format di tiap menu. Satu kontrol = satu kebiasaan.
//
// Nilai yang dikirim selalu `YYYY-MM` — format yang dipakai semua endpoint
// (`/api/keuangan/laporan`, `/api/bendahara/dashboard`, `/api/tagihan`,
// `/api/tabungan/ringkasan-bulanan`).

export const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

// '2026-10' -> 'Oktober 2026'
export function labelBulan(nilai: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(nilai || ''))
  if (!m) return 'Semua periode'
  return `${NAMA_BULAN[Number(m[2]) - 1]} ${m[1]}`
}

// Bulan berjalan dalam waktu lokal (WIB), bukan UTC. Memakai toISOString()
// membuat tanggal 1 pukul 00:00–06:59 WIB terbaca sebagai bulan sebelumnya.
export function bulanSekarang(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

type Props = {
  nilai: string
  onUbah: (bulan: string) => void
  // Bulan yang punya data. Kalau diisi, pemilih menampilkan penanda sehingga
  // bendahara tahu bulan mana yang kosong sebelum memilihnya.
  tersedia?: string[]
  // Tampilkan tombol "Semua" untuk laporan yang memang butuh seluruh periode.
  izinkanSemua?: boolean
  label?: string
  className?: string
}

export default function MonthFilter({ nilai, onUbah, tersedia, izinkanSemua, label = 'Periode', className = '' }: Props) {
  const daftar = Array.from(new Set([...(tersedia || []), nilai, bulanSekarang()].filter(Boolean))).sort().reverse()
  const adaData = new Set(tersedia || [])

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <label className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <Calendar size={15} className="shrink-0 text-gray-400" />
        <span className="sr-only">{label}</span>
        <select
          value={nilai}
          onChange={e => onUbah(e.target.value)}
          className="min-w-0 bg-transparent text-sm font-medium text-gray-700 outline-none dark:text-gray-200"
        >
          {izinkanSemua && <option value="">Semua periode</option>}
          {daftar.map(b => (
            <option key={b} value={b}>
              {labelBulan(b)}{tersedia && !adaData.has(b) ? ' — kosong' : ''}
            </option>
          ))}
        </select>
      </label>
      {!izinkanSemua && nilai && (
        <button
          type="button"
          onClick={() => onUbah('')}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        >
          Semua
        </button>
      )}
    </div>
  )
}
