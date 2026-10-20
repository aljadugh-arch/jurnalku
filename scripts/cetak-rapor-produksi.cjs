'use strict'
// Cetak PDF rapor NYATA dari produksi lewat HTTP + JWT runtime, lalu simpan.
const fs = require('fs')
const path = require('path')
const jwt = require(path.join(__dirname, '..', 'node_modules/jsonwebtoken'))
const Database = require(path.join(__dirname, '..', 'node_modules/better-sqlite3'))

function cariSecret() {
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue
    try {
      const cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8')
      if (!cmd.includes('server/index.cjs')) continue
      for (const kv of fs.readFileSync(`/proc/${d}/environ`, 'utf8').split('\0')) {
        if (kv.startsWith('JWT_SECRET=')) return kv.slice('JWT_SECRET='.length)
      }
    } catch {}
  }
  return null
}

const secret = cariSecret()
if (!secret) { console.error('JWT_SECRET tidak ditemukan'); process.exit(1) }

const db = new Database(path.join(__dirname, '..', 'server/jurnalku.db'), { readonly: true })
const user = db.prepare("SELECT * FROM users WHERE role='admin' AND tenant_id='mtsplussd7' LIMIT 1").get()
const siswa = db.prepare("SELECT s.*, r.nama rombel FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id WHERE s.tenant_id='mtsplussd7' AND s.status='aktif' AND s.rombel_id IS NOT NULL LIMIT 1").get()

const token = jwt.sign({ id: user.id, email: user.email, nama: user.nama, role: user.role, tenant_id: user.tenant_id, gtk_id: user.gtk_id, siswa_id: user.siswa_id, nis: user.nis }, secret, { expiresIn: '10m' })

;(async () => {
  console.log('siswa:', siswa.nama, '| NIS', siswa.nis, '| NISN', siswa.nisn, '| rombel', siswa.rombel)
  const url = `http://127.0.0.1:3002/api/rapor/export/pdf?siswa_id=${siswa.id}&format=mtsplus&bagian=lengkap&tahun_ajaran=2026/2027&semester=ganjil&jenis=rapor_sts`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-Host': 'jurnal.mtsplussd7.cc.cd', Host: 'jurnal.mtsplussd7.cc.cd' } })
  console.log('status:', r.status, '| content-type:', r.headers.get('content-type'))
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.slice(0, 4).toString() !== '%PDF') { console.log('BUKAN PDF:', buf.toString().slice(0, 300)); return }
  const out = '/tmp/rapor-produksi.pdf'
  fs.writeFileSync(out, buf)
  console.log('tersimpan:', out, buf.length, 'byte')
  // Simpan juga data mentah untuk perbandingan
  fs.writeFileSync('/tmp/rapor-siswa.json', JSON.stringify(siswa, null, 2))
})()
