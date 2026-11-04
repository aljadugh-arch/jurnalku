'use strict'
// Bersih-bersih data (dijalankan setelah persetujuan pemilik):
//   1. jurnal ganda  -> simpan satu per sesi
//   2. jadwal yatim demo-tenant
//   3. antrean WA gagal lama
// Semua baris yang dihapus disimpan dulu ke berkas JSON agar bisa dipulihkan.
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const DB = process.env.DB || '/www/wwwroot/jurnal.cc.cd/server/jurnalku.db'
const CAP = new Date().toISOString().replace(/[:.]/g, '-')
const ARSIP = `/root/backups/jurnalku/cleanup-${CAP}.json`
const db = new Database(DB)
db.pragma('journal_mode = WAL')

const arsip = { waktu: new Date().toISOString(), jurnal: [], jadwal_demo: [], wa_gagal: [] }

// ---- 1. jurnal ganda ----
const kunci = ['tenant_id', 'guru_id', 'mapel_id', 'rombel_id', 'tanggal', 'jam_ke']
const grup = db.prepare(`SELECT ${kunci.join(',')},COUNT(*) c FROM jurnal_mengajar
  GROUP BY ${kunci.join(',')} HAVING c>1`).all()

let hapusJurnal = 0
const hapusSatu = db.prepare(`DELETE FROM jurnal_mengajar WHERE id=?`)
const bersihkan = db.transaction(() => {
  for (const g of grup) {
    const where = kunci.map(k => `${k} IS ?`).join(' AND ')
    const nilai = kunci.map(k => g[k])
    // Simpan yang punya tanda tangan; bila sama, yang paling akhir diubah.
    const baris = db.prepare(`SELECT * FROM jurnal_mengajar WHERE ${where}
      ORDER BY (signature_path IS NULL) ASC, COALESCE(updated_at,created_at) DESC, created_at DESC`).all(...nilai)
    for (const b of baris.slice(1)) {
      arsip.jurnal.push(b)
      hapusSatu.run(b.id)
      hapusJurnal++
    }
  }
  return hapusJurnal
})
hapusJurnal = bersihkan()

// ---- 2. jadwal yatim demo-tenant ----
const yatim = db.prepare(`SELECT j.* FROM jadwal j
  LEFT JOIN gtk g ON g.id=j.gtk_id AND g.tenant_id=j.tenant_id
  LEFT JOIN rombel r ON r.id=j.rombel_id AND r.tenant_id=j.tenant_id
  WHERE j.tenant_id='demo-tenant' AND (g.id IS NULL OR r.id IS NULL)`).all()
const hapusJadwal = db.prepare('DELETE FROM jadwal WHERE id=? AND tenant_id=?')
for (const j of yatim) { arsip.jadwal_demo.push(j); hapusJadwal.run(j.id, 'demo-tenant') }

// ---- 3. WA gagal lama (>1 hari) ----
const waLama = db.prepare("SELECT * FROM wa_queue WHERE status='failed' AND failed_at < datetime('now','-1 day')").all()
const hapusWa = db.prepare('DELETE FROM wa_queue WHERE id=?')
for (const w of waLama) { arsip.wa_gagal.push(w); hapusWa.run(w.id) }

fs.mkdirSync(path.dirname(ARSIP), { recursive: true })
fs.writeFileSync(ARSIP, JSON.stringify(arsip, null, 1))

console.log(JSON.stringify({
  arsip: ARSIP,
  jurnal_grup: grup.length,
  jurnal_dihapus: hapusJurnal,
  jadwal_demo_dihapus: yatim.length,
  wa_gagal_dihapus: waLama.length,
}, null, 1))

// sisa pemeriksaan
const sisa = db.prepare(`SELECT COUNT(*) n FROM (
  SELECT 1 FROM jurnal_mengajar GROUP BY ${kunci.join(',')} HAVING COUNT(*)>1)`).get().n
console.log('sisa grup jurnal ganda:', sisa)
console.log('sisa jadwal yatim demo:', db.prepare(`SELECT COUNT(*) n FROM jadwal j
  LEFT JOIN gtk g ON g.id=j.gtk_id AND g.tenant_id=j.tenant_id
  LEFT JOIN rombel r ON r.id=j.rombel_id AND r.tenant_id=j.tenant_id
  WHERE j.tenant_id='demo-tenant' AND (g.id IS NULL OR r.id IS NULL)`).get().n)
console.log('sisa wa gagal lama:', db.prepare("SELECT COUNT(*) n FROM wa_queue WHERE status='failed' AND failed_at < datetime('now','-1 day')").get().n)
db.close()
