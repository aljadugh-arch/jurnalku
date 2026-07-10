const base = 'https://jurnal.cc.cd/api'
const stamp = Date.now().toString(36)
let token = ''
const out = []
async function req(method, path, body, expect = 200) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const txt = await res.text()
  let data; try { data = txt ? JSON.parse(txt) : null } catch { data = txt }
  const ok = Array.isArray(expect) ? expect.includes(res.status) : res.status === expect
  out.push(`${ok ? 'OK' : 'FAIL'} ${method} ${path} -> ${res.status}`)
  if (!ok) throw new Error(`${method} ${path} expected ${expect}, got ${res.status}: ${txt}`)
  return data
}
const email = `qa-${stamp}@example.com`
const reg = await req('POST', '/auth/register', {
  nama_lembaga: `QA E2E ${stamp}`,
  nama: 'Admin QA', email, password: 'Password123!', no_hp: '081234567890', domain_type: 'subdomain', slug: `qa-${stamp}`
})
token = reg.token
await req('PUT', '/settings', { nama_lembaga: `QA E2E ${stamp}`, alamat: 'Jl QA', telepon: '0800', email, theme: 'light', primary_color: '#1e40af', accent_color: '#059669', sidebar_color: '#1e293b', geo_radius: 200, jenjang: 'MI' })
const gtk = await req('POST', '/gtk', { nip: `NIP${stamp}`, nuptk: '', nama: 'Guru QA', jenis_kelamin: 'L', tempat_lahir: 'Jakarta', tanggal_lahir: '1990-01-01', alamat: 'Jl Guru', no_hp: '0811', email: `guru-${stamp}@example.com`, jabatan: 'guru', status_kepegawaian: 'tetap', bidang_studi: 'Matematika' })
const mapel = await req('POST', '/mapel', { kode: `MTK${stamp}`, nama: 'Matematika QA', kelompok: 'Umum', jam_per_minggu: 4 })
const rombel = await req('POST', '/rombel', { nama: '1-A', tingkat: '1', tahun_ajaran: '2026/2027', wali_kelas_id: gtk.id, kapasitas: 30 })
const siswa = await req('POST', '/siswa', { nis: `NIS${stamp}`, nisn: `NISN${stamp}`, nama: 'Siswa QA', jenis_kelamin: 'L', tempat_lahir: 'Bandung', tanggal_lahir: '2018-01-01', alamat: 'Jl Siswa', no_hp: '0822', nama_ortu: 'Ortu QA', rombel_id: rombel.id })
await req('POST', '/jadwal', { mapel_id: mapel.id, rombel_id: rombel.id, gtk_id: gtk.id, hari: 'senin', jam_mulai: '07:00', jam_selesai: '07:45', ruangan: 'R1' })
await req('POST', '/jadwal', { mapel_id: mapel.id, rombel_id: rombel.id, gtk_id: gtk.id, hari: 'senin', jam_mulai: '07:15', jam_selesai: '08:00', ruangan: 'R1' }, 409)
const konflik = await req('GET', '/jadwal/konflik', null, 200)
await req('POST', '/absensi-siswa/bulk', { tanggal: '2026-07-08', rombel_id: rombel.id, data: [{ siswa_id: siswa.id, status: 'hadir', waktu_absen: '07:10', metode: 'manual', keterangan: 'QA' }] })
await req('POST', '/absensi-guru', { gtk_id: gtk.id, tanggal: '2026-07-08', status: 'hadir', waktu_masuk: '07:00', waktu_pulang: '14:00', keterangan: 'QA' })
const ekskul = await req('POST', '/ekskul', { nama: 'Pramuka QA', pembina_id: gtk.id, hari: 'Jumat', jam_mulai: '15:00', jam_selesai: '16:00', deskripsi: 'QA' })
await req('POST', `/ekskul/${ekskul.id}/anggota`, { siswa_ids: [siswa.id] })
await req('POST', '/absensi-ekskul/bulk', { tanggal: '2026-07-08', ekskul_id: ekskul.id, data: [{ siswa_id: siswa.id, status: 'hadir', keterangan: 'QA' }] })
const jt = await req('POST', '/jenis-tagihan', { nama: 'SPP QA', nominal: 10000, deskripsi: 'QA', tipe: 'bulanan' })
await req('POST', '/tagihan/generate', { jenis_tagihan_id: jt.id, rombel_id: rombel.id, bulan: 'Juli', tahun: '2026', nominal: 10000 })
const tags = await req('GET', '/tagihan', null, 200)
if (!tags.length) throw new Error('tagihan kosong setelah generate')
await req('PUT', `/tagihan/${tags[0].id}/bayar`, { metode_bayar: 'tunai', keterangan: 'QA bayar' })
await req('POST', '/tabungan', { siswa_id: siswa.id, tipe: 'setor', nominal: 5000, keterangan: 'QA setor' })
await req('GET', '/tabungan/saldo', null, 200)
await req('POST', '/jurnal', { tanggal: '2026-07-08', guru_id: gtk.id, rombel_id: rombel.id, mapel_id: mapel.id, jam_ke: 1, materi: 'Materi QA', kegiatan: 'Kegiatan QA', catatan: 'Catatan QA', status: 'submitted' })
await req('GET', '/supervisi/rekap', null, 200)
await req('POST', '/penilaian-harian', { siswa_id: siswa.id, mapel_id: mapel.id, tanggal: '2026-07-08', jenis: 'tugas', nilai: 90, keterangan: 'QA' }, [200, 201])
await req('GET', `/penilaian-harian/rekap/${siswa.id}`, null, 200)
await req('GET', '/dashboard/stats', null, 200)
await req('GET', '/users', null, 200)
console.log(out.join('\n'))
console.log('SUMMARY', JSON.stringify({ tenant: reg.slug, email, konflik_count: konflik.length, tagihan_count: tags.length }, null, 2))
