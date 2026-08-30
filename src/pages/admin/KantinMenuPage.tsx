import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, X, Image, ChevronUp, ChevronDown, Search, Loader2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { imageFileToDataUrl } from '../../lib/image'

interface KantinMenu {
  id: string
  tenant_id: string
  kategori: string
  nama: string
  deskripsi: string | null
  harga: number
  stok: number
  foto: string | null
  aktif: number
  urut: number
  created_at: string
}

const KATEGORI = ['makanan', 'minuman', 'snack', 'lainnya']

export default function KantinMenuPage() {
  const [menus, setMenus] = useState<KantinMenu[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({
    kategori: 'makanan', nama: '', deskripsi: '', harga: 0, stok: 0,
    foto: '', aktif: true, urut: 0
  })
  const [search, setSearch] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [showBatch, setShowBatch] = useState(false)
  const [batchText, setBatchText] = useState('')
  const [batchBusy, setBatchBusy] = useState(false)

  // Parse pasted rows (from Excel/CSV). Columns: nama, harga, kategori?, stok?, deskripsi?
  // Separator auto-detected: tab (Excel paste) or comma. First line may be a header.
  const parseBatch = (text: string) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (!lines.length) return { items: [], errors: ['Tidak ada baris'] }
    const sep = lines[0].includes('\t') ? '\t' : ','
    const looksHeader = /nama/i.test(lines[0]) && /harga/i.test(lines[0])
    const rows = looksHeader ? lines.slice(1) : lines
    const items: any[] = []
    const errors: string[] = []
    rows.forEach((line, i) => {
      const c = line.split(sep).map(s => s.trim())
      const nama = c[0] || ''
      const harga = parseInt((c[1] || '').replace(/[^\d]/g, ''), 10)
      const kategori = (c[2] || 'makanan').toLowerCase()
      const stok = c[3] !== undefined && c[3] !== '' ? parseInt(c[3].replace(/[^\d]/g, ''), 10) : 0
      const deskripsi = c[4] || ''
      const n = i + 1
      if (!nama) { errors.push(`Baris ${n}: nama kosong`); return }
      if (!Number.isInteger(harga) || harga <= 0) { errors.push(`Baris ${n}: harga tidak valid`); return }
      if (!KATEGORI.includes(kategori)) { errors.push(`Baris ${n}: kategori "${kategori}" tidak dikenal (${KATEGORI.join('/')})`); return }
      items.push({ nama, harga, kategori, stok: Number.isInteger(stok) ? stok : 0, deskripsi, aktif: true })
    })
    return { items, errors }
  }

  const batchPreview = parseBatch(batchText)

  const handleBatchSave = async () => {
    const { items, errors } = batchPreview
    if (errors.length) return toast.error(`${errors.length} baris bermasalah — perbaiki dulu`)
    if (!items.length) return toast.error('Tidak ada item valid')
    setBatchBusy(true)
    try {
      const res = await api.post('/kantin/menu/batch', { items })
      toast.success(`${res.data.inserted} menu ditambahkan`)
      setShowBatch(false)
      setBatchText('')
      fetchMenus()
    } catch (err: any) {
      const d = err.response?.data
      toast.error(d?.details?.length ? d.details.slice(0, 3).join('; ') : (d?.error || 'Gagal import batch'))
    } finally { setBatchBusy(false) }
  }

  const fetchMenus = async () => {
    try {
      const params = new URLSearchParams()
      if (kategoriFilter) params.append('kategori', kategoriFilter)
      const res = await api.get('/kantin/menu', { params })
      setMenus(res.data)
    } catch { toast.error('Gagal memuat menu kantin') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchMenus() }, [kategoriFilter])

  const handleSave = async () => {
    if (!form.kategori || !form.nama || !Number.isInteger(form.harga) || form.harga <= 0) {
      return toast.error('Kategori, nama, dan harga (integer > 0) wajib diisi')
    }
    try {
      if (editId) {
        await api.put('/kantin/menu/' + editId, form)
        toast.success('Menu berhasil diupdate')
      } else {
        await api.post('/kantin/menu', form)
        toast.success('Menu berhasil ditambahkan')
      }
      setShowModal(false)
      setEditId(null)
      setForm({ kategori: 'makanan', nama: '', deskripsi: '', harga: 0, stok: 0, foto: '', aktif: true, urut: 0 })
      fetchMenus()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan')
    }
  }

  const handleEdit = (menu: any) => {
    setForm({
      kategori: menu.kategori, nama: menu.nama, deskripsi: menu.deskripsi || '',
      harga: menu.harga, stok: menu.stok || 0, foto: menu.foto || '',
      aktif: menu.aktif === 1, urut: menu.urut || 0
    })
    setEditId(menu.id)
    setShowModal(true)
  }

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm('Hapus menu ' + nama + '?')) return
    try {
      await api.delete('/kantin/menu/' + id)
      toast.success('Menu berhasil dihapus')
      fetchMenus()
    } catch { toast.error('Gagal menghapus') }
  }

  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const foto = await imageFileToDataUrl(file, { maxSize: 1024 })
      setForm(prev => ({ ...prev, foto }))
    } catch { toast.error('Gagal memproses foto') }
  }

  const filteredMenus = menus.filter(m =>
    m.nama.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Menu Kantin</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola menu makanan, minuman, dan snack kantin</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setBatchText(''); setShowBatch(true) }}
            className="flex items-center gap-2 px-4 py-2 border border-primary text-primary rounded-lg text-sm hover:bg-primary/5"
          >
            <Upload size={16} /> Import Batch
          </button>
          <button
            onClick={() => { setForm({ kategori: 'makanan', nama: '', deskripsi: '', harga: 0, stok: 0, foto: '', aktif: true, urut: 0 }); setEditId(null); setShowModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark"
          >
            <Plus size={16} /> Tambah Menu
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari menu..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={kategoriFilter}
          onChange={e => setKategoriFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[180px]"
        >
          <option value="">Semua Kategori</option>
          {KATEGORI.map(k => <option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /><p className="mt-2 text-gray-500">Memuat...</p></div>
        ) : filteredMenus.length === 0 ? (
          <div className="p-12 text-center text-gray-500">Belum ada menu kantin</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Foto</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Nama</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Kategori</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Harga</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Stok</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMenus.map(menu => (
                  <tr key={menu.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {menu.foto ? (
                        <img src={menu.foto} alt={menu.nama} className="w-12 h-12 rounded-lg object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                          <Image size={20} className="text-gray-400" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{menu.nama}</p>
                      {menu.deskripsi && <p className="text-xs text-gray-500 truncate max-w-xs">{menu.deskripsi}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">{menu.kategori}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-800">Rp {menu.harga.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={menu.stok === 0 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                        {menu.stok} {menu.stok === 0 && '(Habis)'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${menu.aktif ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {menu.aktif ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleEdit(menu)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit">
                          <Edit size={16} />
                        </button>
                        <button onClick={() => handleDelete(menu.id, menu.nama)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title="Hapus">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editId ? 'Edit Menu' : 'Tambah Menu'}</h2>
              <button onClick={() => { setShowModal(false); setEditId(null); setForm({ kategori: 'makanan', nama: '', deskripsi: '', harga: 0, stok: 0, foto: '', aktif: true, urut: 0 }) }} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kategori *</label>
                <select value={form.kategori} onChange={e => setForm({...form, kategori: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                  {KATEGORI.map(k => <option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nama Menu *</label>
                <input value={form.nama} onChange={e => setForm({...form, nama: e.target.value})} placeholder="Nasi Goreng" className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Deskripsi</label>
                <textarea value={form.deskripsi} onChange={e => setForm({...form, deskripsi: e.target.value})} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Harga (Rp) *</label>
                  <input type="number" min="1" step="100" value={form.harga} onChange={e => setForm({...form, harga: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Stok</label>
                  <input type="number" min="0" value={form.stok} onChange={e => setForm({...form, stok: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Urutan</label>
                  <input type="number" min="0" value={form.urut} onChange={e => setForm({...form, urut: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.aktif} onChange={e => setForm({...form, aktif: e.target.checked})} className="w-4 h-4 text-primary rounded border-gray-300" />
                    <span className="text-sm text-gray-700">Aktif</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Foto</label>
                <div className="relative">
                  {form.foto && (
                    <div className="mb-2 relative">
                      <img src={form.foto} alt="Preview" className="w-24 h-24 rounded-lg object-cover border" />
                      <button onClick={() => setForm({...form, foto: ''})} className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full text-xs hover:bg-red-600">×</button>
                    </div>
                  )}
                  <label className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary/50">
                    <Image size={20} className="text-gray-400" />
                    <span className="text-sm text-gray-600">{form.foto ? 'Ganti foto' : 'Upload foto (max 1MB)'}</span>
                    <input type="file" accept="image/*" onChange={handleFoto} className="hidden" />
                  </label>
                </div>
              </div>
              <div className="flex gap-3 mt-6 pt-4 border-t">
                <button onClick={() => { setShowModal(false); setEditId(null); setForm({ kategori: 'makanan', nama: '', deskripsi: '', harga: 0, stok: 0, foto: '', aktif: true, urut: 0 }) }} className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Batal</button>
                <button onClick={handleSave} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">Simpan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Import Modal */}
      {showBatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Import Menu Massal</h2>
              <button onClick={() => { setShowBatch(false); setBatchText('') }} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 space-y-1">
                <p className="font-medium">Tempel dari Excel/Sheets atau ketik, satu menu per baris.</p>
                <p>Kolom (pisah <b>Tab</b> atau <b>koma</b>): <code className="bg-white px-1 rounded">nama, harga, kategori, stok, deskripsi</code></p>
                <p className="text-xs text-gray-500">kategori: {KATEGORI.join(' / ')} (default makanan). stok &amp; deskripsi opsional. Baris header (mengandung "nama" &amp; "harga") diabaikan otomatis.</p>
              </div>
              <textarea
                value={batchText}
                onChange={e => setBatchText(e.target.value)}
                rows={10}
                placeholder={"Nasi Goreng, 12000, makanan, 20\nEs Teh, 3000, minuman, 50\nRoti Coklat\t5000\tsnack\t30"}
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
              />
              {batchText.trim() && (
                <div className="text-sm">
                  <p className="text-green-700">{batchPreview.items.length} item valid siap diimport</p>
                  {batchPreview.errors.length > 0 && (
                    <div className="mt-1 text-red-600 max-h-32 overflow-y-auto">
                      {batchPreview.errors.slice(0, 20).map((e, i) => <p key={i} className="text-xs">{e}</p>)}
                      {batchPreview.errors.length > 20 && <p className="text-xs">…dan {batchPreview.errors.length - 20} lagi</p>}
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-3 mt-4 pt-4 border-t">
                <button onClick={() => { setShowBatch(false); setBatchText('') }} className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Batal</button>
                <button
                  onClick={handleBatchSave}
                  disabled={batchBusy || !batchPreview.items.length || batchPreview.errors.length > 0}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {batchBusy && <Loader2 size={16} className="animate-spin" />}
                  Import {batchPreview.items.length > 0 ? `(${batchPreview.items.length})` : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}