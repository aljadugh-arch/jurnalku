const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createService, LIMITS } = require('../server/backup-restore.cjs')
const driveSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'backup-drive.cjs'), 'utf8')
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')
const backupPage = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'admin', 'BackupRestorePage.tsx'), 'utf8')

function database() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, nama TEXT NOT NULL);
    INSERT INTO tenants VALUES ('t1','Tenant Satu'),('t2','Tenant Dua');
    CREATE TABLE settings (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, nama_lembaga TEXT, logo TEXT, pwa_icon TEXT);
    CREATE TABLE gtk (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, nama TEXT, foto TEXT);
    INSERT INTO settings VALUES ('s','t1','Sekolah','/uploads/logo.webp','/uploads/favicon.webp');
  `)
  return db
}

function mediaRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jurnalku-media-limit-'))
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(root, name), Buffer.alloc(bytes, 'x'))
  return root
}

test('batas media diekspor sebagai konstanta agar bisa diaudit dan diuji', () => {
  assert.equal(typeof LIMITS.MAX_MEDIA_TOTAL_BYTES, 'number')
  assert.equal(typeof LIMITS.MAX_MEDIA_FILE_BYTES, 'number')
  assert.equal(typeof LIMITS.MAX_BYTES, 'number')
  // Media 57 MB milik tenant produksi harus masuk tanpa gagal.
  assert.ok(LIMITS.MAX_MEDIA_TOTAL_BYTES >= 120 * 1024 * 1024, 'budget media terlalu kecil untuk tenant nyata')
  // Artefak harus bisa memuat media hasil base64 (rasio 4/3) plus baris tabel.
  assert.ok(LIMITS.MAX_BYTES >= Math.ceil(LIMITS.MAX_MEDIA_TOTAL_BYTES * 4 / 3), 'MAX_BYTES lebih kecil dari media base64')
})

test('media melampaui budget total tidak lagi menggagalkan backup, tetapi dicatat sebagai omitted', () => {
  const root = mediaRoot({ 'logo.webp': 1024, 'favicon.webp': 1024 })
  const db = database()
  // Budget sengaja dibuat sangat kecil agar file kedua tidak tertampung.
  const service = createService(db, { mediaRoot: root, maxMediaTotalBytes: 1500 })
  const artifact = service.exportData('t1')
  assert.equal(artifact.media.length, 1)
  assert.equal(artifact.manifest.media.count, 1)
  assert.equal(artifact.manifest.media.omitted.length, 1)
  assert.equal(artifact.manifest.media.omitted[0].reason, 'total_budget')
  assert.equal(artifact.manifest.media.omitted_bytes, 1024)
  db.close()
})

test('file media tunggal melebihi batas dilewati, bukan melempar error', () => {
  const root = mediaRoot({ 'logo.webp': 4096, 'favicon.webp': 16 })
  const db = database()
  const service = createService(db, { mediaRoot: root, maxMediaFileBytes: 1024 })
  const artifact = service.exportData('t1')
  assert.deepEqual(artifact.media.map(item => item.path), ['favicon.webp'])
  assert.deepEqual(artifact.manifest.media.omitted.map(item => item.path), ['logo.webp'])
  assert.equal(artifact.manifest.media.omitted[0].reason, 'file_too_large')
  db.close()
})

test('jumlah referensi media berlebihan dipangkas tanpa menggagalkan backup', () => {
  const files = {}
  for (let index = 0; index < 6; index++) files[`f${index}.webp`] = 8
  const root = mediaRoot(files)
  const db = database()
  db.exec("INSERT INTO gtk VALUES ('g0','t1','GTK 0','/uploads/f0.webp'),('g1','t1','GTK 1','/uploads/f1.webp'),('g2','t1','GTK 2','/uploads/f2.webp'),('g3','t1','GTK 3','/uploads/f3.webp'),('g4','t1','GTK 4','/uploads/f4.webp'),('g5','t1','GTK 5','/uploads/f5.webp')")
  const service = createService(db, { mediaRoot: root, maxMediaFiles: 3 })
  const artifact = service.exportData('t1')
  assert.equal(artifact.media.length, 3)
  assert.ok(artifact.manifest.media.omitted.length >= 1)
  assert.ok(artifact.manifest.media.omitted.every(item => item.reason === 'file_count_budget'))
  db.close()
})

test('backup dengan media omitted tetap lolos preview dan restore', () => {
  const root = mediaRoot({ 'logo.webp': 1024, 'favicon.webp': 1024 })
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'jurnalku-media-target-'))
  const db = database()
  const service = createService(db, { mediaRoot: root, maxMediaTotalBytes: 1500, backupDir: path.join(root, 'snap') })
  const artifact = service.exportData('t1')
  const parsed = service.parseArtifact('t1', Buffer.from(JSON.stringify(artifact)))
  const previewed = createService(db, { mediaRoot: target, backupDir: path.join(root, 'snap2') }).preview('t1', parsed)
  assert.equal(previewed.valid, true)
  assert.equal(previewed.media_count, 1)
  assert.equal(previewed.media_omitted, 1)
  const restored = createService(db, { mediaRoot: target, backupDir: path.join(root, 'snap3') }).restore('t1', parsed, 'merge', 'RESTORE')
  assert.equal(restored.success, true)
  assert.equal(restored.media_restored, 1)
  assert.equal(restored.media_omitted, 1)
  db.close()
})

test('manifest omitted yang dipalsukan bentuknya ditolak sebelum restore', () => {
  const root = mediaRoot({ 'logo.webp': 16, 'favicon.webp': 16 })
  const db = database()
  const service = createService(db, { mediaRoot: root })
  const artifact = service.exportData('t1')
  artifact.manifest.media.omitted = [{ path: '../escape.webp', size: 1, reason: 'total_budget' }]
  assert.throws(() => service.preview('t1', artifact), /media/i)
  const wrongShape = service.exportData('t1')
  wrongShape.manifest.media.omitted = 'bukan-array'
  assert.throws(() => service.preview('t1', wrongShape), /media/i)
  db.close()
})

test('batas keras tetap berlaku pada artefak yang diunggah pengguna', () => {
  const root = mediaRoot({ 'logo.webp': 16, 'favicon.webp': 16 })
  const db = database()
  const service = createService(db, { mediaRoot: root })
  const artifact = service.exportData('t1')
  // Simulasikan unggahan jahat: satu entri media melampaui batas per-file.
  artifact.media[0].size = LIMITS.MAX_MEDIA_FILE_BYTES + 1
  artifact.manifest.media.checksum = service.checksum(artifact.media)
  assert.throws(() => service.preview('t1', artifact), /Bentuk media tidak valid/)
  db.close()
})

test('endpoint backup Drive melaporkan media yang dilewati, bukan menggagalkan backup', () => {
  assert.match(driveSource, /artifact\.manifest\?\.media\?\.omitted \|\| \[\]/)
  assert.match(driveSource, /media_omitted: omitted\.length/)
  assert.match(driveSource, /media_omitted_bytes/)
  assert.match(driveSource, /media_omitted_files/)
  // Status log tetap 'ok' pada jalur sukses; error hanya untuk kegagalan nyata.
  assert.match(driveSource, /VALUES \(\?,\?,\?,\?,\?,\?\)'\)\s*\n\s*\.run\(id, req\.tenantId, filename, driveFileId, gz\.length, 'ok'\)/)
})

test('UI backup memberi tahu admin saat ada media yang dilewati', () => {
  assert.match(backupPage, /data\.media_omitted > 0/)
  assert.match(backupPage, /media dilewati karena melewati batas ukuran/)
})

test('batas upload restore mengikuti batas keras parser backup', () => {
  assert.match(indexSource, /LIMITS: BACKUP_LIMITS/)
  assert.match(indexSource, /fileSize: BACKUP_LIMITS\.MAX_BYTES/)
})
