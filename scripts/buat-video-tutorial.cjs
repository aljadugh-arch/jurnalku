// language: JavaScript (CommonJS), file: scripts/buat-video-tutorial.cjs
// Rekaman layar SUNGGUHAN per topik dengan AKSI NYATA yang DITARGET:
//   kursor -> pilih menu -> pilih dropdown (bila perlu) -> klik tombol aksi
//   -> isi field form (ketik nama/nilai) -> klik Simpan -> lihat hasil -> scroll.
// Tombol target diambil dari rekon live DOM (tmp/rekon.cjs).
'use strict'

const puppeteer = require('puppeteer-core')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const BASE = process.env.JURNALKU_BASE || 'https://jurnal.cc.cd'
const CHROME = '/home/aljadugh/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome'
const FFMPEG = '/home/aljadugh/.local/ffmpeg/ffmpeg'
const OUT = '/home/aljadugh/Downloads/jurnalku-tutorial-video'
const FRAMES = '/home/aljadugh/jurnalku/tmp/video-frames'
const VIEWPORT = { width: 1440, height: 900 }

// btn  : tombol aksi utama (teks persis dari rekon). null => inline/tab.
// save : tombol simpan/submit. default broad.
// pilih: jumlah dropdown kosong yang dipilih dulu (form inline butuh dropdown dulu).
const TOPICS = [
  { group: 'umum', role: null, route: '/register', file: 'registrasi', menu: null, btn: 'Daftar', save: /Daftar|Kirim|Selanjutnya|Simpan/ },
  { group: 'umum', role: null, route: '/login', file: 'login', menu: null, btn: 'Masuk', save: /Masuk/ },
  { group: 'umum', role: 'admin', route: '/admin', file: 'antarmuka', menu: 'Dashboard', btn: null, save: /Lihat|Kehadiran|Buka/ },
  { group: 'admin', role: 'admin', route: '/admin/settings', file: 'pengaturan', menu: 'Pengaturan', btn: 'Simpan Perubahan', save: /Simpan Perubahan/ },
  { group: 'admin', role: 'admin', route: '/admin/tahun-ajaran', file: 'tahun-ajaran', menu: 'Tahun Ajaran', btn: 'Tambah Tahun Ajaran', save: /Simpan|Tambah/ },
  { group: 'admin', role: 'admin', route: '/admin/gtk', file: 'data-gtk', menu: 'Data GTK', btn: 'Tambah GTK', save: /Simpan|Tambah/ },
  { group: 'admin', role: 'admin', route: '/admin/siswa', file: 'data-siswa', menu: 'Data Siswa', btn: 'Tambah Siswa', save: /Simpan|Tambah Siswa/ },
  { group: 'admin', role: 'admin', route: '/admin/mapel', file: 'mapel-rombel', menu: 'Mata Pelajaran', btn: 'Tambah Mapel', save: /Simpan|Tambah/ },
  { group: 'admin', role: 'admin', route: '/admin/jadwal', file: 'jadwal', menu: 'Jadwal Pelajaran', btn: 'Tambah Jadwal', save: /Simpan|Tambah/ },
  { group: 'admin', role: 'admin', route: '/admin/absensi-siswa', file: 'absensi', menu: 'Absensi Siswa', btn: null, pilih: 2, save: /Simpan Absensi/ },
  { group: 'admin', role: 'admin', route: '/admin/rapor', file: 'rapor', menu: 'Rapor Siswa', btn: 'Cetak (Semua)', save: /Cetak|Ekspor/ },
  { group: 'admin', role: 'admin', route: '/admin/tagihan', file: 'keuangan', menu: 'Tagihan & Pembayaran', btn: 'Generate Tagihan', save: /Generate|Terbitkan/ },
  { group: 'admin', role: 'admin', route: '/admin/wa-gateway', file: 'wa-notif', menu: 'Sambungkan WA', btn: 'Buka QR Besar', save: /Connect|Buka|Refresh/ },
  { group: 'admin', role: 'admin', route: '/admin/users', file: 'pengguna', menu: 'Manajemen Pengguna', btn: 'Tambah', save: /Simpan|Tambah/ },
  { group: 'admin', role: 'admin', route: '/admin/backup-restore', file: 'ekspor', menu: 'Backup & Restore', btn: 'Backup Sekarang ke Drive', save: /Backup|Simpan|Unduh/ },
  { group: 'admin', role: 'admin', route: '/admin/smtp', file: 'smtp', menu: 'SMTP & IMAP', btn: null, save: /Uji & kirim email uji/ },
  { group: 'guru', role: 'guru', route: '/guru/jurnal', file: 'guru-jurnal', menu: 'Jurnal Mengajar', btn: 'Buat Jurnal', save: /Simpan|Buat/ },
  { group: 'guru', role: 'guru', route: '/guru/penilaian-harian', file: 'guru-nilai', menu: 'Penilaian Harian', btn: null, pilih: 2, save: /Simpan Penilaian/ },
  { group: 'guru', role: 'guru', route: '/guru/absensi-siswa', file: 'guru-absensi', menu: 'Absensi Harian', btn: 'Manual', save: /Proses|Simpan/ },
  { group: 'guru', role: 'guru', route: '/guru/modul-ajar', file: 'guru-modul', menu: 'Modul Ajar', btn: 'Soal STS', save: /Generate|Buat|Simpan/ },
  { group: 'bendahara', role: 'bendahara', route: '/admin/tagihan', file: 'bendahara-tagihan', menu: 'Tagihan & Pembayaran', btn: 'Generate Tagihan', save: /Generate|Terbitkan/ },
  { group: 'bendahara', role: 'bendahara', route: '/admin/tabungan', file: 'bendahara-tabungan', menu: 'Tabungan Siswa', btn: 'Transaksi Baru', save: /Simpan|Setor|Tarik|Transaksi/ },
  { group: 'bendahara', role: 'bendahara', route: '/admin/payment-gateway', file: 'bendahara-qris', menu: 'Payment Gateway QRIS', btn: 'Simpan', save: /Simpan|Uji/ },
  { group: 'kepala', role: 'kepala', route: '/admin/monitoring', file: 'kepala-monitoring', menu: 'Monitoring Data', btn: 'Muat ulang', save: /Muat ulang|Lihat/ },
  { group: 'kepala', role: 'kepala', route: '/admin/supervisi', file: 'kepala-supervisi', menu: 'Supervisi', btn: 'Penilaian Baru', save: /Simpan|Penilaian|Tambah/ },
  { group: 'kepala', role: 'kepala', route: '/admin/rapor', file: 'kepala-rapor', menu: 'Rapor Siswa', btn: 'Cetak (Semua)', save: /Cetak|Ekspor/ },
  { group: 'siswa', role: 'siswa', route: '/siswa', file: 'siswa-dashboard', menu: 'Dashboard', btn: 'Lihat', save: /Lihat|Kehadiran/ },
  { group: 'siswa', role: 'siswa', route: '/siswa/nilai', file: 'siswa-nilai', menu: 'Nilai', btn: 'Riwayat Penilaian Harian', save: /Ringkasan|Riwayat/ },
  { group: 'siswa', role: 'siswa', route: '/siswa/absensi', file: 'siswa-absensi', menu: 'Absensi Saya', btn: 'Mata Pelajaran (0)', save: /QR Masuk|Mata Pelajaran|Jamaah/ },
  { group: 'siswa', role: 'siswa', route: '/siswa/tagihan', file: 'siswa-tagihan', menu: 'Tagihan', btn: null, save: /Bayar|Lihat/ },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const KURSOR_JS = `(function () {
  if (document.getElementById('__k')) return;
  const c = document.createElement('div'); c.id = '__k';
  c.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2l16 7-7 2-4 9z" fill="#ff6600" stroke="#fff" stroke-width="1.6"/></svg>';
  c.style.cssText = 'position:fixed;z-index:2147483647;left:0;top:0;pointer-events:none;transition:transform 70ms linear;';
  document.body.appendChild(c);
  const r = document.createElement('div'); r.id = '__rp';
  r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:3px solid #ff6600;border-radius:50%;width:0;height:0;opacity:0;';
  document.body.appendChild(r);
  window.__mv = (x, y) => { c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
  window.__klik = (x, y) => {
    r.style.left = (x - 14) + 'px'; r.style.top = (y - 14) + 'px'; r.style.width = '28px'; r.style.height = '28px';
    r.style.transition = 'none'; r.style.opacity = '1';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      r.style.width = '64px'; r.style.height = '64px'; r.style.left = (x - 32) + 'px'; r.style.top = (y - 32) + 'px';
      r.style.opacity = '0'; r.style.transition = 'all .45s ease-out';
    }));
  };
  window.__mv(60, 60);
})();`

let cx = 60, cy = 60

async function loginDemo(page, role) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  return page.evaluate(async (role) => {
    const r = await fetch('/api/auth/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) })
    const d = await r.json(); localStorage.setItem('jurnalku_token', d.token)
    return d.token
  }, role)
}

async function gerak(page, x, y, n = 22) {
  for (let i = 1; i <= n; i++) {
    const xx = Math.round(cx + (x - cx) * i / n)
    const yy = Math.round(cy + (y - cy) * i / n)
    await page.mouse.move(xx, yy)
    await page.evaluate((a, b) => window.__mv(a, b), xx, yy)
    await sleep(30)
  }
  cx = x; cy = y
}

async function klik(page, x, y) {
  await gerak(page, x, y, 16)
  await page.evaluate((a, b) => window.__klik(a, b), x, y)
  await page.mouse.down(); await sleep(110); await page.mouse.up()
  await sleep(1200)
}

async function ketik(page, x, y, teks) {
  await gerak(page, x, y, 12)
  await page.mouse.click(x, y)
  await sleep(250)
  await page.keyboard.type(teks, { delay: 55 })
  await sleep(200)
}

async function cariBtn(page, teks) {
  return page.evaluate((t) => {
    const els = [...document.querySelectorAll('button,a,[role="button"]')]
    const el = els.find(e => {
      const txt = (e.textContent || '').trim().replace(/\s+/g, ' ')
      const b = e.getBoundingClientRect()
      return txt.includes(t) && b.width > 8 && b.height > 8 && b.top >= 0 && b.top < innerHeight
    })
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), text: (el.textContent || '').trim().slice(0, 40) }
  }, teks)
}

async function cariBtnRe(page, re) {
  const p = re.source, f = re.flags
  return page.evaluate((pat, fl) => {
    const r = new RegExp(pat, fl)
    const els = [...document.querySelectorAll('button,a,[role="button"]')]
    const el = els.find(e => { const t = (e.textContent || '').trim().replace(/\s+/g, ' '); const b = e.getBoundingClientRect(); return r.test(t) && b.width > 8 && b.height > 8 && b.top >= 0 && b.top < innerHeight })
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), text: (el.textContent || '').trim().slice(0, 40) }
  }, p, f)
}

// Input form terlihat (lewati search/file/checkbox/radio); urutkan dari atas.
async function cariInputs(page) {
  return page.evaluate(() => {
    const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 20 && b.height > 10 && b.top >= 0 && b.top < innerHeight && s.display !== 'none' && s.visibility !== 'hidden' && !e.disabled }
    return [...document.querySelectorAll('input,textarea,select')]
      .filter(e => {
        if (!vis(e)) return false
        const ph = (e.placeholder || '').toLowerCase()
        if (/cari/.test(ph)) return false
        const t = e.type || e.tagName.toLowerCase()
        if (t === 'file' || t === 'checkbox' || t === 'radio' || t === 'hidden') return false
        return true
      })
      .map(e => {
        const b = e.getBoundingClientRect()
        return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), tag: e.tagName.toLowerCase(), type: e.type || '', ph: e.placeholder || '', val: e.value || '' }
      })
  })
}

// Pilih opsi non-kosong pertama pada <select> native di koordinat (x,y).
async function pilihSelect(page, x, y) {
  await gerak(page, x, y, 10)
  const ok = await page.evaluate((cx, cy) => {
    const el = document.elementFromPoint(cx, cy)
    const sel = el && (el.tagName === 'SELECT' ? el : el.closest('select'))
    if (!sel) return false
    const opts = [...sel.options].filter(o => o.value && o.value !== 'all' && o.value !== 'semua')
    if (!opts.length) return false
    sel.value = opts[0].value
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    sel.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }, x, y)
  await sleep(500)
  return ok
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  fs.mkdirSync(FRAMES, { recursive: true })
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'], defaultViewport: VIEWPORT })
  const token = {}

  for (const t of TOPICS) {
    if (process.env.ONLY && !process.env.ONLY.split(',').includes(t.file)) continue
    const dir = path.join(FRAMES, t.file)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    const page = await browser.newPage()
    try {
      if (t.role) {
        if (!token[t.role]) token[t.role] = await loginDemo(page, t.role)
        else {
          await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
          await page.evaluate((tk) => localStorage.setItem('jurnalku_token', tk), token[t.role])
        }
      } else {
        await page.evaluate(() => localStorage.removeItem('jurnalku_token')).catch(() => {})
      }
      await page.goto(BASE + t.route, { waitUntil: 'networkidle2', timeout: 60000 })
      await sleep(2800)
      await page.evaluate(KURSOR_JS)
      cx = 60; cy = 60

      const cdp = await page.target().createCDPSession()
      const frames = []
      const onFrame = async (m) => { frames.push(m.data); await cdp.send('Page.screencastFrameAck', { sessionId: m.sessionId }).catch(() => {}) }
      cdp.on('Page.screencastFrame', onFrame)
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1, maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height })

      await gerak(page, 720, 400, 30)

      // pilih menu sidebar
      if (t.menu) {
        const m = await cariBtn(page, t.menu)
        if (m) await gerak(page, m.x, m.y, 18)
      }

      // pilih dropdown dulu (form inline butuh dropdown: guru-nilai, absensi)
      if (t.pilih) {
        const inps = await cariInputs(page)
        let n = 0
        for (const inp of inps) {
          if (n >= t.pilih) break
          if (inp.tag === 'select' && !inp.val) { await pilihSelect(page, inp.x, inp.y); n++ }
        }
      }

      // klik tombol aksi utama
      let aksi = null
      if (t.btn) aksi = await cariBtn(page, t.btn)
      if (aksi) { await gerak(page, aksi.x, aksi.y, 18); await klik(page, aksi.x, aksi.y) }
      await sleep(900)

      // isi field form (ketik nama/nilai), lewati search/file; batasi 4 field
      const inputs = (await cariInputs(page)).slice(0, 4)
      for (const inp of inputs) {
        if (inp.tag === 'select') {
          if (!inp.val) await pilihSelect(page, inp.x, inp.y)
        } else if (inp.type === 'number') {
          await ketik(page, inp.x, inp.y, '85')
        } else if (inp.type === 'date') {
          // biarkan default (hari ini)
        } else if (inp.type === 'email') {
          await ketik(page, inp.x, inp.y, 'contoh@email.com')
        } else if (inp.type === 'password') {
          await ketik(page, inp.x, inp.y, 'rahasia123')
        } else {
          await ketik(page, inp.x, inp.y, 'Contoh Data')
        }
      }

      // klik Simpan/Submit
      const simpan = await cariBtnRe(page, t.save)
      if (simpan) await klik(page, simpan.x, simpan.y)

      // scroll
      await page.evaluate(async () => {
        const max = document.body.scrollHeight - window.innerHeight
        let y = 0
        while (y < max) { y = Math.min(y + 150, max); window.scrollTo(0, y); await new Promise(r => setTimeout(r, 170)) }
        await new Promise(r => setTimeout(r, 450))
        while (y > 0) { y = Math.max(y - 150, 0); window.scrollTo(0, y); await new Promise(r => setTimeout(r, 110)) }
      })
      await sleep(700)

      await cdp.send('Page.stopScreencast').catch(() => {})
      cdp.off('Page.screencastFrame', onFrame)

      for (let i = 0; i < frames.length; i++) fs.writeFileSync(path.join(dir, `f_${String(i).padStart(4, '0')}.jpg`), Buffer.from(frames[i], 'base64'))

      if (frames.length >= 2) {
        execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', '13', '-start_number', '0', '-i', path.join(dir, 'f_%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', path.join(OUT, t.file + '.mp4')])
        console.log(`OK  ${t.group.padEnd(10)} ${t.file}.mp4 (${frames.length} frame)${aksi ? ' btn=' + aksi.text : ''}`)
      } else {
        console.log(`SKIP ${t.group.padEnd(10)} ${t.file} (frame=${frames.length})`)
      }
    } catch (e) {
      console.log(`ERR ${t.group.padEnd(10)} ${t.file}  ${String(e && e.message || e).split('\n')[0].slice(0, 110)}`)
    } finally {
      await page.close().catch(() => {})
    }
  }
  await browser.close()
  console.log('\nSELESAI ->', OUT)
}
main().catch(e => { console.error(e); process.exit(1) })
