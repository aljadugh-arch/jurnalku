'use strict'
// Regresi penjaga SSRF (temuan H-1 review keamanan 2026-09-28).
//
// Konteks bug: `custom_endpoint` AI, `baileys_webhook`, dan `sidobe_api_url`
// disimpan dari input admin tenant, lalu dipanggil oleh server sendiri sambil
// membawa kredensial tersimpan. PoC di staging membuktikan kunci AI terkirim ke
// listener penyerang dan layanan internal VPS bisa dibaca. Tes ini mengunci
// perilaku penjaga agar tidak hilang lagi.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const guard = require(path.join(root, 'server/ssrf-guard.cjs'))

test('isBlockedAddress memblokir seluruh rentang privat/internal', () => {
  const blocked = [
    '127.0.0.1', '127.9.9.9', '10.1.2.3', '172.16.0.1', '172.31.255.254',
    '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.1.1', '224.0.0.1',
    '255.255.255.255', '240.0.0.1', '198.18.0.1', '192.0.2.10',
    '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1',
    '::ffff:127.0.0.1', '64:ff9b::1'
  ]
  for (const ip of blocked) {
    assert.equal(guard.isBlockedAddress(ip), true, `${ip} seharusnya diblokir`)
  }
})

test('isBlockedAddress meloloskan alamat publik', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '104.18.0.1', '2606:4700:4700::1111']) {
    assert.equal(guard.isBlockedAddress(ip), false, `${ip} seharusnya lolos`)
  }
})

test('validateOutboundUrl menolak skema, kredensial, dan host internal', () => {
  const rejected = [
    'file:///etc/passwd',
    'ftp://example.com/x',
    'gopher://example.com/',
    'javascript:alert(1)',
    'http://169.254.169.254/latest/meta-data',
    'http://127.0.0.1:3002/api/health',
    'http://localhost:3002/api/health',
    'http://[::1]:2019/config',
    'http://10.0.0.5/v1/chat/completions',
    'http://192.168.0.10/x',
    'http://user:pass@api.openai.com/v1',
    ''
  ]
  for (const url of rejected) {
    assert.throws(() => guard.validateOutboundUrl(url), `${url} seharusnya ditolak`)
  }
  assert.equal(guard.validateOutboundUrl('https://api.openai.com/v1').hostname, 'api.openai.com')
  assert.equal(guard.validateOutboundUrl(' https://api.sidobe.com ').url.protocol, 'https:')
})

test('assertSafeOutboundUrl menolak host yang tidak dapat diresolusi', async () => {
  await assert.rejects(() => guard.assertSafeOutboundUrl('https://tidak-ada.invalid/v1'))
})

test('safeFetch menolak loopback tanpa allowlist tetapi mengizinkannya bila ada di allowlist', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ auth: req.headers.authorization || null }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const target = `http://127.0.0.1:${port}/v1/chat/completions`

  delete process.env.SSRF_PRIVATE_ALLOWLIST
  await assert.rejects(
    () => guard.safeFetch(target, { body: '{}', headers: { Authorization: 'Bearer RAHASIA' } }),
    /privat\/internal/
  )

  process.env.SSRF_PRIVATE_ALLOWLIST = `127.0.0.1:${port}`
  const ok = await guard.safeFetch(target, { body: '{}', headers: { Authorization: 'Bearer RAHASIA' } })
  assert.equal(ok.ok, true)
  assert.equal(ok.status, 200)
  assert.match(ok.text, /RAHASIA/)
  delete process.env.SSRF_PRIVATE_ALLOWLIST

  await new Promise(resolve => server.close(resolve))
})

test('koneksi keluar memakai alamat hasil resolusi yang sudah divalidasi (anti DNS rebinding)', () => {
  const source = read('server/ssrf-guard.cjs')
  assert.match(source, /requestOptions\.lookup = \(_host, opts, cb\) =>/)
  assert.match(source, /SSRF_PRIVATE_ALLOWLIST/)
})

test('pemanggil URL milik tenant memakai safeFetch, bukan fetch mentah', () => {
  const aiDocs = read('server/ai-documents.cjs')
  assert.match(aiDocs, /safeFetch/)
  assert.equal(/await fetch\(/.test(aiDocs), false, 'ai-documents.cjs masih memakai fetch mentah')

  const wa = read('server/wa-gateway.cjs')
  assert.match(wa, /safeFetch/)
  assert.equal(/await fetch\(/.test(wa), false, 'wa-gateway.cjs masih memakai fetch mentah')
  assert.match(wa, /label: 'Webhook WhatsApp \(baileys\)'/)
  assert.match(wa, /label: 'URL API Sidobe'/)
})

test('rute tulis memvalidasi URL milik tenant sebelum disimpan', () => {
  const server = read('server/index.cjs')
  assert.match(server, /require\('\.\/ssrf-guard\.cjs'\)/)
  assert.match(server, /await assertSafeOutboundUrl\(nextEndpoint, 'Endpoint AI'\)/)
  assert.match(server, /await assertSafeOutboundUrl\(baileys_webhook, 'Webhook WhatsApp'\)/)
  assert.match(server, /await assertSafeOutboundUrl\(sidobe_api_url, 'URL API Sidobe'\)/)
})

test('kunci AI tersimpan tidak dikirim ke endpoint/penyedia yang berbeda', () => {
  const server = read('server/index.cjs')
  assert.match(server, /Isi ulang API key saat mengubah penyedia atau endpoint AI/)
  assert.match(server, /const endpointChanged = Boolean\(existing && existing\.api_key_encrypted\)/)
})

test('pendaftaran dan reset password dibatasi lajunya', () => {
  const server = read('server/index.cjs')
  assert.match(server, /const accountLimiter = rateLimit/)
  assert.match(server, /app\.post\('\/api\/auth\/register', accountLimiter,/)
  assert.match(server, /app\.post\('\/api\/auth\/forgot-password', accountLimiter,/)
})

test('modul penjaga ikut terkirim oleh pipeline deploy', () => {
  for (const script of ['scripts/deploy-staging.sh', 'scripts/promote-live.sh']) {
    const source = read(script)
    assert.match(source, /server\/\*\.cjs/, `${script} tidak menyertakan server/*.cjs`)
  }
  assert.equal(fs.existsSync(path.join(root, 'server/ssrf-guard.cjs')), true)
})