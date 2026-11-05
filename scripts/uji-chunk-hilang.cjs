'use strict'
// Uji nyata: satu chunk halaman gagal dimuat (meniru deploy di tengah sesi).
// Aplikasi harus menyegarkan halaman sekali dan berhasil membuka halaman itu,
// bukan menampilkan "Halaman gagal ditampilkan".
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const BASE = process.env.BASE || 'https://jurnal.mtsplussd7.cc.cd'
const TOKEN = fs.readFileSync('/tmp/tok-chunk.txt', 'utf8').trim()

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/home/aljadugh/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  let navigasi = 0
  page.on('framenavigated', f => { if (f === page.mainFrame()) navigasi++ })

  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.evaluate((tok) => {
    localStorage.setItem('jurnalku_token', tok)
    localStorage.setItem('jurnalku_user', JSON.stringify({ id: 'uji-chunk', nama: 'Uji Chunk', email: 'uji-chunk@uji.id', role: 'admin', tenant_id: 'mtsplussd7' }))
  }, TOKEN)

  // Gagalkan HANYA permintaan chunk halaman siswa, sekali saja.
  let digagalkan = null
  await page.setRequestInterception(true)
  page.on('request', req => {
    const u = req.url()
    if (!digagalkan && /\/assets\/DataSiswaPage-[^/]+\.js/.test(u)) {
      digagalkan = u
      return req.abort('failed')
    }
    req.continue()
  })

  await page.goto(BASE + '/admin/siswa', { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, 10000))

  const hasil = await page.evaluate(() => ({
    path: location.pathname,
    teks: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200),
    penanda: sessionStorage.getItem('jurnalku_chunk_reload'),
    akar: (document.getElementById('root')?.innerHTML || '').length,
  }))
  const ringkas = {
    chunk_digagalkan: digagalkan ? new URL(digagalkan).pathname : null,
    navigasi_ke_halaman: navigasi,
    path_akhir: hasil.path,
    masih_gagal: /Halaman gagal ditampilkan/.test(hasil.teks),
    konten_terbuka: /Data Siswa|Siswa/i.test(hasil.teks),
    penanda_reload: !!hasil.penanda,
    panjang_dom: hasil.akar,
    cuplikan: hasil.teks.slice(0, 160),
  }
  console.log(JSON.stringify(ringkas, null, 1))
  await browser.close()
  process.exit(ringkas.masih_gagal || !ringkas.penanda_reload ? 2 : 0)
})().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
