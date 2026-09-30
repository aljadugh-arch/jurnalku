// Regenerasi template impor siswa agar mencakup SELURUH kolom identitas pada
// tabel `siswa` (termasuk biodata ayah/ibu/wali) sehingga sekali impor semua
// data identitas rapor langsung terisi.
//
// Jalankan: node scripts/gen-template-siswa.cjs
const XLSX = require('xlsx')
const path = require('node:path')

const HEADERS = [
  'NIK', 'NIS', 'NISN', 'Nama', 'Nama Panggilan', 'JK', 'Tempat Lahir', 'Tanggal Lahir',
  'Alamat', 'No HP', 'Agama', 'Status Keluarga', 'Anak Ke', 'Asal Sekolah',
  'Nama Ortu', 'Nama Ayah', 'Pekerjaan Ayah', 'Nama Ibu', 'Pekerjaan Ibu', 'Alamat Ortu',
  'Nama Wali', 'Pekerjaan Wali', 'Rombel',
]

const SAMPLE = [
  '3511010101010001', '1001', '0012345678', 'Ahmad Fauzi', 'Ahmad', 'L', 'Bondowoso', '2015-05-14',
  'Jl. Contoh No. 1', '081234567890', 'Islam', 'Anak Kandung', 1, 'SDN 1 Contoh',
  'Bapak/Ibu Ahmad', 'Slamet Riyadi', 'Petani', 'Siti Aminah', 'Ibu Rumah Tangga', 'Jl. Contoh No. 1',
  'Kakek Ahmad', 'Pensiunan', '7A',
]

const PETUNJUK = [
  ['PETUNJUK PENGISIAN'],
  [],
  ['Kolom wajib', 'NIS, Nama, dan JK. NIK jika diisi harus tepat 16 digit angka.'],
  ['JK', 'Isi L (laki-laki) atau P (perempuan).'],
  ['Tanggal Lahir', 'Format YYYY-MM-DD, contoh 2015-05-14.'],
  ['Agama', 'Contoh: Islam, Kristen, Katolik, Hindu, Buddha, Konghucu.'],
  ['Status Keluarga', 'Contoh: Anak Kandung, Anak Angkat, Anak Tiri.'],
  ['Anak Ke', 'Angka urutan anak dalam keluarga.'],
  ['Nama Ayah / Ibu / Wali', 'Isi terpisah agar identitas rapor otomatis lengkap.'],
  ['Pekerjaan Ayah / Ibu / Wali', 'Contoh: Petani, Wiraswasta, Ibu Rumah Tangga, PNS.'],
  ['Rombel', 'Nama rombel yang sudah ada, contoh 7A. Boleh dikosongkan.'],
  ['Catatan', 'Baris contoh di bawah boleh dihapus sebelum diunggah.'],
]

const wb = XLSX.utils.book_new()

const wsData = [HEADERS, SAMPLE]
const ws = XLSX.utils.aoa_to_sheet(wsData)
ws['!cols'] = HEADERS.map(h => ({ wch: Math.max(h.length + 4, 16) }))
XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa')

const wsPetunjuk = XLSX.utils.aoa_to_sheet(PETUNJUK)
wsPetunjuk['!cols'] = [{ wch: 26 }, { wch: 74 }]
XLSX.utils.book_append_sheet(wb, wsPetunjuk, 'Petunjuk')

const out = path.join(__dirname, '..', 'public', 'templates', 'template-import-siswa.xlsx')
XLSX.writeFile(wb, out)
console.log('written:', out)
console.log('headers:', HEADERS.length, JSON.stringify(HEADERS))
