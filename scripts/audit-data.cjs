'use strict'
// Audit integritas data Jurnalku (baca-saja).
const path = require('path')
const D = require('better-sqlite3')(process.env.DB || '/www/wwwroot/jurnal.cc.cd/server/jurnalku.db', { readonly: true })
const one = (sql, ...p) => Object.values(D.prepare(sql).get(...p) || {})[0]
const all = (sql, ...p) => D.prepare(sql).all(...p)
const hariIni = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())

const hasil = []
const cek = (nama, nilai, batas = 0) => hasil.push({ nama, nilai, ok: Number(nilai) <= batas })

cek('integrity_check', D.pragma('quick_check', { simple: true }) === 'ok' ? 0 : 1)
hasil[hasil.length - 1].nilai = D.pragma('quick_check', { simple: true })

cek('sesi_kelas aktif dari hari lalu', one("SELECT COUNT(*) n FROM sesi_kelas_guru WHERE status='aktif' AND tanggal<?", hariIni))
cek('sesi_kelas aktif hari ini', one("SELECT COUNT(*) n FROM sesi_kelas_guru WHERE status='aktif' AND tanggal=?", hariIni), 999)
cek('jurnal ganda per sesi', one(`SELECT COUNT(*) n FROM (
  SELECT 1 FROM jurnal_mengajar GROUP BY tenant_id,guru_id,mapel_id,rombel_id,tanggal HAVING COUNT(*)>1)`))
cek('absensi_mapel ganda', one(`SELECT COUNT(*) n FROM (
  SELECT 1 FROM absensi_mapel GROUP BY tenant_id,siswa_id,jadwal_id,tanggal HAVING COUNT(*)>1)`))
cek('jadwal tanpa GTK', one("SELECT COUNT(*) n FROM jadwal j LEFT JOIN gtk g ON g.id=j.gtk_id AND g.tenant_id=j.tenant_id WHERE COALESCE(j.jenis_kegiatan,'mapel')='mapel' AND g.id IS NULL"))
cek('jadwal tanpa rombel', one("SELECT COUNT(*) n FROM jadwal j LEFT JOIN rombel r ON r.id=j.rombel_id AND r.tenant_id=j.tenant_id WHERE COALESCE(j.jenis_kegiatan,'mapel')='mapel' AND r.id IS NULL"))
cek('siswa aktif tanpa rombel', one("SELECT COUNT(*) n FROM siswa WHERE (rombel_id IS NULL OR rombel_id='') AND COALESCE(status,'aktif')='aktif'"))
cek('user tanpa tenant', one('SELECT COUNT(*) n FROM users u LEFT JOIN tenants t ON t.id=u.tenant_id WHERE t.id IS NULL'))
cek('user tanpa password', one("SELECT COUNT(*) n FROM users WHERE password IS NULL OR password=''"))
cek('wa_queue failed', one("SELECT COUNT(*) n FROM wa_queue WHERE status='failed'"), 999)
cek('wa_queue pending menua >30m', one("SELECT COUNT(*) n FROM wa_queue WHERE status='pending' AND available_at < datetime('now','-30 minutes')"), 999)
cek('wa sesi reconnecting >15m', one("SELECT COUNT(*) n FROM wa_sessions WHERE status IN ('reconnecting','connecting') AND updated_at < datetime('now','-15 minutes')"))
cek('sitemap tak terakses', 0, 999)

// info tambahan
const info = {
  hariIni,
  tenants: one('SELECT COUNT(*) n FROM tenants WHERE aktif=1'),
  users: one('SELECT COUNT(*) n FROM users'),
  siswa: one('SELECT COUNT(*) n FROM siswa'),
  jadwal: one('SELECT COUNT(*) n FROM jadwal'),
  sesiHariIni: one('SELECT COUNT(*) n FROM sesi_kelas_guru WHERE tanggal=?', hariIni),
  jurnalHariIni: one('SELECT COUNT(*) n FROM jurnal_mengajar WHERE tanggal=?', hariIni),
  waSesi: all('SELECT tenant_id,status,phone,updated_at FROM wa_sessions ORDER BY updated_at DESC'),
  waAntrean: all('SELECT status,COUNT(*) n FROM wa_queue GROUP BY status'),
  sesiBasi: all("SELECT tenant_id,tanggal,COUNT(*) n FROM sesi_kelas_guru WHERE status='aktif' AND tanggal<? GROUP BY tenant_id,tanggal ORDER BY tanggal DESC LIMIT 5", hariIni),
}

for (const h of hasil) console.log(`${h.ok ? 'OK  ' : 'CEK '} ${h.nama.padEnd(38)} ${h.nilai}`)
console.log('\nINFO', JSON.stringify(info, null, 1))
