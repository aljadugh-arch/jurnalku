'use strict'
const fs = require('fs')
const D = require('/home/aljadugh/jurnalku/node_modules/better-sqlite3')
const { createBukuIndukPdf } = require('/home/aljadugh/jurnalku/server/buku-induk-pdf-service.cjs')

const db = new D('/tmp/prod-rapor.db', { readonly: true })
const sw = db.prepare("SELECT s.*, r.nama rombel FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id WHERE s.tenant_id='mtsplussd7' AND s.status='aktif' AND s.rombel_id IS NOT NULL LIMIT 1").get()
console.log('siswa:', sw.nama, '|', sw.rombel)

;(async () => {
  for (const bagian of ['lengkap', 'identitas', 'nilai']) {
    const doc = await createBukuIndukPdf(db, {
      tenantId: 'mtsplussd7', siswaId: sw.id,
      uploadDir: '/home/aljadugh/jurnalku/server/uploads', bagian,
    })
    const out = `/tmp/buku-induk-${bagian}.pdf`
    const ws = fs.createWriteStream(out)
    doc.pipe(ws); doc.end()
    await new Promise(r => ws.on('finish', r))
    console.log(` ${bagian.padEnd(10)} ${out} ${fs.statSync(out).size} byte`)
  }
})()
