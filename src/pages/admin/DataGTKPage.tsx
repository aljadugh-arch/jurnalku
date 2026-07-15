import { useState, useEffect } from 'react'
import { Search, Plus, Edit, Trash2, Download, Upload, X, Camera, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import ImportExcel from '../../components/ImportExcel'
import BulkDeleteButton from '../../components/BulkDeleteButton'
import { ResponsiveTable } from '../../components/ui'
import { formatTanggal, normalizeDate } from '../../lib/dateFormat'
import { compressImage } from '../../lib/image'

interface GTK {
  id: string; nip: string; nuptk: string; nama: string; jenis_kelamin: string
  tempat_lahir: string; tanggal_lahir: string; alamat: string; no_hp: string
  email: string; jabatan: string; status_kepegawaian: string; bidang_studi: string; kode_guru: string; status: string; foto?: string
}

const emptyForm = {
  nip: '', nuptk: '', nama: '', jenis_kelamin: 'L', tempat_lahir: '',
  tanggal_lahir: '', alamat: '', no_hp: '', email: '', jabatan: 'guru',
  status_kepegawaian: 'honorer', bidang_studi: '', kode_guru: '', status: 'aktif'
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
  const [detail, setDetail] = useState<GTK | null>(null)

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
    setForm({ nip: g.nip || '', nuptk: g.nuptk || '', nama: g.nama, jenis_kelamin: g.jenis_kelamin, tempat_lahir: g.tempat_lahir || '', tanggal_lahir: normalizeDate(g.tanggal_lahir), alamat: g.alamat || '', no_hp: g.no_hp || '', email: g.email || '', jabatan: g.jabatan, status_kepegawaian: g.status_kepegawaian, bidang_studi: g.bidang_studi || '', kode_guru: g.kode_guru || '', status: g.status })
    setEditId(g.id); setShowModal(true)
  }

  const handleFoto = async (id: string, file?: File) => {
    if (!file) return
    setUploadingFoto(true)
    try {
      const compressed = await compressImage(file) // resize->512px, JPEG q0.82
      const fd = new FormData()
      fd.append('foto', compressed)
      await api.post('/gtk/' + id + '/foto', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Foto GTK berhasil diupload')
      fetchData()
    } catch { toast.error('Gagal upload foto') }
    finally { setUploadingFoto(false) }
  }

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm('Hapus GTK ' + nama + '?')) return
    try {
      await api.delete('/gtk/' + id)
      toast.success('Berhasil dihapus')
      fetchData()
    } catch (err: any) {
      const data = err.response?.data
      if (data?.kind === 'assignment') {
        const refs = (data.refs || []).map((r: any) => `${r.label}: ${r.count}`).join(', ')
        if (!confirm(`GTK masih dipakai di ${refs}.\n\nHapus GTK sekaligus data penugasan terkait?`)) return
        try {
          await api.delete('/gtk/' + id + '?force=1')
          toast.success('GTK dan data penugasan terkait dihapus')
          fetchData()
        } catch (forceErr: any) {
          toast.error(forceErr.response?.data?.error || 'Gagal menghapus paksa')
        }
        return
      }
      toast.error(data?.error || 'Gagal menghapus')
    }
  }

  const handleExport = () => {
    const header = 'NIP,NUPTK,Nama,JK,Kode Guru,Jabatan,Status Kepegawaian,Bidang Studi,Email,No HP'
    const rows = data.map(g => [g.nip, g.nuptk, g.nama, g.jenis_kelamin, g.kode_guru, g.jabatan, g.status_kepegawaian, g.bidang_studi, g.email, g.no_hp].join(','))
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
        await api.post('/gtk', { nip: c[0], nuptk: c[1], nama: c[2], jenis_kelamin: c[3] || 'L', kode_guru: c[4] || '', tempat_lahir: '', tanggal_lahir: '', alamat: '', no_hp: c[9] || '', email: c[8] || '', jabatan: c[5] || 'guru', status_kepegawaian: c[6] || 'honorer', bidang_studi: c[7] || '' })
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
          <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            <Upload size={16} /> Import
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">
            <Download size={16} /> Export
          </button>
          <button onClick={() => { setForm(emptyForm); setEditId(null); setShowModal(true) }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            <Plus size={16} /> Tambah GTK
          </button>
          <BulkDeleteButton kategori="gtk" label="GTK" onDone={fetchData} />
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
              { key: 'nama', header: 'Nama', className: 'font-medium text-gray-800' },
              { key: 'nip', header: 'NIP / NUPTK', render: (g) => (
                <span className="font-mono text-xs">{g.nip || '-'}{g.nuptk ? ' / ' + g.nuptk : ''}</span>
              ) },
              { key: 'bidang_studi', header: 'Bidang Studi', render: (g) => g.bidang_studi || '-' },
            ]}
            rows={data}
            rowKey={(g) => g.id}
            empty="Belum ada data GTK"
            actions={(g) => (
              <>
                <button onClick={() => setDetail(g)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Detail"><Eye size={16} /></button>
                <button onClick={() => handleEdit(g)} className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg" title="Edit"><Edit size={16} /></button>
                <button onClick={() => handleDelete(g.id, g.nama)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title="Hapus"><Trash2 size={16} /></button>
              </>
            )}
          />
        )}
      </div>

      {/* Modal Tambah/Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-6 sm:pt-10 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[calc(100vh-3rem)] overflow-y-auto p-6">
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
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Bidang Studi</label><div className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 text-gray-600 min-h-[38px]">{form.bidang_studi || 'Diambil otomatis dari menu Pengajar'}</div></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1" title="Kode inisial guru dipakai di export jadwal Excel (mis. A, B, MMY)">Kode Guru</label><input value={form.kode_guru} onChange={e => setForm({...form, kode_guru: e.target.value.toUpperCase()})} maxLength={5} className="w-full px-3 py-2 border rounded-lg text-sm uppercase" placeholder="mis. A" /></div>
              </div>
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

      {/* Modal Detail GTK */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-6 sm:pt-10 overflow-y-auto" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[calc(100vh-3rem)] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Detail GTK</h2>
              <button onClick={() => setDetail(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="flex flex-col items-center mb-4">
              <img src={detail.foto || '/logo-jurnalku-256.png'} alt={detail.nama} className="w-24 h-24 rounded-full object-cover bg-gray-100 border mb-2" />
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-primary bg-primary/5 border border-primary/30 rounded-lg cursor-pointer hover:bg-primary/10">
                <Camera size={14} /> Ganti Foto
                <input type="file" accept="image/*" disabled={uploadingFoto} onChange={(e) => handleFoto(detail.id, e.target.files?.[0])} className="hidden" />
              </label>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ['Nama', detail.nama],
                ['NIP', detail.nip || '-'],
                ['NUPTK', detail.nuptk || '-'],
                ['Kode Guru', detail.kode_guru || '-'],
                ['Jenis Kelamin', detail.jenis_kelamin === 'P' ? 'Perempuan' : 'Laki-laki'],
                ['Tempat, Tgl Lahir', (detail.tempat_lahir || '-') + ', ' + formatTanggal(detail.tanggal_lahir)],
                ['Jabatan', (detail.jabatan || '-').replace('_', ' ')],
                ['Status Kepegawaian', (detail.status_kepegawaian || '-').toUpperCase()],
                ['Bidang Studi', detail.bidang_studi || '-'],
                ['No HP', detail.no_hp || '-'],
                ['Email', detail.email || '-'],
                ['Alamat', detail.alamat || '-'],
                ['Status', detail.status],
              ].map(([label, val]) => (
                <div key={label} className="flex gap-2">
                  <span className="text-gray-400 w-36 shrink-0">{label}</span>
                  <span className="text-gray-800 font-medium break-words min-w-0 capitalize">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Import Excel */}
      {showImport && (
        <ImportExcel
          title="Import Data GTK"
          templateUrl="/templates/template-gtk.xlsx"
          templateName="template-gtk.xlsx"
          headerRow={1}
          columnMap={{ 'NIP': 'nip', 'NUPTK': 'nuptk', 'Nama Lengkap': 'nama', 'JK': 'jenis_kelamin', 'Kode Guru': 'kode_guru', 'Tempat Lahir': 'tempat_lahir', 'TGL Lahir': 'tanggal_lahir', 'Alamat': 'alamat', 'No. HP': 'no_hp', 'Email': 'email', 'Jabatan': 'jabatan', 'Status Kepegawaian': 'status_kepegawaian', 'Bidang Studi': 'bidang_studi' }}
          onImport={async (rows) => {
            let gagal = 0
            for (const row of rows) {
              if (!row.nama) continue
              const jk = (row.jenis_kelamin || 'L').toString().charAt(0).toUpperCase()
              try {
                await api.post('/gtk', {
                  nip: String(row.nip || ''), nuptk: String(row.nuptk || ''), nama: row.nama,
                  jenis_kelamin: jk === 'P' ? 'P' : 'L', kode_guru: String(row.kode_guru || '').toUpperCase(), tempat_lahir: row.tempat_lahir || '',
                  tanggal_lahir: row.tanggal_lahir || '', alamat: row.alamat || '',
                  no_hp: String(row.no_hp || ''), email: row.email || '',
                  jabatan: row.jabatan || 'Guru', status_kepegawaian: row.status_kepegawaian || 'Honorer',
                  bidang_studi: row.bidang_studi || '', status: 'aktif',
                })
              } catch { gagal++ }
            }
            if (gagal > 0) toast.error(gagal + ' baris gagal (NIP duplikat/data tidak valid)')
            fetchData()
          }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
