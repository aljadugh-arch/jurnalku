// Generate template Excel sesuai kolom input manual. Jalankan: node scripts/gen-templates.cjs
// Header di baris ke-3 (index 2) — konsisten dgn ImportExcel headerRow={2}.
const XLSX = require('xlsx')
const path = require('path')

const OUT = path.join(__dirname, '..', 'public', 'templates')

// [judul, headers[], contoh[], catatan]
const TPL = {
  'template-siswa.xls': {
    judul: 'Master Data : Import Data Siswa',
    headers: ['NIS', 'NISN', 'Nama', 'JK', 'Tempat Lahir', 'Tanggal Lahir', 'Alamat', 'No HP', 'Nama Ortu', 'Kode Rombel'],
    contoh: ['12345', '0012345678', 'Ahmad Fauzi', 'L', 'Lamongan', '2010-05-14', 'Jl. Merdeka No.1', '081234567890', 'Bapak Sutrisno', '7A'],
    catatan: 'JK: L/P. Tanggal Lahir: YYYY-MM-DD. Kode Rombel: sesuai nama rombel (mis. 7A). Kosongkan Kode Rombel jika belum ada rombel.',
  },
  'template-gtk.xls': {
    judul: 'Master Data : Import Data Guru dan Tenaga Kependidikan',
    headers: ['NIP', 'NUPTK', 'Nama Lengkap', 'JK', 'Tempat Lahir', 'TGL Lahir', 'Alamat', 'No. HP', 'Email', 'Jabatan', 'Status Kepegawaian', 'Bidang Studi'],
    contoh: ['198501012010011001', '1234567890123456', 'Yai Syadiran, S.Pd.I', 'L', 'Lamongan', '1985-01-01', 'Jl. Pesantren No.5', '081336714678', 'guru@sekolah.id', 'Guru Kelas', 'PNS', 'Matematika'],
    catatan: 'JK: L/P. TGL Lahir: YYYY-MM-DD. Status Kepegawaian: PNS/PPPK/GTY/Honorer.',
  },
  'template-mapel.xls': {
    judul: 'Master Data : Import Data Mata Pelajaran',
    headers: ['Kode MAPEL', 'Nama Mata Pelajaran', 'Kelompok', 'Jam Per Minggu'],
    contoh: ['MTK', 'Matematika', 'A', '4'],
    catatan: 'Kelompok: A/B/C (opsional). Jam Per Minggu: angka.',
  },
  'template-rombel.xls': {
    judul: 'Master Data : Import Data Rombel (Kelas)',
    headers: ['Nama Rombel', 'Tingkat', 'Tahun Ajaran', 'Kapasitas', 'Wali Kelas'],
    contoh: ['7A', '7', '2025/2026', '32', 'Yai Syadiran, S.Pd.I'],
    catatan: 'Tingkat: angka (7/8/9). Tahun Ajaran: YYYY/YYYY. Wali Kelas: nama guru (opsional).',
  },
}

for (const [file, t] of Object.entries(TPL)) {
  // baris 0: judul, baris 1: kosong, baris 2: header, baris 3: contoh
  const aoa = [
    [t.judul],
    [],
    [...t.headers, '', 'PERHATIAN'],
    [...t.contoh, '', t.catatan],
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = t.headers.map(() => ({ wch: 20 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, path.join(OUT, file), { bookType: 'biff8' })
  console.log('OK', file, '->', t.headers.length, 'kolom')
}
console.log('DONE')
