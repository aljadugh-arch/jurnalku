'use strict'
// Kontrak: satu tenant hanya boleh punya SATU socket aktif.
//
// AKAR YANG TERBUKTI (3 Nov 2026): tenant MI Sunan Drajat Bektiharjo (6281515622085)
// mengalami 41.647 konflik "replaced" dalam 24 jam, median tiap 3,3 detik.
// Penyebabnya dua socket dengan kredensial sama saling menendang: tick 2 detik dan
// timer reconnect 10 detik bisa memanggil connect() bersamaan, dan socket lama
// tidak ditutup saat koneksi close. Restart worker menghentikannya seketika
// (konflik 0 dalam 3,5 menit), yang membuktikan penyebabnya di proses ini.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('connect tidak boleh berjalan dobel untuk tenant yang sama', () => {
  const s = baca('server/wa-worker.mjs')
  assert.ok(/const menyambung=new Set\(\)/.test(s), 'harus ada penjaga koneksi berjalan')
  assert.ok(/if\(menyambung\.has\(tenantId\)\)return/.test(s), 'panggilan kedua harus langsung keluar')
  assert.ok(/try\{ return await connectInti\(tenantId\) \} finally \{ menyambung\.delete\(tenantId\) \}/.test(s),
    'penjaga harus dilepas di finally, termasuk saat gagal')
  assert.ok(/async function connectInti\(tenantId\)\{/.test(s), 'badan koneksi dipisah agar penjaga tetap ringkas')
})

test('socket lama ditutup saat koneksi close', () => {
  const s = baca('server/wa-worker.mjs')
  const blok = s.slice(s.indexOf("if(connection==='close')"))
  assert.ok(/try\{ sock\.end\(undefined\) \}catch\{\}/.test(blok.slice(0, 800)),
    'socket yang close harus diakhiri, kalau tidak ia menyambung sendiri dan memicu "replaced"')
})

test('reconnect memakai backoff eksponensial dan berhenti menghantam', () => {
  const s = baca('server/wa-worker.mjs')
  assert.ok(/gagalBerturut/.test(s), 'harus menghitung kegagalan berturut-turut')
  assert.ok(/10000\*Math\.pow\(2,Math\.min\(n-1,5\)\)/.test(s), 'jeda harus tumbuh eksponensial')
  assert.ok(/300000/.test(s), 'jeda dibatasi 5 menit agar tidak menyerah permanen')
  assert.ok(/connection==='open'\)\{gagalBerturut\.delete\(tenantId\)/.test(s),
    'hitungan gagal harus direset setelah koneksi berhasil')
})
