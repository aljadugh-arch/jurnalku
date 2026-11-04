'use strict'
// Pulihkan sesi kelas yang jadwalnya sudah tidak ada.
//
// Dua langkah, berurutan:
//   1. Bila ada baris jadwal lain yang cocok (tenant+guru+mapel+rombel+hari dan
//      jam mulai berdekatan), sesi diarahkan ke baris itu — tidak membuat data baru.
//   2. Bila tidak ada, dibuat satu baris jadwal pengganti dari data sesi
//      (jam mulai = waktu_masuk, jam selesai = waktu_selesai atau +40 menit).
//
// Pemakaian: node scripts/pulihkan-sesi-yatim.cjs [--apply]
// Tanpa --apply hanya melaporkan rencana.

const fs = require('fs')
const crypto = require('crypto')
const Database = require('better-sqlite3')

const TERAPKAN = process.argv.includes('--apply')
// Membuat baris jadwal baru HANYA dengan izin eksplisit: tabel jadwal bersifat
// berulang per hari (bukan per tanggal), sehingga baris baru akan ikut muncul di
// jadwal mingguan guru saat ini. Untuk data sejarah, itu justru merusak jadwal.
const BUAT_BARU = process.argv.includes('--buat-baru')
const DB = process.env.DB || '/www/wwwroot/jurnal.cc.cd/server/jurnalku.db'
const db = new Database(DB)
const HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']

const yatim = db.prepare(`SELECT s.* FROM sesi_kelas_guru s
  LEFT JOIN jadwal j ON j.id=s.jadwal_id AND j.tenant_id=s.tenant_id
  WHERE j.id IS NULL ORDER BY s.tanggal`).all()

const hariDari = (tgl) => {
  const d = new Date(`${tgl}T12:00:00+07:00`)
  return Number.isNaN(d.getTime()) ? null : HARI[d.getDay()]
}
const menit = (hm) => { const [h, m] = String(hm || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0) }
const jam = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

const rencana = []
for (const s of yatim) {
  const hari = hariDari(s.tanggal)
  const mulai = s.waktu_masuk || '07:00'
  // Sesi tanpa jam selesai (atau selesai <= mulai) diberi durasi satu jam pelajaran.
  const selesai = (s.waktu_selesai && menit(s.waktu_selesai) > menit(mulai)) ? s.waktu_selesai : jam(menit(mulai) + 40)
  const kandidat = db.prepare(`SELECT * FROM jadwal
    WHERE tenant_id=? AND gtk_id=? AND mapel_id=? AND rombel_id=? AND lower(hari)=?
      AND COALESCE(jenis_kegiatan,'mapel')='mapel'
    ORDER BY jam_mulai`).all(s.tenant_id, s.guru_id, s.mapel_id, s.rombel_id, hari)
  const cocok = kandidat.find(j => Math.abs(menit(j.jam_mulai) - menit(mulai)) <= 90)
  rencana.push({ sesi: s, hari, mulai, selesai, jadwal_cocok: cocok || null })
}

console.log(`sesi yatim: ${yatim.length}`)
console.log(`  bisa dipulihkan ke jadwal yang ada : ${rencana.filter(r => r.jadwal_cocok).length}`)
console.log(`  perlu dibuatkan jadwal baru        : ${rencana.filter(r => !r.jadwal_cocok).length}`)
for (const r of rencana.slice(0, 6)) {
  console.log(`  ${r.sesi.tanggal} ${r.hari} ${r.mulai}-${r.selesai} -> ${r.jadwal_cocok ? 'relink ' + r.jadwal_cocok.id.slice(0, 8) : 'buat baru'}`)
}

if (!TERAPKAN) {
  console.log('\n(dry-run — jalankan dengan --apply untuk menerapkan)')
  process.exit(0)
}

const arsip = { waktu: new Date().toISOString(), relink: [], buat: [], dilewati: [] }
const tx = db.transaction(() => {
  const insertJadwal = db.prepare(`INSERT INTO jadwal
    (id,tenant_id,gtk_id,mapel_id,rombel_id,hari,jam_mulai,jam_selesai,ruangan,jenis_kegiatan,nama_kegiatan)
    VALUES (?,?,?,?,?,?,?,?,'','mapel','')`)
  const updateSesi = db.prepare('UPDATE sesi_kelas_guru SET jadwal_id=?, updated_at=datetime(\'now\') WHERE id=?')

  for (const r of rencana) {
    if (r.jadwal_cocok) {
      updateSesi.run(r.jadwal_cocok.id, r.sesi.id)
      arsip.relink.push({ sesi_id: r.sesi.id, dari: r.sesi.jadwal_id, ke: r.jadwal_cocok.id, tanggal: r.sesi.tanggal })
    } else if (BUAT_BARU) {
      const id = crypto.randomUUID()
      insertJadwal.run(id, r.sesi.tenant_id, r.sesi.guru_id, r.sesi.mapel_id, r.sesi.rombel_id, r.hari, r.mulai, r.selesai)
      updateSesi.run(id, r.sesi.id)
      arsip.buat.push({ sesi_id: r.sesi.id, jadwal_baru: id, tenant_id: r.sesi.tenant_id, tanggal: r.sesi.tanggal, hari: r.hari, jam_mulai: r.mulai, jam_selesai: r.selesai })
    } else {
      arsip.dilewati.push({ sesi_id: r.sesi.id, tanggal: r.sesi.tanggal, alasan: 'tidak ada jadwal cocok; pembuatan baris jadwal tidak diminta' })
    }
  }
})
tx()

const cap = new Date().toISOString().replace(/[:.]/g, '-')
fs.mkdirSync('/root/backups/jurnalku', { recursive: true })
fs.writeFileSync(`/root/backups/jurnalku/pulihkan-sesi-${cap}.json`, JSON.stringify(arsip, null, 1))
console.log(`\nditerapkan: relink=${arsip.relink.length} buat_baru=${arsip.buat.length} dilewati=${arsip.dilewati.length}`)
console.log('arsip:', `/root/backups/jurnalku/pulihkan-sesi-${cap}.json`)
console.log('sisa sesi yatim:', db.prepare(`SELECT COUNT(*) n FROM sesi_kelas_guru s
  LEFT JOIN jadwal j ON j.id=s.jadwal_id AND j.tenant_id=s.tenant_id WHERE j.id IS NULL`).get().n)
db.close()
