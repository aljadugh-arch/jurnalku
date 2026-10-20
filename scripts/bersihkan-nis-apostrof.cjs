'use strict'
// Pembersih apostrof NIS/NISN — MODE LAPORAN (default) atau --terapkan.
//
// Latar: impor Excel menyimpan `'111235230232220024` karena Excel menambahkan
// apostrof agar angka panjang dibaca sebagai teks. Akibatnya pencarian NIS,
// ekspor, dan pencocokan Dapodik gagal untuk baris tersebut.
//
// Tanpa --terapkan: hanya membaca dan melaporkan (tidak menulis apa pun).
// Dengan --terapkan: menulis dalam satu transaksi + mencadangkan baris lama.
const path = require('path')
const fs = require('fs')
const Database = require(path.join(__dirname, '..', 'node_modules/better-sqlite3'))

const TERAPKAN = process.argv.includes('--terapkan')
const DB = path.join(__dirname, '..', 'server/jurnalku.db')
const db = new Database(DB)

const bersih = (v) => String(v ?? '')
  .replace(/^['\u2018\u2019\u02BC\u0060]+/, '')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .trim()

const baris = db.prepare(
  "SELECT id, tenant_id, nama, nis, nisn FROM siswa WHERE nis LIKE '''%' OR nisn LIKE '''%' OR nis LIKE '‘%' OR nis LIKE '’%' ORDER BY tenant_id, nama"
).all()

console.log(`DB: ${DB}`)
console.log(`Mode: ${TERAPKAN ? 'TERAPKAN (menulis)' : 'LAPORAN (tidak menulis)'}`)
console.log(`Baris perlu dibersihkan: ${baris.length}\n`)

if (!baris.length) {
  console.log('Tidak ada yang perlu dibersihkan.')
  process.exit(0)
}

const rencana = []
for (const r of baris) {
  const nisBaru = bersih(r.nis)
  const nisnBaru = bersih(r.nisn)
  // Cek tabrakan: NIS bersih tidak boleh sudah dipakai siswa lain di tenant sama.
  const bentrok = nisBaru && db.prepare('SELECT id, nama FROM siswa WHERE tenant_id=? AND nis=? AND id<>?').get(r.tenant_id, nisBaru, r.id)
  rencana.push({ ...r, nisBaru, nisnBaru, bentrok })
  console.log(`  ${r.nama}`)
  console.log(`    tenant : ${r.tenant_id}`)
  console.log(`    nis    : ${JSON.stringify(r.nis)}  ->  ${JSON.stringify(nisBaru)}${bentrok ? `   ⚠ BENTROK dengan ${bentrok.nama}` : ''}`)
  console.log(`    nisn   : ${JSON.stringify(r.nisn)}  ->  ${JSON.stringify(nisnBaru)}`)
}

const aman = rencana.filter(r => !r.bentrok)
const bentrok = rencana.filter(r => r.bentrok)
console.log(`\nAman diperbaiki: ${aman.length}   Bentrok (dilewati): ${bentrok.length}`)

if (!TERAPKAN) {
  console.log('\nTidak ada perubahan ditulis. Jalankan dengan --terapkan untuk membersihkan.')
  process.exit(0)
}

const cadangan = path.join(__dirname, '..', 'logs', `cadangan-nis-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
fs.mkdirSync(path.dirname(cadangan), { recursive: true })
fs.writeFileSync(cadangan, JSON.stringify(aman.map(r => ({ id: r.id, tenant_id: r.tenant_id, nama: r.nama, nis: r.nis, nisn: r.nisn })), null, 2))
console.log(`\nCadangan: ${cadangan}`)

const tx = db.transaction(() => {
  const upd = db.prepare('UPDATE siswa SET nis=?, nisn=? WHERE id=? AND tenant_id=?')
  for (const r of aman) upd.run(r.nisBaru, r.nisnBaru, r.id, r.tenant_id)
})
tx()
console.log(`Selesai. ${aman.length} baris diperbarui.`)
