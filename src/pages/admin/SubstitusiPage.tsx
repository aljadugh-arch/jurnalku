import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  UserCheck, Plus, Trash2, Search, CalendarDays, AlertTriangle,
  Users, Clock, X, Save, ShieldAlert,
} from 'lucide-react'
import api from '../../services/api'

// ============================================================================
// Substitusi Guru
//
// Guru berhalangan -> perlu pengganti PER TANGGAL, tanpa mengubah jadwal
// permanen. Yang membuat modul ini berguna: server menghitung bentrok lebih
// dulu, jadi admin melihat siapa yang sudah punya jam mengajar di waktu yang
// sama sebelum menugaskan.
// ============================================================================

type Sub = {
  id: string
  tanggal: string
  nama_asli: string | null
  nama_pengganti: string | null
  jam_mulai: string
  jam_selesai: string
  rombel: string | null
  mapel: string | null
  alasan: string
  dicatat_nama: string
}

type Calon = { id: string; nama: string; nip: string; bentrok: boolean; detail_bentrok: string[] }

const hariIni = () => new Date().toISOString().slice(0, 10)

export default function SubstitusiPage() {
  const [daftar, setDaftar] = useState<Sub[]>([])
  const [stat, setStat] = useState<any>(null)
  const [jadwal, setJadwal] = useState<any[]>([])
  const [memuat, setMemuat] = useState(true)
  const [cari, setCari] = useState('')
  const [buka, setBuka] = useState(false)

  const [tanggal, setTanggal] = useState(hariIni())
  const [jadwalId, setJadwalId] = useState('')
  const [calon, setCalon] = useState<Calon[]>([])
  const [infoJadwal, setInfoJadwal] = useState<any>(null)
  const [penggantiId, setPenggantiId] = useState('')
  const [alasan, setAlasan] = useState('')
  const [memuatCalon, setMemuatCalon] = useState(false)

  const muat = async () => {
    setMemuat(true)
    try {
      const [s, st, j] = await Promise.all([
        api.get('/substitusi'),
        api.get('/substitusi/statistik'),
        api.get('/jadwal'),
      ])
      setDaftar(Array.isArray(s.data) ? s.data : [])
      setStat(st.data || null)
      setJadwal(Array.isArray(j.data) ? j.data : [])
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal memuat data substitusi')
    } finally {
      setMemuat(false)
    }
  }

  useEffect(() => { muat() }, [])

  // Saat jadwal atau tanggal berubah, tanya server siapa yang bentrok.
  useEffect(() => {
    if (!jadwalId || !buka) { setCalon([]); setInfoJadwal(null); return }
    let hidup = true
    setMemuatCalon(true)
    api.get(`/substitusi/calon?jadwal_id=${encodeURIComponent(jadwalId)}&tanggal=${encodeURIComponent(tanggal)}`)
      .then(r => {
        if (!hidup) return
        setCalon(Array.isArray(r.data?.calon) ? r.data.calon : [])
        setInfoJadwal(r.data?.jadwal || null)
      })
      .catch(() => { if (hidup) setCalon([]) })
      .finally(() => { if (hidup) setMemuatCalon(false) })
    return () => { hidup = false }
  }, [jadwalId, tanggal, buka])

  const jadwalTampil = useMemo(() => {
    const q = cari.trim().toLowerCase()
    if (!q) return daftar
    return daftar.filter(s =>
      String(s.nama_asli || '').toLowerCase().includes(q) ||
      String(s.nama_pengganti || '').toLowerCase().includes(q) ||
      String(s.mapel || '').toLowerCase().includes(q) ||
      String(s.rombel || '').toLowerCase().includes(q) ||
      String(s.tanggal).includes(q),
    )
  }, [daftar, cari])

  const jadwalUrut = useMemo(
    () => [...jadwal].sort((a, b) => String(a.hari).localeCompare(String(b.hari)) || String(a.jam_mulai).localeCompare(String(b.jam_mulai))),
    [jadwal],
  )

  const penggantiTerpilih = calon.find(c => c.id === penggantiId) || null

  const simpan = async (paksa = false) => {
    if (!jadwalId) return toast.error('Pilih jadwal dulu')
    if (!penggantiId) return toast.error('Pilih guru pengganti')
    try {
      await api.post('/substitusi', {
        jadwal_id: jadwalId, tanggal, gtk_pengganti_id: penggantiId, alasan, paksa,
      })
      toast.success('Substitusi dicatat')
      setBuka(false); setJadwalId(''); setPenggantiId(''); setAlasan(''); setCalon([])
      await muat()
    } catch (e: any) {
      const d = e.response?.data
      if (d?.bisa_paksa) {
        if (confirm(`${d.error}\n\n${(d.bentrok || []).join('\n')}\n\nTetap tugaskan?`)) return simpan(true)
        return
      }
      toast.error(d?.error || 'Gagal menyimpan substitusi')
    }
  }

  const hapus = async (s: Sub) => {
    if (!confirm(`Hapus substitusi ${s.nama_pengganti} untuk ${s.mapel || 'mapel'} pada ${s.tanggal}?`)) return
    try {
      await api.delete(`/substitusi/${s.id}`)
      toast.success('Substitusi dihapus')
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menghapus')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-display font-bold text-gray-800 dark:text-gray-100">
            <UserCheck size={22} className="text-primary" /> Substitusi Guru
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Catat guru pengganti per tanggal tanpa mengubah jadwal permanen.
          </p>
        </div>
        <button onClick={() => setBuka(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm text-white">
          <Plus size={15} /> Catat pengganti
        </button>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-xs text-gray-500"><CalendarDays size={14} /> Substitusi bulan ini</div>
          <p className="mt-1 text-2xl font-bold text-gray-800 dark:text-gray-100">{stat?.total ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-xs text-gray-500"><Users size={14} /> Guru paling sering</div>
          <p className="mt-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
            {stat?.perGuru?.[0] ? `${stat.perGuru[0].nama} (${stat.perGuru[0].n}×)` : '—'}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-xs text-gray-500"><Clock size={14} /> Alasan terbanyak</div>
          <p className="mt-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
            {stat?.perAlasan?.[0] ? `${stat.perAlasan[0].alasan} (${stat.perAlasan[0].n}×)` : '—'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
        <Search size={15} className="text-gray-400" />
        <input value={cari} onChange={e => setCari(e.target.value)}
          placeholder="Cari guru, mapel, rombel, atau tanggal…"
          className="w-full bg-transparent text-sm outline-none dark:text-gray-100" />
        <span className="shrink-0 text-xs text-gray-400">{jadwalTampil.length} catatan</span>
      </div>

      {memuat ? (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">Memuat…</div>
      ) : jadwalTampil.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">
          <UserCheck size={42} className="mx-auto mb-3 opacity-60" />
          <p>Belum ada catatan substitusi.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jadwalTampil.map(s => (
            <div key={s.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-gray-800 dark:text-gray-100">{s.mapel || 'Mapel'}</p>
                  {s.rombel && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">{s.rombel}</span>}
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{s.tanggal} · {s.jam_mulai}–{s.jam_selesai}</p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                  <span className="line-through opacity-60">{s.nama_asli || '-'}</span>
                  <span className="mx-1.5">→</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">{s.nama_pengganti || '-'}</span>
                </p>
                {s.alasan && <p className="mt-0.5 text-xs text-gray-500">Alasan: {s.alasan}</p>}
                <p className="mt-1 text-[11px] text-gray-400">dicatat {s.dicatat_nama || '-'}</p>
              </div>
              <button onClick={() => hapus(s)} className="shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" title="Hapus">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {buka && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setBuka(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 dark:bg-gray-900" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-gray-800 dark:text-gray-100">Catat guru pengganti</p>
              <button onClick={() => setBuka(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs text-gray-500">Tanggal
                <input type="date" value={tanggal} onChange={e => { setTanggal(e.target.value); setPenggantiId('') }}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>

              <label className="block text-xs text-gray-500">Jadwal yang ditinggal
                <select value={jadwalId} onChange={e => { setJadwalId(e.target.value); setPenggantiId('') }}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                  <option value="">-- pilih jadwal --</option>
                  {jadwalUrut.map((j: any) => (
                    <option key={j.id} value={j.id}>
                      {String(j.hari || '').toUpperCase()} {j.jam_mulai}–{j.jam_selesai} · {j.mapel_nama || j.mapel || 'Mapel'} · {j.rombel_nama || ''}
                    </option>
                  ))}
                </select>
              </label>

              {infoJadwal && (
                <p className="rounded-lg bg-gray-50 p-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  Jam {infoJadwal.jam_mulai}–{infoJadwal.jam_selesai} · hari {infoJadwal.hari}
                </p>
              )}

              <label className="block text-xs text-gray-500">
                Guru pengganti {memuatCalon && <span className="text-gray-400">(memeriksa bentrok…)</span>}
                <select value={penggantiId} onChange={e => setPenggantiId(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                  <option value="">-- pilih guru --</option>
                  {calon.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nama}{c.bentrok ? '  ⚠ BENTROK' : ''}
                    </option>
                  ))}
                </select>
              </label>

              {penggantiTerpilih?.bentrok && (
                <div className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  <p className="flex items-center gap-1 font-semibold"><AlertTriangle size={13} /> Sudah mengajar di jam ini:</p>
                  <ul className="mt-1 list-inside list-disc">
                    {penggantiTerpilih.detail_bentrok.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                  <p className="mt-1">Server akan menolak. Kamu bisa menugaskan paksa bila memang perlu.</p>
                </div>
              )}

              <label className="block text-xs text-gray-500">Alasan
                <input value={alasan} onChange={e => setAlasan(e.target.value)}
                  placeholder="sakit, dinas luar, cuti…"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
            </div>

            <button onClick={() => simpan(false)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm text-white">
              <Save size={16} /> Simpan
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
