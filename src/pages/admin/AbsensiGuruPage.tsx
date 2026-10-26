import { useState, useEffect, useRef } from 'react'
import { Save, MapPin, Camera, CheckCircle2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'
import { useSettingsStore } from '../../stores/settingsStore'

// Jarak meter antar dua koordinat (haversine) — dipakai hanya untuk tampilan
// "jarak dari sekolah" sebelum simpan. Validasi otoritatif tetap di backend.
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (v: number) => v * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function AbsensiGuruPage() {
  const { settings } = useSettingsStore()
  const [tanggal, setTanggal] = useState(todayWib())
  const [gtkList, setGtkList] = useState<any[]>([])
  const [absensi, setAbsensi] = useState<any[]>([])
  const [form, setForm] = useState<Record<string, { status: string; waktu_masuk: string; waktu_pulang: string }>>({})
  const [loading, setLoading] = useState(false)
  const [geo, setGeo] = useState<{ latitude: number; longitude: number; accuracy: number; distance: number | null; inRadius: boolean } | null>(null)
  const [geoBusy, setGeoBusy] = useState(false)
  const [selfie, setSelfie] = useState<string | null>(null)
  const selfieInputRef = useRef<HTMLInputElement>(null)

  // Geofence sekolah dari pengaturan lembaga (geo_latitude/longitude/radius).
  const schoolGeo = (() => {
    const lat = Number(settings?.geo_latitude)
    const lng = Number(settings?.geo_longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, radius: Number(settings?.geo_radius || 200) }
    return null
  })()

  // loadData is intentionally recreated so the selected date is always current.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [tanggal])

  const loadData = async () => {
    const [gtkRes, absRes] = await Promise.all([
      api.get('/gtk'),
      api.get('/absensi-guru', { params: { tanggal } })
    ])
    setGtkList(gtkRes.data)
    setAbsensi(absRes.data)
    const map: Record<string, any> = {}
    for (const g of gtkRes.data) {
      const existing = absRes.data.find((a: any) => a.gtk_id === g.id)
      map[g.id] = {
        status: existing?.status || '',
        waktu_masuk: existing?.waktu_masuk || '',
        waktu_pulang: existing?.waktu_pulang || '',
      }
    }
    setForm(map)
  }

  const updateForm = (gtkId: string, field: string, value: string) => {
    setForm(prev => ({ ...prev, [gtkId]: { ...prev[gtkId], [field]: value } }))
  }

  const loadJadwalHarian = async () => {
    try {
      const r = await api.get('/absensi-guru/jadwal-harian', { params: { tanggal } })
      const rows = r.data.rows || []
      const map: Record<string, any> = {}
      for (const g of rows) {
        const existing = absensi.find((a: any) => a.gtk_id === g.id)
        map[g.id] = {
          status: existing?.status || '',
          waktu_masuk: existing?.waktu_masuk || '',
          waktu_pulang: existing?.waktu_pulang || '',
        }
      }
      setGtkList(rows)
      setForm(map)
      toast.success(rows.length ? `${rows.length} GTK yang memiliki jadwal dimuat` : 'Tidak ada GTK yang memiliki jadwal pada tanggal ini')
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal muat jadwal') }
  }

  const handleBatchJadwal = async () => {
    const data = Object.entries(form).filter(([, f]: any) => f.status).map(([gtk_id, f]: any) => ({ gtk_id, ...f }))
    try { const r = await api.post('/absensi-guru/batch-jadwal', { tanggal, data }); toast.success(`${r.data.count} absensi GTK tersimpan`); loadData() }
    catch (err: any) { toast.error(err.response?.data?.error || 'Gagal batch') }
  }

  // Ambil koordinat GPS perangkat. Bila geofence sekolah terisi, hitung jarak
  // dari titik sekolah dan tandai apakah berada di dalam radius.
  const ambilLokasi = () => {
    if (!('geolocation' in navigator)) return toast.error('Browser tidak mendukung GPS')
    setGeoBusy(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude, accuracy } = pos.coords
        let distance: number | null = null
        let inRadius = true
        if (schoolGeo) {
          distance = Math.round(haversineMeters(latitude, longitude, schoolGeo.lat, schoolGeo.lng))
          inRadius = distance <= (schoolGeo.radius + Math.min(accuracy, 200))
        }
        setGeo({ latitude, longitude, accuracy, distance, inRadius })
        setGeoBusy(false)
        if (schoolGeo) {
          toast[inRadius ? 'success' : 'error'](inRadius ? `Lokasi OK — ${distance}m dari sekolah (radius ${schoolGeo.radius}m)` : `Di luar radius sekolah (${distance}m, batas ${schoolGeo.radius}m)`)
        } else {
          toast.success('Lokasi GPS tersimpan (geofence sekolah belum diatur)')
        }
      },
      err => {
        setGeoBusy(false)
        toast.error(err.code === 1 ? 'Izin lokasi ditolak — aktifkan akses lokasi di pengaturan browser' : err.code === 3 ? 'Lokasi tidak terbaca (sinyal lemah) — coba lagi' : 'Gagal membaca lokasi GPS')
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  }

  // Selfie opsional sebagai bukti kehadiran di lokasi; diperkecil jadi JPEG.
  const pilihSelfie = (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const max = 720
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
        setSelfie(canvas.toDataURL('image/jpeg', 0.75))
      }
      img.onerror = () => toast.error('Foto tidak bisa dibaca')
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    const isToday = tanggal === todayWib()
    const adaHadir = Object.values(form).some((f: any) => f.status === 'hadir')
    if (isToday && adaHadir && schoolGeo && !geo) {
      return toast.error('Ambil lokasi GPS dulu untuk menandai status hadir hari ini')
    }
    setLoading(true)
    try {
      for (const g of gtkList) {
        const f = form[g.id]
        if (f && f.status) {
          await api.post('/absensi-guru', {
            gtk_id: g.id,
            tanggal,
            status: f.status,
            waktu_masuk: f.waktu_masuk || null,
            waktu_pulang: f.waktu_pulang || null,
            latitude: geo?.latitude,
            longitude: geo?.longitude,
            accuracy: geo?.accuracy,
            foto_selfie: f.status === 'hadir' ? selfie : null,
          })
        }
      }
      toast.success('Absensi guru tersimpan')
      loadData()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal simpan')
    } finally { setLoading(false) }
  }

  const summary = {
    hadir: Object.values(form).filter(f => f.status === 'hadir').length,
    sakit: Object.values(form).filter(f => f.status === 'sakit').length,
    izin: Object.values(form).filter(f => f.status === 'izin').length,
    alpha: Object.values(form).filter(f => f.status === 'alpha').length,
  }

  const isToday = tanggal === todayWib()

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Absensi Guru/GTK</h1>
          <p className="text-gray-500 text-sm mt-1">Validasi GPS + selfie untuk status hadir, serta input manual sakit/izin/alpha</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={loadJadwalHarian} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">Muat Jadwal Hari Ini</button>
          <button onClick={handleBatchJadwal} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm">Simpan Batch Jadwal</button>
          <button onClick={handleSave} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
            <Save size={16} /> {loading ? 'Menyimpan...' : 'Simpan Absensi'}
          </button>
        </div>
      </div>

      {/* Geolokasi & selfie — bukti kehadiran di lokasi sekolah */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button onClick={ambilLokasi} disabled={geoBusy} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60">
            <MapPin size={16} /> {geoBusy ? 'Membaca GPS...' : (geo ? 'Ambil Ulang Lokasi' : 'Ambil Lokasi GPS')}
          </button>
          {geo ? (
            <div className="flex items-center gap-2 text-sm">
              {geo.inRadius ? <CheckCircle2 size={16} className="text-green-600" /> : <XCircle size={16} className="text-red-600" />}
              <span className="text-gray-700">
                {geo.latitude.toFixed(6)}, {geo.longitude.toFixed(6)}
                <span className="text-gray-400"> · akurasi ±{Math.round(geo.accuracy)}m</span>
                {geo.distance != null && <span className={geo.inRadius ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}> · {geo.distance}m dari sekolah</span>}
              </span>
            </div>
          ) : (
            <span className="text-sm text-gray-400">
              {schoolGeo ? 'Lokasi wajib untuk status hadir hari ini' : 'Geofence sekolah belum diatur — GPS opsional'}
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button onClick={() => selfieInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">
            <Camera size={16} /> {selfie ? 'Ganti Selfie' : 'Ambil Selfie (opsional)'}
          </button>
          <input ref={selfieInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={e => pilihSelfie(e.target.files?.[0])} />
          {selfie && (
            <div className="flex items-center gap-2">
              <img src={selfie} alt="Selfie" className="h-12 w-12 rounded-lg object-cover border border-gray-200" />
              <span className="text-xs text-gray-500">Selfie tersimpan — akan dilampirkan pada status hadir</span>
            </div>
          )}
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

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        {isToday && schoolGeo && !geo && <span className="ml-3 text-xs text-amber-600">Status hadir hari ini memerlukan lokasi GPS (radius sekolah)</span>}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">No</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">NIP</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nama</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Jam Masuk</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Jam Pulang</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {gtkList.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Belum ada data GTK</td></tr>
              )}
              {gtkList.map((g, i) => (
                <tr key={g.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{g.nip || '-'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{g.nama}</td>
                  <td className="px-4 py-3">
                    <select value={form[g.id]?.status || ''} onChange={e => updateForm(g.id, 'status', e.target.value)} className="px-2 py-1 border rounded text-xs">
                      <option value="">--</option>
                      <option value="hadir">Hadir</option>
                      <option value="sakit">Sakit</option>
                      <option value="izin">Izin</option>
                      <option value="alpha">Alpha</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input type="time" value={form[g.id]?.waktu_masuk || ''} onChange={e => updateForm(g.id, 'waktu_masuk', e.target.value)} className="px-2 py-1 border rounded text-xs" />
                  </td>
                  <td className="px-4 py-3">
                    <input type="time" value={form[g.id]?.waktu_pulang || ''} onChange={e => updateForm(g.id, 'waktu_pulang', e.target.value)} className="px-2 py-1 border rounded text-xs" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
