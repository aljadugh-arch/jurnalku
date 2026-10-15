// Ambil screenshot asli aplikasi untuk manifest PWA (PWABuilder butuh
// screenshots form_factor narrow & wide). Dijalankan sekali; hasilnya disimpan
// ke public/ lalu ikut ter-copy ke dist/ saat build.
const puppeteer = require('puppeteer-core')

const CHROME = '/home/aljadugh/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3011'

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--force-device-scale-factor=1'],
  })
  const job = [
    { file: 'public/screenshot-narrow.png', url: `${BASE}/login`, width: 390, height: 844, mobile: true },
    { file: 'public/screenshot-wide.png', url: `${BASE}/`, width: 1280, height: 720, mobile: false },
  ]
  for (const j of job) {
    const page = await browser.newPage()
    await page.setViewport({ width: j.width, height: j.height, deviceScaleFactor: 1, isMobile: j.mobile, hasTouch: j.mobile })
    await page.goto(j.url, { waitUntil: 'networkidle2', timeout: 45000 })
    await new Promise(r => setTimeout(r, 2500))
    await page.screenshot({ path: j.file, type: 'png', clip: { x: 0, y: 0, width: j.width, height: j.height } })
    const dim = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight, title: document.title }))
    console.log(`${j.file} ← ${j.url} viewport=${dim.w}x${dim.h} judul="${dim.title}"`)
    await page.close()
  }
  await browser.close()
})().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
