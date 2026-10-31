// Modul Pesantren/Pondok: asrama & kamar, penempatan santri, izin pulang.
//
// Fitur ini digerbang paket lewat FEATURE_PREFIXES['pesantren'] di
// subscription.cjs — route /api/asrama, /api/kamar, /api/penempatan, dan
// /api/izin-pulang otomatis ditolak 403 (FEATURE_DISABLED) untuk lembaga yang
// paketnya tidak mencakup fitur pesantren. Tidak ada gerbang tambahan di sini.
const crypto = require('node:crypto')

function setupPesantrenTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS asrama (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      nama TEXT NOT NULL,
      kapasitas INTEGER NOT NULL DEFAULT 0,
      pengasuh TEXT,
      keterangan TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS kamar (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      asrama_id TEXT NOT NULL,
      nama TEXT NOT NULL,
      kapasitas INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS penempatan_santri (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      siswa_id TEXT NOT NULL,
      kamar_id TEXT NOT NULL,
      tanggal_masuk TEXT,
      tanggal_keluar TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS izin_pulang (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      siswa_id TEXT NOT NULL,
      tanggal_pulang TEXT NOT NULL,
      tanggal_kembali TEXT NOT NULL,
      alasan TEXT,
      status TEXT NOT NULL DEFAULT 'diajukan',
      catatan_admin TEXT,
      approved_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_asrama_tenant ON asrama(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_kamar_tenant ON kamar(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_kamar_asrama ON kamar(asrama_id);
    CREATE INDEX IF NOT EXISTS idx_penempatan_kamar ON penempatan_santri(kamar_id);
    CREATE INDEX IF NOT EXISTS idx_penempatan_siswa ON penempatan_santri(siswa_id);
    CREATE INDEX IF NOT EXISTS idx_izin_tenant ON izin_pulang(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_izin_siswa ON izin_pulang(siswa_id);
  `)
}

function registerPesantrenRoutes(app, { db, requireRole, waGateway }) {
  const ADMIN = requireRole('admin', 'super_admin')
  const idBaru = () => crypto.randomUUID()
  const milik = (id, table) => db.prepare(`SELECT id FROM ${table} WHERE id=? AND tenant_id=?`).get(id)

  // ---------- ASRAMA ----------
  app.get('/api/asrama', ADMIN, (req, res) => {
    const rows = db.prepare('SELECT * FROM asrama WHERE tenant_id=? ORDER BY nama').all(req.tenantId)
    const kamarPer = db.prepare('SELECT asrama_id, COUNT(*) n FROM kamar WHERE tenant_id=? GROUP BY asrama_id').all(req.tenantId)
    const huniPer = db.prepare(
      `SELECT k.asrama_id, COUNT(p.id) n FROM penempatan_santri p
       JOIN kamar k ON k.id = p.kamar_id
       WHERE p.tenant_id=? AND (p.tanggal_keluar IS NULL OR p.tanggal_keluar='')
       GROUP BY k.asrama_id`).all(req.tenantId)
    const mapKamar = Object.fromEntries(kamarPer.map(r => [r.asrama_id, r.n]))
    const mapHuni = Object.fromEntries(huniPer.map(r => [r.asrama_id, r.n]))
    res.json(rows.map(r => ({ ...r, jumlah_kamar: mapKamar[r.id] || 0, jumlah_penghuni: mapHuni[r.id] || 0 })))
  })

  app.post('/api/asrama', ADMIN, (req, res) => {
    const nama = String(req.body?.nama || '').trim()
    if (!nama) return res.status(400).json({ error: 'Nama asrama wajib diisi' })
    const id = idBaru()
    db.prepare('INSERT INTO asrama (id, tenant_id, nama, kapasitas, pengasuh, keterangan) VALUES (?,?,?,?,?,?)')
      .run(id, req.tenantId, nama, Number(req.body.kapasitas) || 0, String(req.body.pengasuh || '').trim() || null, String(req.body.keterangan || '').trim() || null)
    res.json({ id, ...db.prepare('SELECT * FROM asrama WHERE id=?').get(id) })
  })

  app.put('/api/asrama/:id', ADMIN, (req, res) => {
    if (!milik(req.params.id, 'asrama')) return res.status(404).json({ error: 'Asrama tidak ditemukan' })
    const nama = String(req.body?.nama || '').trim()
    if (!nama) return res.status(400).json({ error: 'Nama asrama wajib diisi' })
    db.prepare('UPDATE asrama SET nama=?, kapasitas=?, pengasuh=?, keterangan=? WHERE id=? AND tenant_id=?')
      .run(nama, Number(req.body.kapasitas) || 0, String(req.body.pengasuh || '').trim() || null, String(req.body.keterangan || '').trim() || null, req.params.id, req.tenantId)
    res.json(db.prepare('SELECT * FROM asrama WHERE id=?').get(req.params.id))
  })

  app.delete('/api/asrama/:id', ADMIN, (req, res) => {
    if (!milik(req.params.id, 'asrama')) return res.status(404).json({ error: 'Asrama tidak ditemukan' })
    const hapus = db.transaction(() => {
      const kamarIds = db.prepare('SELECT id FROM kamar WHERE asrama_id=?').all(req.params.id).map(r => r.id)
      for (const kid of kamarIds) db.prepare('DELETE FROM penempatan_santri WHERE kamar_id=?').run(kid)
      db.prepare('DELETE FROM kamar WHERE asrama_id=?').run(req.params.id)
      db.prepare('DELETE FROM asrama WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
    })
    hapus()
    res.json({ success: true })
  })

  // ---------- KAMAR ----------
  app.get('/api/kamar', ADMIN, (req, res) => {
    const asramaId = req.query.asrama_id
    const rows = asramaId
      ? db.prepare('SELECT * FROM kamar WHERE tenant_id=? AND asrama_id=? ORDER BY nama').all(req.tenantId, asramaId)
      : db.prepare('SELECT * FROM kamar WHERE tenant_id=? ORDER BY nama').all(req.tenantId)
    const huniPer = db.prepare(
      `SELECT kamar_id, COUNT(*) n FROM penempatan_santri
       WHERE tenant_id=? AND (tanggal_keluar IS NULL OR tanggal_keluar='')
       GROUP BY kamar_id`).all(req.tenantId)
    const map = Object.fromEntries(huniPer.map(r => [r.kamar_id, r.n]))
    res.json(rows.map(r => ({ ...r, jumlah_penghuni: map[r.id] || 0 })))
  })

  app.post('/api/kamar', ADMIN, (req, res) => {
    const { asrama_id, nama } = req.body || {}
    if (!asrama_id || !milik(asrama_id, 'asrama')) return res.status(400).json({ error: 'Asrama tidak valid' })
    if (!String(nama || '').trim()) return res.status(400).json({ error: 'Nama kamar wajib diisi' })
    const id = idBaru()
    db.prepare('INSERT INTO kamar (id, tenant_id, asrama_id, nama, kapasitas) VALUES (?,?,?,?,?)')
      .run(id, req.tenantId, asrama_id, String(nama).trim(), Number(req.body.kapasitas) || 0)
    res.json(db.prepare('SELECT * FROM kamar WHERE id=?').get(id))
  })

  app.put('/api/kamar/:id', ADMIN, (req, res) => {
    if (!milik(req.params.id, 'kamar')) return res.status(404).json({ error: 'Kamar tidak ditemukan' })
    if (!String(req.body?.nama || '').trim()) return res.status(400).json({ error: 'Nama kamar wajib diisi' })
    db.prepare('UPDATE kamar SET nama=?, kapasitas=? WHERE id=? AND tenant_id=?')
      .run(String(req.body.nama).trim(), Number(req.body.kapasitas) || 0, req.params.id, req.tenantId)
    res.json(db.prepare('SELECT * FROM kamar WHERE id=?').get(req.params.id))
  })

  app.delete('/api/kamar/:id', ADMIN, (req, res) => {
    if (!milik(req.params.id, 'kamar')) return res.status(404).json({ error: 'Kamar tidak ditemukan' })
    const hapus = db.transaction(() => {
      db.prepare('DELETE FROM penempatan_santri WHERE kamar_id=?').run(req.params.id)
      db.prepare('DELETE FROM kamar WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
    })
    hapus()
    res.json({ success: true })
  })

  // ---------- PENEMPATAN SANTRI ----------
  app.get('/api/penempatan', ADMIN, (req, res) => {
    const kamarId = req.query.kamar_id
    const base = `
      SELECT p.*, s.nama, s.nis, s.nisn, s.jenis_kelamin, k.nama AS kamar, k.asrama_id, a.nama AS asrama
      FROM penempatan_santri p
      JOIN siswa s ON s.id = p.siswa_id
      JOIN kamar k ON k.id = p.kamar_id
      JOIN asrama a ON a.id = k.asrama_id
      WHERE p.tenant_id=? AND (p.tanggal_keluar IS NULL OR p.tanggal_keluar='')`
    const rows = kamarId
      ? db.prepare(base + ' AND p.kamar_id=? ORDER BY s.nama').all(req.tenantId, kamarId)
      : db.prepare(base + ' ORDER BY a.nama, k.nama, s.nama').all(req.tenantId)
    res.json(rows)
  })

  app.post('/api/penempatan', ADMIN, (req, res) => {
    const { siswa_id, kamar_id, tanggal_masuk } = req.body || {}
    const siswa = db.prepare('SELECT id FROM siswa WHERE id=? AND tenant_id=?').get(siswa_id, req.tenantId)
    if (!siswa) return res.status(400).json({ error: 'Siswa tidak ditemukan' })
    const kamar = db.prepare('SELECT id, kapasitas FROM kamar WHERE id=? AND tenant_id=?').get(kamar_id, req.tenantId)
    if (!kamar) return res.status(400).json({ error: 'Kamar tidak ditemukan' })
    // Cegah dobel penempatan aktif di kamar mana pun untuk santri yang sama.
    const sudah = db.prepare("SELECT id FROM penempatan_santri WHERE siswa_id=? AND tenant_id=? AND (tanggal_keluar IS NULL OR tanggal_keluar='')").get(siswa_id, req.tenantId)
    if (sudah) return res.status(400).json({ error: 'Santri sudah ditempatkan di kamar aktif' })
    // Cegah melebihi kapasitas kamar.
    if (kamar.kapasitas > 0) {
      const isi = db.prepare("SELECT COUNT(*) n FROM penempatan_santri WHERE kamar_id=? AND (tanggal_keluar IS NULL OR tanggal_keluar='')").get(kamar_id).n
      if (isi >= kamar.kapasitas) return res.status(400).json({ error: `Kamar penuh (${isi}/${kamar.kapasitas})` })
    }
    const id = idBaru()
    db.prepare('INSERT INTO penempatan_santri (id, tenant_id, siswa_id, kamar_id, tanggal_masuk) VALUES (?,?,?,?,?)')
      .run(id, req.tenantId, siswa_id, kamar_id, tanggal_masuk || null)
    res.json({ id })
  })

  app.delete('/api/penempatan/:id', ADMIN, (req, res) => {
    const row = db.prepare('SELECT id FROM penempatan_santri WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!row) return res.status(404).json({ error: 'Penempatan tidak ditemukan' })
    db.prepare("UPDATE penempatan_santri SET tanggal_keluar=date('now') WHERE id=?").run(req.params.id)
    res.json({ success: true })
  })

  // ---------- IZIN PULANG ----------
  app.get('/api/izin-pulang', ADMIN, (req, res) => {
    const status = req.query.status
    const base = `
      SELECT i.*, s.nama, s.nis, s.no_hp_wali, s.no_hp, s.nama_ortu, k.nama AS kamar
      FROM izin_pulang i
      JOIN siswa s ON s.id = i.siswa_id
      LEFT JOIN penempatan_santri p ON p.siswa_id = i.siswa_id AND p.tenant_id = i.tenant_id AND (p.tanggal_keluar IS NULL OR p.tanggal_keluar='')
      LEFT JOIN kamar k ON k.id = p.kamar_id
      WHERE i.tenant_id=?`
    const rows = status
      ? db.prepare(base + ' AND i.status=? ORDER BY i.created_at DESC').all(req.tenantId, status)
      : db.prepare(base + ' ORDER BY i.created_at DESC').all(req.tenantId)
    res.json(rows)
  })

  app.post('/api/izin-pulang', ADMIN, (req, res) => {
    const { siswa_id, tanggal_pulang, tanggal_kembali, alasan } = req.body || {}
    if (!db.prepare('SELECT id FROM siswa WHERE id=? AND tenant_id=?').get(siswa_id, req.tenantId)) return res.status(400).json({ error: 'Siswa tidak ditemukan' })
    if (!tanggal_pulang || !tanggal_kembali) return res.status(400).json({ error: 'Tanggal pulang dan kembali wajib diisi' })
    const id = idBaru()
    db.prepare('INSERT INTO izin_pulang (id, tenant_id, siswa_id, tanggal_pulang, tanggal_kembali, alasan) VALUES (?,?,?,?,?,?)')
      .run(id, req.tenantId, siswa_id, tanggal_pulang, tanggal_kembali, String(alasan || '').trim() || null)
    res.json({ id })
  })

  app.put('/api/izin-pulang/:id', ADMIN, (req, res) => {
    const iz = db.prepare('SELECT * FROM izin_pulang WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!iz) return res.status(404).json({ error: 'Izin tidak ditemukan' })
    const status = String(req.body?.status || '').trim()
    if (!['disetujui', 'ditolak', 'selesai'].includes(status)) return res.status(400).json({ error: 'Status tidak valid' })
    const catatan = String(req.body?.catatan_admin || '').trim() || null
    db.prepare("UPDATE izin_pulang SET status=?, catatan_admin=?, approved_by=?, updated_at=datetime('now') WHERE id=? AND tenant_id=?")
      .run(status, catatan, req.user?.id || null, req.params.id, req.tenantId)

    // Notifikasi WA ke wali saat keputusan diberikan.
    if (waGateway && (status === 'disetujui' || status === 'ditolak')) {
      try {
        const s = db.prepare('SELECT nama, nis, no_hp_wali, no_hp, nama_ortu FROM siswa WHERE id=? AND tenant_id=?').get(iz.siswa_id, req.tenantId)
        const phone = String((s?.no_hp_wali || s?.no_hp || '')).trim()
        if (phone && s) {
          const ortu = s.nama_ortu || 'Bapak/Ibu'
          const pesan = status === 'disetujui'
            ? `Assalamualaikum ${ortu}, izin pulang ananda *${s.nama}* telah *DISETUJUI*.\n\n📅 Pulang: ${iz.tanggal_pulang}\n📅 Kembali: ${iz.tanggal_kembali}\n\nMohon penjemputan sesuai jadwal yang disepakati.`
            : `Assalamualaikum ${ortu}, izin pulang ananda *${s.nama}* *DITOLAK*.\n\nAlasan: ${catatan || 'tidak disebutkan'}\n\nSilakan hubungi pengasuh/pengurus pondok bila perlu.`
          waGateway.sendMessage(phone, pesan, req.tenantId).catch(() => {})
        }
      } catch { /* notif gagal tidak menggagalkan persetujuan */ }
    }
    res.json(db.prepare('SELECT * FROM izin_pulang WHERE id=?').get(req.params.id))
  })
}

module.exports = { setupPesantrenTables, registerPesantrenRoutes }
