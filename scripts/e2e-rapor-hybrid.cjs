// E2E: hybrid input (import CSV/Google Sheets path) + cetak per rombel & SEMUA
// kelas (tanpa generate). Membuktikan alur impor nilai -> cetak massal on-the-fly.
const { parseColumnMap, parseTemplate, toStudentPayload } = require('./lib-import-siswa.cjs')

const BASE = process.env.BASE || 'http://127.0.0.1:3011'
const N = Number(process.env.N || 6)
const TA = '2026/2027'
const SEM = 'ganjil'
let token = ''

async function req(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/pdf')) return { status: res.status, pdf: Buffer.from(await res.arrayBuffer()) }
  return { status: res.status, json: await res.json().catch(() => ({})) }
}
const hal = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length

;(async () => {
  const email = `hyb-${Date.now().toString(36)}@uji.local`
  await req('POST', '/api/auth/register', { nama: 'Admin Hybrid', email, password: 'UjiCoba123!', nama_lembaga: `Sekolah Hybrid ${Date.now().toString(36)}` })
  const login = await req('POST', '/api/auth/login', { email, password: 'UjiCoba123!' })
  token = login.json.token

  await req('POST', '/api/rombel', { nama: '7A', tingkat: '7', tahun_ajaran: TA })
  await req('POST', '/api/rombel', { nama: '8A', tingkat: '8', tahun_ajaran: TA })
  const rombels = (await req('GET', '/api/rombel')).json

  const columnMap = parseColumnMap()
  const tpl = parseTemplate(columnMap)[0]
  const students = []
  for (let i = 0; i < N; i++) {
    const r = rombels[i % rombels.length]
    students.push({ ...toStudentPayload(tpl), nama: `Siswa ${String(i + 1).padStart(3, '0')}`, nis: `300${String(i + 1).padStart(3, '0')}`, rombel_id: r.id })
  }
  await req('POST', '/api/siswa/bulk-import', { students, tahun_ajaran: TA })
  await req('POST', '/api/mapel', { nama: 'Matematika', kode: 'MTK', tahun_ajaran: TA })
  await req('POST', '/api/mapel', { nama: 'IPA', kode: 'IPA', tahun_ajaran: TA })

  const semua = (await req('GET', '/api/siswa')).json
  // CSV matriks: NIS + kolom mapel. Import via jalur /api/rapor/import (hybrid).
  const csv = ['NIS;Matematika;IPA']
  for (const s of semua) csv.push(`${s.nis};${70 + (s.nama.length % 25)};${75 + (s.nis.length % 20)}`)

  const prev = await req('POST', '/api/rapor/import/preview', { jenis: 'sts', csv_text: csv.join('\n') })
  if (prev.status !== 200 || !prev.json.success) { console.log('GAGAL preview:', JSON.stringify(prev.json)); process.exit(1) }
  console.log(`[impor preview] ${prev.json.jumlah_cocok} nilai cocok, ${prev.json.jumlah_tidak_cocok} gagal`)

  const applied = await req('POST', '/api/rapor/import/apply', { jenis: 'sts', tahun_ajaran: TA, semester: SEM, items: prev.json.items })
  if (applied.status !== 200 || !applied.json.success) { console.log('GAGAL apply:', JSON.stringify(applied.json)); process.exit(1) }
  console.log(`[impor apply] ${applied.json.message}`)

  // Cetak PER ROMBEL (kelas pertama).
  const r0 = rombels[0].id
  const perRombel = await req('GET', `/api/rapor/export/pdf-bulk?rombel_id=${r0}&tahun_ajaran=${TA}&semester=${SEM}&jenis=rapor_sts&bagian=lengkap`)
  if (!perRombel.pdf) { console.log('GAGAL cetak per rombel:', JSON.stringify(perRombel.json)); process.exit(1) }
  console.log(`[cetak per rombel] ${hal(perRombel.pdf)} halaman, ${perRombel.pdf.length}B`)

  // Cetak SEMUA kelas (tanpa rombel_id).
  const semuaPdf = await req('GET', `/api/rapor/export/pdf-bulk?tahun_ajaran=${TA}&semester=${SEM}&jenis=rapor_sts&bagian=lengkap`)
  if (!semuaPdf.pdf) { console.log('GAGAL cetak semua:', JSON.stringify(semuaPdf.json)); process.exit(1) }
  console.log(`[cetak semua kelas] ${hal(semuaPdf.pdf)} halaman, ${semuaPdf.pdf.length}B`)

  console.log('SUKSES: hybrid input + cetak per rombel & semua kelas jalan tanpa generate.')
})().catch(e => { console.error('E2E GAGAL:', e); process.exit(1) })
