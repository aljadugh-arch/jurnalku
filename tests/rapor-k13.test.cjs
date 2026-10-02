'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { terbilang, nilaiKeAbjad, hitungPeringkat, getK13RaporData, getPeringkatK13, getK13Ledger, predikatK13, normalizeK13Nilai, semesterRange } = require('../server/rapor-k13-service.cjs')
const { createRaporK13Pdf, createK13LedgerPdf } = require('../server/rapor-k13-pdf-service.cjs')

test('terbilang: angka 0-999 -> huruf Indonesia', () => {
  assert.equal(terbilang(0), 'Nol')
  assert.equal(terbilang(75), 'Tujuh puluh lima')
  assert.equal(terbilang(100), 'Seratus')
  assert.equal(terbilang(215), 'Dua ratus lima belas')
  assert.equal(terbilang(999), 'Sembilan ratus sembilan puluh sembilan')
})

test('nilaiKeAbjad & predikatK13 memetakan angka ke huruf A-E', () => {
  assert.equal(nilaiKeAbjad('A'), 'A')
  assert.equal(nilaiKeAbjad(88), 'B')
  assert.equal(predikatK13(95), 'A')
  assert.equal(predikatK13(72), 'C')
})

test('normalizeK13Nilai clamp + predikat otomatis', () => {
  assert.deepEqual(normalizeK13Nilai({ nilai: 150, kkm: 999 }), { nilai: 100, kkm: 100, predikat: 'A', deskripsi: '' })
  assert.deepEqual(normalizeK13Nilai({ nilai: 80 }), { nilai: 80, kkm: 75, predikat: 'B', deskripsi: '' })
})

test('hitungPeringkat: nilai sama -> peringkat sama', () => {
  const rows = [
    { id: 'a', rombel_id: 'r1', rata2: 90 },
    { id: 'b', rombel_id: 'r1', rata2: 90 },
    { id: 'c', rombel_id: 'r1', rata2: 80 },
  ]
  const { rankBy, total } = hitungPeringkat(rows, 'r1')
  assert.equal(total, 3)
  assert.equal(rankBy.get('a'), 1)
  assert.equal(rankBy.get('b'), 1)
  assert.equal(rankBy.get('c'), 3)
})

test('semesterRange memetakan tahun_ajaran + semester ke rentang tanggal', () => {
  assert.deepEqual(semesterRange('ganjil', '2025/2026'), { from: '2025-07-01', to: '2025-12-31' })
  assert.deepEqual(semesterRange('genap', '2025/2026'), { from: '2026-01-01', to: '2026-06-30' })
})

function fixture() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE siswa (id TEXT, tenant_id TEXT, nama TEXT, nis TEXT, nisn TEXT, jenis_kelamin TEXT, tempat_lahir TEXT, tanggal_lahir TEXT, alamat TEXT, no_hp TEXT, nama_ortu TEXT, rombel_id TEXT, status TEXT, agama TEXT, nama_ayah TEXT, nama_ibu TEXT, kerja_ayah TEXT, kerja_ibu TEXT, nama_wali TEXT, kerja_wali TEXT, asal_sekolah TEXT, status_keluarga TEXT, anak_ke INTEGER);
    CREATE TABLE rombel (id TEXT, nama TEXT, tingkat TEXT, wali_kelas_id TEXT, tenant_id TEXT);
    CREATE TABLE gtk (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE mapel (id TEXT, nama TEXT, kelompok TEXT);
    CREATE TABLE rapor_k13 (id TEXT, siswa_id TEXT, mapel_id TEXT, tahun_ajaran TEXT, semester TEXT, nilai INTEGER, predikat TEXT, kkm INTEGER, deskripsi TEXT, tenant_id TEXT);
    CREATE TABLE sikap_k13 (id TEXT, siswa_id TEXT, tahun_ajaran TEXT, semester TEXT, kelakuan TEXT, kerajinan TEXT, kerapian TEXT, kebersihan TEXT, kedisiplinan TEXT, ketaatan TEXT, catatan TEXT, ekstrakurikuler TEXT, tenant_id TEXT);
    CREATE TABLE absensi_siswa (id TEXT, siswa_id TEXT, tanggal TEXT, status TEXT, tenant_id TEXT);
  `)
  db.exec(`
    INSERT INTO siswa VALUES ('s1','t1','Ani','1','001','P','Tuban','2011-01-01','Jl','081','Ayah','r1','aktif','Islam','Bpk A','Ibu A','Petani','Guru','Wali A','Tani','MI A','Anak Kandung',1);
    INSERT INTO rombel VALUES ('r1','VII-A','7','g1','t1');
    INSERT INTO gtk VALUES ('g1','t1','Guru Satu');
    INSERT INTO mapel VALUES ('m1','Matematika','wajib'),('m2','Fikih','pai');
    INSERT INTO rapor_k13 VALUES ('rk1','s1','m1','2025/2026','ganjil',80,'B',75,'','t1'),('rk2','s1','m2','2025/2026','ganjil',90,'A',75,'','t1');
    INSERT INTO sikap_k13 VALUES ('sk1','s1','2025/2026','ganjil','A','B','A','B','A','A','Rajin','Pramuka:A','t1');
    INSERT INTO absensi_siswa VALUES ('a1','s1','2025-08-01','sakit','t1'),('a2','s1','2025-08-02','izin','t1'),('a3','s1','2025-08-03','alpa','t1'),('a4','s1','2025-06-01','alpa','t1');
  `)
  return db
}

test('getK13RaporData membaca biodata, nilai, sikap, dan ketidakhadiran per semester', () => {
  const db = fixture()
  const d = getK13RaporData(db, 't1', { siswaId: 's1', semester: 'ganjil', tahunAjaran: '2025/2026' })
  assert.equal(d.siswa.nama, 'Ani')
  assert.equal(d.mapel.length, 2)
  assert.equal(d.mapel.find(m => m.id === 'm1').nilai, 80)
  assert.equal(d.sikap.kelakuan, 'A')
  // Ketidakhadiran hanya semester ganjil (Jul-Des): alpa 2025-06-01 tidak terhitung.
  assert.deepEqual(d.ketidakhadiran, { sakit: 1, izin: 1, alpa: 1 })
  assert.equal(d.waliKelas.nama, 'Guru Satu')
  db.close()
})

test('getPeringkatK13 mengurutkan rata-rata dan memberi rank', () => {
  const db = fixture()
  const p = getPeringkatK13(db, 't1', { rombelId: 'r1', semester: 'ganjil', tahunAjaran: '2025/2026' })
  assert.equal(p.total, 1)
  assert.equal(p.rows[0].rank, 1)
  db.close()
})

test('createRaporK13Pdf menghasilkan PDF 3 halaman per siswa', async () => {
  const db = fixture()
  const data = getK13RaporData(db, 't1', { siswaId: 's1', semester: 'ganjil', tahunAjaran: '2025/2026' })
  const pdf = await createRaporK13Pdf({ studentList: [{ ...data, rank: 1, totalSiswa: 1 }], settings: { nama_lembaga: 'MTs Contoh', nsm: '121', npsn: '700', kota_cetak: 'Tuban', kepala_sekolah: 'Kepsek' }, uploadDir: '/tmp/no-k13' })
  assert.ok(pdf.subarray(0, 5).toString() === '%PDF-')
  assert.ok(pdf.length > 3000)
  db.close()
})

test('createRaporK13Pdf menghormati bagian cover/identitas/nilai', async () => {
  const db = fixture()
  const data = getK13RaporData(db, 't1', { siswaId: 's1', semester: 'ganjil', tahunAjaran: '2025/2026' })
  const base = {
    studentList: [{ ...data, rank: 1, totalSiswa: 1 }],
    settings: { nama_lembaga: 'MTs Contoh', nsm: '121', npsn: '700', kota_cetak: 'Tuban', kepala_sekolah: 'Kepsek' },
    uploadDir: '/tmp/no-k13',
  }
  const halaman = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
  // Tanpa bagian (null) -> dokumen utuh 3 halaman.
  assert.equal(halaman(await createRaporK13Pdf(base)), 3)
  for (const bagian of ['cover', 'identitas', 'nilai']) {
    const pdf = await createRaporK13Pdf({ ...base, bagian })
    assert.ok(pdf.subarray(0, 5).toString() === '%PDF-')
    assert.equal(halaman(pdf), 1, `bagian ${bagian} harus 1 halaman`)
  }
  db.close()
})

test('getK13Ledger mengumpulkan grid nilai per mapel + total/rata/rank', () => {
  const db = fixture()
  db.exec(`CREATE TABLE jadwal (id TEXT, rombel_id TEXT, mapel_id TEXT, tenant_id TEXT, jenis_kegiatan TEXT);`)
  db.exec(`INSERT INTO jadwal VALUES ('j1','r1','m1','t1','mapel'),('j2','r1','m2','t1','mapel');`)
  db.exec(`INSERT INTO siswa VALUES ('s2','t1','Budi','2','002','L','Tuban','2011-02-02','Jl','081','Ibu','r1','aktif','Islam','Bpk B','Ibu B','Tani','Guru','Wali B','Tani','MI B','Anak Kandung',2);`)
  db.exec(`INSERT INTO rapor_k13 VALUES ('rk3','s2','m1','2025/2026','ganjil',70,'C',75,'','t1'),('rk4','s2','m2','2025/2026','ganjil',80,'B',75,'','t1');`)
  const all = getK13Ledger(db, 't1', { rombelId: 'r1', semester: 'ganjil', tahunAjaran: '2025/2026' })
  assert.equal(all.mapel.length, 2)
  assert.equal(all.jmlSiswa, 2)
  assert.equal(all.rows[0].rank, 1)
  assert.equal(all.rows.every(r => r.total > 0 && r.rata > 0), true)
  // Filter jenis kelamin perempuan -> hanya Ani.
  const perempuan = getK13Ledger(db, 't1', { rombelId: 'r1', semester: 'ganjil', tahunAjaran: '2025/2026', jenisKelamin: 'P' })
  assert.equal(perempuan.jmlSiswa, 1)
  assert.equal(perempuan.rows[0].nama, 'Ani')
  db.close()
})

test('createK13LedgerPdf menghasilkan PDF landscape', async () => {
  const db = fixture()
  db.exec(`CREATE TABLE jadwal (id TEXT, rombel_id TEXT, mapel_id TEXT, tenant_id TEXT, jenis_kegiatan TEXT);`)
  db.exec(`INSERT INTO jadwal VALUES ('j1','r1','m1','t1','mapel'),('j2','r1','m2','t1','mapel');`)
  const ledger = getK13Ledger(db, 't1', { rombelId: 'r1', semester: 'ganjil', tahunAjaran: '2025/2026' })
  const pdf = await createK13LedgerPdf({ ledger, settings: { nama_lembaga: 'MTs Contoh', kepala_sekolah: 'Kepsek', kota_cetak: 'Tuban' }, rombelNama: 'VII-A', semester: 'ganjil', tahunAjaran: '2025/2026' })
  assert.ok(pdf.subarray(0, 5).toString() === '%PDF-')
  assert.ok(pdf.length > 1500)
  db.close()
})