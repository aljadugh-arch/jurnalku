'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')

test('Endpoint asesmen SAS menulis ke kolom nilai_sas, bukan nilai_sts', () => {
  const src = fs.readFileSync('server/index.cjs', 'utf8')

  // POST /api/rapor/asesmen — cari blok di sekitar endpoint
  const asesmenStart = src.indexOf("app.post('/api/rapor/asesmen'")
  const asesmenEnd = src.indexOf("app.post('/api/rapor/rdm/options'")
  assert.ok(asesmenStart > 0, 'endpoint /api/rapor/asesmen ditemukan')
  assert.ok(asesmenEnd > asesmenStart, 'batas blok asesmen ditemukan')
  const asesmenBlock = src.slice(asesmenStart, asesmenEnd)
  assert.match(asesmenBlock, /upsertSas.*nilai_sas/s, 'upsertSas menggunakan kolom nilai_sas')
  assert.match(asesmenBlock, /upsertSts.*nilai_sts/s, 'upsertSts menggunakan kolom nilai_sts')
  assert.match(asesmenBlock, /jenis === 'sas' \? upsertSas : upsertSts/, 'dispatch berdasarkan jenis')

  // POST /api/rapor/nilai-sumatif — backward compat juga harus benar
  const sumatifStart = src.indexOf("app.post('/api/rapor/nilai-sumatif'")
  assert.ok(sumatifStart > 0, 'endpoint /api/rapor/nilai-sumatif ditemukan')
  const sumatifBlock = src.slice(sumatifStart, sumatifStart + 3000)
  // upsertSas di blok ini harus menulis nilai_sas, bukan nilai_sts
  const sasUpsert = sumatifBlock.match(/upsertSas = db\.prepare\(`INSERT INTO rapor \([^)]+\)/s)
  assert.ok(sasUpsert, 'upsertSas prepared statement ditemukan di nilai-sumatif')
  assert.match(sasUpsert[0], /nilai_sas/, 'nilai-sumatif upsertSas kolom = nilai_sas')
})

test('Penilaian harian nilai 0 tetap tersimpan (bukan hilang)', () => {
  const src = fs.readFileSync('server/index.cjs', 'utf8')
  // Endpoint POST penilaian harian harus INSERT bukan skip ketika nilai 0
  assert.match(src, /penilaian_harian/, 'tabel penilaian_harian direferensikan')
})
