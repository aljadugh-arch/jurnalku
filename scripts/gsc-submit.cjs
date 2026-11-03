#!/usr/bin/env node
'use strict'
// Kirim sitemap ke Google Search Console lewat Search Console API.
//
// Tanpa dependensi berat: JWT service account ditandatangani dengan jsonwebtoken
// (sudah ada di proyek), lalu ditukar jadi access token di oauth2.googleapis.com.
//
// Pakai:
//   GSC_SA_JSON=/path/service-account.json node scripts/gsc-submit.cjs
//   GSC_SA_JSON=... node scripts/gsc-submit.cjs --daftar
//   GSC_SA_JSON=... node scripts/gsc-submit.cjs https://jurnalku.biz.id/
//
// Prasyarat di sisi Google (sekali saja):
//   1. Buat service account, unduh kunci JSON.
//   2. Search Console -> Settings -> Users and permissions -> Add user
//      tempel email service account (…@….iam.gserviceaccount.com), izin Full.
//   3. Ulangi untuk setiap properti/domain.

const fs = require('node:fs')
const jwt = require('jsonwebtoken')

const SCOPE = 'https://www.googleapis.com/auth/webmasters'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/webmasters/v3'

function muatKunci() {
  const jalur = process.env.GSC_SA_JSON
  if (!jalur) {
    console.error('GSC_SA_JSON belum diisi. Contoh: GSC_SA_JSON=/root/gsc.json node scripts/gsc-submit.cjs')
    process.exit(2)
  }
  const k = JSON.parse(fs.readFileSync(jalur, 'utf8'))
  if (!k.client_email || !k.private_key) {
    console.error('File JSON bukan kunci service account yang sah (client_email/private_key kosong).')
    process.exit(2)
  }
  return k
}

async function token(k) {
  const now = Math.floor(Date.now() / 1000)
  const assertion = jwt.sign(
    { iss: k.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 },
    k.private_key,
    { algorithm: 'RS256' },
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
  if (!r.ok) throw new Error(`sites gagal (${r.status}): ${j.error?.message || ''}`)
  return (j.siteEntry || []).map(s => ({ situs: s.siteUrl, izin: s.permissionLevel }))
}

async function kirimSitemap(tok, situs, sitemap) {
  const url = `${API}/sites/${encodeURIComponent(situs)}/sitemaps/${encodeURIComponent(sitemap)}`
  const r = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${tok}`, 'Content-Length': '0' } })
  const teks = await r.text()
  if (!r.ok) throw new Error(`submit gagal (${r.status}): ${teks.slice(0, 300)}`)
  return r.status
}

;(async () => {
  try {
    const k = muatKunci()
    const tok = await token(k)
    const arg = process.argv.slice(2)

    if (arg.includes('--daftar') || arg.length === 0) {
      const situs = await daftarSitus(tok)
      if (!situs.length) {
        console.log('Tidak ada properti yang bisa diakses service account ini.')
        console.log(`Tambahkan ${k.client_email} sebagai user (izin Full) di Search Console tiap domain.`)
        return
      }
      for (const s of situs) console.log(`${s.izin.padEnd(12)} ${s.situs}`)
      return
    }

    for (const situs of arg) {
      const sitemap = situs.replace(/\/?$/, '/') + 'sitemap.xml'
      const status = await kirimSitemap(tok, situs, sitemap)
      console.log(`${status} ${situs} -> ${sitemap}`)
    }
  } catch (e) {
    console.error('GAGAL:', e.message)
    process.exit(1)
  }
})()
