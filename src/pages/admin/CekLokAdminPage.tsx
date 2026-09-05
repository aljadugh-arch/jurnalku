import { useState, useEffect } from 'react'
import { MapPin, Clock, CheckCircle, XCircle, Search, UserCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'
import { playFeedbackSound, primeFeedbackSound } from '../../lib/feedbackSound'

interface CeklokRecord {
  id: string
  guru_id: string
  guru_nama: string
  nip: string
  tanggal: string
  jam_masuk: string | null
  jam_keluar: string | null
  status: string
  latitude_masuk: number | null
  longitude_masuk: number | null
  jarak_masuk: number | null
  keterangan: string
}

interface Summary {
  hadir: number
  terlambat: number
  tidak_hadir: number
  total_guru: number
}

interface PersonalCeklok {
  today: { waktu_masuk?: string | null; waktu_pulang?: string | null; status?: string } | null
}

export default function CekLokAdminPage() {
  const today = todayWib()
  const [records, setRecords] = useState<CeklokRecord[]>([])
  const [summary, setSummary] = useState<Summary>({ hadir: 0, terlambat: 0, tidak_hadir: 0, total_guru: 0 })
  const [loading, setLoading] = useState(true)
  const [tanggal, setTanggal] = useState(today)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [personal, setPersonal] = useState<PersonalCeklok>({ today: null })
  const [personalLoading, setPersonalLoading] = useState(true)
  const [ceklokLoading, setCeklokLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await api.get('/ceklok/admin', {
        params: { tanggal, ...(filterStatus ? { status: filterStatus } : {}) }
      })
      setRecords(res.data.records || res.data)
      if (res.data.summary) setSummary(res.data.summary)
    } catch {
      toast.error('Gagal memuat data ceklok')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [tanggal, filterStatus])

  const fetchPersonal = async () => {
    setPersonalLoading(true)
    try {
      const res = await api.get('/guru/absensi-saya')
      setPersonal({ today: res.data.today || null })
    } catch {
      toast.error('Gagal memuat ceklok saya')
    } finally {
      setPersonalLoading(false)
    }
  }

  useEffect(() => { fetchPersonal() }, [])

  const handleCeklok = (type: 'masuk' | 'pulang') => {
    // Buka AudioContext saat klik; respons async tidak dianggap gestur pengguna.
    primeFeedbackSound()
    if (!navigator.geolocation) { playFeedbackSound('error'); return toast.error('Perangkat tidak mendukung lokasi') }
    setCeklokLoading(true)
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        await api.post('/guru/ceklok', { type, latitude: pos.coords.latitude, longitude: pos.coords.longitude })
        playFeedbackSound(type === 'masuk' ? 'masuk' : 'pulang')
        toast.success(`Ceklok ${type} berhasil`)
        await Promise.all([fetchPersonal(), fetchData()])
      } catch (err: any) {
        playFeedbackSound('error')
        toast.error(err.response?.data?.error || `Gagal ceklok ${type}`)
      } finally {
        setCeklokLoading(false)
      }
    }, err => {
      playFeedbackSound('error')
      toast.error(err.code === 1 ? 'Izin lokasi ditolak' : 'Lokasi tidak dapat dibaca')
      setCeklokLoading(false)
    }, { enableHighAccuracy: true, timeout: 15000 })
  }

  const filtered = records.filter(r =>
    r.guru_nama?.toLowerCase().includes(search.toLowerCase()) ||
    r.nip?.includes(search)
  )

  const statusConfig: Record<string, { label: string; color: string }> = {
    hadir: { label: 'Hadir', color: 'bg-green-100 text-green-700' },
    terlambat: { label: 'Terlambat', color: 'bg-amber-100 text-amber-700' },
    tidak_hadir: { label: 'Tidak Hadir', color: 'bg-red-100 text-red-700' },
    izin: { label: 'Izin', color: 'bg-blue-100 text-blue-700' },
    sakit: { label: 'Sakit', color: 'bg-purple-100 text-purple-700' },
  }

  const statCards = [
    { label: 'Hadir', value: summary.hadir, icon: <CheckCircle size={20} />, color: 'text-green-600 bg-green-100' },
    { label: 'Terlambat', value: summary.terlambat, icon: <Clock size={20} />, color: 'text-amber-600 bg-amber-100' },
    { label: 'Tidak Hadir', value: summary.tidak_hadir, icon: <XCircle size={20} />, color: 'text-red-600 bg-red-100' },
    { label: 'Total Guru', value: summary.total_guru, icon: <MapPin size={20} />, color: 'text-blue-600 bg-blue-100' },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Ceklok Guru</h1>
        <p className="text-gray-500 text-sm mt-1">Ceklok saya dan pantau kehadiran GTK berbasis geolokasi</p>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100 text-blue-600 shrink-0"><UserCheck size={20} /></div>
            <div>
              <h2 className="font-semibold text-gray-800">Ceklok / Absensi Saya</h2>
              {personalLoading ? <p className="text-sm text-gray-400 mt-1">Memuat...</p> : (
                <p className="text-sm text-gray-500 mt-1">Masuk: <b>{personal.today?.waktu_masuk || '-'}</b> · Pulang: <b>{personal.today?.waktu_pulang || '-'}</b></p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 w-full md:w-auto">
            <button type="button" disabled={ceklokLoading || !!personal.today?.waktu_masuk} onClick={() => handleCeklok('masuk')} className="px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-50">Ceklok Masuk</button>
            <button type="button" disabled={ceklokLoading || !!personal.today?.waktu_pulang} onClick={() => handleCeklok('pulang')} className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50">Ceklok Pulang</button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(s => (
          <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
              {s.icon}
            </div>
            <p className="text-2xl font-bold text-gray-800 mt-3">{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
        <input
          type="date"
          value={tanggal}
          onChange={e => setTanggal(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama guru / NIP..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { v: '', l: 'Semua' },
            { v: 'hadir', l: 'Hadir' },
            { v: 'terlambat', l: 'Terlambat' },
            { v: 'tidak_hadir', l: 'Tidak Hadir' },
          ].map(opt => (
            <button
              key={opt.v}
              onClick={() => setFilterStatus(opt.v)}
              className={`px-3 py-2 rounded-lg text-sm ${filterStatus === opt.v ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Desktop */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Guru</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">NIP</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Masuk</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Keluar</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Jarak</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Memuat...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Belum ada data ceklok untuk tanggal ini.</td></tr>
              )}
              {!loading && filtered.map(r => {
                const sc = statusConfig[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{r.guru_nama}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.nip || '-'}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{r.jam_masuk || '-'}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{r.jam_keluar || '-'}</td>
                    <td className="px-4 py-3 text-center text-gray-500">
                      {r.jarak_masuk != null ? `${r.jarak_masuk}m` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${sc.color}`}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.keterangan || '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="sm:hidden divide-y divide-gray-100">
          {loading && <p className="px-4 py-8 text-center text-gray-400 text-sm">Memuat...</p>}
          {!loading && filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-gray-400 text-sm">Belum ada data ceklok.</p>
          )}
          {!loading && filtered.map(r => {
            const sc = statusConfig[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-600' }
            return (
              <div key={r.id} className="p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-800">{r.guru_nama}</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${sc.color}`}>{sc.label}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{r.nip || '-'}</p>
                <div className="mt-1 flex gap-4 text-xs text-gray-500">
                  <span>Masuk: <b>{r.jam_masuk || '-'}</b></span>
                  <span>Keluar: <b>{r.jam_keluar || '-'}</b></span>
                  {r.jarak_masuk != null && <span>Jarak: <b>{r.jarak_masuk}m</b></span>}
                </div>
                {r.keterangan && <p className="mt-1 text-xs text-gray-400">{r.keterangan}</p>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
