// language: JavaScript (CommonJS), file: scripts/record-panduan.cjs
// Rekam layar: login demo per role -> jelajah tiap menu -> screenshot PNG
// (untuk /public/panduan/*.png) + frame video via CDP screencast (JPEG).
// Dipakai untuk mengisi gambar & video panduan pengguna Jurnalku.
//
// Jalankan:  node scripts/record-panduan.cjs [--video] [--only <file>]
//   --video   aktifkan penangkapan frame screencast (default: screenshot saja)
//   --only    kerjakan satu topik saja (nama file tanpa .png)
'use strict'

const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')

const BASE = process.env.JURNALKU_BASE || 'https://jurnal.cc.cd'
const CHROME = '/home/aljadugh/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome'
const OUT_IMG = '/home/aljadugh/jurnalku/public/panduan'
const OUT_FRAMES = '/home/aljadugh/jurnalku/tmp/panduan-frames'
const VIEWPORT = { width: 1440, height: 900 }

const args = process.argv.slice(2)
const WITH_VIDEO = args.includes('--video')
const onlyIdx = args.indexOf('--only')
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null

// role null = halaman publik (tanpa login)
const TOPICS = [
  // Umum & Mulai
  { group: 'umum', role: null, route: '/register', file: 'registrasi.png' },
  { group: 'umum', role: null, route: '/login', file: 'login.png' },
  { group: 'umum', role: 'admin', route: '/admin', file: 'antarmuka.png' },
  // Admin Lembaga
  { group: 'admin', role: 'admin', route: '/admin/settings', file: 'pengaturan.png' },
  { group: 'admin', role: 'admin', route: '/admin/tahun-ajaran', file: 'tahun-ajaran.png' },
  { group: 'admin', role: 'admin', route: '/admin/gtk', file: 'data-gtk.png' },
  { group: 'admin', role: 'admin', route: '/admin/siswa', file: 'data-siswa.png' },
  { group: 'admin', role: 'admin', route: '/admin/mapel', file: 'mapel-rombel.png' },
  { group: 'admin', role: 'admin', route: '/admin/jadwal', file: 'jadwal.png' },
  { group: 'admin', role: 'admin', route: '/admin/absensi-siswa', file: 'absensi.png' },
  { group: 'admin', role: 'admin', route: '/admin/rapor', file: 'rapor.png' },
  { group: 'admin', role: 'admin', route: '/admin/tagihan', file: 'keuangan.png' },
  { group: 'admin', role: 'admin', route: '/admin/wa-gateway', file: 'wa-notif.png' },
  { group: 'admin', role: 'admin', route: '/admin/users', file: 'pengguna.png' },
  { group: 'admin', role: 'admin', route: '/admin/backup-restore', file: 'ekspor.png' },
  { group: 'admin', role: 'admin', route: '/admin/smtp', file: 'smtp.png' },
  // Guru
  { group: 'guru', role: 'guru', route: '/guru/jurnal', file: 'guru-jurnal.png' },
  { group: 'guru', role: 'guru', route: '/guru/penilaian-harian', file: 'guru-nilai.png' },
  { group: 'guru', role: 'guru', route: '/guru/absensi-siswa', file: 'guru-absensi.png' },
  { group: 'guru', role: 'guru', route: '/guru/modul-ajar', file: 'guru-modul.png' },
  // Bendahara
  { group: 'bendahara', role: 'bendahara', route: '/admin/tagihan', file: 'bendahara-tagihan.png' },
  { group: 'bendahara', role: 'bendahara', route: '/admin/tabungan', file: 'bendahara-tabungan.png' },
  { group: 'bendahara', role: 'bendahara', route: '/admin/payment-gateway', file: 'bendahara-qris.png' },
  // Kepala
  { group: 'kepala', role: 'kepala', route: '/admin/monitoring', file: 'kepala-monitoring.png' },
  { group: 'kepala', role: 'kepala', route: '/admin/supervisi', file: 'kepala-supervisi.png' },
  { group: 'kepala', role: 'kepala', route: '/admin/rapor', file: 'kepala-rapor.png' },
  // Siswa
  { group: 'siswa', role: 'siswa', route: '/siswa', file: 'siswa-dashboard.png' },
  { group: 'siswa', role: 'siswa', route: '/siswa/nilai', file: 'siswa-nilai.png' },
  { group: 'siswa', role: 'siswa', route: '/siswa/absensi', file: 'siswa-absensi.png' },
  { group: 'siswa', role: 'siswa', route: '/siswa/tagihan', file: 'siswa-tagihan.png' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Tutup ajakan "Install aplikasi" (PWA) bila muncul, supaya tangkapan bersih.
async function tutupInstallPrompt(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Tutup petunjuk instalasi"]')
    if (btn) btn.click()
  }).catch(() => {})
}

async function loginDemo(page, role) {
  // Login demo via endpoint (tanpa CAPTCHA). Simpan token di localStorage
  // persis seperti yang dilakukan frontend (authStore.loginDemo).
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  const token = await page.evaluate(async (role) => {
    const res = await fetch('/api/auth/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    const data = await res.json()
    if (!data.token) throw new Error('Gagal login demo: ' + JSON.stringify(data).slice(0, 120))
    localStorage.setItem('jurnalku_token', data.token)
    return data.token
  }, role)
  return token
}

async function captureScreenshot(page, topic) {
  await page.goto(BASE + topic.route, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(4000) // tunggu render client-side + fetch data
  await tutupInstallPrompt(page)
  const dest = path.join(OUT_IMG, topic.file)
  fs.mkdirSync(OUT_IMG, { recursive: true })
  await page.screenshot({ path: dest, type: 'png' })
  return dest
}

async function recordVideo(page, topic) {
  const cdp = await page.target().createCDPSession()
  const frames = []
  const onFrame = async (msg) => {
    frames.push(msg.data)
    await cdp.send('Page.screencastFrameAck', { sessionId: msg.sessionId }).catch(() => {})
  }
  cdp.on('Page.screencastFrame', onFrame)
  await cdp.send('Page.startScreencast', {
    format: 'jpeg', quality: 85, everyNthFrame: 1,
    maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height,
  })

  // Walkthrough: muat halaman -> gulir turun perlahan -> diam -> kembali atas.
  await page.goto(BASE + topic.route, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(1800)
  await tutupInstallPrompt(page)
  await page.evaluate(async () => {
    const step = 140
    const delay = 320
    const max = document.body.scrollHeight - window.innerHeight
    // turun perlahan
    let y = 0
    while (y < max) {
      y = Math.min(y + step, max)
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, delay))
    }
    await new Promise((r) => setTimeout(r, 1500))
    // naik perlahan ke atas
    y = max
    while (y > 0) {
      y = Math.max(y - step, 0)
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, delay))
    }
    await new Promise((r) => setTimeout(r, 1000))
  })
  await sleep(1000)

  await cdp.send('Page.stopScreencast').catch(() => {})
  cdp.off('Page.screencastFrame', onFrame)

  const dir = path.join(OUT_FRAMES, topic.file.replace(/\.png$/, ''))
  fs.mkdirSync(dir, { recursive: true })
  for (let i = 0; i < frames.length; i++) {
    fs.writeFileSync(path.join(dir, `frame_${String(i).padStart(4, '0')}.jpg`), Buffer.from(frames[i], 'base64'))
  }
  return frames.length
}

async function main() {
  const list = ONLY ? TOPICS.filter((t) => t.file === ONLY) : TOPICS
  if (!list.length) {
    console.error('Topik tidak ditemukan:', ONLY)
    process.exit(1)
  }
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
    defaultViewport: VIEWPORT,
  })
  const page = await browser.newPage()
  await page.setViewport(VIEWPORT)
  // Matikan ajakan "Install aplikasi" (PWA) supaya screenshot bersih.
  await page.evaluateOnNewDocument(() => {
    window.addEventListener('beforeinstallprompt', (e) => e.preventDefault())
    window.addEventListener('appinstalled', () => {})
  })

  // Cache token per role (login sekali, pakai untuk semua topik role itu).
  const tokenByRole = {}
  let ok = 0
  let gagal = 0
  const hasil = []

  for (const topic of list) {
    try {
      if (topic.role) {
        if (!tokenByRole[topic.role]) tokenByRole[topic.role] = await loginDemo(page, topic.role)
        else {
          // pastikan masih di origin yang sama (setelah navigasi halaman publik)
          if (!page.url().startsWith(BASE)) await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
        }
      } else {
        // halaman publik: bersihkan token
        await page.evaluate(() => localStorage.removeItem('jurnalku_token')).catch(() => {})
      }
      const img = await captureScreenshot(page, topic)
      let nFrame = 0
      if (WITH_VIDEO) nFrame = await recordVideo(page, topic)
      ok++
      hasil.push(`${topic.file}\t${img}\tframe=${nFrame}`)
      console.log(`OK  ${topic.group.padEnd(10)} ${topic.file.padEnd(24)} ${nFrame ? '(video ' + nFrame + ' frame)' : ''}`)
    } catch (e) {
      gagal++
      const pesan = String(e && e.message || e).split('\n')[0].slice(0, 140)
      hasil.push(`${topic.file}\tGAGAL\t${pesan}`)
      console.log(`ERR ${topic.group.padEnd(10)} ${topic.file.padEnd(24)} ${pesan}`)
    }
  }

  await browser.close()
  fs.mkdirSync('/home/aljadugh/jurnalku/tmp', { recursive: true })
  fs.writeFileSync('/home/aljadugh/jurnalku/tmp/panduan-hasil.txt', hasil.join('\n') + '\n')
  console.log(`\nSELESAI: ${ok} ok, ${gagal} gagal. Rincian: /home/aljadugh/jurnalku/tmp/panduan-hasil.txt`)
}

main().catch((e) => { console.error(e); process.exit(1) })
