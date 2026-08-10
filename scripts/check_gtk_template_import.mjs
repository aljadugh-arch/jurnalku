import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const BASE = process.env.E2E_BASE || 'https://staging.jurnal.cc.cd/api'
const stamp = Date.now().toString(36)
const email = `gtk-import-${stamp}@test.local`
const password = 'Password123!'
let token = ''
let pass = 0
let fail = 0
const columnMap = { 'NIP': 'nip', 'NUPTK': 'nuptk', 'Nama Lengkap': 'nama', 'JK': 'jenis_kelamin', 'Kode Guru': 'kode_guru', 'Tempat Lahir': 'tempat_lahir', 'TGL Lahir': 'tanggal_lahir', 'Alamat': 'alamat', 'No. HP': 'no_hp', 'Email': 'email', 'Jabatan': 'jabatan', 'Status Kepegawaian': 'status_kepegawaian', 'Bidang Studi': 'bidang_studi' }
async function req(method, path, body, expected = 200) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
  if (res.status !== expected) { fail++; console.error(`FAIL ${method} ${path}: expected ${expected}, got ${res.status}: ${text.slice(0, 300)}`) }
  else pass++
  return data
}
function assert(cond, msg) { if (!cond) { fail++; console.error('ASSERT', msg) } else pass++ }
function parseGtkTemplate(path) {
  const wb = XLSX.readFile(path)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  let detectedHeaderRow = 1
  let bestMatchCount = -1
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const matchCount = (rows[r] || []).filter(h => columnMap[(h || '').toString().trim()]).length
    if (matchCount > bestMatchCount) { bestMatchCount = matchCount; detectedHeaderRow = r }
  }
  if (bestMatchCount <= 0) return []
  const hdrs = (rows[detectedHeaderRow] || []).map(h => (h || '').toString().trim())
  const mapped = []
  for (let i = detectedHeaderRow + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(c => !c)) continue
    const obj = {}
    hdrs.forEach((h, idx) => { const f = columnMap[h]; if (f && row[idx] != null) obj[f] = row[idx].toString().trim() })
    if (Object.keys(obj).length) mapped.push(obj)
  }
  return { detectedHeaderRow, bestMatchCount, mapped }
}
const parsed = parseGtkTemplate('public/templates/template-gtk.xlsx')
assert(parsed.detectedHeaderRow === 1, 'GTK template header detected at row 1')
assert(parsed.bestMatchCount >= 10, 'GTK template headers match columnMap')
assert(parsed.mapped.length >= 1, 'GTK template maps example row')
const reg = await req('POST', '/auth/register', { nama_lembaga: `GTK Import ${stamp}`, nama: 'Admin', email, password, no_hp: '081234567890', domain_type: 'subdomain', slug: `gtk-import-${stamp}` })
token = reg.token
const row = parsed.mapped[0]
row.nip = `IMP${stamp}`
row.nama = `Guru Import ${stamp}`
await req('POST', '/gtk', { nip: row.nip, nuptk: row.nuptk || '', nama: row.nama, jenis_kelamin: (row.jenis_kelamin || 'L').charAt(0).toUpperCase() === 'P' ? 'P' : 'L', kode_guru: (row.kode_guru || '').toUpperCase(), tempat_lahir: row.tempat_lahir || '', tanggal_lahir: row.tanggal_lahir || '', alamat: row.alamat || '', no_hp: row.no_hp || '', email: row.email || '', jabatan: row.jabatan || 'Guru', status_kepegawaian: row.status_kepegawaian || 'Honorer', bidang_studi: row.bidang_studi || '', status: 'aktif' })
const gtks = await req('GET', '/gtk')
const found = gtks.find(g => g.nip === row.nip)
assert(!!found, 'Imported GTK found via API')
assert(found?.kode_guru === row.kode_guru, 'Kode Guru imported')
console.log(JSON.stringify({ ok: fail === 0, pass, fail, email, detectedHeaderRow: parsed.detectedHeaderRow }, null, 2))
if (fail) process.exit(1)
