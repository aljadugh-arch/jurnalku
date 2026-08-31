import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import api from '../../services/api'

export default function SiswaAbsensiPage() {
  const [absensi, setAbsensi] = useState<any[]>([])
  const [tab, setTab] = useState<'qr'|'mapel'|'jamaah'|'kokurikuler'|'ekskul'|'kegiatan'>('qr')
  const [category, setCategory] = useState<Record<string, any[]>>({ mapel: [], jamaah: [], kokurikuler: [], ekskul: [], kegiatan: [] })

  useEffect(() => {
    api.get('/siswa/absensi').then(res => setAbsensi(res.data)).catch(() => {})
    api.get('/siswa/dashboard').then(res => {
      setCategory({ mapel: res.data.mapel_detail || [], jamaah: res.data.jamaah_detail || [], kokurikuler: res.data.kokurikuler_detail || [], ekskul: res.data.ekskul_detail || [], kegiatan: res.data.kegiatan_lain_detail || [] })
    }).catch(() => {})
  }, [])

  const badge = (status: string) => {
    const styles: Record<string,string> = { hadir:'bg-green-100 text-green-700', sakit:'bg-yellow-100 text-yellow-700', izin:'bg-blue-100 text-blue-700', alpha:'bg-red-100 text-red-700' }
    return styles[status] || 'bg-gray-100 text-gray-700'
  }
  const icon = (s: string) => s==='hadir' ? <CheckCircle size={14} className="text-green-600"/> : s==='sakit' ? <AlertTriangle size={14} className="text-yellow-600"/> : s==='izin' ? <Clock size={14} className="text-blue-600"/> : <XCircle size={14} className="text-red-600"/>

  const tabs = [
    { key:'qr', label:'QR Masuk/Pulang', data: absensi },
    { key:'mapel', label:'Mata Pelajaran', data: category.mapel },
    { key:'jamaah', label:'Jamaah', data: category.jamaah },
    { key:'kokurikuler', label:'Kokurikuler', data: category.kokurikuler },
    { key:'ekskul', label:'Ekstrakurikuler', data: category.ekskul },
    { key:'kegiatan', label:'Kegiatan Lain', data: category.kegiatan },
  ] as const

  const current = tabs.find(t => t.key === tab)!

  return (
    <div className="space-y-4 pb-24 lg:pb-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Riwayat Absensi</h1>
        <p className="text-gray-500 text-sm mt-1">Rekap kehadiran kamu</p>
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map(t => <button key={t.key} onClick={() => setTab(t.key)} className={"px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap " + (tab===t.key ? 'bg-primary text-white' : 'bg-white border text-gray-600 hover:bg-gray-50')}>{t.label} ({t.data.length})</button>)}
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tanggal</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                {tab==='qr' && <><th className="text-left px-4 py-3 font-medium text-gray-600">Masuk</th><th className="text-left px-4 py-3 font-medium text-gray-600">Pulang</th></>}
                {tab!=='qr' && <th className="text-left px-4 py-3 font-medium text-gray-600">Konteks</th>}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {current.data.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Belum ada data</td></tr>}
              {current.data.map((a: any, i: number) => (
                <tr key={a.id || i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{a.tanggal}</td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1.5"><span className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium " + badge(a.status)}>{icon(a.status)} {tab === 'qr' ? `Masuk: ${a.status || '-'}` : (a.status || '-')}</span>{tab === 'qr' && a.status_pulang && <span className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium " + badge(a.status_pulang)}>{icon(a.status_pulang)} Pulang: {a.status_pulang}</span>}</div></td>
                  {tab==='qr' && <><td className="px-4 py-3 text-gray-600">{a.waktu_masuk || a.waktu_absen || '-'}</td><td className="px-4 py-3 text-gray-600">{a.waktu_pulang || '-'}</td></>}
                  {tab!=='qr' && <td className="px-4 py-3 text-gray-600">{a.mapel_nama || a.sesi_nama || a.ekskul_nama || a.kegiatan_nama || '-'}</td>}
                  <td className="px-4 py-3 text-gray-500">{a.keterangan || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
