import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, CheckCircle2, AlertCircle, Loader2, Search, ArrowLeft, Users, UserCheck, KeyRound } from 'lucide-react'
import api from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

// Pemilih lembaga untuk superadmin: masuk ke dashboard satu lembaga tanpa
// logout, lalu kembali ke panel platform.
//
// Kenapa ada: menu superadmin hanya memuat modul platform. Untuk memeriksa
// data satu lembaga (siswa, rapor, keuangan), superadmin harus mengetik URL
// secara manual. Halaman ini memberi pintu masuk yang jelas.
//
// Keamanan: token baru tetap membawa role super_admin, hanya tenant_id yang
// diganti. Hak akses tidak bertambah — superadmin memang sudah berwenang.

type Lembaga = {
  id: string; slug: string; nama: string; aktif: number
  plan?: string; domain_custom?: string; base_domain?: string
  siswa: number; pengguna: number
}

export default function SuperadminLembagaPage() {
  const navigate = useNavigate()
  const { masukLembaga } = useAuthStore()
  const [data, setData] = useState<{ lembaga: Lembaga[]; aktif_sekarang?: string; mode?: string } | null>(null)
  const [cari, setCari] = useState('')
  const [sibuk, setSibuk] = useState('')
  const [galat, setGalat] = useState('')

  // Reset sandi: /api/auth/forgot-password hanya simulasi (tidak mengirim email),
  // jadi superadmin perlu menetapkan sandi sementara secara langsung.
  type Pengguna = { id: string; nama: string; email: string | null; role: string }
  const [reset, setReset] = useState<{ id: string; nama: string; userId: string; sandi: string; pesan: string; gagal: boolean } | null>(null)
  const [resetPengguna, setResetPengguna] = useState<Pengguna[]>([])
  const [resetSibuk, setResetSibuk] = useState(false)

  const bukaReset = async (l: Lembaga) => {
    setReset({ id: l.id, nama: l.nama, userId: '', sandi: '', pesan: '', gagal: false })
    setResetPengguna([])
    try {
      const r = await api.get(`/superadmin/pengguna?tenant_id=${encodeURIComponent(l.id)}`)
      const rows: Pengguna[] = Array.isArray(r.data) ? r.data : []
      // Staf lebih dulu; akun siswa/wali tidak perlu direset dari sini.
      const urut = ['kepala', 'admin', 'operator', 'tata_usaha', 'bendahara', 'guru']
      setResetPengguna(rows.filter(u => urut.includes(u.role)).sort((a, b) => urut.indexOf(a.role) - urut.indexOf(b.role)))
    } catch (e: any) {
      setReset(r => r ? { ...r, pesan: e?.response?.data?.error || 'Gagal memuat pengguna', gagal: true } : r)
    }
  }

  const tutupReset = () => { setReset(null); setResetPengguna([]); setResetSibuk(false) }

  const simpanReset = async () => {
    if (!reset?.userId || reset.sandi.trim().length < 6) return
    setResetSibuk(true)
    try {
      const r = await api.post('/superadmin/reset-sandi', {
        tenant_id: reset.id, user_id: reset.userId, sandi: reset.sandi.trim(),
      })
      const nama = r.data?.pengguna?.nama || 'Pengguna'
      setReset(r2 => r2 ? { ...r2, pesan: `Sandi ${nama} berhasil direset. Minta pengguna login dengan sandi ini, lalu ganti.`, gagal: false, sandi: '' } : r2)
    } catch (e: any) {
      setReset(r2 => r2 ? { ...r2, pesan: e?.response?.data?.error || 'Gagal mereset sandi', gagal: true } : r2)
    } finally { setResetSibuk(false) }
  }

  useEffect(() => {
    api.get('/superadmin/lembaga')
      .then(r => setData(r.data))
      .catch(e => setGalat(e?.response?.data?.error || 'Gagal memuat daftar lembaga'))
  }, [])

  const daftar = (data?.lembaga || []).filter(l => {
    const q = cari.trim().toLowerCase()
    if (!q) return true
    return String(l.nama).toLowerCase().includes(q) || String(l.slug).toLowerCase().includes(q)
  })

  const masuk = async (l: Lembaga) => {
    setSibuk(l.id); setGalat('')
    try {
      await masukLembaga(l.id)
      navigate('/admin')
      // Muat ulang agar seluruh state (pengaturan, menu, data) mengikuti
      // lembaga yang baru. Token sudah tersimpan sebelum reload.
      window.location.reload()
    } catch (e: any) {
      setGalat(e?.response?.data?.error || 'Gagal masuk ke lembaga')
      setSibuk('')
    }
  }

  return (
    <div className="space-y-5 pb-24 lg:pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Masuk sebagai Lembaga</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Lihat dashboard dan data satu lembaga tanpa keluar dari akun superadmin.
          </p>
        </div>
        <button onClick={() => navigate('/admin/tenants')}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          <ArrowLeft size={14} /> Manajemen Lembaga
        </button>
      </div>

      {data?.mode === 'masuk_lembaga' && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>Anda sedang berada di dalam konteks satu lembaga. Kembali ke panel platform lewat tombol di header.</span>
        </div>
      )}

      {galat && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span>{galat}</span>
        </div>
      )}

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={cari}
          onChange={e => setCari(e.target.value)}
          placeholder="Cari nama atau slug lembaga..."
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900"
        />
      </div>

      {!data && !galat && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-800" />)}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {daftar.map(l => {
          const mati = Number(l.aktif) !== 1
          const sedang = data?.aktif_sekarang === l.id
          return (
            <div key={l.id}
              className={`rounded-2xl border bg-white p-4 shadow-sm transition dark:bg-gray-900 ${
                mati ? 'border-gray-200 opacity-60 dark:border-gray-800' : 'border-gray-200 hover:border-primary hover:shadow-md dark:border-gray-700'
              }`}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Building2 size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{l.nama}</p>
                  <p className="truncate text-[11px] text-gray-400">{l.domain_custom || `${l.slug}.jurnal.cc.cd`}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1"><Users size={11} /> {l.siswa} siswa</span>
                    <span className="inline-flex items-center gap-1"><UserCheck size={11} /> {l.pengguna} pengguna</span>
                    {mati
                      ? <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-500 dark:bg-gray-800">Nonaktif</span>
                      : sedang
                        ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">Sedang dibuka</span>
                        : <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">Aktif</span>}
                  </div>
                </div>
              </div>
              <button
                onClick={() => void masuk(l)}
                disabled={mati || Boolean(sibuk)}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2 text-xs font-bold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sibuk === l.id ? <><Loader2 size={14} className="animate-spin" /> Membuka...</> : <><CheckCircle2 size={14} /> Masuk ke lembaga</>}
              </button>
              {/* Jalur pemulihan sandi. /api/auth/forgot-password hanya simulasi
                  (tidak mengirim email), jadi tanpa ini pengguna yang lupa sandi
                  — termasuk kepala madrasah — tidak punya jalan masuk sama sekali. */}
              <button
                onClick={() => void bukaReset(l)}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2 text-xs font-semibold text-gray-600 transition hover:border-primary hover:text-primary dark:border-gray-700 dark:text-gray-300"
              >
                <KeyRound size={13} /> Reset sandi pengguna
              </button>
            </div>
          )
        })}
      </div>

      {data && daftar.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">Tidak ada lembaga yang cocok dengan pencarian.</p>
      )}

      {reset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { if (!resetSibuk) tutupReset() }}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <KeyRound size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Reset sandi — {reset.nama}</h3>
                <p className="mt-0.5 text-[11px] text-gray-500">Pengguna wajib mengganti sandi ini saat login berikutnya.</p>
              </div>
            </div>

            {resetPengguna.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Memuat pengguna...</p>
            ) : (
              <>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Pilih pengguna</label>
                <select
                  value={reset.userId}
                  onChange={e => setReset({ ...reset, userId: e.target.value })}
                  className="mb-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="">-- Pilih pengguna --</option>
                  {resetPengguna.map(u => (
                    <option key={u.id} value={u.id}>{u.nama} — {u.role}{u.email ? ` (${u.email})` : ''}</option>
                  ))}
                </select>

                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Sandi sementara</label>
                <input
                  type="text"
                  value={reset.sandi}
                  onChange={e => setReset({ ...reset, sandi: e.target.value })}
                  placeholder="Minimal 6 karakter"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
                {reset.sandi.length > 0 && reset.sandi.length < 6 && (
                  <p className="mt-1 text-[11px] text-red-600">Minimal 6 karakter.</p>
                )}

                {reset.pesan && (
                  <p className={`mt-3 rounded-xl px-3 py-2 text-xs ${reset.gagal ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {reset.pesan}
                  </p>
                )}

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={tutupReset}
                    disabled={resetSibuk}
                    className="flex-1 rounded-xl border border-gray-200 py-2 text-xs font-semibold text-gray-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
                  >
                    Tutup
                  </button>
                  <button
                    onClick={() => void simpanReset()}
                    disabled={resetSibuk || !reset.userId || reset.sandi.trim().length < 6}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {resetSibuk ? <><Loader2 size={13} className="animate-spin" /> Menyimpan...</> : 'Simpan sandi baru'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
