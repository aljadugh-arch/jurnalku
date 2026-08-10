const BASE = 'https://jurnal.cc.cd/api';
const stamp = Date.now().toString(36);
const email = `e2e-${stamp}@test.local`;
const password = 'Password123!';
const results = [];
let token = '';
let tenantId = '';

async function req(method, path, body, ok = [200]) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!ok.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  results.push(`${method} ${path} -> ${res.status}`);
  return data;
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function decodeJwt(t) { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()); }

const reg = await req('POST', '/auth/register', {
  nama_lembaga: `E2E Lembaga ${stamp}`,
  nama: `Admin E2E ${stamp}`,
  email,
  password,
  no_hp: '081234567890',
  domain_type: 'subdomain',
  slug: `e2e-${stamp}`
});
token = reg.token;
tenantId = decodeJwt(token).tenant_id;
assert(tenantId, 'tenant_id missing');
results.push(`TENANT ${tenantId}`);

await req('PUT', '/settings', { nama_lembaga: `E2E Lembaga ${stamp}`, alamat: 'Jl Test', telepon: '021', email, theme: 'light', primary_color: '#1e40af', accent_color: '#059669', sidebar_color: '#1e293b', geo_radius: 200, jenjang: 'MI' });
const settings = await req('GET', '/settings');
assert(settings.jenjang === 'MI', 'settings jenjang not saved');

const gtk1 = await req('POST', '/gtk', { nip: `NIP${stamp}1`, nuptk: '', nama: `Guru E2E ${stamp}`, jenis_kelamin: 'L', tempat_lahir: 'Test', tanggal_lahir: '1990-01-01', alamat: 'Jl Guru', no_hp: '0811', email: `guru-${stamp}@test.local`, jabatan: 'guru', status_kepegawaian: 'tetap', bidang_studi: 'Matematika' });
const gtk2 = await req('POST', '/gtk', { nip: `NIP${stamp}2`, nuptk: '', nama: `Wali E2E ${stamp}`, jenis_kelamin: 'P', tempat_lahir: 'Test', tanggal_lahir: '1991-01-01', alamat: 'Jl Wali', no_hp: '0812', email: `wali-${stamp}@test.local`, jabatan: 'wali_kelas', status_kepegawaian: 'tetap', bidang_studi: 'Umum' });
assert((await req('GET', '/gtk')).length >= 2, 'gtk list too small');

const mapel = await req('POST', '/mapel', { kode: `MTK${stamp}`, nama: `Matematika E2E ${stamp}`, kelompok: 'A', jam_per_minggu: 4 });
assert((await req('GET', '/mapel')).some(x => x.id === mapel.id), 'mapel not listed');

const rombel = await req('POST', '/rombel', { nama: '1-A', tingkat: '1', tahun_ajaran: '2026/2027', wali_kelas_id: gtk2.id, kapasitas: 32 });
assert((await req('GET', '/rombel')).some(x => x.id === rombel.id), 'rombel not listed');

const siswa = await req('POST', '/siswa', { nis: `NIS${stamp}`, nisn: `NISN${stamp}`, nama: `Siswa E2E ${stamp}`, jenis_kelamin: 'L', tempat_lahir: 'Test', tanggal_lahir: '2018-01-01', alamat: 'Jl Siswa', no_hp: '0813', nama_ortu: 'Ortu E2E', rombel_id: rombel.id });
assert((await req('GET', `/siswa?rombel_id=${rombel.id}`)).some(x => x.id === siswa.id), 'siswa not listed');

const pengajar = await req('POST', '/pengajar', { gtk_id: gtk1.id, mapel_id: mapel.id, rombel_id: rombel.id, tahun_ajaran: '2026/2027' });
assert(pengajar.id, 'pengajar not created');

const jadwal = await req('POST', '/jadwal', { mapel_id: mapel.id, rombel_id: rombel.id, gtk_id: gtk1.id, hari: 'senin', jam_mulai: '07:00', jam_selesai: '07:45', ruangan: 'R1' });
assert(jadwal.id, 'jadwal not created');
await req('POST', '/jadwal', { mapel_id: mapel.id, rombel_id: rombel.id, gtk_id: gtk1.id, hari: 'senin', jam_mulai: '07:15', jam_selesai: '08:00', ruangan: 'R2' }, [409]);
assert((await req('GET', '/jadwal/konflik')).length === 0, 'unexpected jadwal konflik after blocked insert');

await req('POST', '/absensi-siswa/bulk', { tanggal: '2026-07-08', rombel_id: rombel.id, data: [{ siswa_id: siswa.id, status: 'hadir', waktu_absen: '07:00', metode: 'manual', keterangan: 'E2E' }] });
assert((await req('GET', `/absensi-siswa?tanggal=2026-07-08&rombel_id=${rombel.id}`)).length === 1, 'absensi siswa missing');
await req('POST', '/absensi-guru', { gtk_id: gtk1.id, tanggal: '2026-07-08', status: 'hadir', waktu_masuk: '07:00', waktu_pulang: '14:00', keterangan: 'E2E' });
assert((await req('GET', '/absensi-guru?tanggal=2026-07-08')).length === 1, 'absensi guru missing');

const ekskul = await req('POST', '/ekskul', { nama: `Pramuka E2E ${stamp}`, pembina_id: gtk1.id, hari: 'Senin', jam_mulai: '15:00', jam_selesai: '16:00', deskripsi: 'E2E' });
await req('POST', `/ekskul/${ekskul.id}/anggota`, { siswa_ids: [siswa.id] });
assert((await req('GET', `/ekskul/${ekskul.id}/anggota`)).length === 1, 'anggota ekskul missing');
await req('POST', '/absensi-ekskul/bulk', { tanggal: '2026-07-08', ekskul_id: ekskul.id, data: [{ siswa_id: siswa.id, status: 'hadir', keterangan: 'E2E' }] });
assert((await req('GET', `/absensi-ekskul?tanggal=2026-07-08&ekskul_id=${ekskul.id}`)).length === 1, 'absensi ekskul missing');

const jenis = await req('POST', '/jenis-tagihan', { nama: `SPP E2E ${stamp}`, nominal: 50000, deskripsi: 'E2E', tipe: 'bulanan' });
await req('POST', '/tagihan/generate', { jenis_tagihan_id: jenis.id, rombel_id: rombel.id, bulan: 7, tahun: 2026 });
const tagihan = await req('GET', `/tagihan?siswa_id=${siswa.id}`);
assert(tagihan.length === 1, 'tagihan missing');
await req('PUT', `/tagihan/${tagihan[0].id}/bayar`, { metode_bayar: 'tunai', keterangan: 'E2E' });
assert((await req('GET', `/tagihan?siswa_id=${siswa.id}&status=lunas`)).length === 1, 'pembayaran not lunas');
await req('POST', '/tabungan', { siswa_id: siswa.id, tipe: 'setor', nominal: 25000, keterangan: 'E2E setor' });
assert((await req('GET', `/tabungan?siswa_id=${siswa.id}`)).length === 1, 'tabungan missing');

await req('POST', '/users', { nama: `Kepala E2E ${stamp}`, email: `kepala-${stamp}@test.local`, password: 'Password123!', role: 'kepala' });
assert((await req('GET', '/users')).some(u => u.email === `kepala-${stamp}@test.local`), 'user kepala missing');
assert((await req('GET', '/dashboard/stats')).total_siswa >= 1, 'dashboard stats invalid');

console.log(JSON.stringify({ ok: true, tenantId, email, checks: results.length, results }, null, 2));
