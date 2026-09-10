import { useNavigate } from 'react-router-dom'
import { Award, BookOpen, Calendar, ClipboardCheck, FileText, ShoppingBag, User, Wallet } from 'lucide-react'

const items = [
  { label: 'Jadwal', path: '/siswa/jadwal', icon: Calendar },
  { label: 'Absensi', path: '/siswa/absensi', icon: ClipboardCheck },
  { label: 'Nilai', path: '/siswa/nilai', icon: Award },
  { label: 'Tugas', path: '/siswa/tugas', icon: FileText },
  { label: 'Tagihan', path: '/siswa/tagihan', icon: Wallet },
  { label: 'Tabungan', path: '/siswa/tabungan', icon: Wallet },
  { label: 'Perpustakaan', path: '/siswa/perpustakaan', icon: BookOpen },
  { label: 'Posting', path: '/siswa/posting', icon: FileText },
  { label: 'Kantin', path: '/siswa/kantin', icon: ShoppingBag },
  { label: 'Profil', path: '/siswa/profile', icon: User },
]

export default function SiswaMenuPage() {
  const navigate = useNavigate()
  return <div className="space-y-4">
    <div><h1 className="text-2xl font-bold text-gray-800">Menu Siswa</h1><p className="text-sm text-gray-500">Pilih layanan yang ingin dibuka.</p></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map(item => { const Icon = item.icon; return <button key={item.path} onClick={() => navigate(item.path)} className="rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:shadow-md active:scale-[.98]"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white"><Icon size={20}/></span><p className="mt-3 text-sm font-semibold text-gray-800">{item.label}</p></button> })}
    </div>
  </div>
}
