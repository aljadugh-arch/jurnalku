/**
 * Runtime test untuk monitoring kelengkapan data (GET /api/dashboard/kelengkapan).
 *
 * Menguji hitungKelengkapan() langsung dengan database in-memory, sehingga
 * kolom yang dipakai benar-benar divalidasi terhadap schema nyata – bukan
 * sekadar grep source. Skema di bawah disalin dari server/jurnalku.db.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { hitungKelengkapan, statusUntuk, persenDari } = require('../server/dashboard-kelengkapan.cjs')

const KOLOM = {
  settings: 'id TEXT, tenant_id TEXT, nama_lembaga TEXT, alamat TEXT, kepala_sekolah TEXT, npsn TEXT',
  siswa: 'id TEXT, tenant_id TEXT, nama TEXT, nis TEXT, nisn TEXT, rombel_id TEXT, jenis_kelamin TEXT, status TEXT',
  gtk: 'id TEXT, tenant_id TEXT, nama TEXT, nip TEXT, nuptk TEXT, nik TEXT, status TEXT',
  mapel: 'id TEXT, tenant_id TEXT, nama TEXT',
  rombel: 'id TEXT, tenant_id TEXT, nama TEXT, tahun_ajaran TEXT, wali_kelas_id TEXT',
  pengajar: 'id TEXT, tenant_id TEXT, gtk_id TEXT, mapel_id TEXT, rombel_id TEXT',
  kalender_kbm: 'id TEXT, tenant_id TEXT, tanggal TEXT, judul TEXT, jenis TEXT',
  jadwal: 'id TEXT, tenant_id TEXT, mapel_id TEXT, rombel_id TEXT, gtk_id TEXT, hari TEXT',
  penilaian_harian: 'id TEXT, tenant_id TEXT, siswa_id TEXT, mapel_id TEXT, tanggal TEXT, sikap INTEGER, keaktifan INTEGER, pengetahuan INTEGER',
  rapor: 'id TEXT, tenant_id TEXT, siswa_id TEXT, mapel_id TEXT, jenis TEXT, nilai_sts REAL, nilai_sas REAL',
  absensi_siswa: 'id TEXT, tenant_id TEXT, siswa_id TEXT, rombel_id TEXT, tanggal TEXT, status TEXT',
  absensi_guru: 'id TEXT, tenant_id TEXT, gtk_id TEXT, tanggal TEXT, status TEXT'
}

function makeDb() {
  const db = new Database(':memory:')
  db.exec(Object.entries(KOLOM).map(([t, cols]) => `CREATE TABLE ${t} (${cols});`).join('\n'))
  return db
}

function insert(db, table, rows) {
  const cols = Object.keys(rows[0])
  const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
  for (const row of rows) stmt.run(...cols.map(c => row[c]))
}

const TENANT = 'tenant-a'
const TODAY = '2026-09-30'

// Lembaga baru: semua kosong kecuali tenant settings.
function seedKosong(db) {
  insert(db, 'settings', [{ id: `main_${TENANT}`, tenant_id: TENANT, nama_lembaga: '', alamat: '', kepala_sekolah: '', npsn: '' }])
}

// Lembaga lengkap: semua data wajib terisi.
function seedLengkap(db) {
  insert(db, 'settings', [{
    id: `main_${TENANT}`, tenant_id: TENANT,
    nama_lembaga: 'MTs Uji', alamat: 'Jl. Uji 1', kepala_sekolah: 'Drs. Kepala', npsn: '12345678'
  }])
  insert(db, 'siswa', [
    { id: 's1', tenant_id: TENANT, nama: 'Ahmad', nis: '001', rombel_id: 'r1', jenis_kelamin: 'L' },
    { id: 's2', tenant_id: TENANT, nama: 'Bilal', nis: '002', rombel_id: 'r1', jenis_kelamin: 'L' }
  ])
  insert(db, 'gtk', [
    { id: 'g1', tenant_id: TENANT, nama: 'Guru Satu', nip: '111' },
    { id: 'g2', tenant_id: TENANT, nama: 'Guru Dua', nip: '222' }
  ])
  insert(db, 'mapel', [{ id: 'm1', tenant_id: TENANT, nama: 'IPA' }, { id: 'm2', tenant_id: TENANT, nama: 'MTK' }])
  insert(db, 'rombel', [{ id: 'r1', tenant_id: TENANT, nama: 'VIII-A', tahun_ajaran: '2026/2027', wali_kelas_id: 'g1' }])
  insert(db, 'pengajar', [
    { id: 'p1', tenant_id: TENANT, gtk_id: 'g1', mapel_id: 'm1', rombel_id: 'r1' },
    { id: 'p2', tenant_id: TENANT, gtk_id: 'g2', mapel_id: 'm2', rombel_id: 'r1' }
  ])
  // Kalender 12 bulan tercover.
  insert(db, 'kalender_kbm', Array.from({ length: 12 }, (_, i) => ({
    id: `k${i}`, tenant_id: TENANT, tanggal: `2026-${String(i + 1).padStart(2, '0')}-01`, judul: `Agenda ${i + 1}`, jenis: 'kegiatan'
  })))
  insert(db, 'jadwal', [{ id: 'j1', tenant_id: TENANT, mapel_id: 'm1', rombel_id: 'r1', gtk_id: 'g1', hari: 'senin' }])
  insert(db, 'penilaian_harian', [
    { id: 'n1', tenant_id: TENANT, siswa_id: 's1', mapel_id: 'm1', tanggal: TODAY, sikap: 90, keaktifan: 85, pengetahuan: 88 },
    { id: 'n2', tenant_id: TENANT, siswa_id: 's2', mapel_id: 'm1', tanggal: TODAY, sikap: 80, keaktifan: 82, pengetahuan: 84 }
  ])
  insert(db, 'rapor', [
    { id: 'rp1', tenant_id: TENANT, siswa_id: 's1', mapel_id: 'm1', jenis: 'sts', nilai_sts: 88, nilai_sas: 90 },
    { id: 'rp2', tenant_id: TENANT, siswa_id: 's2', mapel_id: 'm1', jenis: 'sas', nilai_sts: 85, nilai_sas: 87 }
  ])
  insert(db, 'absensi_siswa', [
    { id: 'a1', tenant_id: TENANT, siswa_id: 's1', rombel_id: 'r1', tanggal: TODAY, status: 'hadir' },
    { id: 'a2', tenant_id: TENANT, siswa_id: 's2', rombel_id: 'r1', tanggal: TODAY, status: 'hadir' }
  ])
  insert(db, 'absensi_guru', [
    { id: 'ag1', tenant_id: TENANT, gtk_id: 'g1', tanggal: TODAY, status: 'hadir' },
    { id: 'ag2', tenant_id: TENANT, gtk_id: 'g2', tanggal: TODAY, status: 'hadir' }
  ])
}

function itemOf(hasil, key) {
  const item = hasil.items.find(i => i.key === key)
  assert.ok(item, `item '${key}' tidak ditemukan`)
  return item
}

test('statusUntuk menerapkan ambang lengkap/hampir/belum_lengkap/kosong', () => {
  assert.equal(statusUntuk(100), 'lengkap')
  assert.equal(statusUntuk(99), 'hampir')
  assert.equal(statusUntuk(75), 'hampir')
  assert.equal(statusUntuk(74), 'belum_lengkap')
  assert.equal(statusUntuk(25), 'belum_lengkap')
  assert.equal(statusUntuk(24), 'kosong')
  assert.equal(statusUntuk(0), 'kosong')
})

test('persenDari tidak membagi nol dan dibatasi 0..100', () => {
  assert.equal(persenDari(0, 0), 0)
  assert.equal(persenDari(5, 0), 0)
  assert.equal(persenDari(1, 2), 50)
  assert.equal(persenDari(9, 4), 100)
})

test('lembaga baru: semua item kosong dan skor 0', () => {
  const db = makeDb(); seedKosong(db)
  const hasil = hitungKelengkapan(db, TENANT, { today: TODAY })

  assert.equal(hasil.items.length, 10, 'harus ada 10 kategori data wajib')
  assert.equal(hasil.skor_keseluruhan, 0, 'skor lembaga kosong harus 0')
  assert.equal(hasil.status_keseluruhan, 'kosong')
  assert.equal(hasil.jumlah_lengkap, 0)

  const wajibAda = [
    'profil_lembaga', 'data_siswa', 'data_gtk', 'data_mapel', 'data_rombel',
    'kalender_kbm', 'jadwal_pelajaran', 'penilaian_harian', 'rapor', 'absensi_hari_ini'
  ]
  assert.deepEqual(hasil.items.map(i => i.key), wajibAda)

  for (const key of wajibAda) {
    const item = itemOf(hasil, key)
    assert.equal(item.persen, 0, `${key} harus 0% saat kosong`)
    assert.equal(item.status, 'kosong', `${key} harus berstatus kosong`)
    assert.equal(typeof item.label, 'string')
    assert.ok(item.label.length > 0, `${key} harus punya label`)
  }
  assert.deepEqual(hasil.belum_lengkap, wajibAda)
  db.close()
})

test('lembaga lengkap: semua item 100% dan skor 100', () => {
  const db = makeDb(); seedLengkap(db)
  const hasil = hitungKelengkapan(db, TENANT, { today: TODAY })

  assert.equal(hasil.items.length, 10)
  assert.equal(hasil.skor_keseluruhan, 100, `skor harus 100, dapat ${hasil.skor_keseluruhan}`)
  assert.equal(hasil.status_keseluruhan, 'lengkap')
  assert.equal(hasil.jumlah_lengkap, 10)
  assert.deepEqual(hasil.belum_lengkap, [])

  for (const item of hasil.items) {
    assert.equal(item.persen, 100, `${item.key} harus 100%, dapat ${item.persen}`)
    assert.equal(item.status, 'lengkap', `${item.key} harus lengkap`)
  }

  // Angka konkret harus sesuai data yang diisi.
  assert.equal(itemOf(hasil, 'profil_lembaga').filled, 4)
  assert.equal(itemOf(hasil, 'data_siswa').filled, 2)
  assert.equal(itemOf(hasil, 'data_gtk').filled, 2)
  assert.equal(itemOf(hasil, 'data_gtk').punya_mapel, 2)
  assert.equal(itemOf(hasil, 'data_mapel').filled, 2)
  assert.equal(itemOf(hasil, 'data_rombel').filled, 1)
  assert.equal(itemOf(hasil, 'kalender_kbm').filled, 12)
  assert.equal(itemOf(hasil, 'kalender_kbm').entri, 12)
  assert.equal(itemOf(hasil, 'jadwal_pelajaran').entri, 1)
  assert.equal(itemOf(hasil, 'penilaian_harian').entri, 2)
  assert.equal(itemOf(hasil, 'rapor').entri, 2)
  db.close()
})

test('data parsial: persentase dan detail sesuai kekurangan nyata', () => {
  const db = makeDb(); seedLengkap(db)
  // Rusak sebagian data agar terukur.
  db.prepare("UPDATE settings SET npsn='' WHERE tenant_id=?").run(TENANT)                 // profil 3/4 = 75%
  db.prepare("UPDATE siswa SET rombel_id='' WHERE id='s2'").run()                          // siswa 1/2 = 50%
  db.prepare("UPDATE gtk SET nip='' WHERE id='g2'").run()                                  // gtk 1/2 = 50%
  db.prepare("UPDATE rombel SET wali_kelas_id='' WHERE id='r1'").run()                     // rombel 0/1 = 0%
  db.prepare("DELETE FROM kalender_kbm WHERE substr(tanggal,6,2) IN ('07','08','09','10','11','12')").run() // sisa 6 bulan
  db.prepare("DELETE FROM jadwal").run()                                                   // jadwal 0%
  db.prepare("DELETE FROM penilaian_harian").run()                                         // penilaian 0%
  db.prepare("DELETE FROM rapor").run()                                                    // rapor 0%
  db.prepare("DELETE FROM absensi_guru").run()                                             // absensi guru 0/2

  const hasil = hitungKelengkapan(db, TENANT, { today: TODAY })

  assert.equal(itemOf(hasil, 'profil_lembaga').persen, 75)
  assert.equal(itemOf(hasil, 'profil_lembaga').status, 'hampir')
  assert.match(itemOf(hasil, 'profil_lembaga').detail, /NPSN/)

  assert.equal(itemOf(hasil, 'data_siswa').persen, 50)
  assert.equal(itemOf(hasil, 'data_siswa').status, 'belum_lengkap')
  assert.match(itemOf(hasil, 'data_siswa').detail, /1 siswa belum lengkap/)

  assert.equal(itemOf(hasil, 'data_gtk').persen, 50)
  assert.match(itemOf(hasil, 'data_gtk').detail, /1 GTK belum lengkap/)

  assert.equal(itemOf(hasil, 'data_rombel').persen, 0)
  assert.equal(itemOf(hasil, 'data_rombel').status, 'kosong')

  assert.equal(itemOf(hasil, 'kalender_kbm').filled, 6)
  assert.equal(itemOf(hasil, 'kalender_kbm').persen, 50)

  assert.equal(itemOf(hasil, 'jadwal_pelajaran').persen, 0)
  assert.equal(itemOf(hasil, 'penilaian_harian').persen, 0)
  assert.equal(itemOf(hasil, 'rapor').persen, 0)
  assert.equal(itemOf(hasil, 'rapor').status, 'kosong')

  // Absensi: siswa 2/2 = 100, guru 0/2 = 0 → rata-rata 50.
  assert.equal(itemOf(hasil, 'absensi_hari_ini').persen, 50)
  assert.match(itemOf(hasil, 'absensi_hari_ini').detail, /Guru: 0\/2/)

  const skorManual = Math.round(hasil.items.reduce((s, i) => s + i.persen, 0) / hasil.items.length)
  assert.equal(hasil.skor_keseluruhan, skorManual)
  assert.ok(hasil.skor_keseluruhan > 0 && hasil.skor_keseluruhan < 100)
  db.close()
})

test('tenant terisolasi: data tenant lain tidak ikut terhitung', () => {
  const db = makeDb(); seedLengkap(db)
  // Tenant B punya siswa lengkap, mapel, dan rapor sendiri.
  insert(db, 'settings', [{ id: 'main_tenant-b', tenant_id: 'tenant-b', nama_lembaga: 'MTs B', alamat: 'B', kepala_sekolah: 'B', npsn: '999' }])
  insert(db, 'siswa', [{ id: 'bs1', tenant_id: 'tenant-b', nama: 'C', nis: '999', rombel_id: 'br1', jenis_kelamin: 'P' }])
  insert(db, 'rapor', [{ id: 'brp1', tenant_id: 'tenant-b', siswa_id: 'bs1', mapel_id: 'm1', jenis: 'sts', nilai_sts: 70, nilai_sas: 70 }])

  const a = hitungKelengkapan(db, TENANT, { today: TODAY })
  const b = hitungKelengkapan(db, 'tenant-b', { today: TODAY })

  assert.equal(itemOf(a, 'data_siswa').filled, 2, 'tenant-a tidak boleh terpengaruh siswa tenant-b')
  assert.equal(itemOf(a, 'rapor').filled, 2, 'tenant-a rapor harus 2, bukan 3')
  assert.equal(itemOf(b, 'data_siswa').total, 1)
  assert.equal(itemOf(b, 'rapor').filled, 1)
  assert.equal(itemOf(b, 'data_mapel').filled, 0, 'tenant-b tidak punya mapel sendiri')
  assert.notEqual(a.skor_keseluruhan, b.skor_keseluruhan)
  db.close()
})

test('absensi hanya menghitung tanggal yang diminta', () => {
  const db = makeDb(); seedLengkap(db)
  // Aktivitas absensi kemarin tidak boleh ikut dihitung untuk hari ini.
  insert(db, 'absensi_siswa', [{ id: 'lama', tenant_id: TENANT, siswa_id: 's1', rombel_id: 'r1', tanggal: '2026-09-29', status: 'hadir' }])
  insert(db, 'absensi_guru', [{ id: 'lamag', tenant_id: TENANT, gtk_id: 'g1', tanggal: '2026-09-29', status: 'hadir' }])

  const hariIni = hitungKelengkapan(db, TENANT, { today: TODAY })
  assert.equal(itemOf(hariIni, 'absensi_hari_ini').filled, 4, 'hanya 2 siswa + 2 guru hari ini')

  // Di tanggal 2026-09-29 tetap 1 siswa + 1 guru (data hari ini tidak bocor).
  const kemarin = hitungKelengkapan(db, TENANT, { today: '2026-09-29' })
  assert.equal(itemOf(kemarin, 'absensi_hari_ini').filled, 2)
  db.close()
})

test('siswa tanpa nilai/rapor tapi sudah punya identitas lengkap tetap dihitung di siswa', () => {
  const db = makeDb(); seedKosong(db)
  insert(db, 'siswa', [
    { id: 's1', tenant_id: TENANT, nama: 'A', nis: '1', rombel_id: 'r1', jenis_kelamin: 'L' },
    { id: 's2', tenant_id: TENANT, nama: 'B', nis: '', rombel_id: 'r1', jenis_kelamin: 'P' }
  ])
  const hasil = hitungKelengkapan(db, TENANT, { today: TODAY })
  assert.equal(itemOf(hasil, 'data_siswa').filled, 1)
  assert.equal(itemOf(hasil, 'data_siswa').total, 2)
  assert.equal(itemOf(hasil, 'data_siswa').persen, 50)
  assert.equal(itemOf(hasil, 'penilaian_harian').total, 2, 'total penilaian mengikuti jumlah siswa')
  assert.equal(itemOf(hasil, 'rapor').total, 2)
  db.close()
})

test('GTK tanpa NIP tetap lengkap bila punya NUPTK atau NIK', () => {
  const db = makeDb(); seedKosong(db)
  insert(db, 'gtk', [
    { id: 'g1', tenant_id: TENANT, nama: 'PNS', nip: '111', nuptk: '', nik: '' },
    { id: 'g2', tenant_id: TENANT, nama: 'Non-PNS NUPTK', nip: '', nuptk: '222', nik: '' },
    { id: 'g3', tenant_id: TENANT, nama: 'Non-PNS NIK', nip: '', nuptk: '', nik: '333' },
    { id: 'g4', tenant_id: TENANT, nama: 'Tanpa Nomor', nip: '', nuptk: '', nik: '' }
  ])
  const hasil = hitungKelengkapan(db, TENANT, { today: TODAY })
  const gtk = itemOf(hasil, 'data_gtk')
  assert.equal(gtk.filled, 3, 'NIP, NUPTK, atau NIK salah satu cukup')
  assert.equal(gtk.total, 4)
  assert.equal(gtk.persen, 75)
  assert.match(gtk.detail, /1 GTK belum lengkap/)
  assert.match(gtk.detail, /NIP\/NUPTK\/NIK/, 'detail harus menyebut ketiga jenis nomor identitas')
  db.close()
})

test('nilai harian yang tersimpan tanpa angka (semua 0) tidak dihitung terisi', () => {
  const db = makeDb(); seedKosong(db)
  insert(db, 'siswa', [
    { id: 's1', tenant_id: TENANT, nama: 'A', nis: '1', rombel_id: 'r1', jenis_kelamin: 'L' },
    { id: 's2', tenant_id: TENANT, nama: 'B', nis: '2', rombel_id: 'r1', jenis_kelamin: 'P' },
    { id: 's3', tenant_id: TENANT, nama: 'C', nis: '3', rombel_id: 'r1', jenis_kelamin: 'L' }
  ])
  insert(db, 'penilaian_harian', [
    // s1 benar-benar dinilai
    { id: 'n1', tenant_id: TENANT, siswa_id: 's1', mapel_id: 'm1', tanggal: TODAY, sikap: 80, keaktifan: 75, pengetahuan: 85 },
    // s2 tersimpan tapi tanpa angka — kasus "nilai terlihat ada tapi kosong"
    { id: 'n2', tenant_id: TENANT, siswa_id: 's2', mapel_id: 'm1', tanggal: TODAY, sikap: 0, keaktifan: 0, pengetahuan: 0 }
  ])
  const hasil = hitungKelengkapan(db, TENANT, { today: TODAY })
  const penilaian = itemOf(hasil, 'penilaian_harian')
  assert.equal(penilaian.filled, 1, 'hanya siswa dengan angka nyata yang dihitung')
  assert.equal(penilaian.total, 3)
  assert.equal(penilaian.entri, 1, 'entri terhitung hanya yang berisi angka')
  assert.equal(penilaian.entri_kosong, 1, 'baris tanpa angka harus dilaporkan terpisah')
  assert.match(penilaian.detail, /2 siswa belum punya nilai/)
  assert.match(penilaian.detail, /1 baris nilai tersimpan tanpa angka/)
  db.close()
})

test('satu angka saja yang terisi sudah dianggap nilai sah', () => {
  const db = makeDb(); seedKosong(db)
  insert(db, 'siswa', [{ id: 's1', tenant_id: TENANT, nama: 'A', nis: '1', rombel_id: 'r1', jenis_kelamin: 'L' }])
  // Hanya sikap yang diisi.
  insert(db, 'penilaian_harian', [{ id: 'n1', tenant_id: TENANT, siswa_id: 's1', mapel_id: 'm1', tanggal: TODAY, sikap: 80, keaktifan: 0, pengetahuan: 0 }])
  const hasil = hitungKelengkapan(db, TENANT, { today: TODAY })
  assert.equal(itemOf(hasil, 'penilaian_harian').filled, 1)
  assert.equal(itemOf(hasil, 'penilaian_harian').entri_kosong, 0)
  db.close()
})

test('tenant kosong ditolak dengan pesan jelas', () => {
  const db = makeDb()
  assert.throws(() => hitungKelengkapan(db, ''), /Tenant wajib/)
  assert.throws(() => hitungKelengkapan(db, null), /Tenant wajib/)
  db.close()
})

test('endpoint HTTP hanya menjembatani module (tanpa SQL inline)', () => {
  const fs = require('fs')
  const path = require('path')
  const source = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')
  const start = source.indexOf("app.get('/api/dashboard/kelengkapan'")
  assert.ok(start > -1, 'route /api/dashboard/kelengkapan tidak terdaftar')
  const end = source.indexOf('// ==================== WA GATEWAY', start)
  const block = source.substring(start, end)
  assert.ok(block.includes("require('./dashboard-kelengkapan.cjs')") || source.includes("require('./dashboard-kelengkapan.cjs')"))
  assert.ok(block.includes('hitungKelengkapan(db, req.tenantId)'))
  assert.ok(!/db\.prepare/.test(block), 'endpoint tidak boleh lagi punya SQL inline')
})
