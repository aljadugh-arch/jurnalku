import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const cases = [
  { file: 'public/templates/template-gtk.xlsx', expectRow: 1, map: { 'NIP': 'nip', 'NUPTK': 'nuptk', 'Nama Lengkap': 'nama', 'JK': 'jenis_kelamin', 'Kode Guru': 'kode_guru', 'Tempat Lahir': 'tempat_lahir', 'TGL Lahir': 'tanggal_lahir', 'Alamat': 'alamat', 'No. HP': 'no_hp', 'Email': 'email', 'Jabatan': 'jabatan', 'Status Kepegawaian': 'status_kepegawaian', 'Bidang Studi': 'bidang_studi' } },
  { file: 'public/templates/template-siswa.xls', expectRow: 1, map: { 'Nama': 'nama', 'NAMA': 'nama', 'NIS': 'nis', 'NISN': 'nisn', 'Kode Rombel': 'rombel_kode', 'JK': 'jenis_kelamin', 'Jenis Kelamin': 'jenis_kelamin', 'Tempat Lahir': 'tempat_lahir', 'Tanggal Lahir': 'tanggal_lahir', 'Alamat': 'alamat', 'No HP': 'no_hp', 'Nama Ortu': 'nama_ortu' } },
  { file: 'public/templates/template-mapel.xls', expectRow: 1, map: { 'Kode MAPEL': 'kode', 'Nama Mata Pelajaran': 'nama', 'Kelompok': 'kelompok', 'Jam Per Minggu': 'jam_per_minggu' } },
]
let pass = 0, fail = 0
function assert(cond, msg) { if (cond) pass++; else { fail++; console.error('ASSERT', msg) } }
function detect(file, columnMap) {
  const wb = XLSX.readFile(file)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  let detectedHeaderRow = 0, bestMatchCount = -1
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const matchCount = (rows[r] || []).filter(h => columnMap[(h || '').toString().trim()]).length
    if (matchCount > bestMatchCount) { bestMatchCount = matchCount; detectedHeaderRow = r }
  }
  const hdrs = (rows[detectedHeaderRow] || []).map(h => (h || '').toString().trim())
  const mapped = []
  for (let i = detectedHeaderRow + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(c => !c)) continue
    const obj = {}
    hdrs.forEach((h, idx) => { const f = columnMap[h]; if (f && row[idx] != null) obj[f] = row[idx].toString().trim() })
    if (Object.keys(obj).length) mapped.push(obj)
  }
  return { detectedHeaderRow, bestMatchCount, mapped, headers: hdrs }
}
for (const c of cases) {
  const r = detect(c.file, c.map)
  assert(r.detectedHeaderRow === c.expectRow, `${c.file} header row ${r.detectedHeaderRow}`)
  assert(r.bestMatchCount > 0, `${c.file} has matching headers`)
  assert(r.mapped.length >= 1, `${c.file} maps example row`)
  console.log(c.file, JSON.stringify({ detectedHeaderRow: r.detectedHeaderRow, bestMatchCount: r.bestMatchCount, mapped: r.mapped.length, first: r.mapped[0] }))
}
console.log(JSON.stringify({ ok: fail === 0, pass, fail }, null, 2))
if (fail) process.exit(1)
