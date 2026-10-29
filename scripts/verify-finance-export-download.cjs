// Verifikasi NYATA: klik tombol Excel di halaman Buku Kas produksi (demo
// bendahara) dengan periode yang berisi data (2026-10-26), tangkap file
// unduhan, baca balik XLSX. Bukti ekspor menghasilkan dokumen berisi data.
const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const BASE = 'https://jurnal.cc.cd';
const CHROME = (() => {
  const root = path.join(require('node:os').homedir(), '.cache', 'puppeteer', 'chrome');
  const dirs = fs.readdirSync(root).filter(d => fs.existsSync(path.join(root, d, 'chrome-linux64', 'chrome')));
  return path.join(root, dirs[0], 'chrome-linux64', 'chrome');
})();
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log(`Ekspor nyata (unduhan XLSX) → ${BASE}\n`);
  const dir = fs.mkdtempSync('/tmp/jk-export-');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let pass = 0, fail = 0;
  const ok = (c, label, extra) => { if (c) { pass++; console.log('  ok   ' + label); } else { fail++; console.log('  FAIL ' + label + (extra ? ' — ' + extra : '')); } };

  try {
    const page = await browser.newPage();
    const client = await page.createCDPSession();
    await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, eventsEnabled: true });
    await page.setViewport({ width: 1440, height: 900 });

    // demo login bendahara
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      const r = await fetch('/api/auth/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'bendahara' }) });
      const d = await r.json();
      localStorage.setItem('jurnalku_token', d.token);
    });

    // Buku Kas — set periode harian ke 2026-10-26 (ada transaksi demo di tanggal itu)
    await page.goto(BASE + '/admin/buku-kas', { waitUntil: 'networkidle2' });
    await sleep(2500);

    // input date di PeriodeFilter = mode hari default; tunggu render selesai
    // (React render asinkron — poll sampai input date muncul, bukan sleep tetap).
    let setDate = 'belum ada';
    for (let i = 0; i < 20; i++) {
      setDate = await page.evaluate(() => {
        const inp = document.querySelector('input[type="date"]');
        if (!inp) return null;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(inp, '2026-10-26');
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        return 'set';
      });
      if (setDate) break;
      await sleep(500);
    }
    ok(setDate === 'set', `tanggal periode diset 2026-10-26 (${setDate || 'input date tidak pernah muncul'})`);
    await sleep(2500);

    // pastikan tabel termuat baris
    const rowCount = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      return rows.length;
    });
    ok(rowCount > 0, `tabel Buku Kas menampilkan ${rowCount} baris`);

    const filesBefore = fs.readdirSync(dir);
    await page.evaluate(() => {
      const semua = [...document.querySelectorAll('button')];
      const btn = semua.find(b => (b.textContent || '').includes('Excel'));
      if (btn) btn.click();
    });
    await sleep(5000);

    const files = fs.readdirSync(dir).filter(f => !filesBefore.includes(f));
    ok(files.length > 0, `file terunduh: ${files.join(', ') || '(tidak ada)'}`);
    if (files.length) {
      const f = path.join(dir, files[0]);
      const buf = fs.readFileSync(f);
      ok(buf[0] === 0x50 && buf[1] === 0x4b, `unduhan .xlsx valid (PK signature, ${buf.length} bytes)`);

      // baca balik isi workbook
      const wb = XLSX.read(buf, { type: 'buffer' });
      const namaSheet = wb.SheetNames;
      ok(namaSheet.includes('Buku Kas'), `sheet "Buku Kas" ada (${namaSheet.join(', ')})`);
      const ws = wb.Sheets[namaSheet[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const teks = JSON.stringify(rows);
      ok(teks.includes('SPP Oktober'), 'isi workbook memuat data transaksi demo');
      ok(teks.includes('DEBET') && teks.includes('SALDO'), 'kolom DEBET/SALDO ada di header');
      // header harus di baris ke-7 (kop 6 baris)
      const headerRow = rows[6] || [];
      ok(headerRow.includes('DEBET'), `header tabel di baris ke-7 (${JSON.stringify(headerRow.slice(0, 5))})`);
      console.log(`  (baris data: ${rows.length - 7})`);
    }
  } catch (err) {
    fail++;
    console.log('  FAIL exception: ' + err.message);
  } finally {
    await browser.close();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`PASS ${pass}   FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})();
