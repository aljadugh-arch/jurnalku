'use strict'
// Uji nyata di layar ponsel: tab "Per Mapel" harus menampilkan baris rekap,
// bukan pesan kosong (bug: API tidak pernah dipanggil).
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const BASE = process.env.BASE || 'https://jurnal.mtsplussd7.cc.cd'
const TOKEN = fs.readFileSync('/tmp/tok-rekap.txt', 'utf8').trim()

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/home/aljadugh/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.evaluate((tok) => {
    localStorage.setItem('jurnalku_token', tok)
    localStorage.setItem('jurnalku_user', JSON.stringify({ id: 'uji-rekap', nama: 'Uji Rekap', email: 'uji-rekap@uji.id', role: 'admin', tenant_id: 'mtsplussd7' }))
  }, TOKEN)

  await page.goto(BASE + '/admin/absensi-siswa', { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, 2500))

  const diklik = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button[role="tab"]')].find(b => /Per Mapel/i.test(b.textContent || ''))
    if (!btn) return false
    btn.click()
    return true
  })
  await new Promise(r => setTimeout(r, 2500))

  const hasil = await page.evaluate(() => {
    const teks = document.body.innerText.replace(/\s+/g, ' ')
    return {
      tab_ditemukan: !!document.querySelector('[data-attendance-summary="true"]'),
      teks,
      jumlah_baris: document.querySelectorAll('[data-attendance-summary="true"] .rounded-2xl.bg-slate-50').length,
      jumlah_belum: document.querySelectorAll('[data-attendance-summary="true"] .border-dashed').length,
    }
  })
  const kosong = /Belum ada absensi mapel pada tanggal ini/i.test(hasil.teks)
  const adaRekap = /Rekap per Mapel/i.test(hasil.teks) && /hadir dari \d+ catatan/i.test(hasil.teks)
  const ringkas = {
    tab_ditemukan: hasil.tab_ditemukan,
    tombol_per_mapel_diklik: diklik,
    ada_baris_rekap: adaRekap,
    pesan_kosong: kosong,
    baris_belum_diabsen: hasil.jumlah_belum,
    banner_belum: /kelas belum diabsen/i.test(hasil.teks),
    cuplikan: hasil.teks.slice(0, 220),
  }
  console.log(JSON.stringify(ringkas, null, 1))
  await browser.close()
  process.exit(!diklik || kosong || !adaRekap || hasil.jumlah_belum === 0 ? 2 : 0)
})().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
