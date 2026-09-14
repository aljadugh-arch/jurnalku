'use strict'

const path = require('node:path')
const XLSX = require('xlsx')

const output = path.join(__dirname, '..', 'public', 'templates', 'template-import-siswa.xlsx')
const headers = ['NIK', 'NIS', 'NISN', 'Nama', 'Nama Panggilan', 'JK', 'Tempat Lahir', 'Tanggal Lahir', 'Alamat', 'No HP', 'Nama Ortu', 'Rombel']
const example = ['3511010101010001', '1001', '0012345678', 'Ahmad Fauzi', 'Ahmad', 'L', 'Bondowoso', '2015-05-14', 'Jl. Contoh No. 1', '081234567890', 'Bapak/Ibu Ahmad', '1A']
const notes = [
  ['PETUNJUK PENGISIAN'],
  ['Kolom wajib', 'NIS, Nama, dan JK. NIK jika diisi harus tepat 16 digit angka.'],
  ['JK', 'Isi L untuk laki-laki atau P untuk perempuan.'],
  ['Tanggal Lahir', 'Gunakan format YYYY-MM-DD, contoh 2015-05-14.'],
  ['Rombel', 'Isi nama rombel persis seperti di menu Data Rombel, contoh 1A. Boleh dikosongkan.'],
  ['Catatan', 'Hapus baris contoh pada sheet Data Siswa sebelum mengimpor data sebenarnya.'],
]

const workbook = XLSX.utils.book_new()
const dataSheet = XLSX.utils.aoa_to_sheet([headers, example])
dataSheet['!cols'] = [18, 13, 15, 28, 18, 8, 18, 17, 32, 18, 26, 18].map(wch => ({ wch }))
dataSheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}2` }
dataSheet['!freeze'] = { xSplit: 0, ySplit: 1 }
XLSX.utils.book_append_sheet(workbook, dataSheet, 'Data Siswa')

const guideSheet = XLSX.utils.aoa_to_sheet(notes)
guideSheet['!cols'] = [{ wch: 20 }, { wch: 90 }]
XLSX.utils.book_append_sheet(workbook, guideSheet, 'Petunjuk')

XLSX.writeFile(workbook, output, { bookType: 'xlsx', compression: true })
console.log(output)
