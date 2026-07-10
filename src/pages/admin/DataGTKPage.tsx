import { useState, useEffect } from 'react'
import { Search, Plus, Edit, Trash2, Download, Upload, X, Camera } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import ImportExcel from '../../components/ImportExcel'
import { ResponsiveTable } from '../../components/ui'

interface GTK {
  id: string; nip: string; nuptk: string; nama: string; jenis_kelamin: string
  tempat_lahir: string; tanggal_lahir: string; alamat: string; no_hp: string
  email: string; jabatan: string; status_kepegawaian: string; bidang_studi: string; status: string; foto?: string
}

const emptyForm = {
  nip: '', nuptk: '', nama: '', jenis_kelamin: 'L', tempat_lahir: '',
  tanggal_lahir: '', alamat: '', no_hp: '', email: '', jabatan: 'guru',
  status_kepegawaian: 'honorer', bidang_studi: '', status: 'aktif'
}

export default function DataGTKPage() {
  const [data, setData] = useState<GTK[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [uploadingFoto, setUploadingFoto] = useState(false)

  const fetchData = async () => {
    try {
      const res = await api.get('/gtk', { params: { search } })
      setData(res.data)
    } catch { toast.error('Gagal memuat data GTK') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [search])

  const handleSave = async () => {
    if (!form.nama || !form.jenis_kelamin) { toast.error('Nama dan JK wajib diisi'); return }
    try {
      if (editId) {
        await api.put('/gtk/' + editId, form)
        toast.success('Data GTK berhasil diupdate')
      } else {
        await api.post('/gtk', form)
        toast.success('GTK berhasil ditambahkan')
      }
      setShowModal(false); setEditId(null); setForm(emptyForm); fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal menyimpan') }
  }

  const handleEdit = (g: GTK) => {
    setForm({ nip: g.nip || '', nuptk: g.nuptk || '', nama: g.nama, jenis_kelamin: g.jenis_kelamin, tempat_lahir: g.tempat_lahir || '', tanggal_lahir: g.tanggal_lahir || '', alamat: g.alamat || '', no_hp: g.no_hp || '', email: g.email || '', jabatan: g.jabatan, status_kepegawaian: g.status_kepegawaian, bidang_studi: g.bidang_studi || '', status: g.status })
    setEditId(g.id); setShowModal(true)
  }

  const handleFoto = async (id: string, file?: File) => {
    if (!file) return
    const fd = new FormData()
    fd.append('foto', file)
    setUploadingFoto(true)
    try {
      await api.post('/gtk/' + id + '/foto', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Foto GTK berhasil diupload')
      fetchData()
    } catch { toast.error('Gagal upload foto') }
    finally { setUploadingFoto(false) }
  }

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm('Hapus GTK ' + nama + '?')) return
    try { await api.delete('/gtk/' + id); toast.success('Berhasil dihapus'); fetchData() }
    catch { toast.error('Gagal menghapus') }
  }

  const handleExport = () => {
    const header = 'NIP,NUPTK,Nama,JK,Jabatan,Status Kepegawaian,Bidang Studi,Email,No HP'
    const rows = data.map(g => [g.nip, g.nuptk, g.nama, g.jenis_kelamin, g.jabatan, g.status_kepegawaian, g.bidang_studi, g.email, g.no_hp].join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'data_gtk.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success('Export berhasil')
  }

  const handleImport = async () => {
    const lines = importText.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) { toast.error('Format: header + data'); return }
    let count = 0
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(',').map(s => s.trim())
      if (c.length < 3) continue
      try {
        await api.post('/gtk', { nip: c[0], nuptk: c[1], nama: c[2], jenis_kelamin: c[3] || 'L', tempat_lahir: '', tanggal_lahir: '', alamat: '', no_hp: c[8] || '', email: c[7] || '', jabatan: 'guru', status_kepegawaian: c[5] || 'honorer', bidang_studi: c[6] || '' })
        count++
      } catch {}
    }
    toast.success(count + ' GTK berhasil diimport')
    setShowImport(false); setImportText(''); fetchData()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Data GTK</h1>
          <p className="text-gray-500 text-sm mt-1">Guru dan Tenaga Kependidikan ({data.length} orang)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/templates/template-gtk.xls" download className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
            <Download size={16} /> Unduh Template
          </a>
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

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Cari berdasarkan nama atau NIP..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5">
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-8">Memuat...</p>
        ) : (
          <ResponsiveTable<GTK>
            columns={[
              { key: 'no', header: 'No', hideOnMobile: true, render: (g) => data.indexOf(g) + 1 },
              { key: 'foto', header: 'Foto', render: (g) => (
                <div className="flex items-center gap-2">
                  <img src={g.foto || '/logo-jurnalku-256.png'} alt={g.nama} className="w-9 h-9 rounded-full object-cover bg-gray-100 border" />
                  <label className="p-1.5 text-primary hover:bg-primary/10 rounded-lg cursor-pointer" title="Upload foto">
                    <Camera size={15} />
                    <input type="file" accept="image/*" disabled={uploadingFoto} onChange={(e) => handleFoto(g.id, e.target.files?.[0])} className="hidden" />
                  </label>
                </div>
              ) },
              { key: 'nama', header: 'Nama', className: 'font-medium text-gray-800' },
              { key: 'nip', header: 'NIP', className: 'font-mono text-xs', hideOnMobile: true, render: (g) => g.nip || '-' },
              { key: 'jenis_kelamin', header: 'JK' },
              { key: 'jabatan', header: 'Jabatan', className: 'capitalize', render: (g) => g.jabatan.replace('_', ' ') },
              { key: 'bidang_studi', header: 'Bidang Studi', hideOnMobile: true, render: (g) => g.bidang_studi || '-' },
              { key: 'status', header: 'Status', render: (g) => (
                <span className={'px-2 py-1 rounded-full text-xs font-medium ' + (g.status_kepegawaian === 'pns' ? 'bg-green-100 text-green-700' : g.status_kepegawaian === 'pppk' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700')}>
                  {g.status_kepegawaian.toUpperCase()}
                </span>
              ) },
            ]}
            rows={data}
            rowKey={(g) => g.id}
            empty="Belum ada data GTK"
            actions={(g) => (
              <>
                <button onClick={() => handleEdit(g)} className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg"><Edit size={16} /></button>
                <button onClick={() => handleDelete(g.id, g.nama)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
              </>
            )}
          />
        )}
      </div>

      {/* Modal Tambah/Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">{editId ? 'Edit GTK' : 'Tambah GTK'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
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

      {/* Modal Import Excel */}
      {showImport && (
        <ImportExcel
          title="Import Data GTK"
          templateName="master-gtk-v2.xls"
          headerRow={2}
          columnMap={{ 'Kode GTK': 'nip', 'Nama Lengkap': 'nama', 'TGL Lahir': 'tanggal_lahir', 'NIP/NUPTK': 'nuptk', 'No. HP': 'no_hp' }}
          onImport={async (rows) => {
            for (const row of rows) {
              await api.post('/gtk', { ...row, jenis_kelamin: 'L', jabatan: 'guru', status_kepegawaian: 'honorer', status: 'aktif' })
            }
            fetchData()
          }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
