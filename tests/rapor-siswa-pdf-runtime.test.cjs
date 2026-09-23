const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { createRaporSiswaPdf, coverLayout } = require('../server/rapor-siswa-pdf-service.cjs')

// Bangun DB in-memory minimal yang meniru skema produksi (kolom yang dipakai
// createRaporSiswaPdf saja) agar test tidak bergantung pada file DB nyata.
function buildTestDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE settings (tenant_id TEXT PRIMARY KEY, nama_lembaga TEXT, alamat TEXT, logo TEXT,
      kepala_sekolah TEXT, npsn TEXT, nsm TEXT, kota_cetak TEXT, jenjang TEXT);
    CREATE TABLE rombel (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT, tingkat TEXT, wali_kelas_id TEXT);
    CREATE TABLE gtk (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT, nip TEXT);
    CREATE TABLE siswa (id TEXT PRIMARY KEY, tenant_id TEXT, nis TEXT, nisn TEXT, nama TEXT,
      jenis_kelamin TEXT, tempat_lahir TEXT, tanggal_lahir TEXT, alamat TEXT, no_hp TEXT, nama_ortu TEXT,
      rombel_id TEXT, foto TEXT, agama TEXT, status_keluarga TEXT, anak_ke INTEGER, asal_sekolah TEXT,
      nama_ayah TEXT, nama_ibu TEXT, kerja_ayah TEXT, kerja_ibu TEXT, nama_wali TEXT, kerja_wali TEXT);
    CREATE TABLE mapel (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT);
    CREATE TABLE rapor (id TEXT PRIMARY KEY, tenant_id TEXT, siswa_id TEXT, mapel_id TEXT, tahun_ajaran TEXT,
      semester TEXT, jenis TEXT, nilai_harian INTEGER, nilai_sts INTEGER, nilai_sas INTEGER,
      nilai_akhir INTEGER, predikat TEXT);
    CREATE TABLE rapor_pelengkap (tenant_id TEXT, siswa_id TEXT, tahun_ajaran TEXT, semester TEXT, jenis TEXT,
      prestasi TEXT, catatan_wali_kelas TEXT, tanggal_pembagian TEXT);
    CREATE TABLE catatan_kepribadian (siswa_id TEXT, tahun_ajaran TEXT, semester TEXT, tenant_id TEXT,
      sikap_spiritual TEXT, sikap_sosial TEXT, sikap_umum TEXT, kelakuan TEXT, kerajinan TEXT, kerapian TEXT, kedisiplinan TEXT,
      catatan_wali_kelas TEXT, saran TEXT, updated_at TEXT);
    CREATE TABLE absensi_siswa (siswa_id TEXT, tenant_id TEXT, tanggal TEXT, status TEXT);
    CREATE TABLE ekskul (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT, jenis_kegiatan TEXT);
    CREATE TABLE ekskul_anggota (siswa_id TEXT, ekskul_id TEXT, tenant_id TEXT);
    CREATE TABLE absensi_ekskul (id TEXT PRIMARY KEY, ekskul_id TEXT, siswa_id TEXT, tenant_id TEXT, tanggal TEXT, status TEXT);
  `)

  db.prepare(`INSERT INTO settings (tenant_id, nama_lembaga, alamat, logo, kepala_sekolah, npsn, nsm, kota_cetak, jenjang)
    VALUES ('t1','MTs Uji Coba','Jl. Contoh No.1','','H. Contoh, S.Pd','12345678','98765','Bondowoso','MTs')`).run()
  db.prepare(`INSERT INTO gtk (id, tenant_id, nama, nip) VALUES ('g1','t1','Bu Wali, S.Pd','1234')`).run()
  db.prepare(`INSERT INTO rombel (id, tenant_id, nama, tingkat, wali_kelas_id) VALUES ('r1','t1','VII-A','7','g1')`).run()
  db.prepare(`INSERT INTO siswa (id, tenant_id, nis, nisn, nama, jenis_kelamin, tempat_lahir, tanggal_lahir,
      alamat, no_hp, nama_ortu, rombel_id, foto, agama, status_keluarga, anak_ke, asal_sekolah,
      nama_ayah, nama_ibu, kerja_ayah, kerja_ibu, nama_wali, kerja_wali)
    VALUES ('s1','t1','1001','0011223344','Siswa Uji','L','Bondowoso','2012-01-01','Jl. Siswa 1','0812345',
      'Bapak Ibu', 'r1', '', 'Islam', 'Anak Kandung', 1, 'SDN 1 Uji',
      'Ayah Uji','Ibu Uji','Wiraswasta','Ibu Rumah Tangga','', '')`).run()
  db.prepare(`INSERT INTO mapel (id, tenant_id, nama) VALUES ('m1','t1','Matematika'), ('m2','t1','IPA')`).run()
  db.prepare(`INSERT INTO rapor (id, tenant_id, siswa_id, mapel_id, tahun_ajaran, semester, jenis, nilai_harian, nilai_sts, nilai_sas, nilai_akhir, predikat)
    VALUES ('rp1','t1','s1','m1','2026/2027','ganjil','rapor_sts',80,85,0,82,'B'),
           ('rp2','t1','s1','m2','2026/2027','ganjil','rapor_sts',75,78,0,76,'B')`).run()
  db.prepare(`INSERT INTO rapor_pelengkap (tenant_id, siswa_id, tahun_ajaran, semester, jenis, prestasi, catatan_wali_kelas, tanggal_pembagian)
    VALUES ('t1','s1','2026/2027','ganjil','rapor_sts','[{"jenis":"Akademik","keterangan":"Juara 1 OSN"}]','Terus semangat belajar','15 Desember 2026')`).run()
  db.prepare(`INSERT INTO catatan_kepribadian (siswa_id, tahun_ajaran, semester, tenant_id, sikap_spiritual, sikap_sosial, kelakuan, kedisiplinan, updated_at)
    VALUES ('s1','2026/2027','ganjil','t1','Baik','Baik','Baik','Baik', datetime('now'))`).run()
  db.prepare(`INSERT INTO absensi_siswa (siswa_id, tenant_id, tanggal, status) VALUES
    ('s1','t1','2026-08-01','hadir'), ('s1','t1','2026-08-02','sakit'), ('s1','t1','2026-08-03','izin')`).run()

  return db
}

test('layout sampul memberi ruang aman untuk logo dan teks panjang', () => {
  const layout = coverLayout({
    pageWidth: 595.28,
    contentWidth: 495.28,
    institutionName: 'Madrasah Tsanawiyah Swasta Plus Sunan Drajat 7',
    address: 'Jl. Raya Rembes-Pakah KM01 RT.01 RW.01 Dusun Gemulung Ds. Gesikharjo',
    logoWidth: 90,
    logoHeight: 88,
  })

  assert.ok(layout.logoBottom + 24 <= layout.titleY, 'judul tidak boleh menabrak logo')
  assert.ok(layout.badgeBottom + 44 <= layout.studentBoxY, 'kotak siswa harus terpisah dari badge')
  assert.ok(layout.studentBoxBottom + 44 <= layout.institutionY, 'nama lembaga harus terpisah dari kotak siswa')
  assert.ok(layout.addressBottom <= 780, 'alamat harus berada di area aman sampul')
  assert.ok(layout.institutionLines <= 2, 'nama lembaga maksimal dua baris')
  assert.ok(layout.addressLines <= 2, 'alamat maksimal dua baris')
})

test('createRaporSiswaPdf menghasilkan dokumen PDF valid untuk siswa dengan data lengkap', async () => {
  const db = buildTestDb()
  const doc = await createRaporSiswaPdf(db, {
    tenantId: 't1', siswaId: 's1', tahunAjaran: '2026/2027', semester: 'ganjil', jenis: 'rapor_sts', uploadDir: '/tmp/nonexistent-uploads',
  })
  assert.ok(doc, 'doc harus dihasilkan untuk siswa yang ada')
  const chunks = []
  doc.on('data', c => chunks.push(c))
  const done = new Promise(resolve => doc.on('end', resolve))
  doc.end()
  await done
  const buf = Buffer.concat(chunks)
  assert.ok(buf.length > 1000, 'PDF harus punya konten substansial (3 halaman)')
  assert.equal(buf.subarray(0, 4).toString(), '%PDF')
  db.close()
})

test('createRaporSiswaPdf mengembalikan status rapor kosong ketika belum digenerate', async () => {
  const db = buildTestDb()
  const doc = await createRaporSiswaPdf(db, {
    tenantId: 't1', siswaId: 's1', tahunAjaran: '2026/2027', semester: 'ganjil', jenis: 'rapor_sas', uploadDir: '/tmp/nonexistent-uploads',
  })
  assert.deepEqual(doc, { error: 'RAPOR_NOT_GENERATED' })
  db.close()
})

test('createRaporSiswaPdf mengembalikan null untuk siswa yang tidak ditemukan (tenant-scoped)', async () => {
  const db = buildTestDb()
  const doc = await createRaporSiswaPdf(db, {
    tenantId: 't1', siswaId: 'siswa-tidak-ada', tahunAjaran: '2026/2027', semester: 'ganjil', jenis: 'rapor_sts', uploadDir: '/tmp/nonexistent-uploads',
  })
  assert.equal(doc, null)
  db.close()
})

test('createRaporSiswaPdf tidak bocor lintas-tenant (siswa ada tapi beda tenant)', async () => {
  const db = buildTestDb()
  const doc = await createRaporSiswaPdf(db, {
    tenantId: 't2-lain', siswaId: 's1', tahunAjaran: '2026/2027', semester: 'ganjil', jenis: 'rapor_sts', uploadDir: '/tmp/nonexistent-uploads',
  })
  assert.equal(doc, null)
  db.close()
})
