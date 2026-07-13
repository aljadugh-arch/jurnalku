import ExcelJS from 'exceljs'

const BASE = process.env.E2E_BASE || 'https://staging.jurnal.cc.cd/api'
const stamp = Date.now().toString(36)
const email = `qr-excel-${stamp}@test.local`
const password = 'Password123!'
let token = ''
let pass = 0
let fail = 0

async function req(method, path, body, expected = 200) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
  if (res.status !== expected) {
    fail++
    console.error(`FAIL ${method} ${path}: expected ${expected}, got ${res.status}: ${text.slice(0, 300)}`)
  } else pass++
  return data
}
function assert(cond, msg) {
  if (!cond) { fail++; console.error('ASSERT', msg) } else pass++
}
const todayJakarta = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

const reg = await req('POST', '/auth/register', {
  nama_lembaga: `QR Excel ${stamp}`,
  nama: 'Admin QR Excel',
  email,
  password,
  no_hp: '081234567890',
  domain_type: 'subdomain',
  slug: `qr-excel-${stamp}`,
})
token = reg.token
await req('PUT', '/settings', { nama_lembaga: `QR Excel ${stamp}`, jenjang: 'MI', hari_libur: '["jumat","minggu"]' })
const gtk = await req('POST', '/gtk', { nip: `G${stamp}`, kode_guru: 'A', nama: 'Guru QR', jenis_kelamin: 'L', jabatan: 'guru', status_kepegawaian: 'tetap' })
const mapel = await req('POST', '/mapel', { kode: `M${stamp}`, nama: 'Matematika', kelompok: 'A', jam_per_minggu: 4 })
const rombel = await req('POST', '/rombel', { nama: 'I A PUTRA', tingkat: 'I', tahun_ajaran: '2026/2027', wali_kelas_id: gtk.id, kapasitas: 30 })
const siswa = await req('POST', '/siswa', { nis: `S${stamp}`, nisn: `SN${stamp}`, nama: 'Siswa QR', jenis_kelamin: 'L', rombel_id: rombel.id })
await req('POST', '/jadwal', { mapel_id: mapel.id, rombel_id: rombel.id, gtk_id: gtk.id, hari: 'sabtu', jam_mulai: '07:00', jam_selesai: '07:35', ruangan: 'R1' })

const firstScan = await req('POST', '/absensi-siswa/qr-scan', { token: siswa.id })
assert(firstScan.siswa?.nama === 'Siswa QR', 'QR scan returns student')
assert(!firstScan.already, 'first QR scan not already')
const secondScan = await req('POST', '/absensi-siswa/qr-scan', { token: siswa.id })
assert(secondScan.already === true, 'second QR scan already=true')
const absensi = await req('GET', `/absensi-siswa?tanggal=${todayJakarta()}&rombel_id=${rombel.id}`)
assert(absensi.length === 1, 'QR attendance row created for Jakarta date')
assert(absensi[0].status === 'hadir', 'QR attendance status hadir')
assert(absensi[0].metode === 'qr', 'QR attendance method qr')
await req('POST', '/absensi-siswa/qr-scan', { token: 'not-a-siswa-id' }, 404)

const wb = new ExcelJS.Workbook()
const ws = wb.addWorksheet('Master Jadwal')
ws.getCell('A1').value = 'JADWAL PELAJARAN'
ws.mergeCells('A1:E1')
ws.getCell('A2').value = `QR Excel ${stamp}`
ws.mergeCells('A2:E2')
ws.getCell('A4').value = 'HARI'
ws.getCell('B4').value = 'JAM'
ws.getCell('C4').value = 'WAKTU'
ws.getCell('D4').value = 'I A PUTRA'
ws.mergeCells('D4:E4')
ws.getCell('D5').value = 'KG'
ws.getCell('E5').value = 'MAPEL'
ws.getCell('A6').value = 'SABTU'
ws.getCell('B6').value = 1
ws.getCell('C6').value = '07:00-07:35'
ws.getCell('D6').value = 'A'
ws.getCell('E6').value = 'Matematika'
ws.getCell('D10').value = 'Istirahat Pertama ( Sholat Dhuha )'
ws.getCell('A20').value = 'KODE GURU'
ws.getCell('A21').value = 'A'
ws.getCell('B21').value = 'Guru QR'
const buf = await wb.xlsx.writeBuffer()
const wb2 = new ExcelJS.Workbook()
await wb2.xlsx.load(buf)
const ws2 = wb2.getWorksheet('Master Jadwal')
assert(ws2.getCell('A1').value === 'JADWAL PELAJARAN', 'Excel title exists')
assert(ws2.getCell('D4').value === 'I A PUTRA', 'Excel rombel header exists')
assert(ws2.getCell('D5').value === 'KG' && ws2.getCell('E5').value === 'MAPEL', 'Excel KG/MAPEL header exists')
assert(ws2.getCell('D10').value === 'Istirahat Pertama ( Sholat Dhuha )', 'Excel istirahat label exists')
assert(ws2.getCell('A20').value === 'KODE GURU', 'Excel kode guru footer exists')

console.log(JSON.stringify({ ok: fail === 0, pass, fail, email, checks: pass + fail }, null, 2))
if (fail) process.exit(1)
