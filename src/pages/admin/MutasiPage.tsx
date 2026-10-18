import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  UserMinus, GraduationCap, Plus, Undo2, Search, Users, ArrowRightLeft,
  CalendarDays, FileText, AlertTriangle,
} from 'lucide-react'
import api from '../../services/api'

// ============================================================================
// Alumni & Mutasi Siswa
//
// Dua tab:
//   1. Mutasi  — catat siswa keluar/pindah/lulus, dengan riwayat yang tidak
//                pernah dihapus (jejak audit untuk akreditasi)
//   2. Alumni  — daftar siswa berstatus alumni, bisa dicari dan disaring
//
// Efek samping yang penting: mencatat mutasi "keluar" mengubah status siswa dan
// mengosongkan rombelnya, sehingga ia berhenti muncul di absensi, jadwal, dan
// rekap kelas — tetapi datanya tetap ada.
// ============================================================================

type Tab = 'mutasi' | 'alumni'

type Mutasi = {
  id: string
  siswa_id: string
  nama_siswa: string | null
  nis_siswa: string | null
  jenis: string
  tanggal: string
  tahun_ajaran: string
  dari_rombel_nama: string
  ke_sekolah: string
  no_surat: string
  alasan: string
  dicatat_nama: string
}

type Alumni = {
  id: string
  nis: string
  nisn: string
  nama: string
  jenis_kelamin: string
  tanggal_lulus: string | null
  tahun_lulus: string | null
  dari_rombel_nama: string | null
}

const JENIS: { value: string; label: string }[] = [
  { value: 'alumni', label: 'Lulus / Alumni' },
  { value: 'pindah_keluar', label: 'Pindah keluar' },
  { value: 'keluar', label: 'Keluar / berhenti' },
  { value: 'dikeluarkan', label: 'Dikeluarkan' },
  { value: 'meninggal', label: 'Meninggal dunia' },
  { value: 'pindah_masuk', label: 'Pindah masuk (aktifkan kembali)' },
]

const WARNA_JENIS: Record<string, string> = {
  alumni: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900',
  pindah_keluar: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900',
  pindah_masuk: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900',
  keluar: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900',
  dikeluarkan: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900',
  meninggal: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
}

const hariIni = () => new Date().toISOString().slice(0, 10)

export default function MutasiPage() {
  const [tab, setTab] = useState<Tab>('mutasi')
  const [mutasi, setMutasi] = useState<Mutasi[]>([])
  const [alumni, setAlumni] = useState<Alumni[]>([])
  const [siswa, setSiswa] = useState<any[]>([])
  const [memuat, setMemuat] = useState(true)
  const [cariAlumni, setCariAlumni] = useState('')
  const [form, setForm] = useState({
    siswa_id: '', jenis: 'alumni', tanggal: hariIni(), tahun_ajaran: '',
    ke_sekolah: '', no_surat: '', alasan: '', keterangan: '',
  })

  const muat = async () => {
    setMemuat(true)
    try {
      const [m, a, s] = await Promise.all([
        api.get('/mutasi'),
        api.get('/alumni'),
        api.get('/siswa?status=aktif'),
      ])
      setMutasi(Array.isArray(m.data) ? m.data : [])
      setAlumni(Array.isArray(a.data) ? a.data : [])
      setSiswa(Array.isArray(s.data) ? s.data : [])
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal memuat data mutasi')
    } finally {
      setMemuat(false)
    }
  }

  useEffect(() => { muat() }, [])

  const siswaUrut = useMemo(
    () => [...siswa].sort((a, b) => String(a.nama).localeCompare(String(b.nama))),
    [siswa],
  )

  const alumniTampil = useMemo(() => {
    const q = cariAlumni.trim().toLowerCase()
    if (!q) return alumni
    return alumni.filter(a =>
      String(a.nama || '').toLowerCase().includes(q) ||
      String(a.nis || '').includes(q) ||
      String(a.nisn || '').includes(q),
    )
  }, [alumni, cariAlumni])

  const siswaTerpilih = useMemo(
    () => siswa.find(s => s.id === form.siswa_id) || null,
    [siswa, form.siswa_id],
  )

  const simpan = async () => {
    if (!form.siswa_id) return toast.error('Pilih siswa dulu')
    const keluar = ['alumni', 'pindah_keluar', 'keluar', 'dikeluarkan', 'meninggal'].includes(form.jenis)
    if (keluar && !confirm(
      `Catat "${JENIS.find(j => j.value === form.jenis)?.label}" untuk ${siswaTerpilih?.nama || 'siswa ini'}?\n\n` +
      `Siswa akan berhenti muncul di absensi, jadwal, dan rekap kelas. Data tetap tersimpan dan bisa diurungkan.`
    )) return
    try {
      await api.post('/mutasi', form)
      toast.success('Mutasi tercatat')
      setForm({ siswa_id: '', jenis: 'alumni', tanggal: hariIni(), tahun_ajaran: '', ke_sekolah: '', no_surat: '', alasan: '', keterangan: '' })
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan mutasi')
    }
  }

  const urungkan = async (id: string) => {
    if (!confirm('Urungkan mutasi ini? Siswa dikembalikan ke rombel asal dan berstatus aktif.\n\nRiwayat mutasi tetap tersimpan sebagai jejak audit.')) return
    try {
      await api.post(`/mutasi/${id}/urungkan`)
      toast.success('Mutasi diurungkan, siswa aktif kembali')
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal mengurungkan')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-display font-bold text-gray-800 dark:text-gray-100">
          <ArrowRightLeft size={22} className="text-primary" /> Alumni & Mutasi
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Catat siswa lulus, pindah, atau keluar. Riwayat tersimpan permanen untuk akreditasi.
        </p>
      </div>

      {/* Kartu ringkasan */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-xs text-gray-500"><GraduationCap size={14} /> Alumni</div>
          <p className="mt-1 text-2xl font-bold text-gray-800 dark:text-gray-100">{alumni.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-xs text-gray-500"><UserMinus size={14} /> Total mutasi</div>
          <p className="mt-1 text-2xl font-bold text-gray-800 dark:text-gray-100">{mutasi.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-xs text-gray-500"><Users size={14} /> Siswa aktif</div>
          <p className="mt-1 text-2xl font-bold text-gray-800 dark:text-gray-100">{siswa.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-xs text-gray-500"><CalendarDays size={14} /> Mutasi tahun ini</div>
          <p className="mt-1 text-2xl font-bold text-gray-800 dark:text-gray-100">
            {mutasi.filter(m => String(m.tanggal).startsWith(String(new Date().getFullYear()))).length}
          </p>
        </div>
      </div>

      {/* Tab */}
      <div className="flex gap-1 rounded-xl border bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
        {([['mutasi', 'Mutasi & Riwayat'], ['alumni', 'Data Alumni']] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              tab === k ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {memuat ? (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">Memuat…</div>
      ) : tab === 'mutasi' ? (
        <>
          {/* Form catat mutasi */}
          <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
              <Plus size={15} className="text-primary" /> Catat mutasi
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs text-gray-500">Siswa
                <select value={form.siswa_id} onChange={e => setForm(f => ({ ...f, siswa_id: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                  <option value="">-- Pilih siswa aktif --</option>
                  {siswaUrut.map(s => <option key={s.id} value={s.id}>{s.nama} {s.nis ? `(${s.nis})` : ''}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">Jenis
                <select value={form.jenis} onChange={e => setForm(f => ({ ...f, jenis: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                  {JENIS.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">Tanggal
                <input type="date" value={form.tanggal} onChange={e => setForm(f => ({ ...f, tanggal: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="text-xs text-gray-500">Tahun ajaran
                <input value={form.tahun_ajaran} onChange={e => setForm(f => ({ ...f, tahun_ajaran: e.target.value }))} placeholder="2026/2027" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="text-xs text-gray-500">Sekolah tujuan (bila pindah)
                <input value={form.ke_sekolah} onChange={e => setForm(f => ({ ...f, ke_sekolah: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="text-xs text-gray-500">No. surat
                <input value={form.no_surat} onChange={e => setForm(f => ({ ...f, no_surat: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="text-xs text-gray-500 md:col-span-2">Alasan
                <input value={form.alasan} onChange={e => setForm(f => ({ ...f, alasan: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <div className="flex items-end">
                <button onClick={simpan} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white">
                  <Plus size={16} /> Simpan
                </button>
              </div>
            </div>
            {siswaTerpilih && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  {siswaTerpilih.nama} · NIS {siswaTerpilih.nis || '-'} · rombel {siswaTerpilih.rombel_nama || '-'}.
                  Menyimpan mutasi keluar akan mengosongkan rombelnya sehingga ia berhenti muncul di absensi & rekap kelas.
                </span>
              </p>
            )}
          </div>

          {/* Riwayat */}
          {mutasi.length === 0 ? (
            <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">
              <ArrowRightLeft size={42} className="mx-auto mb-3 opacity-60" />
              <p>Belum ada catatan mutasi.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {mutasi.map(m => (
                <div key={m.id} className="flex items-start justify-between gap-3 rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-800 dark:text-gray-100">{m.nama_siswa || '(siswa dihapus)'}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${WARNA_JENIS[m.jenis] || WARNA_JENIS.keluar}`}>
                        {JENIS.find(j => j.value === m.jenis)?.label || m.jenis}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {m.tanggal}{m.tahun_ajaran ? ` · TA ${m.tahun_ajaran}` : ''}{m.dari_rombel_nama ? ` · dari ${m.dari_rombel_nama}` : ''}
                    </p>
                    {m.ke_sekolah && <p className="mt-0.5 text-xs text-gray-500">Tujuan: {m.ke_sekolah}</p>}
                    {m.no_surat && <p className="mt-0.5 text-xs text-gray-500">Surat: {m.no_surat}</p>}
                    {m.alasan && <p className="mt-0.5 text-xs text-gray-500">Alasan: {m.alasan}</p>}
                    <p className="mt-1 text-[11px] text-gray-400">dicatat {m.dicatat_nama || '-'}</p>
                  </div>
                  <button onClick={() => urungkan(m.id)} className="shrink-0 rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30" title="Urungkan mutasi">
                    <Undo2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
            <Search size={15} className="text-gray-400" />
            <input
              value={cariAlumni}
              onChange={e => setCariAlumni(e.target.value)}
              placeholder="Cari nama, NIS, atau NISN…"
              className="w-full bg-transparent text-sm outline-none dark:text-gray-100"
            />
            <span className="shrink-0 text-xs text-gray-400">{alumniTampil.length} orang</span>
          </div>

          {alumniTampil.length === 0 ? (
            <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">
              <GraduationCap size={42} className="mx-auto mb-3 opacity-60" />
              <p>Belum ada siswa berstatus alumni.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white dark:border-gray-800 dark:bg-gray-900">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Nama</th>
                    <th className="px-4 py-3">NIS / NISN</th>
                    <th className="px-4 py-3">Rombel terakhir</th>
                    <th className="px-4 py-3">Lulus</th>
                    <th className="px-4 py-3">Tahun</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-800">
                  {alumniTampil.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 font-semibold text-gray-800 dark:text-gray-100">{a.nama}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.nis || '-'} / {a.nisn || '-'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.dari_rombel_nama || '-'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.tanggal_lulus || '-'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{a.tahun_lulus || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
