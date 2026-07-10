import { useState, useEffect } from 'react'
import { Calendar } from 'lucide-react'
import api from '../../services/api'

const hariList = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

export default function GuruJadwalPage() {
  const [jadwal, setJadwal] = useState<any[]>([])

  useEffect(() => {
    api.get('/guru/dashboard').then(res => {
      // Get gtk_id from dashboard, then fetch full jadwal
      if (res.data.gtk?.id) {
        api.get('/jadwal', { params: { gtk_id: res.data.gtk.id } }).then(r => setJadwal(r.data))
      }
    }).catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Jadwal Mengajar Saya</h1>
        <p className="text-gray-500 text-sm mt-1">Jadwal mengajar minggu ini</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {hariList.map(hari => {
          const items = jadwal.filter(j => j.hari === hari)
          return (
            <div key={hari} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-primary/5 border-b">
                <h3 className="font-medium text-primary flex items-center gap-2">
                  <Calendar size={16} /> {hari}
                </h3>
              </div>
              <div className="p-4">
                {items.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-2">Tidak ada jadwal</p>
                ) : (
                  <div className="space-y-2">
                    {items.map((j, i) => (
                      <div key={j.id || i} className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500">{j.jam_mulai} - {j.jam_selesai}</p>
                        <p className="text-sm font-medium text-gray-800">{j.mapel_nama || j.mapel_kode}</p>
                        <p className="text-xs text-gray-500">{j.rombel_nama} • {j.ruangan || '-'}</p>
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
