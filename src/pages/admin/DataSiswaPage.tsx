import { useState, useEffect } from 'react'
import { Search, Plus, Edit, Trash2, Download, Upload, X, Camera } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { ResponsiveTable } from '../../components/ui'
import ImportExcel from '../../components/ImportExcel'

interface Siswa {
  id: string
  nis: string
  nisn: string
  nama: string
  jenis_kelamin: string
  tempat_lahir: string
  tanggal_lahir: string
  alamat: string
  no_hp: string
  nama_ortu: string
  rombel_id: string
  status: string
  foto?: string
}

const emptyForm: Omit<Siswa, 'id'> = {
  nis: '', nisn: '', nama: '', jenis_kelamin: 'L', tempat_lahir: '',
  tanggal_lahir: '', alamat: '', no_hp: '', nama_ortu: '', rombel_id: '', status: 'aktif'
}

export default function DataSiswaPage() {
  const [data, setData] = useState<Siswa[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [rombels, setRombels] = useState<any[]>([])
  const [showImport, setShowImport] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)

  const fetchData = async () => {
    try {
      const [res, rombelRes] = await Promise.all([
        api.get('/siswa', { params: { search } }),
        api.get('/rombel')
      ])
      setData(res.data)
      setRombels(rombelRes.data)
    } catch (err: any) {
      toast.error('Gagal memuat data siswa')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [search])

  const handleSave = async () => {
    if (!form.nis || !form.nama || !form.jenis_kelamin) {
      toast.error('NIS, Nama, dan Jenis Kelamin wajib diisi')
      return
    }
    try {
      if (editId) {
        await api.put('/siswa/' + editId, form)
        toast.success('Data siswa berhasil diupdate')
      } else {
        await api.post('/siswa', form)
        toast.success('Siswa berhasil ditambahkan')
      }
      setShowModal(false)
      setEditId(null)
      setForm(emptyForm)
      fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan')
    }
  }

  const handleEdit = (siswa: Siswa) => {
    setForm({ nis: siswa.nis, nisn: siswa.nisn, nama: siswa.nama, jenis_kelamin: siswa.jenis_kelamin, tempat_lahir: siswa.tempat_lahir, tanggal_lahir: siswa.tanggal_lahir, alamat: siswa.alamat, no_hp: siswa.no_hp, nama_ortu: siswa.nama_ortu, rombel_id: siswa.rombel_id || '', status: siswa.status })
    setEditId(siswa.id)
    setShowModal(true)
  }

  const handleFoto = async (id: string, file?: File) => {
    if (!file) return
    const fd = new FormData()
    fd.append('foto', file)
    setUploadingFoto(true)
    try {
      await api.post('/siswa/' + id + '/foto', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Foto siswa berhasil diupload')
      fetchData()
    } catch { toast.error('Gagal upload foto') }
    finally { setUploadingFoto(false) }
  }

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm('Hapus siswa ' + nama + '?')) return
    try {
      await api.delete('/siswa/' + id)
      toast.success('Siswa berhasil dihapus')
      fetchData()
    } catch { toast.error('Gagal menghapus') }
  }

  const handleExport = () => {
    const header = 'NIS,NISN,Nama,JK,Tempat Lahir,Tgl Lahir,Alamat,No HP,Nama Ortu,Status'
    const rows = data.map(s => [s.nis, s.nisn, s.nama, s.jenis_kelamin, s.tempat_lahir, s.tanggal_lahir, s.alamat, s.no_hp, s.nama_ortu, s.status].join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'data_siswa.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success('Export berhasil')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Data Siswa</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola data peserta didik ({data.length} siswa)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            <Upload size={16} /> Import Excel
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">
            <Download size={16} /> Export
          </button>
          <button onClick={() => { setForm(emptyForm); setEditId(null); setShowModal(true) }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            <Plus size={16} /> Tambah Siswa
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Cari berdasarkan nama atau NIS..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5">
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-8">Memuat...</p>
        ) : (
          <ResponsiveTable<Siswa>
            columns={[
              { key: 'no', header: 'No', hideOnMobile: true, render: (_r) => data.indexOf(_r) + 1 },
              { key: 'foto', header: 'Foto', render: (s) => (
                <div className="flex items-center gap-2">
                  <img src={s.foto || '/logo-jurnalku-256.png'} alt={s.nama} className="w-9 h-9 rounded-full object-cover bg-gray-100 border" />
                  <label className="p-1.5 text-primary hover:bg-primary/10 rounded-lg cursor-pointer" title="Upload foto">
                    <Camera size={15} />
                    <input type="file" accept="image/*" disabled={uploadingFoto} onChange={(e) => handleFoto(s.id, e.target.files?.[0])} className="hidden" />
                  </label>
                </div>
              ) },
              { key: 'nama', header: 'Nama', className: 'font-medium text-gray-800' },
              { key: 'nis', header: 'NIS', className: 'font-mono' },
              { key: 'nisn', header: 'NISN', className: 'font-mono text-xs', hideOnMobile: true },
              { key: 'jenis_kelamin', header: 'JK' },
              { key: 'ttl', header: 'TTL', hideOnMobile: true, render: (s) => (s.tempat_lahir || '') + ', ' + (s.tanggal_lahir || '') },
              { key: 'status', header: 'Status', render: (s) => (
                <span className={'px-2 py-1 rounded-full text-xs font-medium ' + (s.status === 'aktif' ? 'bg-green-100 text-green-700' : s.status === 'lulus' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700')}>
                  {s.status}
                </span>
              ) },
            ]}
            rows={data}
            rowKey={(s) => s.id}
            empty="Belum ada data siswa"
            actions={(s) => (
              <>
                <button onClick={() => handleEdit(s)} className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg"><Edit size={16} /></button>
                <button onClick={() => handleDelete(s.id, s.nama)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
              </>
            )}
          />
        )}
        <div className="pt-3 mt-3 border-t text-sm text-gray-600">
          Menampilkan {data.length} data
        </div>
      </div>

      {/* Modal Tambah/Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">{editId ? 'Edit Siswa' : 'Tambah Siswa'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">NIS *</label>
                  <input value={form.nis} onChange={e => setForm({...form, nis: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">NISN</label>
                  <input value={form.nisn} onChange={e => setForm({...form, nisn: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nama Lengkap *</label>
                <input value={form.nama} onChange={e => setForm({...form, nama: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Jenis Kelamin *</label>
                  <select value={form.jenis_kelamin} onChange={e => setForm({...form, jenis_kelamin: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rombel</label>
                  <select value={form.rombel_id} onChange={e => setForm({...form, rombel_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">-- Pilih --</option>
                    {rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tempat Lahir</label>
                  <input value={form.tempat_lahir} onChange={e => setForm({...form, tempat_lahir: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Lahir</label>
                  <input type="date" value={form.tanggal_lahir} onChange={e => setForm({...form, tanggal_lahir: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Alamat</label>
                <input value={form.alamat} onChange={e => setForm({...form, alamat: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">No HP</label>
                  <input value={form.no_hp} onChange={e => setForm({...form, no_hp: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nama Orang Tua</label>
                  <input value={form.nama_ortu} onChange={e => setForm({...form, nama_ortu: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              {editId && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                    <option value="lulus">Lulus</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Batal</button>
              <button onClick={handleSave} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Import Excel */}
      {showImport && (
        <ImportExcel
          title="Import Data Siswa"
          templateUrl="/templates/template-siswa.xls"
          templateName="template-siswa.xls"
          headerRow={2}
          columnMap={{ 'Nama': 'nama', 'NAMA': 'nama', 'NIS': 'nis', 'NISN': 'nisn', 'Kode Rombel': 'rombel_kode', 'JK': 'jenis_kelamin', 'Jenis Kelamin': 'jenis_kelamin', 'Tempat Lahir': 'tempat_lahir', 'Tanggal Lahir': 'tanggal_lahir', 'Alamat': 'alamat', 'No HP': 'no_hp', 'Nama Ortu': 'nama_ortu' }}
          onImport={async (rows) => {
            for (const row of rows) {
              if (!row.nama) continue
              const jk = (row.jenis_kelamin || 'L').toString().charAt(0).toUpperCase()
              const rk = (row.rombel_kode || '').toString().trim().toLowerCase()
              const rombel = rk ? rombels.find(r => (r.nama || '').toString().trim().toLowerCase() === rk) : null
              await api.post('/siswa', { nis: String(row.nis || ''), nisn: String(row.nisn || ''), nama: row.nama, jenis_kelamin: jk === 'P' ? 'P' : 'L', tempat_lahir: row.tempat_lahir || '', tanggal_lahir: row.tanggal_lahir || '', alamat: row.alamat || '', no_hp: String(row.no_hp || ''), nama_ortu: row.nama_ortu || '', rombel_id: rombel?.id || '', status: 'aktif' })
            }
            fetchData()
          }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
