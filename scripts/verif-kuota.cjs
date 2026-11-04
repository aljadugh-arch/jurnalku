'use strict'
const Database = require('better-sqlite3')
const db = new Database('/www/wwwroot/jurnal.cc.cd/server/jurnalku.db', { readonly: true })
const { kuotaTenant } = require('/www/wwwroot/jurnal.cc.cd/server/kuota.cjs')
console.log('PAKET:')
for (const p of db.prepare('SELECT plan,label,harga,max_siswa,max_gtk FROM subscription_plans ORDER BY urutan').all()) {
  console.log(' ', p.plan.padEnd(8), 'harga=' + String(p.harga).padEnd(7), 'max_siswa=' + String(p.max_siswa).padEnd(6), 'max_gtk=' + p.max_gtk)
}
console.log('\nKUOTA BEBERAPA LEMBAGA:')
for (const id of ['mtsplussd7', '26c3ff5e-b056-40c4-a5e', 'a81f0835-e67e-4834-826', 'demo-kemenag']) {
  const t = db.prepare('SELECT id,nama,plan FROM tenants WHERE id LIKE ?').get(id.slice(0, 12) + '%')
  if (!t) continue
  const s = kuotaTenant(db, t.id, 'siswa')
  const g = kuotaTenant(db, t.id, 'gtk')
  console.log(' ', (t.nama || '').slice(0, 26).padEnd(28), 'plan=' + String(t.plan).padEnd(8),
    `siswa ${s.aktif}/${s.batas || '∞'} sisa=${s.sisa}`, `| gtk ${g.aktif}/${g.batas || '∞'}`,
    s.dari_paket ? '(batas paket)' : '(batas lembaga)')
}
