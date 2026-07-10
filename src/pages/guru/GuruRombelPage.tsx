import { useState, useEffect } from 'react'
import { Users } from 'lucide-react'
import api from '../../services/api'

export default function GuruRombelPage() {
  const [rombels, setRombels] = useState<any[]>([])
  const [selectedRombel, setSelectedRombel] = useState('')
  const [siswaList, setSiswaList] = useState<any[]>([])

  useEffect(() => {
    api.get('/rombel').then(res => {
      setRombels(res.data)
      if (res.data.length > 0) setSelectedRombel(res.data[0].id)
    })
  }, [])

  useEffect(() => {
    if (selectedRombel) {
      api.get('/siswa', { params: { rombel_id: selectedRombel } }).then(res => setSiswaList(res.data))
    }
  }, [selectedRombel])

  const rombelData = rombels.find(r => r.id === selectedRombel)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Data Rombel</h1>
        <p className="text-gray-500 text-sm mt-1">Lihat daftar siswa per rombongan belajar</p>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <select value={selectedRombel} onChange={e => setSelectedRombel(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
          {rombels.map(r => <option key={r.id} value={r.id}>{r.nama} - Tingkat {r.tingkat}</option>)}
        </select>
      </div>

      {rombelData && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Users size={20} className="text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">{rombelData.nama}</h3>
              <p className="text-sm text-gray-500">Tingkat {rombelData.tingkat} • {siswaList.length} siswa</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">No</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">NIS</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">NISN</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nama</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">JK</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {siswaList.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Tidak ada siswa</td></tr>}
              {siswaList.map((s, i) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{s.nis}</td>
                  <td className="px-4 py-3 font-mono text-gray-700">{s.nisn || '-'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{s.nama}</td>
                  <td className="px-4 py-3 text-gray-600">{s.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
