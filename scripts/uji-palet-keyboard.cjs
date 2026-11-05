'use strict'
// Uji nyata: palette Ctrl+K harus bisa dipilih dengan panah + Enter.
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const BASE = process.env.BASE || 'https://jurnal.mtsplussd7.cc.cd'
const TOKEN = fs.readFileSync('/tmp/tok-kbd.txt', 'utf8').trim()

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/home/aljadugh/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.evaluate((tok) => {
    localStorage.setItem('jurnalku_token', tok)
    localStorage.setItem('jurnalku_user', JSON.stringify({ id: 'uji-kbd', nama: 'Uji Kbd', email: 'uji-kbd@uji.id', role: 'admin', tenant_id: 'mtsplussd7' }))
  }, TOKEN)

  const hasil = {}

  // 1) Ketik lalu Enter -> menu pertama
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, 1200))
  await page.keyboard.down('Control'); await page.keyboard.press('KeyK'); await page.keyboard.up('Control')
  await new Promise(r => setTimeout(r, 300))
  hasil.palet_terbuka = await page.$('[aria-label="Cari menu"]') !== null
  await page.keyboard.type('jurnal', { delay: 40 })
  await new Promise(r => setTimeout(r, 300))
  hasil.label_pertama = await page.evaluate(() => document.querySelector('[data-sorot="true"]')?.innerText?.trim() || '')
  await page.keyboard.press('Enter')
  await new Promise(r => setTimeout(r, 900))
  hasil.url_setelah_enter = new URL(page.url()).pathname
  hasil.palet_tertutup = await page.$('[aria-label="Cari menu"]') === null

  // 2) Panah bawah 3x lalu Enter -> baris keempat
  await page.keyboard.down('Control'); await page.keyboard.press('KeyK'); await page.keyboard.up('Control')
  await new Promise(r => setTimeout(r, 300))
  const labelAwal = await page.evaluate(() => document.querySelector('[data-sorot="true"]')?.innerText?.trim() || '')
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowDown'); await new Promise(r => setTimeout(r, 80)) }
  hasil.label_setelah_panah = await page.evaluate(() => document.querySelector('[data-sorot="true"]')?.innerText?.trim() || '')
  await page.keyboard.press('Enter')
  await new Promise(r => setTimeout(r, 900))
  hasil.url_setelah_panah_enter = new URL(page.url()).pathname
  hasil.panah_menggeser_sorotan = labelAwal !== hasil.label_setelah_panah

  console.log(JSON.stringify(hasil, null, 1))
  await browser.close()
  const gagal = !hasil.palet_terbuka || hasil.url_setelah_enter === '/admin' || !hasil.panah_menggeser_sorotan
  process.exit(gagal ? 2 : 0)
})().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
