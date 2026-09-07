import { useState, useEffect, useRef, useCallback } from 'react'
import { QrCode, CheckCircle, XCircle, Clock, Camera, Keyboard } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'
import { Html5Qrcode } from 'html5-qrcode'
import { announceStudentScanSuccess, playFeedbackSound, primeFeedbackSound } from '../../lib/feedbackSound'

const statusColors: Record<string, string> = {
  hadir: 'bg-green-100 text-green-700',
  sakit: 'bg-yellow-100 text-yellow-700',
  izin: 'bg-blue-100 text-blue-700',
  alpha: 'bg-red-100 text-red-700',
}

/**
 * Halaman absensi harian siswa (masuk/pulang) untuk guru kelas / wali kelas.
 * Menggunakan backend QR scan yang sudah ada (`POST /absensi-siswa/qr-scan`).
 * Hanya untuk jenjang MI/SD dan RA/TK.
 */
export default function GuruAbsensiSiswaQRPage() {
  const [tanggal, setTanggal] = useState(todayWib())
  const [sesi, setSesi] = useState<'masuk' | 'pulang'>('masuk')
  const [rombels, setRombels] = useState<any[]>([])
  const [selectedRombel, setSelectedRombel] = useState('')
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [absensi, setAbsensi] = useState<Record<string, string>>({})
  const [existing, setExisting] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [qrToken, setQrToken] = useState('')
  const [qrOpen, setQrOpen] = useState(false)
  const [lastQr, setLastQr] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [mode, setMode] = useState<'qr' | 'manual'>('qr')
  const [kbmStatus, setKbmStatus] = useState({ aktif: false, libur: false, loading: true })
  const qrRef = useRef<Html5Qrcode | null>(null)
  const scanBusyRef = useRef(false)
  const lastQrRef = useRef('')
  const cameraStartingRef = useRef(false)

  // Load rombel yang diampu guru ini via jadwal-context
  useEffect(() => {
    api.get('/guru/jadwal-context', { params: { tanggal } })
      .then(res => {
        const jadwalList = res.data.jadwal || []
        // Ambil rombel unik dari jadwal hari ini
        const rombelMap = new Map<string, any>()
        for (const j of jadwalList) {
          if (j.rombel_id && !rombelMap.has(j.rombel_id)) {
            rombelMap.set(j.rombel_id, { id: j.rombel_id, nama: j.rombel_nama })
          }
        }
        const uniqueRombels = Array.from(rombelMap.values())
        setRombels(uniqueRombels)
        if (uniqueRombels.length > 0 && !selectedRombel) {
          setSelectedRombel(uniqueRombels[0].id)
        }
      })
      .catch(() => {
        // Fallback: load semua rombel
        api.get('/rombel').then(res => {
          setRombels(res.data)
          if (res.data.length > 0 && !selectedRombel) setSelectedRombel(res.data[0].id)
        }).catch(() => toast.error('Gagal memuat rombel'))
      })
  }, [tanggal])

  // Check KBM status
  useEffect(() => {
    setKbmStatus(s => ({ ...s, loading: true }))
    api.get('/kalender-kbm/status', { params: { tanggal } })
      .then(res => setKbmStatus({ aktif: !!res.data.aktif, libur: !!res.data.libur, loading: false }))
      .catch(() => setKbmStatus({ aktif: false, libur: false, loading: false }))
  }, [tanggal])

  // Load absensi
  const loadData = useCallback(async () => {
    if (!selectedRombel) return
    try {
      const [siswaRes, absensiRes] = await Promise.all([
        api.get('/siswa', { params: { rombel_id: selectedRombel } }),
        api.get('/absensi-siswa', { params: { tanggal, rombel_id: selectedRombel } }),
      ])
      setSiswaList(siswaRes.data)
      setExisting(absensiRes.data)
      const map: Record<string, string> = {}
      for (const a of absensiRes.data) {
        const saved = sesi === 'pulang' ? a.status_pulang : a.status
        if (saved) map[a.siswa_id] = saved
      }
      setAbsensi(map)
    } catch {
      toast.error('Gagal memuat data absensi')
    }
  }, [selectedRombel, tanggal, sesi])

  useEffect(() => { void loadData() }, [loadData])

  const setStatus = (siswaId: string, status: string) => {
    setAbsensi(prev => ({ ...prev, [siswaId]: status }))
  }

  const setAll = (status: string) => setAbsensi(Object.fromEntries(siswaList.map(s => [s.id, status])))

  // QR Camera
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

  const announceScanResult = (data: any) => {
    announceStudentScanSuccess(data?.siswa?.nama_panggilan_unik || data?.siswa?.nama, data?.sesi === 'pulang' ? 'pulang' : 'masuk', data?.already)
  }

  const startQrCamera = async () => {
    if (!kbmStatus.aktif) return toast.error(kbmStatus.libur ? 'Hari libur: absensi nonaktif' : 'Aktifkan KBM tanggal ini')
    if (qrRef.current || cameraStartingRef.current) return
    primeFeedbackSound()
    cameraStartingRef.current = true
    setQrOpen(true)
    setTimeout(async () => {
      try {
        if (!cameraStartingRef.current) return
        const scanner = new Html5Qrcode('guru-qr-reader')
        qrRef.current = scanner
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, async text => {
          const normalized = text.trim()
          if (scanBusyRef.current || normalized === lastQrRef.current) return
          scanBusyRef.current = true
          lastQrRef.current = normalized
          setScanBusy(true)
          setLastQr(normalized)
          setQrToken(normalized)
          try {
            const r = await api.post('/absensi-siswa/qr-scan', { token: normalized, sesi, tanggal })
            announceScanResult(r.data)
            toast.success(r.data.already ? `${r.data.siswa?.nama || 'Siswa'} sudah tercatat` : `${r.data.siswa?.nama || 'Siswa'} hadir (${r.data.sesi})`)
            loadData()
          } catch (err: any) {
            playFeedbackSound('error')
            toast.error(err.response?.data?.error || 'QR gagal')
          } finally {
            window.setTimeout(() => { scanBusyRef.current = false; lastQrRef.current = ''; setScanBusy(false); setLastQr('') }, 1200)
          }
        }, () => {})
        cameraStartingRef.current = false
      } catch {
        cameraStartingRef.current = false
        qrRef.current = null
        toast.error('Kamera/QR tidak bisa dibuka')
        setQrOpen(false)
      }
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
      const r = await api.post('/absensi-siswa/qr-scan', { token, sesi, tanggal })
      announceScanResult(r.data)
      toast.success(r.data.already ? `${r.data.siswa?.nama || 'Siswa'} sudah tercatat` : `${r.data.siswa?.nama || 'Siswa'} hadir (${r.data.sesi})`)
      await loadData()
    } catch (err: any) {
      playFeedbackSound('error')
      toast.error(err.response?.data?.error || 'QR gagal')
    } finally {
      window.setTimeout(() => { scanBusyRef.current = false; lastQrRef.current = ''; setScanBusy(false); setLastQr('') }, 1200)
    }
  }

  const handleQrScan = async () => {
    primeFeedbackSound()
    if (!kbmStatus.aktif) return toast.error(kbmStatus.libur ? 'Hari libur: absensi nonaktif' : 'Aktifkan KBM tanggal ini')
    if (!qrToken.trim()) return toast.error('Isi/scan token QR')
    await submitQrToken(qrToken)
    setQrToken('')
  }

  // Manual save
  const handleSave = async () => {
    if (!kbmStatus.aktif) return toast.error(kbmStatus.libur ? 'Hari libur: absensi nonaktif' : 'Aktifkan KBM tanggal ini')
    if (!selectedRombel || siswaList.length === 0) return toast.error('Pilih rombel yang memiliki siswa')
    const data = Object.entries(absensi).map(([siswa_id, status]) => ({ siswa_id, status, metode: 'manual' }))
    if (!data.length) return toast.error('Pilih status kehadiran minimal satu siswa')
    setLoading(true)
    try {
      await api.post('/absensi-siswa/bulk', { tanggal, rombel_id: selectedRombel, jenis: sesi, data })
      toast.success(`Absensi ${sesi} tersimpan`)
      loadData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal simpan') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Absensi Harian Siswa</h1>
          <p className="text-gray-500 text-sm mt-1">Absen masuk/pulang siswa via QR atau manual</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMode('qr')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${mode === 'qr' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <Camera size={16} /> QR Scan
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${mode === 'manual' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            <Keyboard size={16} /> Manual
          </button>
        </div>
      </div>

      {/* KBM Status */}
      {kbmStatus.libur && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Hari ini hari libur — absensi nonaktif.
        </div>
      )}
      {!kbmStatus.loading && !kbmStatus.aktif && !kbmStatus.libur && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          KBM belum aktif untuk tanggal ini. Hubungi admin untuk mengaktifkan Kalender KBM.
        </div>
      )}

      {/* Controls */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
        <select value={selectedRombel} onChange={e => setSelectedRombel(e.target.value)} className="min-w-0 flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Pilih rombel</option>
          {rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
        </select>
        <div className="flex gap-2">
          <select value={sesi} onChange={e => setSesi(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="masuk">Sesi Masuk</option>
            <option value="pulang">Sesi Pulang</option>
          </select>
          <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
      </div>

      {/* QR Mode */}
      {mode === 'qr' && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-4">
          {/* QR Camera */}
          {!qrOpen ? (
            <button onClick={startQrCamera} disabled={!kbmStatus.aktif} className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary text-white rounded-xl text-lg font-semibold disabled:opacity-50 hover:bg-primary-dark transition">
              <QrCode size={24} /> Buka Kamera QR
            </button>
          ) : (
            <div className="space-y-3">
              <div id="guru-qr-reader" className="rounded-xl overflow-hidden" />
              {scanBusy && <p className="text-center text-sm text-primary animate-pulse">Memproses scan...</p>}
              {lastQr && <p className="text-center text-xs text-gray-400">Terakhir: {lastQr.slice(0, 30)}</p>}
              <button onClick={stopQrCamera} className="w-full py-2 bg-gray-100 rounded-lg text-sm text-gray-600">Tutup Kamera</button>
            </div>
          )}

          {/* Manual token input fallback */}
          <div className="flex gap-2">
            <input
              value={qrToken}
              onChange={e => setQrToken(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQrScan()}
              placeholder="Ketik/scan token QR"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button onClick={handleQrScan} disabled={!kbmStatus.aktif || scanBusy} className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-50">
              Proses
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <QrCode size={14} />
            <span>Arahkan kamera ke QR siswa. Sesi (masuk/pulang) ditentukan otomatis berdasarkan jam.</span>
          </div>
        </div>
      )}

      {/* Manual Mode */}
      {mode === 'manual' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b flex flex-wrap gap-2">
            <span className="text-sm text-gray-600 font-medium">Set semua:</span>
            {['hadir', 'sakit', 'izin', 'alpha'].map(s => (
              <button key={s} onClick={() => setAll(s)} className={`px-3 py-1 rounded-lg text-xs font-medium capitalize ${statusColors[s] || 'bg-gray-100 text-gray-600'} hover:opacity-80`}>
                {s}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">No</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nama</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Hadir</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Sakit</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Izin</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Alpha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {siswaList.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Tidak ada siswa di rombel ini</td></tr>}
                {siswaList.map((s, i) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{s.nama}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => setStatus(s.id, 'hadir')} className={`p-1.5 rounded-full ${absensi[s.id] === 'hadir' ? 'bg-green-100 text-green-700' : 'text-gray-300 hover:text-green-500'}`}><CheckCircle size={20} /></button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => setStatus(s.id, 'sakit')} className={`p-1.5 rounded-full ${absensi[s.id] === 'sakit' ? 'bg-yellow-100 text-yellow-700' : 'text-gray-300 hover:text-yellow-500'}`}><Clock size={20} /></button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => setStatus(s.id, 'izin')} className={`p-1.5 rounded-full ${absensi[s.id] === 'izin' ? 'bg-blue-100 text-blue-700' : 'text-gray-300 hover:text-blue-500'}`}><Clock size={20} /></button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => setStatus(s.id, 'alpha')} className={`p-1.5 rounded-full ${absensi[s.id] === 'alpha' ? 'bg-red-100 text-red-700' : 'text-gray-300 hover:text-red-500'}`}><XCircle size={20} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t">
            <button onClick={handleSave} disabled={loading || !selectedRombel || siswaList.length === 0} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary-dark">
              {loading ? 'Menyimpan...' : 'Simpan Absensi'}
            </button>
          </div>
        </div>
      )}

      {/* Rekap singkat */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Rekap Hari Ini ({sesi === 'masuk' ? 'Masuk' : 'Pulang'})</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['hadir', 'sakit', 'izin', 'alpha'] as const).map(s => {
            const count = Object.values(absensi).filter(v => v === s).length
            return (
              <div key={s} className={`p-3 rounded-lg text-center ${statusColors[s] || 'bg-gray-100'}`}>
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs capitalize">{s}</p>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-gray-400 mt-2">Total siswa: {siswaList.length}</p>
      </div>
    </div>
  )
}
