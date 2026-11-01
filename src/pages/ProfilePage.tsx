import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Camera, Save, Lock, ShieldCheck, ShieldOff, Copy } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { roleLabel } from '../lib/roles'
import { compressImage } from '../lib/image'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, updateUser } = useAuthStore()
  const [form, setForm] = useState({ nama: user?.nama || '', email: user?.email || '' })
  const [saving, setSaving] = useState(false)
  const [avatar, setAvatar] = useState(user?.avatar || '')
  // --- 2FA authenticator ---
  const [duaFaktor, setDuaFaktor] = useState<{ aktif: boolean }>({ aktif: false })
  const [siapkan, setSiapkan] = useState<{ secret: string; otpauth: string } | null>(null)
  const [kode2fa, setKode2fa] = useState('')
  const [pemulihan, setPemulihan] = useState<string[]>([])
  const [sandiMatikan, setSandiMatikan] = useState('')
  const [kodeMatikan, setKodeMatikan] = useState('')

  useEffect(() => {
    api.get('/auth/2fa/status').then(r => setDuaFaktor({ aktif: Boolean(r.data?.aktif) })).catch(() => {})
  }, [])

  const mulai2fa = async () => {
    try {
      const r = await api.post('/auth/2fa/setup')
      setSiapkan({ secret: r.data.secret, otpauth: r.data.otpauth })
      setPemulihan([])
      setKode2fa('')
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal memulai 2FA') }
  }

  const aktifkan2fa = async () => {
    try {
      const r = await api.post('/auth/2fa/enable', { code: kode2fa.replace(/\D/g, '') })
      setPemulihan(r.data.recovery_codes || [])
      setDuaFaktor({ aktif: true })
      setSiapkan(null)
      setKode2fa('')
      toast.success('2FA aktif')
    } catch (e: any) { toast.error(e.response?.data?.error || 'Kode salah') }
  }

  const matikan2fa = async () => {
    try {
      await api.post('/auth/2fa/disable', { password: sandiMatikan, code: kodeMatikan })
      setDuaFaktor({ aktif: false })
      setSandiMatikan(''); setKodeMatikan('')
      toast.success('2FA dimatikan')
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal mematikan 2FA') }
  }

  const salin = async (teks: string) => {
    try { await navigator.clipboard.writeText(teks); toast.success('Disalin') } catch { toast.error('Gagal menyalin') }
  }

  const handleSave = async () => {
    if (!form.nama.trim()) { toast.error('Nama wajib diisi'); return }
    setSaving(true)
    try {
      const res = await api.put('/auth/profile', form)
      updateUser(res.data)
      toast.success('Profil berhasil disimpan')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan profil')
    } finally { setSaving(false) }
  }

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await compressImage(file) // resize->512px, JPEG q0.82
    const fd = new FormData()
    fd.append('avatar', compressed)
    try {
      const res = await api.post('/auth/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setAvatar(res.data.avatar)
      updateUser({ avatar: res.data.avatar })
      toast.success('Foto profil diperbarui')
    } catch { toast.error('Gagal mengunggah foto') }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Profil Saya</h1>
        <p className="text-gray-500 text-sm mt-1">Kelola foto, nama, dan email akun Anda</p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-6">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center border">
              {avatar
                ? <img src={avatar} alt="Foto" className="w-full h-full object-cover" />
                : <span className="text-2xl font-bold text-primary">{form.nama.charAt(0) || 'U'}</span>}
            </div>
            <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center cursor-pointer shadow hover:bg-primary-dark">
              <Camera size={14} />
              <input type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
            </label>
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-800">{form.nama || 'User'}</p>
            <p className="truncate text-sm text-gray-500">{roleLabel(user?.role)}</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Nama Lengkap</label>
          <input value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} className="w-full px-4 py-2 border rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
          <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-2 border rounded-lg text-sm" />
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
            <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
          <button onClick={() => navigate('change-password')} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
            <Lock size={16} /> Ubah Password
          </button>
        </div>
      </div>

      {/* --- Keamanan akun: 2FA authenticator --- */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-lg p-2 ${duaFaktor.aktif ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
            {duaFaktor.aktif ? <ShieldCheck size={18} /> : <ShieldOff size={18} />}
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-800">Authenticator (2FA)</h2>
            <p className="text-sm text-gray-500">
              {duaFaktor.aktif
                ? 'Aktif. Saat masuk, Anda diminta kode 6 digit dari aplikasi authenticator.'
                : 'Belum aktif. Aktifkan agar akun tetap aman walau sandi diketahui orang lain.'}
            </p>
          </div>
        </div>

        {duaFaktor.aktif ? (
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs text-gray-500">Untuk mematikan, masukkan sandi dan kode authenticator saat ini.</p>
            <input type="password" value={sandiMatikan} onChange={e => setSandiMatikan(e.target.value)} placeholder="Sandi" className="w-full px-4 py-2 border rounded-lg text-sm" />
            <input value={kodeMatikan} onChange={e => setKodeMatikan(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Kode 6 digit" inputMode="numeric" className="w-full px-4 py-2 border rounded-lg text-sm" />
            <button onClick={matikan2fa} disabled={!sandiMatikan || kodeMatikan.length !== 6} className="px-4 py-2 border border-rose-200 text-rose-600 rounded-lg text-sm hover:bg-rose-50 disabled:opacity-50">
              Matikan 2FA
            </button>
          </div>
        ) : siapkan ? (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm text-gray-600">Pindai QR ini dengan Google Authenticator / Authy:</p>
            <div className="flex flex-wrap items-start gap-4">
              <div className="rounded-xl border bg-white p-3">
                <QRCodeSVG value={siapkan.otpauth} size={168} />
              </div>
              <div className="min-w-0 space-y-2">
                <p className="text-xs text-gray-500">Tidak bisa memindai? Masukkan kunci ini secara manual:</p>
                <div className="flex items-center gap-2">
                  <code className="rounded-lg bg-gray-50 px-3 py-2 text-xs break-all">{siapkan.secret}</code>
                  <button onClick={() => salin(siapkan.secret)} className="rounded-lg border p-2 text-gray-500 hover:bg-gray-50" aria-label="Salin kunci"><Copy size={14} /></button>
                </div>
              </div>
            </div>
            <input value={kode2fa} onChange={e => setKode2fa(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Masukkan kode 6 digit untuk mengaktifkan" inputMode="numeric" className="w-full px-4 py-2 border rounded-lg text-sm" />
            <div className="flex gap-2">
              <button onClick={aktifkan2fa} disabled={kode2fa.length !== 6} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">Aktifkan</button>
              <button onClick={() => setSiapkan(null)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Batal</button>
            </div>
          </div>
        ) : (
          <button onClick={mulai2fa} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            <ShieldCheck size={16} /> Aktifkan Authenticator
          </button>
        )}

        {pemulihan.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">Simpan kode pemulihan ini sekarang</p>
            <p className="mb-2 text-xs text-amber-700">Ditampilkan sekali. Setiap kode hanya bisa dipakai satu kali bila HP hilang.</p>
            <div className="grid grid-cols-2 gap-1 font-mono text-xs text-amber-900">
              {pemulihan.map(k => <span key={k}>{k}</span>)}
            </div>
            <button onClick={() => salin(pemulihan.join('\n'))} className="mt-3 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">
              Salin semua
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
