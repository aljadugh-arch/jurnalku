'use strict'
// Render rapor dari SALINAN DB produksi, lalu bandingkan dengan data asli.
const path = require('path')
const fs = require('fs')
const D = require('/home/aljadugh/jurnalku/node_modules/better-sqlite3')
const { createRaporMtsplusPdf } = require('/home/aljadugh/jurnalku/server/rapor-mtsplus-pdf-service.cjs')

const db = new D('/tmp/prod-rapor.db', { readonly: true })
const sw = db.prepare("SELECT s.*, r.nama rombel FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id WHERE s.tenant_id='mtsplussd7' AND s.status='aktif' AND s.rombel_id IS NOT NULL LIMIT 1").get()
const settings = db.prepare("SELECT * FROM settings WHERE tenant_id='mtsplussd7'").get()

console.log('=== DATA ASLI DI DB ===')
console.log(' nama   :', sw.nama)
console.log(' nis    :', sw.nis, '| nisn:', sw.nisn)
console.log(' jk     :', sw.jenis_kelamin)
console.log(' ttl    :', sw.tempat_lahir + ',', sw.tanggal_lahir)
console.log(' rombel :', sw.rombel)
console.log(' ayah   :', sw.nama_ayah, '/', sw.kerja_ayah)
console.log(' ibu    :', sw.nama_ibu, '/', sw.kerja_ibu)
console.log(' lembaga:', settings.nama_lembaga)
console.log(' yayasan:', settings.yayasan_nama)
console.log(' jenjang:', settings.jenjang)
console.log(' kepsek :', settings.kepala_sekolah)

;(async () => {
  const doc = await createRaporMtsplusPdf(db, {
    tenantId: 'mtsplussd7',
    siswaId: sw.id,
    tahunAjaran: '2026/2027',
    semester: 'ganjil',
    jenis: 'rapor_sts',
    uploadDir: '/home/aljadugh/jurnalku/server/uploads',
    bagian: 'lengkap',
  })
  const out = '/tmp/rapor-baru.pdf'
  const ws = fs.createWriteStream(out)
  doc.pipe(ws)
  doc.end()
  await new Promise(r => ws.on('finish', r))
  console.log('\nPDF baru:', out, fs.statSync(out).size, 'byte')
})()
