import { useState, useEffect } from 'react'
import api from '../../services/api'
import { CheckCircle2, XCircle, Filter } from 'lucide-react'

type Tugas = {
  mapel_id: string
  mapel_nama: string
  rombel_id: string
  rombel_nama: string
  tahun_ajaran: string
  total: number
  harian: number
  sts: number
  sas: number
}

type GuruBaris = {
  guru_id: string
  guru_nama: string
  kode_guru?: string
  tugas: Tugas[]
}

type MonitoringData = {
  tahun_ajaran: string
  semester: string
  jumlah_guru: number
  jumlah_tugas: number
  ringkasan: {
    harian: { sel: number; penuh: number }
    sts: { sel: number; penuh: number }
    sas: { sel: number; penuh: number }
  }
  daftar: GuruBaris[]
}

function Cell({ filled, total }: { filled: number; total: number }) {
  if (total <= 0) return <span className="text-gray-400">—</span>
  const penuh = filled >= total
  const warna = penuh ? 'text-green-600 dark:text-green-400' : filled > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500 dark:text-red-400'
  return (
    <span className={`inline-flex items-center gap-1 ${warna}`}>
      {penuh ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      {filled}/{total}
    </span>
  )
}

export default function AdminMonitoringNilaiPage() {
  const [data, setData] = useState<MonitoringData | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [tahunAjaran, setTahunAjaran] = useState(() => {
    const t = new Date()
    const y = t.getMonth() >= 6 ? t.getFullYear() : t.getFullYear() - 1
    return `${y}/${y + 1}`
  })
  const [semester, setSemester] = useState(() => {
    const t = new Date()
    return t.getMonth() >= 6 ? 'ganjil' : 'genap'
  })

  useEffect(() => { load() }, [tahunAjaran, semester])

  const load = async () => {
    setLoading(true); setMsg('')
    try {
      const { data } = await api.get('/admin/monitoring-nilai', { params: { tahun_ajaran: tahunAjaran, semester } })
      setData(data)
    } catch (e: any) {
      setMsg(`✗ ${e.response?.data?.error || 'Gagal memuat monitoring nilai'}`)
      setData(null)
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-800 dark:text-white">Monitoring Pengisian Nilai</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          Pantau keterisian nilai harian, STS, dan SAS per guru per mapel/kelas yang diampu
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tahun Ajaran</label>
            <input value={tahunAjaran} onChange={e => setTahunAjaran(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Semester</label>
            <select value={semester} onChange={e => setSemester(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary">
              <option value="ganjil">Ganjil</option>
              <option value="genap">Genap</option>
            </select>
          </div>
        </div>
      </div>

      {msg && (
        <div className="rounded-lg p-4 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400">{msg}</div>
      )}

      {loading && <div className="text-center py-12 text-gray-400">Memuat data...</div>}

      {!loading && data && (
        <>
          {/* Ringkasan */}
          <div className="grid grid-cols-3 gap-3">
            {(['harian', 'sts', 'sas'] as const).map(k => {
              const r = data.ringkasan[k]
              const label = k === 'harian' ? 'Nilai Harian' : k === 'sts' ? 'Nilai STS' : 'Nilai SAS'
              const warna = r.sel === 0 ? 'text-gray-400' : r.penuh >= r.sel ? 'text-green-600' : 'text-amber-600'
              return (
                <div key={k} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 text-center">
                  <div className={`text-2xl font-bold ${warna}`}>{r.penuh}/{r.sel}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label} lengkap</div>
                </div>
              )
            })}
          </div>

          {/* Matriks per guru */}
          <div className="space-y-4">
            {data.daftar.length === 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border p-12 text-center text-gray-400">
                <Filter size={48} className="mx-auto mb-4 opacity-50" />
                <p>Tidak ada guru dengan penugasan mengajar</p>
              </div>
            )}
            {data.daftar.map(g => (
              <div key={g.guru_id} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                  <span className="font-semibold text-gray-900 dark:text-white">{g.guru_nama}</span>
                  {g.kode_guru && <span className="ml-2 text-xs text-gray-400 font-mono">{g.kode_guru}</span>}
                  <span className="ml-2 text-xs text-gray-400">· {g.tugas.length} tugas</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Mapel — Kelas</th>
                        <th className="px-4 py-2 text-center font-medium text-gray-600 dark:text-gray-300">Siswa</th>
                        <th className="px-4 py-2 text-center font-medium text-gray-600 dark:text-gray-300">Harian</th>
                        <th className="px-4 py-2 text-center font-medium text-gray-600 dark:text-gray-300">STS</th>
                        <th className="px-4 py-2 text-center font-medium text-gray-600 dark:text-gray-300">SAS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {g.tugas.map(t => (
                        <tr key={`${t.mapel_id}::${t.rombel_id}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                          <td className="px-4 py-2 text-gray-900 dark:text-white">
                            {t.mapel_nama} <span className="text-gray-400">— {t.rombel_nama}</span>
                          </td>
                          <td className="px-4 py-2 text-center text-gray-600 dark:text-gray-400">{t.total}</td>
                          <td className="px-4 py-2 text-center"><Cell filled={t.harian} total={t.total} /></td>
                          <td className="px-4 py-2 text-center"><Cell filled={t.sts} total={t.total} /></td>
                          <td className="px-4 py-2 text-center"><Cell filled={t.sas} total={t.total} /></td>
                        </tr>
                      ))}
                      {g.tugas.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-3 text-center text-gray-400">Belum ada penugasan</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
