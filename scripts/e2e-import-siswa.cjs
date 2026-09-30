// Verifikasi end-to-end impor siswa: template XLSX -> pemetaan kolom (persis
// seperti ImportExcel.handleFile) -> POST /api/siswa/bulk-import -> baca ulang
// dari API dan pastikan SELURUH identitas (ayah/ibu/wali) terisi.
//
// Pakai: BASE=http://127.0.0.1:3011 node scripts/e2e-import-siswa.cjs
const { parseColumnMap, parseTemplate, toStudentPayload } = require('./lib-import-siswa.cjs')

const BASE = process.env.BASE || 'http://127.0.0.1:3011'

async function req(method, url, body, token) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, json, text }
}

;(async () => {
  const columnMap = parseColumnMap()
  const mapped = parseTemplate(columnMap)
  console.log('[1] template diparse -> baris:', mapped.length)
  console.log('    field terbaca:', Object.keys(mapped[0]).length, Object.keys(mapped[0]).sort().join(','))

  const students = mapped.map(toStudentPayload)
  const stamp = Date.now().toString(36)

  const reg = await req('POST', '/api/auth/register', {
    nama_lembaga: `E2E Impor ${stamp}`, nama: 'Admin E2E', email: `e2e-${stamp}@uji.local`,
    password: 'UjiCoba123!', no_hp: '081200000000', slug: `e2e-${stamp}`,
  })
  console.log('[2] register:', reg.status, reg.json?.error || 'ok')
  if (reg.status >= 400) { console.log(reg.text.slice(0, 400)); process.exit(1) }

  const login = await req('POST', '/api/auth/login', { email: `e2e-${stamp}@uji.local`, password: 'UjiCoba123!' })
  const token = login.json?.token
  console.log('[3] login:', login.status, token ? 'token ok' : login.text.slice(0, 200))
  if (!token) process.exit(1)

  const rombel = await req('POST', '/api/rombel', { nama: '7A', tingkat: '7', tahun_ajaran: '2026/2027' }, token)
  console.log('[4] buat rombel 7A:', rombel.status, rombel.json?.error || rombel.json?.nama || 'ok')

  const imp = await req('POST', '/api/siswa/bulk-import', { students }, token)
  console.log('[5] bulk-import:', imp.status, JSON.stringify(imp.json))

  const list = await req('GET', '/api/siswa', null, token)
  const s = (list.json?.siswa || list.json?.data || list.json || [])[0]
  if (!s) { console.log('GAGAL: siswa tidak ditemukan', list.text.slice(0, 300)); process.exit(1) }

  const WANT = ['nama', 'nama_panggilan', 'nik', 'nis', 'nisn', 'jenis_kelamin', 'tempat_lahir', 'tanggal_lahir',
    'alamat', 'no_hp', 'agama', 'status_keluarga', 'anak_ke', 'asal_sekolah', 'nama_ortu', 'nama_ayah', 'kerja_ayah',
    'nama_ibu', 'kerja_ibu', 'alamat_ortu', 'nama_wali', 'kerja_wali', 'rombel_nama']
  const kosong = []
  for (const f of WANT) {
    const v = f === 'rombel_nama' ? s.rombel_nama : s[f]
    if (v === null || v === undefined || String(v).trim() === '') kosong.push(f)
  }
  console.log('[6] siswa tersimpan:', s.nama, '| NIS', s.nis, '| rombel', s.rombel_nama)
  console.log('    kolom terisi:', WANT.length - kosong.length, '/', WANT.length)
  if (kosong.length) {
    console.log('    KOSONG:', kosong.join(', '))
    process.exit(1)
  }
  console.log('    nama_ayah:', s.nama_ayah, '| kerja_ayah:', s.kerja_ayah, '| nama_ibu:', s.nama_ibu, '| kerja_ibu:', s.kerja_ibu)
  console.log('OK: seluruh identitas terisi dari satu kali impor')
})().catch(e => { console.error('ERROR', e); process.exit(1) })
