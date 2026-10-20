'use strict'
const path = require('path')
const D = require(path.join(__dirname, '..', 'node_modules/better-sqlite3'))
const db = new D(path.join(__dirname, '..', 'server/jurnalku.db'), { readonly: true })

console.log('=== SETTINGS mtsplussd7 ===')
const s = db.prepare("SELECT * FROM settings WHERE tenant_id='mtsplussd7'").get()
for (const [k, v] of Object.entries(s || {})) {
  if (v !== null && v !== '' && String(v).length < 120) console.log(` ${k} = ${JSON.stringify(v)}`)
}

console.log('\n=== TENANT mtsplussd7 ===')
const t = db.prepare("SELECT * FROM tenants WHERE id='mtsplussd7'").get()
console.log(' nama:', t.nama, '| slug:', t.slug, '| base:', t.base_domain, '| custom:', t.domain_custom)

console.log('\n=== 1 siswa contoh ===')
const sw = db.prepare("SELECT s.*, r.nama rombel_nama, r.tingkat FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id WHERE s.tenant_id='mtsplussd7' AND s.status='aktif' LIMIT 1").get()
const tampil = ['nama','nis','nisn','nik','jenis_kelamin','tempat_lahir','tanggal_lahir','agama','status_keluarga','anak_ke','asal_sekolah','nama_ayah','kerja_ayah','nama_ibu','kerja_ibu','nama_wali','kerja_wali','alamat','no_hp','rombel_nama','tingkat','foto']
for (const k of tampil) console.log(` ${k} = ${JSON.stringify(sw[k])}`)

console.log('\n=== kolom settings yang ada ===')
console.log(db.prepare("PRAGMA table_info(settings)").all().map(c => c.name).join(', '))
