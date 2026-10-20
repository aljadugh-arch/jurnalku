import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import BottomNavigation from './BottomNavigation'
import AdzanNotifier from '../AdzanNotifier'
import { useSidebarStore } from '../../stores/sidebarStore'
import { useAuthStore } from '../../stores/authStore'
import { isReadOnly } from '../../lib/roles'
import { Eye, Building2, ArrowLeft } from 'lucide-react'
import { clsx } from 'clsx'
import { useState, useEffect } from 'react'
import api from '../../services/api'

export default function DashboardLayout() {
  const { isOpen } = useSidebarStore()
  const role = useAuthStore(s => s.user?.role)
  // Superadmin bisa masuk ke konteks satu lembaga. Token menyimpan tenant asal;
  // selama itu ada, tampilkan banner + jalan kembali agar tidak tersesat.
  const [diLembaga, setDiLembaga] = useState(false)
  const [namaLembaga, setNamaLembaga] = useState('')
  const [kembali, setKembali] = useState(false)

  useEffect(() => {
    if (role !== 'super_admin') return
    api.get('/superadmin/lembaga')
      .then(r => {
        const mode = r.data?.mode === 'masuk_lembaga'
        setDiLembaga(mode)
        if (mode) {
          const t = (r.data?.lembaga || []).find((x: any) => x.id === r.data?.aktif_sekarang)
          setNamaLembaga(t?.nama || '')
        }
      })
      .catch(() => {})
  }, [role])

  const balik = async () => {
    setKembali(true)
    try {
      await api.post('/superadmin/kembali-platform').then(r => {
        localStorage.setItem('jurnalku_token', r.data.token)
      })
      window.location.href = '/admin'
      window.location.reload()
    } catch { setKembali(false) }
  }

  return (
    <div className="h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <div className={clsx(
        'flex h-full flex-col transition-all duration-300',
        isOpen ? 'lg:ml-64' : 'lg:ml-20'
      )}>
        <div className="hidden lg:block">
          <Header />
        </div>
        {diLembaga && (
          <div className="flex flex-wrap items-center gap-2 border-b border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200 sm:px-6">
            <Building2 size={14} className="shrink-0" />
            <span>Anda membuka data <strong>{namaLembaga || 'lembaga ini'}</strong> sebagai super admin.</span>
            <button onClick={() => void balik()} disabled={kembali}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-white px-2 py-1 font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300">
              <ArrowLeft size={12} /> {kembali ? 'Kembali...' : 'Kembali ke platform'}
            </button>
          </div>
        )}
        {isReadOnly(role) && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs px-4 sm:px-6 py-2 flex items-center gap-2">
            <Eye size={14} /> Mode Pimpinan (Kepala Madrasah/Sekolah) — akses hanya-lihat, tidak dapat mengubah data.
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 sm:p-6 lg:pb-6">
          <Outlet />
        </main>
        <BottomNavigation />
      </div>
      {/* Adzan otomatis saat masuk waktu sholat (hanya untuk peran staf,
          hanya bila diaktifkan admin di Pengaturan > Notifikasi). */}
      <AdzanNotifier />
    </div>
  )
}

