import { useState, useEffect } from 'react'
import api from '../../services/api'
import toast from 'react-hot-toast'

export default function SiswaNilaiPage() {
  const [loading, setLoading] = useState(false)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-800">Nilai Saya</h1>
        <p className="text-gray-500 mt-1">Lihat rekap nilai dan rapor</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🚧</span>
        </div>
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Segera Hadir</h2>
        <p className="text-gray-400 text-sm">Fitur ini sedang dalam pengembangan.</p>
      </div>
    </div>
  )
}
