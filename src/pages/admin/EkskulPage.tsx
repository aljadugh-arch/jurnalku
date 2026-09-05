import { useState, useEffect } from 'react'
import { Calendar, CheckSquare, Edit, Plus, Search, Square, Trash2, Users, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface Ekskul {
  id: string; nama: string; pembina_id?: string; pembina_nama?: string
  hari?: string; jam_mulai?: string; jam_selesai?: string; deskripsi?: string; jumlah_anggota?: number
}

interface Siswa { id: string; nis?: string; nama: string; rombel_id?: string; rombel_nama?: string; status?: string }
interface Rombel { id: string; nama: string }

const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
const emptyForm = { nama: '', pembina_id: '', hari: '', jam_mulai: '', jam_selesai: '', deskripsi: '' }

export default function EkskulPage() {
  const [data, setData] = useState<Ekskul[]>([])
  const [gtk, setGtk] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [siswa, setSiswa] = useState<Siswa[]>([])
  const [rombels, setRombels] = useState<Rombel[]>([])
  const [memberEkskul, setMemberEkskul] = useState<Ekskul | null>(null)
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [memberSearch, setMemberSearch] = useState('')
  const [memberRombel, setMemberRombel] = useState('')
  const [memberLoading, setMemberLoading] = useState(false)
  const [memberSaving, setMemberSaving] = useState(false)

  const fetchData = async () => {
    try {
      const res = await api.get('/ekskul')
      setData(res.data)
    } catch { toast.error('Gagal memuat data ekskul') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchData()
    Promise.all([api.get('/gtk'), api.get('/siswa', { params: { status: 'aktif' } }), api.get('/rombel')])
      .then(([gtkRes, siswaRes, rombelRes]) => { setGtk(gtkRes.data); setSiswa(siswaRes.data); setRombels(rombelRes.data) })
      .catch(() => toast.error('Sebagian data pendukung gagal dimuat'))
  }, [])

  const openMembers = async (ekskul: Ekskul) => {
    setMemberEkskul(ekskul); setMemberSearch(''); setMemberRombel(''); setMemberLoading(true)
    try {
      const res = await api.get('/ekskul/' + ekskul.id + '/anggota')
      setSelectedMembers(new Set(res.data.map((item: Siswa) => item.id)))
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memuat anggota ekskul')
      setMemberEkskul(null)
    } finally { setMemberLoading(false) }
  }

  const visibleStudents = siswa.filter(s => {
    const query = memberSearch.trim().toLowerCase()
    const matchesSearch = !query || s.nama.toLowerCase().includes(query) || String(s.nis || '').toLowerCase().includes(query)
    return matchesSearch && (!memberRombel || s.rombel_id === memberRombel)
  })

  const toggleMember = (id: string) => setSelectedMembers(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const toggleVisibleMembers = () => setSelectedMembers(current => {
    const next = new Set(current)
    const allVisibleSelected = visibleStudents.length > 0 && visibleStudents.every(s => next.has(s.id))
    for (const s of visibleStudents) allVisibleSelected ? next.delete(s.id) : next.add(s.id)
    return next
  })

  const saveMembers = async () => {
    if (!memberEkskul) return
    setMemberSaving(true)
    try {
      await api.post('/ekskul/' + memberEkskul.id + '/anggota', { siswa_ids: [...selectedMembers] })
      toast.success(`${selectedMembers.size} anggota ${memberEkskul.nama} berhasil disimpan`)
      setMemberEkskul(null); fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal menyimpan anggota ekskul') }
    finally { setMemberSaving(false) }
  }

  const handleSave = async () => {
    if (!form.nama.trim()) { toast.error('Nama ekskul wajib diisi'); return }
    setSaving(true)
    try {
      if (editId) {
        await api.put('/ekskul/' + editId, form)
        toast.success('Ekskul berhasil diupdate')
      } else {
        await api.post('/ekskul', form)
        toast.success('Ekskul berhasil ditambahkan')
      }
      setShowModal(false); setEditId(null); setForm(emptyForm); fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal menyimpan') }
    finally { setSaving(false) }
  }

  const handleEdit = (e: Ekskul) => {
    setForm({
      nama: e.nama, pembina_id: e.pembina_id || '', hari: e.hari || '',
      jam_mulai: e.jam_mulai || '', jam_selesai: e.jam_selesai || '', deskripsi: e.deskripsi || ''
    })
    setEditId(e.id); setShowModal(true)
  }

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm('Hapus ekskul ' + nama + '?')) return
    try { await api.delete('/ekskul/' + id); toast.success('Berhasil dihapus'); fetchData() }
    catch { toast.error('Gagal menghapus') }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Ekstrakurikuler</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola kegiatan ekskul ({data.length} kegiatan)</p>
        </div>
        <button onClick={() => { setForm(emptyForm); setEditId(null); setShowModal(true) }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark self-start">
          <Plus size={16} /> Tambah Ekskul
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm text-center py-8">Memuat...</p>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 border border-gray-100">
          Belum ada ekskul. Klik "Tambah Ekskul" untuk membuat kegiatan pertama.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map(e => (
            <div key={e.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Users size={20} className="text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-800 truncate">{e.nama}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Pembina: {e.pembina_nama || 'TBA'}</p>
                    {e.hari && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                        <Calendar size={12} />
                        <span>{e.hari}{e.jam_mulai && e.jam_selesai ? ` • ${e.jam_mulai}-${e.jam_selesai}` : ''}</span>
                      </div>
                    )}
                    {e.deskripsi && <p className="text-xs text-gray-400 mt-2 line-clamp-2">{e.deskripsi}</p>}
                    <p className="text-xs font-medium text-purple-600 mt-2">{e.jumlah_anggota || 0} siswa mengikuti</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button aria-label={`Atur anggota ${e.nama}`} title="Atur Anggota" onClick={() => openMembers(e)} className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg"><Users size={16} /></button>
                  <button onClick={() => handleEdit(e)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit size={16} /></button>
                  <button onClick={() => handleDelete(e.id, e.nama)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {memberEkskul && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-800">Atur Anggota {memberEkskul.nama}</h2>
                <p className="text-sm text-gray-500 mt-0.5">Pilih siswa yang mengikuti kegiatan ini. Hanya siswa terpilih yang tampil di absensi.</p>
              </div>
              <button aria-label="Tutup pemilih anggota" onClick={() => setMemberEkskul(null)} className="p-1.5 hover:bg-gray-100 rounded-lg shrink-0"><X size={20} /></button>
            </div>
            <div className="p-4 sm:px-6 border-b space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
                <label className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Cari nama atau NIS" className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" /></label>
                <select value={memberRombel} onChange={e => setMemberRombel(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"><option value="">Semua Rombel</option>{rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}</select>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <button onClick={toggleVisibleMembers} disabled={!visibleStudents.length} className="inline-flex items-center gap-2 text-primary hover:underline disabled:text-gray-400 disabled:no-underline">{visibleStudents.length > 0 && visibleStudents.every(s => selectedMembers.has(s.id)) ? <CheckSquare size={17} /> : <Square size={17} />} Pilih semua yang tampil</button>
                <span className="font-medium text-gray-600">{selectedMembers.size} siswa dipilih</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
              {memberLoading ? (
                <p className="text-center text-sm text-gray-400 py-10">Memuat anggota...</p>
              ) : visibleStudents.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-10">Tidak ada siswa yang sesuai.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{visibleStudents.map(s => {
                  const selected = selectedMembers.has(s.id)
                  return <label key={s.id} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${selected ? 'border-primary bg-primary/5' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={selected} onChange={() => toggleMember(s.id)} aria-label={`Pilih ${s.nama} sebagai anggota ${memberEkskul.nama}`} className="h-4 w-4 rounded border-gray-300 text-primary" />
                    <div className="min-w-0"><p className="font-medium text-sm text-gray-800 truncate">{s.nama}</p><p className="text-xs text-gray-500 truncate">{s.nis || 'NIS -'} · {s.rombel_nama || 'Belum ada rombel'}</p></div>
                  </label>
                })}</div>
              )}
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-4 sm:px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setMemberEkskul(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Batal</button>
              <button onClick={saveMembers} disabled={memberSaving || memberLoading} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">{memberSaving ? 'Menyimpan...' : `Simpan ${selectedMembers.size} Anggota`}</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">{editId ? 'Edit' : 'Tambah'} Ekskul</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Nama Ekskul *</label>
                <input type="text" value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Pramuka, Tahfidz, Futsal, dll" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Pembina</label>
                <select value={form.pembina_id} onChange={e => setForm({ ...form, pembina_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">- Pilih Pembina -</option>
                  {gtk.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Hari</label>
                <select value={form.hari} onChange={e => setForm({ ...form, hari: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">- Pilih Hari -</option>
                  {HARI.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Jam Mulai</label>
                  <input type="time" value={form.jam_mulai} onChange={e => setForm({ ...form, jam_mulai: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Jam Selesai</label>
                  <input type="time" value={form.jam_selesai} onChange={e => setForm({ ...form, jam_selesai: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Deskripsi</label>
                <textarea value={form.deskripsi} onChange={e => setForm({ ...form, deskripsi: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
