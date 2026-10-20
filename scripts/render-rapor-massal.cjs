'use strict'
const path = require('path')
const fs = require('fs')
const D = require('/home/aljadugh/jurnalku/node_modules/better-sqlite3')
const { createRaporMtsplusPdfBulk } = require('/home/aljadugh/jurnalku/server/rapor-mtsplus-pdf-service.cjs')

const db = new D('/tmp/prod-rapor.db', { readonly: true })
const rombel = db.prepare("SELECT r.id, r.nama, COUNT(DISTINCT s.id) n FROM rombel r JOIN siswa s ON s.rombel_id=r.id AND s.status='aktif' JOIN penilaian_harian ph ON ph.siswa_id=s.id AND ph.tenant_id=s.tenant_id WHERE r.tenant_id='mtsplussd7' GROUP BY r.id ORDER BY n DESC LIMIT 1").get()
console.log('rombel:', rombel.nama, '| siswa aktif:', rombel.n)

;(async () => {
  const t0 = Date.now()
  const doc = await createRaporMtsplusPdfBulk(db, {
    tenantId: 'mtsplussd7',
    rombelId: rombel.id,
    tahunAjaran: '2026/2027',
    semester: 'ganjil',
    jenis: 'rapor_sts',
    uploadDir: '/home/aljadugh/jurnalku/server/uploads',
    bagian: 'lengkap',
  })
  const out = '/tmp/rapor-massal.pdf'
  const ws = fs.createWriteStream(out)
  doc.pipe(ws)
  doc.end()
  await new Promise(r => ws.on('finish', r))
  console.log('PDF massal:', out, fs.statSync(out).size, 'byte |', Date.now() - t0, 'ms')
  console.log('meta:', JSON.stringify(doc.meta))
})()
