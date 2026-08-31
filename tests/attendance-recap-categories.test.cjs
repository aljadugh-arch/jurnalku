const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { getCategoryRecap } = require('../server/attendance-recap.cjs')

function fixture() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE siswa (id TEXT, tenant_id TEXT, nama TEXT, nis TEXT, nisn TEXT, rombel_id TEXT, status TEXT);
    CREATE TABLE rombel (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE absensi_mapel (id TEXT, tenant_id TEXT, siswa_id TEXT, tanggal TEXT, status TEXT, mapel_id TEXT, jadwal_id TEXT);
    CREATE TABLE mapel (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE absensi_ekskul (id TEXT, tenant_id TEXT, siswa_id TEXT, tanggal TEXT, status TEXT, ekskul_id TEXT);
    CREATE TABLE ekskul (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE tahfidz_absensi (tenant_id TEXT, pertemuan_id TEXT, siswa_id TEXT, status TEXT);
    CREATE TABLE tahfidz_pertemuan (id TEXT, tenant_id TEXT, kelompok_id TEXT, tanggal TEXT);
    CREATE TABLE tahfidz_kelompok (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE absensi_kegiatan (id TEXT, tenant_id TEXT, siswa_id TEXT, kegiatan_id TEXT, tanggal TEXT, status TEXT);
    CREATE TABLE jamaah_sesi (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE kegiatan_khusus (id TEXT, tenant_id TEXT, nama TEXT, jenis TEXT);
  `)
  db.exec(`
    INSERT INTO rombel VALUES ('r1','t1','VII-A'),('r2','t2','VII-B');
    INSERT INTO siswa VALUES ('s1','t1','Ali','001','N001','r1','aktif'),('s2','t1','Budi','002','N002','r1','aktif'),('sx','t2','Tenant B','003','N003','r2','aktif');
    INSERT INTO mapel VALUES ('m1','t1','Matematika');
    INSERT INTO absensi_mapel VALUES ('am1','t1','s1','2026-09-01','izin','m1','j1'),('am2','t1','s1','2026-09-02','hadir','m1','j1'),('am3','t2','sx','2026-09-01','hadir','m1','j1');
    INSERT INTO ekskul VALUES ('e1','t1','Pramuka');
    INSERT INTO absensi_ekskul VALUES ('ae1','t1','s1','2026-09-01','sakit','e1');
    INSERT INTO tahfidz_kelompok VALUES ('tk1','t1','Tahfidz');
    INSERT INTO tahfidz_pertemuan VALUES ('tp1','t1','tk1','2026-09-02');
    INSERT INTO tahfidz_absensi VALUES ('t1','tp1','s1','hadir');
    INSERT INTO jamaah_sesi VALUES ('j1','t1','Dzuhur');
    INSERT INTO kegiatan_khusus VALUES ('k1','t1','Proyek P5','kokurikuler'),('k2','t1','Upacara','insidental');
    INSERT INTO absensi_kegiatan VALUES ('aj1','t1','s1','j1','2026-09-01','hadir'),('ak1','t1','s1','k1','2026-09-01','alpa'),('al1','t1','s1','k2','2026-09-02','HADIR');
  `)
  return db
}

test('category recap aggregates each category, joins labels, and isolates tenant', () => {
  const db = fixture()
  const expected = {
    mapel: { total: 2, hadir: 1, sakit: 0, izin: 1, alpha: 0, lain: 0 },
    ekskul: { total: 2, hadir: 1, sakit: 1, izin: 0, alpha: 0, lain: 0 },
    jamaah: { total: 1, hadir: 1, sakit: 0, izin: 0, alpha: 0, lain: 0 },
    kokurikuler: { total: 1, hadir: 0, sakit: 0, izin: 0, alpha: 1, lain: 0 },
    kegiatan_lain: { total: 1, hadir: 1, sakit: 0, izin: 0, alpha: 0, lain: 0 },
  }
  for (const [category, counts] of Object.entries(expected)) {
    const result = getCategoryRecap(db, 't1', category, '2026-09-01', '2026-09-30')
    assert.deepEqual(result.summary, counts, category)
    assert.equal(result.detail.length >= 1, true, category)
    assert.equal(result.detail.filter(row => row.id === 's1').reduce((sum, row) => sum + row.total, 0), counts.total, category)
    assert.equal(result.detail.some(row => row.nama === 'Tenant B'), false, category)
  }
  assert.equal(getCategoryRecap(db, 't1', 'mapel', '2026-09-01', '2026-09-30').detail[0].kegiatan_nama, 'Matematika')
  assert.equal(getCategoryRecap(db, 't1', 'ekskul', '2026-09-01', '2026-09-30').detail[0].kegiatan_nama, 'Pramuka')
  db.close()
})

test('category recap rejects unknown category', () => {
  const db = fixture()
  assert.throws(() => getCategoryRecap(db, 't1', 'unknown', '2026-09-01', '2026-09-30'), /Kategori absensi tidak valid/)
  db.close()
})
