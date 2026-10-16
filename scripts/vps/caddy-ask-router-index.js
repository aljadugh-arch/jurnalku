const http = require('http')

// Router untuk `on_demand_tls { ask ... }` Caddy.
//
// Caddy menanyakan "boleh saya terbitkan sertifikat untuk domain ini?" ke sini.
// Router harus tahu domain mana milik aplikasi mana:
//   - Jurnalku  → diteruskan ke http://127.0.0.1:3002/api/caddy/ask
//   - Fazacloud → diteruskan ke http://127.0.0.1:8000/api/caddy/ask
//
// PENTING: daftar domain Jurnalku di sini harus SAMA dengan BASE_DOMAINS di
// server/tenant.cjs. Bila sebuah domain platform baru tidak terdaftar di sini,
// permintaan sertifikatnya salah diteruskan ke Fazacloud → ditolak → TLS gagal
// dengan "tlsv1 alert internal error" walau DNS & blok Caddy sudah benar.
//
// Daftar diambil dari env JURNALKU_DOMAINS (dipisah koma) bila ada, supaya
// menambah domain baru cukup lewat environment tanpa mengedit berkas ini.

const PORT = process.env.PORT || 8001
const JURNALKU_ASK = 'http://127.0.0.1:3002/api/caddy/ask'
const FAZACLOUD_ASK = 'http://127.0.0.1:8000/api/caddy/ask'

const BAWAAN = [
  'jurnal.cc.cd',
  'jurnalmadrasah.web.id',
  'jurnalku.biz.id',
  'idjurnal.my.id',
  'idjurnal.web.id',
  'idjurnal.biz.id',
]
const JURNALKU_DOMAINS = String(process.env.JURNALKU_DOMAINS || '')
  .split(',')
  .map(d => d.trim().toLowerCase())
  .filter(Boolean)
const DOMAIN_JURNALKU = JURNALKU_DOMAINS.length ? JURNALKU_DOMAINS : BAWAAN

function proxyAsk(targetBase, domain, res) {
  const url = `${targetBase}?domain=${encodeURIComponent(domain)}`
  http.get(url, { timeout: 5000 }, (r) => {
    res.writeHead(r.statusCode || 502)
    r.pipe(res)
  }).on('error', () => {
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'upstream ask unreachable' }))
  })
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`)
  if (u.pathname !== '/api/caddy/ask') {
    res.writeHead(404); res.end('not found'); return
  }
  const domain = (u.searchParams.get('domain') || '').toLowerCase()
  if (!domain) {
    res.writeHead(400, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'domain wajib' }))
    return
  }
  const isJurnalku = DOMAIN_JURNALKU.some(d => domain === d || domain === `www.${d}` || domain.endsWith(`.${d}`))
  if (isJurnalku) {
    proxyAsk(JURNALKU_ASK, domain, res)
  } else {
    proxyAsk(FAZACLOUD_ASK, domain, res)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`caddy-ask-router listening on 127.0.0.1:${PORT}`)
  console.log(`domain jurnalku (${DOMAIN_JURNALKU.length}): ${DOMAIN_JURNALKU.join(', ')}`)
})
