const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { migrateRaporUniqueIndex, DDL_RAPOR_UNIQUE } = require('../server/rapor-unique-index.cjs')

const buatDb = (ddlIndex) => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE rapor (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, siswa_id TEXT NOT NULL, mapel_id TEXT NOT NULL,
    tahun_ajaran TEXT, semester TEXT, jenis TEXT, nilai INTEGER DEFAULT 0
  )`)
  if (ddlIndex) db.exec(ddlIndex)
  return db
}

const definisiIndex = (db) =>
  db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_rapor_unique'").get()?.sql || null

test('index rapor lama yang tidak tenant-scoped diganti menjadi tenant-scoped', () => {
  const db = buatDb('CREATE UNIQUE INDEX idx_rapor_unique ON rapor(siswa_id, mapel_id, tahun_ajaran, semester, jenis)')
  assert.notEqual((definisiIndex(db) || '').includes('tenant_id'), true, 'prasyarat: index lama belum tenant-scoped')

  assert.equal(migrateRaporUniqueIndex(db), true)
  assert.equal(definisiIndex(db), DDL_RAPOR_UNIQUE)
  // index pengganti tetap unik per tenant
  db.prepare(`INSERT INTO rapor (id,tenant_id,siswa_id,mapel_id,tahun_ajaran,semester,jenis)
    VALUES ('a','t1','s1','m1','2025/2026','1','rapor')`).run()
  assert.throws(() => db.prepare(`INSERT INTO rapor (id,tenant_id,siswa_id,mapel_id,tahun_ajaran,semester,jenis)
    VALUES ('b','t1','s1','m1','2025/2026','1','rapor')`).run().catch(e => { throw e }))
  // tenant lain boleh punya baris dengan kunci yang sama
  assert.doesNotThrow(() => db.prepare(`INSERT INTO rapor (id,tenant_id,siswa_id,mapel_id,tahun_ajaran,semester,jenis)
    VALUES ('c','t2','s1','m1','2025/2026','1','rapor')`).run())
  db.close()
})

test('definisi index yang sudah benar tidak dibangun ulang', () => {
  const db = buatDb(DDL_RAPOR_UNIQUE)
  const sebelum = definisiIndex(db)
  const rootpage = db.prepare("SELECT rootpage FROM sqlite_master WHERE name='idx_rapor_unique'").get().rootpage

  assert.equal(migrateRaporUniqueIndex(db), false) // no-op
  assert.equal(definisiIndex(db), sebelum)
  assert.equal(db.prepare("SELECT rootpage FROM sqlite_master WHERE name='idx_rapor_unique'").get().rootpage, rootpage)
  db.close()
})

test('duplikat rapor membuat migrasi berhenti tanpa menghapus index lama', () => {
  const db = buatDb('CREATE INDEX idx_rapor_unique ON rapor(siswa_id, mapel_id, tahun_ajaran, semester, jenis)')
  const sebelum = definisiIndex(db)
  const isi = { tenant_id: 't1', siswa_id: 's1', mapel_id: 'm1', tahun_ajaran: '2025/2026', semester: '1', jenis: 'rapor' }
  const ins = db.prepare(`INSERT INTO rapor (id,tenant_id,siswa_id,mapel_id,tahun_ajaran,semester,jenis) VALUES (?,?,?,?,?,?,?)`)
  ins.run('a', isi.tenant_id, isi.siswa_id, isi.mapel_id, isi.tahun_ajaran, isi.semester, isi.jenis)
  ins.run('b', isi.tenant_id, isi.siswa_id, isi.mapel_id, isi.tahun_ajaran, isi.semester, isi.jenis)

  assert.throws(() => migrateRaporUniqueIndex(db), /duplikat rapor/)
  assert.equal(definisiIndex(db), sebelum, 'index lama harus dibiarkan apa adanya saat migrasi gagal')
  assert.equal(db.prepare('SELECT COUNT(*) c FROM rapor').get().c, 2)
  db.close()
})
