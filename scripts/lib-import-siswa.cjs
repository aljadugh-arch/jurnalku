// Helper bersama untuk verifikasi end-to-end impor siswa.
// Menjaga satu sumber kebenaran antara skrip e2e dan komponen UI
// (ImportExcel.handleFile + onImport di DataSiswaPage).
const fs = require('node:fs')
const path = require('node:path')
const XLSX = require('xlsx')

const root = path.join(__dirname, '..')

// Ambil columnMap langsung dari DataSiswaPage.tsx agar skrip ikut gagal
// kalau pemetaan header di UI berubah/dipecah.
function parseColumnMap() {
  const page = fs.readFileSync(path.join(root, 'src', 'pages', 'admin', 'DataSiswaPage.tsx'), 'utf8')
  const m = page.match(/columnMap=\{\{([\s\S]*?)\}\}/)
  if (!m) throw new Error('columnMap tidak ditemukan')
  const map = {}
  for (const p of m[1].matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)) map[p[1]] = p[2]
  return map
}

// Replikasi ImportExcel.handleFile
function parseTemplate(columnMap) {
  const buf = fs.readFileSync(path.join(root, 'public', 'templates', 'template-import-siswa.xlsx'))
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const sh = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1 })
  const hdrs = rows[0].map(h => (h || '').toString().trim())
  const mapped = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(c => !c)) continue
    const obj = {}
    hdrs.forEach((h, idx) => {
      const field = columnMap[h]
      const cell = row[idx]
      if (field && cell !== undefined && cell !== null) {
        if (cell instanceof Date) {
          const y = cell.getFullYear()
          const mo = String(cell.getMonth() + 1).padStart(2, '0')
          const d = String(cell.getDate()).padStart(2, '0')
          obj[field] = `${y}-${mo}-${d}`
        } else {
          obj[field] = cell.toString().trim()
        }
      }
    })
    if (Object.keys(obj).length > 0) mapped.push(obj)
  }
  return mapped
}

// Replikasi onImport DataSiswaPage
function toStudentPayload(row) {
  return {
    nama: row.nama,
    nama_panggilan: row.nama_panggilan || '',
    nik: String(row.nik || '').trim(),
    nis: String(row.nis || '').trim(),
    nisn: String(row.nisn || '').trim(),
    jenis_kelamin: (row.jenis_kelamin || 'L').toString().charAt(0).toUpperCase(),
    tempat_lahir: row.tempat_lahir || '',
    tanggal_lahir: row.tanggal_lahir || '',
    alamat: row.alamat || '',
    no_hp: String(row.no_hp || '').trim(),
    nama_ortu: row.nama_ortu || '',
    rombel_nama: row.rombel_nama || '',
    agama: row.agama || 'Islam',
    status_keluarga: row.status_keluarga || 'Anak Kandung',
    anak_ke: row.anak_ke || '',
    asal_sekolah: row.asal_sekolah || '',
    nama_ayah: row.nama_ayah || '',
    nama_ibu: row.nama_ibu || '',
    alamat_ortu: row.alamat_ortu || '',
    kerja_ayah: row.kerja_ayah || '',
    kerja_ibu: row.kerja_ibu || '',
    nama_wali: row.nama_wali || '',
    kerja_wali: row.kerja_wali || '',
  }
}

module.exports = { root, parseColumnMap, parseTemplate, toStudentPayload }
