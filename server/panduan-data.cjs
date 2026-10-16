'use strict'

// Data panduan pengguna Jurnalku — satu sumber untuk halaman /panduan.
//
// Struktur: kelompok per JENIS PENGGUNA (sesuai menu asli tiap role), tiap
// bagian memuat langkah bernomor, dan tiap bagian boleh punya gambar (path
// aset di /public/panduan/) serta video (embed YouTube). Gambar/video
// opsional — halaman tetap rapi walau belum ada aset.

/** Kelompok pengguna. `role` = kunci menu di src/lib/menuItems.tsx. */
const KELOMPOK = [
  {
    key: 'umum', nama: 'Umum & Mulai', icon: 'School',
    ringkas: 'Registrasi, login, dan mengenal antarmuka.',
    bagian: [
      {
        id: 'registrasi',
        judul: 'Registrasi Lembaga Baru',
        langkah: [
          'Buka halaman pendaftaran (tombol "Daftar" di halaman depan).',
          'Isi nama lembaga, nama admin, email aktif, dan nomor WhatsApp aktif.',
          'Pilih alamat: subdomain gratis (namalembaga.jurnal.cc.cd) atau domain sendiri milik lembaga.',
          'Kirim pendaftaran. Sistem otomatis membuat lembaga + akun admin pertama.',
          'Notifikasi berisi detail pendaftaran dikirim ke email dan WhatsApp yang didaftarkan.',
        ],
        catatan: 'Masa uji coba (trial) aktif otomatis. Cek folder spam bila email belum terlihat.',
        gambar: '/panduan/registrasi.png',
        video: '',
      },
      {
        id: 'login',
        judul: 'Login & Lupa Password',
        langkah: [
          'Buka alamat lembaga Anda, lalu masukkan email dan password.',
          'Setelah login, Anda diarahkan ke dashboard sesuai peran (admin, guru, bendahara, dst).',
          'Bila lupa password, gunakan tautan "Lupa password" di halaman login.',
        ],
        gambar: '/panduan/login.png',
      },
      {
        id: 'antarmuka',
        judul: 'Mengenal Antarmuka',
        langkah: [
          'Menu utama ada di sidebar kiri (di ponsel: tombol menu di kiri atas).',
          'Menu dengan tanda panah punya submenu — klik untuk membuka.',
          'Tombol profil di kanan atas untuk ganti mode guru, ubah profil, atau keluar.',
          'Tema terang/gelap dapat diubah dari tombol tema.',
        ],
        gambar: '/panduan/antarmuka.png',
      },
    ],
  },
  {
    key: 'admin', nama: 'Admin Lembaga', icon: 'Shield',
    ringkas: 'Pengaturan, data master, akademik, dan operasional harian.',
    bagian: [
      {
        id: 'pengaturan',
        judul: 'Pengaturan Lembaga',
        langkah: [
          'Buka menu Pengaturan.',
          'Isi identitas lembaga: nama, alamat, telepon, email, dan logo.',
          'Pilih jenjang (RA/MI/MTs/MA/MAK atau non-formal) — menentukan penamaan kelas dan durasi jam pelajaran.',
          'Atur hari libur, warna tema, dan titik koordinat lokasi lembaga untuk absensi geolokasi.',
          'Klik Simpan. Perubahan langsung berlaku untuk seluruh pengguna lembaga.',
        ],
        gambar: '/panduan/pengaturan.png',
        video: '',
      },
      {
        id: 'tahun-ajaran',
        judul: 'Tahun Ajaran',
        langkah: [
          'Buka menu Tahun Ajaran.',
          'Tambah tahun ajaran dan semester (mis. 2026/2027 Ganjil).',
          'Tandai satu tahun ajaran sebagai AKTIF — dipakai sebagai acuan jadwal, nilai, dan rapor.',
        ],
        gambar: '/panduan/tahun-ajaran.png',
      },
      {
        id: 'data-gtk',
        judul: 'Data GTK (Guru & Tenaga Kependidikan)',
        langkah: [
          'Buka menu Data GTK.',
          'Klik Tambah GTK, isi NIK/NIP/NUPTK, nama, jenis kelamin, jabatan, dan status kepegawaian.',
          'Status kepegawaian: PNS/ASN, PPPK, GTY (Guru Tetap Yayasan), GTT (Guru Tidak Tetap), Honorer, atau Tetap.',
          'Pilih sertifikasi: Sudah Sertifikasi atau Belum Sertifikasi; isi NRG bila ada.',
          'Simpan. Untuk memasukkan banyak sekaligus, gunakan Impor Excel (unduh template dulu).',
        ],
        catatan: 'Jabatan "Guru BK" tersedia terpisah dari "Guru" agar penugasan bimbingan konseling rapi.',
        gambar: '/panduan/data-gtk.png',
      },
      {
        id: 'data-siswa',
        judul: 'Data Siswa',
        langkah: [
          'Buat Rombel lebih dulu di menu Rombongan Belajar.',
          'Buka menu Data Siswa, klik Tambah Siswa atau Impor Excel.',
          'Kolom wajib: NIS, nama, jenis kelamin, dan kode rombel.',
          'Isi nomor WhatsApp wali bila ingin notifikasi absensi terkirim ke wali.',
        ],
        gambar: '/panduan/data-siswa.png',
      },
      {
        id: 'mapel-rombel',
        judul: 'Mata Pelajaran & Rombel',
        langkah: [
          'Menu Mata Pelajaran: tambah kode, nama, kelompok (Umum/Agama/Muatan Lokal), dan KKM.',
          'Menu Rombongan Belajar: tambah rombel, pilih tingkat, lalu tetapkan wali kelas dari daftar GTK.',
          'Nama rombel mengikuti jenjang secara otomatis.',
        ],
        gambar: '/panduan/mapel-rombel.png',
      },
      {
        id: 'jadwal',
        judul: 'Jadwal Pelajaran',
        langkah: [
          'Buka menu Jadwal Pelajaran → Kelola Jadwal.',
          'Pilih rombel, klik Tambah Jadwal, lalu pilih mapel, guru, hari, jam, dan ruangan.',
          'Hari libur otomatis tidak muncul sebagai pilihan.',
          'Klik Cek Tabrakan untuk memastikan tidak ada guru/kelas yang bentrok.',
          'Ekspor jadwal ke Excel atau PDF sesuai kebutuhan.',
        ],
        gambar: '/panduan/jadwal.png',
      },
      {
        id: 'absensi',
        judul: 'Absensi Siswa & Guru',
        langkah: [
          'Absensi QR Siswa: siswa memindai kartu/QR; admin memantau hasilnya.',
          'Absensi Guru (Geolokasi): guru melakukan ceklok dari lokasi lembaga.',
          'Rekapitulasi: lihat rekap harian, bulanan, dan per kelas.',
          'Kartu RFID: daftarkan kartu untuk absensi tap.',
        ],
        catatan: 'Hasil pindai QR diprioritaskan; hanya edit manual untuk status sakit, izin, atau alpa.',
        gambar: '/panduan/absensi.png',
      },
      {
        id: 'penilaian-rapor',
        judul: 'Penilaian & Rapor',
        langkah: [
          'Nilai harian, STS, dan SAS diisi guru dari akun masing-masing.',
          'Admin memantau lewat Rekap Nilai dan menetapkan bobot penilaian.',
          'Menu Rapor Siswa menghasilkan rapor per rombel; pilih semester dan klik Generate.',
          'Unduh rapor dalam bentuk PDF.',
        ],
        gambar: '/panduan/rapor.png',
      },
      {
        id: 'keuangan',
        judul: 'Keuangan: Tagihan, Tabungan & QRIS',
        langkah: [
          'Menu Tagihan & Pembayaran: buat jenis tagihan, lalu terbitkan tagihan ke siswa.',
          'Menu Tabungan Siswa: catat setoran dan penarikan tabungan.',
          'Menu Payment Gateway QRIS: isi kredensial gateway agar pembayaran QRIS aktif.',
          'Pembayaran yang masuk otomatis menandai tagihan lunas.',
        ],
        gambar: '/panduan/keuangan.png',
      },
      {
        id: 'wa-notif',
        judul: 'WhatsApp & Notifikasi Otomatis',
        langkah: [
          'Menu WhatsApp → Konfigurasi Gateway: sambungkan nomor WhatsApp lembaga dengan memindai QR.',
          'Menu Notifikasi Otomatis: aktifkan notifikasi yang diinginkan (absensi ke wali, pengingat ceklok guru, dsb).',
          'Atur template pesan agar sesuai gaya lembaga Anda.',
          'Menu Broadcast untuk mengirim pengumuman ke banyak nomor sekaligus.',
        ],
        catatan: 'Kirim pesan massal dengan bijak — pastikan nomor tujuan benar-benar membutuhkan.',
        gambar: '/panduan/wa-notif.png',
      },
      {
        id: 'pengguna',
        judul: 'Manajemen Pengguna & Hak Akses',
        langkah: [
          'Menu Manajemen Pengguna: tambah akun, pilih peran (admin, guru, bendahara, kepala, operator, siswa, wali).',
          'Centang "Jabatan ini juga mengajar" bila seorang kepala/operator/admin juga mengajar.',
          'Nonaktifkan akun yang tidak lagi digunakan tanpa menghapus datanya.',
        ],
        gambar: '/panduan/pengguna.png',
      },
      {
        id: 'ekspor-excel',
        judul: 'Ekspor Excel & Backup',
        langkah: [
          'Hampir setiap tabel punya tombol Ekspor Excel dengan kop lembaga dan kolom rapi.',
          'Menu Backup & Restore: unduh cadangan data (JSON) atau pulihkan dari berkas cadangan.',
          'Hubungkan Google Drive bila ingin cadangan otomatis tersimpan di cloud.',
        ],
        gambar: '/panduan/ekspor.png',
      },
      {
        id: 'smtp',
        judul: 'SMTP & IMAP (Domain Sendiri)',
        langkah: [
          'Menu SMTP & IMAP.',
          'Isi host, port, keamanan, username, dan password SMTP milik lembaga.',
          'Isi alamat pengirim (mis. no-reply@domain-lembaga.id) dan namanya.',
          'Centang "Gunakan SMTP lembaga", lalu klik Uji & kirim email uji.',
          'Opsional: isi pengaturan IMAP untuk menguji kotak surat masuk.',
        ],
        catatan: 'Bila SMTP lembaga gagal, email otomatis dikirim memakai server platform sehingga notifikasi tidak pernah hilang.',
        gambar: '/panduan/smtp.png',
      },
    ],
  },
  {
    key: 'super_admin', nama: 'Super Admin Platform', icon: 'Globe',
    ringkas: 'Mengelola lembaga, paket langganan, dan data lintas tenant.',
    bagian: [
      {
        id: 'lembaga',
        judul: 'Manajemen Lembaga (Tenant)',
        langkah: [
          'Menu Manajemen Lembaga menampilkan seluruh lembaga terdaftar.',
          'Buka detail lembaga untuk melihat paket, masa aktif, dan status domain.',
          'Ubah paket langganan lembaga dari sini.',
        ],
        gambar: '/panduan/super-lembaga.png',
      },
      {
        id: 'paket',
        judul: 'Paket Langganan: Trial, Lite, Pro, Premium',
        langkah: [
          'Menu Paket/Invoice Langganan untuk mengatur harga dan masa aktif tiap paket.',
          'Trial — semua fitur dapat dicoba, masa aktif pendek (bawaan 1 bulan).',
          'Lite — fitur inti harian: data master, jadwal, absensi, jurnal, penilaian, keuangan, WhatsApp, posting, modul ajar. TANPA domain sendiri, backup Drive, REST API, cashless, dan kantin.',
          'Pro — semua fitur Lite ditambah domain sendiri, backup Drive, dan REST API. TANPA cashless dan kantin.',
          'Premium — seluruh fitur termasuk cashless dan modul kantin.',
          'Menaikkan paket lembaga otomatis membuka fiturnya; menurunkan paket otomatis menutup fitur di atasnya.',
        ],
        catatan: 'Bila ada lembaga paket Lite yang tampak memakai fitur Pro, jalankan pemeriksaan override fitur — sistem kini otomatis merapikannya.',
        gambar: '/panduan/paket.png',
      },
      {
        id: 'manajemen-data',
        judul: 'Manajemen Data (Hapus/Ekspor/Impor Massal)',
        langkah: [
          'Menu Manajemen Data.',
          'Pilih lingkup: satu lembaga tertentu atau seluruh lembaga.',
          'Lihat jumlah baris tiap bagian (siswa, GTK, nilai, absensi, dst).',
          'Tombol Ekspor menghasilkan berkas JSON berisi data bagian tersebut.',
          'Tombol Hapus membuka dialog yang menampilkan kode konfirmasi — ketik kode itu untuk melanjutkan.',
          'Setiap penghapusan tercatat di riwayat beserta siapa pelakunya.',
        ],
        catatan: 'Penghapusan bersifat permanen. Data turunan (nilai, absensi, jadwal) ikut terhapus. Tabel akun pengguna dan kredensial WhatsApp TIDAK PERNAH ikut terhapus.',
        gambar: '/panduan/manajemen-data.png',
      },
      {
        id: 'invoice',
        judul: 'Invoice & Pembayaran Langganan',
        langkah: [
          'Menu Invoice Langganan.',
          'Terbitkan invoice untuk lembaga; nominal dihitung otomatis dari paket yang dipilih.',
          'Kirim invoice ke admin lembaga; status pembayaran terpantau di daftar invoice.',
        ],
        gambar: '/panduan/invoice.png',
      },
    ],
  },
  {
    key: 'guru', nama: 'Guru', icon: 'GraduationCap',
    ringkas: 'Mengajar, menilai, dan mengabsen dari akun guru.',
    bagian: [
      {
        id: 'jurnal-guru',
        judul: 'Jurnal Mengajar',
        langkah: [
          'Buka menu Jurnal Mengajar.',
          'Pilih jadwal mengajar, lalu isi materi, kompetensi dasar, dan kegiatan pembelajaran.',
          'Simpan. Riwayat jurnal dapat dilihat dan diekspor.',
        ],
        gambar: '/panduan/guru-jurnal.png',
      },
      {
        id: 'penilaian-guru',
        judul: 'Penilaian Harian, STS, dan SAS',
        langkah: [
          'Menu Penilaian Harian: masukkan nilai harian per kelas dan mapel.',
          'Menu Nilai STS dan Nilai SAS untuk penilaian tengah/akhir semester.',
          'Menu Rekap Nilai per Mapel untuk melihat ringkasan nilai kelas Anda.',
          'Menu Koreksi Jawaban (AI+OCR) membantu mengoreksi lembar jawaban hasil pindai.',
        ],
        catatan: 'Masukkan nilai desimal dengan benar (mis. 79,5) — sistem menyimpan angka apa adanya.',
        gambar: '/panduan/guru-nilai.png',
      },
      {
        id: 'absensi-guru',
        judul: 'Absensi Siswa & Absensi Saya',
        langkah: [
          'Menu Absensi Harian atau Absensi Mapel: tandai kehadiran siswa.',
          'Menu Absensi Saya: lakukan ceklok kehadiran Anda sendiri dari lokasi lembaga.',
          'Menu Jadwal Saya menampilkan jadwal mengajar pribadi.',
        ],
        gambar: '/panduan/guru-absensi.png',
      },
      {
        id: 'modul-guru',
        judul: 'Modul Ajar & Bank Soal',
        langkah: [
          'Menu Generator AI Guru: isi topik, sistem menyusun draf modul ajar.',
          'Menu Bank Soal: simpan soal beserta kunci jawaban.',
          'Menu Kisi-kisi Soal dan Paket Ujian untuk menyusun ujian.',
        ],
        gambar: '/panduan/guru-modul.png',
      },
    ],
  },
  {
    key: 'bendahara', nama: 'Bendahara', icon: 'Wallet',
    ringkas: 'Mengelola tagihan, tabungan, dan pembayaran.',
    bagian: [
      {
        id: 'tagihan',
        judul: 'Tagihan & Pembayaran',
        langkah: [
          'Menu Tagihan & Pembayaran.',
          'Buat jenis tagihan (SPP, kegiatan, dsb) beserta nominalnya.',
          'Terbitkan tagihan ke siswa atau ke seluruh kelas.',
          'Catat pembayaran; tagihan otomatis berubah status menjadi lunas.',
        ],
        gambar: '/panduan/bendahara-tagihan.png',
      },
      {
        id: 'tabungan',
        judul: 'Tabungan Siswa',
        langkah: [
          'Menu Tabungan Siswa.',
          'Catat setoran dan penarikan untuk tiap siswa.',
          'Saldo dihitung otomatis dan dapat diekspor ke Excel.',
        ],
        gambar: '/panduan/bendahara-tabungan.png',
      },
      {
        id: 'qris',
        judul: 'Payment Gateway QRIS',
        langkah: [
          'Menu Payment Gateway QRIS.',
          'Isi kredensial merchant (ShopeePay/GoPay) sesuai panduan penyedia.',
          'Setelah aktif, pembayaran QRIS yang masuk otomatis menandai tagihan lunas.',
        ],
        gambar: '/panduan/bendahara-qris.png',
      },
    ],
  },
  {
    key: 'kepala', nama: 'Kepala Lembaga', icon: 'Users',
    ringkas: 'Memantau seluruh operasional dan supervisi.',
    bagian: [
      {
        id: 'monitoring',
        judul: 'Monitoring Data',
        langkah: [
          'Menu Monitoring Data menampilkan ringkasan kehadiran, jurnal, dan nilai.',
          'Klik rombel untuk melihat daftar siswa di dalamnya.',
          'Gunakan filter untuk membandingkan antar kelas atau periode.',
        ],
        gambar: '/panduan/kepala-monitoring.png',
      },
      {
        id: 'supervisi',
        judul: 'Supervisi Guru',
        langkah: [
          'Menu Supervisi.',
          'Pilih guru yang akan disupervisi dan isi instrumen penilaian.',
          'Simpan hasil supervisi; laporan dapat dicetak.',
        ],
        gambar: '/panduan/kepala-supervisi.png',
      },
      {
        id: 'rapor-kepala',
        judul: 'Rapor & Administrasi',
        langkah: [
          'Menu Rapor Siswa untuk meninjau dan mengunduh rapor per rombel.',
          'Menu Administrasi Surat untuk mengelola surat masuk dan keluar.',
          'Menu Program Belajar untuk lembaga non-formal (kursus/sanggar).',
        ],
        gambar: '/panduan/kepala-rapor.png',
      },
    ],
  },
  {
    key: 'siswa', nama: 'Siswa & Wali Murid', icon: 'BookOpen',
    ringkas: 'Melihat nilai, absensi, jadwal, dan tagihan.',
    bagian: [
      {
        id: 'dashboard-siswa',
        judul: 'Dashboard Siswa',
        langkah: [
          'Login dengan akun siswa.',
          'Dashboard menampilkan nilai terbaru, rekap absensi, saldo tabungan, dan tagihan.',
          'Semua kartu dapat diketuk untuk melihat rincian.',
        ],
        gambar: '/panduan/siswa-dashboard.png',
      },
      {
        id: 'nilai-siswa',
        judul: 'Melihat Nilai & Rapor',
        langkah: [
          'Menu Nilai menampilkan nilai harian, STS, dan SAS per mata pelajaran.',
          'Gunakan filter semester untuk melihat periode lain.',
        ],
        gambar: '/panduan/siswa-nilai.png',
      },
      {
        id: 'absensi-siswa',
        judul: 'Absensi & Jadwal',
        langkah: [
          'Menu Absensi Saya menampilkan riwayat kehadiran.',
          'Menu Jadwal menampilkan jadwal pelajaran hari ini dan seterusnya.',
          'Menu Ekskul untuk kegiatan ekstrakurikuler yang diikuti.',
        ],
        gambar: '/panduan/siswa-absensi.png',
      },
      {
        id: 'tagihan-siswa',
        judul: 'Tagihan & Tabungan',
        langkah: [
          'Kartu Tagihan menampilkan tagihan yang belum dibayar beserta nominalnya.',
          'Kartu Tabungan menampilkan saldo dan riwayat mutasi.',
        ],
        gambar: '/panduan/siswa-tagihan.png',
      },
    ],
  },
]

module.exports = { KELOMPOK }
