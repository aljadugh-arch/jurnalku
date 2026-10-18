'use strict'
// Verifikasi domain + submit sitemap ke Google Search Console lewat API resmi.
//
// Dijalankan di VPS produksi (butuh DB + kredensial + enkripsi JWT_SECRET).
//
//   node scripts/search-console.cjs token          -> minta token verifikasi, tulis berkas ke public/
//   node scripts/search-console.cjs verifikasi     -> verifikasi domain (butuh berkas sudah ter-deploy)
//   node scripts/search-console.cjs sitemap        -> submit sitemap semua domain
//   node scripts/search-console.cjs status         -> daftar properti yang sudah terdaftar
//
// Kenapa begini: Google hanya menerima berkas verifikasi yang tokennya DIA
// terbitkan. Token itu didapat lewat siteVerification.getToken, bukan dikarang.
// Setelah token didapat, berkasnya ditulis ke public/, deploy, lalu domain
// didaftarkan lewat siteVerification.insert (yang sekaligus memverifikasi).
const path = require('node:path')
const fs = require('node:fs')

const AKAR = path.join(__dirname, '..')
process.chdir(AKAR)
try { require('dotenv').config({ path: path.join(AKAR, 'server', '.env') }) } catch {}

// JWT_SECRET di produksi TIDAK ada di server/.env — di-set lewat environment
// PM2. Tanpa kunci ini, encryptSecret/decryptSecret tidak bisa jalan dan token
// Google yang tersimpan tidak terbaca. Ambil dari proses yang sedang hidup
// (read-only, tidak menulis apa pun ke proses itu).
if (!process.env.JWT_SECRET) {
  try {
    const { execSync } = require('node:child_process')
    const pid = execSync("pgrep -f 'server/index.cjs' | head -1", { encoding: 'utf8' }).trim()
    if (pid) {
      const env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8')
      const baris = env.split('\0').find(l => l.startsWith('JWT_SECRET='))
      if (baris) process.env.JWT_SECRET = baris.slice('JWT_SECRET='.length)
    }
  } catch { /* biarkan gagal di bawah dengan pesan jelas */ }
}
if (!process.env.JWT_SECRET) {
  console.error('GAGAL: JWT_SECRET tidak ditemukan (dibutuhkan untuk membuka token Google).')
  process.exit(1)
}

const Database = require('better-sqlite3')
const { decryptSecret } = require(path.join(AKAR, 'server', 'ai-config.cjs'))

const DB = new Database(path.join(AKAR, 'server', 'jurnalku.db'), { readonly: false })
const PERINTAH = process.argv[2] || 'status'

// Domain yang diverifikasi. Domain lembaga dulu (kontennya unik), lalu domain
// platform. Bisa dibatasi lewat argumen: node scripts/search-console.cjs token jurnal.cc.cd
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

const domainDiminta = process.argv.slice(3).filter(a => a.includes('.'))
const DOMAIN = domainDiminta.length ? domainDiminta : SEMUA_DOMAIN

const tokenTersimpan = () => {
  const row = DB.prepare(`SELECT refresh_token_encrypted FROM search_console_token WHERE id='default'`).get()
  if (!row) throw new Error('Belum ada izin Google. Buka /api/search-console/hubungkan dulu di browser.')
  const rt = decryptSecret(row.refresh_token_encrypted)
  if (!rt) throw new Error('Refresh token tidak bisa didekripsi (JWT_SECRET berubah?). Ulangi hubungkan.')
  return rt
}

const ambilAccessToken = async () => {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: tokenTersimpan(),
      grant_type: 'refresh_token',
    }),
  })
  const j = await res.json()
  if (!res.ok) {
    // invalid_grant = refresh token kedaluwarsa/dicabut. Aplikasi OAuth dalam
    // status "Testing" memang membatasi refresh token 7 hari.
    throw new Error(`Gagal ambil access token: ${j.error || res.status} ${j.error_description || ''}`.trim())
  }
  return j.access_token
}

const api = async (metode, url, token, body) => {
  const res = await fetch(url, {
    method: metode,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const teks = await res.text()
  let isi = null
  try { isi = teks ? JSON.parse(teks) : null } catch { isi = teks }
  return { ok: res.ok, status: res.status, isi }
}

const jalankan = async () => {
  const token = await ambilAccessToken()
  console.log('Access token Google: OK\n')

  if (PERINTAH === 'status') {
    const r = await api('GET', 'https://www.googleapis.com/webmasters/v3/sites', token)
    const daftar = r.isi?.siteEntry || []
    console.log(`Properti terdaftar di Search Console: ${daftar.length}`)
    for (const s of daftar) console.log(`  ${s.siteUrl}   (${s.permissionLevel})`)
    return
  }

  if (PERINTAH === 'token') {
    // Metode FILE: Google memberi token, kita tulis berkasnya ke public/.
    // Berkas harus di-deploy SEBELUM verifikasi bisa jalan.
    const hasil = []
    for (const d of DOMAIN) {
      const r = await api('POST', 'https://www.googleapis.com/siteVerification/v1/token', token, {
        site: { type: 'SITE', identifier: `https://${d}/` },
        verificationMethod: 'FILE',
      })
      if (!r.ok) {
        console.log(`  ${d.padEnd(30)} GAGAL  ${r.status} ${JSON.stringify(r.isi).slice(0, 120)}`)
        hasil.push({ d, ok: false })
        continue
      }
      const t = r.isi.token
      // Token berbentuk "google" + 16 hex. Nama berkas = token + ".html",
      // isi berkas = "google-site-verification: " + token + ".html"
      const namaBerkas = `${t}.html`
      fs.writeFileSync(path.join(AKAR, 'public', namaBerkas), `google-site-verification: ${namaBerkas}\n`)
      console.log(`  ${d.padEnd(30)} token didapat -> public/${namaBerkas}`)
      hasil.push({ d, ok: true, berkas: namaBerkas })
    }
    const ok = hasil.filter(h => h.ok).length
    console.log(`\n${ok}/${DOMAIN.length} token didapat. Berkas ditulis ke public/.`)
    console.log('LANGKAH BERIKUT: deploy dulu, baru jalankan "verifikasi".')
    return
  }

  if (PERINTAH === 'verifikasi') {
    let ok = 0
    for (const d of DOMAIN) {
      // siteVerification.insert sekaligus memverifikasi. Kalau berkas belum
      // ter-deploy, Google membalas 400 "verification failed".
      const r = await api('POST', 'https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=FILE', token, {
        site: { type: 'SITE', identifier: `https://${d}/` },
      })
      if (r.ok) {
        console.log(`  ${d.padEnd(30)} TERVERIFIKASI  (${r.isi?.owners?.join(',') || 'ok'})`)
        ok++
      } else {
        const pesan = JSON.stringify(r.isi?.error?.message || r.isi).slice(0, 150)
        console.log(`  ${d.padEnd(30)} GAGAL ${r.status}  ${pesan}`)
      }
    }
    console.log(`\n${ok}/${DOMAIN.length} domain terverifikasi.`)
    return
  }

  if (PERINTAH === 'sitemap') {
    let ok = 0
    for (const d of DOMAIN) {
      const r = await api('PUT', `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(`https://${d}/`)}/sitemaps/${encodeURIComponent(`https://${d}/sitemap.xml`)}`, token)
      if (r.ok) { console.log(`  ${d.padEnd(30)} sitemap terkirim`); ok++ }
      else console.log(`  ${d.padEnd(30)} GAGAL ${r.status}  ${JSON.stringify(r.isi).slice(0, 130)}`)
    }
    console.log(`\n${ok}/${DOMAIN.length} sitemap terkirim.`)
    return
  }

  console.log('Perintah tidak dikenal. Pakai: token | verifikasi | sitemap | status')
}

jalankan().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
