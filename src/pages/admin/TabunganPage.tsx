import { useState, useEffect } from 'react'
import { Search, Plus, X, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface SaldoSiswa { id: string; nis: string; nisn?: string; nama: string; saldo: number; rombel_nama?: string }
interface Mutasi { id: string; tanggal: string; tipe: string; nominal: number; saldo_akhir: number; keterangan: string }

export default function TabunganPage() {
  const [saldoList, setSaldoList] = useState<SaldoSiswa[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedSiswa, setSelectedSiswa] = useState<SaldoSiswa | null>(null)
  const [mutasi, setMutasi] = useState<Mutasi[]>([])
  const [showTrx, setShowTrx] = useState(false)
  const [trxForm, setTrxForm] = useState({ siswa_id: '', tipe: 'setor', nominal: 0, keterangan: '' })
  const [editMutasi, setEditMutasi] = useState<Mutasi | null>(null)
  const [editForm, setEditForm] = useState({ nominal: 0, tipe: 'setor', keterangan: '' })

  const fetchSaldo = async () => {
    try { const res = await api.get('/tabungan/saldo'); setSaldoList(res.data) }
    catch { toast.error('Gagal memuat saldo') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchSaldo() }, [])

  const filtered = saldoList.filter(s =>
    s.nama.toLowerCase().includes(search.toLowerCase()) || (s.nis || '').includes(search) || (s.nisn || '').includes(search)
  )

  const totalSaldo = saldoList.reduce((t, s) => t + s.saldo, 0)

  const handleSelectSiswa = async (siswa: SaldoSiswa) => {
    setSelectedSiswa(siswa)
    setTrxForm(prev => ({ ...prev, siswa_id: siswa.id }))
    try { const res = await api.get('/tabungan', { params: { siswa_id: siswa.id } }); setMutasi(res.data) }
    catch { setMutasi([]) }
  }

  const reload = () => {
    fetchSaldo()
    if (selectedSiswa) handleSelectSiswa(selectedSiswa)
  }

  const handleTrx = async () => {
    if (!trxForm.siswa_id || trxForm.nominal <= 0) { toast.error('Pilih siswa dan nominal > 0'); return }
    try {
      await api.post('/tabungan', trxForm)
      toast.success(trxForm.tipe === 'setor' ? 'Setoran berhasil' : 'Penarikan berhasil')
      setShowTrx(false); setTrxForm({ siswa_id: '', tipe: 'setor', nominal: 0, keterangan: '' })
      reload()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal') }
  }

  const openEdit = (m: Mutasi) => {
    setEditMutasi(m)
    setEditForm({ nominal: m.nominal, tipe: m.tipe, keterangan: m.keterangan || '' })
  }

  const handleSaveEdit = async () => {
    if (!editMutasi) return
    if (!editForm.nominal || editForm.nominal <= 0) { toast.error('Nominal harus > 0'); return }
    try {
      await api.put('/tabungan/' + editMutasi.id, { nominal: Number(editForm.nominal), tipe: editForm.tipe, keterangan: editForm.keterangan })
      toast.success('Mutasi diperbarui')
      setEditMutasi(null)
      reload()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal') }
  }

  const handleDeleteMutasi = async (m: Mutasi) => {
    if (!confirm('Hapus mutasi ini? Saldo akan dihitung ulang.')) return
    try {
      await api.delete('/tabungan/' + m.id)
      toast.success('Mutasi dihapus')
      reload()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal') }
  }

  const fmt = (n: number) => 'Rp ' + Number(n||0).toLocaleString('id-ID')

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Tabungan Siswa</h1>
          <p className="text-gray-500 text-sm mt-1">Total saldo: {fmt(totalSaldo)}</p>
        </div>
        <button onClick={() => setShowTrx(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
          <Plus size={16} /> Transaksi Baru
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Cari siswa berdasarkan nama atau NIS..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b"><h3 className="font-medium text-gray-700">Daftar Saldo Siswa</h3></div>
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {loading ? <p className="px-4 py-8 text-center text-gray-400">Memuat...</p> :
            filtered.length === 0 ? <p className="px-4 py-8 text-center text-gray-400">Belum ada data</p> :
            filtered.map(s => (
              <div key={s.id} onClick={() => handleSelectSiswa(s)} className={'px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 ' + (selectedSiswa?.id === s.id ? 'bg-primary/5' : '')}>
                <div>
                  <p className="text-sm font-medium text-gray-800">{s.nama}</p>
                  <p className="text-xs text-gray-400">{s.nis || '-'} {s.rombel_nama ? '• ' + s.rombel_nama : ''}</p>
                </div>
                <p className={'text-sm font-bold ' + (s.saldo > 0 ? 'text-green-600' : 'text-gray-400')}>{fmt(s.saldo)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b"><h3 className="font-medium text-gray-700">Riwayat Mutasi {selectedSiswa ? '- ' + selectedSiswa.nama : ''}</h3></div>
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {!selectedSiswa ? <p className="px-4 py-8 text-center text-gray-400">Pilih siswa untuk melihat mutasi</p> :
            mutasi.length === 0 ? <p className="px-4 py-8 text-center text-gray-400">Belum ada transaksi</p> :
            mutasi.map(m => (
              <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className={'text-sm font-medium ' + (m.tipe === 'setor' ? 'text-green-700' : 'text-red-700')}>{m.tipe === 'setor' ? '+' : '-'} {fmt(m.nominal)}</p>
                  <p className="text-xs text-gray-400">{m.tanggal}{m.keterangan ? ' · ' + m.keterangan : ''}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <p className="text-xs text-gray-500 mr-2">{fmt(m.saldo_akhir)}</p>
                  <button onClick={() => openEdit(m)} className="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100" title="Edit"><Pencil size={13}/></button>
                  <button onClick={() => handleDeleteMutasi(m)} className="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100" title="Hapus"><Trash2 size={13}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal Edit Mutasi */}
      {editMutasi && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Edit Mutasi Tabungan</h2>
              <button onClick={() => setEditMutasi(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Jenis Transaksi</label>
                <select value={editForm.tipe} onChange={e => setEditForm({...editForm, tipe: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="setor">Setor</option>
                  <option value="tarik">Tarik</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nominal *</label>
                <input type="number" value={editForm.nominal} onChange={e => setEditForm({...editForm, nominal: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg text-sm" min={1} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Keterangan</label>
                <input value={editForm.keterangan} onChange={e => setEditForm({...editForm, keterangan: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Opsional" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditMutasi(null)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={handleSaveEdit} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Transaksi Baru */}
      {showTrx && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Transaksi Tabungan</h2>
              <button onClick={() => setShowTrx(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Siswa</label>
                <select value={trxForm.siswa_id} onChange={e => setTrxForm({...trxForm, siswa_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Pilih Siswa --</option>
                  {saldoList.map(s => <option key={s.id} value={s.id}>{s.nama} ({s.nis})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Jenis</label>
                <select value={trxForm.tipe} onChange={e => setTrxForm({...trxForm, tipe: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="setor">Setor</option>
                  <option value="tarik">Tarik</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nominal</label>
                <input type="number" value={trxForm.nominal || ''} onChange={e => setTrxForm({...trxForm, nominal: Number(e.target.value)})} placeholder="0" className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Keterangan</label>
                <input value={trxForm.keterangan} onChange={e => setTrxForm({...trxForm, keterangan: e.target.value})} placeholder="Opsional" className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowTrx(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={handleTrx} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
