import { useEffect, useMemo, useState } from 'react'
import { Building2, Users, ArrowRight, Search, RefreshCw, Wallet, Receipt, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface FoundationTenant {
  id: string
  slug: string
  nama: string
  domain_custom: string | null
  aktif: number
  is_self?: boolean
}

interface Siswa {
  id: string
  nama: string
  nis: string
  nisn?: string
  rombel_nama?: string
  tenant_nama?: string
  tenant_slug?: string
  jenis_kelamin?: string
}

export default function FoundationSyncPage() {
  const [tenants, setTenants] = useState<FoundationTenant[]>([])
  const [sourceTenant, setSourceTenant] = useState('')
  const [siswaList, setSiswaList] = useState<Siswa[]>([])
  const [loadingSiswa, setLoadingSiswa] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)
  const [keuangan, setKeuangan] = useState<{ tagihan: any[]; saldo: any[] } | null>(null)
  const [loadingKeuangan, setLoadingKeuangan] = useState(false)
  const [tab, setTab] = useState<'sync' | 'keuangan'>('sync')

  const loadTenants = async () => {
    try {
      const { data } = await api.get('/foundations/tenants')
      setTenants(Array.isArray(data) ? data : [])
    } catch { setTenants([]) }
  }

  const loadSiswa = async (tenantId: string) => {
    if (!tenantId) { setSiswaList([]); return }
    setLoadingSiswa(true)
    try {
      const { data } = await api.get('/foundation/students', { params: { tenant_id: tenantId, limit: 500 } })
      setSiswaList(Array.isArray(data) ? data : [])
      setSelected(new Set())
      setSyncResult(null)
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal memuat siswa'); setSiswaList([]) }
    finally { setLoadingSiswa(false) }
  }

  const loadKeuangan = async () => {
    setLoadingKeuangan(true)
    try {
      const { data } = await api.get('/foundation/keuangan')
      setKeuangan(data)
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal memuat keuangan'); setKeuangan(null) }
    finally { setLoadingKeuangan(false) }
  }

  useEffect(() => { loadTenants() }, [])
  useEffect(() => { if (sourceTenant) loadSiswa(sourceTenant) }, [sourceTenant])
  useEffect(() => { if (tab === 'keuangan') loadKeuangan() }, [tab])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return siswaList
    return siswaList.filter(s => (s.nama || '').toLowerCase().includes(q) || (s.nis || '').includes(q) || (s.nisn || '').includes(q))
  }, [siswaList, search])

  const toggle = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(s => s.id)))
  }

  const doSync = async () => {
    if (!sourceTenant || selected.size === 0) { toast.error('Pilih lembaga sumber dan minimal satu siswa'); return }
    setSyncing(true)
    setSyncResult(null)
    try {
      const { data } = await api.post('/foundation/sync/siswa', { source_tenant_id: sourceTenant, siswa_ids: [...selected] })
      setSyncResult(data)
      toast.success(`Berhasil menarik ${data.imported} siswa`)
      setSelected(new Set())
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal sinkron') }
    finally { setSyncing(false) }
  }

  const otherTenants = tenants.filter(t => !t.is_self)
  const rupiah = (n: any) => 'Rp' + (Number(n) || 0).toLocaleString('id-ID')

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Integrasi Se-Yayasan</h1>
          <p className="text-gray-500 text-sm mt-1">Tarik data siswa dari lembaga lain dalam satu yayasan tanpa input ulang, dan lihat data lintas lembaga</p>
        </div>
      </div>

      {tenants.length === 0 ? (
        <div className="bg-white rounded-xl p-10 shadow-sm border border-gray-100 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Lembaga ini belum tergabung dalam yayasan.</p>
          <p className="text-sm text-gray-400 mt-1">Hubungi super admin platform untuk menggabungkan lembaga ke sebuah yayasan.</p>
        </div>
      ) : (
        <>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit">
            <button onClick={() => setTab('sync')} className={`px-4 py-2 text-sm font-medium ${tab === 'sync' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Sinkron Siswa</button>
            <button onClick={() => setTab('keuangan')} className={`px-4 py-2 text-sm font-medium ${tab === 'keuangan' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Keuangan Lintas Lembaga</button>
          </div>

          {tab === 'sync' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-2">Lembaga Sumber (se-yayasan)</label>
                <div className="flex flex-wrap gap-2">
                  {otherTenants.length === 0 && <p className="text-sm text-gray-400">Tidak ada lembaga lain dalam yayasan ini.</p>}
                  {otherTenants.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSourceTenant(t.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${sourceTenant === t.id ? 'border-primary bg-primary/10 text-primary' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                    >
                      <Building2 size={16} />{t.nama}
                    </button>
                  ))}
                </div>
              </div>

              {sourceTenant && (
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h2 className="font-semibold text-gray-800">Daftar Siswa Lembaga Sumber</h2>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama/NIS..." className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg" />
                      </div>
                      <button onClick={toggleAll} className="text-sm text-primary font-medium">{selected.size === filtered.length && filtered.length > 0 ? 'Batal pilih semua' : 'Pilih semua'}</button>
                    </div>
                  </div>

                  {loadingSiswa ? (
                    <p className="py-8 text-center text-sm text-gray-400">Memuat siswa...</p>
                  ) : filtered.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-400">Tidak ada siswa.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-gray-50 border-b">
                          <th className="text-left px-3 py-2 font-medium text-gray-600 w-10"><input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} /></th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Nama</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">NIS / NISN</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Rombel</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-100">
                          {filtered.map(s => (
                            <tr key={s.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2"><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} /></td>
                              <td className="px-3 py-2 font-medium text-gray-800">{s.nama}</td>
                              <td className="px-3 py-2 text-gray-600">{s.nis}{s.nisn ? ` / ${s.nisn}` : ''}</td>
                              <td className="px-3 py-2 text-gray-600">{s.rombel_nama || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-4">
                    <button onClick={doSync} disabled={syncing || selected.size === 0} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                      <ArrowRight className="w-4 h-4" />{syncing ? 'Menarik...' : `Tarik ${selected.size} Siswa`}
                    </button>
                    {syncResult && (
                      <span className="text-sm text-green-700 flex items-center gap-1">
                        <CheckCircle2 size={16} /> {syncResult.imported} siswa ditarik{syncResult.skippedNis ? `, ${syncResult.skippedNis} NIS bentrok dilewati` : ''}{syncResult.skippedNik ? `, ${syncResult.skippedNik} NIK bentrok dilewati` : ''}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'keuangan' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Receipt size={18} /> Tagihan Belum Dibayar (Semua Lembaga)</h2>
                  <button onClick={loadKeuangan} disabled={loadingKeuangan} className="text-sm text-primary flex items-center gap-1"><RefreshCw size={14} className={loadingKeuangan ? 'animate-spin' : ''} /> Muat ulang</button>
                </div>
                {loadingKeuangan ? <p className="py-6 text-center text-sm text-gray-400">Memuat...</p> : !keuangan?.tagihan?.length ? <p className="py-6 text-center text-sm text-gray-400">Tidak ada tagihan belum dibayar.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50 border-b">
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Lembaga</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Siswa</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Jenis</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Periode</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Nominal</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {keuangan.tagihan.map((t: any, i: number) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-600">{t.tenant_nama}</td>
                            <td className="px-3 py-2 font-medium text-gray-800">{t.siswa_nama}</td>
                            <td className="px-3 py-2 text-gray-600">{t.jenis_nama}</td>
                            <td className="px-3 py-2 text-gray-600">{t.bulan} {t.tahun}</td>
                            <td className="px-3 py-2 text-right text-gray-800 font-medium">{rupiah(t.nominal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-3"><Wallet size={18} /> Saldo Tabungan Siswa (Semua Lembaga)</h2>
                {loadingKeuangan ? <p className="py-6 text-center text-sm text-gray-400">Memuat...</p> : !keuangan?.saldo?.length ? <p className="py-6 text-center text-sm text-gray-400">Tidak ada data tabungan.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50 border-b">
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Lembaga</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Siswa</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">NIS</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Saldo</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {keuangan.saldo.map((s: any, i: number) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-600">{s.tenant_nama}</td>
                            <td className="px-3 py-2 font-medium text-gray-800">{s.siswa_nama}</td>
                            <td className="px-3 py-2 text-gray-600">{s.nis}</td>
                            <td className="px-3 py-2 text-right text-gray-800 font-medium">{rupiah(s.saldo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
