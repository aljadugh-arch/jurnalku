const test = require('node:test')
const assert = require('node:assert/strict')
const zlib = require('node:zlib')
const Database = require('better-sqlite3')
const { createService } = require('../server/backup-restore.cjs')

function database() {
  const db = new Database(':memory:')
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE tenants (id TEXT PRIMARY KEY, nama TEXT NOT NULL);
    CREATE TABLE settings (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, nama_lembaga TEXT, password TEXT);
    INSERT INTO tenants(id,nama) VALUES ('target-tenant','Target');
  `)
  return db
}

test('Google Drive json.gz legacy backup is accepted and remapped to current tenant', () => {
  const db = database()
  db.prepare('UPDATE tenants SET id=? WHERE id=?').run('mtsplussd7', 'target-tenant')
  const service = createService(db)
  const legacy = {
    tenant_id: 'old-tenant-id',
    slug: 'mts-plus-sunan-drajat-7-palang',
    exported_at: '2026-08-24T00:00:00.000Z',
    data: {
      settings: [{ id: 'settings-old', tenant_id: 'old-tenant-id', nama_lembaga: 'Sekolah Lama', password: 'must-not-import' }],
      users: [{ id: 'legacy-admin', tenant_id: 'old-tenant-id', email: 'old@example.test', password: 'secret' }],
      wa_gateway_config: [{ id: 'wa-old', tenant_id: 'old-tenant-id', token: 'secret' }],
    },
  }
  const file = zlib.gzipSync(Buffer.from(JSON.stringify(legacy)))

  const artifact = service.parseArtifact('mtsplussd7', file)
  const preview = service.preview('mtsplussd7', artifact)

  assert.equal(artifact.manifest.format, 'jurnalku-tenant-backup')
  assert.equal(artifact.manifest.tenant.id, 'mtsplussd7')
  assert.deepEqual(Object.keys(artifact.tables), ['settings'])
  assert.equal(artifact.tables.settings[0].tenant_id, 'mtsplussd7')
  assert.equal('password' in artifact.tables.settings[0], false)
  assert.equal(preview.total, 1)
})

test('plain extracted legacy JSON is accepted too', () => {
  const db = database()
  db.prepare('UPDATE tenants SET id=? WHERE id=?').run('mimifdangimbang', 'target-tenant')
  const service = createService(db)
  const file = Buffer.from(JSON.stringify({
    tenant_id: 'old-tenant-id',
    slug: 'mi-miftahul-huda-ngimbang',
    data: { settings: [{ id: 'settings-old', tenant_id: 'old-tenant-id', nama_lembaga: 'Sekolah Lama' }] },
  }))

  const artifact = service.parseArtifact('mimifdangimbang', file)
  assert.equal(service.preview('mimifdangimbang', artifact).valid, true)
})

test('legacy Google Drive backup cannot be uploaded to the wrong tenant', () => {
  const db = database()
  db.prepare('UPDATE tenants SET id=? WHERE id=?').run('mimifdangimbang', 'target-tenant')
  const service = createService(db)
  const file = Buffer.from(JSON.stringify({
    tenant_id: 'old-tenant-id',
    slug: 'mts-plus-sunan-drajat-7-palang',
    data: { settings: [{ id: 'settings-old', tenant_id: 'old-tenant-id', nama_lembaga: 'Sekolah Lama' }] },
  }))

  assert.throws(() => service.parseArtifact('mimifdangimbang', file), /bukan milik tenant tujuan/)
})
