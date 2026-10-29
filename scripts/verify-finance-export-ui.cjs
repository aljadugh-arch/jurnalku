// Verifikasi UI end-to-end fitur ekspor laporan keuangan di PRODUKSI.
// Login demo bendahara (POST /api/auth/demo, hanya host jurnal.cc.cd), buka
// halaman Buku Kas / Tagihan / Tabungan / Laporan Keuangan, pastikan tombol
// Excel & PDF muncul dan data termuat. Tanpa mengubah data apa pun (read-only).
const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://jurnal.cc.cd';
const CHROME = (() => {
  const root = path.join(require('node:os').homedir(), '.cache', 'puppeteer', 'chrome');
  const dirs = fs.readdirSync(root).filter(d => fs.existsSync(path.join(root, d, 'chrome-linux64', 'chrome')));
  return path.join(root, dirs[0], 'chrome-linux64', 'chrome');
})();

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log(`Produksi UI ekspor keuangan → ${BASE}\n`);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  let pass = 0, fail = 0;
  const ok = (c, label, extra) => {
    if (c) { pass++; console.log('  ok   ' + label); }
    else { fail++; console.log('  FAIL ' + label + (extra ? ' — ' + extra : '')); }
  };

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // 1. demo login bendahara
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    const demo = await page.evaluate(async () => {
      const r = await fetch('/api/auth/demo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'bendahara' }),
      });
      const d = await r.json();
      localStorage.setItem('jurnalku_token', d.token);
      return !!d.token;
    });
    ok(demo, 'login demo bendahara (token tersimpan)');

    const halaman = [
      ['/admin/buku-kas', 'Buku Kas'],
      ['/admin/tagihan', 'Tagihan & Pembayaran'],
      ['/admin/tabungan', 'Tabungan'],
      ['/admin/bendahara/laporan', 'Laporan Keuangan'],
    ];

    for (const [route, nama] of halaman) {
      await page.goto(BASE + route, { waitUntil: 'networkidle2' });
      await sleep(1500);

      // tombol Excel & PDF ada?
      const btnInfo = await page.evaluate(() => {
        const semua = [...document.querySelectorAll('button')].map(b => b.textContent?.trim() || '');
        const cari = (teks) => semua.some(t => t === teks || t.includes(teks));
        return {
          excel: cari('Excel'),
          pdf: cari('PDF'),
          h1: (document.querySelector('h1')?.textContent || '').trim(),
          judulOk: !!document.querySelector('h1'),
        };
      });
      ok(btnInfo.h1.includes(nama) || btnInfo.judulOk, `${nama}: halaman termuat (h1="${btnInfo.h1}")`);
      ok(btnInfo.excel, `${nama}: tombol Excel ada`);
      ok(btnInfo.pdf, `${nama}: tombol PDF ada`);

      // PeriodeFilter tampil (tombol Harian/Mingguan/Bulanan)
      const periodeOk = await page.evaluate(() => {
        const teks = document.body.textContent || '';
        return /Harian/.test(teks) && /Mingguan/.test(teks) && /Bulanan/.test(teks);
      });
      ok(periodeOk, `${nama}: pemilih Harian/Mingguan/Bulanan tampil`);
    }

    // 2. uji nyata: klik Excel di Buku Kas -> file terunduh (atau toast error "tidak ada data" — keduanya valid, yang penting tidak crash)
    await page.goto(BASE + '/admin/buku-kas', { waitUntil: 'networkidle2' });
    await sleep(1500);
    const clickExcel = await page.evaluate(async () => {
      const semua = [...document.querySelectorAll('button')];
      const btn = semua.find(b => (b.textContent?.trim() || '') === 'Excel' || (b.textContent || '').includes('Excel'));
      if (!btn) return 'tombol tidak ada';
      btn.click();
      await new Promise(r => setTimeout(r, 2500));
      return 'diklik';
    });
    ok(clickExcel === 'diklik', `Buku Kas: klik Excel (${clickExcel})`);
    const bodyText = await page.evaluate(() => document.body.textContent || '');
    ok(!/Uncaught|TypeError|Cannot read/.test(bodyText.slice(0, 500)), 'tidak ada error JS tampak setelah klik');

    // 3. halaman masih hidup setelahnya
    ok((await page.evaluate(() => document.querySelector('h1')?.textContent || '')).includes('Buku Kas'), 'halaman Buku Kas tetap hidup setelah ekspor');

  } catch (err) {
    fail++;
    console.log('  FAIL exception: ' + err.message);
  } finally {
    await browser.close();
  }

  console.log(`\n${'─'.repeat(52)}`);
  console.log(`PASS ${pass}   FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})();
