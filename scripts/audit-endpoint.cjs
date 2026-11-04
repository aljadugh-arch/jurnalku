'use strict'
// Sapu seluruh endpoint GET /api tanpa parameter path memakai token superadmin.
// Tujuan: menemukan route yang mati (404) atau meledak (5xx), bukan menguji isi.
const fs = require('fs')
const src = fs.readFileSync('/www/wwwroot/jurnal.cc.cd/server/index.cjs', 'utf8')
const jalur = [...src.matchAll(/app\.get\(\s*'(\/api\/[^']+)'/g)]
  .map(m => m[1])
  .filter(p => !p.includes(':') && !p.includes('*'))

const unik = [...new Set(jalur)]
const BASIS = process.env.BASIS || 'https://jurnal.cc.cd'
let token = process.env.TOKEN

;(async () => {
  if (!token) { console.error('TOKEN kosong'); process.exit(2) }
  const hasil = { total: unik.length, ok: 0, unauthorized: 0, notFound: [], serverError: [], lain: [] }
  for (const p of unik) {
    try {
      const r = await fetch(BASIS + p, {
        headers: { Authorization: `Bearer ${token}`, 'X-Requested-With': 'audit' },
        signal: AbortSignal.timeout(12000),
      })
      if (r.status >= 500) hasil.serverError.push(`${r.status} ${p}`)
      else if (r.status === 404) hasil.notFound.push(p)
      else if (r.status === 401 || r.status === 403) hasil.unauthorized++
      else if (r.status < 400) hasil.ok++
      else hasil.lain.push(`${r.status} ${p}`)
    } catch (e) {
      hasil.lain.push(`ERR ${p} ${e.message}`)
    }
  }
  console.log(JSON.stringify(hasil, null, 1))
})()
