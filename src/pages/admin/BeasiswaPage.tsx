import { useState, useEffect } from 'react'
import { Plus, X, Search, Award } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface Beasiswa {
  id: string
  siswa_id: string
  siswa_nama: string
  nis: string
  rombel_nama: string
  nama_beasiswa: string
  nominal: number
  periode: string
  status: string
  keterangan: string
  created_at: string
}

interface Siswa {
  id: string
  nama: string
  nis: string
}

interface Rombel {
  id: string
  nama: string
}

export default function BeasiswaPage() {
  const [data, setData] = useState<Beasiswa[]>([])
  const [siswaList, setSiswaList] = useState<Siswa[]>([])
  const [rombels, setRombels] = useState<Rombel[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    siswa_id: '',
    nama_beasiswa: '',
    nominal: '',
    periode: '',
    status: 'aktif',
    keterangan: '',
  })

  const fetchData = async () => {
    setLoading(true)
    try {
      const [beasiswaRes, rombelRes] = await Promise.all([
        api.get('/beasiswa', { params: filterStatus ? { status: filterStatus } : {} }),
        api.get('/rombel'),
      ])
      setData(beasiswaRes.data)
      setRombels(rombelRes.data)
    } catch {
      toast.error('Gagal memuat data beasiswa')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [filterStatus])

  const handleOpenForm = async () => {
    try {
      const res = await api.get('/siswa')
      setSiswaList(res.data)
    } catch {}
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!form.siswa_id) { toast.error('Pilih siswa'); return }
    if (!form.nama_beasiswa.trim()) { toast.error('Isi nama beasiswa'); return }
    if (!form.nominal || Number(form.nominal) <= 0) { toast.error('Isi nominal beasiswa'); return }
    try {
      await api.post('/beasiswa', { ...form, nominal: Number(form.nominal) })
      toast.success('Beasiswa berhasil ditambahkan')
      setShowForm(false)
      setForm({ siswa_id: '', nama_beasiswa: '', nominal: '', periode: '', status: 'aktif', keterangan: '' })
      fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menambahkan beasiswa')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus data beasiswa ini?')) return
    try {
      await api.delete('/beasiswa/' + id)
      toast.success('Beasiswa dihapus')
      fetchData()
    } catch {
      toast.error('Gagal menghapus beasiswa')
    }
  }

  const fmt = (n: number) => 'Rp ' + n.toLocaleString('id-ID')

  const filtered = data.filter(b =>
    b.siswa_nama?.toLowerCase().includes(search.toLowerCase()) ||
    b.nis?.includes(search) ||
    b.nama_beasiswa?.toLowerCase().includes(search.toLowerCase())
  )

  const totalNominal = filtered.reduce((s, b) => s + (b.nominal || 0), 0)

  const statusColor: Record<string, string> = {
    aktif: 'bg-green-100 text-green-700',
    nonaktif: 'bg-gray-100 text-gray-500',
    selesai: 'bg-blue-100 text-blue-700',
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Beasiswa</h1>
          <p className="text-gray-500 text-sm mt-1">
            {filtered.length} penerima · Total: {fmt(totalNominal)}
          </p>
        </div>
        <button
          onClick={handleOpenForm}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark"
        >
          <Plus size={16} />
          Tambah Beasiswa
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama siswa / NIS / nama beasiswa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['', 'aktif', 'nonaktif', 'selesai'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-2 rounded-lg text-sm ${filterStatus === s ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {s === '' ? 'Semua' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-10">Memuat...</p>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Award size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-400 text-sm">Belum ada data beasiswa.</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Siswa</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Nama Beasiswa</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Nominal</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Periode</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-800">{b.siswa_nama}</span>
                        <br />
                        <span className="text-xs text-gray-400">{b.nis} {b.rombel_nama ? `• ${b.rombel_nama}` : ''}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{b.nama_beasiswa}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{fmt(b.nominal)}</td>
                      <td className="px-4 py-3 text-gray-500">{b.periode || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor[b.status] || statusColor.nonaktif}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(b.id)}
                          className="text-red-400 hover:text-red-600"
                          title="Hapus"
                        >
                          <X size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="sm:hidden divide-y divide-gray-100">
              {filtered.map(b => (
                <div key={b.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-800">{b.siswa_nama}</p>
                      <p className="text-xs text-gray-400">{b.nis} {b.rombel_nama ? `• ${b.rombel_nama}` : ''}</p>
                    </div>
                    <button onClick={() => handleDelete(b.id)} className="text-red-400">
                      <X size={16} />
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{b.nama_beasiswa}</p>
                  <div className="mt-1 flex gap-3 items-center">
                    <span className="text-sm font-medium text-gray-800">{fmt(b.nominal)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[b.status] || statusColor.nonaktif}`}>
                      {b.status}
                    </span>
                    {b.periode && <span className="text-xs text-gray-400">{b.periode}</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Tambah Beasiswa</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Siswa *</label>
                <select
                  value={form.siswa_id}
                  onChange={e => setForm({ ...form, siswa_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">-- Pilih Siswa --</option>
                  {siswaList.map(s => (
                    <option key={s.id} value={s.id}>{s.nama} ({s.nis})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nama Beasiswa *</label>
                <input
                  type="text"
                  value={form.nama_beasiswa}
                  onChange={e => setForm({ ...form, nama_beasiswa: e.target.value })}
                  placeholder="Contoh: KIP, Yayasan, Pemda"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nominal *</label>
                  <input
                    type="number"
                    value={form.nominal}
                    onChange={e => setForm({ ...form, nominal: e.target.value })}
                    placeholder="500000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Periode</label>
                  <input
                    type="text"
                    value={form.periode}
                    onChange={e => setForm({ ...form, periode: e.target.value })}
                    placeholder="2025/2026"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="aktif">Aktif</option>
                  <option value="nonaktif">Nonaktif</option>
                  <option value="selesai">Selesai</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Keterangan</label>
                <textarea
                  value={form.keterangan}
                  onChange={e => setForm({ ...form, keterangan: e.target.value })}
                  rows={2}
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
