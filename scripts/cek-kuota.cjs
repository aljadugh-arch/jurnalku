'use strict'
const D = require('better-sqlite3')(process.env.DB || '/www/wwwroot/jurnal.cc.cd/server/jurnalku.db', { readonly: true })
const rows = D.prepare(`SELECT t.id,t.nama,t.plan,t.max_siswa,t.max_gtk,t.trial_ends_at,t.expired_at,t.aktif,
   (SELECT COUNT(*) FROM siswa s WHERE s.tenant_id=t.id AND COALESCE(s.status,'aktif')='aktif') siswa,
   (SELECT COUNT(*) FROM gtk g WHERE g.tenant_id=t.id) gtk
  FROM tenants t ORDER BY siswa DESC`).all()
console.log('siswa/kuota  plan     gtk/kuota  nama')
for (const r of rows) {
  const lewat = Number(r.max_siswa) > 0 && r.siswa > Number(r.max_siswa) ? ' ← MELEBIHI' : ''
  console.log(String(r.siswa).padStart(4) + '/' + String(r.max_siswa).padEnd(5), String(r.plan).padEnd(8),
    'gtk=' + r.gtk + '/' + r.max_gtk, (r.nama || '').slice(0, 30) + lewat)
}
console.log('\nrencana langganan:')
try {
  for (const p of D.prepare('SELECT * FROM subscription_plans').all()) {
    console.log(' ', p.id, p.nama, 'harga=' + p.harga, 'max_siswa=' + p.max_siswa, 'max_gtk=' + p.max_gtk, 'aktif=' + p.aktif)
  }
} catch (e) { console.log('  (tabel subscription_plans tidak ada / beda kolom):', e.message) }
