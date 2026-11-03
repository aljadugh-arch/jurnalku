#!/usr/bin/env node
'use strict'
// Kirim ulang sitemap ke IndexNow (Bing, Yandex, Seznam, Naver) sekali sehari.
// Dipakai cron VPS: node scripts/indexnow-harian.cjs >> /var/log/jurnalku-indexnow.log 2>&1
//
// Kenapa perlu: IndexNow tidak punya antrean permanen. URL baru cepat terkirim
// lewat hook posting, tetapi sitemap yang berubah (mis. profil lembaga diperkaya)
// hanya terkirim bila kita dorong ulang.

const path = require('node:path')
const fs = require('node:fs')

const KEY = process.env.INDEXNOW_KEY || 'adc9a32340e681107188ff4d34c812c7'
const DB = process.env.DB_PATH || path.join(__dirname, '..', 'server', 'jurnalku.db')
const TETAP = ['jurnalku.biz.id', 'jurnalmadrasah.web.id', 'idjurnal.web.id']

function daftarHost() {
  const set = new Set(TETAP)
  try {
    const Database = require('better-sqlite3')
    const db = new Database(DB, { readonly: true, fileMustExist: true })
    for (const r of db.prepare("SELECT domain_custom FROM tenants WHERE aktif=1 AND domain_custom IS NOT NULL AND domain_custom<>''").all()) {
      set.add(String(r.domain_custom).replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    }
    db.close()
  } catch (e) {
    console.error('DB tidak terbaca:', e.message)
  }
  return [...set]
}

async function sitemap(host) {
  const r = await fetch(`https://${host}/sitemap.xml`, { headers: { 'User-Agent': 'JURNALKU-IndexNow/1.0' }, signal: AbortSignal.timeout(25000) })
  if (!r.ok) throw new Error(`sitemap ${r.status}`)
  const xml = await r.text()
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
}

async function kirim(host) {
  const semua = await sitemap(host)
  const urls = semua.filter(u => u.startsWith(`https://${host}/`))
  if (!urls.length) return { host, urls: 0, status: 'lewati', catatan: 'sitemap menunjuk host kanonik lain' }
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: KEY, keyLocation: `https://${host}/${KEY}.txt`, urlList: urls }),
    signal: AbortSignal.timeout(30000),
  })
  return { host, urls: urls.length, status: r.status }
}

;(async () => {
  const waktu = new Date().toISOString()
  let total = 0
  for (const host of daftarHost()) {
    try {
      const h = await kirim(host)
      if (h.urls) total += h.urls
      console.log(`${waktu} ${host} url=${h.urls} status=${h.status}${h.catatan ? ' (' + h.catatan + ')' : ''}`)
    } catch (e) {
      console.log(`${waktu} ${host} GAGAL ${e.message}`)
    }
  }
  console.log(`${waktu} selesai total_url=${total}`)
  fs.appendFileSync('/dev/null', '')
})()
