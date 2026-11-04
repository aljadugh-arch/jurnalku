'use strict'
const Database = require('better-sqlite3')
const db = new Database('/www/wwwroot/jurnal.cc.cd/server/jurnalku.db', { readonly: true })
console.log('PAKET:')
for (const p of db.prepare('SELECT plan,label,harga,max_siswa,max_gtk,masa_nilai,masa_satuan FROM subscription_plans ORDER BY urutan').all()) {
  console.log(' ', p.plan.padEnd(8), 'harga=' + String(p.harga).padEnd(7), 'max_siswa=' + String(p.max_siswa).padEnd(6),
    'masa=' + p.masa_nilai + ' ' + p.masa_satuan)
}
console.log('\nTENANT TRIAL / GRATIS (siswa, berakhir, perkiraan):')
for (const t of db.prepare("SELECT id,nama,plan,trial_ends_at,subscription_ends_at FROM tenants WHERE plan IN ('trial','gratis') ORDER BY plan").all()) {
  const n = db.prepare("SELECT COUNT(*) c FROM siswa WHERE tenant_id=? AND COALESCE(status,'aktif')='aktif'").get(t.id).c
  const akhir = t.subscription_ends_at || t.trial_ends_at
  const lewat = akhir ? new Date(akhir).getTime() <= Date.now() : false
  const putusan = !lewat ? 'aktif' : (n <= 100 && t.plan === 'trial') ? '→ otomatis Gratis 6 bln' : (t.plan === 'trial' ? '→ terkunci (harus paket)' : '→ terkunci (gratis habis)')
  console.log(' ', (t.nama || '').slice(0, 26).padEnd(28), t.plan.padEnd(7), 'siswa=' + String(n).padEnd(4),
    'sampai=' + String(akhir || '-').slice(0, 10).padEnd(12), putusan)
}
