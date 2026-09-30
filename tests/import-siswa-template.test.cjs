const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const XLSX = require('xlsx')

const root = path.join(__dirname, '..')
const page = fs.readFileSync(path.join(root, 'src', 'pages', 'admin', 'DataSiswaPage.tsx'), 'utf8')
const server = fs.readFileSync(path.join(root, 'server', 'index.cjs'), 'utf8')
const templatePath = path.join(root, 'public', 'templates', 'template-import-siswa.xlsx')

// Field identitas yang dibutuhkan agar identitas rapor tercukupi dari data siswa.
const BIODATA_FIELDS = [
  'nama_panggilan', 'nik', 'nis', 'nisn', 'jenis_kelamin', 'tempat_lahir', 'tanggal_lahir',
  'alamat', 'no_hp', 'agama', 'status_keluarga', 'anak_ke', 'asal_sekolah', 'nama_ortu',
  'nama_ayah', 'kerja_ayah', 'nama_ibu', 'kerja_ibu', 'alamat_ortu', 'nama_wali', 'kerja_wali',
  'rombel_nama',
]

function parseColumnMap() {
  const m = page.match(/columnMap=\{\{([\s\S]*?)\}\}/)
  assert.ok(m, 'columnMap harus ada di DataSiswaPage.tsx')
  const map = {}
  for (const pair of m[1].matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)) map[pair[1]] = pair[2]
  return map
}

function readTemplateHeaders() {
  assert.ok(fs.existsSync(templatePath), 'file template impor siswa harus ada')
  const wb = XLSX.readFile(templatePath)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  return rows[0].map(h => String(h).trim()).filter(Boolean)
}

test('template impor siswa memuat seluruh kolom identitas tabel siswa', () => {
  const headers = readTemplateHeaders()
  const map = parseColumnMap()

  // Setiap kolom template harus punya pemetaan, jika tidak datanya terbuang diam-diam.
  for (const h of headers) {
    assert.ok(map[h], `header template "${h}" tidak dipetakan di columnMap`)
  }

  // Setiap field identitas harus bisa masuk lewat minimal satu kolom template.
  const mapped = new Set(Object.values(map))
  for (const field of BIODATA_FIELDS) {
    assert.ok(mapped.has(field), `field ${field} tidak dapat diisi lewat impor`)
  }
})

test('backend bulk-import menyimpan seluruh field identitas siswa', () => {
  const start = server.indexOf("app.post('/api/siswa/bulk-import'")
  assert.ok(start > -1, 'route bulk-import harus ada')
  const rest = server.slice(start + 10)
  const next = rest.indexOf('\napp.')
  const handler = next > -1 ? rest.slice(0, next) : rest

  const m = handler.match(/INSERT INTO siswa \(([\s\S]*?)\) VALUES/)
  assert.ok(m, 'bulk-import harus punya INSERT INTO siswa')
  const cols = m[1].split(',').map(c => c.trim()).filter(Boolean)
  for (const field of BIODATA_FIELDS) {
    if (field === 'rombel_nama') continue // dipetakan ke rombel_id via resolveRombel
    assert.ok(cols.includes(field), `bulk-import tidak menyimpan kolom ${field}`)
  }
  assert.ok(cols.includes('rombel_id'), 'bulk-import harus menyimpan rombel_id hasil resolve')
})

test('contoh baris template konsisten dengan jumlah kolom', () => {
  const wb = XLSX.readFile(templatePath)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  assert.ok(rows.length >= 2, 'template harus punya baris contoh')
  assert.equal(rows[1].length, rows[0].length, 'baris contoh harus sepanjang header')
  // Tidak boleh ada nilai contoh yang kosong untuk kolom wajib rapor.
  const idx = name => rows[0].indexOf(name)
  for (const wajib of ['Nama', 'JK', 'Nama Ayah', 'Nama Ibu', 'Pekerjaan Ayah', 'Pekerjaan Ibu']) {
    assert.ok(String(rows[1][idx(wajib)] ?? '').trim() !== '', `contoh kolom ${wajib} masih kosong`)
  }
})
