// ============================================================================
// publik.cjs — Halaman publik situs lembaga (diadopsi dari sisfo.upiyptk.ac.id)
//
// Menyediakan konten yang bisa diakses pengunjung TANPA login: pengumuman,
// FAQ, kontak, dan tiket helpdesk. Backend-nya baru (tabel faq/kontak/
// helpdesk_tiket) karena Jurnalku sebelumnya tidak punya fitur ini; hanya
// pengumuman yang menumpang tabel `posting` yang sudah ada (kategori
// pengumuman/info/berita).
//
// Pola mengikuti ppdb.cjs: satu fungsi buatLayananPublik(db) berisi logika murni
// + registerRoutes(app, db, deps) untuk route. Semua multi-tenant via tenant_id.
// ============================================================================

const crypto = require('node:crypto')
const { canonicalSettingsId } = require('./tenant-settings.cjs')

const uuid = () => crypto.randomUUID()

function setupPublikTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS faq (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      pertanyaan TEXT NOT NULL,
      jawaban TEXT NOT NULL,
      urutan INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_faq_tenant ON faq(tenant_id, urutan);

    CREATE TABLE IF NOT EXISTS kontak (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      nama TEXT NOT NULL,
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      subjek TEXT DEFAULT '',
      pesan TEXT NOT NULL,
      dibaca INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_kontak_tenant ON kontak(tenant_id, created_at);

    CREATE TABLE IF NOT EXISTS helpdesk_tiket (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      nama TEXT NOT NULL,
      username_nim TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      kategori TEXT DEFAULT 'other',
      subjek TEXT NOT NULL,
      pesan TEXT NOT NULL,
      status TEXT DEFAULT 'baru',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_helpdesk_tenant ON helpdesk_tiket(tenant_id, status, created_at);
  `)
}

function buatLayananPublik(db) {
  // --- Pengumuman (menumpang tabel posting) ---
  const pengumumanPublik = (tenantId) => {
    const rows = db.prepare(
      `SELECT id, judul, konten, isi, kategori, penulis_nama, created_at
       FROM posting
       WHERE tenant_id=? AND (kategori IN ('pengumuman','info','berita') OR kategori IS NULL)
       ORDER BY created_at DESC LIMIT 20`
    ).all(tenantId)
    return rows.map(r => ({
      id: r.id,
      judul: r.judul,
      ringkas: String(r.konten || r.isi || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200),
      kategori: r.kategori || 'berita',
      penulis: r.penulis_nama || '',
      created_at: r.created_at,
    }))
  }

  // --- FAQ ---
  const daftarFaq = (tenantId) =>
    db.prepare('SELECT id, pertanyaan, jawaban, urutan FROM faq WHERE tenant_id=? ORDER BY urutan, created_at').all(tenantId)
  const simpanFaq = (tenantId, { id, pertanyaan, jawaban, urutan }) => {
    const p = String(pertanyaan || '').trim()
    const j = String(jawaban || '').trim()
    if (!p || !j) throw new Error('Pertanyaan dan jawaban wajib diisi.')
    const ur = Number.isFinite(Number(urutan)) ? Number(urutan) : 0
    if (id) {
      const ada = db.prepare('SELECT id FROM faq WHERE id=? AND tenant_id=?').get(id, tenantId)
      if (!ada) throw new Error('FAQ tidak ditemukan.')
      db.prepare('UPDATE faq SET pertanyaan=?, jawaban=?, urutan=? WHERE id=? AND tenant_id=?').run(p, j, ur, id, tenantId)
      return { id, pertanyaan: p, jawaban: j, urutan: ur }
    }
    const nid = uuid()
    db.prepare('INSERT INTO faq (id, tenant_id, pertanyaan, jawaban, urutan) VALUES (?,?,?,?,?)').run(nid, tenantId, p, j, ur)
    return { id: nid, pertanyaan: p, jawaban: j, urutan: ur }
  }
  const hapusFaq = (tenantId, id) => {
    const r = db.prepare('DELETE FROM faq WHERE id=? AND tenant_id=?').run(id, tenantId)
    if (!r.changes) throw new Error('FAQ tidak ditemukan.')
  }

  // --- Kontak ---
  const simpanKontak = (tenantId, { nama, email, phone, subjek, pesan }) => {
    const n = String(nama || '').trim()
    const ps = String(pesan || '').trim()
    if (!n) throw new Error('Nama wajib diisi.')
    if (!ps) throw new Error('Pesan wajib diisi.')
    const id = uuid()
    db.prepare('INSERT INTO kontak (id, tenant_id, nama, email, phone, subjek, pesan) VALUES (?,?,?,?,?,?,?)')
      .run(id, tenantId, n, String(email || '').trim().slice(0, 200), String(phone || '').trim().slice(0, 40), String(subjek || '').trim().slice(0, 200), ps.slice(0, 5000))
    return { id }
  }
  const daftarKontak = (tenantId, { belumDibaca = false } = {}) => {
    const rows = db.prepare(
      `SELECT id, nama, email, phone, subjek, pesan, dibaca, created_at FROM kontak
       WHERE tenant_id=? ${belumDibaca ? 'AND dibaca=0' : ''} ORDER BY created_at DESC LIMIT 200`
    ).all(tenantId)
    return rows
  }
  const tandaiKontakDibaca = (tenantId, id) => {
    const r = db.prepare('UPDATE kontak SET dibaca=1 WHERE id=? AND tenant_id=?').run(id, tenantId)
    if (!r.changes) throw new Error('Pesan tidak ditemukan.')
  }

  // --- Helpdesk tiket ---
  const simpanTiket = (tenantId, { nama, username_nim, email, phone, kategori, subjek, pesan }) => {
    const n = String(nama || '').trim()
    const s = String(subjek || '').trim()
    const ps = String(pesan || '').trim()
    if (!n) throw new Error('Nama wajib diisi.')
    if (!s) throw new Error('Subjek wajib diisi.')
    if (!ps) throw new Error('Kendala wajib diisi.')
    const id = uuid()
    db.prepare('INSERT INTO helpdesk_tiket (id, tenant_id, nama, username_nim, email, phone, kategori, subjek, pesan) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, tenantId, n, String(username_nim || '').trim().slice(0, 100), String(email || '').trim().slice(0, 200), String(phone || '').trim().slice(0, 40), String(kategori || 'other').slice(0, 30), s.slice(0, 200), ps.slice(0, 5000))
    return { id }
  }
  const daftarTiket = (tenantId, { status } = {}) => {
    const rows = status
      ? db.prepare(
          `SELECT id, nama, username_nim, email, phone, kategori, subjek, pesan, status, created_at
           FROM helpdesk_tiket WHERE tenant_id=? AND status=? ORDER BY created_at DESC LIMIT 200`
        ).all(tenantId, status)
      : db.prepare(
          `SELECT id, nama, username_nim, email, phone, kategori, subjek, pesan, status, created_at
           FROM helpdesk_tiket WHERE tenant_id=? ORDER BY created_at DESC LIMIT 200`
        ).all(tenantId)
    return rows
  }
  const ubahStatusTiket = (tenantId, id, status) => {
    if (!['baru', 'diproses', 'selesai'].includes(status)) throw new Error('Status tidak valid.')
    const r = db.prepare('UPDATE helpdesk_tiket SET status=? WHERE id=? AND tenant_id=?').run(status, id, tenantId)
    if (!r.changes) throw new Error('Tiket tidak ditemukan.')
  }

  return {
    pengumumanPublik, daftarFaq, simpanFaq, hapusFaq,
    simpanKontak, daftarKontak, tandaiKontakDibaca,
    simpanTiket, daftarTiket, ubahStatusTiket,
  }
}

function registerRoutes(app, db, { requireRole, authMiddleware } = {}) {
  const svc = buatLayananPublik(db)
  const w = (fn) => (req, res) => { try { fn(req, res) } catch (e) { res.status(400).json({ error: e.message }) } }
  const PANITIA = requireRole ? requireRole('admin', 'super_admin', 'operator', 'tata_usaha', 'tu', 'kepala') : authMiddleware

  // --- Publik (tanpa login) ---
  app.get('/api/publik/pengumuman', w((req, res) => {
    res.json({ pengumuman: svc.pengumumanPublik(req.tenantId) })
  }))
  app.get('/api/publik/faq', w((req, res) => {
    res.json({ faq: svc.daftarFaq(req.tenantId) })
  }))
  app.post('/api/publik/kontak', w((req, res) => {
    const id = svc.simpanKontak(req.tenantId, req.body || {}).id
    res.json({ success: true, id })
  }))
  app.post('/api/publik/helpdesk', w((req, res) => {
    const id = svc.simpanTiket(req.tenantId, req.body || {}).id
    res.json({ success: true, id })
  }))

  // --- Admin (login) ---
  app.get('/api/faq', PANITIA, w((req, res) => res.json({ faq: svc.daftarFaq(req.tenantId) })))
  app.post('/api/faq', PANITIA, w((req, res) => res.json({ faq: svc.simpanFaq(req.tenantId, req.body || {}) })))
  app.put('/api/faq/:id', PANITIA, w((req, res) => res.json({ faq: svc.simpanFaq(req.tenantId, { ...(req.body || {}), id: req.params.id }) })))
  app.delete('/api/faq/:id', PANITIA, w((req, res) => { svc.hapusFaq(req.tenantId, req.params.id); res.json({ success: true }) }))

  app.get('/api/kontak', PANITIA, w((req, res) => {
    const belum = req.query.belum === '1'
    res.json({ kontak: svc.daftarKontak(req.tenantId, { belumDibaca: belum }) })
  }))
  app.post('/api/kontak/:id/dibaca', PANITIA, w((req, res) => {
    svc.tandaiKontakDibaca(req.tenantId, req.params.id)
    res.json({ success: true })
  }))

  app.get('/api/helpdesk', PANITIA, w((req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined
    res.json({ tiket: svc.daftarTiket(req.tenantId, { status }) })
  }))
  app.put('/api/helpdesk/:id/status', PANITIA, w((req, res) => {
    svc.ubahStatusTiket(req.tenantId, req.params.id, String(req.body?.status || ''))
    res.json({ success: true })
  }))
}

module.exports = { setupPublikTables, buatLayananPublik, registerRoutes }
