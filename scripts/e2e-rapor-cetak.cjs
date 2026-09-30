// Verifikasi end-to-end menu cetak rapor: cover / identitas / nilai / lengkap
// lewat endpoint produksi /api/rapor/export/pdf, plus validasi `bagian` dan
// penyimpanan pelengkap rapor tanpa field tinggi/berat/kondisi kesehatan.
const fs = require('node:fs')
const { parseColumnMap, parseTemplate, toStudentPayload } = require('./lib-import-siswa.cjs')

const BASE = process.env.BASE || 'http://127.0.0.1:3011'
const TA = process.env.TA || '2026/2027'
const SEM = process.env.SEM || 'ganjil'
const TANGGAL = process.env.TANGGAL || '2026-09-15'

let token = ''
async function req(method, url, body, raw) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), ctype: res.headers.get('content-type') }
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* bukan json */ }
  return { status: res.status, json, text }
}

function countPages(buf) {
  const s = buf.toString('latin1')
  const m = s.match(/\/Type\s*\/Page[^s]/g)
  return m ? m.length : 0
}

;(async () => {
  const email = `e2e-cetak-${Date.now()}@contoh.id`
  let r = await req('POST', '/api/auth/register', {
    nama: 'Admin E2E', email, password: 'UjiCoba123!', nama_lembaga: `Sekolah Uji Cetak ${Date.now().toString(36)}`,
  })
  console.log('[1] register:', r.status, r.json?.message || r.json?.error || '')

  r = await req('POST', '/api/auth/login', { email, password: 'UjiCoba123!' })
  token = r.json?.token
  console.log('[2] login:', r.status, token ? 'token ok' : JSON.stringify(r.json))
  if (!token) process.exit(1)

  r = await req('POST', '/api/rombel', { nama: '7A', tingkat: '7', tahun_ajaran: TA })
  let rombelId = r.json?.id
  if (!rombelId) {
    const list = await req('GET', '/api/rombel')
    rombelId = (list.json?.data || list.json || []).find(x => x.nama === '7A')?.id
  }
  console.log('[3] rombel:', r.status, rombelId || JSON.stringify(r.json))

  // impor siswa memakai template resmi + pemetaan kolom yang sama dengan UI
  const students = parseTemplate(parseColumnMap()).map(toStudentPayload)
  r = await req('POST', '/api/siswa/bulk-import', { students })
  console.log('[4] impor siswa:', r.status, JSON.stringify(r.json))

  r = await req('GET', '/api/siswa')
  const siswa = (r.json?.data || r.json || [])[0]
  if (!siswa) { console.log('GAGAL: siswa tidak ditemukan'); process.exit(1) }
  const siswaId = siswa.id
  console.log('[5] siswa:', siswa.nama, '| rombel:', siswa.rombel_nama || siswa.rombel_id)

  r = await req('POST', '/api/mapel', { kode: 'MTK', nama: 'Matematika', kelompok: 'wajib', jam_per_minggu: 4 })
  const mapelId = r.json?.id
  console.log('[6] mapel:', r.status, mapelId || JSON.stringify(r.json))

  r = await req('POST', '/api/penilaian-harian/bulk', {
    mapel_id: mapelId, tanggal: TANGGAL,
    data: [{ siswa_id: siswaId, sikap: 90, keaktifan: 85, pengetahuan: 88, catatan: 'uji' }],
  })
  console.log('[7] penilaian harian:', r.status, JSON.stringify(r.json))

  r = await req('POST', '/api/rapor/generate', { rombel_id: rombelId, tahun_ajaran: TA, semester: SEM, jenis: 'rapor_sts' })
  console.log('[8] generate rapor:', r.status, JSON.stringify(r.json))

  // pelengkap rapor: tanpa tinggi/berat/kondisi kesehatan
  r = await req('PUT', '/api/rapor/pelengkap', {
    siswa_id: siswaId, tahun_ajaran: TA, semester: SEM, jenis: 'rapor_sts',
    catatan_wali_kelas: 'Semangat belajar.', prestasi: 'Juara kelas', tanggal_pembagian: '2026-12-20',
    tanggapan_orang_tua: 'Terima kasih.', keputusan: '',
  })
  console.log('[9] simpan pelengkap:', r.status, JSON.stringify(r.json))

  const hasil = {}
  for (const bagian of ['cover', 'identitas', 'nilai', 'lengkap']) {
    const q = `/api/rapor/export/pdf?siswa_id=${siswaId}&tahun_ajaran=${encodeURIComponent(TA)}&semester=${SEM}&jenis=rapor_sts&bagian=${bagian}`
    const out = await req('GET', q, undefined, true)
    const magic = out.buf.slice(0, 4).toString('latin1')
    hasil[bagian] = { status: out.status, ctype: out.ctype, magic, bytes: out.buf.length, pages: countPages(out.buf) }
    console.log(`[10] cetak ${bagian.padEnd(9)}: ${out.status} ${magic} ${out.buf.length}B hal=${hasil[bagian].pages}`)
    fs.writeFileSync(`/tmp/rapor-${bagian}.pdf`, out.buf)
  }

  const bad = await req('GET', `/api/rapor/export/pdf?siswa_id=${siswaId}&tahun_ajaran=${encodeURIComponent(TA)}&semester=${SEM}&jenis=rapor_sts&bagian=ngawur`)
  console.log('[11] bagian ngawur:', bad.status, bad.json?.error)

  const fail = []
  for (const [bagian, h] of Object.entries(hasil)) {
    if (h.status !== 200) fail.push(`${bagian}: status ${h.status}`)
    if (h.magic !== '%PDF') fail.push(`${bagian}: bukan PDF (${h.magic})`)
    if (h.pages < 1) fail.push(`${bagian}: 0 halaman`)
  }
  if (!(hasil.cover.pages < hasil.lengkap.pages)) fail.push(`cover(${hasil.cover.pages} hal) tidak lebih ringkas dari lengkap(${hasil.lengkap.pages} hal)`)
  if (bad.status !== 400) fail.push(`bagian ngawur harus 400, dapat ${bad.status}`)

  if (fail.length) { console.log('GAGAL:'); fail.forEach(f => console.log('  - ' + f)); process.exit(1) }
  console.log('OK: cover/identitas/nilai/lengkap semua PDF valid; bagian ngawur ditolak 400')
})().catch(e => { console.error('ERROR', e); process.exit(1) })
