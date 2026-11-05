import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Command, Search, X } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { flattenMenu, menuForRole, type FlatMenu } from '../lib/menuItems'

// Pintasan papan tombol untuk pengguna desktop.
//
// Tiga lapis, sengaja dipilih supaya tidak bentrok dengan kebiasaan browser:
//   Ctrl/⌘ + K   -> palet perintah (cari semua menu yang boleh diakses peran ini)
//   Alt + 1..9   -> sembilan menu teratas sesuai urutan sidebar
//   ?            -> daftar pintasan yang tersedia
//
// Semua pintasan MATI saat fokus berada di kolom isian, supaya mengetik huruf
// "j" di form jurnal tidak tiba-tiba berpindah halaman.

function sedangMengetik(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null
  if (!node) return false
  const tag = node.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable === true
}

export default function KeyboardShortcuts() {
  const role = useAuthStore(s => s.user?.role)
  const navigate = useNavigate()
  const [paletBuka, setPaletBuka] = useState(false)
  const [bantuanBuka, setBantuanBuka] = useState(false)
  const [kueri, setKueri] = useState('')
  const [sorot, setSorot] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const menu: FlatMenu[] = useMemo(() => flattenMenu(menuForRole(role)), [role])

  const hasil = useMemo(() => {
    const q = kueri.trim().toLowerCase()
    const daftar = q ? menu.filter(m => m.label.toLowerCase().includes(q)) : menu
    return daftar.slice(0, 40)
  }, [kueri, menu])

  useEffect(() => { setSorot(0) }, [kueri, paletBuka])

  const buka = (item?: FlatMenu) => {
    if (!item) return
    setPaletBuka(false)
    setKueri('')
    if (item.external) window.open(item.external, '_blank', 'noopener')
    else navigate(item.path)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/⌘+K tetap boleh membuka palet walau kursor di kolom isian.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletBuka(v => !v)
        return
      }
      if (e.key === 'Escape') { setPaletBuka(false); setBantuanBuka(false); return }

      if (sedangMengetik(e.target)) return
      // Di layar ponsel navigasi sudah lewat bottom nav; pintasan hanya untuk desktop.
      if (window.innerWidth < 1024) return

      // Alt + 1..9 -> menu ke-n sesuai urutan sidebar peran ini.
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        const urut = Number(e.key) - 1
        const item = menu[urut]
        if (item) { e.preventDefault(); buka(item) }
        return
      }

      if (e.key === '?') { e.preventDefault(); setBantuanBuka(v => !v); return }

      if (paletBuka) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setSorot(i => Math.min(i + 1, hasil.length - 1)) }
        if (e.key === 'ArrowUp') { e.preventDefault(); setSorot(i => Math.max(i - 1, 0)) }
        if (e.key === 'Enter') { e.preventDefault(); buka(hasil[sorot]) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // sengaja tanpa deps: handler perlu melihat state terbaru

  // Tombol di header membuka bantuan yang sama; komunikasi lewat event agar
  // tidak perlu menaikkan state ke layout.
  useEffect(() => {
    const bukaBantuan = () => setBantuanBuka(true)
    window.addEventListener('jurnalku:bantuan-pintasan', bukaBantuan)
    return () => window.removeEventListener('jurnalku:bantuan-pintasan', bukaBantuan)
  }, [])

  useEffect(() => {
    if (paletBuka) setTimeout(() => inputRef.current?.focus(), 30)
  }, [paletBuka])

  return (
    <>
      {/* Palet perintah */}
      {paletBuka && (
        <div role="dialog" aria-modal="true" aria-label="Cari menu"
          className="fixed inset-0 z-[80] hidden items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm lg:flex"
          onMouseDown={() => setPaletBuka(false)}>
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900"
            onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <Search size={18} className="text-gray-400" />
              <input
                ref={inputRef}
                value={kueri}
                onChange={e => setKueri(e.target.value)}
                placeholder="Cari menu… (mis. jurnal, siswa, tagihan)"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:text-white"
              />
              <kbd className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-400 dark:border-gray-700">Esc</kbd>
              <button type="button" onClick={() => setPaletBuka(false)} aria-label="Tutup"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} /></button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto py-1">
              {hasil.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-gray-400">Tidak ada menu yang cocok.</p>
              ) : hasil.map((item, i) => (
                <button key={`${item.path}-${item.label}`} type="button"
                  onMouseEnter={() => setSorot(i)}
                  onClick={() => buka(item)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${i === sorot ? 'bg-primary/10 text-primary' : 'text-gray-700 dark:text-gray-200'}`}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800">{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {i === sorot && <ArrowRight size={14} />}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-[10px] text-gray-400 dark:border-gray-800">
              <span>↑ ↓ pilih · Enter buka</span>
              <span className="flex items-center gap-1"><Command size={11} /> K untuk membuka lagi</span>
            </div>
          </div>
        </div>
      )}

      {/* Bantuan pintasan */}
      {bantuanBuka && (
        <div role="dialog" aria-modal="true" aria-label="Pintasan papan tombol"
          className="fixed inset-0 z-[80] hidden items-center justify-center bg-black/40 p-4 backdrop-blur-sm lg:flex"
          onMouseDown={() => setBantuanBuka(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-900"
            onMouseDown={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Pintasan Papan Tombol</h3>
              <button type="button" onClick={() => setBantuanBuka(false)} aria-label="Tutup"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} /></button>
            </div>
            <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
              <li className="flex items-center justify-between gap-3"><span>Cari menu</span><kbd className="rounded border px-1.5 py-0.5 text-[10px]">Ctrl/⌘ + K</kbd></li>
              {menu.slice(0, 9).map((m, i) => (
                <li key={`${m.path}-${m.label}`} className="flex items-center justify-between gap-3">
                  <span className="truncate">{m.label}</span>
                  <kbd className="shrink-0 rounded border px-1.5 py-0.5 text-[10px]">Alt + {i + 1}</kbd>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3"><span>Tampilkan bantuan ini</span><kbd className="rounded border px-1.5 py-0.5 text-[10px]">?</kbd></li>
              <li className="flex items-center justify-between gap-3"><span>Tutup jendela</span><kbd className="rounded border px-1.5 py-0.5 text-[10px]">Esc</kbd></li>
            </ul>
            <p className="mt-3 text-[11px] leading-4 text-gray-400">
              Pintasan tidak aktif saat kursor berada di kolom isian, dan tidak tersedia di layar ponsel.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
