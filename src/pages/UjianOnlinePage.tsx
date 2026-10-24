import { MonitorPlay } from 'lucide-react'
import LayananDetail from '../components/LayananDetail'

// Halaman publik "Ujian Online (CBT)" — fitur Jurnalku: bank soal, paket ujian,
// proktor, dan koreksi jawaban otomatis (AI+OCR).

const fitur = [
  { judul: 'Bank Soal', isi: 'Simpan soal pilihan ganda, esai, dan unggahan dalam satu tempat, dikelompokkan per mata pelajaran.' },
  { judul: 'Kisi-kisi Soal', isi: 'Susun kisi-kisi ujian sesuai kurikulum sebelum merakit paket soal.' },
  { judul: 'Paket Ujian', isi: 'Rakit paket ujian lengkap dengan token dan waktu pengerjaan.' },
  { judul: 'Monitor Proktor', isi: 'Pantau peserta ujian secara langsung dari dashboard proktor.' },
  { judul: 'Koreksi Otomatis', isi: 'Jawaban pilihan ganda dinilai otomatis; esai dibantu AI + OCR.' },
  { judul: 'Hasil Langsung', isi: 'Nilai langsung terlihat tanpa koreksi manual berjam-jam.' },
]

export default function UjianOnlinePage() {
  return (
    <LayananDetail
      eyebrow="Layanan"
      title="Ujian Online"
      subtitle="Computer Based Test"
      desc="Bank soal, paket ujian, token, dan penilaian otomatis dalam satu tempat. Proktor memantau ujian secara langsung, dan jawaban pilihan ganda dinilai seketika — tanpa koreksi manual."
      fitur={fitur}
      icon={MonitorPlay}
      active="Ujian Online"
    />
  )
}
