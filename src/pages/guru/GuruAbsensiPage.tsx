import { useState, useEffect } from 'react'
import { MapPin, Clock, Loader2, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useSettingsStore } from '../../stores/settingsStore'
import { playFeedbackSound, primeFeedbackSound } from '../../lib/feedbackSound'

export default function GuruAbsensiPage() {
  const settings = useSettingsStore(s => s.settings)
  const [loading, setLoading] = useState(false)
  const [todayRecord, setTodayRecord] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [location, setLocation] = useState<{lat: number, lng: number, acc?: number} | null>(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const res = await api.get('/guru/absensi-saya')
      setTodayRecord(res.data.today)
      setHistory(res.data.history)
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal memuat data ceklok') }
  }

  const getLocation = (): Promise<{lat: number, lng: number, acc: number}> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation tidak didukung'))
      // maximumAge:0 memaksa fix baru (bukan cache) agar lebih presisi.
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
        err => reject(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      )
    })
  }

  const handleCeklok = async (type: 'masuk' | 'pulang') => {
    // AudioContext harus dibuka di dalam gestur klik, bukan saat respons tiba.
    primeFeedbackSound()
    setLoading(true)
    try {
      const loc = await getLocation()
      setLocation(loc)
      // Tolak fix GPS yang terlalu kasar (biasanya masih pakai IP/WiFi, belum lock satelit).
      if (loc.acc && loc.acc > 200) {
        playFeedbackSound('error')
        toast.error(`Sinyal GPS lemah (akurasi ±${Math.round(loc.acc)}m). Keluar ruangan / aktifkan GPS presisi tinggi lalu coba lagi.`)
        return
      }
      const res = await api.post('/guru/ceklok', { type, latitude: loc.lat, longitude: loc.lng, accuracy: loc.acc })
      playFeedbackSound(type === 'masuk' ? 'masuk' : 'pulang')
      toast.success(type === 'masuk' ? `Ceklok masuk berhasil: ${res.data.waktu_masuk}` : `Ceklok pulang berhasil: ${res.data.waktu_pulang}`)
      loadData()
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Gagal ceklok'
      playFeedbackSound('error')
      toast.error(msg)
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Absensi Kehadiran</h1>
        <p className="text-gray-500 text-sm mt-1">Ceklok masuk/pulang dengan verifikasi GPS</p>
      </div>

      {/* Status Hari Ini */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-800 mb-4">Status Hari Ini</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-green-50 rounded-lg text-center">
            <Clock size={24} className="mx-auto text-green-600 mb-2" />
            <p className="text-sm text-green-600 font-medium">Jam Masuk</p>
            <p className="text-lg font-bold text-green-800">{todayRecord?.waktu_masuk || '-'}</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg text-center">
            <Clock size={24} className={`mx-auto mb-2 ${todayRecord?.waktu_pulang ? 'text-blue-600' : 'text-gray-400'}`} />
            <p className="text-sm text-gray-500 font-medium">Jam Pulang</p>
            <p className="text-lg font-bold text-gray-700">{todayRecord?.waktu_pulang || '-'}</p>
          </div>
        </div>
      </div>

      {/* Ceklok Buttons */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <MapPin size={20} className="text-primary" />
          Ceklok Kehadiran
        </h3>

        {!settings?.geo_latitude && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <p className="text-xs text-amber-800">⚠️ Admin belum setting lokasi sekolah. Ceklok sementara tidak dibatasi radius.</p>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-blue-700">
            <strong>Lokasi Anda:</strong> {location ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}${location.acc ? ` (±${Math.round(location.acc)}m)` : ''}` : 'Belum terdeteksi (akan otomatis saat ceklok)'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleCeklok('masuk')}
            disabled={loading || !!todayRecord?.waktu_masuk}
            className="flex flex-col items-center gap-2 p-6 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={32} className="animate-spin" /> : <MapPin size={32} />}
            <span className="font-medium">Ceklok Masuk</span>
          </button>
          <button
            onClick={() => handleCeklok('pulang')}
            disabled={loading || !todayRecord?.waktu_masuk || !!todayRecord?.waktu_pulang}
            className="flex flex-col items-center gap-2 p-6 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={32} className="animate-spin" /> : <MapPin size={32} />}
            <span className="font-medium">Ceklok Pulang</span>
          </button>
        </div>
      </div>

      {/* Riwayat */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-800 mb-4">Riwayat Kehadiran</h3>
        <div className="space-y-2">
          {history.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Belum ada riwayat</p>}
          {history.slice(0, 10).map((r, i) => (
            <div key={r.id || i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">{r.tanggal}</span>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600">Masuk: {r.waktu_masuk || '-'}</span>
                <span className="text-gray-600">Pulang: {r.waktu_pulang || '-'}</span>
                <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">{r.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
