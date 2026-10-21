import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, Star, ArrowUpRight, Copy, Check, Folder, ExternalLink,
  LayoutGrid, Info, CheckCircle2,
} from 'lucide-react'
import {
  APLIKASI, KATEGORI, LABEL_STATUS, DIPERIKSA_PADA, MENU_INTERNAL,
  saringAplikasi, type AplikasiOperator, type StatusTautan,
} from '../../lib/katalogOperator'
import toast from 'react-hot-toast'

// Portal Operator — satu pintu untuk urusan operator madrasah.
//
// Isinya dua bagian:
//   1. Menu pengelolaan internal (data siswa, GTK, rapor, keuangan) — jalan
//      pintas ke halaman yang sudah ada di Jurnalku.
//   2. Katalog tautan aplikasi eksternal (EMIS, Verval, PIP, ANBK, RDM, ...).
//
// Status tautan adalah hasil pemeriksaan SEKALI waktu katalog disusun, bukan
// pemantauan langsung. Itu sebabnya ada catatan kaki yang menjelaskan hal ini —
// supaya operator tidak menyimpulkan "situs mati" dari label "perlu cek manual".

const WARNA_KATEGORI: Record<string, string> = {
  'Pendataan': 'text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/40',
  'Siswa': 'text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/40',
  'Guru & tenaga kependidikan': 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40',
  'Bantuan & anggaran': 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40',
  'Asesmen & rapor': 'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/40',
  'Referensi & layanan': 'text-cyan-700 bg-cyan-50 dark:text-cyan-300 dark:bg-cyan-950/40',
}

const WARNA_STATUS: Record<StatusTautan, string> = {
  terbuka: 'text-emerald-600',
  dibatasi: 'text-rose-600',
  manual: 'text-amber-600',
}

const KUNCI_FAVORIT = 'operator-favorit'

function bacaFavorit(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KUNCI_FAVORIT) || '[]')
    return Array.isArray(v) ? v.filter(x => APLIKASI.some(a => a.id === x)) : []
  } catch { return [] }
}

export default function PortalOperatorPage() {
  const [cari, setCari] = useState('')
  const [kategori, setKategori] = useState<string>('Semua')
  const [hanyaFavorit, setHanyaFavorit] = useState(false)
  const [favorit, setFavorit] = useState<string[]>(bacaFavorit)
  const [disalin, setDisalin] = useState('')

  const hasil = useMemo(() => saringAplikasi(cari, kategori, favorit, hanyaFavorit), [cari, kategori, favorit, hanyaFavorit])

  const toggleFavorit = (id: string) => {
    setFavorit(prev => {
      const baru = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      try { localStorage.setItem(KUNCI_FAVORIT, JSON.stringify(baru)) } catch {}
      return baru
    })
  }

  const salin = async (a: AplikasiOperator) => {
    try {
      await navigator.clipboard.writeText(a.url)
      setDisalin(a.id)
      setTimeout(() => setDisalin(''), 1600)
    } catch {
      toast.error('Gagal menyalin tautan')
    }
  }

  const reset = () => { setCari(''); setKategori('Semua'); setHanyaFavorit(false) }

  return (
    <div className="space-y-5 pb-24 lg:pb-6">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-primary/5 via-white to-white p-5 shadow-sm dark:border-gray-700 dark:from-primary/10 dark:via-gray-900 dark:to-gray-900">
        <div className="flex items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-sm sm:flex">
            <LayoutGrid size={24} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Ruang Kerja Operator</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-800 dark:text-gray-100">Satu pintu untuk urusan madrasah.</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Buka layanan pendidikan, temukan aplikasi yang dibutuhkan, dan kelola data lembaga.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[[APLIKASI.length, 'Tautan aplikasi'], [MENU_INTERNAL.length, 'Menu pengelolaan'], [favorit.length, 'Favorit']].map(([n, l]) => (
            <div key={String(l)} className="rounded-xl border border-gray-100 bg-white/70 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/60">
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{n}</p>
              <p className="text-[11px] text-gray-500">{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Menu internal */}
      <section>
        <div className="mb-2 flex items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Kelola data lembaga</h2>
            <p className="text-xs text-gray-500">Langsung menuju menu pengelolaan yang sudah tersedia.</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {MENU_INTERNAL.map(m => (
            <Link key={m.path} to={m.path}
              className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:border-primary hover:shadow-md dark:border-gray-700 dark:bg-gray-900">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Folder size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-800 dark:text-gray-200">{m.nama}</span>
                <span className="block truncate text-[11px] text-gray-500">{m.keterangan}</span>
              </span>
              <ArrowUpRight size={15} className="shrink-0 text-gray-300 transition group-hover:text-primary" />
            </Link>
          ))}
        </div>
      </section>

      {/* Katalog aplikasi */}
      <section>
        <div className="mb-2">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Aplikasi &amp; layanan operator</h2>
          <p className="text-xs text-gray-500">Tautan luar dibuka di tab baru. Gunakan akun masing-masing layanan.</p>
        </div>

        {/* Pencarian & favorit */}
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={cari}
              onChange={e => setCari(e.target.value)}
              placeholder="Cari EMIS, NISN, PIP, atau layanan lainnya…"
              aria-label="Cari aplikasi operator"
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </div>
          <button
            onClick={() => setHanyaFavorit(v => !v)}
            aria-pressed={hanyaFavorit}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold shadow-sm transition ${
              hanyaFavorit
                ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
            }`}
          >
            <Star size={15} className={hanyaFavorit ? 'fill-amber-500 text-amber-500' : ''} /> Favorit saya
          </button>
        </div>

        {/* Kategori */}
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {KATEGORI.map(k => (
            <button
              key={k}
              onClick={() => setKategori(k)}
              aria-pressed={kategori === k}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                kategori === k
                  ? 'border-primary bg-primary text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <p className="mt-2 text-[11px] text-gray-400" role="status">{hasil.length} aplikasi ditampilkan</p>

        {/* Kartu aplikasi */}
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {hasil.map(a => {
            const fav = favorit.includes(a.id)
            const host = (() => { try { return new URL(a.url).host } catch { return a.url } })()
            return (
              <article key={a.id} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-primary hover:shadow-md dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-start justify-between gap-2">
                  <span className={`inline-flex items-center rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${WARNA_KATEGORI[a.kategori] || 'bg-gray-100 text-gray-600'}`}>
                    {a.kategori}
                  </span>
                  <button
                    onClick={() => toggleFavorit(a.id)}
                    aria-label={`${fav ? 'Hapus' : 'Tambah'} favorit ${a.nama}`}
                    aria-pressed={fav}
                    className="rounded-lg p-1 text-gray-300 transition hover:text-amber-500"
                  >
                    <Star size={17} className={fav ? 'fill-amber-500 text-amber-500' : ''} />
                  </button>
                </div>

                <h3 className="mt-2 text-sm font-bold text-gray-800 dark:text-gray-100">{a.nama}</h3>
                <p className="mt-0.5 flex-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{a.keterangan}</p>

                <p className={`mt-2 inline-flex items-center gap-1 text-[11px] font-semibold ${WARNA_STATUS[a.status]}`}>
                  <span aria-hidden>●</span> {LABEL_STATUS[a.status]}
                </p>
                <p className="truncate text-[11px] text-gray-400">{host}</p>

                <div className="mt-3 flex gap-1.5">
                  <a
                    href={a.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition hover:opacity-95"
                  >
                    Buka aplikasi <ArrowUpRight size={14} />
                  </a>
                  <button
                    onClick={() => void salin(a)}
                    aria-label={`Salin tautan ${a.nama}`}
                    title="Salin tautan"
                    className="rounded-lg border border-gray-200 px-2.5 text-gray-500 transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    {disalin === a.id ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                  </button>
                </div>

                <details className="mt-2 text-[11px] text-gray-500">
                  <summary className="cursor-pointer select-none font-semibold text-gray-400 hover:text-gray-600">Hasil pemeriksaan &amp; sumber</summary>
                  <p className="mt-1 leading-relaxed">{a.catatan}</p>
                  <p className="mt-1">Diperiksa {DIPERIKSA_PADA}.{' '}
                    {a.sumber
                      ? <a href={a.sumber} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Lihat rujukan ↗</a>
                      : <span>Alamat diberikan oleh admin madrasah.</span>}
                  </p>
                </details>
              </article>
            )
          })}
        </div>

        {hasil.length === 0 && (
          <div className="mt-4 rounded-2xl border border-dashed border-gray-300 py-10 text-center dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">Belum ada aplikasi yang cocok</p>
            <p className="mt-1 text-xs text-gray-400">
              {hanyaFavorit ? 'Tandai bintang pada aplikasi untuk menambah favorit.' : 'Coba kata kunci atau kategori lain.'}
            </p>
            <button onClick={reset} className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">
              Tampilkan semua aplikasi
            </button>
          </div>
        )}
      </section>

      {/* Catatan kaki */}
      <aside className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white p-3 text-[11px] leading-relaxed text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        <Info size={15} className="mt-0.5 shrink-0 text-gray-400" />
        <div>
          <p className="font-semibold text-gray-700 dark:text-gray-200">Pemeriksaan tautan: {DIPERIKSA_PADA}</p>
          <p className="mt-0.5">
            Status menunjukkan hasil pemeriksaan halaman publik, bukan pemantauan langsung atau keberhasilan login.
            “Perlu cek manual” dan “Akses otomatis dibatasi” tidak selalu berarti situs sedang mati.
            Favorit disimpan hanya di browser ini.
          </p>
        </div>
      </aside>
    </div>
  )
}
