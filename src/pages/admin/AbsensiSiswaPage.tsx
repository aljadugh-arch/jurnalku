import { useState, useEffect, useRef } from 'react'
import { QrCode, Save, X, Printer, ScanLine, Camera, Download } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Html5Qrcode } from 'html5-qrcode'
import toast from 'react-hot-toast'
import api from '../../services/api'

const statusColors: Record<string, string> = {
  hadir: 'bg-green-100 text-green-700',
  sakit: 'bg-yellow-100 text-yellow-700',
  izin: 'bg-blue-100 text-blue-700',
  alpha: 'bg-red-100 text-red-700',
}

export default function AbsensiSiswaPage() {
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0])
  const [rombels, setRombels] = useState<any[]>([])
  const [selectedRombel, setSelectedRombel] = useState('')
  const [siswaList, setSiswaList] = useState<any[]>([])
  // Split masuk vs pulang. Setiap map: siswa_id -> status.
  const [absensiMasuk, setAbsensiMasuk] = useState<Record<string, string>>({})
  const [absensiPulang, setAbsensiPulang] = useState<Record<string, string>>({})
  const [jamMasuk, setJamMasuk] = useState<Record<string, string>>({})
  const [jamPulang, setJamPulang] = useState<Record<string, string>>({})
  const [sesi, setSesi] = useState<'masuk' | 'pulang'>('masuk')
  const [loading, setLoading] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [showScanModal, setShowScanModal] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scanBoxId = 'qr-scan-box'

  useEffect(() => {
    api.get('/rombel').then(res => {
      setRombels(res.data)
      if (res.data.length > 0) setSelectedRombel(res.data[0].id)
    })
  }, [])

  useEffect(() => {
    if (selectedRombel) loadData()
  }, [selectedRombel, tanggal])

  const loadData = async () => {
    const [siswaRes, absensiRes] = await Promise.all([
      api.get('/siswa', { params: { rombel_id: selectedRombel } }),
      api.get('/absensi-siswa', { params: { tanggal, rombel_id: selectedRombel } })
    ])
    setSiswaList(siswaRes.data)
    const mM: Record<string, string> = {}, mP: Record<string, string> = {}
    const jM: Record<string, string> = {}, jP: Record<string, string> = {}
    for (const a of absensiRes.data) {
      mM[a.siswa_id] = a.status || ''
      if (a.status_pulang) mP[a.siswa_id] = a.status_pulang
      if (a.waktu_masuk) jM[a.siswa_id] = a.waktu_masuk
      else if (a.waktu_absen) jM[a.siswa_id] = a.waktu_absen
      if (a.waktu_pulang) jP[a.siswa_id] = a.waktu_pulang
    }
    setAbsensiMasuk(mM); setAbsensiPulang(mP); setJamMasuk(jM); setJamPulang(jP)
  }

  const setStatus = (siswaId: string, status: string) => {
    if (sesi === 'pulang') setAbsensiPulang(prev => ({ ...prev, [siswaId]: status }))
    else setAbsensiMasuk(prev => ({ ...prev, [siswaId]: status }))
  }

  const handleSave = async () => {
    const src = sesi === 'pulang' ? absensiPulang : absensiMasuk
    // Fallback status: sesi masuk -> alpha; sesi pulang -> hadir (default anak pulang normal)
    const fallback = sesi === 'pulang' ? 'hadir' : 'alpha'
    const now = new Date().toTimeString().slice(0, 5)
    const data = siswaList.map(s => ({
      siswa_id: s.id,
      status: src[s.id] || fallback,
      metode: 'manual',
      waktu_absen: now,
    }))
    setLoading(true)
    try {
      await api.post('/absensi-siswa/bulk', { tanggal, rombel_id: selectedRombel, data, jenis: sesi })
      toast.success(`Absensi ${sesi === 'pulang' ? 'pulang' : 'masuk'} tersimpan`)
      loadData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal simpan') }
    finally { setLoading(false) }
  }

  const currentMap = sesi === 'pulang' ? absensiPulang : absensiMasuk
  const summary = {
    hadir: Object.values(currentMap).filter(s => s === 'hadir').length,
    sakit: Object.values(currentMap).filter(s => s === 'sakit').length,
    izin: Object.values(currentMap).filter(s => s === 'izin').length,
    alpha: siswaList.length - Object.values(currentMap).filter(s => s && s !== 'alpha').length,
  }

  // === Cetak Kartu Tanda Siswa (KTS) — pakai template PNG depan & belakang ===
  // Koordinat overlay relatif thd template 1011x639 (dipakai sebagai persen).
  const handlePrintKartu = () => {
    const win = window.open('', '_blank')
    if (!win) { toast.error('Popup diblokir browser, izinkan popup untuk cetak'); return }
    const pct = (v: number, base: number) => (v / base * 100).toFixed(3) + '%'
    const cards = siswaList.map(s => {
      const qr = qrToSvgString(s.id)
      const ttl = [s.tempat_lahir, s.tanggal_lahir].filter(Boolean).join(', ')
      // DEPAN
      const depan = `
      <div class="card">
        <img class="bg" src="/kts-depan.png" />
        ${s.foto ? `<img class="foto" src="${s.foto.startsWith('http') ? s.foto : location.origin + s.foto}" />` : '<div class="foto foto-empty"></div>'}
        <div class="nama-depan">${s.nama || ''}</div>
        <div class="data nisn">${s.nisn || '-'} / ${s.nis || '-'}</div>
        <div class="data jk">${s.jenis_kelamin || '-'}</div>
        <div class="data ttl">${ttl || '-'}</div>
        <div class="data alamat">${s.alamat || '-'}</div>
      </div>`
      // BELAKANG
      const belakang = `
      <div class="card">
        <img class="bg" src="/kts-belakang.png" />
        <div class="nama-belakang">${s.nama || ''}</div>
        <div class="qr-belakang">${qr}</div>
      </div>`
      return depan + belakang
    }).join('')
    win.document.write(`<html><head><title>Cetak KTS</title><style>
      @page { size: A4; margin: 8mm; }
      body { font-family: Arial, sans-serif; margin: 0; }
      .grid { display: flex; flex-wrap: wrap; gap: 6mm; }
      .card { position: relative; width: 85.6mm; height: 54.1mm; page-break-inside: avoid; overflow: hidden; border-radius: 3mm; }
      .card .bg { position: absolute; inset: 0; width: 100%; height: 100%; }
      .card > *:not(.bg) { position: absolute; }
      .foto { left: ${pct(18,1011)}; top: ${pct(205,639)}; width: ${pct(200,1011)}; height: ${pct(255,639)}; object-fit: cover; }
      .foto-empty { background: #fff; }
      .nama-depan { left: ${pct(290,1011)}; top: ${pct(212,639)}; width: ${pct(460,1011)}; font-size: 3.2mm; font-weight: bold; color: #14532d; line-height: 1.1; }
      .data { left: ${pct(290,1011)}; width: ${pct(470,1011)}; font-size: 2.4mm; color: #111; line-height: 1.1; }
      .nisn   { top: ${pct(262,639)}; }
      .jk     { top: ${pct(295,639)}; }
      .ttl    { top: ${pct(328,639)}; }
      .alamat { top: ${pct(361,639)}; }
      .nama-belakang { left: ${pct(740,1011)}; top: ${pct(150,639)}; width: ${pct(210,1011)}; text-align: center; font-size: 2.6mm; font-weight: bold; color: #fff; }
      .qr-belakang { left: ${pct(755,1011)}; top: ${pct(195,639)}; width: ${pct(175,1011)}; }
      .qr-belakang svg { width: 100%; height: auto; background: #fff; padding: 2px; }
    </style></head><body><div class="grid">${cards}</div></body></html>`)
    win.document.close()
    win.onload = () => setTimeout(() => win.print(), 300)
    setTimeout(() => { try { win.print() } catch {} }, 800)
  }

  // Ambil string SVG QR dari container tersembunyi (dirender via qrcode.react).
  const qrToSvgString = (value: string) => {
    const el = document.getElementById(`qr-src-${value}`)
    return el ? el.innerHTML : ''
  }

  // === Export QR per-siswa ke PNG ===
  const exportQrPng = (siswa: any) => {
    const el = document.getElementById(`qr-src-${siswa.id}`)
    const svg = el?.querySelector('svg')
    if (!svg) { toast.error('QR belum siap'); return }
    const size = 512
    const svgStr = new XMLSerializer().serializeToString(svg)
    const img = new Image()
    const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)))
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size; canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, 0, 0, size, size)
      canvas.toBlob(blob => {
        if (!blob) return
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `QR-${siswa.nis || siswa.id}-${(siswa.nama || '').replace(/\s+/g, '_')}.png`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      }, 'image/png')
    }
    img.onerror = () => toast.error('Gagal render QR')
    img.src = url
  }

  const exportAllQrPng = () => {
    if (siswaList.length === 0) return
    toast.success(`Mengunduh ${siswaList.length} QR PNG...`)
    siswaList.forEach((s, i) => setTimeout(() => exportQrPng(s), i * 350))
  }

  // === Scan QR utk absensi ===
  const startScanner = async () => {
    setShowScanModal(true)
  }

  useEffect(() => {
    if (!showScanModal) {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
        scannerRef.current = null
      }
      return
    }
    let processing = false
    let lastToken = ''
    let lastAt = 0
    const timer = setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode(scanBoxId)
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 220 },
          async (decodedText) => {
            // Cegah banjir alert: 1 proses/scan + abaikan QR sama dalam 3 detik.
            const now = Date.now()
            if (processing) return
            if (decodedText === lastToken && now - lastAt < 3000) return
            processing = true
            lastToken = decodedText
            lastAt = now
            try { await scannerRef.current?.pause(true) } catch {}
            try {
              const res = await api.post('/absensi-siswa/qr-scan', { token: decodedText })
              if (res.data.already) toast(`${res.data.siswa.nama} sudah absen ${res.data.sesi || ''}`.trim(), { icon: 'ℹ️', id: 'qr-scan' })
              else toast.success(`${res.data.sesi === 'pulang' ? 'Pulang' : 'Hadir'}: ${res.data.siswa.nama} (${res.data.siswa.nis})`, { id: 'qr-scan' })
              loadData()
            } catch (err: any) {
              toast.error(err.response?.data?.error || 'QR tidak dikenali', { id: 'qr-scan' })
            } finally {
              setTimeout(() => { processing = false; try { scannerRef.current?.resume() } catch {} }, 1500)
            }
          },
          () => {}
        )
      } catch (err) {
        toast.error('Gagal akses kamera. Pastikan izin kamera diaktifkan.')
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [showScanModal])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Absensi Siswa</h1>
          <p className="text-gray-500 text-sm mt-1">QR Code & Manual oleh Wali Kelas</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={startScanner} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
            <ScanLine size={16} /> Scan QR Absen
          </button>
          <button onClick={() => setShowQrModal(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">
            <QrCode size={16} /> Lihat/Cetak QR
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

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3 flex-wrap items-start sm:items-center">
        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <select value={selectedRombel} onChange={e => setSelectedRombel(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
          {rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
        </select>
        {/* Tab sesi masuk/pulang (Item 1) */}
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          <button type="button" onClick={() => setSesi('masuk')}
            className={'px-4 py-2 ' + (sesi === 'masuk' ? 'bg-primary text-white' : 'bg-white text-gray-700 hover:bg-gray-50')}>
            Sesi Masuk
          </button>
          <button type="button" onClick={() => setSesi('pulang')}
            className={'px-4 py-2 border-l border-gray-300 ' + (sesi === 'pulang' ? 'bg-primary text-white' : 'bg-white text-gray-700 hover:bg-gray-50')}>
            Sesi Pulang
          </button>
        </div>
        <span className="text-xs text-gray-500 ml-auto">
          {sesi === 'pulang' ? 'Mode pulang: input status pulang & jam pulang' : 'Mode masuk: input kehadiran & jam masuk'}
        </span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">No</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">NIS</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nama</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Jam Masuk</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Jam Pulang</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Hadir</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Sakit</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Izin</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Alpha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {siswaList.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Pilih rombel yang memiliki siswa</td></tr>
              )}
              {siswaList.map((s, i) => (
                <tr key={s.id} className={'hover:bg-gray-50' + (currentMap[s.id] === 'hadir' ? ' bg-green-50/40' : '')}>
                  <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{s.nis}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{s.nama}</td>
                  <td className="px-4 py-3 text-center font-mono text-xs text-gray-600">{jamMasuk[s.id] || '-'}</td>
                  <td className="px-4 py-3 text-center font-mono text-xs text-gray-600">{jamPulang[s.id] || '-'}</td>
                  {['hadir', 'sakit', 'izin', 'alpha'].map(st => (
                    <td key={st} className="text-center px-4 py-3">
                      <input type="radio" name={`abs-${s.id}-${sesi}`} checked={currentMap[s.id] === st} onChange={() => setStatus(s.id, st)} className="w-4 h-4 text-primary" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hidden QR sources buat referensi print (dirender selalu, disembunyikan) */}
      <div style={{ display: 'none' }}>
        {siswaList.map(s => (
          <div id={`qr-src-${s.id}`} key={s.id}><QRCodeSVG value={s.id} size={120} level="M" /></div>
        ))}
      </div>

      {showQrModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">QR Code Siswa - {rombels.find(r => r.id === selectedRombel)?.nama}</h2>
              <div className="flex flex-wrap gap-2">
                <button onClick={exportAllQrPng} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
                  <Download size={14} /> Export Semua QR
                </button>
                <button onClick={handlePrintKartu} className="flex items-center gap-2 px-3 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
                  <Printer size={14} /> Cetak KTS
                </button>
                <button onClick={() => setShowQrModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 overflow-y-auto">
              {siswaList.map(s => (
                <div key={s.id} className="border rounded-xl p-3 text-center">
                  <QRCodeSVG value={s.id} size={100} level="M" className="mx-auto" />
                  <p className="text-sm font-medium text-gray-800 mt-2 truncate" title={s.nama}>{s.nama}</p>
                  <p className="text-xs text-gray-500">NIS: {s.nis}</p>
                  <button onClick={() => exportQrPng(s)} className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs text-gray-700">
                    <Download size={12} /> PNG
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showScanModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Camera size={18} /> Scan QR Absen</h2>
              <button onClick={() => setShowScanModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div id={scanBoxId} className="w-full rounded-lg overflow-hidden bg-gray-900" style={{ minHeight: 260 }} />
            <p className="text-xs text-gray-500 mt-3 text-center">Arahkan kamera ke QR Code kartu siswa. Absen tercatat otomatis sebagai "Hadir".</p>
          </div>
        </div>
      )}
    </div>
  )
}
