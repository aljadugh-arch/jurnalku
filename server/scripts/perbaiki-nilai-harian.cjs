#!/usr/bin/env node
'use strict'

// Perbaiki nilai harian yang rusak (di luar 0-100) di database.
//
// Pemakaian:
//   node server/scripts/perbaiki-nilai-harian.cjs --db <path> [--tenant <id>] [--terapkan]
//
// Default = MODE PERIKSA (dry-run): hanya menampilkan rencana, tidak menulis.
// Tambahkan --terapkan untuk benar-benar menyimpan. Selalu backup dulu:
//   cp jurnalku.db jurnalku.db.bak-$(date +%Y%m%d-%H%M%S)

const path = require('node:path')
const Database = require('better-sqlite3')
const { perbaikiNilaiHarian } = require(path.join(__dirname, '..', 'nilai-repair.cjs'))

function arg(nama) {
  const i = process.argv.indexOf(nama)
  return i === -1 ? null : process.argv[i + 1]
}

const dbPath = arg('--db') || path.join(__dirname, '..', 'jurnalku.db')
const tenantId = arg('--tenant')
const terapkan = process.argv.includes('--terapkan')

if (!require('node:fs').existsSync(dbPath)) {
  console.error(`Database tidak ditemukan: ${dbPath}`)
  process.exit(1)
}

const db = new Database(dbPath, { readonly: !terapkan })

const hasil = perbaikiNilaiHarian(db, { tenantId: tenantId || null, terapkan })

console.log(`Database : ${dbPath}`)
console.log(`Tenant   : ${tenantId || '(semua)'}`)
console.log(`Mode     : ${terapkan ? 'TERAPKAN (menulis)' : 'PERIKSA (tidak menulis)'}`)
console.log(`Baris di luar 0-100 ditemukan : ${hasil.ditemukan}`)
console.log(`Baris yang diperbaiki         : ${hasil.diperbaiki}`)
if (hasil.rencana.length) {
  console.log('\nRencana perbaikan:')
  for (const r of hasil.rencana) {
    const kolom = ['pengetahuan', 'keaktifan', 'sikap']
      .filter(k => r.lama[k] !== r.baru[k])
      .map(k => `${k}: ${r.lama[k]} -> ${r.baru[k]}`)
      .join(' | ')
    console.log(`  ${r.tanggal}  ${r.id}  ${kolom}`)
  }
}
if (!terapkan && hasil.diperbaiki > 0) {
  console.log('\nJalankan ulang dengan --terapkan untuk menyimpan (backup dulu).')
}
db.close()
