// Route HTTP untuk Payment Gateway QRIS (fazapay).
//
// Dipisah dari payment-gateway.cjs supaya inti logikanya tetap bisa diuji tanpa HTTP
// (pola yang sama dengan portal-cashless.cjs: setup* + register*Routes).
//
// Aturan yang dijaga di sini:
//   - Setiap route tenant-scoped memakai req.tenantId; tidak ada tenant yang di-hardcode.
//   - API key TIDAK pernah dikirim ke klien — hanya petunjuk 4+4 karakter.
//   - Route webhook publik (tanpa token auth) tapi WAJIB lolos HMAC atas byte mentah.
//   - Endpoint gateway yang mati tidak pernah dipanggil.

const {
  setupPaymentGatewayTables,
  konfigurasiPublik,
  simpanKonfigurasi,
  klienUntukTenant,
  buatIntent,
  daftarIntent,
  intentRingkas,
  intentPending,
  tandaiKedaluwarsa,
  tandaiBatal,
  tandaiLunas,
  prosesWebhook,
  cekPending,
  rekapRekonsiliasi,
  tandaiSelesaiDisetor,
  pastikanBarisConfig,
  normalisasiNominal,
  REF_TYPES,
} = require('./payment-gateway.cjs')

let linkedStudentIds = () => []
try {
  const pc = require('./portal-cashless.cjs')
  if (typeof pc.linkedStudentIds === 'function') linkedStudentIds = pc.linkedStudentIds
} catch { /* modul portal opsional */ }

function setupPaymentGateway(db) {
  setupPaymentGatewayTables(db)
  // Pastikan setiap lembaga punya baris konfigurasi + token webhook (INSERT OR IGNORE,
  // jadi aman dijalankan berkali-kali dan tidak menimpa setelan yang sudah ada).
  for (const { id } of db.prepare('SELECT id FROM tenants').all()) {
    try { pastikanBarisConfig(db, id) } catch { /* lewati lembaga tanpa id valid */ }
  }
}

function registerPaymentGatewayRoutes(app, db, { requireRole, hostPermintaan }) {
  const KEUANGAN = requireRole('bendahara', 'admin', 'super_admin', 'operator')
  const OPERATOR_PLATFORM = requireRole('super_admin', 'admin')
  const PORTAL = requireRole('siswa', 'wali_murid', 'super_admin')

  const dasarUrl = (req) => `${req.protocol}://${hostPermintaan(req)}`

  const aman = (res, fn) => {
    try { fn() } catch (e) { res.status(400).json({ error: e.message }) }
  }

  // ---- Konfigurasi -------------------------------------------------------

  app.get('/api/payment-gateway', KEUANGAN, (req, res) => aman(res, () => {
    tandaiKedaluwarsa(db, req.tenantId)
    res.json({
      config: konfigurasiPublik(db, req.tenantId, { hostUrl: dasarUrl(req) }),
      rekap: rekapRekonsiliasi(db, req.tenantId),
      pending: intentPending(db, req.tenantId).length,
    })
  }))

  app.put('/api/payment-gateway', KEUANGAN, async (req, res) => {
    try {
      const { base_url, api_key, enabled } = req.body || {}
      simpanKonfigurasi(db, req.tenantId, { base_url, api_key, enabled, actorId: req.user?.id })
      // Kalau ada API key & diminta aktif, uji langsung ke gateway + daftarkan webhook.
      const baris = pastikanBarisConfig(db, req.tenantId)
      const punyaKunci = Boolean(baris.api_key_encrypted)
      let uji = null
      if (punyaKunci) uji = await ujiDanDaftarkanWebhook(db, req, dasarUrl(req))
      res.json({
        success: true,
        config: konfigurasiPublik(db, req.tenantId, { hostUrl: dasarUrl(req) }),
        uji,
      })
    } catch (e) {
      res.status(400).json({ error: e.message })
    }
  })

  app.post('/api/payment-gateway/verify', KEUANGAN, async (req, res) => {
    try {
      const hasil = await ujiDanDaftarkanWebhook(db, req, dasarUrl(req))
      res.json(hasil)
    } catch (e) {
      res.status(400).json({ error: e.message })
    }
  })

  // ---- Intent ------------------------------------------------------------

  app.get('/api/payment-gateway/intents', KEUANGAN, (req, res) => aman(res, () => {
    tandaiKedaluwarsa(db, req.tenantId)
    res.json({ intents: daftarIntent(db, req.tenantId, {
      status: req.query.status || null,
      refType: req.query.ref_type || null,
      limit: req.query.limit,
    }) })
  }))

  app.get('/api/payment-gateway/intents/:id', KEUANGAN, (req, res) => aman(res, () => {
    const row = db.prepare('SELECT * FROM payment_intents WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!row) return res.status(404).json({ error: 'Intent tidak ditemukan' })
    const cfg = db.prepare('SELECT webhook_token FROM payment_gateway_config WHERE tenant_id=?').get(req.tenantId)
    res.json({
      intent: intentRingkas(row),
      selalu_refresh: true,
      webhook_url: cfg?.webhook_token ? `${dasarUrl(req)}/api/payment/webhook/fazapay/${cfg.webhook_token}` : '',
    })
  }))

  app.post('/api/payment-gateway/intents', KEUANGAN, async (req, res) => {
    try {
      const { ref_type, ref_id, nominal, student_id, label } = req.body || {}
      const intent = await buatIntent(db, {
        tenantId: req.tenantId,
        refType: String(ref_type || ''),
        refId: ref_id || '',
        studentId: student_id || '',
        label: label || '',
        nominal,
        createdBy: req.user?.id || '',
      })
      res.json({ success: true, intent })
    } catch (e) {
      res.status(400).json({ error: e.message })
    }
  })

  app.post('/api/payment-gateway/intents/:id/cek', KEUANGAN, async (req, res) => {
    const row = db.prepare('SELECT * FROM payment_intents WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!row) return res.status(404).json({ error: 'Intent tidak ditemukan' })
    if (row.status !== 'pending') return res.json({ intent: intentRingkas(row), berubah: false })
    try {
      const klien = klienUntukTenant(db, req.tenantId)
      const status = await klien.statusNominal(row.pay_amount)
      if (!status.paid) return res.json({ intent: intentRingkas(row), berubah: false, gateway: status })
      const hasil = tandaiLunas(db, { intentId: row.id, sumber: 'manual-cek', waktu: new Date().toISOString() })
      res.json({ intent: hasil.intent, berubah: !hasil.duplikat, efek: hasil.efek, gateway: status })
    } catch (e) {
      res.status(400).json({ error: e.message })
    }
  })

  app.post('/api/payment-gateway/intents/:id/cancel', KEUANGAN, (req, res) => aman(res, () => {
    res.json({ success: true, intent: tandaiBatal(db, req.tenantId, req.params.id) })
  }))

  // Konfirmasi manual oleh bendahara (uang sudah masuk tetapi webhook/poller belum menangkap).
  // Setara "verifikasi topup manual" di cashless — bukan jalan pintas bagi siswa.
  app.post('/api/payment-gateway/intents/:id/confirm', KEUANGAN, (req, res) => aman(res, () => {
    const row = db.prepare('SELECT * FROM payment_intents WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!row) return res.status(404).json({ error: 'Intent tidak ditemukan' })
    const hasil = tandaiLunas(db, {
      intentId: row.id,
      sumber: 'konfirmasi-bendahara',
      payload: { oleh: req.user?.id || '', catatan: String(req.body?.catatan || '') },
      waktu: new Date().toISOString(),
    })
    res.json({ success: true, intent: hasil.intent, efek: hasil.efek, duplikat: hasil.duplikat })
  }))

  app.post('/api/payment-gateway/settle', OPERATOR_PLATFORM, (req, res) => aman(res, () => {
    const hasil = tandaiSelesaiDisetor(db, req.tenantId, {
      id: req.body?.id || null,
      semua: req.body?.semua === true,
      actorId: req.user?.id || '',
    })
    res.json({ success: true, ...hasil })
  }))

  // ---- Sisi portal (siswa / wali murid) ----------------------------------
  //
  // Wali harus bisa membayar sendiri dari HP. Endpoint staf tidak boleh dipakai siswa,
  // jadi ada jalur terpisah yang mengunci setiap permintaan ke anak yang benar-benar
  // tertaut dengan akun itu (linkedStudentIds), bukan sekadar percaya student_id kiriman.
  app.get('/api/portal/payment-gateway', PORTAL, (req, res) => {
    const cfg = db.prepare('SELECT enabled, api_key_encrypted FROM payment_gateway_config WHERE tenant_id=?').get(req.tenantId)
    res.json({ enabled: cfg?.enabled === 1 && Boolean(cfg?.api_key_encrypted) })
  })

  app.post('/api/portal/payment-intent', PORTAL, async (req, res) => {
    try {
      const anak = new Set(linkedStudentIds(db, req.tenantId, req.user.id))
      const { ref_type, ref_id, nominal } = req.body || {}
      let studentId = String(req.body?.student_id || '')

      if (ref_type === 'tagihan') {
        const tg = db.prepare('SELECT id, siswa_id FROM tagihan WHERE id=? AND tenant_id=?').get(ref_id, req.tenantId)
        if (!tg) return res.status(404).json({ error: 'Tagihan tidak ditemukan' })
        studentId = tg.siswa_id
      }
      if (!anak.has(studentId)) return res.status(403).json({ error: 'Bukan siswa/anak tertaut' })

      const intent = await buatIntent(db, {
        tenantId: req.tenantId,
        refType: ref_type,
        refId: ref_id || '',
        studentId,
        label: String(req.body?.label || ''),
        nominal,
        createdBy: req.user?.id || '',
      })
      res.json({ success: true, intent })
    } catch (e) {
      res.status(400).json({ error: e.message })
    }
  })

  app.get('/api/portal/payment-intents', PORTAL, (req, res) => aman(res, () => {
    const anak = new Set(linkedStudentIds(db, req.tenantId, req.user.id))
    const semua = daftarIntent(db, req.tenantId, { limit: 50 })
    res.json({ intents: semua.filter(i => anak.has(i.student_id)) })
  }))

  app.post('/api/portal/payment-intent/:id/cek', PORTAL, async (req, res) => {
    const row = db.prepare('SELECT * FROM payment_intents WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!row) return res.status(404).json({ error: 'Intent tidak ditemukan' })
    if (!new Set(linkedStudentIds(db, req.tenantId, req.user.id)).has(row.student_id)) {
      return res.status(403).json({ error: 'Bukan siswa/anak tertaut' })
    }
    if (row.status !== 'pending') return res.json({ intent: intentRingkas(row), berubah: false })
    try {
      const klien = klienUntukTenant(db, req.tenantId)
      const status = await klien.statusNominal(row.pay_amount)
      if (!status.paid) return res.json({ intent: intentRingkas(row), berubah: false, gateway: status })
      const hasil = tandaiLunas(db, { intentId: row.id, sumber: 'portal-cek', waktu: new Date().toISOString() })
      res.json({ intent: hasil.intent, berubah: !hasil.duplikat, efek: hasil.efek, gateway: status })
    } catch (e) {
      res.status(400).json({ error: e.message })
    }
  })

  app.post('/api/portal/payment-intent/:id/cancel', PORTAL, (req, res) => aman(res, () => {
    const row = db.prepare('SELECT * FROM payment_intents WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!row) return res.status(404).json({ error: 'Intent tidak ditemukan' })
    if (!new Set(linkedStudentIds(db, req.tenantId, req.user.id)).has(row.student_id)) {
      return res.status(403).json({ error: 'Bukan siswa/anak tertaut' })
    }
    res.json({ success: true, intent: tandaiBatal(db, req.tenantId, req.params.id) })
  }))

  // ---- Webhook masuk (publik, wajib HMAC) --------------------------------
  //
  // Token di path adalah penanda lembaga (32+ hex, tidak bisa ditebak) — jadi kita
  // tidak perlu memindai seluruh lembaga untuk menemukan kunci yang cocok.
  app.post('/api/payment/webhook/fazapay/:token', (req, res) => {
    const mentah = req.rawBody || (req.body ? Buffer.from(JSON.stringify(req.body)) : Buffer.alloc(0))
    const signature = req.headers['x-signature'] || req.headers['X-Signature']
    try {
      const hasil = prosesWebhook(db, { token: req.params.token, rawBody: mentah, signature })
      res.json({ ok: true, ...hasil })
    } catch (e) {
      // 4xx = gateway tidak mengulang, jadi jangan memakai 4xx untuk galat sementara.
      const permanen = /signature tidak valid|token webhook tidak dikenal|bukan JSON|tidak memuat transaction/.test(e.message)
      res.status(permanen ? 400 : 500).json({ ok: false, error: e.message })
    }
  })
}

/**
 * Uji API key ke gateway lalu daftarkan URL webhook kita. Hasil uji SELALU dicatat ke
 * kolom last_verified_at/last_verify_error supaya halaman pengaturan tidak pernah
 * menampilkan "tersambung" yang basi.
 */
async function ujiDanDaftarkanWebhook(db, req, dasarUrl) {
  const tid = req.tenantId
  const catat = (patch, nilai) => {
    db.prepare(`UPDATE payment_gateway_config SET ${patch.map(k => k + '=?').join(', ')}, updated_at=datetime('now') WHERE tenant_id=?`)
      .run(...nilai, tid)
  }
  try {
    const klien = klienUntukTenant(db, tid)
    const profil = await klien.verifikasi()
    const baris = pastikanBarisConfig(db, tid)
    const urlWebhook = `${dasarUrl}/api/payment/webhook/fazapay/${baris.webhook_token}`
    let webhook = { terdaftar: false, url: urlWebhook }
    try {
      await klien.daftarWebhook(urlWebhook)
      webhook = { terdaftar: true, url: urlWebhook }
      catat(['last_verified_at', 'last_verify_error', 'webhook_registered_at', 'webhook_last_error'],
        [new Date().toISOString(), null, new Date().toISOString(), null])
    } catch (err) {
      catat(['last_verified_at', 'last_verify_error', 'webhook_last_error'],
        [new Date().toISOString(), null, err.message])
    }
    return {
      ok: true,
      akun: { email: profil.email || '', is_admin: !!profil.is_admin, merchant_mode: profil.merchant_mode || null },
      webhook,
    }
  } catch (e) {
    catat(['last_verify_error'], [e.message])
    throw new Error(`Uji gateway gagal: ${e.message}`)
  }
}

module.exports = { setupPaymentGateway, registerPaymentGatewayRoutes, REF_TYPES }