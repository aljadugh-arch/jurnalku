import { useState, useEffect } from 'react'
import { Search, RefreshCw, CheckCircle, XCircle, Loader2, FileText, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface TopupManual {
  id: string
  tenant_id: string
  student_id: string
  amount: number
  bukti_transfer: string | null
  bank_dari: string
  no_rek_dari: string
  atas_nama: string
  status: string
  verified_by: string | null
  verified_at: string | null
  catatan: string | null
  created_at: string
  nis: string
  siswa_nama: string
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Menunggu Verifikasi',
  verified: 'Terverifikasi',
  rejected: 'Ditolak'
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  verified: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700'
}

export default function CashlessTopupPage() {
  const [topups, setTopups] = useState<TopupManual[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedTopup, setSelectedTopup] = useState<TopupManual | null>(null)
  const [verifyLoading, setVerifyLoading] = useState<string | null>(null)

  const fetchTopups = async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      params.append('limit', '100')
      const res = await api.get('/cashless/topup/manual', { params })
      setTopups(res.data)
    } catch { toast.error('Gagal memuat topup manual') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchTopups() }, [statusFilter])

  const handleVerify = async (topup: TopupManual, status: 'verified' | 'rejected') => {
    setVerifyLoading(topup.id)
    try {
      await api.put('/cashless/topup/manual/' + topup.id + '/verify', { status })
      toast.success('Topup ' + (status === 'verified' ? 'diverifikasi' : 'ditolak'))
      fetchTopups()
      setSelectedTopup(null)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal verifikasi')
    } finally {
      setVerifyLoading(null)
    }
  }

  const filteredTopups = topups.filter(t =>
    t.siswa_nama.toLowerCase().includes(search.toLowerCase()) ||
    t.nis.includes(search) ||
    t.id.includes(search) ||
    t.bank_dari.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Verifikasi Topup Manual</h1>
          <p className="text-gray-500 text-sm mt-1">Verifikasi bukti transfer bank dari siswa/orang tua</p>
        </div>
        <button onClick={fetchTopups} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama siswa, NIS, bank, atau ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[200px]"
        >
          <option value="">Semua Status</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /><p className="mt-2 text-gray-500">Memuat...</p></div>
        ) : filteredTopups.length === 0 ? (
          <div className="p-12 text-center text-gray-500">Tidak ada topup yang cocok</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Siswa</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Nominal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Bank / Rekening</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Bukti</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Waktu</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTopups.map(topup => (
                  <tr key={topup.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{topup.id.slice(0,8)}...</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{topup.siswa_nama}</p>
                      <p className="text-xs text-gray-500 font-mono">{topup.nis}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-800">Rp {topup.amount.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-700">{topup.bank_dari || '-'}</p>
                      <p className="text-xs text-gray-500 font-mono">{topup.no_rek_dari || '-'}</p>
                      <p className="text-xs text-gray-500">a.n. {topup.atas_nama || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {topup.bukti_transfer ? (
                        <button onClick={() => setSelectedTopup(topup)} className="flex items-center gap-1 px-3 py-1.5 text-primary hover:bg-primary/10 rounded-lg text-sm">
                          <FileText size={14} /> Lihat
                        </button>
                      ) : (
                        <span className="text-gray-400 text-sm">Tidak ada</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[topup.status] || 'bg-gray-100 text-gray-700'}`}>
                        {STATUS_LABELS[topup.status] || topup.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-500">
                      {new Date(topup.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setSelectedTopup(topup)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Detail">
                          <Eye size={16} />
                        </button>
                        {topup.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleVerify(topup, 'verified')}
                              disabled={verifyLoading === topup.id}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"
                              title="Verifikasi"
                            >
                              <CheckCircle size={16} />
                            </button>
                            <button
                              onClick={() => handleVerify(topup, 'rejected')}
                              disabled={verifyLoading === topup.id}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                              title="Tolak"
                            >
                              <XCircle size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedTopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Detail Topup #{selectedTopup.id.slice(0,8)}</h2>
              <button onClick={() => setSelectedTopup(null)} className="p-1 hover:bg-gray-100 rounded"><XCircle size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Siswa</p>
                  <p className="font-medium">{selectedTopup.siswa_nama}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">NIS</p>
                  <p className="font-mono">{selectedTopup.nis}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Nominal</p>
                  <p className="font-bold text-lg text-green-600">Rp {selectedTopup.amount.toLocaleString('id-ID')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[selectedTopup.status] || 'bg-gray-100 text-gray-700'}`}>
                    {STATUS_LABELS[selectedTopup.status] || selectedTopup.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Bank Pengirim</p>
                  <p>{selectedTopup.bank_dari || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">No. Rekening</p>
                  <p className="font-mono">{selectedTopup.no_rek_dari || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Atas Nama</p>
                  <p>{selectedTopup.atas_nama || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Waktu Request</p>
                  <p>{new Date(selectedTopup.created_at).toLocaleString('id-ID')}</p>
                </div>
                {selectedTopup.verified_at && (
                  <div>
                    <p className="text-xs text-gray-500">Waktu Verifikasi</p>
                    <p>{new Date(selectedTopup.verified_at).toLocaleString('id-ID')}</p>
                  </div>
                )}
              </div>
              {selectedTopup.bukti_transfer && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Bukti Transfer</p>
                  <img src={selectedTopup.bukti_transfer} alt="Bukti transfer" className="max-w-full h-auto rounded-lg border" />
                </div>
              )}
              {selectedTopup.catatan && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">Catatan Verifikasi</p>
                  <p className="text-sm">{selectedTopup.catatan}</p>
                </div>
              )}
              <div className="flex gap-3 pt-4 border-t">
                {selectedTopup.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleVerify(selectedTopup, 'verified')}
                      disabled={verifyLoading === selectedTopup.id}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                    >
                      {verifyLoading === selectedTopup.id ? 'Memproses...' : '✓ Verifikasi'}
                    </button>
                    <button
                      onClick={() => handleVerify(selectedTopup, 'rejected')}
                      disabled={verifyLoading === selectedTopup.id}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
                    >
                      ✗ Tolak
                    </button>
                  </>
                )}
                <button onClick={() => setSelectedTopup(null)} className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Tutup</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}