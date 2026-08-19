import { useState, useEffect, useRef } from 'react'
import { QrCode, CheckCircle, XCircle, AlertCircle, Clock, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { Html5Qrcode } from 'html5-qrcode'

const statusColors: Record<string, string> = {
  hadir: 'bg-green-100 text-green-700',
  sakit: 'bg-yellow-100 text-yellow-700',
  izin: 'bg-blue-100 text-blue-700',
  alpha: 'bg-red-100 text-red-700',
}

export default function AbsensiSiswaPage() {
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0])
  const [sesi, setSesi] = useState<'masuk' | 'pulang'>('masuk')
  const [rombels, setRombels] = useState<any[]>([])
  const [selectedRombel, setSelectedRombel] = useState('')
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [absensi, setAbsensi] = useState<Record<string, string>>({})
  const [existing, setExisting] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [range, setRange] = useState({ mulai: new Date().toISOString().split('T')[0], selesai: new Date().toISOString().split('T')[0], status: 'hadir' })
  const [qrToken, setQrToken] = useState('')
  const [qrOpen, setQrOpen] = useState(false)
  const [lastQr, setLastQr] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const qrRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    api.get('/rombel').then(res => {
      setRombels(res.data)
      if (res.data.length > 0) setSelectedRombel(res.data[0].id)
    })
  }, [])

  useEffect(() => {
    if (selectedRombel) loadData()
  }, [selectedRombel, tanggal, sesi])

  const loadData = async () => {
    const [siswaRes, absensiRes] = await Promise.all([
      api.get('/siswa', { params: { rombel_id: selectedRombel } }),
      api.get('/absensi-siswa', { params: { tanggal, rombel_id: selectedRombel } })
    ])
    setSiswaList(siswaRes.data)
    setExisting(absensiRes.data)
    const map: Record<string, string> = {}
    for (const a of absensiRes.data) { map[a.siswa_id] = sesi === 'pulang' ? (a.status_pulang || a.status || 'hadir') : a.status }
    setAbsensi(map)
  }

  const setStatus = (siswaId: string, status: string) => {
    setAbsensi(prev => ({ ...prev, [siswaId]: status }))
  }

  const setAll = (status: string) => setAbsensi(Object.fromEntries(siswaList.map(s => [s.id, status])))

  const handleRangeSave = async () => {
    if (!selectedRombel) return toast.error('Pilih rombel')
    setLoading(true)
    try { const r = await api.post('/absensi-siswa/bulk-range', { ...range, rombel_id: selectedRombel, jenis: sesi }); toast.success(`${r.data.count} absensi rentang tersimpan`) }
    catch (err: any) { toast.error(err.response?.data?.error || 'Gagal simpan rentang') }
    finally { setLoading(false) }
  }


  const stopQrCamera = async () => {
    try { await qrRef.current?.stop() } catch {}
    try { qrRef.current?.clear() } catch {}
    qrRef.current = null
    setQrOpen(false)
  }

  const startQrCamera = async () => {
    setQrOpen(true)
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode('qr-reader')
        qrRef.current = scanner
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, async text => {
          if (scanBusy || text === lastQr) return
          setScanBusy(true); setLastQr(text); setQrToken(text)
          try { const r = await api.post('/absensi-siswa/qr-scan', { token: text, sesi }); toast.success(`${r.data.siswa?.nama || 'Siswa'} hadir (${r.data.sesi})`); loadData() }
          catch (err: any) { toast.error(err.response?.data?.error || 'QR gagal') }
          finally { setTimeout(() => { setScanBusy(false); setLastQr('') }, 1200) }
        }, () => {})
      } catch (e: any) { toast.error('Kamera/QR tidak bisa dibuka'); setQrOpen(false) }
    }, 100)
  }

  const scanQrImage = async (file?: File) => {
    if (!file) return
    try {
      const scanner = new Html5Qrcode('qr-file-reader')
      const text = await scanner.scanFile(file, true)
      setQrToken(text)
      const r = await api.post('/absensi-siswa/qr-scan', { token: text, sesi })
      toast.success(`${r.data.siswa?.nama || 'Siswa'} hadir (${r.data.sesi})`)
      loadData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'QR foto gagal dibaca') }
  }

  const handleQrScan = async () => {
    if (!qrToken.trim()) return toast.error('Isi/scan token QR')
    try { const r = await api.post('/absensi-siswa/qr-scan', { token: qrToken.trim(), sesi }); toast.success(`${r.data.siswa?.nama || 'Siswa'} hadir (${r.data.sesi})`); setQrToken(''); loadData() }
    catch (err: any) { toast.error(err.response?.data?.error || 'QR gagal') }
  }

  const handleSave = async () => {
    const data = siswaList.map(s => ({
      siswa_id: s.id,
      status: absensi[s.id] || 'alpha',
      metode: 'manual',
    }))
    setLoading(true)
    try {
      await api.post('/absensi-siswa/bulk', { tanggal, rombel_id: selectedRombel, jenis: sesi, data })
      toast.success(`Absensi ${sesi} tersimpan`)
      loadData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal simpan') }
    finally { setLoading(false) }
  }

  const summary = {
    hadir: Object.values(absensi).filter(s => s === 'hadir').length,
    sakit: Object.values(absensi).filter(s => s === 'sakit').length,
    izin: Object.values(absensi).filter(s => s === 'izin').length,
    alpha: siswaList.length - Object.values(absensi).filter(s => s && s !== 'alpha').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Absensi Siswa</h1>
          <p className="text-gray-500 text-sm mt-1">QR Code & Manual oleh Wali Kelas</p>
        </div>
        <div className="flex gap-2">
          <button onClick={startQrCamera} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">
            <QrCode size={16} /> Scan Kamera
          </button>
          <button onClick={handleSave} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
            <Save size={16} /> {loading ? 'Menyimpan...' : 'Simpan Absensi'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{summary.hadir}</p>
          <p className="text-sm text-green-600">Hadir</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-yellow-700">{summary.sakit}</p>
          <p className="text-sm text-yellow-600">Sakit</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{summary.izin}</p>
          <p className="text-sm text-blue-600">Izin</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-700">{summary.alpha}</p>
          <p className="text-sm text-red-600">Alpha</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <select value={sesi} onChange={e => setSesi(e.target.value as 'masuk' | 'pulang')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="masuk">Sesi Masuk</option>
          <option value="pulang">Sesi Pulang</option>
        </select>
        <select value={selectedRombel} onChange={e => setSelectedRombel(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
          {rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
        </select>
        </div>
        <div className="flex flex-col lg:flex-row gap-3">
          <div id="qr-file-reader" className="hidden"></div><button onClick={startQrCamera} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm">Scan Kamera</button>
          <label className="px-4 py-2 bg-gray-100 rounded-lg text-sm cursor-pointer">Scan Foto<input type="file" accept="image/*" className="hidden" onChange={e => scanQrImage(e.target.files?.[0])} /></label>
          {['hadir','sakit','izin','alpha'].map(st => <button key={st} onClick={() => setAll(st)} className="px-3 py-2 bg-gray-100 rounded-lg text-sm capitalize">Semua {st}</button>)}
        </div>
        <div className="flex flex-col lg:flex-row gap-3">
          <input type="date" value={range.mulai} onChange={e => setRange({...range, mulai: e.target.value})} className="px-3 py-2 border rounded-lg text-sm" />
          <input type="date" value={range.selesai} onChange={e => setRange({...range, selesai: e.target.value})} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={range.status} onChange={e => setRange({...range, status: e.target.value})} className="px-3 py-2 border rounded-lg text-sm"><option value="hadir">Hadir</option><option value="sakit">Sakit</option><option value="izin">Izin</option><option value="alpha">Alpha</option></select>
          <button onClick={handleRangeSave} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Simpan Rentang Rombel</button>
        </div>
      </div>

      {qrOpen && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"><div className="bg-white rounded-2xl p-4 w-full max-w-sm"><p className="text-sm text-gray-600 mb-3">Kamera tetap terbuka. Arahkan ke QR KTS siswa berikutnya.</p><div id="qr-reader"></div><p className="text-xs text-gray-400 mt-2">Terakhir: {qrToken || '-'}</p><button onClick={stopQrCamera} className="mt-3 w-full px-4 py-2 bg-gray-800 text-white rounded-lg text-sm">Tutup</button></div></div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">No</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">NIS</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nama</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Hadir</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Sakit</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Izin</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Alpha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {siswaList.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Pilih rombel yang memiliki siswa</td></tr>
              )}
              {siswaList.map((s, i) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{s.nis}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{s.nama}</td>
                  {['hadir', 'sakit', 'izin', 'alpha'].map(st => (
                    <td key={st} className="text-center px-4 py-3">
                      <input type="radio" name={`abs-${s.id}`} checked={absensi[s.id] === st} onChange={() => setStatus(s.id, st)} className="w-4 h-4 text-primary" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
