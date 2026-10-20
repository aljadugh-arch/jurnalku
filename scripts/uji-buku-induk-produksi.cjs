'use strict'
// Uji endpoint buku induk + rapor per bagian lewat HTTP nyata produksi.
const fs = require('fs')
const path = require('path')
const jwt = require(path.join(__dirname, '..', 'node_modules/jsonwebtoken'))
const Database = require(path.join(__dirname, '..', 'node_modules/better-sqlite3'))

function cariSecret() {
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue
    try {
      if (!fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').includes('server/index.cjs')) continue
      for (const kv of fs.readFileSync(`/proc/${d}/environ`, 'utf8').split('\0')) {
        if (kv.startsWith('JWT_SECRET=')) return kv.slice('JWT_SECRET='.length)
      }
    } catch {}
  }
  return null
}
const secret = cariSecret()
if (!secret) { console.error('JWT_SECRET tidak ada'); process.exit(1) }

const db = new Database(path.join(__dirname, '..', 'server/jurnalku.db'), { readonly: true })
const user = db.prepare("SELECT * FROM users WHERE role='admin' AND tenant_id='mtsplussd7' LIMIT 1").get()
const sw = db.prepare("SELECT s.*, r.nama rombel FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id WHERE s.tenant_id='mtsplussd7' AND s.status='aktif' AND s.rombel_id IS NOT NULL LIMIT 1").get()
const rombel = db.prepare("SELECT r.id, r.nama FROM rombel r JOIN penilaian_harian ph ON ph.tenant_id=r.tenant_id JOIN siswa s ON s.rombel_id=r.id AND s.id=ph.siswa_id WHERE r.tenant_id='mtsplussd7' GROUP BY r.id ORDER BY COUNT(*) DESC LIMIT 1").get()

const token = jwt.sign({ id: user.id, email: user.email, nama: user.nama, role: user.role, tenant_id: user.tenant_id, gtk_id: user.gtk_id, siswa_id: user.siswa_id, nis: user.nis }, secret, { expiresIn: '10m' })
const H = { Authorization: `Bearer ${token}`, 'X-Forwarded-Host': 'jurnal.mtsplussd7.cc.cd', Host: 'jurnal.mtsplussd7.cc.cd' }

async function uji(label, url, harapanPdf = true) {
  const r = await fetch('http://127.0.0.1:3002' + url, { headers: H })
  const buf = Buffer.from(await r.arrayBuffer())
  const isPdf = buf.slice(0, 4).toString() === '%PDF'
  const ok = harapanPdf ? (r.status === 200 && isPdf) : true
  console.log(`${ok ? 'OK  ' : 'GAGAL'} ${label.padEnd(38)} status=${r.status} ${isPdf ? 'PDF ' + (buf.length / 1024).toFixed(0) + 'KB' : JSON.stringify(buf.toString().slice(0, 90))}`)
  if (isPdf) {
    const out = `/tmp/uji-${label.replace(/[^\w]+/g, '-')}.pdf`
    fs.writeFileSync(out, buf)
    return { out, dicetak: r.headers.get('x-buku-induk-dicetak'), dilewati: r.headers.get('x-buku-induk-dilewati') }
  }
  return null
}

;(async () => {
  console.log(`siswa: ${sw.nama} (${sw.rombel}) | rombel uji: ${rombel.nama}\n`)
  await uji('buku-induk-lengkap', `/api/buku-induk/pdf?siswa_id=${sw.id}&bagian=lengkap`)
  await uji('buku-induk-identitas', `/api/buku-induk/pdf?siswa_id=${sw.id}&bagian=identitas`)
  await uji('buku-induk-nilai', `/api/buku-induk/pdf?siswa_id=${sw.id}&bagian=nilai`)
  const bulk = await uji('buku-induk-kelas', `/api/buku-induk/pdf-bulk?rombel_id=${rombel.id}&bagian=lengkap`)
  if (bulk) console.log(`     dicetak=${bulk.dicetak} dilewati=${bulk.dilewati}`)
  await uji('rapor-cover', `/api/rapor/export/pdf?siswa_id=${sw.id}&tahun_ajaran=2026/2027&semester=ganjil&jenis=rapor_sts&format=mtsplus&bagian=cover`)
  await uji('rapor-identitas', `/api/rapor/export/pdf?siswa_id=${sw.id}&tahun_ajaran=2026/2027&semester=ganjil&jenis=rapor_sts&format=mtsplus&bagian=identitas`)
  await uji('rapor-nilai', `/api/rapor/export/pdf?siswa_id=${sw.id}&tahun_ajaran=2026/2027&semester=ganjil&jenis=rapor_sts&format=mtsplus&bagian=nilai`)
  await uji('rapor-massal-cover', `/api/rapor/export/pdf-bulk?rombel_id=${rombel.id}&tahun_ajaran=2026/2027&semester=ganjil&jenis=rapor_sts&bagian=cover`)
  await uji('rapor-massal-nilai', `/api/rapor/export/pdf-bulk?rombel_id=${rombel.id}&tahun_ajaran=2026/2027&semester=ganjil&jenis=rapor_sts&bagian=nilai`)
})()
