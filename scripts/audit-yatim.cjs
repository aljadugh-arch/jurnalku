'use strict'
const D = require('better-sqlite3')(process.env.DB || '/www/wwwroot/jurnal.cc.cd/server/jurnalku.db', { readonly: true })
const all = (s, ...p) => D.prepare(s).all(...p)

console.log('== sesi tanpa jadwal ==')
console.log(all(`SELECT s.tenant_id,s.tanggal,s.status,s.jadwal_id,s.guru_id,s.rombel_id
  FROM sesi_kelas_guru s LEFT JOIN jadwal j ON j.id=s.jadwal_id AND j.tenant_id=s.tenant_id
  WHERE j.id IS NULL ORDER BY s.tanggal DESC LIMIT 12`))
console.log('per tenant:', all(`SELECT s.tenant_id,COUNT(*) n,MIN(s.tanggal) dari,MAX(s.tanggal) sampai
  FROM sesi_kelas_guru s LEFT JOIN jadwal j ON j.id=s.jadwal_id AND j.tenant_id=s.tenant_id
  WHERE j.id IS NULL GROUP BY s.tenant_id`))

console.log('\n== jurnal tanpa guru/rombel ==')
console.log(all(`SELECT j.id,j.tenant_id,j.tanggal,j.guru_id,j.rombel_id,j.mapel_id
  FROM jurnal_mengajar j
  LEFT JOIN gtk g ON g.id=j.guru_id AND g.tenant_id=j.tenant_id
  LEFT JOIN rombel r ON r.id=j.rombel_id AND r.tenant_id=j.tenant_id
  WHERE g.id IS NULL OR r.id IS NULL`))
