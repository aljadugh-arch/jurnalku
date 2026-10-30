// Payment Gateway QRIS (fazapay) — uji inti tanpa jaringan.
//
// Semua fungsi yang diuji di sini adalah fungsi yang benar-benar dipanggil server:
// normalisasi input, HMAC, pencocokan intent, applier per jenis pembayaran, dan poller.
// Klien gateway disuntik (fake), jadi tes ini tidak pernah menyentuh pg.fazapay.ccwu.cc.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'kunci-uji-jurnalku-payment-gateway'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const Database = require('better-sqlite3')

const {
  setupPaymentGatewayTables,
  normalisasiBaseUrl,
  normalisasiNominal,
  nominalBayar,
  kodeUnikBaru,
  tandaTangan,
  verifikasiTandaTangan,
  bacaJawabanGateway,
  klienGateway,
  pastikanBarisConfig,
  konfigurasiPublik,
  simpanKonfigurasi,
  buatIntent,
  intentRingkas,
  tandaiLunas,
  prosesWebhook,
  tandaiBatal,
  tandaiKedaluwarsa,
  rekapRekonsiliasi,
  daftarIntent,
  tandaiSelesaiDisetor,
} = require('../server/payment-gateway.cjs')

const { pollSekali } = require('../server/payment-poller.cjs')

const TENANT = 'tenant-uji'
const SISWA = 'siswa-1'
const KUNCI = 'gpm_live_uji_1234567890'

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function dbUji() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT, nama TEXT, aktif INTEGER DEFAULT 1);
    CREATE TABLE siswa (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, nis TEXT, nama TEXT, status TEXT DEFAULT 'aktif');
    CREATE TABLE jenis_tagihan (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, nama TEXT, nominal REAL);
    CREATE TABLE tagihan (
      id TEXT PRIMARY KEY, siswa_id TEXT NOT NULL, jenis_tagihan_id TEXT,
      bulan TEXT, tahun TEXT, nominal REAL NOT NULL, status TEXT DEFAULT 'belum_bayar',
      tanggal_bayar TEXT, metode_bayar TEXT, keterangan TEXT,
      created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT NOT NULL
    );
    CREATE TABLE tabungan (
      id TEXT PRIMARY KEY, siswa_id TEXT NOT NULL, tanggal TEXT NOT NULL, tipe TEXT NOT NULL,
      nominal REAL NOT NULL, saldo_akhir REAL NOT NULL, keterangan TEXT,
      created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT NOT NULL
    );
    CREATE TABLE cashless_ledger (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, student_id TEXT NOT NULL,
      amount INTEGER NOT NULL, kind TEXT NOT NULL, idempotency_key TEXT NOT NULL,
      actor_id TEXT, reference TEXT, created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, idempotency_key)
    );
  `)
  db.prepare('INSERT INTO tenants (id, slug, nama) VALUES (?,?,?)').run(TENANT, 'uji', 'Lembaga Uji')
  db.prepare('INSERT INTO siswa (id, tenant_id, nis, nama) VALUES (?,?,?,?)').run(SISWA, TENANT, '1001', 'Ahmad Uji')
  db.prepare('INSERT INTO jenis_tagihan (id, tenant_id, nama, nominal) VALUES (?,?,?,?)').run('jt-1', TENANT, 'SPP', 150000)
  setupPaymentGatewayTables(db)
  return db
}

/** Klien gateway palsu — merekam permintaan, membalas seperti gateway nyata. */
function klienPalsu({ gagal = false, nomorAwal = 0 } = {}) {
  const jejak = { qris: [], status: [], webhook: [] }
  let urut = nomorAwal
  const kartu = new Set()
  return {
    jejak,
    baseUrl: 'https://pg.fazapay.ccwu.cc',
    async verifikasi() { return { success: true, email: 'admin@fazapay.web.id', is_admin: true } },
    async buatQris(amount) {
      jejak.qris.push(amount)
      if (gagal) return Promise.reject(new Error('Gateway: Invalid/Expired token'))
      const order = `GP-uji-${++urut}`
      kartu.add(order)
      return { order_id: order, qris_code: `00020101${amount}`, qris_url: `https://qr.test/${order}`, amount }
    },
    async statusNominal(amount) {
      jejak.status.push(amount)
      return { paid: jejak.dibayar?.has(amount) === true, amount, recent_count: 0 }
    },
    async daftarWebhook(url) { jejak.webhook.push(url); return { success: true } },
  }
}

function aktifkanGateway(db, { aktif = true } = {}) {
  simpanKonfigurasi(db, TENANT, { base_url: 'https://pg.fazapay.ccwu.cc', api_key: KUNCI, enabled: aktif, actorId: 'uji' })
  db.prepare('UPDATE payment_gateway_config SET enabled=? WHERE tenant_id=?').run(aktif ? 1 : 0, TENANT)
  return pastikanBarisConfig(db, TENANT)
}

function isiTagihan(db, { id = 'tg-1', nominal = 150000 } = {}) {
  db.prepare(`INSERT INTO tagihan (id, siswa_id, jenis_tagihan_id, bulan, tahun, nominal, status, tenant_id)
              VALUES (?,?,?,?,?,?,?,?)`).run(id, SISWA, 'jt-1', 'Oktober', '2026', nominal, 'belum_bayar', TENANT)
  return id
}

// ---------------------------------------------------------------------------
// Normalisasi input
// ---------------------------------------------------------------------------

test('normalisasiBaseUrl: buang trailing slash, wajib http(s), tolak kredensial/query', () => {
  assert.equal(normalisasiBaseUrl('https://pg.fazapay.ccwu.cc/'), 'https://pg.fazapay.ccwu.cc')
  assert.equal(normalisasiBaseUrl('https://pg.fazapay.ccwu.cc///'), 'https://pg.fazapay.ccwu.cc')
  assert.equal(normalisasiBaseUrl('http://127.0.0.1:9090'), 'http://127.0.0.1:9090')
  assert.throws(() => normalisasiBaseUrl('ftp://x.test'), /http atau https/)
  assert.throws(() => normalisasiBaseUrl('https://user:pass@x.test'), /kredensial/)
  assert.throws(() => normalisasiBaseUrl('https://x.test/?a=1'), /query/)
  assert.throws(() => normalisasiBaseUrl(''), /wajib diisi/)
})

test('normalisasiNominal: membulatkan REAL tagihan dan menolak nilai tak wajar', () => {
  assert.equal(normalisasiNominal(150000.0), 150000)
  assert.equal(normalisasiNominal('150000.4'), 150000)
  assert.equal(normalisasiNominal(150000.6), 150001)
  assert.throws(() => normalisasiNominal(0), /positif/)
  assert.throws(() => normalisasiNominal(-5), /positif/)
  assert.throws(() => normalisasiNominal('abc'), /positif/)
  assert.throws(() => normalisasiNominal(999_999_999), /batas wajar/)
  assert.equal(nominalBayar(150000, '123'), 150123)
})

// ---------------------------------------------------------------------------
// HMAC & jebakan "HTTP 200 + pesan galat"
// ---------------------------------------------------------------------------

test('tanda tangan HMAC cocok dengan yang dihitung gateway, dan menolak byte yang diubah', () => {
  const body = Buffer.from(JSON.stringify({ event: 'transaction.received', transaction: { amount: 50000 } }))
  const sig = tandaTangan(body, KUNCI)
  assert.equal(sig, crypto.createHmac('sha256', KUNCI).update(body).digest('hex'))
  assert.equal(verifikasiTandaTangan(body, sig, KUNCI), true)
  assert.equal(verifikasiTandaTangan(body, sig.toUpperCase(), KUNCI), true, 'hex huruf besar tetap diterima')
  assert.equal(verifikasiTandaTangan(Buffer.from(body.toString() + ' '), sig, KUNCI), false, 'byte berubah = gugur')
  assert.equal(verifikasiTandaTangan(body, tandaTangan(body, 'kunci-lain'), KUNCI), false)
  assert.equal(verifikasiTandaTangan(body, '', KUNCI), false)
  assert.equal(verifikasiTandaTangan(body, 'pendek', KUNCI), false, 'panjang beda tidak boleh melempar')
})

test('bacaJawabanGateway menolak balasan "200 + pesan galat" (jebakan endpoint mati)', () => {
  assert.throws(() => bacaJawabanGateway({ message: 'Invalid/Expired token' }), /Invalid\/Expired token/)
  assert.throws(() => bacaJawabanGateway(null), /bukan objek JSON/)
  const ok = bacaJawabanGateway({ success: true, data: { order_id: 'GP-1' } })
  assert.equal(ok.data.order_id, 'GP-1')
})

test('klienGateway menilai body, bukan kode HTTP — endpoint mati tidak lolos', async () => {
  const fetch = async () => ({ status: 200, text: async () => '{"message":"Invalid/Expired token"}' })
  const klien = klienGateway({ baseUrl: 'https://pg.fazapay.ccwu.cc', apiKey: KUNCI, fetchImpl: fetch })
  await assert.rejects(() => klien.buatQris(1000), /Invalid\/Expired token/)
})

// ---------------------------------------------------------------------------
// Kode unik & anti-tabrakan nominal
// ---------------------------------------------------------------------------

test('kodeUnikBaru menghasilkan 3 digit dan menghindari kode yang masih pending', () => {
  const db = dbUji(); aktifkanGateway(db)
  const kode = kodeUnikBaru(db, TENANT)
  assert.match(kode, /^\d{3}$/)
  assert.ok(Number(kode) >= 101 && Number(kode) <= 999)
})

test('indeks unik parsial: dua intent pending tidak boleh punya nominal bayar sama', () => {
  const db = dbUji(); aktifkanGateway(db)
  const sisip = (id, bayar) => db.prepare(`INSERT INTO payment_intents
    (id, tenant_id, ref_type, nominal, kode_unik, pay_amount, status)
    VALUES (?,?,?,?,?,?,'pending')`).run(id, TENANT, 'topup', bayar - 101, '101', bayar)
  sisip('a', 50123)
  assert.throws(() => sisip('b', 50123), /UNIQUE/)
  // Setelah yang pertama lunas, nominal itu bebas dipakai lagi.
  db.prepare("UPDATE payment_intents SET status='paid' WHERE id='a'").run()
  sisip('b', 50123)
  assert.equal(db.prepare("SELECT COUNT(*) c FROM payment_intents WHERE status='pending'").get().c, 1)
})

// ---------------------------------------------------------------------------
// Intent
// ---------------------------------------------------------------------------

test('buatIntent menyimpan order_id yang DIKEMBALIKAN gateway dan nominal + kode unik', async () => {
  const db = dbUji(); aktifkanGateway(db); isiTagihan(db)
  const klien = klienPalsu()
  const intent = await buatIntent(db, { tenantId: TENANT, refType: 'tagihan', refId: 'tg-1', studentId: SISWA, nominal: 150000, klien })
  assert.equal(intent.status, 'pending')
  assert.equal(intent.nominal, 150000)
  assert.equal(intent.pay_amount, 150000 + Number(intent.kode_unik))
  assert.match(intent.gateway_order_id, /^GP-uji-/)
  assert.ok(intent.qris_url.startsWith('https://qr.test/'))
  assert.deepEqual(klien.jejak.qris, [intent.pay_amount])
  // Disimpan, bukan sekadar dikembalikan.
  const dari = db.prepare('SELECT * FROM payment_intents WHERE id=?').get(intent.id)
  assert.equal(dari.gateway_order_id, intent.gateway_order_id)
})

test('buatIntent gagal bersih kalau gateway menolak — tidak menyisakan intent pending', async () => {
  const db = dbUji(); aktifkanGateway(db); isiTagihan(db)
  await assert.rejects(
    () => buatIntent(db, { tenantId: TENANT, refType: 'tagihan', refId: 'tg-1', studentId: SISWA, nominal: 150000, klien: klienPalsu({ gagal: true }) }),
    /Invalid\/Expired token/,
  )
  assert.equal(db.prepare('SELECT COUNT(*) c FROM payment_intents').get().c, 0)
})

test('buatIntent menolak sasaran yang tidak ada / sudah lunas SEBELUM meminta QR (uang tidak boleh nyangkut)', async () => {
  const db = dbUji(); aktifkanGateway(db)
  const klien = klienPalsu()
  await assert.rejects(
    () => buatIntent(db, { tenantId: TENANT, refType: 'tagihan', refId: 'tidak-ada', studentId: SISWA, nominal: 10000, klien }),
    /Tagihan tidak ditemukan/,
  )
  await assert.rejects(
    () => buatIntent(db, { tenantId: TENANT, refType: 'topup', studentId: 'siswa-hantu', nominal: 10000, klien }),
    /Siswa tidak ditemukan/,
  )
  isiTagihan(db, { id: 'tg-lunas' })
  db.prepare("UPDATE tagihan SET status='lunas' WHERE id='tg-lunas'").run()
  await assert.rejects(
    () => buatIntent(db, { tenantId: TENANT, refType: 'tagihan', refId: 'tg-lunas', studentId: SISWA, nominal: 10000, klien }),
    /sudah lunas/,
  )
  assert.equal(klien.jejak.qris.length, 0, 'QR tidak pernah diminta untuk sasaran yang tidak sah')
  assert.equal(db.prepare('SELECT COUNT(*) c FROM payment_intents').get().c, 0)
})

test('buatIntent tagihan memakai nominal tagihan bila nominal tidak dikirim', async () => {
  const db = dbUji(); aktifkanGateway(db); isiTagihan(db, { id: 'tg-9', nominal: 175000 })
  const intent = await buatIntent(db, { tenantId: TENANT, refType: 'tagihan', refId: 'tg-9', klien: klienPalsu() })
  assert.equal(intent.nominal, 175000)
  assert.equal(intent.student_id, SISWA, 'siswa diambil dari tagihannya')
})

test('buatIntent menolak saat gateway belum diaktifkan lembaga', async () => {
  const db = dbUji(); aktifkanGateway(db, { aktif: false })
  await assert.rejects(
    () => buatIntent(db, { tenantId: TENANT, refType: 'topup', studentId: SISWA, nominal: 10000, klien: klienPalsu() }),
    /belum diaktifkan/,
  )
})

// ---------------------------------------------------------------------------
// Applier per jenis pembayaran + idempotensi
// ---------------------------------------------------------------------------

test('tandaiLunas (tagihan) melunasi tagihan dan TIDAK mengulang efeknya', async () => {
  const db = dbUji(); aktifkanGateway(db); isiTagihan(db)
  const intent = await buatIntent(db, { tenantId: TENANT, refType: 'tagihan', refId: 'tg-1', studentId: SISWA, nominal: 150000, klien: klienPalsu() })

  const pertama = tandaiLunas(db, { intentId: intent.id, sumber: 'webhook' })
  assert.equal(pertama.duplikat, false)
  assert.equal(pertama.efek.efek, 'tagihan_lunas')
  const tg = db.prepare('SELECT * FROM tagihan WHERE id=?').get('tg-1')
  assert.equal(tg.status, 'lunas')
  assert.equal(tg.metode_bayar, 'qris')
  assert.match(tg.keterangan, /GP-uji-/)

  const kedua = tandaiLunas(db, { intentId: intent.id, sumber: 'webhook' })
  assert.equal(kedua.duplikat, true)
  assert.equal(kedua.efek, null)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM tagihan WHERE status=?').get('lunas').c, 1)
})

test('tandaiLunas (topup) menambah saldo cashless tepat sekali walau webhook dikirim ulang', async () => {
  const db = dbUji(); aktifkanGateway(db)
  const intent = await buatIntent(db, { tenantId: TENANT, refType: 'topup', studentId: SISWA, nominal: 50000, klien: klienPalsu() })
  tandaiLunas(db, { intentId: intent.id, sumber: 'webhook' })
  tandaiLunas(db, { intentId: intent.id, sumber: 'webhook' })
  tandaiLunas(db, { intentId: intent.id, sumber: 'poller' })
  const saldo = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM cashless_ledger WHERE tenant_id=? AND student_id=?').get(TENANT, SISWA).s
  assert.equal(saldo, 50000)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM cashless_ledger').get().c, 1)
})

test('tandaiLunas (tabungan) mencatat setoran dengan saldo berjalan', async () => {
  const db = dbUji(); aktifkanGateway(db)
  db.prepare('INSERT INTO tabungan (id, siswa_id, tanggal, tipe, nominal, saldo_akhir, tenant_id) VALUES (?,?,?,?,?,?,?)')
    .run('t-1', SISWA, '2026-10-01', 'setor', 20000, 20000, TENANT)
  const intent = await buatIntent(db, { tenantId: TENANT, refType: 'tabungan', studentId: SISWA, nominal: 30000, klien: klienPalsu() })
  tandaiLunas(db, { intentId: intent.id, sumber: 'webhook' })
  const baris = db.prepare('SELECT * FROM tabungan WHERE tenant_id=? ORDER BY rowid DESC LIMIT 1').get(TENANT)
  assert.equal(baris.tipe, 'setor')
  assert.equal(baris.nominal, 30000)
  assert.equal(baris.saldo_akhir, 50000)
})

test('applier tagihan menolak intent yang menunjuk tagihan tidak ada, dan tidak setengah jalan', () => {
  const db = dbUji(); aktifkanGateway(db)
  // Baris rusak disisipkan langsung (mis. sisa data lama sebelum validasi dibuat).
  db.prepare(`INSERT INTO payment_intents (id, tenant_id, ref_type, ref_id, student_id, nominal, kode_unik, pay_amount, status)
              VALUES ('rusak', ?, 'tagihan', 'tidak-ada', ?, 10000, '101', 10101, 'pending')`).run(TENANT, SISWA)
  assert.throws(() => tandaiLunas(db, { intentId: 'rusak' }), /Tagihan tidak ditemukan/)
  // Transaksi digulung: status tetap pending, bukan paid dengan efek yang gagal.
  assert.equal(db.prepare("SELECT status FROM payment_intents WHERE id='rusak'").get().status, 'pending')
})

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

function kirimWebhook(db, { token, body, kunci = KUNCI, signature = null }) {
  const mentah = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  return prosesWebhook(db, { token, rawBody: mentah, signature: signature || tandaTangan(mentah, kunci) })
}

test('prosesWebhook: tanda tangan sah -> lunas; tanda tangan salah -> ditolak', async () => {
  const db = dbUji(); const cfg = aktifkanGateway(db); isiTagihan(db)
  const intent = await buatIntent(db, { tenantId: TENANT, refType: 'tagihan', refId: 'tg-1', studentId: SISWA, nominal: 150000, klien: klienPalsu() })

  const bodyAsli = { event: 'transaction.received', timestamp: Date.now(), transaction: { id: 'tx-1', order_id: intent.gateway_order_id, amount: intent.pay_amount, provider: 'gopay', status: 'paid' } }
  // Tanda tangan atas byte yang sudah diubah harus gugur.
  const mentah = Buffer.from(JSON.stringify(bodyAsli))
  assert.throws(() => prosesWebhook(db, { token: cfg.webhook_token, rawBody: Buffer.from(JSON.stringify({ ...bodyAsli, transaction: { ...bodyAsli.transaction, amount: 1 } })), signature: tandaTangan(mentah, KUNCI) }), /signature tidak valid/)
  assert.equal(db.prepare("SELECT status FROM payment_intents WHERE id=?").get(intent.id).status, 'pending', 'webhook gugur tidak boleh mengubah status')

  const hasil = kirimWebhook(db, { token: cfg.webhook_token, body: bodyAsli })
  assert.equal(hasil.duplikat, false)
  assert.equal(db.prepare('SELECT status FROM tagihan WHERE id=?').get('tg-1').status, 'lunas')
})

test('prosesWebhook: token tak dikenal ditolak, dan webhook kembar jadi duplikat', async () => {
  const db = dbUji(); const cfg = aktifkanGateway(db)
  const intent = await buatIntent(db, { tenantId: TENANT, refType: 'topup', studentId: SISWA, nominal: 25000, klien: klienPalsu() })
  const body = { event: 'transaction.received', transaction: { order_id: intent.gateway_order_id, amount: intent.pay_amount, status: 'paid' } }
  assert.throws(() => kirimWebhook(db, { token: 'token-palsu-panjang-sekali-xx', body }), /token webhook tidak dikenal/)
  const pertama = kirimWebhook(db, { token: cfg.webhook_token, body })
  const kedua = kirimWebhook(db, { token: cfg.webhook_token, body })
  assert.equal(pertama.duplikat, false)
  assert.equal(kedua.duplikat, true)
  assert.equal(db.prepare('SELECT COALESCE(SUM(amount),0) s FROM cashless_ledger').get().s, 25000)
})

test('prosesWebhook: cocokkan lewat NOMINAL bila order_id tidak dikenal (anti-kehilangan pembayaran)', async () => {
  const db = dbUji(); const cfg = aktifkanGateway(db)
  const intent = await buatIntent(db, { tenantId: TENANT, refType: 'topup', studentId: SISWA, nominal: 30000, klien: klienPalsu() })
  const hasil = kirimWebhook(db, { token: cfg.webhook_token, body: {
    event: 'transaction.received',
    transaction: { order_id: 'GP-order-tidak-dikenal', amount: intent.pay_amount, status: 'paid' },
  } })
  assert.equal(hasil.duplikat, false)
  assert.equal(db.prepare("SELECT status FROM payment_intents WHERE id=?").get(intent.id).status, 'paid')
})

test('prosesWebhook: nominal asing dicatat, tidak menggagalkan webhook (gateway tidak akan mengulang 4xx)', async () => {
  const db = dbUji(); const cfg = aktifkanGateway(db)
  const hasil = kirimWebhook(db, { token: cfg.webhook_token, body: {
    event: 'transaction.received',
    transaction: { order_id: 'GP-asing', amount: 777, status: 'paid' },
  } })
  assert.equal(hasil.diabaikan, true)
  const asing = db.prepare("SELECT * FROM payment_intents WHERE sumber='webhook-asing'").get()
  assert.ok(asing, 'pembayaran asing tetap tercatat')
  assert.equal(asing.nominal, 777)
})

test('prosesWebhook: event/status di luar kontrak diabaikan tanpa error', async () => {
  const db = dbUji(); const cfg = aktifkanGateway(db)
  const a = kirimWebhook(db, { token: cfg.webhook_token, body: { event: 'lain.event', transaction: { order_id: 'x', amount: 1, status: 'paid' } } })
  assert.equal(a.diabaikan, true)
  const b = kirimWebhook(db, { token: cfg.webhook_token, body: { event: 'transaction.received', transaction: { order_id: 'x', amount: 1, status: 'pending' } } })
  assert.equal(b.diabaikan, true)
})

// ---------------------------------------------------------------------------
// Poller, kedaluwarsa, rekonsiliasi
// ---------------------------------------------------------------------------

test('poller menandai lunas intent pending yang sudah dibayar (jalur cadangan)', async () => {
  const db = dbUji(); aktifkanGateway(db)
  const a = await buatIntent(db, { tenantId: TENANT, refType: 'topup', studentId: SISWA, nominal: 10000, klien: klienPalsu() })
  const b = await buatIntent(db, { tenantId: TENANT, refType: 'topup', studentId: SISWA, nominal: 20000, klien: klienPalsu() })

  const klien = klienPalsu()
  klien.jejak.dibayar = new Set([a.pay_amount])
  const ringkas = await pollSekali(db, { klienPabrik: () => klien })
  assert.equal(ringkas.dicek, 2)
  assert.equal(ringkas.lunas, 1)
  assert.equal(db.prepare('SELECT status FROM payment_intents WHERE id=?').get(a.id).status, 'paid')
  assert.equal(db.prepare('SELECT status FROM payment_intents WHERE id=?').get(b.id).status, 'pending')
  // Putaran kedua tidak menambah apa pun.
  const lagi = await pollSekali(db, { klienPabrik: () => klien })
  assert.equal(lagi.lunas, 0)
})

test('poller tidak menyentuh lembaga yang gateway-nya belum aktif', async () => {
  const db = dbUji(); aktifkanGateway(db, { aktif: false })
  db.prepare(`INSERT INTO payment_intents (id, tenant_id, ref_type, nominal, kode_unik, pay_amount, status)
              VALUES ('p1', ?, 'topup', 10000, '101', 10101, 'pending')`).run(TENANT)
  let dipanggil = false
  const ringkas = await pollSekali(db, { klienPabrik: () => { dipanggil = true; return klienPalsu() } })
  assert.equal(dipanggil, false)
  assert.equal(ringkas.dicek, 0)
})

test('intent kedaluwarsa tidak lagi menggantung status pending', async () => {
  const db = dbUji(); aktifkanGateway(db)
  db.prepare(`INSERT INTO payment_intents (id, tenant_id, ref_type, nominal, kode_unik, pay_amount, status, expires_at)
              VALUES ('p1', ?, 'topup', 10000, '101', 10101, 'pending', datetime('now','-1 hour'))`).run(TENANT)
  assert.equal(tandaiKedaluwarsa(db, TENANT), 1)
  assert.equal(db.prepare("SELECT status FROM payment_intents WHERE id='p1'").get().status, 'expired')
})

test('batal: intent pending bisa dibatalkan, yang sudah lunas tidak', async () => {
  const db = dbUji(); aktifkanGateway(db)
  const intent = await buatIntent(db, { tenantId: TENANT, refType: 'topup', studentId: SISWA, nominal: 15000, klien: klienPalsu() })
  assert.equal(tandaiBatal(db, TENANT, intent.id).status, 'canceled')
  const lain = await buatIntent(db, { tenantId: TENANT, refType: 'topup', studentId: SISWA, nominal: 16000, klien: klienPalsu() })
  tandaiLunas(db, { intentId: lain.id })
  assert.throws(() => tandaiBatal(db, TENANT, lain.id), /sudah lunas/)
})

test('rekap rekonsiliasi menghitung total lunas & yang belum disetor', async () => {
  const db = dbUji(); aktifkanGateway(db); isiTagihan(db, { id: 'tg-rekap', nominal: 25000 })
  const a = await buatIntent(db, { tenantId: TENANT, refType: 'topup', studentId: SISWA, nominal: 10000, klien: klienPalsu() })
  const b = await buatIntent(db, { tenantId: TENANT, refType: 'tagihan', refId: 'tg-rekap', studentId: SISWA, nominal: 25000, klien: klienPalsu() })
  tandaiLunas(db, { intentId: a.id })
  tandaiLunas(db, { intentId: b.id })
  const rekap = rekapRekonsiliasi(db, TENANT)
  assert.equal(rekap.total_lunas, 35000)
  assert.equal(rekap.jumlah_lunas, 2)
  assert.equal(rekap.total_belum_diselesaikan, 35000)
  tandaiSelesaiDisetor(db, TENANT, { id: a.id, actorId: 'op' })
  const lagi = rekapRekonsiliasi(db, TENANT)
  assert.equal(lagi.total_belum_diselesaikan, 25000)
  assert.equal(lagi.jumlah_belum_diselesaikan, 1)
})

test('daftarIntent menyaring per status & jenis', async () => {
  const db = dbUji(); aktifkanGateway(db)
  const a = await buatIntent(db, { tenantId: TENANT, refType: 'topup', studentId: SISWA, nominal: 10000, klien: klienPalsu() })
  await buatIntent(db, { tenantId: TENANT, refType: 'tabungan', studentId: SISWA, nominal: 20000, klien: klienPalsu() })
  tandaiLunas(db, { intentId: a.id })
  assert.equal(daftarIntent(db, TENANT, { status: 'paid' }).length, 1)
  assert.equal(daftarIntent(db, TENANT, { refType: 'tabungan' }).length, 1)
  assert.equal(daftarIntent(db, TENANT).length, 2)
})

// ---------------------------------------------------------------------------
// Kerahasiaan konfigurasi
// ---------------------------------------------------------------------------

test('konfigurasiPublik tidak pernah membocorkan API key', () => {
  const db = dbUji()
  simpanKonfigurasi(db, TENANT, { base_url: 'https://pg.fazapay.ccwu.cc', api_key: KUNCI, enabled: true, actorId: 'uji' })
  const pub = konfigurasiPublik(db, TENANT, { hostUrl: 'https://jurnal.cc.cd' })
  const teks = JSON.stringify(pub)
  assert.equal(teks.includes(KUNCI), false, 'API key tidak boleh ikut terkirim ke klien')
  assert.equal(pub.punya_api_key, true)
  assert.equal(pub.api_key_hint.includes(KUNCI.slice(0, 6)), false)
  assert.match(pub.webhook_url, /^https:\/\/jurnal\.cc\.cd\/api\/payment\/webhook\/fazapay\/[0-9a-f]{40}$/)
  assert.equal(pub.enabled, true)
})

test('token webhook berbeda per lembaga dan tidak berubah saat konfigurasi disimpan ulang', () => {
  const db = dbUji()
  db.prepare('INSERT INTO tenants (id, slug, nama) VALUES (?,?,?)').run('tenant-2', 'dua', 'Lembaga Dua')
  const a1 = pastikanBarisConfig(db, TENANT).webhook_token
  const b1 = pastikanBarisConfig(db, 'tenant-2').webhook_token
  assert.notEqual(a1, b1)
  simpanKonfigurasi(db, TENANT, { enabled: true, api_key: KUNCI })
  assert.equal(pastikanBarisConfig(db, TENANT).webhook_token, a1, 'token tidak boleh berputar sendiri')
})

test('API key disimpan terenkripsi, bukan sebagai teks biasa', () => {
  const db = dbUji()
  simpanKonfigurasi(db, TENANT, { api_key: KUNCI, enabled: true })
  const baris = db.prepare('SELECT api_key_encrypted FROM payment_gateway_config WHERE tenant_id=?').get(TENANT)
  assert.notEqual(baris.api_key_encrypted, KUNCI)
  assert.equal(baris.api_key_encrypted.includes(KUNCI), false)
  assert.match(baris.api_key_encrypted, /^v1:/)
})

// ---------------------------------------------------------------------------
// Perbaikan celah: isolasi lintas-tenant, kurang bayar, dedupe webhook asing
// ---------------------------------------------------------------------------

test('indeks nominal unik GLOBAL: dua LEMBAGA berbeda tidak boleh punya pay_amount sama', () => {
  const db = dbUji()
  db.prepare('INSERT INTO tenants (id, slug, nama) VALUES (?,?,?)').run('tenant-2', 'dua', 'Lembaga Dua')
  const sisip = (id, tenant, bayar) => db.prepare(`INSERT INTO payment_intents
    (id, tenant_id, ref_type, nominal, kode_unik, pay_amount, status)
    VALUES (?,?,?,?,?,?,'pending')`).run(id, tenant, 'topup', bayar - 101, '101', bayar)
  sisip('a', TENANT, 50123)
  // Lembaga LAIN dengan nominal sama harus tetap ditolak: gateway mencocokkan
  // pembayaran berdasarkan nominal di akun merchant bersama.
  assert.throws(() => sisip('b', 'tenant-2', 50123), /UNIQUE/, 'nominal sama di lembaga lain tidak boleh lolos')
})

test('buatIntent tagihan MENGABAIKAN nominal kiriman (tidak bisa bayar 1 rupiah)', async () => {
  const db = dbUji(); aktifkanGateway(db); isiTagihan(db, { id: 'tg-7', nominal: 500000 })
  const intent = await buatIntent(db, { tenantId: TENANT, refType: 'tagihan', refId: 'tg-7', studentId: SISWA, nominal: 1, klien: klienPalsu() })
  assert.equal(intent.nominal, 500000, 'nominal diambil dari tagihan, bukan kiriman pemanggil')
})

test('tandaiLunas menolak KURANG BAYAR (jalur order_id tidak lagi buta jumlah)', async () => {
  const db = dbUji(); aktifkanGateway(db); isiTagihan(db)
  const intent = await buatIntent(db, { tenantId: TENANT, refType: 'tagihan', refId: 'tg-1', studentId: SISWA, klien: klienPalsu() })
  assert.throws(
    () => tandaiLunas(db, { tenantId: TENANT, gatewayOrderId: intent.gateway_order_id, payAmount: 1000 }),
    /kurang dari yang diminta/,
  )
  assert.equal(db.prepare("SELECT status FROM payment_intents WHERE id=?").get(intent.id).status, 'pending', 'intent tetap pending setelah kurang bayar')
  const ok = tandaiLunas(db, { tenantId: TENANT, gatewayOrderId: intent.gateway_order_id, payAmount: intent.pay_amount })
  assert.equal(ok.duplikat, false, 'nominal penuh tetap dilunasi')
})

test('webhook pembayaran asing dicatat SEKALI walau dikirim ulang', () => {
  const db = dbUji(); aktifkanGateway(db)
  const cfg = pastikanBarisConfig(db, TENANT)
  const body = { event: 'transaction.received', transaction: { order_id: 'GP-asing-1', amount: 777, status: 'paid' } }
  const raw = Buffer.from(JSON.stringify(body))
  const sig = tandaTangan(raw, KUNCI)
  prosesWebhook(db, { token: cfg.webhook_token, rawBody: raw, signature: sig })
  prosesWebhook(db, { token: cfg.webhook_token, rawBody: raw, signature: sig })
  assert.equal(db.prepare("SELECT COUNT(*) c FROM payment_intents WHERE sumber='webhook-asing'").get().c, 1)
})

// ---------------------------------------------------------------------------
// Langganan platform (registrasi pilih paket -> bayar -> paket aktif)
// ---------------------------------------------------------------------------

test('langganan: intent lunas mengaktifkan paket & masa aktif lembaga dari meta', async () => {
  const db = dbUji(); aktifkanGateway(db)
  db.exec(`CREATE TABLE subscription_plans (plan TEXT PRIMARY KEY, label TEXT, harga INTEGER, masa_nilai INTEGER, masa_satuan TEXT, aktif INTEGER);
    ALTER TABLE tenants ADD COLUMN plan TEXT;
    ALTER TABLE tenants ADD COLUMN subscription_ends_at TEXT;
    ALTER TABLE tenants ADD COLUMN trial_ends_at TEXT;
    ALTER TABLE tenants ADD COLUMN expired_at TEXT;`)
  db.prepare("INSERT INTO subscription_plans (plan,label,harga,masa_nilai,masa_satuan,aktif) VALUES ('lite','Lite',50000,1,'bulan',1)").run()
  db.prepare('INSERT INTO tenants (id, slug, nama) VALUES (?,?,?)').run('baru', 'baru', 'Lembaga Baru')

  const intent = await buatIntent(db, {
    tenantId: TENANT, refType: 'langganan', refId: 'baru', nominal: 50000,
    meta: { plan: 'lite', masa_nilai: 1, masa_satuan: 'bulan' }, klien: klienPalsu(),
  })
  assert.equal(intent.ref_type, 'langganan')
  const r = tandaiLunas(db, { intentId: intent.id, sumber: 'webhook' })
  assert.equal(r.efek.efek, 'langganan_aktif')
  const t = db.prepare('SELECT plan, subscription_ends_at FROM tenants WHERE id=?').get('baru')
  assert.equal(t.plan, 'lite')
  assert.ok(t.subscription_ends_at, 'masa aktif terisi setelah lunas')
})

test('registrasi: route menerima pilihan paket & mengembalikan data pembayaran', () => {
  const idx = require('fs').readFileSync(require('path').join(__dirname, '../server/index.cjs'), 'utf8')
  assert.match(idx, /plan: planPilih \} = req\.body/, 'registrasi membaca field plan')
  assert.match(idx, /refType: 'langganan'/, 'buat intent langganan saat paket berbayar dipilih')
  assert.match(idx, /pembayaran,/, 'respons registrasi menyertakan data pembayaran')
  assert.match(idx, /app\.get\('\/api\/public\/plans'/, 'endpoint publik daftar paket')
  assert.match(idx, /app\.get\('\/api\/subscription\/payment\/:intentId', authMiddleware/)
})