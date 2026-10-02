// E2E cetak MASSAL: banyak siswa satu rombel -> satu PDF. Ukur kecepatan.
const { parseColumnMap, parseTemplate, toStudentPayload } = require('./lib-import-siswa.cjs')

const BASE = process.env.BASE || 'http://127.0.0.1:3011'
const N = Number(process.env.N || 30)
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
  const email = `bulk-${Date.now().toString(36)}@uji.local`
  await req('POST', '/api/auth/register', { nama: 'Admin Bulk', email, password: 'UjiCoba123!', nama_lembaga: `Sekolah Bulk ${Date.now().toString(36)}` })
  const login = await req('POST', '/api/auth/login', { email, password: 'UjiCoba123!' })
  token = login.json.token
  await req('POST', '/api/rombel', { nama: '7A', tingkat: '7', tahun_ajaran: TA })
  const rombels = (await req('GET', '/api/rombel')).json
  const rombelId = rombels[0].id

  // Impor N siswa (nama dibuat unik dari template baris contoh).
  const columnMap = parseColumnMap()
  const base = parseTemplate(columnMap)
  const tpl = base[0]
  const students = []
  for (let i = 0; i < N; i++) {
    students.push({ ...toStudentPayload(tpl), nama: `Siswa Uji ${String(i + 1).padStart(3, '0')}`, nis: `100${String(i + 1).padStart(3, '0')}` })
  }
  const imp = await req('POST', '/api/siswa/bulk-import', { students, tahun_ajaran: TA })
  console.log(`[impor] ${N} siswa:`, imp.status, imp.json.success, 'failed=', imp.json.failed)

  // Buat 2 mapel + nilai harian untuk semua siswa (bulk penilaian).
  const m1 = (await req('POST', '/api/mapel', { nama: 'Matematika', kode: 'MTK', tahun_ajaran: TA })).json
  const m2 = (await req('POST', '/api/mapel', { nama: 'IPA', kode: 'IPA', tahun_ajaran: TA })).json
  const mapelIds = [m1.id || m1.mapel?.id, m2.id || m2.mapel?.id].filter(Boolean)
  const semua = (await req('GET', '/api/siswa')).json
  for (const mid of mapelIds) {
    const data = semua.map(s => ({ siswa_id: s.id, sikap: 0, keaktifan: 0, pengetahuan: 70 + (s.nama.length % 25) }))
    await req('POST', '/api/penilaian-harian/bulk', { mapel_id: mid, tanggal: '2026-09-15', data })
  }
  console.log('[penilaian] 2 mapel x', semua.length, 'siswa selesai')

  // Generate rapor PER ROMBEL (sekali jalan untuk seluruh kelas).
  const gen = await req('POST', '/api/rapor/generate', { rombel_id: rombelId, tahun_ajaran: TA, semester: SEM, jenis: 'rapor_sts' })
  console.log('[generate]', gen.status, gen.json.message)

  // Cetak massal satu kelas.
  const t0 = Date.now()
  const bulk = await req('GET', `/api/rapor/export/pdf-bulk?rombel_id=${rombelId}&tahun_ajaran=${TA}&semester=${SEM}&jenis=rapor_sts&bagian=lengkap`)
  const dt = Date.now() - t0
  console.log(`[cetak massal] ${N} siswa:`, bulk.status, bulk.pdf ? `%PDF ${bulk.pdf.length}B hal=${hal(bulk.pdf)} dalam ${dt}ms` : JSON.stringify(bulk.json))
  console.log(`-> ${hal(bulk.pdf)} halaman untuk ${N} siswa = ${Math.round(hal(bulk.pdf) / N)} halaman/siswa`)
})().catch(e => { console.error('E2E GAGAL:', e); process.exit(1) })
