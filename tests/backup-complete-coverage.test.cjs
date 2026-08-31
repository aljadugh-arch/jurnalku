const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createService } = require('../server/backup-restore.cjs')

function database() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, nama TEXT NOT NULL);
    INSERT INTO tenants VALUES ('t1','Tenant Satu');
    CREATE TABLE settings (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, nama_lembaga TEXT, logo TEXT, theme TEXT, primary_color TEXT, accent_color TEXT, sidebar_color TEXT, geo_latitude REAL, geo_longitude REAL, geo_radius INTEGER, pwa_icon TEXT);
    CREATE TABLE absensi_siswa (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, siswa_id TEXT);
    CREATE TABLE absensi_guru (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, gtk_id TEXT);
    CREATE TABLE jamaah_sesi (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, nama TEXT);
    CREATE TABLE jamaah_rekap_manual (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, siswa_id TEXT, jumlah_hadir INTEGER);
    CREATE TABLE absensi_kegiatan (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, siswa_id TEXT, kegiatan_id TEXT);
    CREATE TABLE kegiatan_khusus (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, nama TEXT);
    CREATE TABLE keuangan_akun (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, nama TEXT);
    CREATE TABLE keuangan_kategori (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, nama TEXT);
    CREATE TABLE keuangan_transaksi (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, akun_id TEXT, kategori_id TEXT, nominal REAL);
    INSERT INTO settings VALUES ('s','t1','Sekolah','/uploads/logo.webp','dark','#111','#222','#333',-7.1,112.1,100,'/uploads/favicon.webp');
    INSERT INTO jamaah_sesi VALUES ('js','t1','Subuh');
    INSERT INTO jamaah_rekap_manual VALUES ('jr','t1','siswa-1',10);
    INSERT INTO absensi_kegiatan VALUES ('ak','t1','siswa-1','js');
    INSERT INTO kegiatan_khusus VALUES ('kk','t1','Kegiatan');
    INSERT INTO keuangan_akun VALUES ('ka','t1','Kas');
    INSERT INTO keuangan_kategori VALUES ('kkat','t1','SPP');
    INSERT INTO keuangan_transaksi VALUES ('kt','t1','ka','kkat',1000);
  `)
  return db
}

test('complete tenant backup includes jamaah, kegiatan, finance data and settings', () => {
  const db = database()
  const artifact = createService(db).exportData('t1')
  const keys = artifact.manifest.sections.map(s => s.key)
  for (const key of ['settings', 'absensi', 'jamaah', 'keuangan']) assert.ok(keys.includes(key), key)
  assert.equal(artifact.tables.jamaah.filter(r => r.__table === 'jamaah_sesi').length, 1)
  assert.equal(artifact.tables.jamaah.filter(r => r.__table === 'jamaah_rekap_manual').length, 1)
  assert.equal(artifact.tables.keuangan.length, 3)
  assert.equal(artifact.tables.settings[0].logo, '/uploads/logo.webp')
  db.close()
})

test('section inventory reports rows for every supported tenant table', () => {
  const db = database()
  const sections = Object.fromEntries(createService(db).sections('t1').map(x => [x.key, x.count]))
  assert.ok(sections.jamaah >= 2)
  assert.ok(sections.keuangan >= 3)
  db.close()
})

test('backup never exports password or credential columns', () => {
  const db = database()
  db.exec("ALTER TABLE settings ADD COLUMN secret_token TEXT; UPDATE settings SET secret_token='do-not-export'")
  const row = createService(db).exportData('t1').tables.settings[0]
  assert.equal('secret_token' in row, false)
  db.close()
})

test('round-trip complete backup is idempotent and restores all fixture rows', () => {
  const db = database()
  const service = createService(db, { backupDir: '/tmp/jurnalku-complete-backup-test' })
  const artifact = service.exportData('t1')
  const result = service.restore('t1', artifact, 'merge', 'RESTORE')
  assert.equal(result.success, true)
  assert.ok(result.skipped > 0)
  db.close()
})

test('referenced tenant uploads are embedded and restored without overwriting files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jurnalku-media-'))
  const source = path.join(root, 'source')
  const target = path.join(root, 'target')
  fs.mkdirSync(source)
  fs.writeFileSync(path.join(source, 'logo.webp'), Buffer.from('tenant-logo'))
  fs.writeFileSync(path.join(source, 'favicon.webp'), Buffer.from('tenant-favicon'))
  const db = database()
  const service = createService(db, { mediaRoot: source, backupDir: path.join(root, 'snapshots') })
  const artifact = service.exportData('t1')
  assert.equal(artifact.media.length, 2)
  assert.deepEqual(artifact.media.map(x => x.path).sort(), ['favicon.webp', 'logo.webp'])
  const parsed = service.parseArtifact('t1', Buffer.from(JSON.stringify(artifact)))
  const restored = createService(db, { mediaRoot: target, backupDir: path.join(root, 'snapshots2') })
    .restore('t1', parsed, 'merge', 'RESTORE')
  assert.equal(restored.media_restored, 2)
  assert.equal(fs.readFileSync(path.join(target, 'logo.webp'), 'utf8'), 'tenant-logo')
  const same = createService(db, { mediaRoot: target, backupDir: path.join(root, 'snapshots3') })
    .restore('t1', parsed, 'merge', 'RESTORE')
  assert.ok(same.media_skipped >= 1)
  assert.equal(fs.readFileSync(path.join(target, 'logo.webp'), 'utf8'), 'tenant-logo')
  fs.writeFileSync(path.join(target, 'logo.webp'), Buffer.from('newer-file'))
  assert.throws(() => createService(db, { mediaRoot: target, backupDir: path.join(root, 'snapshots4') })
    .restore('t1', parsed, 'merge', 'RESTORE'), /checksum berbeda/)
  db.close()
})

test('media traversal and checksum tampering are rejected before restore', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jurnalku-media-invalid-'))
  fs.writeFileSync(path.join(root, 'logo.webp'), Buffer.from('tenant-logo'))
  const db = database()
  const service = createService(db, { mediaRoot: root })
  const artifact = service.exportData('t1')
  artifact.media[0].path = '../escape.webp'
  artifact.manifest.media.checksum = service.checksum(artifact.media)
  assert.throws(() => service.preview('t1', artifact), /Path media tidak valid/)
  const checksumArtifact = service.exportData('t1')
  checksumArtifact.media[0].data = Buffer.from('tampered').toString('base64')
  checksumArtifact.manifest.media.checksum = service.checksum(checksumArtifact.media)
  assert.throws(() => service.preview('t1', checksumArtifact), /Checksum media tidak cocok/)
  db.close()
})
