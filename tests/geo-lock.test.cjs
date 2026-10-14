const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { haversineMeters, validateClassGeo } = require('../server/geo-lock.cjs')

function fixture() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE settings (id TEXT, tenant_id TEXT, geo_latitude REAL, geo_longitude REAL, geo_radius INTEGER);
    CREATE TABLE rombel (id TEXT, tenant_id TEXT, nama TEXT, geo_latitude REAL, geo_longitude REAL, geo_radius INTEGER, geo_lock INTEGER DEFAULT 0);
  `)
  // Sekolah di titik S1 (radius 200m)
  db.prepare('INSERT INTO settings (id,tenant_id,geo_latitude,geo_longitude,geo_radius) VALUES (?,?,?,?,?)').run('main_t1', 't1', -6.9, 112.1, 200)
  // Rombel A: lock aktif, titik kelas T1, radius 50m
  db.prepare('INSERT INTO rombel (id,tenant_id,nama,geo_latitude,geo_longitude,geo_radius,geo_lock) VALUES (?,?,?,?,?,?,?)').run('rA', 't1', 'VII-A', -6.9, 112.1, 50, 1)
  // Rombel B: lock mati
  db.prepare('INSERT INTO rombel (id,tenant_id,nama,geo_latitude,geo_longitude,geo_radius,geo_lock) VALUES (?,?,?,?,?,?,?)').run('rB', 't1', 'VII-B', -6.9, 112.1, 50, 0)
  // Rombel C: lock aktif tapi koordinat kelas kosong -> fallback sekolah
  db.prepare('INSERT INTO rombel (id,tenant_id,nama,geo_latitude,geo_longitude,geo_radius,geo_lock) VALUES (?,?,?,?,?,?,?)').run('rC', 't1', 'VII-C', null, null, 50, 1)
  return db
}

test('haversineMeters: titik sama = 0, ~111km per derajat lintang', () => {
  assert.equal(Math.round(haversineMeters(-6.9, 112.1, -6.9, 112.1)), 0)
  const d = haversineMeters(-6.9, 112.1, -5.9, 112.1)
  assert.ok(d > 110000 && d < 112500, 'd=' + Math.round(d))
})

test('geo-lock rombel: ditolak di luar radius kelas (mis. 300m)', () => {
  const db = fixture()
  // ~300m ke utara (0.0027 derajat lintang)
  const r = validateClassGeo(db, 't1', 'rA', -6.8973, 112.1)
  assert.equal(r.ok, false)
  assert.equal(r.scope, undefined)
  assert.match(r.error, /di luar area kelas/i)
  assert.ok(r.distance > 50)
})

test('geo-lock rombel: diterima di dalam radius kelas (mis. 20m)', () => {
  const db = fixture()
  const r = validateClassGeo(db, 't1', 'rA', -6.8998, 112.1) // ~22m
  assert.equal(r.ok, true)
  assert.equal(r.scope, 'rombel')
})

test('rombel tanpa lock -> tidak ada penegakan (perilaku lama, scope none)', () => {
  const db = fixture()
  // Lock mati: walau jauh (400m), tidak ditolak — guru tidak terkunci.
  const r = validateClassGeo(db, 't1', 'rB', -6.8964, 112.1)
  assert.equal(r.ok, true)
  assert.equal(r.scope, 'none')
})

test('lock aktif tapi koordinat kelas kosong -> fallback sekolah', () => {
  const db = fixture()
  const r = validateClassGeo(db, 't1', 'rC', -6.8998, 112.1)
  assert.equal(r.ok, true)
  assert.equal(r.scope, 'sekolah')
})

test('lokasi tidak terbaca -> ditolak 400', () => {
  const db = fixture()
  const r = validateClassGeo(db, 't1', 'rA', undefined, undefined)
  assert.equal(r.ok, false)
  assert.equal(r.status, 400)
  assert.match(r.error, /tidak terbaca/i)
})

test('tanpa geofence sama sekali -> lolos (scope none)', () => {
  const db = fixture()
  db.prepare('UPDATE settings SET geo_latitude=NULL, geo_longitude=NULL WHERE tenant_id=?').run('t1')
  const r = validateClassGeo(db, 't1', 'rB', -6.0, 112.0)
  assert.equal(r.ok, true)
  assert.equal(r.scope, 'none')
})
