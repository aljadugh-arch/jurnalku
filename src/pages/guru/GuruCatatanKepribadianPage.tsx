import { useState, useEffect } from 'react'
import { Plus, X, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface CatatanKepribadian {
  id: string
  siswa_id: string
  siswa_nama: string
  nis: string
  rombel_nama: string
  catatan: string
  aspek: string
  tanggal: string
}

interface Siswa {
  id: string
  nama: string
  nis: string
  rombel_nama: string
}

export default function CatatanKepribadianGuru() {
  const [data, setData] = useState<CatatanKepribadian[]>([])
  const [siswaList, setSiswaList] = useState<Siswa[]>([])
  const [siswaSearch, setSiswaSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    siswa_id: '',
    catatan: '',
    aspek: 'sikap',
    tanggal: new Date().toISOString().split('T')[0],
  })

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await api.get('/catatan-kepribadian')
      setData(res.data)
    } catch {
      toast.error('Gagal memuat catatan kepribadian')
    } finally {
      setLoading(false)
    }
  }

  const fetchSiswa = async (q = '') => {
    try {
      const res = await api.get('/siswa', { params: q ? { search: q } : {} })
      setSiswaList(res.data)
    } catch { toast.error('Gagal memuat daftar siswa') }
  }

  useEffect(() => { fetchData() }, [])

  const [rombelSaya, setRombelSaya] = useState<any[]>([])
  const [filterRombel, setFilterRombel] = useState('')
  useEffect(() => {
    api.get('/guru/pengajar-saya').then((r: any) => setRombelSaya(r.data.rombel || [])).catch(() => {})
  }, [])

  const handleOpenForm = () => {
    setSiswaSearch('')
    fetchSiswa()
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!form.siswa_id) { toast.error('Pilih siswa'); return }
    if (!form.catatan.trim()) { toast.error('Isi catatan'); return }
    try {
      await api.post('/catatan-kepribadian', form)
      toast.success('Catatan berhasil disimpan')
      setShowForm(false)
      setForm({ siswa_id: '', catatan: '', aspek: 'sikap', tanggal: new Date().toISOString().split('T')[0] })
      fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan catatan')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus catatan ini?')) return
    try {
      await api.delete('/catatan-kepribadian/' + id)
      toast.success('Catatan dihapus')
      fetchData()
    } catch {
      toast.error('Gagal menghapus catatan')
    }
  }

  const filtered = data.filter(c =>
    c.siswa_nama?.toLowerCase().includes(search.toLowerCase()) ||
    c.nis?.includes(search)
  )

  const aspekLabel: Record<string, string> = {
    sikap: 'Sikap',
    kedisiplinan: 'Kedisiplinan',
    kejujuran: 'Kejujuran',
    tanggung_jawab: 'Tanggung Jawab',
    kerjasama: 'Kerjasama',
    lainnya: 'Lainnya',
  }

  const aspekColor: Record<string, string> = {
    sikap: 'bg-blue-50 text-blue-700',
    kedisiplinan: 'bg-purple-50 text-purple-700',
    kejujuran: 'bg-green-50 text-green-700',
    tanggung_jawab: 'bg-amber-50 text-amber-700',
    kerjasama: 'bg-pink-50 text-pink-700',
    lainnya: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Catatan Kepribadian</h1>
          <p className="text-gray-500 text-sm mt-1">Catatan perilaku dan kepribadian siswa di kelas Anda</p>
        </div>
        <button
          onClick={handleOpenForm}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark"
        >
          <Plus size={16} />
          Tambah Catatan
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama / NIS siswa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-10">Memuat...</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-10">Belum ada catatan kepribadian.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(c => (
              <div key={c.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800">{c.siswa_nama}</span>
                      <span className="text-xs text-gray-400">{c.nis}</span>
                      {c.rombel_nama && <span className="text-xs text-gray-400">• {c.rombel_nama}</span>}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${aspekColor[c.aspek] || aspekColor.lainnya}`}>
                        {aspekLabel[c.aspek] || c.aspek}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{c.catatan}</p>
                    <p className="mt-1 text-xs text-gray-400">{c.tanggal}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-red-400 hover:text-red-600 flex-shrink-0"
                    title="Hapus"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Tambah Catatan Kepribadian</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Siswa *</label>
                <div className="relative mb-2"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={siswaSearch} onChange={e => { setSiswaSearch(e.target.value); fetchSiswa(e.target.value) }} placeholder="Cari nama / NIS / rombel..." className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
                <select
                  value={form.siswa_id}
                  onChange={e => setForm({ ...form, siswa_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Pilih Siswa --</option>
                  {siswaList.map(s => (
                    <option key={s.id} value={s.id}>{s.nama} ({s.nis}) {s.rombel_nama ? '· ' + s.rombel_nama : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Aspek *</label>
                <select
                  value={form.aspek}
                  onChange={e => setForm({ ...form, aspek: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  {Object.entries(aspekLabel).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal *</label>
                <input
                  type="date"
                  value={form.tanggal}
                  onChange={e => setForm({ ...form, tanggal: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Catatan *</label>
                <textarea
                  value={form.catatan}
                  onChange={e => setForm({ ...form, catatan: e.target.value })}
                  placeholder="Deskripsikan catatan kepribadian siswa..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700"
              >
                Batal
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
