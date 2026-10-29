// Pengingat masa aktif paket (trial/langganan hampir berakhir).
//
// Yang dijaga:
//   1. Scheduler mengirim pengingat WA + email hanya untuk lembaga yang sisa
//      masa aktifnya <= REMINDER_DAYS (default 3) hari — bukan semua tenant.
//   2. Idempoten: tabel expiry_reminder_log mencegah kirim ulang untuk tanggal
//      berakhir yang sama (aman dipanggil berulang saat restart/PM2).
//   3. Lembaga tanpa tanggal berakhir / sudah expired / masih jauh dilewati.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'kunci-uji-jurnalku-expiry-00000'
process.env.MAIL_DISABLED = '1' // jangan benar-benar kirim email saat uji

const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')

const { setupWA } = require('../server/wa-queue.cjs')
const { pesanWaPengingat, jalankanPengingat, urlTenant, planLabelId } = require('../server/expiry-reminder.cjs')

function siapkanSesiWA(db, tenantId = 'default') {
  db.exec(`CREATE TABLE IF NOT EXISTS wa_gateway_config (tenant_id TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0, provider TEXT DEFAULT 'baileys');`)
  db.prepare("INSERT OR REPLACE INTO wa_gateway_config (tenant_id, enabled, provider) VALUES (?,1,'baileys')").run(tenantId)
  db.prepare("INSERT OR REPLACE INTO wa_sessions (tenant_id, status, updated_at) VALUES (?,'connected',datetime('now'))").run(tenantId)
}

function dbDasar() {
  const db = new Database(':memory:')
  setupWA(db)
  siapkanSesiWA(db)
  db.exec(`
    CREATE TABLE tenants (
      id TEXT PRIMARY KEY, nama TEXT, slug TEXT, base_domain TEXT,
      domain_custom TEXT, domain_status TEXT, plan TEXT,
      trial_ends_at TEXT, subscription_ends_at TEXT, expired_at TEXT, aktif INTEGER DEFAULT 1);
    CREATE TABLE users (id TEXT PRIMARY KEY, nama TEXT, email TEXT, role TEXT, tenant_id TEXT, created_at TEXT);
    CREATE TABLE settings (id TEXT PRIMARY KEY, tenant_id TEXT, telepon TEXT);
    CREATE TABLE subscription_plans (plan TEXT PRIMARY KEY, label TEXT);
  `)
  db.prepare("INSERT INTO subscription_plans (plan, label) VALUES ('trial','Trial'),('lite','Lite'),('pro','Pro')").run()
  return db
}

function tambahTenant(db, id, { nama, slug, plan = 'trial', trialEnds, subEnds = null, aktif = 1, telepon = '081234567890', email = 'admin@x.id' }) {
  db.prepare(`INSERT INTO tenants (id, nama, slug, base_domain, plan, trial_ends_at, subscription_ends_at, aktif)
    VALUES (?,?,?,'jurnal.cc.cd',?,?,?,?)`).run(id, nama, slug, plan, trialEnds, subEnds, aktif)
  db.prepare(`INSERT INTO users (id, nama, email, role, tenant_id, created_at) VALUES (?,?,?,'admin',?,datetime('now'))`)
    .run(`u-${id}`, `Admin ${nama}`, email, id)
  db.prepare(`INSERT INTO settings (id, tenant_id, telepon) VALUES (?,?,?)`).run(`main_${id}`, id, telepon)
}

const isoDariSekarang = hari => new Date(Date.now() + hari * 86400000).toISOString()

// ─── Isi pesan ────────────────────────────────────────────────────────────

test('pesan WA pengingat memuat madrasah, paket, tanggal, sisa hari, dan tautan perpanjang', () => {
  const pesan = pesanWaPengingat({
    namaLembaga: 'MTs Contoh', namaAdmin: 'Budi', nHari: 3,
    planLabel: 'Paket Trial (Masa Uji Coba)', frasaMasa: 'Masa uji coba',
    tanggal: '30 Oktober 2026', url: 'https://contoh.jurnal.cc.cd',
    supportPhone: '0859-1807-12924', supportWa: 'https://wa.me/62859180712924', supportEmail: 'a@x.id',
  })
  assert.match(pesan, /PENGINGAT MASA AKTIF PAKET/)
  assert.match(pesan, /MTs Contoh/)
  assert.match(pesan, /Paket Trial \(Masa Uji Coba\)/)
  assert.match(pesan, /30 Oktober 2026/)
  assert.match(pesan, /tinggal 3 hari/)
  assert.match(pesan, /contoh\.jurnal\.cc\.cd\/admin\/tenants/)
  assert.match(pesan, /0859-1807-12924/)
})

test('urlTenant & planLabelId', () => {
  assert.equal(urlTenant({ slug: 'x', base_domain: 'jurnal.cc.cd', domain_custom: null, domain_status: null }), 'https://x.jurnal.cc.cd')
  assert.equal(urlTenant({ slug: 'x', base_domain: 'jurnal.cc.cd', domain_custom: 'mts.id', domain_status: 'active' }), 'https://mts.id')
  assert.equal(urlTenant({ slug: 'x', base_domain: 'jurnal.cc.cd', domain_custom: 'mts.id', domain_status: 'pending' }), 'https://x.jurnal.cc.cd')
  assert.equal(planLabelId('trial', 'Trial'), 'Paket Trial (Masa Uji Coba)')
  assert.equal(planLabelId('lite', 'Lite'), 'Paket Lite')
})

// ─── Scheduler ────────────────────────────────────────────────────────────

test('jalankanPengingat mengirim hanya untuk tenant yang sisa <= 3 hari', async () => {
  const db = dbDasar()
  tambahTenant(db, 'hampir', { nama: 'MTs Hampir', slug: 'hampir', trialEnds: isoDariSekarang(2) })
  tambahTenant(db, 'jauh', { nama: 'MTs Jauh', slug: 'jauh', trialEnds: isoDariSekarang(10) })
  tambahTenant(db, 'expired', { nama: 'MTs Expired', slug: 'expired', trialEnds: isoDariSekarang(-2) })
  tambahTenant(db, 'tanpa', { nama: 'MTs Tanpa', slug: 'tanpa', trialEnds: null })

  const r = await jalankanPengingat(db)
  assert.equal(r.terkirim, 1, 'hanya tenant 2 hari yang dikirimi')
  const antre = db.prepare('SELECT * FROM wa_queue').all()
  assert.equal(antre.length, 1)
  assert.match(antre[0].message, /MTs Hampir/)
  assert.match(antre[0].message, /tinggal (2|3) hari/)
  // Log tercatat untuk tanggal berakhir tenant itu.
  assert.equal(db.prepare('SELECT COUNT(*) c FROM expiry_reminder_log').get().c, 1)
})

test('jalankanPengingat idempoten: putaran kedua tidak mengirim ulang', async () => {
  const db = dbDasar()
  tambahTenant(db, 'hampir', { nama: 'MTs Hampir', slug: 'hampir', trialEnds: isoDariSekarang(2) })
  await jalankanPengingat(db)
  const kedua = await jalankanPengingat(db)
  assert.equal(kedua.terkirim, 0)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM wa_queue').get().c, 1)
})

test('tenant premium tanpa subscription_ends_at dilewati (unlimited)', async () => {
  const db = dbDasar()
  tambahTenant(db, 'prem', { nama: 'MTs Prem', slug: 'prem', plan: 'premium', trialEnds: isoDariSekarang(2) })
  const r = await jalankanPengingat(db)
  assert.equal(r.terkirim, 0, 'premium tanpa tanggal berakhir tidak diingatkan')
})

test('tenant nonaktif (aktif=0) dilewati', async () => {
  const db = dbDasar()
  tambahTenant(db, 'nonaktif', { nama: 'MTs Nonaktif', slug: 'nonaktif', trialEnds: isoDariSekarang(2), aktif: 0 })
  const r = await jalankanPengingat(db)
  assert.equal(r.terkirim, 0)
})

test('reminder_days dari DB (dashboard superadmin) dipakai scheduler', async () => {
  const db = dbDasar()
  db.exec('CREATE TABLE platform_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  db.prepare("INSERT INTO platform_settings (key, value) VALUES ('reminder_days','7')").run()
  // Tenant sisa 5 hari: dilewati saat default 3, tapi dikirimi saat DB = 7.
  tambahTenant(db, 'lima', { nama: 'MTs Lima', slug: 'lima', trialEnds: isoDariSekarang(5) })
  const r = await jalankanPengingat(db)
  assert.equal(r.terkirim, 1, '5 hari masuk jangkauan karena reminder_days=7 dari DB')
})

test('route pengaturan platform dibatasi super admin + validasi hari', () => {
  const idx = require('fs').readFileSync(require('path').join(__dirname, '../server/index.cjs'), 'utf8')
  assert.match(idx, /app\.get\('\/api\/platform\/settings', SUPER/)
  assert.match(idx, /app\.put\('\/api\/platform\/settings', SUPER/)
  assert.match(idx, /Hari pengingat harus bulat 1 - 60/)
})
