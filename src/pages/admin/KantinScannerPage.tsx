import { useState, useEffect, useRef } from 'react'
import { QrCode, Loader2, CheckCircle, X, User, CreditCard, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { Html5Qrcode } from 'html5-qrcode'

export default function KantinScannerPage() {
  const [scanning, setScanning] = useState(false)
  const [qrToken, setQrToken] = useState('')
  const [pin, setPin] = useState('')
  const [student, setStudent] = useState<{id: string, nama: string, nis: string, saldo: number} | null>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [scanBusy, setScanBusy] = useState(false)
  const [lastQr, setLastQr] = useState('')
  const [loadingOrders, setLoadingOrders] = useState(false)
  const qrRef = useRef<Html5Qrcode | null>(null)

  const loadPendingOrders = async (studentId: string) => {
    setLoadingOrders(true)
    try {
      const res = await api.get('/kantin/orders', { params: { student_id: studentId, status: 'pending', limit: 20 } })
      setOrders(res.data)
      if (res.data.length > 0) setSelectedOrderId(res.data[0].id)
    } catch { toast.error('Gagal memuat order pending') }
    finally { setLoadingOrders(false) }
  }

  const startScanner = async () => {
    setScanning(true)
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode('qr-reader')
        qrRef.current = scanner
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          async (text) => {
            if (scanBusy || text === lastQr) return
            setScanBusy(true)
            setLastQr(text)
            setQrToken(text)
            try {
              const res = await api.post('/kantin/scan', { qr_token: text, pin: '' })
              if (res.data.student_id) {
                setStudent({ id: res.data.student_id, nama: '', nis: '', saldo: res.data.saldo })
                // Get student details
                const siswaRes = await api.get('/siswa/' + res.data.student_id)
                setStudent({ id: res.data.student_id, nama: siswaRes.data.nama, nis: siswaRes.data.nis, saldo: res.data.saldo })
                loadPendingOrders(res.data.student_id)
                toast.success(`Siswa: ${siswaRes.data.nama} (Saldo: Rp ${res.data.saldo.toLocaleString('id-ID')})`)
              }
            } catch (err: any) {
              toast.error(err.response?.data?.error || 'QR tidak valid')
            } finally {
              setTimeout(() => { setScanBusy(false); setLastQr('') }, 1200)
            }
          },
          () => {}
        )
      } catch (e: any) {
        toast.error('Kamera tidak bisa dibuka: ' + e.message)
        setScanning(false)
      }
    }, 100)
  }

  const stopScanner = async () => {
    try { await qrRef.current?.stop() } catch {}
    try { qrRef.current?.clear() } catch {}
    qrRef.current = null
    setScanning(false)
  }

  const handleManualScan = async () => {
    if (!qrToken || !/^\d{6}$/.test(pin)) {
      return toast.error('QR token dan PIN 6 digit wajib diisi')
    }
    setScanBusy(true)
    try {
      const res = await api.post('/kantin/scan', { qr_token: qrToken, pin })
      if (res.data.student_id) {
        const siswaRes = await api.get('/siswa/' + res.data.student_id)
        setStudent({ id: res.data.student_id, nama: siswaRes.data.nama, nis: siswaRes.data.nis, saldo: res.data.saldo })
        loadPendingOrders(res.data.student_id)
        toast.success(`Siswa: ${siswaRes.data.nama} (Saldo: Rp ${res.data.saldo.toLocaleString('id-ID')})`)
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'QR atau PIN salah')
    } finally {
      setScanBusy(false)
    }
  }

  const handlePayOrder = async () => {
    if (!selectedOrderId || !student) return
    setScanBusy(true)
    try {
      const res = await api.post('/kantin/scan', { qr_token: qrToken, pin, order_id: selectedOrderId })
      toast.success('Pembayaran berhasil! Saldo: Rp ' + res.data.saldo.toLocaleString('id-ID'))
      setStudent({ ...student, saldo: res.data.saldo })
      loadPendingOrders(student.id)
      setSelectedOrderId(null)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal bayar')
    } finally {
      setScanBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Kasir Kantin - QR Scanner</h1>
          <p className="text-gray-500 text-sm mt-1">Scan QR siswa untuk cek saldo & bayar order</p>
        </div>
      </div>

      {/* Scanner Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* QR Scanner */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <QrCode size={20} className="text-primary" />
              Scanner QR Siswa
            </h3>
            
            {scanning ? (
              <div className="space-y-4">
                <div id="qr-reader" style={{ width: '100%', maxWidth: '100%' }} />
                <button onClick={stopScanner} className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center gap-2">
                  <X size={16} /> Stop Kamera
                </button>
              </div>
            ) : (
              <button onClick={startScanner} className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark flex items-center justify-center gap-2">
                <QrCode size={16} /> Buka Kamera
              </button>
            )}

            {/* Manual Input */}
            <div className="mt-6 p-4 border-t">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Atau Input Manual</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">QR Token</label>
                  <input
                    type="text"
                    value={qrToken}
                    onChange={e => setQrToken(e.target.value)}
                    placeholder="Scan QR atau paste token di sini"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">PIN 6 Digit</label>
                  <input
                    type="password"
                    value={pin}
                    onChange={e => setPin(e.target.value)}
                    placeholder="Masukkan PIN siswa"
                    maxLength={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-center"
                  />
                </div>
                <button onClick={handleManualScan} disabled={scanBusy} className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {scanBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode size={16} />} Cek Saldo
                </button>
              </div>
            </div>
          </div>

          {/* Student Info & Orders */}
          <div>
            {student ? (
              <div className="space-y-4">
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                      {student.nama.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 truncate">{student.nama}</p>
                      <p className="text-sm text-gray-500 font-mono">{student.nis}</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-primary/20 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">Saldo Cashless</p>
                      <p className="text-2xl font-bold text-green-600">Rp {student.saldo.toLocaleString('id-ID')}</p>
                    </div>
                    <button onClick={() => loadPendingOrders(student.id)} className="p-2 text-gray-500 hover:text-gray-700" title="Refresh">
                      <RefreshCw size={18} />
                    </button>
                  </div>
                </div>

                {/* Pending Orders */}
                <div>
                  <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <CreditCard size={18} />
                    Order Pending ({orders.length})
                  </h4>
                  {loadingOrders ? (
                    <div className="p-4 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
                  ) : orders.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg">Tidak ada order pending</div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {orders.map(order => {
                        const items = JSON.parse(order.items)
                        return (
                          <button
                            key={order.id}
                            onClick={() => setSelectedOrderId(order.id)}
                            className={`w-full text-left p-3 rounded-lg border transition-colors ${
                              selectedOrderId === order.id
                                ? 'border-primary bg-primary/5'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium text-gray-800">{items.map((i: any) => i.nama).join(', ')}</p>
                                <p className="text-xs text-gray-500">{items.reduce((s: number, i: any) => s + i.qty, 0)} item</p>
                              </div>
                              <span className="font-bold text-gray-800">Rp {order.total.toLocaleString('id-ID')}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(order.created_at).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Pay Button */}
                {selectedOrderId && student && (
                  <button
                    onClick={handlePayOrder}
                    disabled={scanBusy}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg text-lg font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {scanBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle size={20} />}
                    Bayar Order Terpilih
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <User size={48} className="mx-auto mb-4 opacity-50" />
                <p>Scan QR siswa untuk memulai</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}