// Verifikasi end-to-end format alternatif "mtsplus" via route /api/rapor/export/pdf.
const { parseColumnMap, parseTemplate, toStudentPayload } = require('./lib-import-siswa.cjs')

const BASE = process.env.BASE || 'http://127.0.0.1:3011'
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
  const email = `alt-${Date.now().toString(36)}@uji.local`
  let r = await req('POST', '/api/auth/register', { nama: 'Admin ALT', email, password: 'UjiCoba123!', nama_lembaga: `Sekolah ALT ${Date.now().toString(36)}` })
  r = await req('POST', '/api/auth/login', { email, password: 'UjiCoba123!' })
  token = r.json.token
  await req('POST', '/api/rombel', { nama: '7A', tingkat: '7', tahun_ajaran: TA })
  const siswaList = (await req('GET', '/api/rombel')).json
  const rombelId = siswaList[0].id
  const columnMap = parseColumnMap()
  const rows = parseTemplate(columnMap)
  const students = rows.map(toStudentPayload)
  await req('POST', '/api/siswa/bulk-import', { students, tahun_ajaran: TA })
  const siswa = (await req('GET', '/api/siswa')).json[0]
  const siswaId = siswa.id
  const mapel = (await req('POST', '/api/mapel', { nama: 'Matematika', kode: 'MTK', tahun_ajaran: TA })).json
  const mapelId = mapel.id || mapel.mapel?.id
  await req('POST', '/api/penilaian-harian/bulk', { mapel_id: mapelId, tanggal: '2026-09-15', data: [{ siswa_id: siswaId, sikap: 0, keaktifan: 0, pengetahuan: 85 }] })
  await req('POST', '/api/rapor/generate', { rombel_id: rombelId, tahun_ajaran: TA, semester: SEM, jenis: 'rapor_sts' })

  for (const bagian of ['cover', 'identitas', 'nilai', 'lengkap']) {
    r = await req('GET', `/api/rapor/export/pdf?siswa_id=${siswaId}&tahun_ajaran=${TA}&semester=${SEM}&jenis=rapor_sts&bagian=${bagian}&format=mtsplus`)
    console.log(`mtsplus/${bagian}:`, r.status, r.pdf ? `%PDF ${r.pdf.length}B hal=${hal(r.pdf)}` : JSON.stringify(r.json))
  }
  r = await req('GET', `/api/rapor/export/pdf?siswa_id=${siswaId}&tahun_ajaran=${TA}&semester=${SEM}&jenis=rapor_sts&bagian=lengkap&format=bogus`)
  console.log('format bogus:', r.status, JSON.stringify(r.json))
})().catch(e => { console.error('E2E GAGAL:', e); process.exit(1) })
