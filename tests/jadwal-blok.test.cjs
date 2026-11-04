'use strict'
// Blok jam: mapel JTM 2 tersimpan sebagai dua baris jadwal berurutan. Guru harus
// cukup memindai QR, mengisi jurnal, dan mengabsen SEKALI untuk seluruh blok.
const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const Database = require('better-sqlite3')
const { blokDariJadwal, blokDariId } = require('../server/jadwal-block.cjs')

function dbUji() {
  const db = new Database(path.join(os.tmpdir(), `blok-${process.pid}-${Date.now()}-${Math.random()}.db`))
  db.exec(`CREATE TABLE jadwal(
    id TEXT PRIMARY KEY, tenant_id TEXT, gtk_id TEXT, mapel_id TEXT, rombel_id TEXT,
    hari TEXT, jam_mulai TEXT, jam_selesai TEXT, ruangan TEXT, jenis_kegiatan TEXT, nama_kegiatan TEXT)`)
  return db
}

function isi(db, baris) {
  const ins = db.prepare(`INSERT INTO jadwal(id,tenant_id,gtk_id,mapel_id,rombel_id,hari,jam_mulai,jam_selesai,ruangan,jenis_kegiatan)
    VALUES (?,?,?,?,?,?,?,?,'R1','mapel')`)
  for (const b of baris) ins.run(b.id, 't1', 'g1', b.mapel || 'm1', b.rombel || 'r1', 'senin', b.mulai, b.selesai)
}

test('dua jam berurutan pada mapel & rombel sama menjadi satu blok', () => {
  const db = dbUji()
  isi(db, [
    { id: 'j1', mulai: '07:30', selesai: '08:10' },
    { id: 'j2', mulai: '08:10', selesai: '08:50' },
  ])
  assert.deepEqual(blokDariId(db, 't1', 'j2').blok.map(b => b.id), ['j1', 'j2'])
  assert.deepEqual(blokDariJadwal(db, db.prepare('SELECT * FROM jadwal WHERE id=?').get('j1')).map(b => b.id), ['j1', 'j2'])
  db.close()
})

test('jeda/istirahat memutus blok', () => {
  const db = dbUji()
  isi(db, [
    { id: 'a', mulai: '07:30', selesai: '08:10' },
    { id: 'b', mulai: '08:20', selesai: '09:00' }, // ada jeda 10 menit
  ])
  assert.deepEqual(blokDariId(db, 't1', 'a').blok.map(x => x.id), ['a'])
  db.close()
})

test('mapel atau rombel berbeda tidak ikut tergabung', () => {
  const db = dbUji()
  isi(db, [
    { id: 'x1', mulai: '07:30', selesai: '08:10', mapel: 'm1', rombel: 'r1' },
    { id: 'x2', mulai: '08:10', selesai: '08:50', mapel: 'm2', rombel: 'r1' },
    { id: 'x3', mulai: '08:50', selesai: '09:30', mapel: 'm1', rombel: 'r2' },
  ])
  assert.deepEqual(blokDariId(db, 't1', 'x1').blok.map(x => x.id), ['x1'])
  db.close()
})

test('tiga jam berurutan (JTM 3) tergabung utuh', () => {
  const db = dbUji()
  isi(db, [
    { id: 'y1', mulai: '09:30', selesai: '10:10' },
    { id: 'y2', mulai: '10:10', selesai: '10:50' },
    { id: 'y3', mulai: '10:50', selesai: '11:30' },
  ])
  const blok = blokDariId(db, 't1', 'y2').blok
  assert.deepEqual(blok.map(x => x.id), ['y1', 'y2', 'y3'])
  assert.equal(blok[0].jam_mulai, '09:30')
  assert.equal(blok[blok.length - 1].jam_selesai, '11:30')
  db.close()
})
