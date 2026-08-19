import { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2, X, Users, Pencil, Search, ArrowRightLeft, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface Rombel {
  id: string; nama: string; tingkat: string; tahun_ajaran: string
  wali_kelas_id: string; wali_kelas_nama: string; kapasitas: number; jumlah_siswa: number
}

interface Siswa {
  id: string; nama: string; nis: string; nisn?: string
  rombel_id: string; rombel_nama?: string; status?: string
}

export default function RombelPage() {
  const [data, setData] = useState<Rombel[]>([])
  const [gtk, setGtk] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Rombel | null>(null)
  const [form, setForm] = useState({ nama: '', tingkat: 'VII', tahun_ajaran: '2026/2027', wali_kelas_id: '', kapasitas: 36 })

  // Detail siswa panel
  const [selectedRombel, setSelectedRombel] = useState<Rombel | null>(null)
  const [siswas, setSiswas] = useState<Siswa[]>([])
  const [loadingSiswa, setLoadingSiswa] = useState(false)
  const [searchSiswa, setSearchSiswa] = useState('')
  const [showPindah, setShowPindah] = useState<Siswa | null>(null)
  const [pindahTo, setPindahTo] = useState('')
  const [showEditSiswa, setShowEditSiswa] = useState<Siswa | null>(null)
  const [editSiswaForm, setEditSiswaForm] = useState({ nama: '', nis: '', nisn: '' })

  const fetchData = async () => {
    try {
      const [res, gtkRes] = await Promise.all([api.get('/rombel'), api.get('/gtk')])
      setData(res.data); setGtk(gtkRes.data)
    } catch { toast.error('Gagal memuat data') }
    finally { setLoading(false) }
  }

  const fetchSiswa = async (rombelId: string) => {
    setLoadingSiswa(true)
    try {
      const res = await api.get('/siswa', { params: { rombel_id: rombelId } })
      setSiswas(res.data)
    } catch { toast.error('Gagal memuat siswa') }
    finally { setLoadingSiswa(false) }
  }

  useEffect(() => { fetchData() }, [])

  const openDetail = (r: Rombel) => {
    setSelectedRombel(r)
    setSearchSiswa('')
    fetchSiswa(r.id)
  }

  const closeDetail = () => {
    setSelectedRombel(null)
    setSiswas([])
    setSearchSiswa('')
  }

  const filteredSiswa = useMemo(() =>
    siswas.filter(s => s.nama.toLowerCase().includes(searchSiswa.toLowerCase()) || s.nis.includes(searchSiswa)),
    [siswas, searchSiswa]
  )

  const resetForm = () => {
    setEditing(null)
    setForm({ nama: '', tingkat: 'VII', tahun_ajaran: '2026/2027', wali_kelas_id: '', kapasitas: 36 })
  }

  const openCreate = () => { resetForm(); setShowModal(true) }
  const openEdit = (r: Rombel) => {
    setEditing(r)
    setForm({ nama: r.nama, tingkat: r.tingkat, tahun_ajaran: r.tahun_ajaran, wali_kelas_id: r.wali_kelas_id || '', kapasitas: r.kapasitas || 36 })
    setShowModal(true)
  }
  const closeModal = () => { setShowModal(false); resetForm() }

  const handleSave = async () => {
    if (!form.nama || !form.tingkat) { toast.error('Nama dan tingkat wajib'); return }
    try {
      if (editing) {
        await api.put('/rombel/' + editing.id, form)
        toast.success('Rombel berhasil diperbarui')
        if (selectedRombel?.id === editing.id) setSelectedRombel({ ...selectedRombel, ...form, wali_kelas_nama: gtk.find(g => g.id === form.wali_kelas_id)?.nama || selectedRombel.wali_kelas_nama })
      } else {
        await api.post('/rombel', form)
        toast.success('Rombel berhasil ditambahkan')
      }
      closeModal(); fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal') }
  }

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm('Hapus rombel ' + nama + '? Pastikan tidak ada siswa di rombel ini.')) return
    try { await api.delete('/rombel/' + id); toast.success('Berhasil dihapus'); fetchData(); if (selectedRombel?.id === id) closeDetail() }
    catch { toast.error('Gagal menghapus') }
  }

  // Hapus siswa dari rombel (keluarkan dari rombel, bukan hapus siswa)
  const handleKeluarkan = async (s: Siswa) => {
    if (!confirm(`Keluarkan ${s.nama} dari rombel ini?`)) return
    try {
      await api.put('/siswa/' + s.id, { rombel_id: null })
      toast.success(s.nama + ' dikeluarkan dari rombel')
      setSiswas(prev => prev.filter(x => x.id !== s.id))
      if (selectedRombel) fetchData()
    } catch { toast.error('Gagal') }
  }

  // Pindah siswa ke rombel lain
  const handlePindah = async () => {
    if (!pindahTo) { toast.error('Pilih rombel tujuan'); return }
    if (!showPindah) return
    try {
      await api.put('/siswa/' + showPindah.id, { rombel_id: pindahTo })
      toast.success(showPindah.nama + ' dipindah ke ' + (data.find(r => r.id === pindahTo)?.nama || pindahTo))
      setSiswas(prev => prev.filter(x => x.id !== showPindah.id))
      setShowPindah(null); setPindahTo('')
      fetchData()
    } catch { toast.error('Gagal memindah siswa') }
  }

  // Edit data siswa
  const handleEditSiswa = async () => {
    if (!showEditSiswa) return
    if (!editSiswaForm.nama) { toast.error('Nama wajib diisi'); return }
    try {
      await api.put('/siswa/' + showEditSiswa.id, editSiswaForm)
      toast.success('Data siswa diperbarui')
      setSiswas(prev => prev.map(s => s.id === showEditSiswa.id ? { ...s, ...editSiswaForm } : s))
      setShowEditSiswa(null)
    } catch { toast.error('Gagal update siswa') }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Rombongan Belajar</h1>
          <p className="text-gray-500 text-sm mt-1">{data.length} rombel terdaftar</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
          <Plus size={16} /> Tambah Rombel
        </button>
      </div>

      {/* Grid rombel — simpel: nama + wali kelas saja */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? (
          <p className="text-gray-400 col-span-3 text-center py-8">Memuat...</p>
        ) : data.length === 0 ? (
          <p className="text-gray-400 col-span-3 text-center py-8">Belum ada rombel</p>
        ) : data.map(r => (
          <div
            key={r.id}
            onClick={() => openDetail(r)}
            className={`bg-white rounded-xl p-4 shadow-sm border cursor-pointer transition-all hover:shadow-md hover:border-primary/40 ${selectedRombel?.id === r.id ? 'border-primary ring-2 ring-primary/20' : 'border-gray-100'}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Users size={20} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-800 truncate">{r.nama}</h3>
                  <p className="text-xs text-gray-500 truncate">{r.wali_kelas_nama || 'Belum ada wali kelas'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <span className="text-xs text-gray-400 font-medium">{r.jumlah_siswa} siswa</span>
                <ChevronRight size={16} className="text-gray-300" />
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex gap-1 mt-3 pt-3 border-t border-gray-50" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => openEdit(r)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 bg-blue-50 sm:bg-transparent hover:bg-blue-50 rounded-lg"
              >
                <Pencil size={13} /> Edit
              </button>
              <button
                onClick={() => handleDelete(r.id, r.nama)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 bg-red-50 sm:bg-transparent hover:bg-red-50 rounded-lg"
              >
                <Trash2 size={13} /> Hapus
              </button>
              <span className="ml-auto text-xs text-gray-300">{r.tingkat} • {r.tahun_ajaran}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Panel detail siswa */}
      {selectedRombel && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-bold text-gray-800">{selectedRombel.nama}</h2>
              <p className="text-xs text-gray-500">
                Wali Kelas: {selectedRombel.wali_kelas_nama || '-'} · {siswas.length} siswa
              </p>
            </div>
            <button onClick={closeDetail} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
              <X size={18} />
            </button>
          </div>

          {/* Search siswa */}
          <div className="px-5 py-3 border-b border-gray-50">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchSiswa}
                onChange={e => setSearchSiswa(e.target.value)}
                placeholder="Cari nama atau NIS..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* List siswa */}
          <div className="divide-y divide-gray-50">
            {loadingSiswa ? (
              <div className="py-8 text-center text-gray-400 text-sm">Memuat data siswa...</div>
            ) : filteredSiswa.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">
                {searchSiswa ? 'Siswa tidak ditemukan' : 'Belum ada siswa di rombel ini'}
              </div>
            ) : filteredSiswa.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 group">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{s.nama}</p>
                  <p className="text-xs text-gray-400">{s.nis || 'NIS belum diisi'}</p>
                </div>
                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setShowEditSiswa(s); setEditSiswaForm({ nama: s.nama, nis: s.nis || '', nisn: s.nisn || '' }) }}
                    className="p-1.5 text-blue-500 bg-blue-50 sm:bg-transparent hover:bg-blue-50 rounded-lg"
                    title="Edit data siswa"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => { setShowPindah(s); setPindahTo('') }}
                    className="p-1.5 text-amber-500 bg-amber-50 sm:bg-transparent hover:bg-amber-50 rounded-lg"
                    title="Pindah rombel"
                  >
                    <ArrowRightLeft size={14} />
                  </button>
                  <button
                    onClick={() => handleKeluarkan(s)}
                    className="p-1.5 text-red-500 bg-red-50 sm:bg-transparent hover:bg-red-50 rounded-lg"
                    title="Keluarkan dari rombel"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal tambah/edit rombel */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">{editing ? 'Edit Rombel' : 'Tambah Rombel'}</h2>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nama Rombel *</label>
                <input value={form.nama} onChange={e => setForm({...form, nama: e.target.value})} placeholder="VII-A" className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tingkat</label>
                  <select value={form.tingkat} onChange={e => setForm({...form, tingkat: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    {['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kapasitas</label>
                  <input type="number" value={form.kapasitas} onChange={e => setForm({...form, kapasitas: +e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tahun Ajaran</label>
                <input value={form.tahun_ajaran} onChange={e => setForm({...form, tahun_ajaran: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Wali Kelas</label>
                <select value={form.wali_kelas_id} onChange={e => setForm({...form, wali_kelas_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Pilih --</option>
                  {gtk.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={closeModal} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={handleSave} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">{editing ? 'Update' : 'Simpan'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal pindah rombel */}
      {showPindah && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Pindah Rombel</h2>
              <button onClick={() => setShowPindah(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Pindahkan <span className="font-semibold text-gray-800">{showPindah.nama}</span> ke rombel:
            </p>
            <select
              value={pindahTo}
              onChange={e => setPindahTo(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm mb-4"
            >
              <option value="">-- Pilih Rombel Tujuan --</option>
              {data.filter(r => r.id !== selectedRombel?.id).map(r => (
                <option key={r.id} value={r.id}>{r.nama} ({r.jumlah_siswa} siswa)</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button onClick={() => setShowPindah(null)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={handlePindah} className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600">Pindahkan</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal edit siswa */}
      {showEditSiswa && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Edit Data Siswa</h2>
              <button onClick={() => setShowEditSiswa(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nama Lengkap *</label>
                <input value={editSiswaForm.nama} onChange={e => setEditSiswaForm({...editSiswaForm, nama: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">NIS</label>
                <input value={editSiswaForm.nis} onChange={e => setEditSiswaForm({...editSiswaForm, nis: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">NISN</label>
                <input value={editSiswaForm.nisn} onChange={e => setEditSiswaForm({...editSiswaForm, nisn: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowEditSiswa(null)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={handleEditSiswa} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
