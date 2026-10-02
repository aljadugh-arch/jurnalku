const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { normalizePiketIds, attachPiketNames, MAKS_GURU_PIKET } = require('../server/jadwal-piket.cjs')

function fixture() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE gtk (id TEXT PRIMARY KEY, nama TEXT, status_kepegawaian TEXT, tenant_id TEXT);
  `)
  db.prepare("INSERT INTO gtk VALUES ('g1','Guru Utama','Tetap','t1')").run()
  db.prepare("INSERT INTO gtk VALUES ('g2','Guru Piket A','Tetap','t1')").run()
  db.prepare("INSERT INTO gtk VALUES ('g3','Guru Piket B','Honorer','t1')").run()
  db.prepare("INSERT INTO gtk VALUES ('g4','Guru Nonaktif','Nonaktif','t1')").run()
  db.prepare("INSERT INTO gtk VALUES ('g9','Guru Tenant Lain','Tetap','t2')").run()
  return db
}

test('normalizePiketIds: menerima hingga 2 guru piket valid', () => {
  const db = fixture()
  const r = normalizePiketIds(db, { gtk_id: 'g1', piket_ids: ['g2', 'g3'], tenant_id: 't1' })
  assert.deepEqual(r.ids, ['g2', 'g3'])
})

test('normalizePiketIds: tolak lebih dari MAKS_GURU_PIKET', () => {
  const db = fixture()
  const r = normalizePiketIds(db, { gtk_id: 'g1', piket_ids: ['g2', 'g3', 'g9'], tenant_id: 't1' })
  assert.match(r.error, new RegExp(String(MAKS_GURU_PIKET)))
})

test('normalizePiketIds: tolak guru utama jadi piket', () => {
  const db = fixture()
  const r = normalizePiketIds(db, { gtk_id: 'g1', piket_ids: ['g1', 'g2'], tenant_id: 't1' })
  assert.match(r.error, /sama dengan guru utama/)
})

test('normalizePiketIds: tolak guru nonaktif / lintas tenant', () => {
  const db = fixture()
  assert.ok(normalizePiketIds(db, { gtk_id: 'g1', piket_ids: ['g4'], tenant_id: 't1' }).error)
  assert.ok(normalizePiketIds(db, { gtk_id: 'g1', piket_ids: ['g9'], tenant_id: 't1' }).error)
})

test('normalizePiketIds: dedupe & kosong aman', () => {
  const db = fixture()
  assert.deepEqual(normalizePiketIds(db, { gtk_id: 'g1', piket_ids: ['g2', 'g2', '', null], tenant_id: 't1' }).ids, ['g2'])
  assert.deepEqual(normalizePiketIds(db, { gtk_id: 'g1', piket_ids: [], tenant_id: 't1' }).ids, [])
  assert.deepEqual(normalizePiketIds(db, { gtk_id: 'g1', piket_ids: undefined, tenant_id: 't1' }).ids, [])
})

test('attachPiketNames: tempel nama + abaikan id tak dikenal', () => {
  const db = fixture()
  const rows = [
    { id: 'j1', guru_piket: JSON.stringify(['g2', 'g3']) },
    { id: 'j2', guru_piket: JSON.stringify(['g4', 'ghost']) },
    { id: 'j3', guru_piket: 'bukan-json' },
    { id: 'j4', guru_piket: null },
  ]
  attachPiketNames(db, rows)
  assert.deepEqual(rows[0].piket, [{ gtk_id: 'g2', nama: 'Guru Piket A' }, { gtk_id: 'g3', nama: 'Guru Piket B' }])
  assert.deepEqual(rows[1].piket, [{ gtk_id: 'g4', nama: 'Guru Nonaktif' }])
  assert.deepEqual(rows[2].piket, [])
  assert.deepEqual(rows[3].piket, [])
})
