// language: JavaScript (CommonJS), file: scripts/buat-video-panduan.cjs
// Buat video tutorial pendek per topik: kartu judul + 3 tangkapan layar
// (atas/tengah/bawah) masing-masing 4 detik, distitch jadi MP4 ~16 detik.
// Output: /home/aljadugh/Downloads/jurnalku-tutorial-video/<file>.mp4
'use strict'

const puppeteer = require('puppeteer-core')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const BASE = process.env.JURNALKU_BASE || 'https://jurnal.cc.cd'
const CHROME = '/home/aljadugh/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome'
const FFMPEG = '/tmp/ffmpeg-7.0.2-amd64-static/ffmpeg'
const OUT_VIDEO = '/home/aljadugh/Downloads/jurnalku-tutorial-video'
const SLIDE_DIR = '/home/aljadugh/jurnalku/tmp/panduan-slide'
const VIEWPORT = { width: 1440, height: 900 }

// role null = halaman publik
const TOPICS = [
  { group: 'umum', nama: 'Umum & Mulai', role: null, route: '/register', file: 'registrasi' },
  { group: 'umum', nama: 'Umum & Mulai', role: null, route: '/login', file: 'login' },
  { group: 'umum', nama: 'Umum & Mulai', role: 'admin', route: '/admin', file: 'antarmuka' },
  { group: 'admin', nama: 'Admin Lembaga', role: 'admin', route: '/admin/settings', file: 'pengaturan' },
  { group: 'admin', nama: 'Admin Lembaga', role: 'admin', route: '/admin/tahun-ajaran', file: 'tahun-ajaran' },
  { group: 'admin', nama: 'Admin Lembaga', role: 'admin', route: '/admin/gtk', file: 'data-gtk' },
  { group: 'admin', nama: 'Admin Lembaga', role: 'admin', route: '/admin/siswa', file: 'data-siswa' },
  { group: 'admin', nama: 'Admin Lembaga', role: 'admin', route: '/admin/mapel', file: 'mapel-rombel' },
  { group: 'admin', nama: 'Admin Lembaga', role: 'admin', route: '/admin/jadwal', file: 'jadwal' },
  { group: 'admin', nama: 'Admin Lembaga', role: 'admin', route: '/admin/absensi-siswa', file: 'absensi' },
  { group: 'admin', nama: 'Admin Lembaga', role: 'admin', route: '/admin/rapor', file: 'rapor' },
  { group: 'admin', nama: 'Admin Lembaga', role: 'admin', route: '/admin/tagihan', file: 'keuangan' },
  { group: 'admin', nama: 'Admin Lembaga', role: 'admin', route: '/admin/wa-gateway', file: 'wa-notif' },
  { group: 'admin', nama: 'Admin Lembaga', role: 'admin', route: '/admin/users', file: 'pengguna' },
  { group: 'admin', nama: 'Admin Lembaga', role: 'admin', route: '/admin/backup-restore', file: 'ekspor' },
  { group: 'admin', nama: 'Admin Lembaga', role: 'admin', route: '/admin/smtp', file: 'smtp' },
  { group: 'guru', nama: 'Guru', role: 'guru', route: '/guru/jurnal', file: 'guru-jurnal' },
  { group: 'guru', nama: 'Guru', role: 'guru', route: '/guru/penilaian-harian', file: 'guru-nilai' },
  { group: 'guru', nama: 'Guru', role: 'guru', route: '/guru/absensi-siswa', file: 'guru-absensi' },
  { group: 'guru', nama: 'Guru', role: 'guru', route: '/guru/modul-ajar', file: 'guru-modul' },
  { group: 'bendahara', nama: 'Bendahara', role: 'bendahara', route: '/admin/tagihan', file: 'bendahara-tagihan' },
  { group: 'bendahara', nama: 'Bendahara', role: 'bendahara', route: '/admin/tabungan', file: 'bendahara-tabungan' },
  { group: 'bendahara', nama: 'Bendahara', role: 'bendahara', route: '/admin/payment-gateway', file: 'bendahara-qris' },
  { group: 'kepala', nama: 'Kepala Lembaga', role: 'kepala', route: '/admin/monitoring', file: 'kepala-monitoring' },
  { group: 'kepala', nama: 'Kepala Lembaga', role: 'kepala', route: '/admin/supervisi', file: 'kepala-supervisi' },
  { group: 'kepala', nama: 'Kepala Lembaga', role: 'kepala', route: '/admin/rapor', file: 'kepala-rapor' },
  { group: 'siswa', nama: 'Siswa & Wali', role: 'siswa', route: '/siswa', file: 'siswa-dashboard' },
  { group: 'siswa', nama: 'Siswa & Wali', role: 'siswa', route: '/siswa/nilai', file: 'siswa-nilai' },
  { group: 'siswa', nama: 'Siswa & Wali', role: 'siswa', route: '/siswa/absensi', file: 'siswa-absensi' },
  { group: 'siswa', nama: 'Siswa & Wali', role: 'siswa', route: '/siswa/tagihan', file: 'siswa-tagihan' },
]

// Ambil judul tiap topik dari data panduan (gambar: '/panduan/<file>.png').
function bacaJudul() {
  const { KELOMPOK } = require('../server/panduan-data.cjs')
  const map = {}
  for (const k of KELOMPOK) {
    for (const b of k.bagian) {
      const m = (b.gambar || '').match(/\/panduan\/([^/.]+)\.png/)
      if (m) map[m[1]] = b.judul
    }
  }
  return map
}

const JUDUL = bacaJudul()
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function loginDemo(page, role) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(async (role) => {
    const res = await fetch('/api/auth/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) })
    const data = await res.json()
    localStorage.setItem('jurnalku_token', data.token)
  }, role)
}

async function tutupInstallPrompt(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Tutup petunjuk instalasi"]')
    if (btn) btn.click()
  }).catch(() => {})
}

function kartuJudulHTML(group, judul) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:1440px;height:900px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;}
    .bg{width:1440px;height:900px;background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 55%,#0e7490 100%);
      display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;text-align:center;padding:0 80px;box-sizing:border-box;}
    .brand{font-size:26px;font-weight:600;letter-spacing:3px;opacity:.75;text-transform:uppercase;}
    .group{font-size:20px;margin-top:26px;opacity:.85;font-weight:500;}
    .title{font-size:62px;font-weight:800;margin-top:18px;line-height:1.15;}
    .foot{font-size:20px;margin-top:44px;opacity:.6;}
  </style></head><body><div class="bg">
    <div class="brand">JURNALKU — Panduan Pengguna</div>
    <div class="group">${esc(group)}</div>
    <div class="title">${esc(judul)}</div>
    <div class="foot">jurnal.cc.cd</div>
  </div></body></html>`
}

async function main() {
  fs.mkdirSync(SLIDE_DIR, { recursive: true })
  fs.mkdirSync(OUT_VIDEO, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
    defaultViewport: VIEWPORT,
  })
  const page = await browser.newPage()
  await page.evaluateOnNewDocument(() => {
    window.addEventListener('beforeinstallprompt', (e) => e.preventDefault())
  })
  const tokenByRole = {}
  let ok = 0

  for (const t of TOPICS) {
    const judul = JUDUL[t.file] || t.file
    const slideDir = path.join(SLIDE_DIR, t.file)
    fs.mkdirSync(slideDir, { recursive: true })
    try {
      // 1) Kartu judul
      await page.setContent(kartuJudulHTML(t.nama, judul), { waitUntil: 'load' })
      await page.screenshot({ path: path.join(slideDir, '01.png'), type: 'png' })

      // 2) Login (sekali per role)
      if (t.role) {
        if (!tokenByRole[t.role]) await loginDemo(page, t.role)
        else if (!page.url().startsWith(BASE)) await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
      } else {
        await page.evaluate(() => localStorage.removeItem('jurnalku_token')).catch(() => {})
      }

      // 3) Navigasi + 3 tangkapan (atas/tengah/bawah)
      await page.goto(BASE + t.route, { waitUntil: 'networkidle2', timeout: 60000 })
      await sleep(3500)
      await tutupInstallPrompt(page)
      await page.screenshot({ path: path.join(slideDir, '02.png'), type: 'png' })

      const dims = await page.evaluate(() => ({ h: document.body.scrollHeight, ih: window.innerHeight }))
      const maxY = Math.max(0, dims.h - dims.ih)
      if (maxY > 40) {
        await page.evaluate((y) => window.scrollTo(0, y), Math.round(maxY * 0.5))
        await sleep(900)
        await page.screenshot({ path: path.join(slideDir, '03.png'), type: 'png' })
        await page.evaluate((y) => window.scrollTo(0, y), maxY)
        await sleep(900)
        await page.screenshot({ path: path.join(slideDir, '04.png'), type: 'png' })
        await page.evaluate(() => window.scrollTo(0, 0))
      } else {
        // Halaman pendek: ulangi tangkapan atas supaya tetap 4 slide (16 dtk).
        fs.copyFileSync(path.join(slideDir, '02.png'), path.join(slideDir, '03.png'))
        fs.copyFileSync(path.join(slideDir, '02.png'), path.join(slideDir, '04.png'))
      }

      // 4) Stitch: 4 slide @4 dtk = 16 dtk
      const out = path.join(OUT_VIDEO, t.file + '.mp4')
      execFileSync(FFMPEG, [
        '-y', '-loglevel', 'error',
        '-framerate', '1/4', '-start_number', '1', '-i', path.join(slideDir, '%02d.png'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart',
        out,
      ])
      ok++
      console.log(`OK  ${t.nama.padEnd(15)} ${t.file}.mp4`)
    } catch (e) {
      console.log(`ERR ${t.nama.padEnd(15)} ${t.file}  ${String(e && e.message || e).split('\n')[0].slice(0, 120)}`)
    }
  }

  await browser.close()
  console.log(`\nSELESAI: ${ok}/${TOPICS.length} video di ${OUT_VIDEO}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
