import { MessageCircle } from 'lucide-react'
import LayananDetail from '../components/LayananDetail'

// Halaman publik "Notifikasi WhatsApp" — fitur Jurnalku: kabar kehadiran, nilai,
// dan tagihan dikirim otomatis ke WhatsApp wali murid (tanpa pasang aplikasi).

const fitur = [
  { judul: 'Kabar Kehadiran', isi: 'Wali murid menerima pemberitahuan kehadiran anaknya langsung ke WhatsApp.' },
  { judul: 'Nilai & Rapor', isi: 'Informasi nilai dan progres belajar terkirim otomatis ke wali.' },
  { judul: 'Tagihan & Pembayaran', isi: 'Notifikasi tagihan SPP dan bukti pembayaran sampai ke WhatsApp.' },
  { judul: 'Broadcast Pengumuman', isi: 'Kirim pengumuman massal ke banyak nomor sekaligus.' },
  { judul: 'Tanpa Aplikasi', isi: 'Wali murid cukup membaca pesan — tidak perlu memasang aplikasi apa pun.' },
  { judul: 'Nomor Lembaga', isi: 'Kirim lewat nomor resmi lembaga, bukan nomor asing.' },
]

export default function WhatsAppPublikPage() {
  return (
    <LayananDetail
      eyebrow="Layanan"
      title="Notifikasi WhatsApp"
      subtitle="Kabar ke Wali Murid"
      desc="Kehadiran, nilai, dan tagihan terkirim otomatis ke WhatsApp wali murid — tanpa perlu aplikasi tambahan. Wali murid tahu kabar anaknya tanpa harus datang ke sekolah."
      fitur={fitur}
      icon={MessageCircle}
      active="WhatsApp"
    />
  )
}
