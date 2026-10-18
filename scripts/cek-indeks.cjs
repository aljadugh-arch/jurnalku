'use strict'
// Pelacak status indeks Google Search Console — dari waktu ke waktu.
//
//   node scripts/cek-indeks.cjs              -> periksa semua URL, simpan, bandingkan dengan run sebelumnya
//   node scripts/cek-indeks.cjs --ringkas    -> hanya ringkasan (tanpa rincian per URL)
//   node scripts/cek-indeks.cjs --domain jurnal.cc.cd   -> batasi satu domain
//
// Kenapa ada: submit sitemap TIDAK berarti terindeks. Status tiap URL bergerak
// pelan (Discovered -> Crawled -> Indexed) dalam hitungan hari sampai minggu,
// jadi yang berguna bukan satu kali cek, tapi catatan perkembangannya.
//
// Sumber kebenaran = URL Inspection API (bagian Google Search Console API).
// Hasil disimpan di tabel index_status supaya bisa dibandingkan antar run.
//
// Butuh: token OAuth di tabel search_console_token (dari
// /api/search-console/hubungkan) + JWT_SECRET untuk mendekripsinya.
const path = require('node:path')
const fs = require('node:fs')

const AKAR = path.join(__dirname, '..')
process.chdir(AKAR)
try { require('dotenv').config({ path: path.join(AKAR, 'server', '.env') }) } catch {}

// JWT_SECRET di produksi hanya ada di environment PM2, bukan di server/.env.
if (!process.env.JWT_SECRET) {
  try {
    const pid = require('node:child_process').execSync("pgrep -f 'server/index.cjs' | head -1", { encoding: 'utf8' }).trim()
    if (pid) {
      const baris = fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').find(l => l.startsWith('JWT_SECRET='))
      if (baris) process.env.JWT_SECRET = baris.slice('JWT_SECRET='.length)
    }
  } catch { /* ditangani di bawah */ }
}
if (!process.env.JWT_SECRET) {
  console.error('GAGAL: JWT_SECRET tidak ditemukan (dibutuhkan untuk membuka token Google).')
  process.exit(1)
}

const Database = require('better-sqlite3')
const { decryptSecret } = require(path.join(AKAR, 'server', 'ai-config.cjs'))
const db = new Database(path.join(AKAR, 'server', 'jurnalku.db'))

db.prepare(`CREATE TABLE IF NOT EXISTS index_status (
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  verdict TEXT NOT NULL DEFAULT '',
  coverage TEXT NOT NULL DEFAULT '',
  crawled_at TEXT,
  google_canonical TEXT,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (url, checked_at)
)`).run()
db.prepare(`CREATE INDEX IF NOT EXISTS idx_index_status_domain ON index_status(domain, checked_at)`).run()

const arg = process.argv.slice(2)
const RINGKAS = arg.includes('--ringkas')
const hanyaDomain = (() => { const i = arg.indexOf('--domain'); return i >= 0 ? arg[i + 1] : null })()

const SEMUA_DOMAIN = [
  'jurnal.mtsplussd7.cc.cd',
  'jurnal.mimifdangimbang.my.id',
  'jurnal.sb1official.web.id',
  'jurnal.cc.cd',
  'jurnalmadrasah.web.id',
  'jurnalku.biz.id',
  'idjurnal.my.id',
  'idjurnal.web.id',
  'idjurnal.biz.id',
]
const DOMAIN = hanyaDomain ? [hanyaDomain] : SEMUA_DOMAIN

const tokenTersimpan = () => {
  const row = db.prepare("SELECT refresh_token_encrypted FROM search_console_token WHERE id='default'").get()
  if (!row) throw new Error('Belum ada izin Google. Buka /api/search-console/hubungkan dulu.')
  const rt = decryptSecret(row.refresh_token_encrypted)
  if (!rt) throw new Error('Refresh token tidak bisa didekripsi (JWT_SECRET berubah?). Ulangi hubungkan.')
  return rt
}

const ambilSitemap = async (d) => {
  try {
    const r = await fetch(`https://${d}/sitemap.xml`, { signal: AbortSignal.timeout(20000) })
    const t = await r.text()
    return [...t.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
  } catch { return [] }
}

// Run sebelumnya = checked_at terakhir yang berbeda dari sekarang.
const runSebelumnya = () => {
  const r = db.prepare('SELECT MAX(checked_at) AS t FROM index_status').get()
  return r?.t || null
}

const jalankan = async () => {
  const tr = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: tokenTersimpan(),
      grant_type: 'refresh_token',
    }),
  })
  const tj = await tr.json()
  if (!tj.access_token) throw new Error(`Gagal ambil access token: ${tj.error || tr.status} ${tj.error_description || ''}`.trim())

  const sebelumnya = runSebelumnya()
  const petaLama = new Map()
  if (sebelumnya) {
    for (const r of db.prepare('SELECT url, verdict, coverage FROM index_status WHERE checked_at = ?').all(sebelumnya)) {
      petaLama.set(r.url, r)
    }
  }

  const sekarang = new Date().toISOString()
  const simpan = db.prepare(`INSERT INTO index_status (url, domain, verdict, coverage, crawled_at, google_canonical, checked_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(url, checked_at) DO UPDATE SET verdict=excluded.verdict, coverage=excluded.coverage,
      crawled_at=excluded.crawled_at, google_canonical=excluded.google_canonical`)

  const hasil = []
  for (const d of DOMAIN) {
    const urls = await ambilSitemap(d)
    if (!RINGKAS) console.log(`\n=== ${d}  (${urls.length} URL) ===`)
    for (const u of urls) {
      const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tj.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionUrl: u, siteUrl: `https://${d}/` }),
      })
      const teks = await res.text()
      let isi = null
      try { isi = JSON.parse(teks) } catch { isi = null }

      if (!res.ok || !isi) {
        const pesan = (isi?.error?.message) || teks.slice(0, 110)
        if (!RINGKAS) console.log(`  ✖ ${u.replace('https://' + d, '') || '/'}  HTTP ${res.status}  ${pesan}`)
        hasil.push({ d, u, verdict: 'ERROR', coverage: pesan, crawled_at: null, google_canonical: null })
        continue
      }

      const st = isi.inspectionResult?.indexStatusResult || {}
      const verdict = st.verdict || 'UNKNOWN'
      const coverage = st.coverageState || '-'
      const crawled = st.lastCrawlTime ? String(st.lastCrawlTime).slice(0, 10) : null
      const gcanon = st.googleCanonical || null

      simpan.run(u, d, verdict, coverage, crawled, gcanon, sekarang)
      hasil.push({ d, u, verdict, coverage, crawled_at: crawled, google_canonical: gcanon })

      if (!RINGKAS) {
        const label = verdict === 'PASS' ? '✓ TERINDEKS' : (verdict === 'NEUTRAL' ? '… BELUM' : '✖ TIDAK')
        const lama = petaLama.get(u)
        const naik = lama && lama.verdict !== 'PASS' && verdict === 'PASS' ? '   <<< BARU TERINDEKS' : ''
        console.log(`  ${label.padEnd(12)} ${(u.replace('https://' + d, '') || '/').padEnd(52)} ${coverage}${naik}`)
      }
      await new Promise(x => setTimeout(x, 250))
    }
  }

  // Ringkasan + perbandingan
  const total = hasil.length
  const terindeks = hasil.filter(h => h.verdict === 'PASS').length
  const belum = hasil.filter(h => h.verdict === 'NEUTRAL').length
  const error = hasil.filter(h => h.verdict === 'ERROR').length

  console.log('\n' + '='.repeat(62))
  console.log(`TERINDEKS ${terindeks}   BELUM ${belum}   GAGAL CEK ${error}   TOTAL ${total}`)

  if (sebelumnya) {
    const baru = hasil.filter(h => h.verdict === 'PASS' && petaLama.get(h.u)?.verdict !== 'PASS')
    const hilang = [...petaLama.keys()].filter(u => !hasil.some(h => h.u === u))
    const turun = hasil.filter(h => h.verdict !== 'PASS' && petaLama.get(h.u)?.verdict === 'PASS')
    console.log(`\nDibanding pemeriksaan sebelumnya (${sebelumnya.slice(0, 10)}):`)
    console.log(`  naik jadi terindeks : ${baru.length}`)
    for (const h of baru) console.log(`    + ${h.u}`)
    console.log(`  turun dari terindeks: ${turun.length}`)
    for (const h of turun) console.log(`    - ${h.u}  (${h.coverage})`)
    if (hilang.length) console.log(`  URL hilang dari sitemap: ${hilang.length}`)
  } else {
    console.log('\nIni pemeriksaan PERTAMA — belum ada pembanding. Jalankan lagi nanti untuk melihat perkembangan.')
  }

  const per = {}
  for (const h of hasil) {
    per[h.d] = per[h.d] || { total: 0, terindeks: 0 }
    per[h.d].total++
    if (h.verdict === 'PASS') per[h.d].terindeks++
  }
  console.log('\nPER DOMAIN:')
  for (const [d, v] of Object.entries(per)) {
    console.log(`  ${d.padEnd(32)} ${v.terindeks}/${v.total} terindeks`)
  }
}

jalankan().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
