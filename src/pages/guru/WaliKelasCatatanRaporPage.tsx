import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Save, ScrollText, Search, Users } from 'lucide-react'
import api from '../../services/api'

// Catatan Wali Kelas untuk rapor — khusus role wali_kelas. Otomatis mengarah ke
// rombel yang diampu (dari gtk_id -> rombel.wali_kelas_id), sehingga wali kelas
// tidak memilih kelas lain. Mengisi Sikap (umum) + Catatan Wali Kelas + Saran,
// lalu Simpan Semua lewat POST /api/catatan-kepribadian/bulk (scope aman server-side).
type Row = {
  siswa_id: string
  nama: string
  nis: string
  sikap_umum: string
  catatan_wali_kelas: string
  saran: string
}

function currentTahunAjaran(): string {
  const d = new Date()
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
  return `${y}/${y + 1}`
}
function currentSemester(): string {
  const m = new Date().getMonth()
  return m >= 6 && m <= 11 ? 'ganjil' : 'genap'
}

export default function WaliKelasCatatanRaporPage() {
  const [rombels, setRombels] = useState<any[]>([])
  const [rombelId, setRombelId] = useState('')
  const [siswa, setSiswa] = useState<any[]>([])
  const [catatan, setCatatan] = useState<any[]>([])
  const [tahunAjaran, setTahunAjaran] = useState(currentTahunAjaran())
  const [semester, setSemester] = useState(currentSemester())
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [bukanWali, setBukanWali] = useState(false)

  // Temukan rombel yang diampu wali kelas ini (dari gtk_id).
  useEffect(() => {
    ;(async () => {
      try {
        const [me, r] = await Promise.all([api.get('/auth/me'), api.get('/rombel')])
        const gtkId = me.data?.gtk_id
        const milik = (r.data || []).filter((x: any) => x.wali_kelas_id && x.wali_kelas_id === gtkId)
        setRombels(milik)
        if (!gtkId || milik.length === 0) setBukanWali(true)
        else if (milik.length === 1) setRombelId(milik[0].id)
      } catch {
        toast.error('Gagal memuat data wali kelas')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!rombelId) { setSiswa([]); setCatatan([]); return }
    Promise.all([
      api.get('/siswa?rombel_id=' + rombelId),
      api.get('/catatan-kepribadian?rombel_id=' + rombelId + '&tahun_ajaran=' + encodeURIComponent(tahunAjaran) + '&semester=' + semester),
    ]).then(([s, c]) => { setSiswa(s.data); setCatatan(c.data) }).catch(() => toast.error('Gagal memuat catatan'))
  }, [rombelId, tahunAjaran, semester])

  const rows = useMemo<Row[]>(() => siswa.map(s => {
    const c = catatan.find(x => x.siswa_id === s.id) || {}
    const umum = c.sikap_umum || [c.sikap_spiritual, c.sikap_sosial].filter(Boolean).join(' ') || ''
    return {
      siswa_id: s.id,
      nama: s.nama,
      nis: s.nis,
      sikap_umum: umum,
      catatan_wali_kelas: c.catatan_wali_kelas || '',
      saran: c.saran || '',
    }
  }), [siswa, catatan])

  const visibleRows = useMemo<Row[]>(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => (r.nama || '').toLowerCase().includes(q) || String(r.nis || '').includes(q))
  }, [rows, search])

  const update = (siswaId: string, field: keyof Row, value: string) => {
    setCatatan(prev => {
      const found = prev.find(x => x.siswa_id === siswaId) || { siswa_id: siswaId }
      const next = { ...found, [field]: value }
      return prev.some(x => x.siswa_id === siswaId) ? prev.map(x => x.siswa_id === siswaId ? next : x) : [...prev, next]
    })
  }

  const save = async () => {
    if (!rombelId) return toast.error('Rombel wali tidak ditemukan')
    setSaving(true)
    try {
      await api.post('/catatan-kepribadian/bulk', { tahun_ajaran: tahunAjaran, semester, data: rows })
      toast.success('Catatan wali kelas tersimpan')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan')
    } finally { setSaving(false) }
  }

  if (loading) {
    return <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">Memuat…</div>
  }

  if (bukanWali) {
    return (
      <div className="rounded-xl border bg-white p-10 text-center dark:border-gray-800 dark:bg-gray-900">
        <Users size={42} className="mx-auto mb-3 text-gray-300" />
        <p className="font-semibold text-gray-700 dark:text-gray-200">Anda belum terdaftar sebagai wali kelas</p>
        <p className="mt-1 text-sm text-gray-500">Hubungi admin untuk menetapkan Anda sebagai wali kelas sebuah rombel.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-800 dark:text-gray-100">Catatan Wali Kelas</h1>
          <p className="text-sm text-gray-500">Sikap (umum) dan catatan wali kelas untuk rapor siswa di kelas Anda.</p>
        </div>
        <button onClick={save} disabled={saving || rows.length === 0} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50">
          <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Semua'}
        </button>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Kelas Wali
            <select value={rombelId} onChange={e => setRombelId(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
              {rombels.length === 1 ? (
                <option value={rombels[0].id}>{rombels[0].nama}</option>
              ) : (
                <><option value="">-- Pilih --</option>{rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}</>
              )}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Tahun Ajaran
            <input value={tahunAjaran} onChange={e => setTahunAjaran(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-gray-700 dark:bg-gray-800" />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Semester
            <select value={semester} onChange={e => setSemester(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
              <option value="ganjil">Ganjil</option>
              <option value="genap">Genap</option>
            </select>
          </label>
        </div>
      </div>

      {rombelId && (
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama / NIS siswa…"
            className="w-full rounded-lg border px-3 py-2 pl-9 dark:border-gray-700 dark:bg-gray-800"
          />
        </div>
      )}

      {visibleRows.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">
          <ScrollText size={42} className="mx-auto mb-3 opacity-60" />
          <p>{!rombelId ? 'Pilih kelas wali untuk mengisi catatan.' : search.trim() ? 'Siswa tidak ditemukan.' : 'Tidak ada siswa di kelas ini.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRows.map(r => (
            <div key={r.siswa_id} className="rounded-xl border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-3">
                <p className="font-semibold text-gray-900 dark:text-gray-100">{r.nama}</p>
                <p className="text-xs text-gray-500">NIS: {r.nis || '-'}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <label className="text-xs text-gray-500 lg:col-span-1">Sikap (umum)
                  <textarea value={r.sikap_umum} onChange={e => update(r.siswa_id, 'sikap_umum', e.target.value)} rows={3} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" placeholder="Deskripsi singkat sikap siswa secara umum" />
                </label>
                <label className="text-xs text-gray-500 lg:col-span-1">Catatan Wali Kelas
                  <textarea value={r.catatan_wali_kelas} onChange={e => update(r.siswa_id, 'catatan_wali_kelas', e.target.value)} rows={3} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" placeholder="Contoh: Perlu meningkatkan kedisiplinan..." />
                </label>
                <label className="text-xs text-gray-500 lg:col-span-1">Saran
                  <textarea value={r.saran} onChange={e => update(r.siswa_id, 'saran', e.target.value)} rows={3} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" placeholder="Saran untuk siswa/orang tua" />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
