import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ShieldAlert, X } from 'lucide-react'
import api from '../services/api'

// Peringatan LUNAK 2FA. Hanya tampil bila superadmin sudah menyalakannya di
// dashboard (platform_settings.twofa_policy). Sebelum sosialisasi fitur ini
// dibiarkan mati, sehingga tidak ada banner yang mengganggu pengguna.
const KUNCI_TUTUP = 'jk-2fa-banner-tutup'

function ruteProfil(pathname: string) {
  const akar = pathname.split('/')[1] || 'admin'
  return `/${akar}/profile`
}

export default function TwoFactorBanner() {
  const { pathname } = useLocation()
  const [tampil, setTampil] = useState(false)

  useEffect(() => {
    const hariIni = new Date().toISOString().slice(0, 10)
    try { if (localStorage.getItem(KUNCI_TUTUP) === hariIni) return } catch { /* localStorage diblokir */ }
    api.get('/auth/2fa/policy', { timeout: 15000 })
      .then(r => {
        const d = r.data || {}
        if (d.berlaku_untuk_saya === true && d.sudah_aktif !== true) setTampil(true)
      })
      .catch(() => { /* gagal memuat kebijakan: jangan ganggu pengguna */ })
  }, [])

  if (!tampil) return null

  const tutup = () => {
    setTampil(false)
    try { localStorage.setItem(KUNCI_TUTUP, new Date().toISOString().slice(0, 10)) } catch { /* abaikan */ }
  }

  return (
    <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
      <ShieldAlert size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Akun Anda belum dilindungi 2FA</p>
        <p className="mt-0.5 leading-5 text-amber-700">
          Aktifkan authenticator agar akun tetap aman walau sandi diketahui orang lain.
        </p>
        <Link to={ruteProfil(pathname)} className="mt-1 inline-block font-semibold underline">Aktifkan sekarang</Link>
      </div>
      <button type="button" onClick={tutup} aria-label="Tutup peringatan" className="shrink-0 rounded p-1 text-amber-700 hover:bg-amber-100">
        <X size={14} />
      </button>
    </div>
  )
}
