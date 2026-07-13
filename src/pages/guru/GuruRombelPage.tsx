import { useState, useEffect, useMemo } from 'react'
import { Users, GraduationCap, ClipboardList, UserCheck, Search, AlertCircle } from 'lucide-react'
import api from '../../services/api'
import { Card, StatCard, Badge, Avatar } from '../../components/ui'

export default function GuruRombelPage() {
  const [data, setData] = useState<any>({ gtk: null, rombels: [], siswa: [] })
  const [selectedRombel, setSelectedRombel] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/guru/wali-kelas').then(res => {
      setData(res.data)
      if (res.data.rombels?.length) setSelectedRombel(res.data.rombels[0].id)
    }).finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data.siswa || []).filter((s: any) => {
      if (selectedRombel && s.rombel_id !== selectedRombel) return false
      if (!q) return true
      return [s.nama, s.nis, s.nisn].some(v => String(v || '').toLowerCase().includes(q))
    })
  }, [data.siswa, selectedRombel, search])

  const rombel = data.rombels?.find((r: any) => r.id === selectedRombel)
  const laki = filtered.filter((s: any) => s.jenis_kelamin === 'L').length
  const perempuan = filtered.filter((s: any) => s.jenis_kelamin === 'P').length

  if (loading) return <div className="p-8 text-center text-gray-400">Memuat data wali kelas...</div>

  if (!data.rombels?.length) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Kelas Wali Saya</h1>
          <p className="text-gray-500 text-sm mt-1">Ringkasan rombel yang menjadi tanggung jawab wali kelas.</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800 flex gap-3">
          <AlertCircle className="shrink-0" size={22} />
          <div>
            <h3 className="font-semibold">Belum ditugaskan sebagai wali kelas</h3>
            <p className="text-sm mt-1">Admin perlu membuka menu Rombongan Belajar, lalu pilih GTK ini sebagai Wali Kelas.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary-dark p-5 text-white shadow-sm">
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar src={data.gtk?.foto || null} name={data.gtk?.nama} size={64} className="shrink-0 ring-2 ring-white/30" />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-white/75">Wali Kelas</p>
              <h1 className="text-2xl font-bold font-display truncate">{data.gtk?.nama || 'Guru'}</h1>
              <p className="text-sm text-white/80 truncate">Mengelola {data.rombels.length} rombel</p>
            </div>
          </div>
          <select value={selectedRombel} onChange={e => setSelectedRombel(e.target.value)} className="rounded-xl border border-white/20 bg-white/15 px-4 py-2 text-sm text-white outline-none backdrop-blur [&_option]:text-gray-800">
            {data.rombels.map((r: any) => <option key={r.id} value={r.id}>{r.nama} • {r.tahun_ajaran}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Rombel" value={rombel?.nama || '-'} icon={<Users size={18} />} gradient="from-blue-500 to-indigo-600" sub={rombel ? 'Tingkat ' + rombel.tingkat : ''} />
        <StatCard label="Total Siswa" value={filtered.length} icon={<GraduationCap size={18} />} gradient="from-green-500 to-emerald-600" />
        <StatCard label="Laki-laki" value={laki} icon={<UserCheck size={18} />} gradient="from-sky-500 to-cyan-600" />
        <StatCard label="Perempuan" value={perempuan} icon={<ClipboardList size={18} />} gradient="from-pink-500 to-rose-600" />
      </div>

      <Card title="Daftar Siswa Wali" icon={<Users size={18} className="text-primary" />}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama, NIS, NISN..." className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          {rombel && <Badge tone="blue">{rombel.nama} • {rombel.tahun_ajaran}</Badge>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.length === 0 && <p className="col-span-full py-8 text-center text-sm text-gray-400">Tidak ada siswa.</p>}
          {filtered.map((s: any) => (
            <div key={s.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {String(s.nama || 'S').charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-800 truncate">{s.nama}</h3>
                  <p className="text-xs text-gray-500 truncate">NIS {s.nis || '-'} • NISN {s.nisn || '-'}</p>
                </div>
                <Badge tone={s.jenis_kelamin === 'P' ? 'purple' : 'blue'}>{s.jenis_kelamin === 'P' ? 'P' : 'L'}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div className="rounded-lg bg-gray-50 p-2"><span className="block text-gray-400">TTL</span>{s.tempat_lahir || '-'}{s.tanggal_lahir ? ', ' + s.tanggal_lahir : ''}</div>
                <div className="rounded-lg bg-gray-50 p-2"><span className="block text-gray-400">Orang Tua</span>{s.nama_ortu || '-'}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
