const BASE = process.env.E2E_BASE || 'https://staging.jurnal.cc.cd/api'
const stamp = Date.now().toString(36)
const email = `gtk-delete-${stamp}@test.local`
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
  if (res.status !== expected) { fail++; console.error(`FAIL ${method} ${path}: expected ${expected}, got ${res.status}: ${text.slice(0, 300)}`) }
  else pass++
  return data
}
function assert(cond, msg) { if (!cond) { fail++; console.error('ASSERT', msg) } else pass++ }
const reg = await req('POST', '/auth/register', { nama_lembaga: `GTK Delete ${stamp}`, nama: 'Admin', email, password, no_hp: '081234567890', domain_type: 'subdomain', slug: `gtk-delete-${stamp}` })
token = reg.token
const gtk = await req('POST', '/gtk', { nip: `G${stamp}`, nama: 'Guru Delete', jenis_kelamin: 'L', jabatan: 'guru', status_kepegawaian: 'honorer' })
const mapel = await req('POST', '/mapel', { kode: `M${stamp}`, nama: 'Mapel Delete', kelompok: 'A', jam_per_minggu: 2 })
const rombel = await req('POST', '/rombel', { nama: 'I A', tingkat: 'I', tahun_ajaran: '2026/2027', wali_kelas_id: gtk.id, kapasitas: 30 })
await req('POST', '/jadwal', { mapel_id: mapel.id, rombel_id: rombel.id, gtk_id: gtk.id, hari: 'senin', jam_mulai: '07:00', jam_selesai: '07:45', ruangan: 'R1' })
const blocked = await req('DELETE', '/gtk/' + gtk.id, null, 409)
assert(blocked.kind === 'assignment', 'delete blocked as assignment')
assert((blocked.refs || []).some(r => r.label === 'jadwal' && r.count === 1), 'delete response shows jadwal count')
const forced = await req('DELETE', '/gtk/' + gtk.id + '?force=1')
assert(forced.success === true && forced.forced === true, 'force delete succeeds')
const gtks = await req('GET', '/gtk')
assert(!gtks.some(g => g.id === gtk.id), 'GTK removed')
const jadwal = await req('GET', '/jadwal')
assert(!jadwal.some(j => j.gtk_id === gtk.id), 'related jadwal removed')
console.log(JSON.stringify({ ok: fail === 0, pass, fail, email }, null, 2))
if (fail) process.exit(1)
