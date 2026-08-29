import { Link } from 'react-router-dom'
import { Building2, ClipboardCheck, QrCode, ReceiptText, ScanLine } from 'lucide-react'

const modules = [
  { path: '/admin/cashless-topup', label: 'Verifikasi Topup', description: 'Periksa dan setujui laporan topup manual siswa.', icon: ClipboardCheck },
  { path: '/admin/cashless-bank-config', label: 'Transfer Bank & QRIS', description: 'Atur rekening tujuan dan QRIS lembaga.', icon: Building2 },
  { path: '/admin/kantin-menu', label: 'Menu Kantin', description: 'Kelola produk, harga, dan ketersediaan menu.', icon: ReceiptText },
  { path: '/admin/kantin-orders', label: 'Order Kantin', description: 'Pantau pesanan serta status pembayaran.', icon: QrCode },
  { path: '/admin/kantin-scanner', label: 'Kasir QR Scanner', description: 'Proses transaksi di kasir dengan pemindai QR.', icon: ScanLine },
]

export default function CashlessPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-800">Portal Cashless</h1>
        <p className="text-gray-500 mt-1">Akses cepat ke modul cashless dan E-Kantin yang tersedia.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {modules.map(({ path, label, description, icon: Icon }) => (
          <Link key={path} to={path} className="group bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:border-primary/30 hover:shadow-md transition-all">
            <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-white transition-colors">
              <Icon size={21} />
            </div>
            <h2 className="font-semibold text-gray-800">{label}</h2>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
