import { useEffect, useMemo, useState } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { CreditCard, Search, Save, Trash2 } from 'lucide-react'

interface RfidSiswa { id: string; nis: string; nisn?: string; nama: string; rombel_id?: string; rombel_nama?: string; rfid_uid?: string | null }

// Pemetaan UID kartu RFID <-> siswa. Reader USB/Bluetooth (mode keyboard)
// mengirim UID; absensi tap memakai UID ini untuk mengenali siswa.
export default function RfidPage() {
  const [siswa, setSiswa] = useState<RfidSiswa[]>([])
  const [rombelList, setRombelList] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filterRombel, setFilterRombel] = useState('')
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (filterRombel) params.rombel_id = filterRombel
      const [s, r] = await Promise.all([api.get('/siswa/rfid', { params }), api.get('/rombel')])
      setSiswa(s.data); setRombelList(r.data)
    } catch { toast.error('Gagal memuat data RFID') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [filterRombel])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return siswa
    return siswa.filter(s => s.nama.toLowerCase().includes(q) || String(s.nis || '').includes(q))
  }, [siswa, search])

  const setUid = async (s: RfidSiswa) => {
    const uid = (edits[s.id] ?? s.rfid_uid ?? '').trim().toUpperCase()
    setBusyId(s.id)
    try {
      const { data } = await api.put(`/siswa/${s.id}/rfid`, { rfid_uid: uid })
      toast.success(uid ? `UID tersimpan untuk ${s.nama}` : `UID ${s.nama} dihapus`)
      setSiswa(list => list.map(x => x.id === s.id ? { ...x, rfid_uid: data.rfid_uid } : x))
      setEdits(e => { const n = { ...e }; delete n[s.id]; return n })
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menyimpan UID') } finally { setBusyId(null) }
  }
  const clearUid = async (s: RfidSiswa) => { setEdits(e => ({ ...e, [s.id]: '' })); await setUid({ ...s, rfid_uid: '' }) }

  const mapped = siswa.filter(s => s.rfid_uid).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-800">Kartu RFID Siswa</h1>
          <p className="text-sm text-gray-500 mt-1">Petakan UID kartu ke siswa untuk absensi tap kartu. Reader USB/Bluetooth mengirim UID otomatis.</p>
        </div>
        <span className="text-xs text-gray-400">{mapped} / {siswa.length} siswa sudah punya kartu</span>
      </div>

      <div className="card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama / NIS…" className="input pl-9" />
        </div>
        <select value={filterRombel} onChange={e => setFilterRombel(e.target.value)} className="input">
          <option value="">Semua Rombel</option>
          {rombelList.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
        </select>
      </div>

      <div className="card p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-left text-xs uppercase text-gray-600">
                <th className="px-3 py-2">NIS</th>
                <th className="px-3 py-2">Nama</th>
                <th className="px-3 py-2">Rombel</th>
                <th className="px-3 py-2">UID Kartu</th>
                <th className="px-3 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">Memuat…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">Tidak ada siswa.</td></tr>
              ) : filtered.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-500 font-mono">{s.nis || '-'}</td>
                  <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{s.nama}</td>
                  <td className="px-3 py-2 text-gray-500">{s.rombel_nama || '-'}</td>
                  <td className="px-3 py-2">
                    <input
                      value={edits[s.id] ?? (s.rfid_uid || '')}
                      onChange={e => setEdits(ed => ({ ...ed, [s.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') void setUid(s) }}
                      placeholder="Tap kartu / ketik UID"
                      className="w-48 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => void setUid(s)} disabled={busyId === s.id} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"><Save className="w-3.5 h-3.5" />Simpan</button>
                      {s.rfid_uid && <button onClick={() => void clearUid(s)} disabled={busyId === s.id} title="Hapus UID" className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3 flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" />Klik kolom UID lalu tap kartu pada reader — UID otomatis terisi, tekan Enter/Simpan.</p>
      </div>
    </div>
  )
}
