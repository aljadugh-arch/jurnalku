'use strict'
// Kontrak: kesalahan INPUT tidak boleh dilaporkan sebagai 500.
// NOT NULL = kolom wajib belum diisi -> 400 dengan pesan manusiawi.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const SUMBER = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')

test('error handler menangani NOT NULL sebagai 400, bukan 500', () => {
  assert.match(SUMBER, /SQLITE_CONSTRAINT_NOTNULL/, 'harus mendeteksi kode NOT NULL')
  assert.match(SUMBER, /NOT NULL constraint failed/i, 'harus punya cadangan deteksi via pesan')
  // Blok NOT NULL harus muncul SEBELUM fallback 500.
  const iNotNull = SUMBER.indexOf('SQLITE_CONSTRAINT_NOTNULL')
  const i500 = SUMBER.lastIndexOf("status(500).json({ error: 'Terjadi kesalahan server")
  assert.ok(iNotNull > 0 && i500 > 0, 'kedua blok harus ada')
  assert.ok(iNotNull < i500, 'penanganan NOT NULL harus dievaluasi sebelum fallback 500')
})

test('pesan NOT NULL menyebut nama kolom yang bisa dibaca manusia', () => {
  assert.match(SUMBER, /LABEL_KOLOM_WAJIB/, 'harus ada peta label kolom')
  assert.match(SUMBER, /Kolom wajib belum diisi/, 'pesan harus jelas')
  // Label penting harus terdaftar.
  for (const k of ['nis', 'nama', 'kode', 'tanggal', 'siswa_id', 'gtk_id']) {
    assert.match(SUMBER, new RegExp(`\\b${k}:\\s*'`), `label untuk ${k} harus ada`)
  }
})

test('LABEL_KOLOM_WAJIB dideklarasikan SEBELUM dipakai (const tidak hoisted)', () => {
  const iDeklarasi = SUMBER.indexOf('const LABEL_KOLOM_WAJIB')
  const iPemakaian = SUMBER.indexOf('LABEL_KOLOM_WAJIB[kolom]')
  assert.ok(iDeklarasi > 0, 'deklarasi harus ada')
  assert.ok(iPemakaian > 0, 'pemakaian harus ada')
  assert.ok(iDeklarasi < iPemakaian, 'deklarasi harus lebih awal dari pemakaian')
})

test('respons NOT NULL menyertakan field yang bermasalah', () => {
  assert.match(SUMBER, /field:\s*kolom/, 'klien perlu tahu kolom mana yang kosong')
})

test('penanganan duplikat & foreign key tetap ada (tidak tertimpa)', () => {
  assert.match(SUMBER, /SQLITE_CONSTRAINT_UNIQUE/)
  assert.match(SUMBER, /SQLITE_CONSTRAINT_FOREIGNKEY/)
})
