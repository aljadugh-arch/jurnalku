'use strict'
// Uji nyata: perangkat dengan token + profil tersimpan, tetapi /auth/me gagal
// (jaringan buruk). Aplikasi harus tetap terbuka, bukan tertahan di
// "Memuat sesi...".
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const TOKEN = fs.readFileSync('/tmp/tok-sesi.txt', 'utf8').trim()

const BASE = process.env.BASE || 'https://jurnal.mtsplussd7.cc.cd'

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/home/aljadugh/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })

  // Gagalkan /auth/me seolah jaringan buruk.
  await page.setRequestInterception(true)
  page.on('request', req => {
    if (req.url().includes('/api/auth/me')) return req.abort('failed')
    req.continue()
  })

  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.evaluate((tok) => {
    localStorage.setItem('jurnalku_token', tok)
    localStorage.setItem('jurnalku_user', JSON.stringify({
      id: 'uji-sesi', nama: 'Uji Sesi', email: 'uji@uji.id', role: 'admin', tenant_id: 'mtsplussd7',
    }))
  }, TOKEN)

  const mulai = Date.now()
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, 2500))
  const teks = await page.evaluate(() => document.body.innerText)
  const url = page.url()
  const sisa = await page.evaluate(() => ({
    token: !!localStorage.getItem('jurnalku_token'),
    cache: !!localStorage.getItem('jurnalku_user'),
    path: location.pathname,
  }))
  const detik = ((Date.now() - mulai) / 1000).toFixed(1)

  const hasil = {
    detik: Number(detik),
    tertahan_memuat_sesi: /Memuat sesi/i.test(teks),
    tampil_banner: /Koneksi terganggu/i.test(teks),
    ada_tombol_coba_lagi: /Coba lagi/i.test(teks),
    url, sisa,
    cuplikan: teks.replace(/\s+/g, ' ').slice(0, 160),
  }
  console.log(JSON.stringify(hasil, null, 1))
  await browser.close()
  if (hasil.tertahan_memuat_sesi) process.exit(2)
})().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
