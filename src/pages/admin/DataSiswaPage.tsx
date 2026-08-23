import { useState, useEffect } from 'react'
import { Search, Plus, Edit, Trash2, Download, Upload, X, Camera, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import ImportExcel from '../../components/ImportExcel'
import FoundationTenantPicker from '../../components/FoundationTenantPicker'

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
  rombel_nama?: string
  status: string
  foto?: string
}

const emptyForm: Omit<Siswa, 'id'> = {
  nis: '', nisn: '', nama: '', jenis_kelamin: 'L', tempat_lahir: '',
  tanggal_lahir: '', alamat: '', no_hp: '', nama_ortu: '', rombel_id: '',
  rombel_nama: '', status: 'aktif'
}

function getInitials(nama: string): string {
  return nama
    .split(' ')
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
}

export default function DataSiswaPage() {
  const [data, setData] = useState<Siswa[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<Siswa, 'id'>>(emptyForm)
  const [rombels, setRombels] = useState<{ id: string; nama: string }[]>([])
  const [showImport, setShowImport] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [foundationTenantId, setFoundationTenantId] = useState<string | null>(null)
  const [showFoundationPicker, setShowFoundationPicker] = useState(false)

  // Detail panel
  const [selectedSiswa, setSelectedSiswa] = useState<Siswa | null>(null)

  const fetchData = async () => {
    try {
      const params: any = { search }
      if (foundationTenantId && foundationTenantId !== 'all') {
        params.tenant_id = foundationTenantId
      }
      const [res, rombelRes] = await Promise.all([
        api.get(foundationTenantId ? '/foundation/students' : '/siswa', { params }),
        api.get('/rombel')
      ])
      setData(res.data)
      setRombels(rombelRes.data)
    } catch {
      toast.error('Gagal memuat data siswa')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [search, foundationTenantId])

  // Sync selected panel when data refreshes
  useEffect(() => {
    if (selectedSiswa) {
      const updated = data.find((s) => s.id === selectedSiswa.id)
      if (updated) setSelectedSiswa(updated)
    }
  }, [data])

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
    setForm({
      nis: siswa.nis, nisn: siswa.nisn, nama: siswa.nama,
      jenis_kelamin: siswa.jenis_kelamin, tempat_lahir: siswa.tempat_lahir,
      tanggal_lahir: siswa.tanggal_lahir, alamat: siswa.alamat,
      no_hp: siswa.no_hp, nama_ortu: siswa.nama_ortu,
      rombel_id: siswa.rombel_id || '', rombel_nama: siswa.rombel_nama || '',
      status: siswa.status
    })
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
      if (selectedSiswa?.id === id) setSelectedSiswa(null)
      fetchData()
    } catch { toast.error('Gagal menghapus') }
  }

  const handleExport = () => {
    const header = 'NIS,NISN,Nama,JK,Tempat Lahir,Tgl Lahir,Alamat,No HP,Nama Ortu,Status'
    const rows = data.map((s) =>
      [s.nis, s.nisn, s.nama, s.jenis_kelamin, s.tempat_lahir, s.tanggal_lahir, s.alamat, s.no_hp, s.nama_ortu, s.status].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'data_siswa.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success('Export berhasil')
  }

  const statusBadge = (status: string) => {
    if (status === 'aktif') return 'bg-green-100 text-green-700'
    if (status === 'lulus') return 'bg-blue-100 text-blue-700'
    return 'bg-red-100 text-red-700'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Data Siswa</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola data peserta didik ({data.length} siswa)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            <Upload size={16} /> Import Excel
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">
            <Download size={16} /> Export
          </button>
          <button
            onClick={() => { setForm(emptyForm); setEditId(null); setShowModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark"
          >
            <Plus size={16} /> Tambah Siswa
          </button>
        </div>
      </div>
      {/* Foundation Tenant Picker (Cross-tenant data) */}
      <FoundationTenantPicker
        selectedTenantId={foundationTenantId}
        onSelectTenant={setFoundationTenantId}
        placeholder="Data lokal (lembaga ini)"
        allOptionLabel="Semua lembaga yayasan (gabungan)"
      />

      {/* Search */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari berdasarkan nama atau NIS..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {loading ? (
          <p className="text-gray-400 col-span-4 text-center py-12">Memuat...</p>
        ) : data.length === 0 ? (
          <p className="text-gray-400 col-span-4 text-center py-12">Belum ada data siswa</p>
        ) : data.map((s) => (
          <div
            key={s.id}
            onClick={() => setSelectedSiswa(s)}
            className={`bg-white rounded-xl p-4 shadow-sm border cursor-pointer transition-all hover:shadow-md hover:border-primary/40 ${selectedSiswa?.id === s.id ? 'border-primary ring-2 ring-primary/20' : 'border-gray-100'}`}
          >
            {/* Avatar + nama */}
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                {s.foto ? (
                  <img src={s.foto} alt={s.nama} className="w-12 h-12 rounded-full object-cover border border-gray-200" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {getInitials(s.nama)}
                  </div>
                )}
                {/* Upload foto overlay */}
                <label
                  className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-white border border-gray-200 rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/10"
                  title="Upload foto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Camera size={11} className="text-primary" />
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingFoto}
                    onChange={(e) => handleFoto(s.id, e.target.files?.[0])}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-800 text-sm truncate">{s.nama}</p>
                <p className="text-xs text-gray-400 font-mono">{s.nis || '-'}</p>
              </div>
              <ChevronRight size={15} className="text-gray-300 flex-shrink-0" />
            </div>

            {/* Rombel + status */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
              <p className="text-xs text-gray-500 truncate">{s.rombel_nama || 'Belum ada rombel'}</p>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ml-2 ${statusBadge(s.status)}`}>
                {s.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Detail popup */}
      {selectedSiswa && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              {selectedSiswa.foto ? (
                <img src={selectedSiswa.foto} alt={selectedSiswa.nama} className="w-11 h-11 rounded-full object-cover border border-gray-200" />
              ) : (
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {getInitials(selectedSiswa.nama)}
                </div>
              )}
              <div>
                <h2 className="font-bold text-gray-800">{selectedSiswa.nama}</h2>
                <p className="text-xs text-gray-500">{selectedSiswa.nis || 'NIS belum diisi'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleEdit(selectedSiswa)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200"
              >
                <Edit size={14} /> Edit
              </button>
              <button
                onClick={() => handleDelete(selectedSiswa.id, selectedSiswa.nama)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg border border-red-200"
              >
                <Trash2 size={14} /> Hapus
              </button>
              <button
                onClick={() => setSelectedSiswa(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 ml-1"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Detail content */}
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
            <DetailRow label="NIS" value={selectedSiswa.nis || '-'} mono />
            <DetailRow label="NISN" value={selectedSiswa.nisn || '-'} mono />
            <DetailRow label="Jenis Kelamin" value={selectedSiswa.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'} />
            <DetailRow
              label="Tempat / Tgl Lahir"
              value={[selectedSiswa.tempat_lahir, selectedSiswa.tanggal_lahir].filter(Boolean).join(', ') || '-'}
            />
            <DetailRow label="Alamat" value={selectedSiswa.alamat || '-'} />
            <DetailRow label="No HP" value={selectedSiswa.no_hp || '-'} />
            <DetailRow label="Nama Orang Tua" value={selectedSiswa.nama_ortu || '-'} />
            <DetailRow label="Rombel" value={selectedSiswa.rombel_nama || 'Belum ada rombel'} />
            <div>
              <p className="text-xs text-gray-400 mb-1">Status</p>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge(selectedSiswa.status)}`}>
                {selectedSiswa.status}
              </span>
            </div>
          </div>
          </div>
        </div>
      )}

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
                  <input value={form.nis} onChange={(e) => setForm({...form, nis: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">NISN</label>
                  <input value={form.nisn} onChange={(e) => setForm({...form, nisn: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nama Lengkap *</label>
                <input value={form.nama} onChange={(e) => setForm({...form, nama: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Jenis Kelamin *</label>
                  <select value={form.jenis_kelamin} onChange={(e) => setForm({...form, jenis_kelamin: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rombel</label>
                  <select value={form.rombel_id} onChange={(e) => setForm({...form, rombel_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">-- Pilih --</option>
                    {rombels.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tempat Lahir</label>
                  <input value={form.tempat_lahir} onChange={(e) => setForm({...form, tempat_lahir: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Lahir</label>
                  <input type="date" value={form.tanggal_lahir} onChange={(e) => setForm({...form, tanggal_lahir: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Alamat</label>
                <input value={form.alamat} onChange={(e) => setForm({...form, alamat: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">No HP</label>
                  <input value={form.no_hp} onChange={(e) => setForm({...form, no_hp: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nama Orang Tua</label>
                  <input value={form.nama_ortu} onChange={(e) => setForm({...form, nama_ortu: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              {editId && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
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
          templateName="master-siswa-v2.xls"
          headerRow={0}
          columnMap={{ 'Nama': 'nama', 'NAMA': 'nama', 'NIS': 'nis', 'NISN': 'nisn', 'JK': 'jenis_kelamin', 'Jenis Kelamin': 'jenis_kelamin', 'Tempat Lahir': 'tempat_lahir', 'Tanggal Lahir': 'tanggal_lahir', 'Alamat': 'alamat', 'No HP': 'no_hp', 'Nama Ortu': 'nama_ortu' }}
          foundationTenantId={foundationTenantId}
          apiEndpoint={foundationTenantId ? 'foundation/students' : 'siswa'}
          onImport={async (rows) => {
            for (const row of rows) {
              if (!row.nama) continue
              const jk = (row.jenis_kelamin || 'L').toString().charAt(0).toUpperCase()
              await api.post(foundationTenantId ? '/foundation/students' : '/siswa', {
                nis: String(row.nis || ''), nisn: String(row.nisn || ''), nama: row.nama,
                jenis_kelamin: jk, tempat_lahir: row.tempat_lahir || '',
                tanggal_lahir: row.tanggal_lahir || '', alamat: row.alamat || '',
                no_hp: String(row.no_hp || ''), nama_ortu: row.nama_ortu || '',
                rombel_id: '', status: 'aktif',
                tenant_id: foundationTenantId && foundationTenantId !== 'all' ? foundationTenantId : undefined
              })
            }
            fetchData()
          }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm text-gray-800 font-medium ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}
