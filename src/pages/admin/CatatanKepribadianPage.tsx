import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Save, ScrollText } from 'lucide-react'
import api from '../../services/api'

// Disederhanakan: hanya Sikap (umum) + Catatan Wali Kelas + Saran.
// Kolom detail lama (sikap_spiritual, sikap_sosial, kelakuan, kerajinan, kerapian, kedisiplinan) tetap
// disimpan agar kompatibel dengan data lama, namun tidak lagi diedit dari UI.
type Row = {
  siswa_id: string
  nama: string
  nis: string
  sikap_umum: string
  catatan_wali_kelas: string
  saran: string
}

export default function CatatanKepribadianPage() {
  const [rombels, setRombels] = useState<any[]>([])
  const [siswa, setSiswa] = useState<any[]>([])
  const [catatan, setCatatan] = useState<any[]>([])
  const [rombelId, setRombelId] = useState('')
  const [tahunAjaran, setTahunAjaran] = useState('2026/2027')
  const [semester, setSemester] = useState('ganjil')
  const [saving, setSaving] = useState(false)

  useEffect(() => { api.get('/rombel').then(r => setRombels(r.data)).catch(() => toast.error('Gagal memuat rombel')) }, [])
  useEffect(() => {
    if (!rombelId) { setSiswa([]); setCatatan([]); return }
    Promise.all([
      api.get('/siswa?rombel_id=' + rombelId),
      api.get('/catatan-kepribadian?rombel_id=' + rombelId + '&tahun_ajaran=' + encodeURIComponent(tahunAjaran) + '&semester=' + semester),
    ]).then(([s, c]) => { setSiswa(s.data); setCatatan(c.data) }).catch(() => toast.error('Gagal memuat catatan'))
  }, [rombelId, tahunAjaran, semester])

  const rows = useMemo<Row[]>(() => siswa.map(s => {
    const c = catatan.find(x => x.siswa_id === s.id) || {}
    // Fallback: pakai sikap_umum kalau ada; kalau tidak, gabungkan spiritual+sosial legacy.
    const umum = c.sikap_umum
      || [c.sikap_spiritual, c.sikap_sosial].filter(Boolean).join(' ')
      || ''
    return {
      siswa_id: s.id,
      nama: s.nama,
      nis: s.nis,
      sikap_umum: umum,
      catatan_wali_kelas: c.catatan_wali_kelas || '',
      saran: c.saran || '',
    }
  }), [siswa, catatan])

  const update = (siswaId: string, field: keyof Row, value: string) => {
    setCatatan(prev => {
      const found = prev.find(x => x.siswa_id === siswaId) || { siswa_id: siswaId }
      const next = { ...found, [field]: value }
      return prev.some(x => x.siswa_id === siswaId) ? prev.map(x => x.siswa_id === siswaId ? next : x) : [...prev, next]
    })
  }

  const save = async () => {
    if (!rombelId) return toast.error('Pilih rombel dulu')
    setSaving(true)
    try {
      await api.post('/catatan-kepribadian/bulk', { tahun_ajaran: tahunAjaran, semester, data: rows })
      toast.success('Catatan kepribadian tersimpan')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-800 dark:text-gray-100">Catatan Kepribadian</h1>
          <p className="text-sm text-gray-500">Sikap (umum) dan catatan wali kelas untuk rapor.</p>
        </div>
        <button onClick={save} disabled={saving || rows.length === 0} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50">
          <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Semua'}
        </button>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Rombel
            <select value={rombelId} onChange={e => setRombelId(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
              <option value="">-- Pilih --</option>
              {rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
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

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">
          <ScrollText size={42} className="mx-auto mb-3 opacity-60" />
          <p>Pilih rombel untuk mengisi catatan kepribadian.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
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
