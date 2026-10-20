import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Wallet, Receipt, CheckCircle, Clock, BookOpen, ChevronRight,
  Users, AlertCircle, TrendingUp, LogOut, Moon, Sun, RefreshCw,
} from 'lucide-react'
import api from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { useThemeStore } from '../../stores/themeStore'

// Dashboard WALI MURID.
//
// Berbeda dari dashboard siswa dalam tiga hal yang penting:
//  1. Wali bisa punya LEBIH DARI SATU anak (kakak-adik satu nomor WA). Karena
//     itu ada pemilih anak di paling atas — tanpa itu wali hanya melihat anak
//     pertama dan mengira data anak lain hilang.
//  2. Wali tidak butuh tombol absensi/ujian. Yang dibutuhkan: kehadiran,
//     tagihan, tabungan, dan nilai.
//  3. Bahasa lebih ringkas — wali membuka ini dari ponsel sambil bekerja.

const rp = (n: any) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')

function kartu(label: string, nilai: string, ket: string, warna: string, Icon: any) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
          <p className={`mt-1 truncate text-lg font-bold ${warna}`}>{nilai}</p>
          <p className="mt-0.5 truncate text-[11px] text-gray-400">{ket}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-400 dark:bg-gray-800">
          <Icon size={17} />
        </span>
      </div>
    </div>
  )
}

export default function WaliDashboardPage() {
  const { user, logout } = useAuthStore()
  const { dark, toggle } = useThemeStore()
  const [data, setData] = useState<any>(null)
  const [anakId, setAnakId] = useState<string>('')
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

  const muat = (id?: string) => {
    setMemuat(true); setGalat('')
    api.get('/siswa/dashboard', { params: id ? { student_id: id } : {} })
      .then(r => {
        setData(r.data)
        if (!id && r.data?.siswa?.id) setAnakId(String(r.data.siswa.id))
      })
      .catch(e => setGalat(e?.response?.data?.error || 'Gagal memuat data'))
      .finally(() => setMemuat(false))
  }

  useEffect(() => { muat() }, [])

  const anak = useMemo(() => (data?.children || []) as any[], [data])
  const siswa = data?.siswa
  const rekap = data?.rekap || { hadir: 0, sakit: 0, izin: 0, alpha: 0 }
  const tagihan = data?.tagihan || { total: 0, belum_bayar: 0, lunas: 0 }
  const tabungan = data?.tabungan || { saldo: 0, setor: 0, tarik: 0 }
  const nilai = (data?.nilai_detail || []) as any[]
  const absensi = (data?.absensi_detail || []) as any[]
  const totalHari = Number(rekap.hadir || 0) + Number(rekap.sakit || 0) + Number(rekap.izin || 0) + Number(rekap.alpha || 0)
  const persenHadir = totalHari ? Math.round((Number(rekap.hadir || 0) / totalHari) * 100) : 0

  return (
    <div className="min-h-screen bg-slate-50 pb-10 dark:bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Portal Wali Murid</p>
            <h1 className="truncate text-base font-bold text-gray-800 dark:text-gray-100">{user?.nama || 'Wali Murid'}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => muat(anakId)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="Muat ulang">
              <RefreshCw size={17} className={memuat ? 'animate-spin' : ''} />
            </button>
            <button onClick={toggle} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="Tema">
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button onClick={() => { logout(); window.location.href = '/' }} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="Keluar">
              <LogOut size={17} />
            </button>
          </div>
        </div>

        {/* Pemilih anak — hanya muncul bila lebih dari satu */}
        {anak.length > 1 && (
          <div className="mx-auto max-w-5xl px-4 pb-3">
            <div className="flex gap-2 overflow-x-auto">
              {anak.map((a: any) => (
                <button
                  key={a.id}
                  onClick={() => { setAnakId(String(a.id)); muat(String(a.id)) }}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    String(a.id) === String(anakId)
                      ? 'border-primary bg-primary text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                  }`}
                >
                  {a.nama}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        {galat && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span>{galat}</span>
          </div>
        )}

        {memuat && !data && (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-800" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-800" />)}
            </div>
          </div>
        )}

        {!memuat && !siswa && !galat && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">Belum ada anak yang tertaut</p>
            <p className="mt-1">Nomor WhatsApp ini belum terdaftar pada data siswa mana pun. Hubungi tata usaha sekolah untuk menautkan.</p>
          </div>
        )}

        {siswa && (
          <>
            {/* Kartu identitas anak */}
            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center gap-3">
                {siswa.foto ? (
                  <img
                    src={String(siswa.foto).startsWith('/') ? siswa.foto : `/uploads/${siswa.foto}`}
                    alt={siswa.nama}
                    className="h-14 w-14 shrink-0 rounded-xl object-cover ring-2 ring-primary/20"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Users size={22} />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-bold text-gray-800 dark:text-gray-100">{siswa.nama}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {siswa.rombel_nama || 'Belum masuk kelas'} · NIS {siswa.nis || '-'}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle size={11} /> Kehadiran {persenHadir}%
                  </p>
                </div>
              </div>
            </section>

            {/* Ringkasan angka */}
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {kartu('Tagihan Belum Dibayar', rp(tagihan.belum_bayar), `Total ${rp(tagihan.total)}`, Number(tagihan.belum_bayar) > 0 ? 'text-rose-600' : 'text-emerald-600', Receipt)}
              {kartu('Saldo Tabungan', rp(tabungan.saldo), `Setor ${rp(tabungan.setor)}`, 'text-primary', Wallet)}
              {kartu('Kehadiran', `${rekap.hadir || 0} hari`, `${totalHari} hari tercatat`, 'text-emerald-600', CheckCircle)}
              {kartu('Alpha', `${rekap.alpha || 0} hari`, `Sakit ${rekap.sakit || 0} · Izin ${rekap.izin || 0}`, Number(rekap.alpha) > 0 ? 'text-rose-600' : 'text-gray-600', Clock)}
            </section>

            {/* Nilai terbaru */}
            <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <h2 className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-100">
                  <TrendingUp size={15} /> Nilai Terbaru
                </h2>
                <Link to="/siswa/nilai" className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary">
                  Semua <ChevronRight size={13} />
                </Link>
              </div>
              {nilai.length === 0 ? (
                <p className="p-4 text-sm text-gray-400">Belum ada nilai tercatat.</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {nilai.slice(0, 6).map((n: any, i: number) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{n.mapel_nama || 'Mata pelajaran'}</p>
                        <p className="text-[11px] text-gray-400">{n.tanggal || '-'}</p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary">
                        {n.pengetahuan ?? n.nilai ?? '-'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Tagihan */}
            <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <h2 className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-100">
                  <Receipt size={15} /> Tagihan
                </h2>
                <Link to="/siswa/tagihan" className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary">
                  Semua <ChevronRight size={13} />
                </Link>
              </div>
              {(data.tagihan_detail || []).length === 0 ? (
                <p className="p-4 text-sm text-gray-400">Tidak ada tagihan.</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {(data.tagihan_detail as any[]).slice(0, 5).map((t: any) => {
                    const lunas = ['lunas', 'sudah_bayar'].includes(String(t.status || '').toLowerCase())
                    return (
                      <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{t.jenis_nama || 'Tagihan'}</p>
                          <p className="text-[11px] text-gray-400">{t.bulan}/{t.tahun}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{rp(t.nominal)}</p>
                          <span className={`text-[11px] font-semibold ${lunas ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {lunas ? 'Lunas' : 'Belum bayar'}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* Kehadiran terakhir */}
            <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <h2 className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-100">
                  <BookOpen size={15} /> Kehadiran Terakhir
                </h2>
                <Link to="/siswa/absensi" className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary">
                  Semua <ChevronRight size={13} />
                </Link>
              </div>
              {absensi.length === 0 ? (
                <p className="p-4 text-sm text-gray-400">Belum ada catatan kehadiran.</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {absensi.slice(0, 5).map((a: any, i: number) => {
                    const s = String(a.status || '').toLowerCase()
                    const warna = s === 'hadir' ? 'text-emerald-600' : s === 'alpha' ? 'text-rose-600' : 'text-amber-600'
                    return (
                      <li key={i} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm text-gray-700 dark:text-gray-300">{a.tanggal}</span>
                        <span className={`text-xs font-semibold capitalize ${warna}`}>{a.status || '-'}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
