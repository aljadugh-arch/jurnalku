const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { createRaporSiswaPdf, coverLayout, faseFromTingkat, buildCapaianKompetensi } = require('../server/rapor-siswa-pdf-service.cjs')
const { createRaporMtsplusPdf, createRaporMtsplusPdfBulk } = require('../server/rapor-mtsplus-pdf-service.cjs')

// Bangun DB in-memory minimal yang meniru skema produksi (kolom yang dipakai
// createRaporSiswaPdf saja) agar test tidak bergantung pada file DB nyata.
function buildTestDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE settings (tenant_id TEXT PRIMARY KEY, nama_lembaga TEXT, alamat TEXT, logo TEXT, logo_kemenag TEXT,
      kepala_sekolah TEXT, npsn TEXT, nsm TEXT, kota_cetak TEXT, jenjang TEXT, yayasan_nama TEXT);
    CREATE TABLE rombel (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT, tingkat TEXT, wali_kelas_id TEXT);
    CREATE TABLE gtk (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT, nip TEXT);
    CREATE TABLE siswa (id TEXT PRIMARY KEY, tenant_id TEXT, nis TEXT, nisn TEXT, nama TEXT,
      jenis_kelamin TEXT, tempat_lahir TEXT, tanggal_lahir TEXT, alamat TEXT, no_hp TEXT, nama_ortu TEXT,
      rombel_id TEXT, foto TEXT, agama TEXT, status_keluarga TEXT, anak_ke INTEGER, asal_sekolah TEXT,
      nama_ayah TEXT, nama_ibu TEXT, kerja_ayah TEXT, kerja_ibu TEXT, nama_wali TEXT, kerja_wali TEXT, status TEXT DEFAULT 'aktif');
    CREATE TABLE mapel (id TEXT PRIMARY KEY, tenant_id TEXT, kode TEXT, nama TEXT, kelompok TEXT DEFAULT 'wajib');
    CREATE TABLE rapor (id TEXT PRIMARY KEY, tenant_id TEXT, siswa_id TEXT, mapel_id TEXT, tahun_ajaran TEXT,
      semester TEXT, jenis TEXT, nilai_harian INTEGER, nilai_sts INTEGER, nilai_sas INTEGER,
      nilai_akhir INTEGER, predikat TEXT);
    CREATE TABLE rapor_pelengkap (tenant_id TEXT, siswa_id TEXT, tahun_ajaran TEXT, semester TEXT, jenis TEXT,
      prestasi TEXT, catatan_wali_kelas TEXT, tanggapan_orang_tua TEXT, keputusan TEXT, tanggal_pembagian TEXT);
    CREATE TABLE catatan_kepribadian (siswa_id TEXT, tahun_ajaran TEXT, semester TEXT, tenant_id TEXT,
      sikap_spiritual TEXT, sikap_sosial TEXT, sikap_umum TEXT, kelakuan TEXT, kerajinan TEXT, kerapian TEXT, kedisiplinan TEXT,
      catatan_wali_kelas TEXT, saran TEXT, updated_at TEXT);
    CREATE TABLE absensi_siswa (siswa_id TEXT, tenant_id TEXT, tanggal TEXT, status TEXT);
    CREATE TABLE ekskul (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT, jenis_kegiatan TEXT);
    CREATE TABLE ekskul_anggota (siswa_id TEXT, ekskul_id TEXT, tenant_id TEXT);
    CREATE TABLE absensi_ekskul (id TEXT PRIMARY KEY, ekskul_id TEXT, siswa_id TEXT, tenant_id TEXT, tanggal TEXT, status TEXT);
    CREATE TABLE kegiatan_khusus (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT, deskripsi TEXT, jenis TEXT, tanggal TEXT);
    CREATE TABLE absensi_kegiatan (id TEXT PRIMARY KEY, kegiatan_id TEXT, siswa_id TEXT, tenant_id TEXT, tanggal TEXT, status TEXT);
    CREATE TABLE jurnal_mengajar (id TEXT PRIMARY KEY, tenant_id TEXT, rombel_id TEXT, mapel_id TEXT, materi TEXT, tanggal TEXT);
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

test('layout sampul memberi ruang aman untuk semua elemen', () => {
  const layout = coverLayout({
    pageWidth: 595.28,
    contentWidth: 495.28,
    tahunAjaran: '2026/2027',
  })

  assert.ok(layout.kemenagLogoY >= 30, 'logo kemenag di atas')
  assert.ok(layout.raporTitleY > layout.kemenagLogoY + 40, 'judul rapor terpisah dari logo kemenag')
  assert.ok(layout.lembagaLogoY > layout.namaLembagaY + 20, 'logo lembaga terpisah dari nama')
  assert.ok(layout.siswaBoxY > layout.lembagaLogoY + 80, 'kotak siswa terpisah dari logo lembaga')
  assert.ok(layout.kemenagFooterY > layout.siswaBoxY + 100, 'footer terpisah dari kotak siswa')
  assert.equal(layout.tahun, '2026', 'tahun ajaran diekstrak dengan benar')
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

test('faseFromTingkat memetakan fase Kurikulum Merdeka per jenjang', () => {
  // MI: I-II=A, III-IV=B, V-VI=C
  assert.equal(faseFromTingkat('1', 'MI'), 'A')
  assert.equal(faseFromTingkat('2', 'MI'), 'A')
  assert.equal(faseFromTingkat('3', 'MI'), 'B')
  assert.equal(faseFromTingkat('5', 'MI'), 'C')
  // MTs: VII-IX=D
  assert.equal(faseFromTingkat('7', 'MTs'), 'D')
  assert.equal(faseFromTingkat('9', 'MTs'), 'D')
  // MA: X=E, XI-XII=F
  assert.equal(faseFromTingkat('10', 'MA'), 'E')
  assert.equal(faseFromTingkat('11', 'MA'), 'F')
  assert.equal(faseFromTingkat('12', 'MA'), 'F')
  // tingkat kosong tidak menebak fase
  assert.equal(faseFromTingkat('', 'MA'), '')
})

test('buildCapaianKompetensi memakai materi terakhir dan menaikkan kualitas sesuai nilai', () => {
  const tinggi = buildCapaianKompetensi({ nilai: 95, mapel: 'Matematika', materi: 'SPLDV' })
  assert.match(tinggi, /sangat baik/)
  assert.match(tinggi, /SPLDV/)

  const sedang = buildCapaianKompetensi({ nilai: 86, mapel: 'IPA', materi: '' })
  assert.match(sedang, /baik/)
  // tanpa materi, jatuh ke nama mapel
  assert.match(sedang, /IPA/)

  const rendah = buildCapaianKompetensi({ nilai: 60, mapel: 'IPS', materi: '' })
  assert.match(rendah, /perlu bimbingan/)
})

test('rapor dengan kelompok mapel berbeda tetap menghasilkan PDF (baris kelompok)', async () => {
  const db = buildTestDb()
  db.prepare(`UPDATE mapel SET kelompok='mulok' WHERE id='m2'`).run()
  const doc = await createRaporSiswaPdf(db, {
    tenantId: 't1', siswaId: 's1', tahunAjaran: '2026/2027', semester: 'ganjil', jenis: 'rapor_sts', uploadDir: '/tmp/nonexistent-uploads',
  })
  assert.ok(doc, 'doc harus tetap dihasilkan untuk campuran kelompok mapel')
  const chunks = []
  doc.on('data', c => chunks.push(c))
  const done = new Promise(resolve => doc.on('end', resolve))
  doc.end()
  await done
  assert.equal(Buffer.concat(chunks).subarray(0, 4).toString(), '%PDF')
  db.close()
})

test('createRaporMtsplusPdf menghasilkan 3 bagian (cover/identitas/nilai) untuk lengkap', async () => {
  const db = buildTestDb()
  const halaman = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
  const lengkap = await createRaporMtsplusPdf(db, {
    tenantId: 't1', siswaId: 's1', tahunAjaran: '2026/2027', semester: 'ganjil', jenis: 'rapor_sts', uploadDir: '/tmp/nonexistent-uploads',
  })
  assert.ok(lengkap, 'doc harus dihasilkan')
  const chunks = []
  lengkap.on('data', c => chunks.push(c))
  const done = new Promise(resolve => lengkap.on('end', resolve))
  lengkap.end()
  await done
  const buf = Buffer.concat(chunks)
  assert.equal(buf.subarray(0, 4).toString(), '%PDF')
  assert.equal(halaman(buf), 3, 'lengkap harus 3 halaman (cover, identitas, nilai)')

  const cover = await createRaporMtsplusPdf(db, {
    tenantId: 't1', siswaId: 's1', tahunAjaran: '2026/2027', semester: 'ganjil', jenis: 'rapor_sts', uploadDir: '/tmp/nonexistent-uploads', bagian: 'cover',
  })
  const c2 = []
  cover.on('data', c => c2.push(c))
  const d2 = new Promise(resolve => cover.on('end', resolve))
  cover.end()
  await d2
  assert.equal(halaman(Buffer.concat(c2)), 1, 'bagian cover harus 1 halaman')

  const kosong = await createRaporMtsplusPdf(db, {
    tenantId: 't1', siswaId: 'tidak-ada', tahunAjaran: '2026/2027', semester: 'ganjil', jenis: 'rapor_sts', uploadDir: '/tmp/nonexistent-uploads',
  })
  assert.equal(kosong, null, 'siswa tidak ditemukan -> null')
  db.close()
})

test('createRaporMtsplusPdfBulk menggabungkan banyak siswa jadi satu PDF', async () => {
  const db = buildTestDb()
  // Tambah siswa ke-2 (rombel sama) + nilai rapor agar ikut tercetak.
  db.prepare(`INSERT INTO siswa (id, tenant_id, nis, nisn, nama, jenis_kelamin, rombel_id, status)
    VALUES ('s2','t1','1002','0022','Siswa Dua','P','r1','aktif')`).run()
  db.prepare(`INSERT INTO rapor (id, tenant_id, siswa_id, mapel_id, tahun_ajaran, semester, jenis, nilai_akhir, predikat)
    VALUES ('rp3','t1','s2','m1','2026/2027','ganjil','rapor_sts',88,'A'),
           ('rp4','t1','s2','m2','2026/2027','ganjil','rapor_sts',90,'A')`).run()

  const doc = await createRaporMtsplusPdfBulk(db, {
    tenantId: 't1', rombelId: 'r1', tahunAjaran: '2026/2027', semester: 'ganjil', jenis: 'rapor_sts', uploadDir: '/tmp/nonexistent-uploads',
  })
  assert.ok(doc, 'bulk harus menghasilkan doc untuk rombel dengan siswa')
  assert.equal(doc.meta.dicetak, 2, '2 siswa tercetak')
  assert.equal(doc.meta.total, 2, 'total 2 siswa aktif')

  const chunks = []
  doc.on('data', c => chunks.push(c))
  const done = new Promise(resolve => doc.on('end', resolve))
  doc.end()
  await done
  const buf = Buffer.concat(chunks)
  assert.equal(buf.subarray(0, 4).toString(), '%PDF')
  const halaman = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
  assert.equal(halaman(buf), 6, '2 siswa x 3 halaman (lengkap) = 6 halaman')
  db.close()
})
