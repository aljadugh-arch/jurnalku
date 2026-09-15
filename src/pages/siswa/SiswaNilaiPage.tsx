import { useState, useEffect } from 'react'
import { Award, BookOpen, TrendingUp } from 'lucide-react'
import api from '../../services/api'

type PenilaianHarian = {
  tanggal: string
  mapel_nama: string
  sikap: number
  keaktifan: number
  pengetahuan: number
  catatan: string
}

type RekapMapel = {
  mapel_nama: string
  jumlah_penilaian: number
  rata_sikap: number
  rata_keaktifan: number
  rata_pengetahuan: number
  nilai_harian: number
}

export default function SiswaNilaiPage() {
  const [rekap, setRekap] = useState<RekapMapel[]>([])
  const [harian, setHarian] = useState<PenilaianHarian[]>([])
  const [tab, setTab] = useState<'rekap' | 'harian'>('rekap')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/siswa/penilaian').then(r => setHarian(Array.isArray(r.data) ? r.data : [])).catch(() => setHarian([])),
      api.get('/siswa/penilaian/rekap').then(r => setRekap(Array.isArray(r.data) ? r.data : [])).catch(() => setRekap([]))
    ]).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">Memuat nilai...</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Nilai Saya</h1>
        <p className="text-gray-500 text-sm mt-1">Ringkasan nilai per mapel dan riwayat penilaian harian</p>
      </div>

      {/* Tab */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setTab('rekap')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'rekap' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <TrendingUp size={15} className="inline mr-1.5" />
          Ringkasan per Mapel
        </button>
        <button
          onClick={() => setTab('harian')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'harian' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <BookOpen size={15} className="inline mr-1.5" />
          Riwayat Penilaian Harian
        </button>
      </div>

      {/* Tab: Rekap per Mapel */}
      {tab === 'rekap' && (
        <>
          {rekap.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Award size={32} className="text-amber-400" />
              </div>
              <p className="text-gray-500 text-sm">Belum ada penilaian harian.</p>
              <p className="text-gray-400 text-xs mt-2">Guru akan memasukkan nilai setelah penilaian selesai.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rekap.map((r, i) => (
                <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="font-semibold text-gray-800">{r.mapel_nama}</p>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${r.nilai_harian >= 80 ? 'text-green-600' : r.nilai_harian >= 70 ? 'text-blue-600' : r.nilai_harian >= 60 ? 'text-yellow-600' : 'text-red-500'}`}>
                        {r.nilai_harian}
                      </div>
                      <div className="text-xs text-gray-400">Nilai Harian</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-blue-50 rounded-lg p-2">
                      <div className="font-semibold text-blue-700">{Math.round(r.rata_pengetahuan)}</div>
                      <div className="text-blue-500 mt-0.5">Pengetahuan</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-2">
                      <div className="font-semibold text-purple-700">{Math.round(r.rata_keaktifan)}</div>
                      <div className="text-purple-500 mt-0.5">Keaktifan</div>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-2">
                      <div className="font-semibold text-emerald-700">{Math.round(r.rata_sikap)}</div>
                      <div className="text-emerald-500 mt-0.5">Sikap</div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2 text-right">{r.jumlah_penilaian}× pertemuan dinilai</p>
                </div>
              ))}
              <p className="text-xs text-gray-400 text-center">
                Nilai Harian = Pengetahuan × 50% + Keaktifan × 30% + Sikap × 20%
              </p>
            </div>
          )}
        </>
      )}

      {/* Tab: Riwayat Harian */}
      {tab === 'harian' && (
        <>
          {harian.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Award size={32} className="text-amber-400" />
              </div>
              <p className="text-gray-500 text-sm">Belum ada penilaian harian.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {harian.map((p, i) => (
                <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-800">{p.mapel_nama || 'Mata Pelajaran'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{p.tanggal}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-center text-xs shrink-0">
                      {p.pengetahuan > 0 && (
                        <div className="bg-blue-50 rounded px-2 py-1">
                          <div className="font-semibold text-blue-700">{p.pengetahuan}</div>
                          <div className="text-blue-400">Peng.</div>
                        </div>
                      )}
                      {p.keaktifan > 0 && (
                        <div className="bg-purple-50 rounded px-2 py-1">
                          <div className="font-semibold text-purple-700">{p.keaktifan}</div>
                          <div className="text-purple-400">Aktif</div>
                        </div>
                      )}
                      {p.sikap > 0 && (
                        <div className="bg-emerald-50 rounded px-2 py-1">
                          <div className="font-semibold text-emerald-700">{p.sikap}</div>
                          <div className="text-emerald-400">Sikap</div>
                        </div>
                      )}
                    </div>
                  </div>
                  {p.catatan && <p className="text-sm text-gray-600 mt-2 bg-gray-50 rounded p-2">{p.catatan}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
