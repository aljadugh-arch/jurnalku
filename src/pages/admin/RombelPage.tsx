import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, X, Users, Download, Upload, Pencil, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import api from '../../services/api'
import { useSettingsStore } from '../../stores/settingsStore'
import BulkDeleteButton from '../../components/BulkDeleteButton'
import { tingkatOptions, PARALEL_ALFABET, PARALEL_NUMERIK, composeNama } from '../../lib/jenjang'

interface Rombel { id: string; nama: string; tingkat: string; tahun_ajaran: string; wali_kelas_id: string; wali_kelas_nama: string; kapasitas: number; jumlah_siswa: number }

export default function RombelPage() {
  const { settings } = useSettingsStore()
  const jenjang = (settings.jenjang as string) || ''
  const tOpts = tingkatOptions(jenjang)
  const [data, setData] = useState<Rombel[]>([])
  const [gtk, setGtk] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [siswa, setSiswa] = useState<any[]>([])
  const [paralelMode, setParalelMode] = useState<'alfabet' | 'numerik'>('alfabet')
  const [paralel, setParalel] = useState('A')
  const [selectedSiswa, setSelectedSiswa] = useState<Record<string, string[]>>({})
  const [form, setForm] = useState({ nama: '', tingkat: tOpts[0] || 'I', tahun_ajaran: '2024/2025', wali_kelas_id: '', kapasitas: 36 })
  const fileRef = useRef<HTMLInputElement>(null)

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['nama', 'tingkat', 'tahun_ajaran', 'kapasitas'],
      ['X-A', 'X', '2024/2025', 36],
      ['X-B', 'X', '2024/2025', 36],
      ['XI-A', 'XI', '2024/2025', 32],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rombel')
    XLSX.writeFile(wb, 'template_rombel.xlsx')
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const raw: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
      const rows = raw.map(r => ({ nama: r.nama, tingkat: r.tingkat, tahun_ajaran: r.tahun_ajaran, kapasitas: r.kapasitas }))
      if (!rows.length) { toast.error('File kosong'); return }
      const res = await api.post('/rombel/bulk', { rows })
      if (res.data.errors?.length) toast.error(`${res.data.count} berhasil, ${res.data.errors.length} gagal. ${res.data.errors[0]}`, { duration: 6000 })
      else toast.success(`${res.data.count} rombel diimport`)
      fetchData()
    } catch { toast.error('Gagal membaca file Excel') }
    finally { if (fileRef.current) fileRef.current.value = '' }
  }

  const fetchData = async () => {
    try {
      const [res, gtkRes, siswaRes] = await Promise.all([api.get('/rombel'), api.get('/gtk'), api.get('/siswa')])
      setData(res.data); setGtk(gtkRes.data); setSiswa(siswaRes.data)
    } catch { toast.error('Gagal memuat data') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const resetForm = () => { setEditId(null); setForm({ nama: '', tingkat: tOpts[0] || 'I', tahun_ajaran: '2024/2025', wali_kelas_id: '', kapasitas: 36 }); setParalel(paralelMode === 'numerik' ? '1' : 'A') }

  const openEdit = (r: Rombel) => {
    setEditId(r.id)
    setForm({ nama: r.nama, tingkat: r.tingkat, tahun_ajaran: r.tahun_ajaran, wali_kelas_id: r.wali_kelas_id || '', kapasitas: r.kapasitas || 36 })
    setParalel(r.nama.split('-').pop() || 'A')
    setShowModal(true)
  }

  const handleSave = async () => {
    const nama = editId ? form.nama : composeNama(jenjang, form.tingkat, paralel)
    if (!nama || !form.tingkat) { toast.error('Tingkat wajib'); return }
    if (!editId && data.some(r => r.nama.toLowerCase() === nama.toLowerCase() && r.tahun_ajaran === form.tahun_ajaran)) {
      toast.error(`Rombel "${nama}" sudah ada di tahun ${form.tahun_ajaran}`); return
    }
    try {
      const payload = { ...form, nama }
      if (editId) { await api.put('/rombel/' + editId, payload); toast.success('Rombel diperbarui') }
      else { await api.post('/rombel', payload); toast.success('Rombel berhasil ditambahkan') }
      setShowModal(false); resetForm(); fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal') }
  }

  const pindahSiswa = async (siswaId: string, rombelId: string) => {
    const s = siswa.find(x => x.id === siswaId)
    if (!s) return
    try {
      await api.put('/siswa/' + siswaId, { ...s, rombel_id: rombelId })
      toast.success('Siswa dipindahkan')
      fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal memindah siswa') }
  }

  const toggleSiswa = (rombelId: string, siswaId: string) => {
    setSelectedSiswa(prev => {
      const cur = prev[rombelId] || []
      return { ...prev, [rombelId]: cur.includes(siswaId) ? cur.filter(id => id !== siswaId) : [...cur, siswaId] }
    })
  }

  const pindahBanyakSiswa = async (rombelId: string) => {
    const ids = selectedSiswa[rombelId] || []
    if (ids.length === 0) { toast.error('Centang siswa dulu'); return }
    try {
      for (const id of ids) {
        const s = siswa.find(x => x.id === id)
        if (s) await api.put('/siswa/' + id, { ...s, rombel_id: rombelId })
      }
      toast.success(ids.length + ' siswa dimasukkan ke rombel')
      setSelectedSiswa(prev => ({ ...prev, [rombelId]: [] }))
      fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal memindah siswa') }
  }

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm('Hapus rombel ' + nama + '?')) return
    try { await api.delete('/rombel/' + id); toast.success('Berhasil dihapus'); fetchData() }
    catch { toast.error('Gagal menghapus') }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Rombongan Belajar</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola kelas dan rombel ({data.length} rombel)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
          <button onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
            <Download size={16} /> Template
          </button>
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg text-sm hover:bg-secondary-light">
            <Upload size={16} /> Import Excel
          </button>
          <button onClick={() => { resetForm(); setShowModal(true) }} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            <Plus size={16} /> Tambah Rombel
          </button>
          <BulkDeleteButton kategori="rombel" label="Rombel" onDone={fetchData} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? <p className="text-gray-400 col-span-3 text-center py-8">Memuat...</p> :
        data.length === 0 ? <p className="text-gray-400 col-span-3 text-center py-8">Belum ada rombel</p> :
        data.map(r => (
          <div key={r.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Users size={20} className="text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">{r.nama}</h3>
                  <p className="text-xs text-gray-500">Tingkat {r.tingkat} • {r.tahun_ajaran}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(r)} className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg" title="Edit rombel/wali kelas"><Pencil size={16} /></button>
                <button onClick={() => handleDelete(r.id, r.nama)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-gray-600"><span>Wali Kelas</span><span className="font-medium text-gray-800">{r.wali_kelas_nama || '-'}</span></div>
              <div className="flex justify-between text-gray-600"><span>Siswa</span><span className="font-medium text-gray-800">{r.jumlah_siswa}/{r.kapasitas}</span></div>
            </div>
            <div className="mt-3 bg-gray-100 rounded-full h-2">
              <div className="bg-primary h-2 rounded-full" style={{ width: Math.min(100, (r.jumlah_siswa / r.kapasitas) * 100) + '%' }} />
            </div>
            <div className="mt-4 border-t pt-3">
              <label className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-2"><UserPlus size={14} /> Masukkan siswa ke rombel</label>
              <select onChange={e => { if (e.target.value) { pindahSiswa(e.target.value, r.id); e.target.value = '' } }} className="w-full px-3 py-2 border rounded-lg text-sm" defaultValue="">
                <option value="">-- Pilih satu siswa cepat --</option>
                {siswa.filter(s => s.rombel_id !== r.id).map(s => <option key={s.id} value={s.id}>{s.nama} {s.rombel_id ? '(pindah)' : '(belum rombel)'}</option>)}
              </select>
              <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600">Centang banyak siswa</span>
                  <button onClick={() => pindahBanyakSiswa(r.id)} className="px-2 py-1 bg-primary text-white rounded text-xs hover:bg-primary-dark">Masukkan {selectedSiswa[r.id]?.length || 0}</button>
                </div>
                <div className="max-h-28 overflow-y-auto space-y-1">
                  {siswa.filter(s => s.rombel_id !== r.id).map(s => (
                    <label key={s.id} className="flex items-center gap-2 text-xs text-gray-700 bg-white rounded px-2 py-1 cursor-pointer hover:bg-primary/5">
                      <input type="checkbox" checked={(selectedSiswa[r.id] || []).includes(s.id)} onChange={() => toggleSiswa(r.id, s.id)} />
                      <span className="truncate">{s.nama} {s.rombel_id ? '(pindah)' : '(belum rombel)'}</span>
                    </label>
                  ))}
                  {siswa.filter(s => s.rombel_id !== r.id).length === 0 && <p className="text-xs text-gray-400 text-center py-2">Semua siswa sudah masuk rombel ini.</p>}
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-500 max-h-20 overflow-y-auto">
                {siswa.filter(s => s.rombel_id === r.id).map(s => <span key={s.id} className="inline-block mr-1 mb-1 px-2 py-1 bg-gray-100 rounded-full">{s.nama}</span>)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">{editId ? 'Edit Rombel & Wali Kelas' : 'Tambah Rombel'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              {editId && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nama Rombel</label>
                  <input value={form.nama} onChange={e => setForm({...form, nama: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              )}
              {!jenjang && (
                <div className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg p-2">
                  Jenjang belum diset. Buka Pengaturan → pilih jenjang (RA/MI/MTs/MA) agar tingkat & kelas otomatis sesuai.
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tingkat/Kelas *</label>
                  <select value={form.tingkat} onChange={e => setForm({...form, tingkat: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    {tOpts.map(t => <option key={t} value={t}>{jenjang === 'RA' ? `Kelas ${t}` : t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kapasitas</label>
                  <input type="number" value={form.kapasitas} onChange={e => setForm({...form, kapasitas: +e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              {!editId && jenjang !== 'RA' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kelas Paralel</label>
                  <div className="flex gap-2 mb-2">
                    <button type="button" onClick={() => { setParalelMode('alfabet'); setParalel('A') }} className={`px-3 py-1 rounded-lg text-xs border ${paralelMode === 'alfabet' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600'}`}>Alfabet (A,B,C)</button>
                    <button type="button" onClick={() => { setParalelMode('numerik'); setParalel('1') }} className={`px-3 py-1 rounded-lg text-xs border ${paralelMode === 'numerik' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600'}`}>Numerik (1,2,3)</button>
                  </div>
                  <select value={paralel} onChange={e => setParalel(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                    {(paralelMode === 'numerik' ? PARALEL_NUMERIK : PARALEL_ALFABET).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}
              <div className="text-xs bg-gray-50 rounded-lg p-2 text-gray-600">
                Nama rombel: <span className="font-semibold text-gray-800">{editId ? form.nama : composeNama(jenjang, form.tingkat, jenjang === 'RA' ? '' : paralel)}</span>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Tahun Ajaran</label><input value={form.tahun_ajaran} onChange={e => setForm({...form, tahun_ajaran: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Wali Kelas</label><select value={form.wali_kelas_id} onChange={e => setForm({...form, wali_kelas_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">-- Pilih --</option>{gtk.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}</select></div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={handleSave} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
