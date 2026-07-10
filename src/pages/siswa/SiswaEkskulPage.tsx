import { useState, useEffect } from 'react'
import { Users, Calendar } from 'lucide-react'
import api from '../../services/api'

export default function SiswaEkskulPage() {
  const [ekskulList, setEkskulList] = useState<any[]>([])

  useEffect(() => {
    api.get('/siswa/ekskul').then(res => setEkskulList(res.data)).catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Ekstrakurikuler</h1>
        <p className="text-gray-500 text-sm mt-1">Daftar kegiatan ekskul yang tersedia</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ekskulList.length === 0 && (
          <div className="col-span-full text-center py-8 text-gray-400">Belum ada data ekstrakurikuler</div>
        )}
        {ekskulList.map(e => (
          <div key={e.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Users size={20} className="text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-800">{e.nama}</h3>
                <p className="text-sm text-gray-500 mt-1">Pembina: {e.pembina_nama || 'TBA'}</p>
                {e.hari && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                    <Calendar size={12} />
                    <span>{e.hari} {e.jam_mulai && e.jam_selesai ? `• ${e.jam_mulai}-${e.jam_selesai}` : ''}</span>
                  </div>
                )}
                {e.deskripsi && <p className="text-xs text-gray-400 mt-2 line-clamp-2">{e.deskripsi}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
