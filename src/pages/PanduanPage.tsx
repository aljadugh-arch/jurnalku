import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  School, ChevronDown, ArrowLeft, PlayCircle, Upload, Calendar,
  BookOpen, UserCog, Shield
} from 'lucide-react'

interface Section {
  icon: any
  title: string
  content: { h: string; body: string[] }[]
}

const sections: Section[] = [
  {
    icon: School,
    title: '1. Registrasi & Setup Awal Lembaga',
    content: [
      {
        h: 'Daftar akun lembaga',
        body: [
          'Buka halaman /register, isi nama lembaga, email, dan password admin.',
          'Setelah submit, sistem otomatis membuat sub-domain lembaga (contoh: namalembaga.jurnal.cc.cd) dan akun Admin Lembaga (operator) pertama.',
          'Login pakai email + password yang didaftarkan tadi.',
        ],
      },
      {
        h: 'Lengkapi Pengaturan (Settings)',
        body: [
          'Menu Pengaturan → isi Nama Lembaga, Alamat, Telepon, Email, Logo.',
          'Pilih Jenjang (RA/MI/MTs/MA-MAK) — menentukan penamaan tingkat kelas otomatis dan durasi 1 JTM sesuai KMA 736/2026 (RA 30 menit, MI 35 menit, MTs 40 menit, MA/MAK 45 menit).',
          'Atur Hari Libur (centang hari apa saja yang libur, default Jumat & Minggu) — jadwal otomatis menyesuaikan.',
          'Atur warna tema (primary/accent/sidebar) dan lokasi GPS lembaga (untuk absensi geolokasi).',
        ],
      },
      {
        h: 'Buat Tahun Ajaran',
        body: [
          'Menu Tahun Ajaran → tambah tahun ajaran & semester aktif (contoh: 2026/2027 Ganjil).',
          'Tahun ajaran aktif dipakai sebagai acuan default di Jadwal, Rapor, dan laporan.',
        ],
      },
    ],
  },
  {
    icon: Upload,
    title: '2. Isi & Upload Data Master (Siswa, GTK, Mapel, Rombel)',
    content: [
      {
        h: 'Alur umum import Excel (berlaku utk Siswa, GTK, Mapel)',
        body: [
          'Buka menu terkait (Data Siswa / Data GTK / Mapel) → klik tombol Import Excel.',
          'Di dalam modal, klik Download Template untuk mengunduh format kolom yang benar (header wajib sama persis, tidak boleh diubah urutannya).',
          'Isi template dengan data, simpan, lalu upload lewat modal yang sama.',
          'Sistem menampilkan preview data yang berhasil terbaca sebelum disimpan — cek dulu sebelum klik Import.',
          'Jika ada baris gagal (kolom kosong wajib, format salah), sistem menampilkan pesan error spesifik per masalah.',
        ],
      },
      {
        h: 'Data Siswa',
        body: [
          'Kolom wajib: NIS, Nama, Jenis Kelamin, Kode Rombel (harus sudah ada rombelnya, dibuat dulu di menu Rombel).',
          'Bisa juga tambah manual satu-satu lewat tombol Tambah Siswa.',
        ],
      },
      {
        h: 'Data GTK (Guru & Tenaga Kependidikan)',
        body: [
          'Kolom wajib: NIP/NUPTK, Nama, Jabatan (guru/kepala/staf), No HP, Email (opsional).',
          'Setelah data GTK masuk, admin bisa generate akun login untuk guru lewat tombol Buat Akun dari GTK — password default memakai NIP atau No HP guru.',
        ],
      },
      {
        h: 'Mata Pelajaran (Mapel)',
        body: [
          'Kolom wajib: Kode Mapel, Nama Mapel, Kelompok (Umum/Agama/Muatan Lokal), KKM.',
        ],
      },
      {
        h: 'Rombel (Rombongan Belajar / Kelas)',
        body: [
          'Buat rombel dulu sebelum import siswa — pilih Tingkat, nama otomatis mengikuti Jenjang (RA: A,B / MI-MTs-MA: angka romawi + paralel).',
          'Tetapkan Wali Kelas per rombel dari daftar GTK yang sudah dientri.',
        ],
      },
    ],
  },
  {
    icon: Calendar,
    title: '3. Jadwal Pelajaran',
    content: [
      {
        h: 'Tambah jadwal',
        body: [
          'Menu Jadwal → pilih Rombel → klik Tambah Jadwal.',
          'Pilih Mapel, Guru, Hari (otomatis skip hari libur sesuai Pengaturan), dan Ruangan.',
          'Jam Mulai / Jam Selesai bisa diisi bebas (tidak terpaku ke slot baku) — sistem hanya menampilkan info referensi durasi 1 JTM sesuai jenjang sebagai panduan.',
          'Sistem otomatis mendeteksi tabrakan jadwal (guru mengajar 2 kelas di jam sama, atau kelas bentrok 2 mapel) — klik Cek Tabrakan kapan saja.',
        ],
      },
      {
        h: 'Export jadwal',
        body: [
          'Tombol Excel: export jadwal per rombel yang sedang dipilih.',
          'Tombol Master Excel (Semua Rombel): export 1 file berisi semua rombel berdampingan plus rekap otomatis jam mengajar tiap guru per hari dan totalnya — cocok untuk ditempel di kantor/dicetak.',
          'Tombol PDF: cetak jadwal per rombel langsung dari browser.',
        ],
      },
    ],
  },
  {
    icon: BookOpen,
    title: '4. Jurnal Mengajar, Absensi & Kegiatan',
    content: [
      {
        h: 'Jurnal Mengajar (untuk Guru)',
        body: [
          'Guru login dengan akun masing-masing → menu Jurnal → catat materi, kompetensi dasar, dan kegiatan pembelajaran harian sesuai jadwal mengajarnya.',
          'Modul Ajar bisa dibuat manual atau dibantu AI (isi topik, sistem generate draf modul ajar otomatis).',
        ],
      },
      {
        h: 'Absensi',
        body: [
          'Absensi Siswa: per rombel per hari, guru/wali kelas tandai Hadir/Sakit/Izin/Alpa.',
          'Absensi Guru: metode QR Code, GPS Geolokasi (radius diatur di Pengaturan), atau selfie — anti titip absen.',
          'Absensi Ekskul & Kegiatan Kokurikuler: sama alurnya, dipisah per jenis kegiatan.',
        ],
      },
      {
        h: 'Keuangan (Tagihan & Tabungan)',
        body: [
          'Menu Tagihan: buat Jenis Tagihan (SPP, uang gedung, dll), assign ke siswa, catat pembayaran.',
          'Menu Tabungan: catat setor/tarik tabungan siswa per rombel.',
        ],
      },
    ],
  },
  {
    icon: UserCog,
    title: '5. Setting Akun Pengguna & Hak Akses',
    content: [
      {
        h: 'Role yang tersedia',
        body: [
          'Admin Lembaga (operator): akses penuh semua menu, kelola data master, jadwal, keuangan, pengaturan.',
          'Kepala Sekolah: akses supervisi, laporan, rekap absensi — tanpa edit data master.',
          'Guru: akses jurnal mengajar, input nilai/absensi kelas yang diampu.',
          'Wali Kelas: seperti guru, plus akses rekap rombel yang diwalikan.',
          'Siswa: akses lihat jadwal, nilai, absensi, dan tagihan pribadi.',
        ],
      },
      {
        h: 'Membuat akun pengguna baru',
        body: [
          'Guru/Kepala/Wali Kelas: dibuat otomatis dari data GTK via tombol Buat Akun dari GTK di menu Data GTK.',
          'Siswa: akun siswa dibuat oleh admin lewat menu User Management, terhubung ke NIS siswa yang sudah diinput.',
          'Admin tambahan: menu User Management → Tambah User → pilih role Admin.',
        ],
      },
      {
        h: 'Ganti password & profil',
        body: [
          'Setiap user bisa ganti password sendiri lewat menu Ganti Password setelah login.',
          'Update foto profil & data pribadi lewat menu Profil.',
        ],
      },
    ],
  },
  {
    icon: Shield,
    title: '6. Domain Custom & WhatsApp Gateway (Opsional)',
    content: [
      {
        h: 'Domain sendiri',
        body: [
          'Menu Domain Setup → masukkan domain custom lembaga (misal: jurnal.sekolah-anda.id).',
          'Arahkan DNS domain ke server sesuai instruksi yang ditampilkan, tunggu verifikasi otomatis.',
        ],
      },
      {
        h: 'Notifikasi WhatsApp',
        body: [
          'Menu WA Gateway → hubungkan nomor WhatsApp lembaga.',
          'Menu Notif Settings → atur notifikasi otomatis apa saja yang dikirim ke wali murid (absensi, tagihan, dll) dan menu Broadcast untuk kirim pesan massal.',
        ],
      },
    ],
  },
]

export default function PanduanPage() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-gray-700 hover:text-gray-900 font-medium text-sm">
            <ArrowLeft size={18} /> Kembali ke Beranda
          </Link>
          <Link to="/register" className="px-4 py-2 bg-gray-900 text-white rounded-full text-sm font-semibold hover:bg-gray-800">
            Daftar Gratis Coba Sekarang
          </Link>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-3">Panduan Penggunaan JURNALKU</h1>
          <p className="text-gray-500">Dokumentasi lengkap: dari registrasi lembaga sampai kelola akun pengguna.</p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 mb-10 flex items-center gap-4 text-white">
          <PlayCircle size={36} className="text-red-500 shrink-0" />
          <div>
            <p className="font-semibold">Video Tutorial YouTube</p>
            <p className="text-gray-400 text-sm">Coming Soon — sementara ikuti panduan tertulis di bawah ini.</p>
          </div>
        </div>

        <div className="space-y-3">
          {sections.map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50"
              >
                <span className="flex items-center gap-3 font-semibold text-gray-800">
                  <s.icon size={20} className="text-primary shrink-0" /> {s.title}
                </span>
                <ChevronDown size={18} className={`text-gray-400 shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} />
              </button>
              {open === i && (
                <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
                  {s.content.map((c, j) => (
                    <div key={j}>
                      <h4 className="font-medium text-gray-800 mb-1.5 text-sm">{c.h}</h4>
                      <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 marker:text-primary">
                        {c.body.map((b, k) => <li key={k}>{b}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 bg-primary/5 border border-primary/20 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-600 mb-1">Masih ada pertanyaan atau butuh bantuan setup?</p>
          <p className="text-sm text-gray-500">Coba dulu di akun demo (lihat bagian "Coba Demo" di halaman utama) untuk eksplorasi semua fitur sebelum registrasi.</p>
        </div>
      </div>
    </div>
  )
}
