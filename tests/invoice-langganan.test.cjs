// Invoice langganan (super admin) — uji inti + render nyata.
//
// HTML invoice adalah satu sumber untuk PDF & JPEG; uji di sini memastikan isinya benar
// dan (bila Chromium tersedia) render PDF/JPEG menghasilkan byte yang valid.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'kunci-uji-jurnalku-invoice-0123456789'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Database = require('better-sqlite3')

const {
  setupInvoiceTables, nomorInvoiceBaru, buildInvoiceHtml, renderInvoicePdf, renderInvoiceJpeg,
  resolveChromium, barisInvoice, isiInvoice, hitungNominal, formatRp, formatTanggalId, escapeHtml,
} = require('../server/invoice-service.cjs')

function dbUji() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT, nama TEXT, alamat TEXT, plan TEXT DEFAULT 'trial');
    CREATE TABLE subscription_plans (plan TEXT PRIMARY KEY, label TEXT, harga INTEGER, masa_nilai INTEGER, masa_satuan TEXT, aktif INTEGER, fitur_json TEXT, urutan INTEGER);`)
  db.prepare("INSERT INTO tenants (id, slug, nama, alamat, plan) VALUES ('t1','mts','MTs Plus Sunan Drajat','Palang, Tuban','pro')").run()
  for (const p of [
    ['trial', 'Trial', 0, 1, 'bulan', 1, 0], ['pro', 'Pro', 80000, 1, 'bulan', 1, 1], ['premium', 'Premium', 150000, 1, 'bulan', 1, 2],
  ]) db.prepare('INSERT INTO subscription_plans (plan,label,harga,masa_nilai,masa_satuan,aktif,urutan) VALUES (?,?,?,?,?,?,?)').run(...p)
  setupInvoiceTables(db)
  return db
}

const contohInv = () => ({
  id: 'x', nomor: 'INV-202610-001', tanggal: '2026-10-16', plan: 'pro', plan_label: 'Pro',
  harga: 80000, masa_nilai: 1, masa_satuan: 'bulan', periode_mulai: '2026-10-16', periode_selesai: '2026-11-16',
  keterangan: '', tenant_nama: 'MTs Plus Sunan Drajat', tenant_alamat: 'Palang, Tuban',
})

test('buildInvoiceHtml memuat identitas lengkap dan nominal terformat', () => {
  const html = buildInvoiceHtml(contohInv())
  assert.match(html, /INV-202610-001/)
  assert.match(html, /MTs Plus Sunan Drajat/)
  assert.match(html, /Pro/)
  assert.match(html, /Rp 80\.000/)
  assert.match(html, /16 Oktober 2026/)
  assert.match(html, /16 November 2026/)
  assert.match(html, /JURNAL/)
})

test('buildInvoiceHtml menetralkan HTML pada input yang tidak dipercaya', () => {
  const html = buildInvoiceHtml({ ...contohInv(), tenant_nama: '<script>alert(1)</script>', keterangan: 'a < b & "c"' })
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /a &lt; b &amp; &quot;c&quot;/)
})

test('nomorInvoiceBaru berurutan dan diberi prefix bulan (setelah baris tersimpan)', () => {
  const db = dbUji()
  const ym = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const a = nomorInvoiceBaru(db)
  assert.match(a, new RegExp(`^INV-${ym}-001$`))
  // Nomor berikutnya naik hanya setelah invoice benar-benar tersimpan.
  db.prepare(`INSERT INTO subscription_invoices (id, tenant_id, nomor, tanggal, plan, harga, masa_nilai, masa_satuan, periode_mulai, periode_selesai)
              VALUES ('i1','t1',?,'2026-10-16','pro',80000,1,'bulan','','')`).run(a)
  const b = nomorInvoiceBaru(db)
  assert.match(b, new RegExp(`^INV-${ym}-002$`))
})

test('isiInvoice mengisi harga & label dari paket bila tidak dikirim, dan nomor unik', () => {
  const db = dbUji()
  const inv = isiInvoice(db, { tenantId: 't1', plan: 'pro', createdBy: 'op' })
  assert.equal(inv.plan, 'pro')
  assert.equal(inv.plan_label, 'Pro')
  assert.equal(inv.harga_satuan, 80000)
  assert.equal(inv.harga, 80000)
  assert.equal(inv.tenant_nama, 'MTs Plus Sunan Drajat')
  assert.match(inv.nomor, /^INV-/)
  assert.equal(barisInvoice(db, inv.id).harga, 80000)
})

test('nominal invoice otomatis: harga satuan paket x masa aktif', () => {
  // Lite Rp40.000/bulan: 2 bulan -> 80.000, 3 bulan -> 120.000, 12 bulan -> 480.000.
  assert.equal(hitungNominal(40000, 1), 40000)
  assert.equal(hitungNominal(40000, 2), 80000)
  assert.equal(hitungNominal(40000, 3), 120000)
  assert.equal(hitungNominal(40000, 12), 480000)
  // Satuan hari juga berlaku sama, dan masa tidak valid tidak menghasilkan 0.
  assert.equal(hitungNominal(5000, 7), 35000)
  assert.equal(hitungNominal(40000, 0), 40000)
  assert.equal(hitungNominal(40000, null), 40000)
  assert.equal(hitungNominal(40000, 2.4), 80000)

  const db = dbUji()
  const tigaBulan = isiInvoice(db, { tenantId: 't1', plan: 'pro', masaNilai: 3, masaSatuan: 'bulan', createdBy: 'op' })
  assert.equal(tigaBulan.harga_satuan, 80000)
  assert.equal(tigaBulan.harga, 240000, 'Pro 80.000/bulan x 3 bulan harus 240.000')
  assert.match(buildInvoiceHtml(tigaBulan), /Rp 80\.000\/bulan × 3 bulan/)
  assert.match(buildInvoiceHtml(tigaBulan), /Rp 240\.000/)
})

test('route invoice mengabaikan nominal kiriman klien (dihitung server)', () => {
  const idx = fs.readFileSync('server/index.cjs', 'utf8')
  const blok = idx.slice(idx.indexOf("app.post('/api/admin/invoices'"), idx.indexOf("app.get('/api/admin/invoices/:id'"))
  assert.doesNotMatch(blok, /harga:\s*req\.body\.harga/, 'nominal tidak boleh diambil dari body')
  assert.match(blok, /masaNilai:\s*req\.body\.masa_nilai/)
})

test('migrasi invoice lama mengisi harga_satuan dari total/masa', () => {
  const Database = require('better-sqlite3')
  const db = new Database(':memory:')
  // Tabel versi LAMA (tanpa harga_satuan) + satu invoice 3 bulan.
  db.exec(`CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT, nama TEXT, alamat TEXT, plan TEXT DEFAULT 'trial');
    CREATE TABLE subscription_plans (plan TEXT PRIMARY KEY, label TEXT, harga INTEGER, masa_nilai INTEGER, masa_satuan TEXT, aktif INTEGER, fitur_json TEXT, urutan INTEGER);
    CREATE TABLE subscription_invoices (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, nomor TEXT NOT NULL, tanggal TEXT NOT NULL,
      plan TEXT NOT NULL, plan_label TEXT NOT NULL DEFAULT '', harga INTEGER NOT NULL DEFAULT 0, masa_nilai INTEGER NOT NULL DEFAULT 1,
      masa_satuan TEXT NOT NULL DEFAULT 'bulan', periode_mulai TEXT NOT NULL DEFAULT '', periode_selesai TEXT NOT NULL DEFAULT '',
      keterangan TEXT NOT NULL DEFAULT '', created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));`)
  db.prepare("INSERT INTO subscription_invoices (id,tenant_id,nomor,tanggal,plan,harga,masa_nilai,masa_satuan) VALUES ('i1','t1','INV-202610-001','2026-10-16','lite',120000,3,'bulan')").run()
  setupInvoiceTables(db)
  const inv = db.prepare("SELECT harga, harga_satuan, masa_nilai FROM subscription_invoices WHERE id='i1'").get()
  assert.equal(inv.harga_satuan, 40000, 'harga_satuan invoice lama harus 120000/3 = 40000')
  assert.equal(inv.harga, 120000, 'total invoice lama tidak boleh berubah')
  // Idempoten: memanggil ulang tidak mengubah apa pun.
  setupInvoiceTables(db)
  assert.equal(db.prepare("SELECT harga_satuan FROM subscription_invoices WHERE id='i1'").get().harga_satuan, 40000)
})

test('formatRp dan formatTanggalId stabil', () => {
  assert.equal(formatRp(80000), 'Rp 80.000')
  assert.equal(formatRp(1500000), 'Rp 1.500.000')
  assert.equal(formatTanggalId('2026-11-16'), '16 November 2026')
  assert.equal(escapeHtml('<a>'), '&lt;a&gt;')
})

test('resolveChromium menemukan Chrome (lokal/VPS)', () => {
  const exe = resolveChromium()
  assert.ok(exe, 'Chromium seharusnya tersedia (ms-playwright lokal / puppeteer VPS)')
  assert.ok(fs.existsSync(exe))
})

test('render PDF & JPEG menghasilkan byte valid dari HTML yang sama', { skip: !resolveChromium() }, async () => {
  const html = buildInvoiceHtml(contohInv())
  const pdf = await renderInvoicePdf(html)
  const jpg = await renderInvoiceJpeg(html)
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF', 'PDF harus diawali %PDF')
  assert.equal(jpg[0], 0xFF, 'JPEG harus diawali 0xFF')
  assert.equal(jpg[1], 0xD8, 'JPEG harus diawali 0xFFD8')
  assert.ok(pdf.length > 1000, 'PDF tidak boleh kosong')
  assert.ok(jpg.length > 5000, 'JPEG tidak boleh kosong')
})

// --- Pemasangan route & menu ---------------------------------------------

test('route invoice terdaftar & dibatasi SUPER, dengan jalur PDF/JPEG', () => {
  const idx = fs.readFileSync('server/index.cjs', 'utf8')
  assert.match(idx, /app\.get\('\/api\/admin\/invoices', SUPER/)
  assert.match(idx, /app\.post\('\/api\/admin\/invoices', SUPER/)
  assert.match(idx, /app\.get\('\/api\/admin\/invoices\/:id\/pdf', SUPER/)
  assert.match(idx, /app\.get\('\/api\/admin\/invoices\/:id\/jpeg', SUPER/)
  assert.match(idx, /invoiceService\.setupInvoiceTables\(db\)/)
})

test('menu & halaman Invoice Langganan tampil untuk super admin', () => {
  const menu = fs.readFileSync('src/lib/menuItems.tsx', 'utf8')
  const app = fs.readFileSync('src/App.tsx', 'utf8')
  assert.match(menu, /label: 'Invoice Langganan'[\s\S]*?path: '\/admin\/invoice'/)
  assert.match(app, /path="invoice"[\s\S]*?InvoicePage/)
})