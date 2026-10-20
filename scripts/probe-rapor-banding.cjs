'use strict'
const path = require('path')
const D = require(path.join(__dirname, '..', 'node_modules/better-sqlite3'))
const db = new D(path.join(__dirname, '..', 'server/jurnalku.db'), { readonly: true })
const { computeRaporLive, computeRombelRanking } = require(path.join(__dirname, '..', 'server/rapor-grade-service.cjs'))

const sw = db.prepare("SELECT s.*, r.nama rombel FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id WHERE s.tenant_id='mtsplussd7' AND s.status='aktif' AND s.rombel_id IS NOT NULL LIMIT 1").get()
console.log('SISWA:', sw.nama, '| rombel', sw.rombel, '| rombel_id', sw.rombel_id)

const s = db.prepare("SELECT * FROM settings WHERE tenant_id='mtsplussd7'").get()
console.log('\n--- field yang DICETAK di sampul ---')
console.log(' settings.nama_instansi      :', JSON.stringify(s.nama_instansi), '<-- kolom ADA?', Object.hasOwn(s, 'nama_instansi'))
console.log(' settings.nama_lembaga       :', JSON.stringify(s.nama_lembaga))
console.log(' settings.jenjang            :', JSON.stringify(s.jenjang))
console.log(' settings.yayasan_nama       :', JSON.stringify(s.yayasan_nama))
console.log(' settings.kepala_sekolah     :', JSON.stringify(s.kepala_sekolah))
console.log(' settings.kota_cetak         :', JSON.stringify(s.kota_cetak))

for (const jenis of ['rapor_sts', 'sts', 'rapor_sas']) {
  const live = computeRaporLive(db, { tenantId: 'mtsplussd7', siswaId: sw.id, rombelId: sw.rombel_id, tahunAjaran: '2026/2027', semester: 'ganjil', jenis })
  console.log(`\n--- computeRaporLive jenis=${jenis} ---`)
  console.log(' rows:', live.rows.length, '| jumlah:', live.jumlah, '| rata:', live.rata)
  for (const r of live.rows.slice(0, 12)) console.log('   ', r.mapel_nama || r.mapel || r.mapel_id, '->', r.nilai_akhir ?? r.nilai)
}

const rank = computeRombelRanking(db, { tenantId: 'mtsplussd7', rombelId: sw.rombel_id, tahunAjaran: '2026/2027', semester: 'ganjil', jenis: 'rapor_sts' })
console.log('\n--- ranking live ---')
console.log(' total siswa dgn nilai:', rank.length)
console.log(' posisi siswa ini:', rank.findIndex(r => r.siswa_id === sw.id) + 1)

console.log('\n--- berapa mapel yang benar-benar punya nilai utk siswa ini ---')
for (const t of ['penilaian_harian', 'rapor']) {
  try {
    const rows = db.prepare(`SELECT jenis, COUNT(*) n FROM ${t} WHERE tenant_id='mtsplussd7' AND siswa_id=? GROUP BY jenis`).all(sw.id)
    console.log(` ${t}:`, rows.length ? rows.map(r => `${r.jenis}=${r.n}`).join(', ') : '(kosong)')
  } catch (e) { console.log(` ${t}:`, e.message) }
}
