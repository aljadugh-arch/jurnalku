import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, Plus, Edit, Trash2, Download, Upload, X, Camera, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import ImportExcel from '../../components/ImportExcel'
import FoundationTenantPicker from '../../components/FoundationTenantPicker'

interface GTK {
  id: string; nik: string; nip: string; nuptk: string; nama: string; jenis_kelamin: string
  tempat_lahir: string; tanggal_lahir: string; alamat: string; no_hp: string
  email: string; jabatan: string; status_kepegawaian: string; bidang_studi: string; status: string; foto?: string
}

const emptyForm = {
  nik: '', nip: '', nuptk: '', nama: '', jenis_kelamin: 'L', tempat_lahir: '',
  tanggal_lahir: '', alamat: '', no_hp: '', email: '', jabatan: 'guru',
  status_kepegawaian: 'honorer', bidang_studi: '', status: 'aktif'
}

const statusColor: Record<string, string> = {
  pns: 'bg-green-100 text-green-700',
  pppk: 'bg-blue-100 text-blue-700',
  honorer: 'bg-yellow-100 text-yellow-700',
}

const gtkPhotoUrl = (foto?: string) => foto ? encodeURI(foto) : ''

export default function DataGTKPage() {
  const [data, setData] = useState<GTK[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [showImport, setShowImport] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [selected, setSelected] = useState<GTK | null>(null)
  const [foundationTenantId, setFoundationTenantId] = useState<string | null>(null)
  const fotoRef = useRef<HTMLInputElement>(null)

  const fetchData = async () => {
    try {
      const params: any = { search }
      if (foundationTenantId && foundationTenantId !== 'all') {
        params.tenant_id = foundationTenantId
      }
      const res = await api.get(foundationTenantId ? '/foundation/gtk' : '/gtk', { params })
      setData(res.data)
    } catch { toast.error('Gagal memuat data GTK') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [search, foundationTenantId])

  const filtered = useMemo(() =>
    data.filter(g =>
      g.nama.toLowerCase().includes(search.toLowerCase()) ||
      (g.nip || '').includes(search)
    ), [data, search])

  const handleSave = async () => {
    if (!form.nama || !form.jenis_kelamin) { toast.error('Nama dan JK wajib diisi'); return }
    try {
      if (editId) {
        await api.put('/gtk/' + editId, form)
        toast.success('Data GTK berhasil diupdate')
        if (selected?.id === editId) setSelected(s => s ? { ...s, ...form } : null)
      } else {
        await api.post('/gtk', form)
        toast.success('GTK berhasil ditambahkan')
      }
      setShowModal(false); setEditId(null); setForm(emptyForm); fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal menyimpan') }
  }

  const handleEdit = (g: GTK) => {
    setForm({ nik: g.nik || '', nip: g.nip || '', nuptk: g.nuptk || '', nama: g.nama, jenis_kelamin: g.jenis_kelamin, tempat_lahir: g.tempat_lahir || '', tanggal_lahir: g.tanggal_lahir || '', alamat: g.alamat || '', no_hp: g.no_hp || '', email: g.email || '', jabatan: g.jabatan, status_kepegawaian: g.status_kepegawaian, bidang_studi: g.bidang_studi || '', status: g.status })
    setEditId(g.id); setShowModal(true)
  }

  const handleFoto = async (id: string, file?: File) => {
    if (!file) return
    const fd = new FormData()
    fd.append('foto', file)
    setUploadingFoto(true)
    try {
      const res = await api.post('/gtk/' + id + '/foto', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Foto GTK berhasil diupload')
      const url = res.data?.foto
      if (url) {
        setData(prev => prev.map(g => g.id === id ? { ...g, foto: url } : g))
        setSelected(s => s?.id === id ? { ...s, foto: url } : s)
      } else { fetchData() }
    } catch { toast.error('Gagal upload foto') }
    finally { setUploadingFoto(false) }
  }

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm('Hapus GTK ' + nama + '?')) return
    try {
      await api.delete('/gtk/' + id)
      toast.success('Berhasil dihapus')
      if (selected?.id === id) setSelected(null)
      fetchData()
    } catch { toast.error('Gagal menghapus') }
  }

  const handleExport = () => {
    const header = 'NIK,NIP,NUPTK,Nama,JK,Jabatan,Status Kepegawaian,Bidang Studi,Email,No HP'
    const rows = data.map(g => [g.nik || '', g.nip, g.nuptk, g.nama, g.jenis_kelamin, g.jabatan, g.status_kepegawaian, g.bidang_studi, g.email, g.no_hp].join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'data_gtk.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success('Export berhasil')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Data GTK</h1>
          <p className="text-gray-500 text-sm mt-1">Guru dan Tenaga Kependidikan ({data.length} orang)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            <Upload size={16} /> Import
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">
            <Download size={16} /> Export
          </button>
          <button onClick={() => { setForm(emptyForm); setEditId(null); setShowModal(true) }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            <Plus size={16} /> Tambah GTK
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
          <input type="text" placeholder="Cari berdasarkan nama atau NIP..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? (
          <p className="col-span-3 text-center text-gray-400 py-8">Memuat...</p>
        ) : filtered.length === 0 ? (
          <p className="col-span-3 text-center text-gray-400 py-8">Belum ada data GTK</p>
        ) : filtered.map(g => (
          <div
            key={g.id}
            onClick={() => setSelected(sel => sel?.id === g.id ? null : g)}
            className={`bg-white rounded-xl p-4 shadow-sm border cursor-pointer transition-all hover:shadow-md hover:border-primary/40 ${selected?.id === g.id ? 'border-primary ring-2 ring-primary/20' : 'border-gray-100'}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden border flex-shrink-0 bg-gray-100">
                {g.foto
                  ? <img src={gtkPhotoUrl(g.foto)} alt={g.nama} className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">{g.nama.charAt(0)}</div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-800 truncate">{g.nama}</p>
                <p className="text-xs text-gray-500 capitalize truncate">{g.jabatan.replace('_', ' ')} {g.bidang_studi ? `· ${g.bidang_studi}` : ''}</p>
              </div>
              <ChevronRight size={16} className={`text-gray-300 transition-transform ${selected?.id === g.id ? 'rotate-90' : ''}`} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[g.status_kepegawaian] || 'bg-gray-100 text-gray-600'}`}>
                {g.status_kepegawaian.toUpperCase()}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${g.status === 'aktif' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                {g.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Detail popup */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden border flex-shrink-0 bg-gray-100">
                {selected.foto
                  ? <img src={gtkPhotoUrl(selected.foto)} alt={selected.nama} className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">{selected.nama.charAt(0)}</div>
                }
              </div>
              <div>
                <h2 className="font-bold text-gray-800">{selected.nama}</h2>
                <p className="text-xs text-gray-500 capitalize">{selected.jabatan.replace('_', ' ')} · {selected.bidang_studi || '-'}</p>
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X size={18} /></button>
          </div>

          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {[
              ['NIK', selected.nik || '-'],
              ['NIP', selected.nip || '-'],
              ['NUPTK', selected.nuptk || '-'],
              ['Jenis Kelamin', selected.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'],
              ['Tempat Lahir', selected.tempat_lahir || '-'],
              ['Tanggal Lahir', selected.tanggal_lahir || '-'],
              ['No HP', selected.no_hp || '-'],
              ['Email', selected.email || '-'],
              ['Alamat', selected.alamat || '-'],
              ['Status Kepegawaian', selected.status_kepegawaian.toUpperCase()],
              ['Status', selected.status],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2 py-1 border-b border-gray-50">
                <span className="text-gray-500 flex-shrink-0">{label}</span>
                <span className="font-medium text-gray-800 text-right">{value}</span>
              </div>
            ))}
          </div>

          <div className="px-5 py-4 flex gap-2 flex-wrap border-t border-gray-50">
            <button onClick={() => handleEdit(selected)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <Edit size={14} /> Edit
            </button>
            <label className={`flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm cursor-pointer hover:bg-primary/20 ${uploadingFoto ? 'opacity-50' : ''}`}>
              <Camera size={14} /> {uploadingFoto ? 'Uploading...' : 'Ganti Foto'}
              <input ref={fotoRef} type="file" accept="image/*" disabled={uploadingFoto} onChange={e => handleFoto(selected.id, e.target.files?.[0])} className="hidden" />
            </label>
            <button onClick={() => handleDelete(selected.id, selected.nama)} className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100">
              <Trash2 size={14} /> Hapus
            </button>
          </div>
          </div>
        </div>
      )}

      {/* Modal Tambah/Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">{editId ? 'Edit GTK' : 'Tambah GTK'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">NIK</label><input inputMode="numeric" maxLength={16} value={form.nik} onChange={e => setForm({...form, nik: e.target.value.replace(/\D/g, '')})} placeholder="16 digit" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">NIP</label><input value={form.nip} onChange={e => setForm({...form, nip: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">NUPTK</label><input value={form.nuptk} onChange={e => setForm({...form, nuptk: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Nama Lengkap *</label><input value={form.nama} onChange={e => setForm({...form, nama: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">JK *</label><select value={form.jenis_kelamin} onChange={e => setForm({...form, jenis_kelamin: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="L">L</option><option value="P">P</option></select></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Jabatan</label><select value={form.jabatan} onChange={e => setForm({...form, jabatan: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="guru">Guru</option><option value="kepala_sekolah">Kepala Sekolah</option><option value="staff_tu">Staff TU</option><option value="operator">Operator</option></select></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Status</label><select value={form.status_kepegawaian} onChange={e => setForm({...form, status_kepegawaian: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="pns">PNS</option><option value="pppk">PPPK</option><option value="honorer">Honorer</option></select></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Bidang Studi</label><input value={form.bidang_studi} onChange={e => setForm({...form, bidang_studi: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Tempat Lahir</label><input value={form.tempat_lahir} onChange={e => setForm({...form, tempat_lahir: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Lahir</label><input type="date" value={form.tanggal_lahir} onChange={e => setForm({...form, tanggal_lahir: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Email</label><input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">No HP</label><input value={form.no_hp} onChange={e => setForm({...form, no_hp: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Batal</button>
              <button onClick={handleSave} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Excel */}
      {showImport && (
        <ImportExcel
          title="Import Data GTK"
          templateName="master-gtk-v2.xls"
          headerRow={2}
          columnMap={{ 'NIK': 'nik', 'Kode GTK': 'nip', 'Nama Lengkap': 'nama', 'TGL Lahir': 'tanggal_lahir', 'NIP/NUPTK': 'nuptk', 'No. HP': 'no_hp' }}
          foundationTenantId={foundationTenantId}
          apiEndpoint={foundationTenantId ? 'foundation/gtk' : 'gtk'}
          onImport={async (rows) => {
            for (const row of rows) {
              await api.post(foundationTenantId ? '/foundation/gtk' : '/gtk', { 
                ...row, 
                nik: String(row.nik || ''), jenis_kelamin: 'L',
                jabatan: 'guru', 
                status_kepegawaian: 'honorer', 
                status: 'aktif',
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
