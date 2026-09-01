import { useState, useEffect, useRef } from 'react'
import { QrCode, CheckCircle, XCircle, AlertCircle, Clock, Download, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'
import { Html5Qrcode } from 'html5-qrcode'
import JSZip from 'jszip'
import { QRCodeCanvas } from 'qrcode.react'
import FoundationTenantPicker from '../../components/FoundationTenantPicker'

const statusColors: Record<string, string> = {
  hadir: 'bg-green-100 text-green-700',
  sakit: 'bg-yellow-100 text-yellow-700',
  izin: 'bg-blue-100 text-blue-700',
  alpha: 'bg-red-100 text-red-700',
}

const safeFilePart = (value: string) => value.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'siswa'

const canvasToBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG QR gagal dibuat')), 'image/png')
})

const buildStudentQrPng = async (student: any) => {
  const source = document.getElementById(`student-qr-${student.id}`) as HTMLCanvasElement | null
  if (!source) throw new Error('QR belum selesai dimuat')
  const output = document.createElement('canvas')
  output.width = 720
  output.height = 880
  const context = output.getContext('2d')
  if (!context) throw new Error('Browser tidak mendukung unduh QR')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, output.width, output.height)
  context.fillStyle = '#111827'
  context.textAlign = 'center'
  context.font = '700 38px sans-serif'
  context.fillText('QR SISWA', output.width / 2, 62)
  context.drawImage(source, 80, 100, 560, 560)
  context.font = '700 32px sans-serif'
  context.fillText(String(student.nama || 'Siswa').slice(0, 38), output.width / 2, 720)
  context.fillStyle = '#4b5563'
  context.font = '24px sans-serif'
  context.fillText(`${student.identifier_type}: ${student.identifier}`, output.width / 2, 768)
  context.font = '20px sans-serif'
  context.fillText('Gunakan QR ini untuk absensi siswa', output.width / 2, 818)
  return canvasToBlob(output)
}

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function AbsensiSiswaPage() {
  const [tanggal, setTanggal] = useState(todayWib())
  const [sesi, setSesi] = useState<'masuk' | 'pulang'>('masuk')
  const [rombels, setRombels] = useState<any[]>([])
  const [selectedRombel, setSelectedRombel] = useState('')
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [absensi, setAbsensi] = useState<Record<string, string>>({})
  const [existing, setExisting] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [range, setRange] = useState({ mulai: todayWib(), selesai: todayWib(), status: 'hadir' })
  const [qrToken, setQrToken] = useState('')
  const [qrOpen, setQrOpen] = useState(false)
  const [lastQr, setLastQr] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [qrIdentifiers, setQrIdentifiers] = useState<any[]>([])
  const [showQr, setShowQr] = useState(false)
  const [foundationTenantId, setFoundationTenantId] = useState<string | null>(null)
  const [kbmStatus, setKbmStatus] = useState({ aktif: false, libur: false, loading: true })
  const qrRef = useRef<Html5Qrcode | null>(null)
  const scanBusyRef = useRef(false)
  const lastQrRef = useRef('')
  const cameraStartingRef = useRef(false)

  useEffect(() => {
    api.get('/rombel').then(res => {
      setRombels(res.data)
      if (res.data.length > 0) setSelectedRombel(res.data[0].id)
    })
  }, [])

  useEffect(() => {
    if (selectedRombel) loadData()
  }, [selectedRombel, tanggal, sesi, foundationTenantId])

  useEffect(() => {
    if (!selectedRombel) return setQrIdentifiers([])
    api.get('/siswa/qr-identifiers', { params: { rombel_id: selectedRombel } })
      .then(res => setQrIdentifiers(res.data))
      .catch(() => setQrIdentifiers([]))
  }, [selectedRombel])

  useEffect(() => {
    setKbmStatus(status => ({ ...status, loading: true }))
    api.get('/kalender-kbm/status', { params: { tanggal } })
      .then(res => setKbmStatus({ aktif: !!res.data.aktif, libur: !!res.data.libur, loading: false }))
      .catch(() => setKbmStatus({ aktif: false, libur: false, loading: false }))
  }, [tanggal])

  const loadData = async () => {
    try {
      const params: any = { tanggal, rombel_id: selectedRombel }
      if (foundationTenantId && foundationTenantId !== 'all') {
        params.tenant_id = foundationTenantId
      }
      const [siswaRes, absensiRes] = await Promise.all([
        api.get(foundationTenantId ? '/foundation/students' : '/siswa', { params: { rombel_id: selectedRombel, ...params } }),
        api.get('/absensi-siswa', { params })
      ])
      setSiswaList(siswaRes.data)
      setExisting(absensiRes.data)
      const map: Record<string, string> = {}
      for (const a of absensiRes.data) { map[a.siswa_id] = sesi === 'pulang' ? (a.status_pulang || a.status || 'hadir') : a.status }
      setAbsensi(map)
    } catch { toast.error('Gagal memuat data absensi') }
  }

  const setStatus = (siswaId: string, status: string) => {
    setAbsensi(prev => ({ ...prev, [siswaId]: status }))
  }

  const setAll = (status: string) => setAbsensi(Object.fromEntries(siswaList.map(s => [s.id, status])))

  const handleRangeSave = async () => {
    if (!kbmStatus.aktif && range.mulai === range.selesai && range.mulai === tanggal) return toast.error(kbmStatus.libur ? 'Hari libur: absensi nonaktif' : 'Aktifkan KBM tanggal ini di Kalender KBM terlebih dahulu')
    if (!selectedRombel) return toast.error('Pilih rombel')
    setLoading(true)
    try { const r = await api.post('/absensi-siswa/bulk-range', { ...range, rombel_id: selectedRombel, jenis: sesi }); toast.success(`${r.data.count} absensi rentang tersimpan`) }
    catch (err: any) { toast.error(err.response?.data?.error || 'Gagal simpan rentang') }
    finally { setLoading(false) }
  }


  const stopQrCamera = async () => {
    cameraStartingRef.current = false
    scanBusyRef.current = false
    lastQrRef.current = ''
    try { await qrRef.current?.stop() } catch {}
    try { qrRef.current?.clear() } catch {}
    qrRef.current = null
    setScanBusy(false)
    setLastQr('')
    setQrOpen(false)
  }

  const startQrCamera = async () => {
    if (!kbmStatus.aktif) return toast.error(kbmStatus.libur ? 'Hari libur: absensi nonaktif' : 'Aktifkan KBM tanggal ini di Kalender KBM terlebih dahulu')
    if (qrRef.current || cameraStartingRef.current) return
    cameraStartingRef.current = true
    setQrOpen(true)
    setTimeout(async () => {
      try {
        if (!cameraStartingRef.current) return
        const scanner = new Html5Qrcode('qr-reader')
        qrRef.current = scanner
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, async text => {
          const normalized = text.trim()
          if (scanBusyRef.current || normalized === lastQrRef.current) return
          scanBusyRef.current = true
          lastQrRef.current = normalized
          setScanBusy(true); setLastQr(normalized); setQrToken(normalized)
          try { const r = await api.post('/absensi-siswa/qr-scan', { token: normalized, sesi }); toast.success(r.data.already ? `${r.data.siswa?.nama || 'Siswa'} sudah tercatat` : `${r.data.siswa?.nama || 'Siswa'} hadir (${r.data.sesi})`); loadData() }
          catch (err: any) { toast.error(err.response?.data?.error || 'QR gagal') }
          finally { window.setTimeout(() => { scanBusyRef.current = false; lastQrRef.current = ''; setScanBusy(false); setLastQr('') }, 1200) }
        }, () => {})
        cameraStartingRef.current = false
      } catch (e: any) { cameraStartingRef.current = false; qrRef.current = null; toast.error('Kamera/QR tidak bisa dibuka'); setQrOpen(false) }
    }, 100)
  }

  const submitQrToken = async (rawToken: string) => {
    const token = rawToken.trim()
    if (!token || scanBusyRef.current || token === lastQrRef.current) return
    scanBusyRef.current = true
    lastQrRef.current = token
    setScanBusy(true)
    setLastQr(token)
    setQrToken(token)
    try {
      const r = await api.post('/absensi-siswa/qr-scan', { token, sesi })
      toast.success(r.data.already ? `${r.data.siswa?.nama || 'Siswa'} sudah tercatat` : `${r.data.siswa?.nama || 'Siswa'} hadir (${r.data.sesi})`)
      await loadData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'QR gagal') }
    finally { window.setTimeout(() => { scanBusyRef.current = false; lastQrRef.current = ''; setScanBusy(false); setLastQr('') }, 1200) }
  }

  const scanQrImage = async (file?: File) => {
    if (!file || scanBusyRef.current) return
    try {
      const scanner = new Html5Qrcode('qr-file-reader')
      const text = await scanner.scanFile(file, true)
      await submitQrToken(text)
      try { scanner.clear() } catch {}
    } catch (err: any) { toast.error(err.response?.data?.error || 'QR foto gagal dibaca') }
  }

  const handleQrScan = async () => {
    if (!kbmStatus.aktif) return toast.error(kbmStatus.libur ? 'Hari libur: absensi nonaktif' : 'Aktifkan KBM tanggal ini di Kalender KBM terlebih dahulu')
    if (!qrToken.trim()) return toast.error('Isi/scan token QR')
    await submitQrToken(qrToken)
    setQrToken('')
  }

  const handleSave = async () => {
    if (!kbmStatus.aktif) return toast.error(kbmStatus.libur ? 'Hari libur: absensi nonaktif' : 'Aktifkan KBM tanggal ini di Kalender KBM terlebih dahulu')
    if (!selectedRombel || siswaList.length === 0) return toast.error('Pilih rombel yang memiliki siswa')
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

  const downloadStudentQr = async (student: any) => {
    try {
      const blob = await buildStudentQrPng(student)
      saveBlob(blob, `qr-${safeFilePart(student.nama)}-${safeFilePart(student.identifier)}.png`)
    } catch (err: any) { toast.error(err.message || 'Gagal mengunduh QR') }
  }

  const downloadAllStudentQr = async () => {
    if (!qrIdentifiers.length) return toast.error('Belum ada QR siswa untuk diunduh')
    const zip = new JSZip()
    setLoading(true)
    try {
      for (const student of qrIdentifiers) {
        const blob = await buildStudentQrPng(student)
        zip.file(`qr-${safeFilePart(student.nama)}-${safeFilePart(student.identifier)}.png`, blob)
      }
      const rombel = rombels.find(r => r.id === selectedRombel)?.nama || 'rombel'
      saveBlob(await zip.generateAsync({ type: 'blob' }), `qr-siswa-${safeFilePart(rombel)}.zip`)
      toast.success(`${qrIdentifiers.length} QR siswa berhasil diunduh`)
    } catch (err: any) { toast.error(err.message || 'Gagal mengunduh semua QR') }
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
        <div className="flex flex-wrap gap-2">
          <button onClick={startQrCamera} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">
            <QrCode size={16} /> Scan Kamera
          </button>
          <button onClick={() => setShowQr(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-purple-300 text-purple-700 rounded-lg text-sm hover:bg-purple-50">
            <QrCode size={16} /> Lihat QR Siswa
          </button>
          <button onClick={handleSave} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
            <Save size={16} /> {loading ? 'Menyimpan...' : 'Simpan Absensi'}
          </button>
        </div>
      </div>

      {/* Foundation Tenant Picker (Cross-tenant data) */}
      <FoundationTenantPicker
        selectedTenantId={foundationTenantId}
        onSelectTenant={setFoundationTenantId}
        placeholder="Data lokal (lembaga ini)"
        allOptionLabel="Semua lembaga yayasan (gabungan)"
      />

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

      {!kbmStatus.loading && !kbmStatus.aktif && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {kbmStatus.libur ? 'Tanggal ini ditandai sebagai hari libur. Absensi tidak dapat disimpan.' : 'KBM tanggal ini belum diaktifkan. Buka Kalender KBM dan tambahkan event “KBM Aktif” sebelum menyimpan absensi manual atau memindai QR.'}
        </div>
      )}

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
          <div id="qr-file-reader" className="hidden"></div><button onClick={startQrCamera} className="w-full lg:w-auto px-4 py-2 bg-purple-600 text-white rounded-lg text-sm text-center">Scan Kamera</button>
          <label className="flex w-full lg:w-auto items-center justify-center px-4 py-2 bg-gray-100 rounded-lg text-sm text-center cursor-pointer">Scan Foto<input type="file" accept="image/*" className="hidden" onChange={e => scanQrImage(e.target.files?.[0])} /></label>
          {['hadir','sakit','izin','alpha'].map(st => <button key={st} onClick={() => setAll(st)} className="px-3 py-2 bg-gray-100 rounded-lg text-sm capitalize">Semua {st}</button>)}
        </div>
        <div className="flex flex-col lg:flex-row gap-3">
          <input type="date" value={range.mulai} onChange={e => setRange({...range, mulai: e.target.value})} className="px-3 py-2 border rounded-lg text-sm" />
          <input type="date" value={range.selesai} onChange={e => setRange({...range, selesai: e.target.value})} className="px-3 py-2 border rounded-lg text-sm" />
          <select value={range.status} onChange={e => setRange({...range, status: e.target.value})} className="px-3 py-2 border rounded-lg text-sm"><option value="hadir">Hadir</option><option value="sakit">Sakit</option><option value="izin">Izin</option><option value="alpha">Alpha</option></select>
          <button onClick={handleRangeSave} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Simpan Rentang Rombel</button>
        </div>
      </div>

      {qrOpen && <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4"><div className="bg-white rounded-2xl p-4 w-full max-w-sm"><p className="text-sm text-gray-600 mb-3">Kamera tetap terbuka. Arahkan ke QR KTS siswa berikutnya.</p><div id="qr-reader"></div><p className="text-xs text-gray-400 mt-2">Terakhir: {qrToken || '-'}</p><button onClick={stopQrCamera} className="mt-3 w-full px-4 py-2 bg-gray-800 text-white rounded-lg text-sm">Tutup</button></div></div>}

      {showQr && <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-3"><div className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4"><div><h2 className="font-bold text-gray-800">QR Siswa</h2><p className="text-xs text-gray-500">QR dan login memakai NISN bila tersedia; jika kosong memakai NIS.</p></div><div className="flex gap-2"><button onClick={downloadAllStudentQr} disabled={loading || qrIdentifiers.length === 0} className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm disabled:opacity-50"><Download size={15}/>{loading ? 'Menyiapkan...' : 'Unduh Semua'}</button><button onClick={() => setShowQr(false)} className="px-3 py-2 bg-gray-100 rounded-lg text-sm">Tutup</button></div></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">{qrIdentifiers.map(s => <div key={s.id} className="border rounded-xl p-3 text-center"><QRCodeCanvas id={`student-qr-${s.id}`} value={s.identifier} size={160} level="M" marginSize={2} className="mx-auto max-w-full h-auto"/><p className="font-medium text-sm text-gray-800 mt-2 truncate">{s.nama}</p><p className="text-xs text-gray-500 break-all">{s.identifier_type}: {s.identifier}</p><button onClick={() => downloadStudentQr(s)} className="mt-3 inline-flex w-full items-center justify-center gap-2 px-3 py-2 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-100"><Download size={14}/>Unduh PNG</button></div>)}</div>
        {qrIdentifiers.length === 0 && <p className="py-8 text-center text-sm text-gray-400">Belum ada siswa pada rombel ini.</p>}
      </div></div>}

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
