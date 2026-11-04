'use strict'
const D = require('better-sqlite3')(process.env.DB || '/www/wwwroot/jurnal.cc.cd/server/jurnalku.db', { readonly: true })
const kol = D.prepare('PRAGMA table_info(subscription_plans)').all().map(c => c.name)
console.log('kolom subscription_plans:', kol.join(', '))
for (const p of D.prepare('SELECT * FROM subscription_plans').all()) {
  const ringkas = {}
  for (const k of kol) {
    if (/nama|name|harga|price|siswa|gtk|aktif|durasi|hari|bulan|kode|id$|fitur|max/i.test(k)) ringkas[k] = p[k]
  }
  console.log(JSON.stringify(ringkas))
}
console.log('\nrencana per tenant (plan string):')
for (const r of D.prepare("SELECT plan, COUNT(*) n FROM tenants GROUP BY plan").all()) console.log(' ', r.plan, r.n)
