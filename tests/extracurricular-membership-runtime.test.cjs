const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { setupEkskulMembership } = require('../server/extracurricular-membership.cjs')

function baseDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE ekskul (id TEXT PRIMARY KEY, nama TEXT, tenant_id TEXT NOT NULL);
    CREATE TABLE siswa (id TEXT PRIMARY KEY, nama TEXT, tenant_id TEXT NOT NULL);
  `)
  return db
}

test('migrasi anggota legacy mempertahankan relasi valid dan mengkanoniskan tenant dari kegiatan', () => {
  const db = baseDb()
  db.exec(`CREATE TABLE ekskul_anggota (
    id TEXT PRIMARY KEY, ekskul_id TEXT NOT NULL, siswa_id TEXT NOT NULL, tenant_id TEXT,
    UNIQUE(ekskul_id, siswa_id)
  )`)
  db.prepare('INSERT INTO ekskul VALUES (?,?,?)').run('pramuka-a', 'Pramuka', 'tenant-a')
  db.prepare('INSERT INTO ekskul VALUES (?,?,?)').run('tahfidz-b', 'Tahfidz', 'tenant-b')
  db.prepare('INSERT INTO siswa VALUES (?,?,?)').run('siswa-a', 'Ali', 'tenant-a')
  db.prepare('INSERT INTO siswa VALUES (?,?,?)').run('siswa-b', 'Budi', 'tenant-b')
  db.prepare('INSERT INTO ekskul_anggota VALUES (?,?,?,NULL)').run('valid', 'pramuka-a', 'siswa-a')
  db.prepare('INSERT INTO ekskul_anggota VALUES (?,?,?,NULL)').run('cross', 'pramuka-a', 'siswa-b')
  db.prepare('INSERT INTO ekskul_anggota VALUES (?,?,?,?)').run('stale', 'tahfidz-b', 'siswa-b', 'default')

  setupEkskulMembership(db)

  assert.deepEqual(db.prepare('SELECT id,ekskul_id,siswa_id,tenant_id FROM ekskul_anggota ORDER BY id').all(), [
    { id: 'stale', ekskul_id: 'tahfidz-b', siswa_id: 'siswa-b', tenant_id: 'tenant-b' },
    { id: 'valid', ekskul_id: 'pramuka-a', siswa_id: 'siswa-a', tenant_id: 'tenant-a' },
  ])
  const tenantColumn = db.prepare('PRAGMA table_info(ekskul_anggota)').all().find(column => column.name === 'tenant_id')
  assert.equal(tenantColumn.notnull, 1)
})

test('unik anggota berlaku per tenant dan migrasi idempoten', () => {
  const db = baseDb()
  setupEkskulMembership(db)
  setupEkskulMembership(db)
  db.prepare('INSERT INTO ekskul VALUES (?,?,?)').run('ekskul-a', 'Tahfidz', 'tenant-a')
  db.prepare('INSERT INTO siswa VALUES (?,?,?)').run('siswa-a', 'Ani', 'tenant-a')
  db.prepare('INSERT INTO ekskul_anggota VALUES (?,?,?,?)').run('one', 'ekskul-a', 'siswa-a', 'tenant-a')
  assert.throws(() => db.prepare('INSERT INTO ekskul_anggota VALUES (?,?,?,?)').run('two', 'ekskul-a', 'siswa-a', 'tenant-a'), /UNIQUE constraint failed/)
})
