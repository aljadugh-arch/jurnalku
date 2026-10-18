import { Search, X } from 'lucide-react'

// Kotak pencarian seragam untuk semua daftar data (siswa, GTK, buku, dll).
//
// Kenapa dibuat komponen, bukan ditulis ulang tiap halaman: sebelumnya setiap
// halaman punya gaya sendiri, dan banyak yang TIDAK punya pencarian sama sekali
// sehingga pengguna harus menggulir ratusan baris untuk menemukan satu nama.
//
// `onChange` langsung menerima teks (bukan event) agar pemakaiannya ringkas.
export default function SearchInput({
  value, onChange, placeholder = 'Cari…', jumlah, className = '', autoFocus = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** Jumlah hasil, ditampilkan di kanan agar pengguna tahu filter bekerja. */
  jumlah?: number
  className?: string
  autoFocus?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900 ${className}`}>
      <Search size={15} className="shrink-0 text-gray-400" />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:text-gray-100"
        // Tombol "x" bawaan browser pada type=search tampil beda-beda; kita
        // sediakan tombol sendiri agar konsisten.
        style={{ WebkitAppearance: 'none' }}
      />
      {value ? (
        <button type="button" onClick={() => onChange('')} aria-label="Hapus pencarian"
          className="shrink-0 rounded-md p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
          <X size={14} />
        </button>
      ) : null}
      {typeof jumlah === 'number' && (
        <span className="shrink-0 text-xs tabular-nums text-gray-400">{jumlah}</span>
      )}
    </div>
  )
}

// Filter teks sederhana yang tahan terhadap nilai kosong/null dan tidak
// membedakan huruf besar-kecil. Dipakai untuk penyaringan sisi klien.
export function cocokCari(teks: unknown, kata: string): boolean {
  const q = String(kata || '').trim().toLowerCase()
  if (!q) return true
  return String(teks ?? '').toLowerCase().includes(q)
}

// Cocokkan satu kata kunci ke beberapa kolom sekaligus.
export function cocokBeberapa(kata: string, ...nilai: unknown[]): boolean {
  const q = String(kata || '').trim().toLowerCase()
  if (!q) return true
  return nilai.some(v => String(v ?? '').toLowerCase().includes(q))
}
