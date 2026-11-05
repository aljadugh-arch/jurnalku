'use strict'
// HTML awal (yang dibaca crawler tanpa menjalankan JS) harus berisi penjelasan
// nyata, bukan 90 kata. Juga harus ada FAQPage JSON-LD di halaman platform.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')

const root = path.join(__dirname, '..')

async function boot() {
  const dbFile = path.join(os.tmpdir(), `jk-crawl-${process.pid}-${Date.now()}.db`)
  const port = 51900 + Math.floor(Math.random() * 200)
  const proc = spawn(process.execPath, ['server/index.cjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DB_PATH: dbFile, JWT_SECRET: 'k'.repeat(40), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  proc.stdout.on('data', d => { out += d.toString() })
  proc.stderr.on('data', d => { out += d.toString() })
  const batas = Date.now() + 60000
  while (Date.now() < batas && !/running/i.test(out)) await new Promise(r => setTimeout(r, 150))
  if (!/running/i.test(out)) { try { proc.kill('SIGKILL') } catch { /* abaikan */ } assert.fail('server gagal start: ' + out.slice(-400)) }
  return { proc, port }
}

function kataTerlihat(html) {
  const tanpaScript = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  return tanpaScript.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').split(/\s+/).filter(Boolean).length
}

test('HTML awal halaman platform berisi teks yang cukup untuk crawler', async (t) => {
  const { proc, port } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch { /* abaikan */ } })
  const html = await fetch(`http://127.0.0.1:${port}/`).then(r => r.text())
  const jumlah = kataTerlihat(html)
  assert.ok(jumlah > 400, `harus lebih dari 400 kata, dapat ${jumlah}`)
  for (const bagian of ['Apa itu JURNALKU', 'Fitur utama', 'Untuk siapa', 'Cara mulai', 'Pertanyaan yang sering diajukan']) {
    assert.ok(html.includes(bagian), `memuat bagian "${bagian}"`)
  }
  assert.match(html, /<h1>/, 'ada h1')
  assert.match(html, /Jurnal mengajar/)
  assert.match(html, /QR ruang kelas permanen/)
})

test('halaman platform menyertakan FAQPage JSON-LD', async (t) => {
  const { proc, port } = await boot()
  t.after(() => { try { proc.kill('SIGKILL') } catch { /* abaikan */ } })
  const html = await fetch(`http://127.0.0.1:${port}/`).then(r => r.text())
  assert.match(html, /"@type":"FAQPage"/)
  assert.match(html, /"@type":"Question"/)
  assert.match(html, /"@type":"Answer"/)
  // JSON-LD harus JSON yang sah.
  const blok = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1])
  for (const b of blok) JSON.parse(b)
})

test('teks crawler tidak mengganggu pengunjung: berada di dalam #root', () => {
  const src = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')
  assert.match(src, /const isiCrawler = `<div id="root">/)
  assert.match(src, /hasil\.replace\(\/<div id="root"><\\\/div>\/, isiCrawler\)/)
})
