// Comprehensive E2E: ALL endpoints, ALL modules, ALL features
const BASE = process.env.E2E_BASE || 'https://staging.jurnal.cc.cd/api';
const stamp = Date.now().toString(36);
const email = `e2e-${stamp}@test.local`;
const password = 'Password123!';
const results = [];
let token = '';
let tenantId = '';
let pass = 0, fail = 0;

async function req(method, path, body, expected = 200) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  const ok = res.status === expected;
  if (ok) pass++; else fail++;
  results.push({ method, path: path.split('?')[0], expected, got: res.status, ok });
  if (!ok) console.error(`FAIL: ${method} ${path} expected=${expected} got=${res.status} body=${text.slice(0,200)}`);
  return data;
}
function assert(cond, msg) { if (!cond) { fail++; results.push({ ok: false, assert: msg }); console.error('ASSERT:', msg); } else { pass++; } }
function decodeJwt(t) { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()); }

try {
  // ===================== AUTH =====================
  const reg = await req('POST', '/auth/register', {
    nama_lembaga: `E2E Sekolah ${stamp}`, nama: `Admin E2E`, email, password,
    no_hp: '081234567890', domain_type: 'subdomain', slug: `e2e-${stamp}`
  });
  token = reg.token;
  tenantId = decodeJwt(token).tenant_id;
  assert(tenantId, 'tenant_id in JWT');

  // Login
  await req('POST', '/auth/login', { email, password });

  // Change password
  const newPass = 'NewPass456!';
  await req('PUT', '/auth/change-password', { current_password: password, new_password: newPass });
  await req('POST', '/auth/login', { email, password: newPass });
  // change back
  await req('PUT', '/auth/change-password', { current_password: newPass, new_password: password });

  // ===================== SETTINGS =====================
  await req('PUT', '/settings', {
    nama_lembaga: `E2E Sekolah ${stamp}`, alamat: 'Jl Test No 1', telepon: '021-1234',
    email, theme: 'light', primary_color: '#1e40af', accent_color: '#059669',
    sidebar_color: '#1e293b', geo_latitude: '-6.2', geo_longitude: '106.8', geo_radius: 200, jenjang: 'MI'
  });
  const settings = await req('GET', '/settings');
  assert(settings.nama_lembaga === `E2E Sekolah ${stamp}`, 'settings saved');
  assert(settings.jenjang === 'MI', 'jenjang MI saved');

  // ===================== GTK =====================
  const guru1 = await req('POST', '/gtk', { nip: `G${stamp}1`, nama: 'Guru Matematika', jenis_kelamin: 'L', tempat_lahir: 'Jkt', tanggal_lahir: '1990-01-01', alamat: 'Jl Guru', no_hp: '0811', email: `g1-${stamp}@t.com`, jabatan: 'guru', status_kepegawaian: 'tetap', bidang_studi: 'Matematika' });
  const guru2 = await req('POST', '/gtk', { nip: `G${stamp}2`, nama: 'Guru IPA', jenis_kelamin: 'P', tempat_lahir: 'Bdg', tanggal_lahir: '1991-02-02', alamat: 'Jl IPA', no_hp: '0812', email: `g2-${stamp}@t.com`, jabatan: 'guru', status_kepegawaian: 'tetap', bidang_studi: 'IPA' });
  const wali = await req('POST', '/gtk', { nip: `G${stamp}3`, nama: 'Wali Kelas', jenis_kelamin: 'L', tempat_lahir: 'Sby', tanggal_lahir: '1992-03-03', alamat: 'Jl Wali', no_hp: '0813', email: `g3-${stamp}@t.com`, jabatan: 'wali_kelas', status_kepegawaian: 'tetap', bidang_studi: 'Umum' });
  const gtkList = await req('GET', '/gtk');
  assert(gtkList.length >= 3, 'gtk 3 created');

  // GTK search
  await req('GET', '/gtk?search=Guru+Matematika');
  await req('GET', '/gtk?search=Matematika');
  await req('GET', '/gtk?search=xoxo');

  // ===================== MAPEL =====================
  const mapel1 = await req('POST', '/mapel', { kode: `MTK${stamp}`, nama: 'Matematika', kelompok: 'A', jam_per_minggu: 4 });
  const mapel2 = await req('POST', '/mapel', { kode: `IPA${stamp}`, nama: 'IPA', kelompok: 'A', jam_per_minggu: 3 });
  await req('GET', '/mapel');

  // ===================== ROMBEL =====================
  const rombel1 = await req('POST', '/rombel', { nama: 'I-A', tingkat: 'I', tahun_ajaran: '2026/2027', wali_kelas_id: wali.id, kapasitas: 32 });
  const rombel2 = await req('POST', '/rombel', { nama: 'I-B', tingkat: 'I', tahun_ajaran: '2026/2027', wali_kelas_id: wali.id, kapasitas: 30 });
  const rombels = await req('GET', '/rombel');
  assert(rombels.length >= 2, 'rombel 2 created');
  assert(rombels[0].tingkat === 'I' || rombels[1].tingkat === 'I', 'tingkat stored as Roman');

  // ===================== SISWA =====================
  const siswa1 = await req('POST', '/siswa', { nis: `S${stamp}1`, nisn: `SN${stamp}1`, nama: 'Ahmad Fauzi', jenis_kelamin: 'L', tempat_lahir: 'Jkt', tanggal_lahir: '2018-05-01', alamat: 'Jl Siswa 1', no_hp: '0821', nama_ortu: 'Bapak Ahmad', rombel_id: rombel1.id });
  const siswa2 = await req('POST', '/siswa', { nis: `S${stamp}2`, nisn: `SN${stamp}2`, nama: 'Siti Aminah', jenis_kelamin: 'P', tempat_lahir: 'Bdg', tanggal_lahir: '2018-06-15', alamat: 'Jl Siswa 2', no_hp: '0822', nama_ortu: 'Ibu Siti', rombel_id: rombel1.id });
  const siswa3 = await req('POST', '/siswa', { nis: `S${stamp}3`, nisn: `SN${stamp}3`, nama: 'Budi Santoso', jenis_kelamin: 'L', tempat_lahir: 'Sby', tanggal_lahir: '2018-07-20', alamat: 'Jl Siswa 3', no_hp: '0823', nama_ortu: 'Pak Budi', rombel_id: rombel2.id });
  const siswaList = await req('GET', `/siswa?rombel_id=${rombel1.id}`);
  assert(siswaList.length >= 2, 'siswa 2 in rombel1');

  // ===================== PENGAJAR =====================
  const pengajar1 = await req('POST', '/pengajar', { gtk_id: guru1.id, mapel_id: mapel1.id, rombel_id: rombel1.id, tahun_ajaran: '2026/2027' });
  const pengajar2 = await req('POST', '/pengajar', { gtk_id: guru2.id, mapel_id: mapel2.id, rombel_id: rombel1.id, tahun_ajaran: '2026/2027' });
  await req('GET', '/pengajar');

  // ===================== JADWAL =====================
  const jadwal1 = await req('POST', '/jadwal', { mapel_id: mapel1.id, rombel_id: rombel1.id, gtk_id: guru1.id, hari: 'senin', jam_mulai: '07:00', jam_selesai: '07:45', ruangan: 'R1' });
  const jadwal2 = await req('POST', '/jadwal', { mapel_id: mapel2.id, rombel_id: rombel1.id, gtk_id: guru2.id, hari: 'selasa', jam_mulai: '07:00', jam_selesai: '07:45', ruangan: 'R2' });
  // Conflict: same rombel, same time
  await req('POST', '/jadwal', { mapel_id: mapel1.id, rombel_id: rombel1.id, gtk_id: guru1.id, hari: 'senin', jam_mulai: '07:15', jam_selesai: '08:00', ruangan: 'R1' }, 409);
  // Conflict: same guru, same time different rombel
  await req('POST', '/jadwal', { mapel_id: mapel1.id, rombel_id: rombel2.id, gtk_id: guru1.id, hari: 'senin', jam_mulai: '07:15', jam_selesai: '08:00', ruangan: 'R2' }, 409);
  // Conflict: same room, same time
  await req('POST', '/jadwal', { mapel_id: mapel2.id, rombel_id: rombel2.id, gtk_id: guru2.id, hari: 'senin', jam_mulai: '07:15', jam_selesai: '08:00', ruangan: 'R1' }, 409);
  const konflik = await req('GET', '/jadwal/konflik');
  assert(konflik.length === 0, 'no konflik after blocked inserts');
  await req('GET', '/jadwal?rombel_id=' + rombel1.id);

  // ===================== ABSENSI SISWA =====================
  await req('POST', '/absensi-siswa/bulk', { tanggal: '2026-07-08', rombel_id: rombel1.id, data: [
    { siswa_id: siswa1.id, status: 'hadir', waktu_absen: '07:00', metode: 'manual', keterangan: '' },
    { siswa_id: siswa2.id, status: 'sakit', waktu_absen: '', metode: 'manual', keterangan: 'Demam' }
  ]});
  const absensi = await req('GET', `/absensi-siswa?tanggal=2026-07-08&rombel_id=${rombel1.id}`);
  assert(absensi.length === 2, 'absensi siswa 2 records');

  // ===================== ABSENSI GURU =====================
  await req('POST', '/absensi-guru', { gtk_id: guru1.id, tanggal: '2026-07-08', status: 'hadir', waktu_masuk: '07:00', waktu_pulang: '14:00', keterangan: '' });
  await req('POST', '/absensi-guru', { gtk_id: guru2.id, tanggal: '2026-07-08', status: 'izin', waktu_masuk: '', waktu_pulang: '', keterangan: 'Acara keluarga' });
  await req('GET', '/absensi-guru?tanggal=2026-07-08');

  // ===================== EKSKUL =====================
  const ekskul1 = await req('POST', '/ekskul', { nama: 'Pramuka', pembina_id: guru1.id, hari: 'Rabu', jam_mulai: '15:00', jam_selesai: '16:00', deskripsi: 'Kegiatan pramuka' });
  const ekskul2 = await req('POST', '/ekskul', { nama: 'Futsal', pembina_id: guru2.id, hari: 'Kamis', jam_mulai: '15:00', jam_selesai: '16:00', deskripsi: 'Olahraga futsal' });
  await req('GET', '/ekskul');
  await req('POST', `/ekskul/${ekskul1.id}/anggota`, { siswa_ids: [siswa1.id, siswa2.id] });
  await req('GET', `/ekskul/${ekskul1.id}/anggota`);
  await req('POST', '/absensi-ekskul/bulk', { tanggal: '2026-07-08', ekskul_id: ekskul1.id, data: [
    { siswa_id: siswa1.id, status: 'hadir', keterangan: '' },
    { siswa_id: siswa2.id, status: 'hadir', keterangan: '' }
  ]});
  await req('GET', `/absensi-ekskul?tanggal=2026-07-08&ekskul_id=${ekskul1.id}`);

  // ===================== KEIATAN KHUSUS =====================
  const keg1 = await req('POST', '/kegiatan-khusus', { nama: 'Upacara HUT RI', jenis: 'insidental', tanggal: '2026-08-17', deskripsi: 'Upacara kemerdekaan' });
  await req('GET', '/kegiatan-khusus');
  await req('GET', '/kegiatan-khusus?jenis=insidental');

  // ===================== TABUNGAN =====================
  await req('POST', '/tabungan', { siswa_id: siswa1.id, tipe: 'setor', nominal: 50000, keterangan: 'Setor awal' });
  await req('POST', '/tabungan', { siswa_id: siswa1.id, tipe: 'tarik', nominal: 10000, keterangan: 'Tarik' });
  const tabungan = await req('GET', `/tabungan?siswa_id=${siswa1.id}`);
  assert(tabungan.length === 2, 'tabungan 2 transaksi');

  // ===================== JENIS TAGIHAN =====================
  const jenisTagihan = await req('POST', '/jenis-tagihan', { nama: 'SPP Juli', nominal: 100000, deskripsi: 'SPP bulanan', tipe: 'bulanan' });
  await req('GET', '/jenis-tagihan');

  // ===================== TAGIHAN =====================
  await req('POST', '/tagihan/generate', { jenis_nama: 'SPP Juli', nominal: 100000, rombel_id: rombel1.id, bulan: 7, tahun: 2026 });
  const tagihanList = await req('GET', `/tagihan?siswa_id=${siswa1.id}`);
  assert(tagihanList.length >= 1, 'tagihan generated');
  await req('PUT', `/tagihan/${tagihanList[0].id}/bayar`, { metode_bayar: 'tunai', keterangan: 'Bayar langsung' });
  await req('GET', `/tagihan?siswa_id=${siswa1.id}&status=lunas`);

  // ===================== USERS =====================
  const userKepala = await req('POST', '/users', { nama: 'Kepala E2E', email: `kepala-${stamp}@t.com`, password: 'Password123!', role: 'kepala' });
  const userGuru = await req('POST', '/users', { nama: 'Guru User', email: `guru-user-${stamp}@t.com`, password: 'Password123!', role: 'guru', gtk_id: guru1.id });
  const users = await req('GET', '/users');
  assert(users.length >= 3, 'users 3 (admin+kepala+guru)');

  // ===================== NOTIF SETTINGS =====================
  await req('GET', '/notif-settings');

  // ===================== WA GATEWAY =====================
  await req('GET', '/wa-gateway/config');

  // ===================== TAHUN AJARAN =====================
  const ta = await req('POST', '/tahun-ajaran', { nama: '2026/2027', semester: 'Ganjil', aktif: true });
  await req('GET', '/tahun-ajaran');

  // ===================== KALENDER KBM =====================
  await req('POST', '/kalender-kbm', { tanggal: '2026-07-08', judul: 'Hari Pertama', keterangan: 'Masuk sekolah', jenis: 'libur' });
  await req('GET', '/kalender-kbm?bulan=2026-07');

  // ===================== MODUL AJAR =====================
  await req('POST', '/modul-ajar', { mapel: 'Matematika', kelas: 'I', fase: 'A', materi_pokok: 'Penjumlahan', tujuan_pembelajaran: 'Siswa mampu menjumlah', alokasi_waktu: '2x35', model_pembelajaran: ['Problem Based Learning'], target_peserta: ['Semua siswa'], dimensi_profil_pelajar: ['Bernalar Kritis'] });
  await req('GET', '/modul-ajar');

  // ===================== BROADCAST =====================
  await req('GET', '/broadcast');

  // ===================== REKAP ABSENSI =====================
  await req('GET', '/rekap-absensi?bulan=2026-07&tipe=siswa');
  await req('GET', '/rekap-absensi?bulan=2026-07&tipe=gtk');

  // ===================== DASHBOARD =====================
  const stats = await req('GET', '/dashboard/stats');
  assert(stats.total_siswa >= 3, 'dashboard stats total_siswa >= 3');

  // ===================== SUPERVISI =====================
  await req('GET', '/supervisi/rekap');

  // ===================== DELETE (reverse order, respect FKs) =====================
  await req('DELETE', `/pengajar/${pengajar1.id}`);
  await req('DELETE', `/pengajar/${pengajar2.id}`);
  await req('DELETE', `/jadwal/${jadwal1.id}`);
  await req('DELETE', `/ekskul/${ekskul2.id}`);
  await req('DELETE', `/siswa/${siswa3.id}`);
  // FK-constrained: mapel still referenced by jadwal2, gtk by ekskul1 — expect 400
  await req('DELETE', `/mapel/${mapel2.id}`, undefined, 400);
  await req('DELETE', `/gtk/${guru2.id}`, undefined, 400);
  await req('DELETE', `/users/${userGuru.id}`);

  // ===================== PUBLIC ENDPOINTS =====================
  const publicRes = await fetch('https://jurnal.cc.cd/templates/template-siswa.xls');
  assert(publicRes.status === 200, 'template siswa download 200');

  // ===================== SUMMARY =====================
  console.log(JSON.stringify({ ok: fail === 0, pass, fail, tenantId, email, checks: results.length }, null, 2));

} catch (err) {
  console.error('FATAL:', err.message);
  console.log(JSON.stringify({ ok: false, pass, fail, error: err.message }, null, 2));
  process.exit(1);
}
