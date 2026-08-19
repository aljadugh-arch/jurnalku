import { useEffect, useState } from 'react'
import { GraduationCap, Save, RefreshCw, List, Edit3, CheckCircle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface Siswa { id: string; nama: string; nis: string; rombel_id: string; rombel_nama?: string }
interface Rombel { id: string; nama: string }
interface RekapRow { id: string; nama: string; nis: string; rombel_nama: string; periode: string; jumlah_hadir: number; minimal_hadir: number; hasil: string }

export default function AbsensiJamaahPage() {
  const [siswa, setSiswa] = useState<Siswa[]>([])
  const [rombels, setRombels] = useState<Rombel[]>([])
  const [filterRombel, setFilterRombel] = useState('')
  const [nama, setNama] = useState('Shalat Jamaah')
  const [periode, setPeriode] = useState('')
  const [minimal, setMinimal] = useState(10)
  const [kehadiran, setKehadiran] = useState<Record<string, number>>({})
  const [rekap, setRekap] = useState<RekapRow[]>([])
  const [tab, setTab] = useState<'input' | 'rekap'>('input')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get('/siswa').then(r => { setSiswa(r.data); setKehadiran(Object.fromEntries(r.data.map((s: Siswa) => [s.id, 0]))) }).catch(() => toast.error('Gagal memuat siswa')),
      api.get('/rombel').then(r => setRombels(r.data)).catch(() => {})
    ]).finally(() => setLoading(false))
  }, [])

  const filtered = filterRombel ? siswa.filter(s => s.rombel_id === filterRombel) : siswa

  const setAll = (val: number) => setKehadiran(Object.fromEntries(filtered.map(s => [s.id, val])))

  const save = async () => {
    if (!periode) { toast.error('Isi periode rekap terlebih dahulu'); return }
    setSaving(true)
    try {
      const data = filtered.map(s => ({ siswa_id: s.id, jumlah_hadir: kehadiran[s.id] || 0 }))
      const r = await api.post('/jamaah/rekap-manual', { nama, periode, minimal_hadir: minimal, data })
      toast.success(r.data.message || `Tersimpan: ${r.data.count} data`)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const loadRekap = async () => {
    setLoading(true)
    try {
      const r = await api.get('/jamaah/rekap-manual', { params: { minimal_hadir: minimal } })
      setRekap(r.data.rows || [])
      setTab('rekap')
    } catch {
      toast.error('Gagal memuat rekap')
    } finally {
      setLoading(false)
    }
  }

  if (loading && siswa.length === 0) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Memuat data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in pb-28 lg:pb-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-sky-500 text-white rounded-3xl p-5 sm:p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Absensi Jamaah Sholat</h1>
        <p className="text-indigo-50 text-sm mt-1 max-w-2xl">Input jumlah kehadiran per siswa. Siswa dinyatakan lolos jika kehadiran ≥ batas minimal.</p>
      </div>

      {/* Config Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-5">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Nama Sesi</label>
            <input value={nama} onChange={e => setNama(e.target.value)} className="input" placeholder="Shalat Jamaah" />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Periode Rekap</label>
            <input value={periode} onChange={e => setPeriode(e.target.value)} className="input" placeholder="Contoh: 1-7 Agustus 2026" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Minimal Hadir</label>
            <input type="number" min={1} value={minimal} onChange={e => setMinimal(Number(e.target.value) || 1)} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Filter Rombel</label>
            <select value={filterRombel} onChange={e => setFilterRombel(e.target.value)} className="input">
              <option value="">Semua Rombel</option>
              {rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 sm:gap-3 mt-5 pt-5 border-t border-slate-100">
          <button onClick={() => setTab('input')} className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${tab === 'input' ? 'btn-primary' : 'btn-secondary'}`}>
            <Edit3 size={16} /> Input Data
          </button>
          <button onClick={loadRekap} className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${tab === 'rekap' ? 'btn-primary' : 'btn-secondary'}`}>
            <List size={16} /> Lihat Rekap
          </button>
          <div className="hidden sm:block flex-1" />
          <button onClick={() => setAll(minimal)} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium btn-secondary">
            Semua = Minimal ({minimal})
          </button>
          <button onClick={() => setAll(0)} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium btn-secondary">
            Reset (0)
          </button>
          {tab === 'input' && (
            <button onClick={save} disabled={saving} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium btn-success">
              <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Rekap'}
            </button>
          )}
        </div>
      </div>

      {/* Input Table */}
      {tab === 'input' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <GraduationCap size={18} className="text-slate-400" />
              <h2 className="font-semibold text-slate-800 leading-none">Daftar Siswa</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{filtered.length} siswa</span>
            </div>
          </div>
          <div className="max-h-[calc(100dvh-18rem)] min-h-[260px] overflow-auto p-3 sm:p-4">
            <table className="table-modern min-w-[760px] border-separate border-spacing-y-2">
              <thead>
                <tr>
                  <th style={{width: 56}} className="text-center">No</th>
                  <th className="pl-4">Nama Siswa</th>
                  <th style={{width: 120}} className="text-center">Hadir</th>
                  <th style={{width: 140}} className="text-center">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const jml = kehadiran[s.id] || 0
                  const lulus = jml >= minimal
                  return (
                    <tr key={s.id}>
                      <td className="text-center text-slate-500 font-medium">{i + 1}</td>
                      <td className="pl-4">
                        <div className="font-semibold text-slate-800 leading-tight">{s.nama}</div>
                        <div className="text-xs text-slate-400">{s.nis} • {s.rombel_nama || '-'}</div>
                      </td>
                      <td className="text-center">
                        <input
                          type="number"
                          min={0}
                          value={jml}
                          onChange={e => setKehadiran({ ...kehadiran, [s.id]: Number(e.target.value) || 0 })}
                          className="w-20 px-3 py-2 text-center border border-slate-200 rounded-xl text-sm font-semibold focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none"
                        />
                      </td>
                      <td className="text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${lulus ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {lulus ? <CheckCircle size={12} /> : <XCircle size={12} />}
                          {lulus ? 'Lolos' : 'Tidak Lolos'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rekap Table */}
      {tab === 'rekap' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <List size={18} className="text-slate-400" />
              <h2 className="font-semibold text-slate-800 leading-none">Rekap Kehadiran Jamaah</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{rekap.length} data</span>
            </div>
            <button onClick={loadRekap} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium btn-secondary"><RefreshCw size={14} /> Refresh</button>
          </div>
          <div className="max-h-[calc(100dvh-18rem)] min-h-[260px] overflow-auto p-3 sm:p-4">
            <table className="table-modern min-w-[760px] border-separate border-spacing-y-2">
              <thead>
                <tr>
                  <th style={{width: 56}} className="text-center">No</th>
                  <th className="pl-4">Nama Siswa</th>
                  <th className="text-center">Periode</th>
                  <th className="text-center" style={{width: 70}}>Hadir</th>
                  <th className="text-center" style={{width: 60}}>Min</th>
                  <th className="text-center" style={{width: 110}}>Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {rekap.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-14 text-slate-400">
                      Belum ada data rekap
                    </td>
                  </tr>
                ) : rekap.map((r, i) => (
                  <tr key={r.id || i}>
                    <td className="text-center text-slate-500 font-medium">{i + 1}</td>
                    <td className="pl-4">
                      <div className="font-semibold text-slate-800 leading-tight">{r.nama}</div>
                      <div className="text-xs text-slate-400">{r.nis} • {r.rombel_nama || '-'}</div>
                    </td>
                    <td className="text-center text-sm text-slate-600">{r.periode}</td>
                    <td className="text-center font-semibold text-slate-800">{r.jumlah_hadir}</td>
                    <td className="text-center text-slate-500">{r.minimal_hadir}</td>
                    <td className="text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${r.hasil === 'lolos' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {r.hasil === 'lolos' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                        {r.hasil === 'lolos' ? 'Lolos' : 'Tidak Lolos'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
