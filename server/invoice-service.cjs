// Invoice langganan platform — untuk SUPER ADMIN.
//
// Ketika sebuah lembaga berlangganan, operator platform menerbitkan invoice sebagai
// bukti tagihan. Dokumen dirender DARI HTML yang sama ke dua keluaran:
//   - PDF  (page.pdf)
//   - JPEG (page.screenshot fullPage) — untuk dikirim lewat WA/email sebagai gambar.
//
// Rendering memakai puppeteer-core + Chromium (jalur di-resolve otomatis lintas mesin:
// VPS punya chrome di /root/.cache/puppeteer, lokal di ~/.cache/ms-playwright).

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { getPlans } = require('./subscription.cjs')

// ---------------------------------------------------------------------------
// Tabel
// ---------------------------------------------------------------------------

function setupInvoiceTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscription_invoices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      nomor TEXT NOT NULL,
      tanggal TEXT NOT NULL,
      plan TEXT NOT NULL,
      plan_label TEXT NOT NULL DEFAULT '',
      harga INTEGER NOT NULL DEFAULT 0,
      masa_nilai INTEGER NOT NULL DEFAULT 1,
      masa_satuan TEXT NOT NULL DEFAULT 'bulan',
      periode_mulai TEXT NOT NULL DEFAULT '',
      periode_selesai TEXT NOT NULL DEFAULT '',
      keterangan TEXT NOT NULL DEFAULT '',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_invoices_nomor ON subscription_invoices(nomor);
    CREATE INDEX IF NOT EXISTS idx_subscription_invoices_tenant ON subscription_invoices(tenant_id);
  `)
}

// ---------------------------------------------------------------------------
// Helper murni
// ---------------------------------------------------------------------------

const SATUAN_LABEL = { bulan: 'bulan', hari: 'hari' }

function formatRp(angka) {
  return 'Rp ' + Number(angka || 0).toLocaleString('id-ID')
}

function formatTanggalId(iso) {
  if (!iso) return ''
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return String(iso)
  const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`
}

function masaTeks(nilai, satuan) {
  const n = Number(nilai) || 1
  const s = SATUAN_LABEL[satuan] || 'bulan'
  return `${n} ${s}`
}

/** Nomor invoice: INV-<YYYYMM>-<NNN> (1-based per bulan). Aman untuk pemakai tunggal. */
function nomorInvoiceBaru(db) {
  const now = new Date()
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const prefix = `INV-${ym}-`
  const count = db.prepare("SELECT COUNT(*) c FROM subscription_invoices WHERE nomor LIKE ?").get(`${prefix}%`).c
  // Nomor lubang (dihapus) dihindari dengan mencoba dari count+1 naik sampai bebas.
  for (let i = count + 1; i < count + 100; i++) {
    const nomor = `${prefix}${String(i).padStart(3, '0')}`
    if (!db.prepare('SELECT 1 FROM subscription_invoices WHERE nomor=?').get(nomor)) return nomor
  }
  return `${prefix}${String(count + 1).padStart(3, '0')}`
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** HTML invoice mandiri (inline CSS, tanpa aset eksternal) — satu sumber untuk PDF & JPEG. */
function buildInvoiceHtml(inv) {
  const baris = `
    <tr>
      <td class="desc">Paket langganan <strong>${escapeHtml(inv.plan_label || inv.plan)}</strong></td>
      <td class="qty">${escapeHtml(masaTeks(inv.masa_nilai, inv.masa_satuan))}</td>
      <td class="amt">${formatRp(inv.harga)}</td>
    </tr>`
  const keterangan = inv.keterangan
    ? `<div class="note"><strong>Catatan:</strong> ${escapeHtml(inv.keterangan)}</div>`
    : ''
  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Invoice ${escapeHtml(inv.nomor)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#111827;background:#fff}
    .page{width:794px;padding:44px 48px;margin:0 auto}
    .brand{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1e3a8a;padding-bottom:16px}
    .brand .logo{font-size:22px;font-weight:800;color:#1e3a8a;letter-spacing:1px}
    .brand .logo span{color:#f59e0b}
    .brand .sub{font-size:11px;color:#64748b;margin-top:2px}
    .brand .doc{text-align:right;font-size:12px;color:#475569}
    .brand .doc .t{font-size:18px;font-weight:800;color:#111827;letter-spacing:1px}
    .meta{display:flex;justify-content:space-between;margin:22px 0 18px;gap:20px}
    .meta .block{font-size:12px;line-height:1.7;color:#374151}
    .meta .block .label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:4px}
    .meta .block .nama{font-weight:700;font-size:14px;color:#111827}
    .meta .kanan{text-align:right}
    table{width:100%;border-collapse:collapse;font-size:12px}
    thead th{background:#1e3a8a;color:#fff;text-align:left;padding:9px 12px;font-size:11px;letter-spacing:.5px}
    thead th.amt,thead th.qty{text-align:right}
    tbody td{padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top}
    td.qty,td.amt{text-align:right;white-space:nowrap}
    .total{margin-top:4px;display:flex;justify-content:flex-end}
    .total .box{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;min-width:240px}
    .total .row{display:flex;justify-content:space-between;gap:28px;font-size:12px;color:#475569;padding:2px 0}
    .total .row.grand{font-size:16px;font-weight:800;color:#111827;border-top:1px solid #cbd5e1;margin-top:6px;padding-top:8px}
    .note{margin-top:18px;font-size:12px;color:#475569;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px}
    .footer{margin-top:30px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;text-align:center}
  </style></head><body>
  <div class="page">
    <div class="brand">
      <div>
        <div class="logo">JURNAL<span>KU</span></div>
        <div class="sub">Sistem Informasi Manajemen Sekolah &amp; Madrasah</div>
      </div>
      <div class="doc"><div class="t">INVOICE</div><div>${escapeHtml(inv.nomor)}</div></div>
    </div>
    <div class="meta">
      <div class="block">
        <div class="label">Ditagihkan kepada</div>
        <div class="nama">${escapeHtml(inv.tenant_nama || '—')}</div>
        <div>${escapeHtml(inv.tenant_alamat || '')}</div>
      </div>
      <div class="block kanan">
        <div class="label">Rincian</div>
        <div>Tanggal terbit: ${escapeHtml(formatTanggalId(inv.tanggal))}</div>
        <div>Periode: ${escapeHtml(formatTanggalId(inv.periode_mulai))} — ${escapeHtml(formatTanggalId(inv.periode_selesai))}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Deskripsi</th><th class="qty">Masa</th><th class="amt">Jumlah</th></tr></thead>
      <tbody>${baris}</tbody>
    </table>
    <div class="total"><div class="box">
      <div class="row"><span>Subtotal</span><span>${formatRp(inv.harga)}</span></div>
      <div class="row grand"><span>TOTAL</span><span>${formatRp(inv.harga)}</span></div>
    </div></div>
    ${keterangan}
    <div class="footer">Dokumen ini diterbitkan oleh JURNALKU — bukti tagihan langganan resmi. Simpan sebagai referensi pembayaran.</div>
  </div>
  </body></html>`
}

// ---------------------------------------------------------------------------
// Resolusi Chromium
// ---------------------------------------------------------------------------

function globCache(base, pattern) {
  try {
    const root = base.replace(/^~/, os.homedir())
    if (!fs.existsSync(root)) return []
    return fs.readdirSync(root)
      .filter(n => n.startsWith(pattern.replace(/\*/g, '')))
      .map(n => path.join(root, n))
  } catch { return [] }
}

function kandidatChromium() {
  const out = []
  if (process.env.CHROMIUM_PATH) out.push(process.env.CHROMIUM_PATH)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) out.push(process.env.PUPPETEER_EXECUTABLE_PATH)
  for (const dir of globCache('/root/.cache/puppeteer/chrome', 'linux-')) {
    out.push(path.join(dir, 'chrome-linux64', 'chrome'), path.join(dir, 'chrome-linux', 'chrome'))
  }
  for (const dir of globCache('~/.cache/puppeteer/chrome', 'linux-')) {
    out.push(path.join(dir, 'chrome-linux64', 'chrome'), path.join(dir, 'chrome-linux', 'chrome'))
  }
  for (const dir of globCache('~/.cache/ms-playwright', 'chromium-')) {
    out.push(path.join(dir, 'chrome-linux64', 'chrome'), path.join(dir, 'chrome-linux', 'chrome'))
  }
  out.push('/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable')
  return out
}

function resolveChromium() {
  for (const p of kandidatChromium()) {
    if (p && fs.existsSync(p)) return p
  }
  return null
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

async function renderInvoicePdf(html, { puppeteerImpl = null } = {}) {
  const puppeteer = puppeteerImpl || (await import('puppeteer-core')).default
  const exe = resolveChromium()
  if (!exe) throw new Error('Chromium tidak ditemukan di server ini (set CHROMIUM_PATH)')
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: exe,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }))
  } finally {
    await browser.close()
  }
}

async function renderInvoiceJpeg(html, { puppeteerImpl = null } = {}) {
  const puppeteer = puppeteerImpl || (await import('puppeteer-core')).default
  const exe = resolveChromium()
  if (!exe) throw new Error('Chromium tidak ditemukan di server ini (set CHROMIUM_PATH)')
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: exe,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 })
    await page.setContent(html, { waitUntil: 'networkidle0' })
    return Buffer.from(await page.screenshot({ type: 'jpeg', quality: 92, fullPage: true }))
  } finally {
    await browser.close()
  }
}

// ---------------------------------------------------------------------------
// Akses DB + pembuatan
// ---------------------------------------------------------------------------

function barisInvoice(db, id) {
  const inv = db.prepare('SELECT * FROM subscription_invoices WHERE id=?').get(id)
  if (!inv) return null
  const tenant = db.prepare('SELECT nama, alamat FROM tenants WHERE id=?').get(inv.tenant_id)
  return {
    ...inv,
    tenant_nama: tenant?.nama || '',
    tenant_alamat: tenant?.alamat || '',
    total: inv.harga,
  }
}

function isiInvoice(db, { tenantId, plan, harga, masaNilai, masaSatuan, periodeMulai, periodeSelesai, keterangan, createdBy }) {
  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(tenantId)
  if (!tenant) throw new Error('Lembaga tidak ditemukan')
  const plans = getPlans(db)
  const planRow = plans.find(p => p.plan === plan) || plans.find(p => p.plan === tenant.plan) || plans[0]
  const finalPlan = planRow.plan
  const finalLabel = planRow.label || plan
  const finalHarga = harga !== undefined && harga !== null && harga !== '' ? Math.max(0, Math.round(Number(harga))) : Number(planRow.harga || 0)
  const finalMasaNilai = Number(masaNilai || planRow.masa_nilai || 1)
  const finalMasaSatuan = masaSatuan || planRow.masa_satuan || 'bulan'

  const id = crypto.randomUUID()
  const tanggal = new Date().toISOString().slice(0, 10)
  const nomor = nomorInvoiceBaru(db)
  db.prepare(`INSERT INTO subscription_invoices
    (id, tenant_id, nomor, tanggal, plan, plan_label, harga, masa_nilai, masa_satuan, periode_mulai, periode_selesai, keterangan, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, tenantId, nomor, tanggal, finalPlan, finalLabel, finalHarga, finalMasaNilai, finalMasaSatuan,
      String(periodeMulai || ''), String(periodeSelesai || ''), String(keterangan || ''), String(createdBy || ''))
  return barisInvoice(db, id)
}

module.exports = {
  setupInvoiceTables,
  nomorInvoiceBaru,
  buildInvoiceHtml,
  renderInvoicePdf,
  renderInvoiceJpeg,
  resolveChromium,
  barisInvoice,
  isiInvoice,
  formatRp,
  formatTanggalId,
  masaTeks,
  escapeHtml,
}