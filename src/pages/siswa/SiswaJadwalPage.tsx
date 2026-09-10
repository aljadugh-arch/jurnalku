import { useState, useEffect } from 'react'
import { Calendar } from 'lucide-react'
import api from '../../services/api'

const hariList = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

export default function SiswaJadwalPage() {
  const [jadwal, setJadwal] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/siswa/jadwal')
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : []
        setJadwal(data)
      })
      .catch(() => setJadwal([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">Memuat jadwal...</div>

  if (jadwal.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Jadwal Pelajaran</h1>
          <p className="text-gray-500 text-sm mt-1">Jadwal kelas kamu minggu ini</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar size={32} className="text-blue-400" />
          </div>
          <p className="text-gray-500 text-sm">Jadwal pelajaran belum tersedia.</p>
          <p className="text-gray-400 text-xs mt-2">Hubungi guru atau operator untuk mendapatkan jadwal kelas Anda.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Jadwal Pelajaran</h1>
        <p className="text-gray-500 text-sm mt-1">Jadwal kelas kamu minggu ini</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {hariList.map(hari => {
          const items = jadwal.filter(j => String(j.hari || '').toLowerCase() === hari.toLowerCase())
          return (
            <div key={hari} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-blue-50 border-b">
                <h3 className="font-medium text-blue-700 flex items-center gap-2">
                  <Calendar size={16} /> {hari}
                </h3>
              </div>
              <div className="p-4">
                {items.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-3">Libur / Kosong</p>
                ) : (
                  <div className="space-y-2">
                    {items.map((j, i) => (
                      <div key={j.id || i} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <p className="text-xs text-gray-500 font-medium">{j.jam_mulai} - {j.jam_selesai}</p>
                        <p className="text-sm font-semibold text-gray-800 mt-1">{j.mapel_nama || 'Mata Pelajaran'}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{j.guru_nama ? `Guru: ${j.guru_nama}` : 'Guru TBA'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
