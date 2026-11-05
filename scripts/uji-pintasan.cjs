'use strict'
// Uji nyata pintasan: Ctrl+K (palet + filter), Esc, Alt+3 (menu ketiga).
const fs = require('fs')
const puppeteer = require('puppeteer-core')
const BASE = 'https://jurnal.mtsplussd7.cc.cd'
const TOKEN = fs.readFileSync('/tmp/shortcut-token.txt', 'utf8').trim()
const EXE = '/home/aljadugh/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome'

;(async () => {
  const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 900 })
  const galat = []
  page.on('pageerror', e => galat.push(String(e.message).slice(0, 120)))
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 60000 })
  await page.evaluate((tok) => { localStorage.setItem('jurnalku_token', tok); localStorage.setItem('token', tok) }, TOKEN)
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise(r => setTimeout(r, 2500))

  const adaPalet = () => page.evaluate(() => !!document.querySelector('[aria-label="Cari menu"]'))
  const hasil = async () => page.evaluate(() => {
    const d = document.querySelector('[aria-label="Cari menu"]')
    return d ? [...d.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean) : []
  })

  // Ctrl+K
  await page.keyboard.down('Control')
  await page.keyboard.press('k')
  await page.keyboard.up('Control')
  await new Promise(r => setTimeout(r, 500))
  const buka = await adaPalet()

  await page.keyboard.type('jurnal', { delay: 25 })
  await new Promise(r => setTimeout(r, 400))
  const tersaring = await hasil()

  await page.keyboard.press('Escape')
  await new Promise(r => setTimeout(r, 400))
  const tertutup = !(await adaPalet())

  // Alt+3 -> menu ketiga (Monitoring Data)
  await page.keyboard.down('Alt')
  await page.keyboard.press('3')
  await page.keyboard.up('Alt')
  await new Promise(r => setTimeout(r, 1800))
  const urlAlt3 = page.url()

  console.log(JSON.stringify({
    palet_terbuka: buka,
    hasil_cari_jurnal: tersaring.slice(0, 6),
    esc_menutup: tertutup,
    url_setelah_alt3: urlAlt3,
    galat_halaman: galat,
  }, null, 1))
  await browser.close()
})().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
