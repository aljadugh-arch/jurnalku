'use strict'
const path = require('path')
const D = require('better-sqlite3')(process.env.DB || '/www/wwwroot/jurnal.cc.cd/server/jurnalku.db', { readonly: true })
const all = (s, ...p) => D.prepare(s).all(...p)
const hariIni = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())

console.log('== contoh jurnal ganda ==')
for (const r of all(`SELECT tenant_id,guru_id,mapel_id,rombel_id,tanggal,COUNT(*) c,GROUP_CONCAT(jam_ke) jk,GROUP_CONCAT(id) ids
  FROM jurnal_mengajar GROUP BY 1,2,3,4,5 HAVING c>1 ORDER BY tanggal DESC LIMIT 5`)) {
  console.log(`${r.tanggal} c=${r.c} jam_ke=[${r.jk}] ${r.tenant_id.slice(0,12)}`)
}
console.log('\n== jadwal tanpa GTK/rombel ==')
for (const r of all(`SELECT j.id,j.tenant_id,j.hari,j.jam_mulai,j.jenis_kegiatan,j.nama_kegiatan,j.mapel_id,j.rombel_id,j.gtk_id
  FROM jadwal j LEFT JOIN gtk g ON g.id=j.gtk_id AND g.tenant_id=j.tenant_id
  LEFT JOIN rombel r ON r.id=j.rombel_id AND r.tenant_id=j.tenant_id
  WHERE COALESCE(j.jenis_kegiatan,'mapel')='mapel' AND (g.id IS NULL OR r.id IS NULL) LIMIT 10`)) {
  console.log(JSON.stringify(r))
}
console.log('\n== sesi basi per tenant ==')
for (const r of all(`SELECT tenant_id,COUNT(*) n,MIN(tanggal) dari,MAX(tanggal) sampai FROM sesi_kelas_guru
  WHERE status='aktif' AND tanggal<? GROUP BY tenant_id ORDER BY n DESC`, hariIni)) console.log(r)
console.log('\n== wa gagal ==')
for (const r of all(`SELECT tenant_id,phone,failed_at,attempts,substr(last_error,1,50) e FROM wa_queue WHERE status='failed' LIMIT 5`)) console.log(r)
console.log('\n== wa sesi bermasalah ==')
for (const r of all(`SELECT tenant_id,status,phone,substr(last_error,1,60) e,updated_at FROM wa_sessions WHERE status IN ('reconnecting','connecting','qr') ORDER BY updated_at DESC LIMIT 6`)) console.log(r)
