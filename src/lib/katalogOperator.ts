// Katalog aplikasi & layanan operator madrasah.
//
// Sumber: katalog publik Kemenag/Kemendikdasmen. Setiap entri punya:
//   id, nama, kategori, keterangan, url, status, catatan, sumber
//
// `status` adalah hasil pemeriksaan halaman publik SEKALI waktu katalog
// disusun — bukan pemantauan langsung dan bukan bukti login berhasil.
// Jangan menampilkannya seolah-olah situs sedang hidup/mati saat ini.

export type StatusTautan = 'terbuka' | 'dibatasi' | 'manual'

export interface AplikasiOperator {
  id: string
  nama: string
  kategori: string
  keterangan: string
  url: string
  status: StatusTautan
  catatan: string
  sumber?: string
}

export const KATEGORI = [
  'Semua',
  'Pendataan',
  'Siswa',
  'Guru & tenaga kependidikan',
  'Bantuan & anggaran',
  'Asesmen & rapor',
  'Referensi & layanan',
] as const

export const LABEL_STATUS: Record<StatusTautan, string> = {
  terbuka: 'Halaman terbuka',
  dibatasi: 'Akses otomatis dibatasi',
  manual: 'Perlu cek manual',
}

export const DIPERIKSA_PADA = '21 Oktober 2026'

const kemenag = 'https://kemenag.go.id/layanan'
const verval = 'https://pusatinformasi.ult.kemendikdasmen.go.id/hc/id/articles/55316840071577-Informasi-Terkait-Data-yang-Tersedia-pada-Sekolah-Kita'
const anSource = 'https://pusmendik.kemendikdasmen.go.id/an/page/download_file/793354_36'

export const APLIKASI: AplikasiOperator[] = [
  // ── Pendataan ──
  { id: 'emis', nama: 'EMIS 4.0', kategori: 'Pendataan', keterangan: 'Data lembaga, peserta didik, dan GTK madrasah.', url: 'https://emis.kemenag.go.id/', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: 'https://pendis.kemenag.go.id/storage/archives/01JHHYZJDMA4P0EANWJWSY6RF2.pdf' },
  { id: 'sdm', nama: 'SDM Data', kategori: 'Pendataan', keterangan: 'Registrasi dan pengelolaan akun operator data pendidikan.', url: 'https://sdm.data.kemendikdasmen.go.id/', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: 'https://www.kemendikdasmen.go.id/' },
  { id: 'sp', nama: 'Verval SP', kategori: 'Pendataan', keterangan: 'Verifikasi data satuan pendidikan, alamat, dan foto madrasah.', url: 'https://vervalsp.data.kemendikdasmen.go.id/', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: verval },
  { id: 'referensi', nama: 'Data Referensi / NPSN', kategori: 'Pendataan', keterangan: 'Referensi satuan pendidikan dan identitas sekolah.', url: 'https://referensi.data.kemendikdasmen.go.id/', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: 'https://referensi.data.kemendikdasmen.go.id/' },

  // ── Siswa ──
  { id: 'pd', nama: 'Verval PD', kategori: 'Siswa', keterangan: 'Verifikasi dan validasi identitas peserta didik.', url: 'https://vervalpd.data.kemendikdasmen.go.id/', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: verval },
  { id: 'nisn', nama: 'Pencarian NISN', kategori: 'Siswa', keterangan: 'Pencarian Nomor Induk Siswa Nasional.', url: 'https://nisn.data.kemendikdasmen.go.id/', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: 'https://nisn.data.kemendikdasmen.go.id/' },

  // ── Guru & tenaga kependidikan ──
  { id: 'emisgtk', nama: 'EMIS GTK', kategori: 'Guru & tenaga kependidikan', keterangan: 'Administrasi dan layanan guru serta tenaga kependidikan madrasah.', url: 'https://emisgtk.kemenag.go.id/', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: kemenag },
  { id: 'ptk', nama: 'Verval PTK', kategori: 'Guru & tenaga kependidikan', keterangan: 'Verifikasi data pendidik, tenaga kependidikan, dan NUPTK.', url: 'https://vervalptk.data.kemendikdasmen.go.id/', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: verval },
  { id: 'pintar', nama: 'PINTAR Kemenag', kategori: 'Guru & tenaga kependidikan', keterangan: 'Pelatihan dan pengembangan kompetensi.', url: 'https://pintar.kemenag.go.id/', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: kemenag },

  // ── Bantuan & anggaran ──
  { id: 'erkam', nama: 'EDM & e-RKAM', kategori: 'Bantuan & anggaran', keterangan: 'Evaluasi diri, rencana kegiatan, dan anggaran madrasah.', url: 'https://frontend.erkam-v2.kemenag.go.id/login', status: 'manual', catatan: 'Waktu pemeriksaan habis atau belum dapat dibaca otomatis.', sumber: 'https://dki.kemenag.go.id/' },
  { id: 'pip', nama: 'PIP Kemenag', kategori: 'Bantuan & anggaran', keterangan: 'Layanan Program Indonesia Pintar dan akses operator.', url: 'https://pip.kemenag.go.id/', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: 'https://pip.kemenag.go.id/login' },
  { id: 'sipma', nama: 'SIPMA / PIP Madrasah', kategori: 'Bantuan & anggaran', keterangan: 'Informasi, pemantauan, dan pelaporan PIP madrasah.', url: 'https://pipmadrasah.kemenag.go.id/home', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: 'https://pipmadrasah.kemenag.go.id/home' },
  { id: 'bos', nama: 'Portal BOS Kemenag', kategori: 'Bantuan & anggaran', keterangan: 'Portal bantuan operasional; gunakan e-RKAM untuk alur BOS sesuai ketentuan.', url: 'https://bos.kemenag.go.id/', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: kemenag },

  // ── Asesmen & rapor ──
  { id: 'pdum', nama: 'PDUM', kategori: 'Asesmen & rapor', keterangan: 'Pendataan ujian madrasah dan administrasi kelulusan.', url: 'https://pdum.kemenag.go.id/', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: 'https://ptspjatim.kemenag.go.id/' },
  { id: 'anbk', nama: 'ANBK', kategori: 'Asesmen & rapor', keterangan: 'Persiapan dan pengelolaan pelaksanaan Asesmen Nasional.', url: 'https://anbk.kemendikdasmen.go.id/', status: 'manual', catatan: 'Waktu pemeriksaan habis atau belum dapat dibaca otomatis.', sumber: anSource },
  { id: 'bioan', nama: 'BioAN', kategori: 'Asesmen & rapor', keterangan: 'Pendataan peserta Asesmen Nasional.', url: 'https://bioportal.kemendikdasmen.go.id/', status: 'manual', catatan: 'Waktu pemeriksaan habis atau belum dapat dibaca otomatis.', sumber: anSource },
  { id: 'sulingjar', nama: 'Survei Lingkungan Belajar', kategori: 'Asesmen & rapor', keterangan: 'Pengisian survei lingkungan belajar bagi peserta yang terdaftar.', url: 'https://surveilingkunganbelajar.kemendikdasmen.go.id/', status: 'manual', catatan: 'Waktu pemeriksaan habis atau belum dapat dibaca otomatis.', sumber: anSource },
  { id: 'rdm', nama: 'Portal RDM Pusat', kategori: 'Asesmen & rapor', keterangan: 'Login pusat Rapor Digital Madrasah (RDM) Ditjen Pendis Kemenag RI.', url: 'https://rdm.kemenag.go.id/login/auth', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: 'https://rdm.kemenag.go.id/' },
  { id: 'silegen', nama: 'SILEGEN', kategori: 'Asesmen & rapor', keterangan: 'Sistem Informasi Layanan Elektronik Terintegrasi Kemenag daerah.', url: 'https://silegen.kemenagtuban.id/#layanan', status: 'manual', catatan: 'Waktu pemeriksaan habis atau belum dapat dibaca otomatis.', sumber: 'https://silegen.kemenagtuban.id/' },
  { id: 'sahabatkbc', nama: 'SAHABAT KBC', kategori: 'Asesmen & rapor', keterangan: 'Sistem monitoring dan survei implementasi Kurikulum Berbasis Cinta (KBC).', url: 'https://madrasah.kemenag.go.id/sahabatkbc', status: 'dibatasi', catatan: 'Situs merespons HTTP 503; perlu cek manual.', sumber: 'https://madrasah.kemenag.go.id/sahabatkbc' },

  // ── Referensi & layanan ──
  { id: 'satudata', nama: 'Satu Data Kemenag', kategori: 'Referensi & layanan', keterangan: 'Portal statistik dan data Kementerian Agama.', url: 'https://satudata.kemenag.go.id/', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: kemenag },
  { id: 'jdih', nama: 'JDIH Kemenag', kategori: 'Referensi & layanan', keterangan: 'Peraturan dan dokumen hukum Kementerian Agama.', url: 'https://jdih.kemenag.go.id/', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: kemenag },
  { id: 'layanan', nama: 'Layanan Kemenag / Bantuan Sarpras', kategori: 'Referensi & layanan', keterangan: 'Direktori resmi, termasuk tautan layanan bantuan sarana madrasah.', url: 'https://kemenag.go.id/layanan', status: 'terbuka', catatan: 'Situs dapat diakses normal (HTTP 200).', sumber: kemenag },
]

// Menu pengelolaan internal (bukan tautan luar).
export const MENU_INTERNAL = [
  { nama: 'Data Siswa', keterangan: 'Biodata dan administrasi siswa', path: '/admin/siswa' },
  { nama: 'Data GTK', keterangan: 'Profil guru dan tenaga kependidikan', path: '/admin/gtk' },
  { nama: 'Rombongan Belajar', keterangan: 'Kelas dan wali kelas', path: '/admin/rombel' },
  { nama: 'PPDB', keterangan: 'Kelola pendaftaran siswa baru', path: '/admin/ppdb' },
  { nama: 'Cetak & Ekspor Rapor', keterangan: 'Rapor per bagian dan massal', path: '/admin/cetak-rapor' },
  { nama: 'Buku Induk', keterangan: 'Arsip lengkap tiap siswa', path: '/admin/buku-induk' },
  { nama: 'Keuangan', keterangan: 'Tagihan, tabungan, buku kas', path: '/admin/laporan-keuangan' },
  { nama: 'Absensi', keterangan: 'Presensi siswa dan rekap', path: '/admin/absensi-siswa' },
]

export function saringAplikasi(cari: string, kategori: string, favorit: string[], hanyaFavorit: boolean) {
  const q = cari.toLocaleLowerCase('id').trim()
  return APLIKASI.filter(a =>
    (kategori === 'Semua' || a.kategori === kategori) &&
    (!hanyaFavorit || favorit.includes(a.id)) &&
    `${a.nama} ${a.keterangan} ${a.kategori}`.toLocaleLowerCase('id').includes(q)
  )
}
