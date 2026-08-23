import { useState, useEffect } from 'react'
import { Search, RefreshCw, CheckCircle, XCircle, Loader2, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface KantinOrder {
  id: string
  tenant_id: string
  student_id: string
  items: string
  total: number
  status: string
  payment_method: string
  paid_at: string | null
  created_at: string
  completed_at: string | null
  nis: string
  siswa_nama: string
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Menunggu',
  paid: 'Dibayar',
  preparing: 'Disiapkan',
  ready: 'Siap Diambil',
  completed: 'Selesai',
  cancelled: 'Dibatalkan'
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-blue-100 text-blue-700',
  preparing: 'bg-orange-100 text-orange-700',
  ready: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700'
}

export default function KantinOrdersPage() {
  const [orders, setOrders] = useState<KantinOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [studentFilter, setStudentFilter] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<KantinOrder | null>(null)

  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (studentFilter) params.append('student_id', studentFilter)
      params.append('limit', '100')
      const res = await api.get('/kantin/orders', { params })
      setOrders(res.data)
    } catch { toast.error('Gagal memuat order kantin') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchOrders() }, [statusFilter, studentFilter])

  const handleStatusChange = async (order: KantinOrder, newStatus: string) => {
    try {
      await api.put('/kantin/orders/' + order.id + '/status', { status: newStatus })
      toast.success('Status order diperbarui')
      fetchOrders()
      if (selectedOrder?.id === order.id) setSelectedOrder(null)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal update status')
    }
  }

  const getItemsPreview = (itemsJson: string) => {
    try {
      const items = JSON.parse(itemsJson)
      return items.map((i: any) => `${i.nama} x${i.qty}`).join(', ')
    } catch { return '-' }
  }

  const filteredOrders = orders.filter(o =>
    o.siswa_nama.toLowerCase().includes(search.toLowerCase()) ||
    o.nis.includes(search) ||
    o.id.includes(search)
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Order Kantin</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola dan pantau pesanan kantin siswa</p>
        </div>
        <button onClick={fetchOrders} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama siswa, NIS, atau ID order..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[180px]"
        >
          <option value="">Semua Status</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <input
          type="text"
          placeholder="Filter ID Siswa (opsional)"
          value={studentFilter}
          onChange={e => setStudentFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[180px]"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /><p className="mt-2 text-gray-500">Memuat...</p></div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">Tidak ada order yang cocok</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Order ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Siswa</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Items</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Pembayaran</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Waktu</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{order.id.slice(0,8)}...</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{order.siswa_nama}</p>
                      <p className="text-xs text-gray-500 font-mono">{order.nis}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">{getItemsPreview(order.items)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-800">Rp {order.total.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize">
                        {order.payment_method === 'cashless' ? 'Cashless' : order.payment_method === 'cash' ? 'Tunai' : 'Manual'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-700'}`}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-500">
                      {new Date(order.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setSelectedOrder(order)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Detail">
                          <Eye size={16} />
                        </button>
                        {order.status !== 'completed' && order.status !== 'cancelled' && (
                          <select
                            value={order.status}
                            onChange={e => handleStatusChange(order, e.target.value)}
                            className="px-2 py-1 text-xs border rounded bg-white"
                          >
                            {Object.entries(STATUS_LABELS).map(([key, label]) =>
                              <option key={key} value={key}>{label}</option>
                            )}
                          </select>
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
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Detail Order #{selectedOrder.id.slice(0,8)}</h2>
              <button onClick={() => setSelectedOrder(null)} className="p-1 hover:bg-gray-100 rounded"><XCircle size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Siswa</p>
                  <p className="font-medium">{selectedOrder.siswa_nama}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">NIS</p>
                  <p className="font-mono">{selectedOrder.nis}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="font-bold text-lg">Rp {selectedOrder.total.toLocaleString('id-ID')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Pembayaran</p>
                  <p className="capitalize">{selectedOrder.payment_method}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[selectedOrder.status] || 'bg-gray-100 text-gray-700'}`}>
                    {STATUS_LABELS[selectedOrder.status] || selectedOrder.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Waktu Order</p>
                  <p>{new Date(selectedOrder.created_at).toLocaleString('id-ID')}</p>
                </div>
                {selectedOrder.paid_at && (
                  <div>
                    <p className="text-xs text-gray-500">Waktu Bayar</p>
                    <p>{new Date(selectedOrder.paid_at).toLocaleString('id-ID')}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2">Items</p>
                <div className="border rounded-lg overflow-hidden">
                  {JSON.parse(selectedOrder.items).map((item: any, idx: number) => (
                    <div key={idx} className="px-4 py-3 flex justify-between border-b last:border-0 bg-gray-50">
                      <span>{item.nama} x{item.qty}</span>
                      <span className="font-mono">Rp {item.subtotal.toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t">
                {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                  <>
                    <select
                      value={selectedOrder.status}
                      onChange={e => handleStatusChange(selectedOrder, e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    >
                      {Object.entries(STATUS_LABELS).map(([key, label]) =>
                        <option key={key} value={key}>{label}</option>
                      )}
                    </select>
                  </>
                )}
                <button onClick={() => setSelectedOrder(null)} className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Tutup</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}