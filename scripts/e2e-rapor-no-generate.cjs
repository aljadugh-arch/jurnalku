// E2E: cetak massal TANPA langkah generate. Impor siswa + penilaian harian
// (nilai sehari-hari) lalu langsung cetak massal — harus jalan (on-the-fly).
const { parseColumnMap, parseTemplate, toStudentPayload } = require('./lib-import-siswa.cjs')

const BASE = process.env.BASE || 'http://127.0.0.1:3011'
const N = Number(process.env.N || 20)
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
  const email = `nf-${Date.now().toString(36)}@uji.local`
  await req('POST', '/api/auth/register', { nama: 'Admin NF', email, password: 'UjiCoba123!', nama_lembaga: `Sekolah NF ${Date.now().toString(36)}` })
  const login = await req('POST', '/api/auth/login', { email, password: 'UjiCoba123!' })
  token = login.json.token
  await req('POST', '/api/rombel', { nama: '7A', tingkat: '7', tahun_ajaran: TA })
  const rombelId = (await req('GET', '/api/rombel')).json[0].id

  const columnMap = parseColumnMap()
  const tpl = parseTemplate(columnMap)[0]
  const students = []
  for (let i = 0; i < N; i++) students.push({ ...toStudentPayload(tpl), nama: `Siswa ${String(i + 1).padStart(3, '0')}`, nis: `200${String(i + 1).padStart(3, '0')}` })
  await req('POST', '/api/siswa/bulk-import', { students, tahun_ajaran: TA })

  const m1 = (await req('POST', '/api/mapel', { nama: 'Matematika', kode: 'MTK', tahun_ajaran: TA })).json
  const mid = m1.id || m1.mapel?.id
  const semua = (await req('GET', '/api/siswa')).json
  await req('POST', '/api/penilaian-harian/bulk', {
    mapel_id: mid, tanggal: '2026-09-15',
    data: semua.map(s => ({ siswa_id: s.id, sikap: 80, keaktifan: 75, pengetahuan: 70 + (s.nama.length % 20) })),
  })

  // --- TANPA POST /api/rapor/generate ---
  console.log('[cek] jumlah baris rapor sebelum cetak:', (await req('GET', '/api/rapor?tahun_ajaran=' + TA)).json?.length ?? 'n/a')

  const t0 = Date.now()
  const bulk = await req('GET', `/api/rapor/export/pdf-bulk?rombel_id=${rombelId}&tahun_ajaran=${TA}&semester=${SEM}&jenis=rapor_sts&bagian=lengkap`)
  const dt = Date.now() - t0
  if (bulk.pdf) {
    console.log(`[cetak massal TANPA generate] ${N} siswa: %PDF ${bulk.pdf.length}B, ${hal(bulk.pdf)} halaman, ${dt}ms`)
    console.log('SUKSES: cetak massal jalan tanpa generate.')
  } else {
    console.log(`GAGAL: status=${bulk.status} ${JSON.stringify(bulk.json)}`)
    process.exit(1)
  }
})().catch(e => { console.error('E2E GAGAL:', e); process.exit(1) })
