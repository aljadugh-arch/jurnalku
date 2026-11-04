'use strict'
const D = require('better-sqlite3')(process.env.DB || '/www/wwwroot/jurnal.cc.cd/server/jurnalku.db', { readonly: true })
const all = (s, ...p) => D.prepare(s).all(...p)
const one = (s, ...p) => D.prepare(s).get(...p)

console.log('== duplikat jurnal (kunci sesi + jam_ke) ==')
const g = all(`SELECT tenant_id,guru_id,mapel_id,rombel_id,tanggal,jam_ke,COUNT(*) c,MIN(created_at) awal,MAX(created_at) akhir
  FROM jurnal_mengajar GROUP BY 1,2,3,4,5,6 HAVING c>1 ORDER BY tanggal DESC`)
console.log('grup:', g.length, 'baris berlebih:', g.reduce((n, r) => n + r.c - 1, 0))
console.log('rentang tanggal:', g.length ? `${g[g.length - 1].tanggal} .. ${g[0].tanggal}` : '-')
console.log('per tenant:', Object.entries(g.reduce((m, r) => (m[r.tenant_id] = (m[r.tenant_id] || 0) + r.c - 1, m), {})).map(([k, v]) => k.slice(0, 12) + '=' + v).join(' '))
console.log('contoh:', g.slice(0, 5).map(r => `${r.tanggal} jam_ke=${r.jam_ke} c=${r.c}`).join(' | '))

console.log('\n== demo tenant ==')
console.log('gtk:', all("SELECT id,nama FROM gtk WHERE tenant_id='demo-tenant'"))
console.log('gtk dirujuk:', all("SELECT DISTINCT gtk_id FROM jadwal WHERE tenant_id='demo-tenant'"))
console.log('rombel dirujuk:', all("SELECT DISTINCT rombel_id FROM jadwal WHERE tenant_id='demo-tenant'"))
console.log('rombel ada:', all("SELECT id,nama FROM rombel WHERE tenant_id='demo-tenant'"))
