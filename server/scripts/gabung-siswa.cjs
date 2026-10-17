'use strict'
// Gabungkan dua baris siswa duplikat: pertahankan satu, pindahkan semua datanya.
//
// Jalankan DI VPS (akses langsung SQLite):
//   node server/scripts/gabung-siswa.cjs --nis-pertahankan 260239 --nis-hapus 260241
//   node server/scripts/gabung-siswa.cjs --nis-pertahankan 260239 --nis-hapus 260241 --eksekusi
//
// Tanpa --eksekusi hanya LAPORAN.
//
// Yang dilakukan, dalam satu transaksi:
//   1. absensi_siswa    : pindahkan tanggal unik; tanggal kembar DIGABUNG per kolom
//                         (waktu_masuk/waktu_pulang sering hanya ada di baris yang dihapus)
//   2. absensi_mapel    : sama, kunci (jadwal_id, tanggal)
//   3. absensi_kegiatan : sama, kunci (kegiatan_id, tanggal)
//   4. qr_siswa_identifiers : pindahkan SEMUA token (QR lama masih di kartu siswa)
//   5. notification_activity.entity_id : pindahkan jejak
//   6. user_students + users : hapus milik baris yang dihapus
//   7. siswa : terakhir (FK NO ACTION -> gagal kalau anak masih ada)
const path = require('node:path')
const Database = require(path.join(__dirname, '..', '..', 'node_modules', 'better-sqlite3'))

const argv = process.argv.slice(2)
const ambil = (nama) => { const i = argv.indexOf(nama); return i >= 0 ? argv[i + 1] : null }
const NIS_A = ambil('--nis-pertahankan')
const NIS_B = ambil('--nis-hapus')
const EKSEKUSI = argv.includes('--eksekusi')

if (!NIS_A || !NIS_B) {
  console.error('Pakai: --nis-pertahankan <NIS> --nis-hapus <NIS> [--eksekusi]')
  process.exit(1)
}

const DB = process.env.JURNALKU_DB || path.join(__dirname, '..', 'jurnalku.db')
const db = new Database(DB)
const q = (s, ...a) => db.prepare(s).all(...a)
const satu = (s, ...a) => db.prepare(s).get(...a)

const A = satu('SELECT * FROM siswa WHERE nis=?', NIS_A)
const B = satu('SELECT * FROM siswa WHERE nis=?', NIS_B)
if (!A || !B) { console.error('SISWA TIDAK DITEMUKAN — batal.'); process.exit(1) }
if (A.tenant_id !== B.tenant_id) { console.error('BEDA TENANT — batal.'); process.exit(1) }

console.log(`DIPERTAHANKAN : ${A.nis} ${A.nama} (${A.id})`)
console.log(`DIHAPUS       : ${B.nis} ${B.nama} (${B.id})`)
console.log(`MODE          : ${EKSEKUSI ? 'EKSEKUSI' : 'LAPORAN'}\n`)

const kosong = v => v === null || v === undefined || v === ''

// Rencana per tabel anak. kunci = kolom pembentuk identitas baris.
const rencana = [
  { tabel: 'absensi_siswa', kunci: ['tanggal'], kolomGabung: ['rombel_id', 'jam_ke', 'status', 'metode', 'keterangan', 'waktu_absen', 'waktu_masuk', 'waktu_pulang', 'status_pulang', 'keterangan_pulang'] },
  { tabel: 'absensi_mapel', kunci: ['jadwal_id', 'tanggal'], kolomGabung: ['rombel_id', 'mapel_id', 'guru_id', 'status', 'keterangan'] },
  { tabel: 'absensi_kegiatan', kunci: ['kegiatan_id', 'tanggal'], kolomGabung: ['status', 'keterangan'] },
]

const kerja = []
for (const r of rencana) {
  const barisA = q(`SELECT * FROM ${r.tabel} WHERE siswa_id=?`, A.id)
  const barisB = q(`SELECT * FROM ${r.tabel} WHERE siswa_id=?`, B.id)
  const petaA = new Map(barisA.map(x => [r.kunci.map(k => x[k]).join('#'), x]))
  const pindah = [], gabung = []
  for (const b of barisB) {
    const a = petaA.get(r.kunci.map(k => b[k]).join('#'))
    if (!a) { pindah.push(b); continue }
    const isi = {}
    for (const k of r.kolomGabung) if (kosong(a[k]) && !kosong(b[k])) isi[k] = b[k]
    gabung.push({ idA: a.id, idB: b.id, isi })
  }
  kerja.push({ ...r, pindah, gabung, totalB: barisB.length })
}

console.log('=== RENCANA ===')
for (const k of kerja) {
  console.log(`  ${k.tabel.padEnd(18)} pindah=${String(k.pindah.length).padStart(3)}  gabung=${String(k.gabung.length).padStart(3)}  (total baris dihapus=${k.totalB})`)
  const ada = k.gabung.filter(g => Object.keys(g.isi).length)
  if (ada.length) console.log(`    ${ada.length} baris kembar punya data yang HANYA ada di baris yang dihapus (akan disalin)`)
}
const qr = q('SELECT token FROM qr_siswa_identifiers WHERE siswa_id=?', B.id)
const userB = q('SELECT email FROM users WHERE siswa_id=?', B.id)
console.log(`  qr_identifiers     pindah=${qr.length} (${qr.map(x => x.token).join(', ')})`)
console.log(`  users              hapus=${userB.length} (${userB.map(x => x.email).join(', ')})`)

if (!EKSEKUSI) { console.log('\nLAPORAN SAJA — tambahkan --eksekusi.'); db.close(); process.exit(0) }

console.log('\nMenjalankan transaksi...')
const jalan = db.transaction(() => {
  let nPindah = 0, nGabung = 0
  for (const k of kerja) {
    const stPindah = db.prepare(`UPDATE ${k.tabel} SET siswa_id=? WHERE id=?`)
    const stHapus = db.prepare(`DELETE FROM ${k.tabel} WHERE id=?`)
    const bacaA = k.kolomGabung.length ? db.prepare(`SELECT ${k.kolomGabung.join(',')} FROM ${k.tabel} WHERE id=?`) : null
    const stUpdate = k.kolomGabung.length ? db.prepare(`UPDATE ${k.tabel} SET ${k.kolomGabung.map(c => c + '=?').join(', ')} WHERE id=?`) : null
    for (const b of k.pindah) { stPindah.run(A.id, b.id); nPindah++ }
    for (const g of k.gabung) {
      if (Object.keys(g.isi).length && stUpdate) {
        const asli = bacaA.get(g.idA)
        stUpdate.run(...k.kolomGabung.map(c => (c in g.isi ? g.isi[c] : asli[c])), g.idA)
      }
      stHapus.run(g.idB); nGabung++
    }
  }
  db.prepare('UPDATE qr_siswa_identifiers SET siswa_id=? WHERE siswa_id=?').run(A.id, B.id)
  db.prepare('UPDATE notification_activity SET entity_id=? WHERE entity_id=?').run(A.id, B.id)
  db.prepare('DELETE FROM user_students WHERE student_id=?').run(B.id)
  db.prepare('DELETE FROM users WHERE siswa_id=?').run(B.id)
  const del = db.prepare('DELETE FROM siswa WHERE id=?').run(B.id)
  if (del.changes !== 1) throw new Error('penghapusan siswa gagal')
  return { nPindah, nGabung }
})
const h = jalan()
console.log(`  dipindahkan: ${h.nPindah} baris | dikembar-gabung: ${h.nGabung} baris`)

console.log('\n=== VERIFIKASI ===')
for (const k of kerja) {
  const sisa = satu(`SELECT COUNT(*) c FROM ${k.tabel} WHERE siswa_id=?`, B.id).c
  const punyaA = satu(`SELECT COUNT(*) c FROM ${k.tabel} WHERE siswa_id=?`, A.id).c
  console.log(`  ${k.tabel.padEnd(18)} sisa merujuk baris dihapus=${sisa} (harus 0) | milik baris dipertahankan=${punyaA}`)
}
console.log('  pelanggaran FK:', q('PRAGMA foreign_key_check').length, '(harus 0)')
console.log('  integritas    :', satu('PRAGMA integrity_check').integrity_check)
db.close()
