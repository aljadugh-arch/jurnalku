// Payment Gateway QRIS (fazapay) — sisi KONSUMEN gateway.
//
// Jurnalku tidak bicara langsung ke GoPay/ShopeePay; ia memakai gateway QRIS yang
// sudah kita bangun (pg.fazapay.ccwu.cc). Modul ini memegang seluruh kontraknya:
//
//   GET  {base}/api/payment/qris?amount=N   -> {order_id:"GP-…", qris_code, qris_url}
//   GET  {base}/api/payment/status?amount=N -> {amount, paid, recent_count}
//   POST {base}/api/webhook/register        -> daftarkan url callback
//   POST {base}/api/auth/verify             -> uji API key
//
// Tiga hal yang WAJIB diingat (semuanya ditemukan dari uji live, bukan dari daftar
// route di source gateway):
//
//   1. Jalur web TIDAK menerima order_id titipan. Gateway membuat `GP-<uuid>` sendiri,
//      jadi order_id yang DIKEMBALIKAN itulah yang harus disimpan di `payment_intents`
//      dan dicocokkan saat webhook datang. Jangan pernah mengarang order_id.
//   2. Endpoint yang mati (generate-qris/status-by-order/cancel) membalas HTTP **200**
//      dengan body {"message":"Invalid/Expired token"} — bukan 4xx. Karena itu semua
//      pemeriksaan di sini menilai `body.success === true`, bukan kode status.
//   3. Autodetect gateway mencocokkan pembayaran berdasarkan NOMINAL, bukan referensi.
//      Dua intent pending dengan nominal sama bisa sama-sama ditandai lunas oleh satu
//      pembayaran. Karena itu setiap intent diberi kode unik 3 digit (pay_amount =
//      nominal + kode unik) dan ada indeks unik parsial (tenant_id, pay_amount) untuk
//      status 'pending' — satu nominal terpindai = satu intent.
//
// Alur: buatIntent -> QR -> pembayar scan -> webhook ber-HMAC (atau poller cadangan)
// -> tandaiLunas -> applier per ref_type (tagihan lunas / saldo cashless / setoran tabungan).

const crypto = require('node:crypto')

let encryptSecret = (v) => String(v ?? '')
let decryptSecret = (v) => String(v ?? '')
let maskKey = (v) => (v ? '••••' : '')
try {
  const ai = require('./ai-config.cjs')
  if (typeof ai.encryptSecret === 'function') encryptSecret = ai.encryptSecret
  if (typeof ai.decryptSecret === 'function') decryptSecret = ai.decryptSecret
  if (typeof ai.maskKey === 'function') maskKey = ai.maskKey
} catch { /* enkripsi opsional saat modul diuji sendirian */ }

let assertSafeOutboundUrl = null
try {
  const guard = require('./ssrf-guard.cjs')
  if (typeof guard.assertSafeOutboundUrl === 'function') assertSafeOutboundUrl = guard.assertSafeOutboundUrl
} catch { /* guard opsional */ }

const PROVIDER = 'fazapay'
const DEFAULT_BASE_URL = 'https://pg.fazapay.ccwu.cc'
const EVENT_TERDAFTAR = 'transaction.received'
const KODE_UNIK_MIN = 101
const KODE_UNIK_MAX = 999
const TIMEOUT_MS = 15000
const MASA_BERLAKU_JAM = 24

const REF_TYPES = ['tagihan', 'topup', 'tabungan', 'langganan']
const STATUS_INTENT = ['pending', 'paid', 'expired', 'canceled']

// ---------------------------------------------------------------------------
// Tabel
// ---------------------------------------------------------------------------

function setupPaymentGatewayTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_gateway_config (
      tenant_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'fazapay',
      base_url TEXT NOT NULL DEFAULT '${DEFAULT_BASE_URL}',
      api_key_encrypted TEXT NOT NULL DEFAULT '',
      api_key_hint TEXT NOT NULL DEFAULT '',
      webhook_token TEXT NOT NULL DEFAULT '',
      webhook_registered_at TEXT,
      webhook_last_error TEXT,
      enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
      last_verified_at TEXT,
      last_verify_error TEXT,
      updated_by TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payment_intents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'fazapay',
      ref_type TEXT NOT NULL,
      ref_id TEXT NOT NULL DEFAULT '',
      student_id TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT '',
      nominal INTEGER NOT NULL CHECK (nominal > 0),
      kode_unik TEXT NOT NULL,
      pay_amount INTEGER NOT NULL CHECK (pay_amount > 0),
      gateway_order_id TEXT,
      qris_code TEXT,
      qris_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      sumber TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      paid_at TEXT,
      raw_webhook_json TEXT,
      meta_json TEXT,
      settled INTEGER NOT NULL DEFAULT 0,
      settled_at TEXT
    );
  `)

  // Nominal bayar (nominal + kode unik) WAJIB unik GLOBAL antar-intent pending —
  // BUKAN per-tenant. Gateway mencocokkan pembayaran berdasarkan NOMINAL di akun
  // merchant BERSAMA, jadi kalau dua lembaga punya pay_amount sama, satu pembayaran
  // bisa menandai KEDUANYA lunas (uang lembaga lain "gratis"). Indeks lama memakai
  // (tenant_id, pay_amount) dan tidak menutup celah itu.
  db.exec('DROP INDEX IF EXISTS idx_payment_intents_pending_amount')
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_pending_amount_global ON payment_intents(pay_amount) WHERE status='pending'")
  } catch {
    // Basis data lama bisa sudah punya tabrakan lintas tenant. Pertahankan yang paling
    // lama (rowid terkecil), kedaluwarsakan sisanya, lalu pasang indeks sekali lagi.
    db.exec(`UPDATE payment_intents SET status='expired'
      WHERE status='pending' AND rowid NOT IN (
        SELECT MIN(rowid) FROM payment_intents WHERE status='pending' GROUP BY pay_amount
      )`)
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_pending_amount_global ON payment_intents(pay_amount) WHERE status='pending'")
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_payment_intents_tenant_status ON payment_intents(tenant_id, status, created_at)')
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_order ON payment_intents(tenant_id, gateway_order_id) WHERE gateway_order_id IS NOT NULL')
  db.exec('CREATE INDEX IF NOT EXISTS idx_payment_intents_ref ON payment_intents(tenant_id, ref_type, ref_id)')

  // Kolom tambahan untuk basis data yang tabelnya sudah terlanjur dibuat versi awal.
  for (const kolom of [
    ['label', "TEXT NOT NULL DEFAULT ''"],
    ['sumber', 'TEXT'],
    ['settled', 'INTEGER NOT NULL DEFAULT 0'],
    ['settled_at', 'TEXT'],
    ['meta_json', 'TEXT'],
  ]) {
    try {
      const ada = db.prepare('PRAGMA table_info(payment_intents)').all().some(c => c.name === kolom[0])
      if (!ada) db.exec(`ALTER TABLE payment_intents ADD COLUMN ${kolom[0]} ${kolom[1]}`)
    } catch { /* idempoten */ }
  }
}

// ---------------------------------------------------------------------------
// Helper murni (diuji tanpa jaringan)
// ---------------------------------------------------------------------------

/** Normalisasi base URL gateway: wajib http(s), tanpa trailing slash, tanpa kredensial di URL. */
function normalisasiBaseUrl(raw) {
  const teks = String(raw ?? '').trim()
  if (!teks) throw new Error('URL gateway wajib diisi')
  let url
  try { url = new URL(teks) } catch { throw new Error('URL gateway tidak valid') }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('URL gateway harus http atau https')
  if (url.username || url.password) throw new Error('URL gateway tidak boleh memuat kredensial')
  if (url.search || url.hash) throw new Error('URL gateway tidak boleh memuat query/hash')
  const path = url.pathname.replace(/\/+$/, '')
  return `${url.protocol}//${url.host}${path}`
}

/** Nominal rupiah: integer > 0, dibulatkan dari REAL (tagihan menyimpan REAL). */
function normalisasiNominal(nilai) {
  const angka = Math.round(Number(nilai))
  if (!Number.isFinite(angka) || angka <= 0) throw new Error('Nominal wajib angka bulat positif')
  if (angka > 100_000_000) throw new Error('Nominal melebihi batas wajar')
  return angka
}

function buatTokenWebhook() {
  return crypto.randomBytes(20).toString('hex')
}

/** HMAC-SHA256 hex — persis seperti yang dihitung gateway (secret = API key tenant). */
function tandaTangan(rawBody, secret) {
  return crypto.createHmac('sha256', String(secret ?? '')).update(rawBody).digest('hex')
}

/** Perbandingan waktu-tetap; panjang beda = langsung gagal (timingSafeEqual melempar). */
function verifikasiTandaTangan(rawBody, signature, secret) {
  const diharapkan = tandaTangan(rawBody, secret)
  const diterima = String(signature ?? '').trim().toLowerCase()
  if (!diterima || diterima.length !== diharapkan.length) return false
  try { return crypto.timingSafeEqual(Buffer.from(diharapkan), Buffer.from(diterima)) } catch { return false }
}

function nominalBayar(nominal, kodeUnik) {
  return normalisasiNominal(nominal) + Number(kodeUnik)
}

/** Kode unik 3 digit yang belum dipakai intent pending MANA PUN (lintas tenant). */
function kodeUnikBaru(db, tenantId, rng = crypto.randomInt) {
  // Unik GLOBAL, bukan per-tenant: pay_amount dipakai di akun merchant bersama,
  // jadi kode yang sama di lembaga lain tetap bisa membuat nominal bentrok.
  const dipakai = new Set(
    db.prepare("SELECT kode_unik FROM payment_intents WHERE status='pending'").all().map(r => String(r.kode_unik))
  )
  const ruang = KODE_UNIK_MAX - KODE_UNIK_MIN + 1
  for (let i = 0; i < 400; i++) {
    const kandidat = String(KODE_UNIK_MIN + rng(ruang))
    if (!dipakai.has(kandidat)) return kandidat
  }
  throw new Error('Kode unik sudah penuh — selesaikan atau batalkan intent pending lebih dulu')
}

function masaBerlaku(dari = new Date()) {
  return new Date(dari.getTime() + MASA_BERLAKU_JAM * 3600 * 1000).toISOString()
}

/** Hanya body dengan success === true yang dianggap jawaban sah (trap "200 + pesan galat"). */
function bacaJawabanGateway(body) {
  if (!body || typeof body !== 'object') throw new Error('Jawaban gateway bukan objek JSON')
  if (body.success !== true) {
    const pesan = body.message || body.error || 'gateway menolak permintaan'
    throw new Error(`Gateway: ${pesan}`)
  }
  return body
}

// ---------------------------------------------------------------------------
// Klien HTTP gateway
// ---------------------------------------------------------------------------

function klienGateway({ baseUrl, apiKey, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS }) {
  const base = normalisasiBaseUrl(baseUrl)
  if (typeof fetchImpl !== 'function') throw new Error('fetch tidak tersedia di runtime ini')
  const kunci = String(apiKey ?? '').trim()
  if (!kunci) throw new Error('API key gateway belum diisi')

  async function panggil(path, { method = 'GET', body } = {}) {
    const url = `${base}${path}`
    if (assertSafeOutboundUrl) assertSafeOutboundUrl(url)
    const res = await fetchImpl(url, {
      method,
      headers: { 'X-API-Key': kunci, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const teks = await res.text()
    let parsed = null
    try { parsed = teks ? JSON.parse(teks) : null } catch { throw new Error(`Gateway membalas bukan JSON (HTTP ${res.status})`) }
    return parsed
  }

  return {
    baseUrl: base,
    verifikasi: async () => bacaJawabanGateway(await panggil('/api/auth/verify', { method: 'POST', body: { api_key: kunci } })),
    buatQris: async (amount) => {
      const data = normalisasiNominal(amount)
      const jawab = bacaJawabanGateway(await panggil(`/api/payment/qris?amount=${data}`))
      const isi = jawab.data || {}
      if (!isi.order_id || !isi.qris_code) throw new Error('Gateway tidak mengembalikan order_id/qris_code')
      return { order_id: isi.order_id, qris_code: isi.qris_code, qris_url: isi.qris_url || '', amount: Number(isi.amount) || data }
    },
    statusNominal: async (amount) => {
      const data = normalisasiNominal(amount)
      const jawab = bacaJawabanGateway(await panggil(`/api/payment/status?amount=${data}`))
      return { paid: jawab.paid === true, amount: Number(jawab.amount) || data, recent_count: Number(jawab.recent_count) || 0 }
    },
    daftarWebhook: async (url) => bacaJawabanGateway(await panggil('/api/webhook/register', {
      method: 'POST',
      body: { url, events: [EVENT_TERDAFTAR], api_key: kunci },
    })),
    daftarWebhookList: async () => bacaJawabanGateway(await panggil('/api/webhook/list')),
  }
}

// ---------------------------------------------------------------------------
// Konfigurasi per lembaga
// ---------------------------------------------------------------------------

function pastikanBarisConfig(db, tenantId) {
  const tid = String(tenantId || '').trim()
  if (!tid) throw new Error('tenant_id wajib')
  db.prepare(`INSERT OR IGNORE INTO payment_gateway_config (tenant_id, provider, base_url, webhook_token)
              VALUES (?, ?, ?, ?)`).run(tid, PROVIDER, DEFAULT_BASE_URL, buatTokenWebhook())
  // Baris lama tanpa token webhook dilengkapi di sini juga.
  const baris = db.prepare('SELECT * FROM payment_gateway_config WHERE tenant_id=?').get(tid)
  if (baris && !baris.webhook_token) {
    db.prepare('UPDATE payment_gateway_config SET webhook_token=? WHERE tenant_id=?').run(buatTokenWebhook(), tid)
    return db.prepare('SELECT * FROM payment_gateway_config WHERE tenant_id=?').get(tid)
  }
  return baris
}

/** Bentuk aman untuk klien: API key hanya petunjuk (4+4 karakter), bukan nilai penuh. */
function konfigurasiPublik(db, tenantId, { hostUrl = '' } = {}) {
  const baris = pastikanBarisConfig(db, tenantId)
  const punyaKunci = Boolean(baris.api_key_encrypted)
  return {
    provider: baris.provider,
    base_url: baris.base_url,
    enabled: baris.enabled === 1,
    punya_api_key: punyaKunci,
    api_key_hint: baris.api_key_hint || '',
    webhook_url: punyaKunci ? `${hostUrl.replace(/\/+$/, '')}/api/payment/webhook/fazapay/${baris.webhook_token}` : '',
    webhook_registered_at: baris.webhook_registered_at || null,
    webhook_last_error: baris.webhook_last_error || null,
    last_verified_at: baris.last_verified_at || null,
    last_verify_error: baris.last_verify_error || null,
  }
}

function simpanKonfigurasi(db, tenantId, { base_url, api_key, enabled, actorId }) {
  pastikanBarisConfig(db, tenantId)
  const baseUrl = base_url === undefined ? undefined : normalisasiBaseUrl(base_url)
  const patch = []
  const nilai = []
  if (baseUrl !== undefined) { patch.push('base_url=?'); nilai.push(baseUrl) }
  if (api_key !== undefined && String(api_key).trim() !== '') {
    const bersih = String(api_key).trim()
    patch.push('api_key_encrypted=?', 'api_key_hint=?')
    nilai.push(encryptSecret(bersih), maskKey(bersih))
  }
  if (enabled !== undefined) { patch.push('enabled=?'); nilai.push(enabled ? 1 : 0) }
  patch.push("updated_at=datetime('now')")
  nilai.push(actorId || null)
  patch.push('updated_by=?')
  db.prepare(`UPDATE payment_gateway_config SET ${patch.join(', ')} WHERE tenant_id=?`).run(...nilai, tenantId)
  return konfigurasiPublik(db, tenantId)
}

function kunciTenant(db, tenantId) {
  const baris = db.prepare('SELECT * FROM payment_gateway_config WHERE tenant_id=?').get(tenantId)
  if (!baris?.api_key_encrypted) throw new Error('API key gateway belum diatur')
  const kunci = decryptSecret(baris.api_key_encrypted)
  if (!kunci) throw new Error('API key gateway tidak bisa dibuka (kunci enkripsi berubah?)')
  return kunci
}

function klienUntukTenant(db, tenantId, opsi = {}) {
  const baris = pastikanBarisConfig(db, tenantId)
  return klienGateway({ baseUrl: baris.base_url, apiKey: kunciTenant(db, tenantId), ...opsi })
}

// ---------------------------------------------------------------------------
// Intent
// ---------------------------------------------------------------------------

function intentRingkas(row) {
  if (!row) return null
  return {
    id: row.id,
    ref_type: row.ref_type,
    ref_id: row.ref_id,
    student_id: row.student_id,
    label: row.label,
    nominal: row.nominal,
    kode_unik: row.kode_unik,
    pay_amount: row.pay_amount,
    gateway_order_id: row.gateway_order_id,
    qris_url: row.qris_url,
    qris_code: row.qris_code,
    status: row.status,
    sumber: row.sumber,
    created_at: row.created_at,
    expires_at: row.expires_at,
    paid_at: row.paid_at,
    settled: row.settled === 1,
  }
}

const LABEL_REF = { tagihan: 'Tagihan', topup: 'Top-up saldo', tabungan: 'Setoran tabungan', langganan: 'Langganan' }

/**
 * Pastikan sasaran pembayaran memang ada SEBELUM QR diminta. Kalau tidak, kegagalan baru
 * ketahuan saat uang sudah masuk — dan applier tidak punya apa pun untuk diperbarui.
 */
function validasiTarget(db, { tenantId, refType, refId, studentId }) {
  if (refType === 'tagihan') {
    if (!refId) throw new Error('Tagihan wajib dipilih')
    const tg = db.prepare('SELECT id, siswa_id, status, nominal FROM tagihan WHERE id=? AND tenant_id=?').get(refId, tenantId)
    if (!tg) throw new Error('Tagihan tidak ditemukan')
    if (['lunas', 'sudah_bayar'].includes(String(tg.status))) throw new Error('Tagihan ini sudah lunas')
    return { studentId: tg.siswa_id, nominalDefault: Math.round(Number(tg.nominal) || 0) }
  }
  if (refType === 'topup' || refType === 'tabungan') {
    if (!studentId) throw new Error('Siswa wajib dipilih')
    const s = db.prepare("SELECT id FROM siswa WHERE id=? AND tenant_id=? AND status='aktif'").get(studentId, tenantId)
    if (!s) throw new Error('Siswa tidak ditemukan atau tidak aktif')
    return { studentId, nominalDefault: 0 }
  }
  if (refType === 'langganan') {
    // ref_id = id LEMBAGA yang berlangganan. Intent-nya sendiri milik tenant PLATFORM
    // (pemilik akun merchant), jadi nominal default tidak diambil dari sini — pemanggil
    // (registrasi) yang mengisi nominal sesuai harga paket.
    if (!refId) throw new Error('Lembaga langganan wajib diisi')
    const t = db.prepare('SELECT id FROM tenants WHERE id=?').get(refId)
    if (!t) throw new Error('Lembaga tidak ditemukan')
    return { studentId: '', nominalDefault: 0 }
  }
  throw new Error(`Jenis pembayaran tidak dikenal: ${refType}`)
}

/**
 * Buat intent + minta QRIS dinamis ke gateway.
 * Urutan penting: validasi sasaran & hitung nominal dulu, QR diminta, baru baris disimpan —
 * supaya baris pending selalu punya gateway_order_id (kalau gateway gagal, tidak ada
 * baris pending yang menggantung dan menyandera nominal).
 */
async function buatIntent(db, { tenantId, refType, refId = '', studentId = '', label = '', nominal, createdBy = '', klien = null, meta = null }) {
  if (!REF_TYPES.includes(refType)) throw new Error(`Jenis pembayaran tidak dikenal: ${refType}`)
  const target = validasiTarget(db, { tenantId, refType, refId, studentId })
  // Tagihan: nominal DIAMBIL DARI TAGIHAN, bukan dari kiriman pemanggil. Tanpa ini
  // pemanggil (staf ATAU wali lewat portal) bisa meminta QR senilai 1 rupiah untuk
  // tagihan 500rb, dan applier tetap menandai tagihan itu 'lunas' — bayar sebagian
  // dianggap lunas penuh. Topup/tabungan tetap pakai nominal pilihan pengguna.
  const nilai = normalisasiNominal(refType === 'tagihan' ? target.nominalDefault : (nominal || target.nominalDefault))
  const siswaId = target.studentId || studentId
  const cfg = pastikanBarisConfig(db, tenantId)
  if (cfg.enabled !== 1) throw new Error('Payment gateway belum diaktifkan untuk lembaga ini')
  const client = klien || klienUntukTenant(db, tenantId)

  const kodeUnik = kodeUnikBaru(db, tenantId)
  const bayar = nominalBayar(nilai, kodeUnik)
  const qr = await client.buatQris(bayar)

  const id = crypto.randomUUID()
  const expired = masaBerlaku()
  try {
    db.prepare(`INSERT INTO payment_intents
      (id, tenant_id, provider, ref_type, ref_id, student_id, label, nominal, kode_unik, pay_amount,
       gateway_order_id, qris_code, qris_url, status, created_by, expires_at, meta_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?)`)
      .run(id, tenantId, PROVIDER, refType, String(refId || ''), String(siswaId || ''),
        String(label || LABEL_REF[refType] || ''), nilai, kodeUnik, bayar,
        qr.order_id, qr.qris_code, qr.qris_url, String(createdBy || ''), expired,
        meta ? JSON.stringify(meta) : null)
  } catch (err) {
    // Tabrakan indeks unik (nominal+kode unik sudah dipakai) — coba sekali lagi dengan kode baru.
    if (String(err.message).includes('UNIQUE')) {
      const kode2 = kodeUnikBaru(db, tenantId)
      const bayar2 = nominalBayar(nilai, kode2)
      const qr2 = await client.buatQris(bayar2)
      const id2 = crypto.randomUUID()
      db.prepare(`INSERT INTO payment_intents
        (id, tenant_id, provider, ref_type, ref_id, student_id, label, nominal, kode_unik, pay_amount,
         gateway_order_id, qris_code, qris_url, status, created_by, expires_at, meta_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?)`)
        .run(id2, tenantId, PROVIDER, refType, String(refId || ''), String(siswaId || ''),
          String(label || LABEL_REF[refType] || ''), nilai, kode2, bayar2,
          qr2.order_id, qr2.qris_code, qr2.qris_url, String(createdBy || ''), expired,
          meta ? JSON.stringify(meta) : null)
      return intentRingkas(db.prepare('SELECT * FROM payment_intents WHERE id=?').get(id2))
    }
    throw err
  }
  return intentRingkas(db.prepare('SELECT * FROM payment_intents WHERE id=?').get(id))
}

function intentPending(db, tenantId) {
  return db.prepare(`SELECT * FROM payment_intents
    WHERE tenant_id=? AND status='pending' AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
    ORDER BY created_at ASC`).all(tenantId)
}

function tandaiKedaluwarsa(db, tenantId = null) {
  const sql = `UPDATE payment_intents SET status='expired'
    WHERE status='pending' AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')`
  return tenantId
    ? db.prepare(`${sql} AND tenant_id=?`).run(tenantId).changes
    : db.prepare(sql).run().changes
}

function tandaiBatal(db, tenantId, id) {
  const row = db.prepare('SELECT * FROM payment_intents WHERE id=? AND tenant_id=?').get(id, tenantId)
  if (!row) throw new Error('Intent tidak ditemukan')
  if (row.status === 'paid') throw new Error('Pembayaran sudah lunas, tidak bisa dibatalkan')
  db.prepare("UPDATE payment_intents SET status='canceled' WHERE id=? AND tenant_id=? AND status='pending'").run(id, tenantId)
  return intentRingkas(db.prepare('SELECT * FROM payment_intents WHERE id=?').get(id))
}

// ---------------------------------------------------------------------------
// Applier: apa yang terjadi setelah uang masuk
// ---------------------------------------------------------------------------

function applierTagihan(db, intent) {
  const row = db.prepare('SELECT * FROM tagihan WHERE id=? AND tenant_id=?').get(intent.ref_id, intent.tenant_id)
  if (!row) throw new Error('Tagihan tidak ditemukan untuk intent ini')
  db.prepare(`UPDATE tagihan SET status='lunas', tanggal_bayar=date('now'), metode_bayar='qris',
              keterangan=CASE WHEN keterangan IS NULL OR keterangan='' THEN ? ELSE keterangan END
              WHERE id=? AND tenant_id=?`)
    .run(`QRIS ${intent.gateway_order_id || intent.id}`, intent.ref_id, intent.tenant_id)
  return { efek: 'tagihan_lunas', tagihan_id: intent.ref_id }
}

function applierTopup(db, intent) {
  const { credit } = require('./portal-cashless.cjs')
  credit(db, {
    tenantId: intent.tenant_id,
    studentId: intent.student_id,
    amount: intent.nominal,
    actorId: 'gateway:' + PROVIDER,
    key: 'intent:' + intent.id,
    reference: intent.id,
  })
  return { efek: 'saldo_bertambah', student_id: intent.student_id, nominal: intent.nominal }
}

function applierTabungan(db, intent) {
  const sebelumnya = db.prepare('SELECT saldo_akhir FROM tabungan WHERE tenant_id=? AND siswa_id=? ORDER BY rowid DESC LIMIT 1')
    .get(intent.tenant_id, intent.student_id)
  const saldoBaru = Number(sebelumnya?.saldo_akhir || 0) + intent.nominal
  db.prepare(`INSERT INTO tabungan (id, siswa_id, tanggal, tipe, nominal, saldo_akhir, keterangan, tenant_id)
              VALUES (?,?,date('now'),'setor',?,?,?,?)`)
    .run(crypto.randomUUID(), intent.student_id, intent.nominal, saldoBaru,
      `Setoran QRIS ${intent.gateway_order_id || intent.id}`, intent.tenant_id)
  return { efek: 'tabungan_setor', student_id: intent.student_id, nominal: intent.nominal, saldo_akhir: saldoBaru }
}

/**
 * Langganan platform: pembayaran masuk ke akun merchant platform (tenant_id intent =
 * tenant platform), lalu paket LEMBAGA (intent.ref_id) diaktifkan. Paket + masa aktif
 * dibawa di meta_json karena intent tidak punya kolom khusus langganan.
 */
function applierLangganan(db, intent) {
  const meta = intent.meta_json ? JSON.parse(intent.meta_json) : {}
  const tenantId = intent.ref_id
  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(tenantId)
  if (!tenant) throw new Error('Lembaga tidak ditemukan untuk langganan ini')
  const { PLAN_KEYS, computeExpiry } = require('./subscription.cjs')
  const plan = String(meta.plan || '').toLowerCase()
  if (!PLAN_KEYS.includes(plan)) throw new Error('Paket langganan tidak dikenal')
  const masaNilai = Number(meta.masa_nilai) || 1
  const masaSatuan = meta.masa_satuan === 'hari' ? 'hari' : 'bulan'
  const now = new Date()
  const currentEnd = tenant.subscription_ends_at && new Date(tenant.subscription_ends_at) > now
    ? tenant.subscription_ends_at
    : now.toISOString()
  const endsAt = computeExpiry(currentEnd, masaNilai, masaSatuan)
  db.prepare('UPDATE tenants SET plan=?, subscription_ends_at=?, trial_ends_at=NULL, expired_at=NULL, aktif=1 WHERE id=?')
    .run(plan, endsAt, tenantId)
  return { efek: 'langganan_aktif', tenant_id: tenantId, plan, ends_at: endsAt }
}

function terapkanIntent(db, intent) {
  if (intent.ref_type === 'tagihan') return applierTagihan(db, intent)
  if (intent.ref_type === 'topup') return applierTopup(db, intent)
  if (intent.ref_type === 'tabungan') return applierTabungan(db, intent)
  if (intent.ref_type === 'langganan') return applierLangganan(db, intent)
  throw new Error(`Jenis pembayaran tidak dikenal: ${intent.ref_type}`)
}

/**
 * Tandai lunas + jalankan applier. IDEMPOTEN: perubahan status dan efeknya berada dalam
 * satu transaksi SQLite, dan UPDATE-nya bersyarat `status='pending'` — jadi webhook ganda
 * (gateway mengirim ulang 3x) tidak pernah menambah saldo dua kali.
 */
function tandaiLunas(db, { intentId = null, gatewayOrderId = null, tenantId = null, payAmount = null, sumber = 'webhook', payload = null, waktu = null }) {
  // Urutan pencarian: id -> order_id gateway -> nominal. Fallback nominal penting karena
  // order_id yang dilaporkan gateway bisa berasal dari catatan GoPay sendiri (bukan
  // order_id yang kita simpan), sementara nominal + kode unik sudah dijamin unik.
  let cari = intentId
    ? db.prepare('SELECT * FROM payment_intents WHERE id=?').get(intentId)
    : null
  if (!cari && gatewayOrderId && tenantId) {
    cari = db.prepare('SELECT * FROM payment_intents WHERE gateway_order_id=? AND tenant_id=?').get(gatewayOrderId, tenantId)
  }
  if (!cari && payAmount && tenantId) {
    cari = db.prepare(`SELECT * FROM payment_intents WHERE tenant_id=? AND pay_amount=?
      ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`).get(tenantId, payAmount)
  }

  if (!cari) throw new Error('Intent tidak ditemukan')
  // Tolak KURANG BAYAR. Jalur pencarian lewat order_id tidak memeriksa jumlah, jadi
  // tanpa ini webhook yang melaporkan order_id benar dengan nominal kecil tetap
  // menandai intent lunas.
  if (payAmount != null && Number(payAmount) > 0 && Number(payAmount) < cari.pay_amount) {
    throw new Error(`Nominal pembayaran kurang dari yang diminta (${payAmount} < ${cari.pay_amount})`)
  }
  if (cari.status === 'paid') return { intent: intentRingkas(cari), efek: null, duplikat: true }

  // IMMEDIATE (bukan DEFERRED): transaksi mengambil kunci tulis sejak awal, sehingga
  // baca-lalu-tulis saldo tabungan tidak bisa membaca nilai basi saat ada proses lain.
  const hasil = db.transaction(() => {
    const berubah = db.prepare(`UPDATE payment_intents
        SET status='paid', paid_at=?, sumber=?, raw_webhook_json=?
        WHERE id=? AND status='pending'`)
      .run(waktu || new Date().toISOString(), String(sumber || ''), payload ? JSON.stringify(payload) : null, cari.id)
    if (berubah.changes !== 1) return { efek: null, duplikat: true }
    return { efek: terapkanIntent(db, cari), duplikat: false }
  }).immediate()

  const terbaru = intentRingkas(db.prepare('SELECT * FROM payment_intents WHERE id=?').get(cari.id))
  return { intent: terbaru, ...hasil }
}

// ---------------------------------------------------------------------------
// Webhook masuk (gateway -> jurnalku)
// ---------------------------------------------------------------------------

function tenantDariTokenWebhook(db, token) {
  const bersih = String(token ?? '').trim()
  if (!bersih || bersih.length < 20) return null
  return db.prepare('SELECT * FROM payment_gateway_config WHERE webhook_token=?').get(bersih) || null
}

function ambilTransaksiWebhook(body) {
  const tx = body?.transaction || body?.data?.transaction || body?.data || null
  return tx && typeof tx === 'object' ? tx : null
}

/**
 * Proses webhook gateway. Verifikasi HMAC atas BYTE MENTAH (bukan JSON hasil
 * serialisasi ulang — serialisasi mengubah byte dan tanda tangan gagal).
 */
function prosesWebhook(db, { token, rawBody, signature, payload = null }) {
  const cfg = tenantDariTokenWebhook(db, token)
  if (!cfg) throw new Error('token webhook tidak dikenal')
  if (!cfg.api_key_encrypted) throw new Error('API key gateway belum diatur')
  const secret = decryptSecret(cfg.api_key_encrypted)
  if (!secret) throw new Error('API key gateway tidak bisa dibuka')

  const mentah = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ''), 'utf8')
  if (!verifikasiTandaTangan(mentah, signature, secret)) throw new Error('signature tidak valid')

  let body = payload
  if (!body) {
    try { body = JSON.parse(mentah.toString('utf8')) } catch { throw new Error('body webhook bukan JSON') }
  }
  const event = body?.event || ''
  if (event && event !== EVENT_TERDAFTAR) return { tenant_id: cfg.tenant_id, diabaikan: true, event }

  const tx = ambilTransaksiWebhook(body)
  if (!tx) throw new Error('payload webhook tidak memuat transaction')

  const orderId = tx.order_id ? String(tx.order_id) : null
  const jumlah = Number(tx.amount) || 0
  const status = String(tx.status || '').toLowerCase()
  if (status && !['paid', 'settlement', 'success'].includes(status)) {
    return { tenant_id: cfg.tenant_id, diabaikan: true, status }
  }

  try {
    const hasil = tandaiLunas(db, {
      tenantId: cfg.tenant_id,
      gatewayOrderId: orderId,
      payAmount: jumlah || null,
      sumber: 'webhook',
      payload: body,
      waktu: body?.timestamp ? new Date(Number(body.timestamp) || body.timestamp).toISOString() : null,
    })
    return { tenant_id: cfg.tenant_id, ...hasil }
  } catch (err) {
    if (String(err.message).includes('Intent tidak ditemukan')) {
      // Pembayaran masuk untuk nominal yang bukan milik kita (mis. transaksi lain di
      // akun merchant yang sama). Catat sebagai peringatan, jangan gagalkan webhook.
      // IDEMPOTEN lewat gateway_order_id (indeks unik tenant_id+gateway_order_id):
      // webhook yang dikirim ulang tidak menggandakan baris.
      db.prepare(`INSERT OR IGNORE INTO payment_intents
        (id, tenant_id, provider, ref_type, ref_id, label, nominal, kode_unik, pay_amount, gateway_order_id, status, sumber, raw_webhook_json, paid_at)
        VALUES (?,?,?,?,'',?,?,?,?,?,'paid','webhook-asing',?,datetime('now'))`)
        .run(crypto.randomUUID(), cfg.tenant_id, PROVIDER, 'topup', 'Pembayaran tanpa intent (asing)',
          Math.max(1, jumlah), '000', Math.max(1, jumlah), orderId, JSON.stringify(body))
      return { tenant_id: cfg.tenant_id, diabaikan: true, alasan: 'intent tidak ditemukan — dicatat sebagai transaksi asing' }
    }
    if (String(err.message).includes('kurang dari yang diminta')) {
      // Kurang bayar: JANGAN lunasi. Biarkan intent tetap pending supaya bisa diperiksa.
      return { tenant_id: cfg.tenant_id, diabaikan: true, alasan: 'nominal kurang dari yang diminta — tidak dilunasi' }
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Poller cadangan + rekonsiliasi
// ---------------------------------------------------------------------------

/** Cek intent pending satu lembaga ke gateway. Dipakai poller dan tombol "Cek status". */
async function cekPending(db, tenantId, { klien = null } = {}) {
  const client = klien || klienUntukTenant(db, tenantId)
  const daftar = intentPending(db, tenantId)
  const hasil = { dicek: daftar.length, lunas: 0, gagal: 0 }
  for (const intent of daftar) {
    try {
      const status = await client.statusNominal(intent.pay_amount)
      if (status.paid) {
        const r = tandaiLunas(db, { intentId: intent.id, sumber: 'poller', waktu: new Date().toISOString() })
        if (!r.duplikat) hasil.lunas++
      }
    } catch {
      hasil.gagal++
    }
  }
  return hasil
}

/** Rekap per lembaga (untuk operator yang merekonsiliasi dana di akun merchant platform). */
function rekapRekonsiliasi(db, tenantId, { dari = null, sampai = null } = {}) {
  const params = [tenantId]
  let rentang = ''
  if (dari) { rentang += ' AND date(created_at) >= date(?)'; params.push(dari) }
  if (sampai) { rentang += ' AND date(created_at) <= date(?)'; params.push(sampai) }
  const baris = db.prepare(`SELECT ref_type, status, settled,
      COUNT(*) jumlah, COALESCE(SUM(nominal),0) total
    FROM payment_intents WHERE tenant_id=? ${rentang}
    GROUP BY ref_type, status, settled`).all(...params)
  const lunas = baris.filter(b => b.status === 'paid')
  const belumDiselesaikan = lunas.filter(b => b.settled === 0)
  return {
    per_jenis: baris.map(b => ({ ...b, settled: b.settled === 1 })),
    total_lunas: lunas.reduce((n, b) => n + b.total, 0),
    jumlah_lunas: lunas.reduce((n, b) => n + b.jumlah, 0),
    total_belum_diselesaikan: belumDiselesaikan.reduce((n, b) => n + b.total, 0),
    jumlah_belum_diselesaikan: belumDiselesaikan.reduce((n, b) => n + b.jumlah, 0),
  }
}

function daftarIntent(db, tenantId, { status = null, refType = null, limit = 100 } = {}) {
  let sql = 'SELECT * FROM payment_intents WHERE tenant_id=?'
  const params = [tenantId]
  if (status) { sql += ' AND status=?'; params.push(status) }
  if (refType) { sql += ' AND ref_type=?'; params.push(refType) }
  sql += ' ORDER BY created_at DESC LIMIT ?'
  params.push(Math.min(500, Math.max(1, Number(limit) || 100)))
  return db.prepare(sql).all(...params).map(intentRingkas)
}

function tandaiSelesaiDisetor(db, tenantId, { id = null, semua = false, actorId = '' } = {}) {
  if (semua) {
    const info = db.prepare(`UPDATE payment_intents SET settled=1, settled_at=datetime('now')
      WHERE tenant_id=? AND status='paid' AND settled=0`).run(tenantId)
    return { diselesaikan: info.changes, oleh: actorId }
  }
  const info = db.prepare(`UPDATE payment_intents SET settled=1, settled_at=datetime('now')
    WHERE id=? AND tenant_id=? AND status='paid' AND settled=0`).run(id, tenantId)
  return { diselesaikan: info.changes, oleh: actorId }
}

module.exports = {
  PROVIDER,
  DEFAULT_BASE_URL,
  EVENT_TERDAFTAR,
  REF_TYPES,
  STATUS_INTENT,
  setupPaymentGatewayTables,
  normalisasiBaseUrl,
  normalisasiNominal,
  nominalBayar,
  kodeUnikBaru,
  buatTokenWebhook,
  tandaTangan,
  verifikasiTandaTangan,
  bacaJawabanGateway,
  klienGateway,
  pastikanBarisConfig,
  konfigurasiPublik,
  simpanKonfigurasi,
  kunciTenant,
  klienUntukTenant,
  buatIntent,
  validasiTarget,
  intentPending,
  intentRingkas,
  tandaiKedaluwarsa,
  tandaiBatal,
  terapkanIntent,
  tandaiLunas,
  tenantDariTokenWebhook,
  prosesWebhook,
  cekPending,
  rekapRekonsiliasi,
  daftarIntent,
  tandaiSelesaiDisetor,
  masaBerlaku,
  LABEL_REF,
}