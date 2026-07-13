// Generate template Excel sesuai kolom input manual. Jalankan: node scripts/gen-templates.cjs
// Layout: row 0 = instruksi, row 1 = header, row 2 = contoh. ImportExcel bisa auto-detect header.
const XLSX = require('xlsx')
const path = require('path')

const OUT = path.join(__dirname, '..', 'public', 'templates')

const TPL = {
  'template-siswa.xls': {
    judul: 'Master Data : Import Data Siswa',
    headers: ['NIS', 'NISN', 'Nama', 'JK', 'Tempat Lahir', 'Tanggal Lahir', 'Alamat', 'No HP', 'Nama Ortu', 'Kode Rombel'],
    contoh: ['12345', '0012345678', 'Ahmad Fauzi', 'L', 'Lamongan', '2010-05-14', 'Jl. Merdeka No.1', '081234567890', 'Bapak Sutrisno', '7A'],
    catatan: 'JK: L/P. Tanggal Lahir: YYYY-MM-DD. Kode Rombel: sesuai nama rombel (mis. 7A). Kosongkan Kode Rombel jika belum ada rombel.',
    bookType: 'biff8',
  },
  'template-gtk.xlsx': {
    judul: 'TEMPLATE IMPORT DATA GTK - Isi mulai baris 3. Kolom Kode Guru = inisial guru utk export jadwal (mis. A, B, MMY). Jangan ubah baris header.',
    headers: ['NIP', 'NUPTK', 'Nama Lengkap', 'JK', 'Kode Guru', 'Jabatan', 'Status Kepegawaian', 'Bidang Studi', 'Tempat Lahir', 'TGL Lahir', 'Alamat', 'No. HP', 'Email'],
    contoh: ['198501012010011001', '1234567890123456', 'Contoh Guru', 'L', 'A', 'Guru', 'PNS', 'Matematika', 'Jakarta', '1985-01-01', 'Jl. Contoh No.1', '081234567890', 'guru@contoh.sch.id'],
    catatan: 'JK: L/P. TGL Lahir: YYYY-MM-DD. Status Kepegawaian: PNS/PPPK/GTY/Honorer.',
    bookType: 'xlsx',
  },
  'template-mapel.xls': {
    judul: 'Master Data : Import Data Mata Pelajaran',
    headers: ['Kode MAPEL', 'Nama Mata Pelajaran', 'Kelompok', 'Jam Per Minggu'],
    contoh: ['MTK', 'Matematika', 'A', '4'],
    catatan: 'Kelompok: A/B/C (opsional). Jam Per Minggu: angka.',
    bookType: 'biff8',
  },
  'template-rombel.xls': {
    judul: 'Master Data : Import Data Rombel (Kelas)',
    headers: ['Nama Rombel', 'Tingkat', 'Tahun Ajaran', 'Kapasitas', 'Wali Kelas'],
    contoh: ['7A', '7', '2025/2026', '32', 'Yai Syadiran, S.Pd.I'],
    catatan: 'Tingkat: angka (7/8/9). Tahun Ajaran: YYYY/YYYY. Wali Kelas: nama guru (opsional).',
    bookType: 'biff8',
  },
}

for (const [file, t] of Object.entries(TPL)) {
  const aoa = [
    [t.judul],
    [...t.headers, '', 'PERHATIAN'],
    [...t.contoh, '', t.catatan],
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [...t.headers.map(() => ({ wch: 20 })), { wch: 3 }, { wch: 60 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, path.join(OUT, file), { bookType: t.bookType })
  console.log('OK', file, '->', t.headers.length, 'kolom')
}
console.log('DONE')
