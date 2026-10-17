'use strict'
// Normalkan siswa.tanggal_lahir ke ISO YYYY-MM-DD (kanonik untuk <input type="date">,
// impor Excel, sorting, dan perbandingan SQL).
//
// Tampilan DD-MMMM-YYYY ditangani di lapisan UI (formatTanggal), bukan di DB:
// menyimpan "28-Juli-2018" ke DB akan membuat <input type="date"> kosong dan
// tanggal hilang saat disimpan ulang.
//
//   node normalisasi-tanggal-lahir.cjs            -> LAPORAN
//   node normalisasi-tanggal-lahir.cjs --eksekusi -> jalankan
const path = require('node:path')
const Database = require(path.join(__dirname, '..', '..', 'node_modules', 'better-sqlite3'))
const { parseTanggalLahir } = require(path.join(__dirname, '..', 'tanggal-parse.cjs'))

const DB = process.env.JURNALKU_DB || path.join(__dirname, '..', 'jurnalku.db')
const db = new Database(DB)
const EKSEKUSI = process.argv.includes('--eksekusi')
const TARGET_TABEL = process.env.TABEL || 'siswa'

const rows = db.prepare(`SELECT id, nis, nama, tanggal_lahir FROM ${TARGET_TABEL}
  WHERE tanggal_lahir IS NOT NULL AND TRIM(tanggal_lahir) <> ''`).all()

const ubah = [], gagal = [], sudah = []
for (const r of rows) {
  const asli = String(r.tanggal_lahir).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(asli)) { sudah.push(r); continue }
  const iso = parseTanggalLahir(asli)
  if (!iso) { gagal.push({ ...r, asli }); continue }
  ubah.push({ id: r.id, nis: r.nis, nama: r.nama, asli, iso })
}

console.log(`tabel            : ${TARGET_TABEL}`)
console.log(`terisi           : ${rows.length}`)
console.log(`sudah ISO        : ${sudah.length}`)
console.log(`akan dinormalkan : ${ubah.length}`)
console.log(`GAGAL diurai     : ${gagal.length}`)
if (gagal.length) {
  console.log('\n=== TIDAK BISA DIURAI (dibiarkan apa adanya) ===')
  for (const g of gagal) console.log(`  ${g.nis} ${g.nama}: ${JSON.stringify(g.asli)}`)
}

console.log('\n=== SAMPEL PERUBAHAN (25) ===')
for (const u of ubah.slice(0, 25)) console.log(`  ${u.nis.padEnd(8)} ${JSON.stringify(u.asli).padEnd(24)} -> ${u.iso}`)

if (!EKSEKUSI) { console.log('\nLAPORAN SAJA — tambahkan --eksekusi.'); db.close(); process.exit(0) }

console.log('\nMenjalankan transaksi...')
const jalan = db.transaction(() => {
  const st = db.prepare(`UPDATE ${TARGET_TABEL} SET tanggal_lahir=? WHERE id=?`)
  let n = 0
  for (const u of ubah) { st.run(u.iso, u.id); n++ }
  return n
})
const n = jalan()
console.log(`  ${n} baris diperbarui`)

console.log('\n=== VERIFIKASI ===')
const sisa = db.prepare(`SELECT COUNT(*) c FROM ${TARGET_TABEL}
  WHERE tanggal_lahir IS NOT NULL AND TRIM(tanggal_lahir) <> ''
    AND tanggal_lahir NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`).get().c
console.log(`  masih non-ISO   : ${sisa}`)
console.log(`  integritas      : ${db.prepare('PRAGMA integrity_check').get().integrity_check}`)
console.log(`  pelanggaran FK  : ${db.prepare('PRAGMA foreign_key_check').all().length}`)
db.close()
