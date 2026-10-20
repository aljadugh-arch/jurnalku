'use strict'
// Regresi: OTP gagal karena format nomor di DB berbeda dengan yang diketik.
//
// Bug nyata: `no_hp` tersimpan sebagai "085730086624" (awalan 0), sedangkan
// klien mengirim "6285730086624" (awalan 62). Query lama membandingkan kolom
// mentah dengan bentuk 62, sehingga TIDAK PERNAH cocok — OTP selalu ditolak
// dengan balasan generik, dan wali menunggu kode yang tidak pernah dikirim.
const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const Database = require(path.join(__dirname, '..', 'node_modules/better-sqlite3'))

const otp = require(path.join(__dirname, '..', 'server/otp-login.cjs'))

// Fungsi internal tidak diekspor; uji lewat perilaku SQL yang sama.
function cariSiswa(db, nomor) {
  const varian = new Set([nomor])
  if (nomor.startsWith('62')) varian.add('0' + nomor.slice(2))
  const kolom = `REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(no_hp,''),' ',''),'-',''),'+',''),'.','')`
  const kolom62 = `CASE WHEN ${kolom} LIKE '0%' THEN '62' || SUBSTR(${kolom},2) ELSE ${kolom} END`
  const tanda = [...varian].map(() => '?').join(',')
  return db.prepare(`SELECT id,nama FROM siswa WHERE tenant_id=? AND COALESCE(status,'aktif')='aktif'
    AND ${kolom62} IN (${tanda})
    AND LENGTH(${kolom62}) BETWEEN 12 AND 14 AND SUBSTR(${kolom62},1,3)='628'`).all('t', ...varian)
}

function dbUji() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE siswa(id TEXT, tenant_id TEXT, nama TEXT, no_hp TEXT, status TEXT)`)
  db.prepare('INSERT INTO siswa VALUES(?,?,?,?,?)').run('1', 't', 'Budi', '085730086624', 'aktif')
  db.prepare('INSERT INTO siswa VALUES(?,?,?,?,?)').run('2', 't', 'Sari', '+6281234567890', 'aktif')
  db.prepare('INSERT INTO siswa VALUES(?,?,?,?,?)').run('3', 't', 'Cacat', '0857404929', 'aktif')
  return db
}

test('nomor 08.. di DB cocok dengan input 628..', () => {
  const db = dbUji()
  const r = cariSiswa(db, '6285730086624')
  assert.strictEqual(r.length, 1, 'harus menemukan Budi')
  assert.strictEqual(r[0].nama, 'Budi')
})

test('nomor +628.. di DB cocok dengan input 628..', () => {
  const db = dbUji()
  const r = cariSiswa(db, '6281234567890')
  assert.strictEqual(r.length, 1, 'harus menemukan Sari')
  assert.strictEqual(r[0].nama, 'Sari')
})

test('nomor cacat (kurang digit) TIDAK dianggap terdaftar', () => {
  const db = dbUji()
  const r = cariSiswa(db, '62857404929')
  assert.strictEqual(r.length, 0, 'nomor 10 digit tidak boleh dianggap terdaftar')
})

test('normalNomor menerima tiga format penulisan', () => {
  assert.strictEqual(otp.normalNomor('085730086624'), '6285730086624')
  assert.strictEqual(otp.normalNomor('+62 857-3008-6624'), '6285730086624')
  assert.strictEqual(otp.normalNomor('6285730086624'), '6285730086624')
})
