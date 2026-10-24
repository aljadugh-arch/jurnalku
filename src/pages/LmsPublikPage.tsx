import { BookOpen } from 'lucide-react'
import LayananDetail from '../components/LayananDetail'

// Halaman publik "LMS" — fitur Jurnalku: materi ajar, penugasan digital, dan
// pengumpulan tugas + nilai (modul LMS/Penugasan Digital).

const fitur = [
  { judul: 'Materi Ajar', isi: 'Bagikan materi pelajaran ke kelas, lengkap dengan lampiran berkas.' },
  { judul: 'Penugasan Digital', isi: 'Guru membuat tugas dengan bobot dan lampiran; siswa melihatnya langsung.' },
  { judul: 'Pengumpulan Tugas', isi: 'Siswa mengumpulkan tugas daring; sistem mencatat waktu dan keterlambatan.' },
  { judul: 'Penilaian Terpusat', isi: 'Guru menilai hasil kerja siswa dan nilainya tercatat otomatis.' },
  { judul: 'Rekap per Kelas', isi: 'Lihat progres pengumpulan dan nilai per rombongan belajar.' },
  { judul: 'Akses Siswa & Wali', isi: 'Siswa melihat tugas dan nilai; wali murid memantau dari WhatsApp.' },
]

export default function LmsPublikPage() {
  return (
    <LayananDetail
      eyebrow="Layanan"
      title="LMS"
      subtitle="Learning Management System"
      desc="Materi ajar, penugasan digital, dan pengumpulan tugas dalam satu tempat. Guru memberi tugas dengan bobot dan lampiran, siswa mengumpulkan daring, dan nilainya tercatat otomatis."
      fitur={fitur}
      icon={BookOpen}
      active="LMS"
    />
  )
}
