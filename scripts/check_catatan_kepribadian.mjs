const BASE = process.env.E2E_BASE || 'https://staging.jurnal.cc.cd/api'
const stamp = Date.now().toString(36)
const email = `catatan-${stamp}@test.local`
const password = 'Password123!'
let token = ''
let pass = 0
let fail = 0
const assert = (ok, msg) => { if (ok) pass++; else { fail++; console.error('FAIL', msg) } }
const req = async (path, opt = {}) => {
  const headers = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }
  const r = await fetch(BASE + path, { ...opt, headers: { ...headers, ...(opt.headers || {}) } })
  const text = await r.text()
  let data; try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(data)}`)
  return data
}

const reg = await req('/auth/register', { method: 'POST', body: JSON.stringify({ nama_lembaga: 'Catatan Test ' + stamp, nama: 'Admin', email, password }) })
token = reg.token
const rombel = await req('/rombel', { method: 'POST', body: JSON.stringify({ nama: 'VII A', tingkat: '7', tahun_ajaran: '2026/2027', wali_kelas_id: null, kapasitas: 32 }) })
const siswa = await req('/siswa', { method: 'POST', body: JSON.stringify({ nama: 'Ahmad Catatan', nis: 'NIS' + stamp, jenis_kelamin: 'L', rombel_id: rombel.id }) })
const payload = {
  siswa_id: siswa.id,
  tahun_ajaran: '2026/2027',
  semester: 'ganjil',
  sikap_spiritual: 'Rajin berdoa dan mengikuti ibadah.',
  sikap_sosial: 'Sopan dan peduli kepada teman.',
  kelakuan: 'Sangat Baik',
  kerajinan: 'Baik',
  kerapian: 'Baik',
  kedisiplinan: 'Cukup',
  catatan_wali_kelas: 'Perlu menjaga konsistensi belajar.',
  saran: 'Tingkatkan kedisiplinan hadir tepat waktu.',
}
await req('/catatan-kepribadian', { method: 'PUT', body: JSON.stringify(payload) })
const one = await req('/catatan-kepribadian?siswa_id=' + siswa.id + '&tahun_ajaran=2026%2F2027&semester=ganjil')
assert(one.length === 1, 'single catatan saved')
assert(one[0].kelakuan === 'Sangat Baik', 'kelakuan saved')
assert(one[0].catatan_wali_kelas.includes('konsistensi'), 'catatan wali saved')
await req('/catatan-kepribadian/bulk', { method: 'POST', body: JSON.stringify({ tahun_ajaran: '2026/2027', semester: 'ganjil', data: [{ ...payload, kelakuan: 'Baik', saran: 'Saran update' }] }) })
const after = await req('/catatan-kepribadian?rombel_id=' + rombel.id + '&tahun_ajaran=2026%2F2027&semester=ganjil')
assert(after.length === 1, 'bulk upsert keeps one row')
assert(after[0].kelakuan === 'Baik', 'bulk update works')
assert(after[0].saran === 'Saran update', 'saran updated')
console.log(JSON.stringify({ ok: fail === 0, pass, fail, email }, null, 2))
process.exit(fail ? 1 : 0)
