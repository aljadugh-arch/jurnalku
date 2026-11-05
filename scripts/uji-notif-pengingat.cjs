'use strict'
// Uji nyata: kartu "Pengingat Absensi Mapel" muncul di Pengaturan Notifikasi.
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const BASE = process.env.BASE || 'https://jurnal.mtsplussd7.cc.cd'
const TOKEN = fs.readFileSync('/tmp/tok-notif.txt', 'utf8').trim()

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/home/aljadugh/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,1000'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 1000 })
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.evaluate((tok) => {
    localStorage.setItem('jurnalku_token', tok)
    localStorage.setItem('jurnalku_user', JSON.stringify({ id: 'uji-notif', nama: 'Uji Notif', email: 'uji-notif@uji.id', role: 'admin', tenant_id: 'mtsplussd7' }))
  }, TOKEN)

  await page.goto(BASE + '/admin/notif-settings', { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, 3000))
  const hasil = await page.evaluate(() => {
    const teks = document.body.innerText.replace(/\s+/g, ' ')
    return {
      path: location.pathname,
      ada_kartu: /Pengingat Absensi Mapel/.test(teks),
      ada_template: /absensi mapel \{mapel\}/i.test(teks) || /Variabel:.*mapel/i.test(teks),
      ada_sakelar: !!document.querySelector('[aria-label="Pengingat Absensi Mapel"]'),
      cuplikan: teks.slice(0, 200),
    }
  })
  console.log(JSON.stringify(hasil, null, 1))
  await browser.close()
  process.exit(hasil.ada_kartu && hasil.ada_sakelar ? 0 : 2)
})().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
