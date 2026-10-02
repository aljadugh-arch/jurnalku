import { useEffect, useState } from 'react'
import { Download, FileSpreadsheet, GraduationCap, Save, RefreshCw, List, Edit3, CheckCircle, XCircle, Clock, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'
import * as XLSX from 'xlsx'
import { useSettingsStore } from '../../stores/settingsStore'
import { tenantExportFilename, tenantIdentity } from '../../utils/tenantExport'

interface Siswa { id: string; nama: string; nis: string; rombel_id: string; rombel_nama?: string }
interface Rombel { id: string; nama: string }
interface RekapRow { id: string; nama: string; nis: string; rombel_nama: string; periode: string; jumlah_hadir: number; minimal_hadir: number; hasil: string }

export default function AbsensiJamaahPage() {
  const settings = useSettingsStore(s => s.settings)
  const tenant = tenantIdentity(settings)
  const [siswa, setSiswa] = useState<Siswa[]>([])
  const [rombels, setRombels] = useState<Rombel[]>([])
  const [filterRombel, setFilterRombel] = useState('')
  const [nama, setNama] = useState('Shalat Jamaah')
  const [periode, setPeriode] = useState('')
  const [minimal, setMinimal] = useState(10)
  const [kehadiran, setKehadiran] = useState<Record<string, number>>({})
  const [rekap, setRekap] = useState<RekapRow[]>([])
  const [tab, setTab] = useState<'status' | 'input' | 'rekap'>('status')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // Input status harian (hadir/izin/sakit/alpha) per sesi + tanggal.
  const [sesiList, setSesiList] = useState<{ id: string; nama: string; mulai: string; selesai: string }[]>([])
  const [selectedSesi, setSelectedSesi] = useState('')
  const [sesiTanggal, setSesiTanggal] = useState(todayWib())
  const [statusAbsensi, setStatusAbsensi] = useState<Record<string, string>>({})
  const [showAddSesi, setShowAddSesi] = useState(false)
  const [newSesiNama, setNewSesiNama] = useState('Shalat Jamaah')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get('/siswa').then(r => { setSiswa(r.data); setKehadiran(Object.fromEntries(r.data.map((s: Siswa) => [s.id, 0]))) }).catch(() => toast.error('Gagal memuat siswa')),
      api.get('/rombel').then(r => setRombels(r.data)).catch(() => {})
    ]).finally(() => setLoading(false))
  }, [])

  const loadSesi = async () => {
    try {
      const r = await api.get('/jamaah/sesi')
      setSesiList(r.data)
      if (r.data.length > 0 && !selectedSesi) setSelectedSesi(r.data[0].id)
    } catch { setSesiList([]) }
  }

  useEffect(() => { loadSesi() }, [])

  const loadStatusAbsensi = async () => {
    if (!selectedSesi) { setStatusAbsensi({}); return }
    try {
      const r = await api.get('/jamaah/absensi', { params: { sesi_id: selectedSesi, tanggal: sesiTanggal } })
      const map: Record<string, string> = {}
      r.data.forEach((a: any) => { map[a.siswa_id] = a.status })
      setStatusAbsensi(map)
    } catch { setStatusAbsensi({}) }
  }

  useEffect(() => { loadStatusAbsensi() }, [selectedSesi, sesiTanggal])

  const setStatus = (siswaId: string, status: string) => setStatusAbsensi(prev => ({ ...prev, [siswaId]: status }))

  const saveStatus = async () => {
    if (!selectedSesi) { toast.error('Pilih/buat sesi jamaah terlebih dahulu'); return }
    setSaving(true)
    try {
      const data = siswa.map(s => ({ siswa_id: s.id, status: statusAbsensi[s.id] || 'hadir' }))
      const r = await api.post('/jamaah/absensi', { sesi_id: selectedSesi, tanggal: sesiTanggal, data })
      toast.success(`Absensi jamaah tersimpan: ${r.data.count} siswa`)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan')
    } finally { setSaving(false) }
  }

  const createSesi = async () => {
    if (!newSesiNama.trim()) return
    try {
      const r = await api.post('/jamaah/sesi-baru', { nama: newSesiNama, mulai: sesiTanggal, selesai: sesiTanggal })
      toast.success('Sesi jamaah dibuat')
      setShowAddSesi(false)
      setNewSesiNama('Shalat Jamaah')
      await loadSesi()
      setSelectedSesi(r.data.id)
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal membuat sesi') }
  }

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

  const exportExcel = async () => {
    const rows = rekap.length ? rekap : (await api.get('/jamaah/rekap-manual', { params: { minimal_hadir: minimal } })).data.rows || []
    const ws = XLSX.utils.aoa_to_sheet([
      ['REKAP ABSENSI JAMAAH'],
      [tenant.name],
      tenant.address ? [tenant.address] : [],
      ['Nama Sesi', nama, 'Periode', periode || '-'],
      [],
      ['No', 'Nama Lengkap', 'NIS', 'Rombel', 'Periode', 'Hadir', 'Minimal', 'Keterangan'],
      ...rows.map((r: RekapRow, i: number) => [i+1, r.nama, r.nis, r.rombel_nama || '', r.periode, r.jumlah_hadir, r.minimal_hadir, r.hasil === 'lolos' ? 'Lolos' : 'Tidak Lolos'])
    ])
    ws['!cols'] = [{wch:5},{wch:28},{wch:16},{wch:14},{wch:24},{wch:10},{wch:10},{wch:16}]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Rekap Jamaah')
    wb.Props = { Title: 'Rekapitulasi Absensi Jamaah', Author: tenant.name, Company: tenant.name }
    XLSX.writeFile(wb, tenantExportFilename('Rekap_Absensi_Jamaah', tenant.name, todayWib(), 'xlsx'))
    toast.success('Excel rekap jamaah diunduh')
  }

  const exportPDF = async () => {
    const rows = rekap.length ? rekap : (await api.get('/jamaah/rekap-manual', { params: { minimal_hadir: minimal } })).data.rows || []
    const w = window.open('', '_blank')
    if (!w) { toast.error('Popup blocked'); return }
    const body = rows.map((r: RekapRow, i: number) => `<tr><td>${i+1}</td><td class="nama">${r.nama || ''}</td><td>${r.nis || ''}</td><td>${r.rombel_nama || ''}</td><td>${r.periode || ''}</td><td>${r.jumlah_hadir || 0}</td><td>${r.minimal_hadir || minimal}</td><td>${r.hasil === 'lolos' ? 'Lolos' : 'Tidak Lolos'}</td></tr>`).join('')
    const title = tenantExportFilename('Rekap_Absensi_Jamaah', tenant.name, todayWib(), 'pdf').replace(/\.pdf$/, '')
    const logo = tenant.logo ? `<img src="${tenant.logo}" alt="Logo" onerror="this.style.display='none'">` : ''
    w.document.write(`<!doctype html><html><head><title>${title}</title><meta name="author" content="${tenant.name}"><style>@page{size:landscape;margin:8mm}body{font-family:Arial,sans-serif;font-size:10px;color:#000}.kop{display:flex;justify-content:center;align-items:center;gap:12px;border-bottom:2px solid #000;padding-bottom:7px}.kop img{width:58px;height:58px;object-fit:contain}h2,h3{text-align:center;margin:2px}.meta{font-weight:bold;margin:10px 0}.hl{background:#ffeb3b;padding:2px 12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:4px;text-align:center}.nama{text-align:left;min-width:180px}th{background:#e5e7eb}</style></head><body><div class="kop">${logo}<div><h2>${tenant.name}</h2>${tenant.address ? `<div>${tenant.address}</div>` : ''}<h3>REKAPITULASI ABSENSI JAMAAH</h3></div></div><div class="meta">SESI: <span class="hl">${nama}</span> &nbsp; PERIODE: <span class="hl">${periode || '-'}</span></div><table><thead><tr><th>NO</th><th>NAMA LENGKAP</th><th>NIS</th><th>ROMBEL</th><th>PERIODE</th><th>HADIR</th><th>MIN</th><th>KETERANGAN</th></tr></thead><tbody>${body}</tbody></table><script>setTimeout(()=>window.print(),400)<\/script></body></html>`)
    w.document.close()
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
        <p className="text-indigo-50 text-sm mt-1 max-w-2xl">Input absensi jamaah: status harian (hadir/izin/sakit/alpha) atau rekap jumlah kehadiran. Siswa dinyatakan lolos jika kehadiran ≥ batas minimal.</p>
      </div>

      {/* Config Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-5">
          {tab === 'status' ? (
            <>
              <div className="lg:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Sesi Jamaah</label>
                <select value={selectedSesi} onChange={e => setSelectedSesi(e.target.value)} className="block w-full h-11 px-3 pr-9 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                  {sesiList.length === 0 && <option value="">Belum ada sesi</option>}
                  {sesiList.map(s => <option key={s.id} value={s.id}>{s.nama}{s.mulai ? ` (${s.mulai})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Tanggal</label>
                <input type="date" value={sesiTanggal} onChange={e => setSesiTanggal(e.target.value)} className="block w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Sesi Baru</label>
                <button onClick={() => setShowAddSesi(true)} className="inline-flex items-center justify-center gap-2 w-full h-11 px-3 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 text-indigo-700 text-sm font-medium hover:bg-indigo-50"><Plus size={16} /> Buat Sesi</button>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Filter Rombel</label>
                <select value={filterRombel} onChange={e => setFilterRombel(e.target.value)} className="block w-full h-11 px-3 pr-9 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                  <option value="">Semua Rombel</option>
                  {rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Nama Sesi</label>
                <input value={nama} onChange={e => setNama(e.target.value)} className="block w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="Shalat Jamaah" />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Periode Rekap</label>
                <input value={periode} onChange={e => setPeriode(e.target.value)} className="block w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="Contoh: 1-7 Agustus 2026" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Minimal Hadir</label>
                <input type="number" min={1} value={minimal} onChange={e => setMinimal(Number(e.target.value) || 1)} className="block w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Filter Rombel</label>
                <select value={filterRombel} onChange={e => setFilterRombel(e.target.value)} className="block w-full h-11 px-3 pr-9 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                  <option value="">Semua Rombel</option>
                  {rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
                </select>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center gap-2.5 sm:gap-3 mt-5 pt-5 border-t border-slate-100">
          <button onClick={() => setTab('status')} className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${tab === 'status' ? 'btn-primary' : 'btn-secondary'}`}>
            <Edit3 size={16} /> Input Harian
          </button>
          <button onClick={() => setTab('input')} className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${tab === 'input' ? 'btn-primary' : 'btn-secondary'}`}>
            <Edit3 size={16} /> Input Jumlah
          </button>
          <button onClick={loadRekap} className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${tab === 'rekap' ? 'btn-primary' : 'btn-secondary'}`}>
            <List size={16} /> Lihat Rekap
          </button>
          <div className="hidden sm:block flex-1" />
          {tab === 'input' && (
            <>
              <button onClick={() => setAll(minimal)} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium btn-secondary">
                Semua = Minimal ({minimal})
              </button>
              <button onClick={() => setAll(0)} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium btn-secondary">
                Reset (0)
              </button>
              <button onClick={save} disabled={saving} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium btn-success">
                <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Rekap'}
              </button>
            </>
          )}
          {tab === 'status' && (
            <button onClick={saveStatus} disabled={saving || !selectedSesi} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium btn-success disabled:opacity-50">
              <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Absensi'}
            </button>
          )}
        </div>
      </div>

      {/* Status Input Table (hadir/izin/sakit/alpha) */}
      {tab === 'status' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <GraduationCap size={18} className="text-slate-400" />
              <h2 className="font-semibold text-slate-800 leading-none">Kehadiran Jamaah</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{filtered.length} siswa</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><CheckCircle size={14} className="text-green-600" /> Hadir</span>
              <span className="inline-flex items-center gap-1"><Clock size={14} className="text-blue-600" /> Izin</span>
              <span className="inline-flex items-center gap-1"><Clock size={14} className="text-yellow-600" /> Sakit</span>
              <span className="inline-flex items-center gap-1"><XCircle size={14} className="text-red-600" /> Alpha</span>
            </div>
          </div>
          <div className="max-h-[calc(100dvh-20rem)] min-h-[260px] overflow-auto p-3 sm:p-4">
            <table className="table-modern min-w-[760px] border-separate border-spacing-y-2">
              <thead>
                <tr>
                  <th style={{ width: 56 }} className="text-center">No</th>
                  <th className="pl-4">Nama Siswa</th>
                  <th style={{ width: 70 }} className="text-center">Hadir</th>
                  <th style={{ width: 70 }} className="text-center">Izin</th>
                  <th style={{ width: 70 }} className="text-center">Sakit</th>
                  <th style={{ width: 70 }} className="text-center">Alpha</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-14 text-slate-400">Tidak ada data siswa</td></tr>}
                {filtered.map((s, i) => (
                  <tr key={s.id}>
                    <td className="text-center text-slate-500 font-medium">{i + 1}</td>
                    <td className="pl-4">
                      <div className="font-semibold text-slate-800 leading-tight">{s.nama}</div>
                      <div className="text-xs text-slate-400">{s.nis} • {s.rombel_nama || '-'}</div>
                    </td>
                    {(['hadir', 'izin', 'sakit', 'alpha'] as const).map(status => {
                      const active = (statusAbsensi[s.id] || 'hadir') === status
                      const color = status === 'hadir' ? 'text-green-700 bg-green-100' : status === 'izin' ? 'text-blue-700 bg-blue-100' : status === 'sakit' ? 'text-yellow-700 bg-yellow-100' : 'text-red-700 bg-red-100'
                      return (
                        <td key={status} className="text-center">
                          <button onClick={() => setStatus(s.id, status)} aria-label={`${status} ${s.nama}`} className={`p-2 rounded-full transition ${active ? color : 'text-slate-300 hover:text-slate-500'}`}>
                            {status === 'hadir' ? <CheckCircle size={20} /> : status === 'alpha' ? <XCircle size={20} /> : <Clock size={20} />}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Sesi Modal */}
      {showAddSesi && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddSesi(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-800 mb-4">Buat Sesi Jamaah</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Nama Sesi</label>
                <input value={newSesiNama} onChange={e => setNewSesiNama(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" placeholder="Shalat Jamaah" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Tanggal Mulai</label>
                <input type="date" value={sesiTanggal} onChange={e => setSesiTanggal(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAddSesi(false)} className="px-4 py-2 text-slate-600 bg-slate-100 rounded-lg text-sm">Batal</button>
              <button onClick={createSesi} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Simpan</button>
            </div>
          </div>
        </div>
      )}

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
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto"><button onClick={exportExcel} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 text-white"><FileSpreadsheet size={14} /> Excel</button><button onClick={exportPDF} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-red-600 text-white"><Download size={14} /> PDF</button><button onClick={loadRekap} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium btn-secondary"><RefreshCw size={14} /> Refresh</button></div>
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
