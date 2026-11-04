'use strict'
// Normalkan masa paket Gratis: total 6 bulan TERMASUK trial 1 bulan.
// Karena itu batas akhir = tanggal trial berakhir + 5 bulan.
// Pemakaian: node scripts/normalkan-gratis.cjs [--apply]
const Database = require('better-sqlite3')
const { computeExpiry } = require('../server/subscription.cjs')

const TERAPKAN = process.argv.includes('--apply')
const db = new Database(process.env.DB || '/www/wwwroot/jurnal.cc.cd/server/jurnalku.db')

const baris = db.prepare("SELECT id,nama,plan,trial_ends_at,subscription_ends_at FROM tenants WHERE plan='gratis'").all()
console.log('tenant paket gratis:', baris.length)

const rencana = []
for (const t of baris) {
  const dasar = t.trial_ends_at || t.subscription_ends_at
  if (!dasar) { console.log('  lewati (tanpa tanggal trial):', t.nama); continue }
  const baru = computeExpiry(new Date(dasar).toISOString(), 5, 'bulan')
  rencana.push({ t, baru })
  console.log(' ', (t.nama || '').slice(0, 28).padEnd(30), 'lama=' + String(t.subscription_ends_at).slice(0, 10), '-> baru=' + baru.slice(0, 10))
}

if (!TERAPKAN) { console.log('\n(dry-run — jalankan dengan --apply)'); process.exit(0) }

const tx = db.transaction(() => {
  const up = db.prepare('UPDATE tenants SET subscription_ends_at=? WHERE id=?')
  for (const r of rencana) up.run(r.baru, r.t.id)
})
tx()
console.log('diperbarui:', rencana.length)
