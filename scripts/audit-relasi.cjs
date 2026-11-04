'use strict'
const D = require('better-sqlite3')(process.env.DB || '/www/wwwroot/jurnal.cc.cd/server/jurnalku.db', { readonly: true })
const n = (sql, ...p) => D.prepare(sql).get(...p).n
const cek = (nama, sql) => console.log(`${n(sql) === 0 ? 'OK  ' : 'CEK '} ${nama.padEnd(42)} ${n(sql)}`)

cek('jurnal tanpa guru', 'SELECT COUNT(*) n FROM jurnal_mengajar j LEFT JOIN gtk g ON g.id=j.guru_id AND g.tenant_id=j.tenant_id WHERE g.id IS NULL')
cek('jurnal tanpa mapel', 'SELECT COUNT(*) n FROM jurnal_mengajar j LEFT JOIN mapel m ON m.id=j.mapel_id AND m.tenant_id=j.tenant_id WHERE m.id IS NULL')
cek('jurnal tanpa rombel', 'SELECT COUNT(*) n FROM jurnal_mengajar j LEFT JOIN rombel r ON r.id=j.rombel_id AND r.tenant_id=j.tenant_id WHERE r.id IS NULL')
cek('sesi tanpa jadwal', 'SELECT COUNT(*) n FROM sesi_kelas_guru s LEFT JOIN jadwal j ON j.id=s.jadwal_id AND j.tenant_id=s.tenant_id WHERE j.id IS NULL')
cek('absensi_mapel tanpa jadwal', 'SELECT COUNT(*) n FROM absensi_mapel a LEFT JOIN jadwal j ON j.id=a.jadwal_id AND j.tenant_id=a.tenant_id WHERE j.id IS NULL')
cek('absensi_mapel tanpa siswa', 'SELECT COUNT(*) n FROM absensi_mapel a LEFT JOIN siswa s ON s.id=a.siswa_id AND s.tenant_id=a.tenant_id WHERE s.id IS NULL')
cek('jadwal tanpa mapel', "SELECT COUNT(*) n FROM jadwal j LEFT JOIN mapel m ON m.id=j.mapel_id AND m.tenant_id=j.tenant_id WHERE COALESCE(j.jenis_kegiatan,'mapel')='mapel' AND m.id IS NULL")
console.log('--- ringkas ---')
for (const t of ['jurnal_mengajar', 'sesi_kelas_guru', 'absensi_mapel', 'jadwal', 'gtk', 'rombel', 'siswa', 'users', 'tenants']) {
  console.log(t.padEnd(18), n(`SELECT COUNT(*) n FROM ${t}`))
}
