const BASE = process.env.E2E_BASE || 'https://staging.jurnal.cc.cd/api'
const stamp = Date.now().toString(36)
const email = `reset-${stamp}@test.local`
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
const reg = await req('/auth/register', { method: 'POST', body: JSON.stringify({ nama_lembaga: 'Reset Test ' + stamp, nama: 'Admin', email, password }) })
token = reg.token
const gtk = await req('/gtk', { method: 'POST', body: JSON.stringify({ nama: 'Guru Reset', jenis_kelamin: 'L', kode_guru: 'GR' + stamp }) })
const mapel = await req('/mapel', { method: 'POST', body: JSON.stringify({ kode: 'M' + stamp, nama: 'Mapel Reset', jam_per_minggu: 2 }) })
const rombel = await req('/rombel', { method: 'POST', body: JSON.stringify({ nama: 'VII Reset', tingkat: '7', tahun_ajaran: '2026/2027', wali_kelas_id: null, kapasitas: 32 }) })
const siswa = await req('/siswa', { method: 'POST', body: JSON.stringify({ nama: 'Siswa Reset', nis: 'NIS' + stamp, jenis_kelamin: 'L', rombel_id: rombel.id }) })
await req('/jadwal', { method: 'POST', body: JSON.stringify({ mapel_id: mapel.id, rombel_id: rombel.id, gtk_id: gtk.id, hari: 'senin', jam_mulai: '07:00', jam_selesai: '08:00' }) })
assert((await req('/siswa')).length > 0, 'siswa seeded')
assert((await req('/gtk')).length > 0, 'gtk seeded')
await req('/settings/reset-data', { method: 'POST', body: JSON.stringify({ confirm: 'RESET DATA' }) })
assert((await req('/siswa')).length === 0, 'siswa reset')
assert((await req('/gtk')).length === 0, 'gtk reset')
assert((await req('/mapel')).length === 0, 'mapel reset')
assert((await req('/rombel')).length === 0, 'rombel reset')
const me = await req('/auth/me')
assert(me.email === email, 'admin survives reset')
console.log(JSON.stringify({ ok: fail === 0, pass, fail, email }, null, 2))
process.exit(fail ? 1 : 0)
