#!/usr/bin/env node
'use strict'
// Laporan mingguan Google Search Console untuk semua properti.
//
//   GSC_SA_JSON=/root/gsc-sa.json node scripts/gsc-laporan.cjs [--hari 28] [--keluar /var/log/jurnalku-seo]
//
// Hasil: satu berkas JSON + satu ringkasan teks per tanggal, berisi total klik,
// tayangan, CTR, posisi rata-rata, 20 kueri teratas, dan 20 halaman teratas.
// Data Search Console tertinggal ±2 hari, jadi rentang berakhir H-2.

const fs = require('node:fs')
const path = require('node:path')
const jwt = require('jsonwebtoken')

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/webmasters/v3'

function arg(nama, bawaan) {
  const i = process.argv.indexOf(nama)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : bawaan
}

function tanggal(d) { return d.toISOString().slice(0, 10) }

async function token() {
  const jalur = process.env.GSC_SA_JSON
  if (!jalur) throw new Error('GSC_SA_JSON belum diisi')
  const k = JSON.parse(fs.readFileSync(jalur, 'utf8'))
  const now = Math.floor(Date.now() / 1000)
  const assertion = jwt.sign(
    { iss: k.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 },
    k.private_key, { algorithm: 'RS256' },
  )
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`token gagal (${r.status}): ${j.error_description || j.error}`)
  return j.access_token
}

async function daftarSitus(tok) {
  const r = await fetch(`${API}/sites`, { headers: { Authorization: `Bearer ${tok}` } })
  const j = await r.json()
  if (!r.ok) throw new Error(`sites gagal: ${j.error?.message || r.status}`)
  return (j.siteEntry || []).map(s => s.siteUrl)
}

async function kueri(tok, situs, dimensi, mulai, akhir, baris = 20) {
  const r = await fetch(`${API}/sites/${encodeURIComponent(situs)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: mulai, endDate: akhir, dimensions: dimensi ? [dimensi] : [], rowLimit: baris }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error?.message || `kueri ${r.status}`)
  return j.rows || []
}

const angka = n => (n == null ? 0 : Math.round(n * 100) / 100)
const persen = n => `${(n * 100).toFixed(2)}%`

;(async () => {
  try {
    const hari = Number(arg('--hari', '28'))
    const keluar = arg('--keluar', '/var/log/jurnalku-seo')
    const akhir = new Date(Date.now() - 2 * 86400000)
    const mulai = new Date(akhir.getTime() - (hari - 1) * 86400000)
    const tok = await token()
    const situs = await daftarSitus(tok)

    fs.mkdirSync(keluar, { recursive: true })
    const cap = tanggal(new Date())
    const semua = { dibuat: new Date().toISOString(), mulai: tanggal(mulai), akhir: tanggal(akhir), situs: [] }
    const baris = [`LAPORAN SEO — ${tanggal(mulai)} s/d ${tanggal(akhir)}`, '']

    for (const s of situs) {
      try {
        const total = (await kueri(tok, s, null, tanggal(mulai), tanggal(akhir), 1))[0] || {}
        const kueriAtas = (await kueri(tok, s, 'query', tanggal(mulai), tanggal(akhir), 20))
          .map(r => ({ kueri: r.keys[0], klik: r.clicks, tayangan: r.impressions, ctr: angka(r.ctr), posisi: angka(r.position) }))
        const halamanAtas = (await kueri(tok, s, 'page', tanggal(mulai), tanggal(akhir), 20))
          .map(r => ({ halaman: r.keys[0], klik: r.clicks, tayangan: r.impressions, ctr: angka(r.ctr), posisi: angka(r.position) }))

        const rec = {
          situs: s,
          klik: total.clicks || 0,
          tayangan: total.impressions || 0,
          ctr: angka(total.ctr),
          posisi: angka(total.position),
          kueri_atas: kueriAtas,
          halaman_atas: halamanAtas,
        }
        semua.situs.push(rec)

        baris.push(`${s}`)
        baris.push(`  klik=${rec.klik}  tayangan=${rec.tayangan}  ctr=${persen(rec.ctr)}  posisi=${rec.posisi || '-'}`)
        if (kueriAtas.length) {
          baris.push('  kueri teratas:')
          for (const k of kueriAtas.slice(0, 8)) baris.push(`    ${String(k.klik).padStart(4)} klik | ${String(k.tayangan).padStart(6)} tayangan | ${String(k.posisi).padStart(5)} | ${k.kueri}`)
        } else {
          baris.push('  kueri teratas: (belum ada data)')
        }
        if (halamanAtas.length) {
          baris.push('  halaman teratas:')
          for (const h of halamanAtas.slice(0, 5)) baris.push(`    ${String(h.klik).padStart(4)} klik | ${String(h.tayangan).padStart(6)} tayangan | ${h.halaman}`)
        }
        baris.push('')
      } catch (e) {
        semua.situs.push({ situs: s, galat: e.message })
        baris.push(`${s}\n  GAGAL: ${e.message}\n`)
      }
    }

    const totalKlik = semua.situs.reduce((n, s) => n + (s.klik || 0), 0)
    const totalTayang = semua.situs.reduce((n, s) => n + (s.tayangan || 0), 0)
    baris.push(`TOTAL: klik=${totalKlik}  tayangan=${totalTayang}  properti=${semua.situs.length}`)

    fs.writeFileSync(path.join(keluar, `seo-${cap}.json`), JSON.stringify(semua, null, 2))
    fs.writeFileSync(path.join(keluar, `seo-${cap}.txt`), baris.join('\n'))
    fs.writeFileSync(path.join(keluar, 'terbaru.txt'), baris.join('\n'))
    console.log(baris.join('\n'))
  } catch (e) {
    console.error('GAGAL:', e.message)
    process.exit(1)
  }
})()
