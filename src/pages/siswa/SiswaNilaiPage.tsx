import { useState, useEffect } from 'react'
import { Award } from 'lucide-react'
import api from '../../services/api'

export default function SiswaNilaiPage() {
  const [penilaian, setPenilaian] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/siswa/penilaian')
      .then(res => setPenilaian(Array.isArray(res.data) ? res.data : []))
      .catch(() => setPenilaian([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">Memuat nilai...</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Nilai Saya</h1>
        <p className="text-gray-500 text-sm mt-1">Lihat nilai harian dan rapor</p>
      </div>

      {penilaian.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Award size={32} className="text-amber-400" />
          </div>
          <p className="text-gray-500 text-sm">Nilai belum tersedia.</p>
          <p className="text-gray-400 text-xs mt-2">Guru akan memasukkan nilai setelah penilaian selesai.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {penilaian.map((p, i) => (
            <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-800">{p.mapel_nama || 'Mata Pelajaran'}</p>
                  <p className="text-xs text-gray-500 mt-1">Tanggal: {p.tanggal}</p>
                </div>
                <div className="text-right">
                  {p.pengetahuan && <p className="text-xs text-gray-500">Pengetahuan: {p.pengetahuan}</p>}
                  {p.keaktifan && <p className="text-xs text-gray-500">Keaktifan: {p.keaktifan}</p>}
                  {p.sikap && <p className="text-xs text-gray-500">Sikap: {p.sikap}</p>}
                </div>
              </div>
              {p.catatan && <p className="text-sm text-gray-600 mt-2">Catatan: {p.catatan}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
