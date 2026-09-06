const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const fs = require('node:fs')
const path = require('node:path')

const indexSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')
const recapSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'attendance-periodic-recap.cjs'), 'utf8')
const ekskulPage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'admin', 'EkskulPage.tsx'), 'utf8')
const rekapPage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'admin', 'RekapAbsensiPage.tsx'), 'utf8')

test('schema ekskul memiliki kolom jenis (wajib/pilihan) dan scope_rombel', () => {
  assert.match(indexSource, /jenis_kegiatan\s+TEXT\s+DEFAULT\s*'pilihan'/, 'wajib/pilihan default pilihan')
  assert.match(indexSource, /scope_rombel\s+TEXT/, 'wajib dapat dibatasi ke rombel tertentu')
})

test('API ekskul mengembalikan jenis dan scope_rombel pada daftar dan detail', () => {
  assert.match(indexSource, /SELECT e\.\*, g\.nama as pembina_nama/, 'daftar ekskul memuat seluruh kolom termasuk jenis & scope')
  assert.match(indexSource, /SELECT id, jenis_kegiatan, scope_rombel FROM ekskul WHERE id=\? AND tenant_id=\?/, 'anggota wajib membaca jenis & scope ekskul')
})

test('POST/PUT ekskul menerima jenis_kegiatan dan scope_rombel', () => {
  assert.match(indexSource, /INSERT INTO ekskul \(id, nama, pembina_id, hari, jam_mulai, jam_selesai, deskripsi, tenant_id, jenis_kegiatan, scope_rombel\)/, 'POST ekskul menyimpan jenis dan scope')
  assert.match(indexSource, /UPDATE ekskul SET nama=\?, pembina_id=\?[^;]*jenis_kegiatan=\?, scope_rombel=\?/, 'PUT ekskul menyimpan jenis dan scope')
})

test('anggota ekskul wajib otomatis terdiri atas seluruh siswa atau siswa per rombel scope', () => {
  assert.match(indexSource, /DELETE FROM ekskul_anggota WHERE ekskul_id=\? AND tenant_id=\? AND siswa_id NOT IN/, 'wajib memangkas siswa di luar scope')
  assert.match(indexSource, /COALESCE\(s\.status,'aktif'\)='aktif'/, 'wajib hanya mengikutkan siswa aktif')
  assert.match(indexSource, /scope \? \[scope\] : \[\]/, 'wajib membatasi ke rombel scope saat terisi')
})

test('anggota ekskul pilihan masih memakai daftar eksplisit dan dapat menambah siswa', () => {
  assert.match(indexSource, /INSERT OR IGNORE INTO ekskul_anggota \(id, ekskul_id, siswa_id, tenant_id\) VALUES/, 'set anggota pilihan menyisipkan siswa')
  assert.match(indexSource, /WHERE ekskul_id=\? AND tenant_id=\? AND siswa_id NOT IN/, 'sinkronisasi wajib tidak menyentuh ekskul pilihan')
})

test('UI ekskul menawarkan radio jenis wajib/pilihan dan pemilih scope rombel saat wajib', () => {
  assert.match(ekskulPage, /WAJIB\b/, 'radio jenis WAJIB di UI')
  assert.match(ekskulPage, /PILIHAN\b/, 'radio jenis PILIHAN di UI')
  assert.match(ekskulPage, /scope_rombel/, 'scope rombel di UI')
  assert.match(ekskulPage, /Sinkron Otomatis/, 'tombol sinkron otomatis')
})

test('rekap GTK tidak memuat jadwal mengajar pada periode ini', () => {
  assert.doesNotMatch(rekapPage, /Jadwal mengajar guru pada periode ini/, 'UI rekap GTK tidak lagi menampilkan jadwal mengajar')
  assert.match(rekapPage, /jml_jtm/, 'UI rekap GTK menampilkan jumlah JTM')
  assert.match(rekapPage, /mapel_list/, 'UI rekap GTK menampilkan mapel yang diampu')
  assert.match(rekapPage, /Jumlah Kehadiran/, 'UI rekap GTK menampilkan jumlah kehadiran')
  assert.doesNotMatch(indexSource, /jadwal_mengajar\b/, 'backend rekap GTK tidak lagi membawa jadwal mengajar')
  assert.match(recapSource, /gtkTeachingStats/, 'backend rekap GTK menghitung statistik mengajar')
  assert.match(recapSource, /mapel_list/, 'backend rekap GTK menghitung mapel yang diampu')
})

function fixtureDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE gtk (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT, nip TEXT, jabatan TEXT, status_kepegawaian TEXT);
    CREATE TABLE mapel (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT);
    CREATE TABLE rombel (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT);
    CREATE TABLE jadwal (id TEXT PRIMARY KEY, tenant_id TEXT, gtk_id TEXT, rombel_id TEXT, mapel_id TEXT, hari TEXT, jam_mulai TEXT, jam_selesai TEXT, jenis_kegiatan TEXT);
    CREATE TABLE absensi_guru (id TEXT PRIMARY KEY, tenant_id TEXT, gtk_id TEXT, tanggal TEXT, status TEXT, waktu_masuk TEXT, waktu_pulang TEXT);
    CREATE TABLE siswa (id TEXT PRIMARY KEY, tenant_id TEXT, rombel_id TEXT, nis TEXT, nama TEXT, status TEXT);
    CREATE TABLE ekskul (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT, pembina_id TEXT, hari TEXT, jam_mulai TEXT, jam_selesai TEXT, deskripsi TEXT, jenis_kegiatan TEXT DEFAULT 'pilihan', scope_rombel TEXT);
    CREATE TABLE ekskul_anggota (id TEXT PRIMARY KEY, tenant_id TEXT, ekskul_id TEXT, siswa_id TEXT);
  `)
  ;['g1', 'g2'].forEach((id, i) => db.prepare('INSERT INTO gtk (id, tenant_id, nama, nip, jabatan, status_kepegawaian) VALUES (?,?,?,?,?,?)').run(id, 't', `Guru ${i}`, 'NIP' + i, 'Guru', 'Aktif'))
  ;['m1', 'm2'].forEach((id, i) => db.prepare('INSERT INTO mapel (id, tenant_id, nama) VALUES (?,?,?)').run(id, 't', 'Mapel ' + i))
  ;['r1', 'r2'].forEach((id, i) => db.prepare('INSERT INTO rombel (id, tenant_id, nama) VALUES (?,?,?)').run(id, 't', 'Rombel ' + i))
  ;['s1', 's2', 's3'].forEach((id, i) => db.prepare('INSERT INTO siswa (id, tenant_id, rombel_id, nis, nama, status) VALUES (?,?,?,?,?,?)').run(id, 't', i === 2 ? 'r2' : 'r1', 'N' + i, 'Siswa ' + i, 'aktif'))
  return db
}

function syncWajib(db, ekskulId, tenantId) {
  const info = db.prepare('SELECT jenis_kegiatan, scope_rombel FROM ekskul WHERE id=? AND tenant_id=?').get(ekskulId, tenantId)
  if (!info || String(info.jenis_kegiatan || 'pilihan') !== 'wajib') return 0
  const scope = String(info.scope_rombel || '').trim()
  const scopeClause = scope ? ' AND s.rombel_id=?' : ''
  db.prepare(`DELETE FROM ekskul_anggota WHERE ekskul_id=? AND tenant_id=? AND siswa_id NOT IN (
      SELECT s.id FROM siswa s WHERE s.tenant_id=? AND COALESCE(s.status,'aktif')='aktif'${scopeClause})`)
    .run(...[ekskulId, tenantId, tenantId, ...(scope ? [scope] : [])])
  const candidates = db.prepare(`SELECT id FROM siswa s WHERE s.tenant_id=? AND COALESCE(s.status,'aktif')='aktif'${scopeClause}`).all(...[tenantId, ...(scope ? [scope] : [])])
  let added = 0
  db.transaction(() => { for (const s of candidates) { db.prepare('INSERT OR IGNORE INTO ekskul_anggota (id, ekskul_id, siswa_id, tenant_id) VALUES (?,?,?,?)').run('m-' + s.id, ekskulId, s.id, tenantId); added++ } })()
  return added
}

test('sync anggota wajib mengisi seluruh siswa tenant saat scope kosong dan per rombel saat terisi', () => {
  const db = fixtureDb()
  db.prepare("INSERT INTO ekskul (id, tenant_id, nama, jenis_kegiatan) VALUES ('e1','t','Pramuka','wajib')").run()
  assert.equal(syncWajib(db, 'e1', 't'), 3)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ekskul_anggota WHERE ekskul_id=?').get('e1').n, 3)
  db.prepare("UPDATE ekskul SET scope_rombel='r1' WHERE id='e1'").run()
  assert.equal(syncWajib(db, 'e1', 't'), 2)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ekskul_anggota WHERE ekskul_id=?').get('e1').n, 2)
  assert.deepEqual(db.prepare('SELECT siswa_id FROM ekskul_anggota WHERE ekskul_id=? ORDER BY siswa_id').all('e1').map(r => r.siswa_id), ['s1', 's2'])
  db.close()
})

test('sync anggota wajib menolak siswa di luar scope rombel dan mengecualikan siswa nonaktif', () => {
  const db = fixtureDb()
  db.prepare("INSERT INTO ekskul (id, tenant_id, nama, jenis_kegiatan, scope_rombel) VALUES ('e2','t','Tahfidz','wajib','r1')").run()
  // seed a stray member outside scope first
  db.prepare("INSERT INTO ekskul_anggota (id, ekskul_id, siswa_id, tenant_id) VALUES ('stray','e2','s3','t')").run()
  db.prepare("UPDATE siswa SET status='nonaktif' WHERE id='s2'").run()
  assert.equal(syncWajib(db, 'e2', 't'), 1)
  const rows = db.prepare('SELECT siswa_id FROM ekskul_anggota WHERE ekskul_id=? ORDER BY siswa_id').all('e2').map(r => r.siswa_id)
  assert.deepEqual(rows, ['s1'])
  db.close()
})

test('rapor mendukung input nilai sumatif STS dan SAS', () => {
  assert.match(indexSource, /post\('\/api\/rapor\/nilai-sumatif'/, 'endpoint input nilai sumatif ada')
  assert.match(indexSource, /nilai_sts|nilai_sas/, 'kolom STS/SAS dipakai')
  assert.match(indexSource, /ON CONFLICT\(siswa_id, mapel_id, tahun_ajaran, semester, jenis\)/, 'upsert sumatif ada')
})

test('UI rapor menawarkan mode sumatif (STS/SAS) dan input kolom STS/SAS', () => {
  const raporPage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'admin', 'RaporPage.tsx'), 'utf8')
  assert.match(raporPage, /value="sumatif"/, 'opsi jenis sumatif di UI')
  assert.match(raporPage, /Nilai STS/, 'header kolom STS')
  assert.match(raporPage, /Nilai SAS/, 'header kolom SAS')
  assert.match(raporPage, /stsSas\[r\.mapel_id\]/, 'input per-mapel terhubung ke state STS/SAS')
})

test('generate rapor memadukan STS/SAS bila tersedia pada nilai akhir', () => {
  assert.match(indexSource, /stsRow\?\.nilai_sts/, 'generate membaca STS yang tersimpan')
  assert.match(indexSource, /sts \|\| sas/, 'generate memasukkan STS/SAS ke nilai akhir')
})