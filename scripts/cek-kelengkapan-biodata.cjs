'use strict'
const path = require('path')
const D = require(path.join(__dirname, '..', 'node_modules/better-sqlite3'))
const db = new D(path.join(__dirname, '..', 'server/jurnalku.db'), { readonly: true })
const T = 'mtsplussd7'
const tot = db.prepare("SELECT COUNT(*) n FROM siswa WHERE tenant_id=? AND status='aktif'").get(T).n
console.log(`siswa aktif ${T}: ${tot}`)
console.log('\n=== kelengkapan biodata (yang dicetak di rapor) ===')
for (const k of ['nama_ayah','kerja_ayah','nama_ibu','kerja_ibu','nama_wali','kerja_wali','asal_sekolah','anak_ke','status_keluarga','nik','tempat_lahir','tanggal_lahir','agama','no_hp','alamat']) {
  const n = db.prepare(`SELECT COUNT(*) n FROM siswa WHERE tenant_id=? AND status='aktif' AND ${k} IS NOT NULL AND trim(${k})<>''`).get(T).n
  console.log(' ', k.padEnd(18), `${n}/${tot}`.padEnd(9), Math.round(n / tot * 100) + '%')
}
