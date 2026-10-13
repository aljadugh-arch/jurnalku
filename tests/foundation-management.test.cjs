const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const express = require('express')
const { registerTenantRoutes } = require('../server/tenant.cjs')

function fixture() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE foundations (id TEXT PRIMARY KEY, nama TEXT NOT NULL, alamat TEXT, telepon TEXT, email TEXT, logo TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, nama TEXT NOT NULL, domain_custom TEXT, foundation_id TEXT, aktif INTEGER DEFAULT 1);
  `)
  for (const [id, slug, nama] of [['t1', 'l1', 'Lembaga 1'], ['t2', 'l2', 'Lembaga 2'], ['t3', 'l3', 'Lembaga 3']]) {
    db.prepare('INSERT INTO tenants (id, slug, nama) VALUES (?,?,?)').run(id, slug, nama)
  }
  return db
}

function startApp(db, role = 'super_admin') {
  const app = express()
  app.use(express.json())
  const authMiddleware = (req, res, next) => { req.user = { role }; req.tenantId = 'platform'; next() }
  let n = 0
  registerTenantRoutes(app, db, authMiddleware, () => 'uuid-' + (++n), (req, res, next) => next())
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }))
  })
}

test('foundation assignment: super_admin menautkan, memindah, & melepas lembaga', async () => {
  const db = fixture()
  const { server, base } = await startApp(db)
  try {
    // buat yayasan
    let r = await fetch(base + '/api/foundations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nama: 'Yayasan X' }),
    })
    assert.equal(r.status, 200)
    const f = await r.json()
    assert.ok(f.id)

    // tautkan t1 + t2
    r = await fetch(base + `/api/foundations/${f.id}/tenants`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenant_ids: ['t1', 't2'] }),
    })
    assert.equal(r.status, 200)
    assert.equal(db.prepare('SELECT foundation_id FROM tenants WHERE id=?').get('t1').foundation_id, f.id)
    assert.equal(db.prepare('SELECT foundation_id FROM tenants WHERE id=?').get('t2').foundation_id, f.id)
    assert.equal(db.prepare('SELECT foundation_id FROM tenants WHERE id=?').get('t3').foundation_id, null)

    // reassign: hanya t3 (t1 & t2 otomatis dilepas)
    r = await fetch(base + `/api/foundations/${f.id}/tenants`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenant_ids: ['t3'] }),
    })
    assert.equal(r.status, 200)
    assert.equal(db.prepare('SELECT foundation_id FROM tenants WHERE id=?').get('t3').foundation_id, f.id)
    assert.equal(db.prepare('SELECT foundation_id FROM tenants WHERE id=?').get('t1').foundation_id, null)
    assert.equal(db.prepare('SELECT foundation_id FROM tenants WHERE id=?').get('t2').foundation_id, null)

    // hapus yayasan -> semua anggota dilepas (bukan dihapus)
    r = await fetch(base + `/api/foundations/${f.id}`, { method: 'DELETE' })
    assert.equal(r.status, 200)
    assert.equal(db.prepare('SELECT COUNT(*) c FROM foundations').get().c, 0)
    assert.equal(db.prepare('SELECT foundation_id FROM tenants WHERE id=?').get('t3').foundation_id, null)
  } finally {
    server.close()
  }
})

test('foundation assignment: non-super_admin ditolak 403', async () => {
  const db = fixture()
  const { server, base } = await startApp(db, 'admin')
  try {
    const r = await fetch(base + '/api/foundations/fnd-1/tenants', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenant_ids: ['t1'] }),
    })
    assert.equal(r.status, 403)
  } finally {
    server.close()
  }
})
