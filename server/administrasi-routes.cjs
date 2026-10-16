// Route HTTP Menu Administrasi (surat-menyurat). Dipisah dari administrasi.cjs
// supaya inti (template + penomoran + render HTML) bisa diuji tanpa HTTP.
//
// Aturan:
//   - Semua route memakai req.tenantId (tidak ada tenant di-hardcode).
//   - Template surat boleh diedit admin; PDF/JPEG dirender dari HTML yang SAMA
//     (satu sumber tampilan) lewat renderer invoice.
//   - Data mentah dari klien tidak dipercaya; placeholder di-escape saat render.

const crypto = require('crypto')
const {
  setupAdministrasiTables, seedJenisBawaan, daftarJenis, barisJenis,
  nomorSuratBaru, buildSuratHtml,
} = require('./administrasi.cjs')
const { getTenantSettings } = require('./tenant-settings.cjs')
const invoiceService = require('./invoice-service.cjs')

function setupAdministrasi(db) {
  setupAdministrasiTables(db)
  const makeId = () => crypto.randomUUID()
  for (const { id } of db.prepare('SELECT id FROM tenants').all()) {
    try { seedJenisBawaan(db, id, makeId) } catch { /* lewati lembaga tanpa id valid */ }
  }
}

function registerAdministrasiRoutes(app, db, { requireRole }) {
  const ADMIN = requireRole('admin', 'super_admin', 'kepala', 'operator', 'tata_usaha', 'tu')

  const aman = (res, fn) => { try { fn() } catch (e) { res.status(400).json({ error: e.message }) } }
  const settingsTenant = (tid) => { try { return getTenantSettings(db, tid) || {} } catch { return {} } }
  const buatId = () => crypto.randomUUID()

  // Pastikan jenis bawaan ada untuk tenant ini (idempoten) — supaya lembaga baru
  // tetap punya template meski dibuat setelah setup awal.
  const jaminJenis = (tid) => { try { seedJenisBawaan(db, tid, buatId) } catch { /* noop */ } }

  function barisSurat(tid, id) {
    return db.prepare('SELECT * FROM surat_keluar WHERE id=? AND tenant_id=?').get(id, tid)
  }

  // ---- Jenis & template surat -------------------------------------------

  app.get('/api/administrasi/jenis', ADMIN, (req, res) => {
    aman(res, () => {
      jaminJenis(req.tenantId)
      res.json({ success: true, jenis: daftarJenis(db, req.tenantId) })
    })
  })

  app.post('/api/administrasi/jenis', ADMIN, (req, res) => {
    aman(res, () => {
      const { kode, nama, kategori, fields, template } = req.body || {}
      if (!kode || !nama) throw new Error('Kode dan nama jenis wajib')
      const id = buatId()
      db.prepare(`INSERT INTO surat_jenis (id, tenant_id, kode, nama, kategori, fields, template, aktif, urutan)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(id, req.tenantId, String(kode).trim(), String(nama).trim(), String(kategori || 'lainnya'),
          JSON.stringify(Array.isArray(fields) ? fields : []), String(template || ''), 1,
          Number(req.body?.urutan) || 99)
      res.json({ success: true, jenis: barisJenis(db.prepare('SELECT * FROM surat_jenis WHERE id=?').get(id)) })
    })
  })

  app.put('/api/administrasi/jenis/:id', ADMIN, (req, res) => {
    aman(res, () => {
      const row = db.prepare('SELECT * FROM surat_jenis WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
      if (!row) throw new Error('Jenis surat tidak ditemukan')
      const { nama, kategori, fields, template, aktif, urutan } = req.body || {}
      db.prepare(`UPDATE surat_jenis SET nama=?, kategori=?, fields=?, template=?, aktif=?, urutan=? WHERE id=? AND tenant_id=?`)
        .run(nama !== undefined ? String(nama) : row.nama,
          kategori !== undefined ? String(kategori) : row.kategori,
          fields !== undefined ? JSON.stringify(Array.isArray(fields) ? fields : []) : row.fields,
          template !== undefined ? String(template) : row.template,
          aktif !== undefined ? (aktif ? 1 : 0) : row.aktif,
          urutan !== undefined ? Number(urutan) : row.urutan,
          req.params.id, req.tenantId)
      res.json({ success: true, jenis: barisJenis(db.prepare('SELECT * FROM surat_jenis WHERE id=?').get(req.params.id)) })
    })
  })

  app.delete('/api/administrasi/jenis/:id', ADMIN, (req, res) => {
    aman(res, () => {
      const info = db.prepare('DELETE FROM surat_jenis WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
      res.json({ success: true, dihapus: info.changes })
    })
  })

  // ---- Surat keluar ------------------------------------------------------

  app.get('/api/administrasi/surat', ADMIN, (req, res) => {
    aman(res, () => {
      const kode = String(req.query.kode || '').trim()
      const q = String(req.query.q || '').trim()
      const limit = Math.min(Number(req.query.limit) || 100, 500)
      let sql = 'SELECT * FROM surat_keluar WHERE tenant_id=?'
      const args = [req.tenantId]
      if (kode) { sql += ' AND kode=?'; args.push(kode) }
      if (q) { sql += ' AND (nomor LIKE ? OR perihal LIKE ? OR kepada LIKE ?)'; args.push(`%${q}%`, `%${q}%`, `%${q}%`) }
      sql += ' ORDER BY datetime(created_at) DESC, rowid DESC LIMIT ?'
      args.push(limit)
      res.json({ success: true, surat: db.prepare(sql).all(...args) })
    })
  })

  app.post('/api/administrasi/surat', ADMIN, (req, res) => {
    aman(res, () => {
      const { jenis_id, jenis_kode, perihal, kepada, data, tanggal, penandatangan } = req.body || {}
      jaminJenis(req.tenantId)
      let jenis = null
      if (jenis_id) jenis = db.prepare('SELECT * FROM surat_jenis WHERE id=? AND tenant_id=?').get(jenis_id, req.tenantId)
      if (!jenis && jenis_kode) jenis = db.prepare('SELECT * FROM surat_jenis WHERE kode=? AND tenant_id=?').get(jenis_kode, req.tenantId)
      if (!jenis) throw new Error('Jenis surat tidak ditemukan')
      const tgl = String(tanggal || new Date().toISOString().slice(0, 10)).slice(0, 10)
      const nomor = nomorSuratBaru(db, req.tenantId, jenis.kode, tgl)
      const id = buatId()
      db.prepare(`INSERT INTO surat_keluar
        (id, tenant_id, jenis_id, kode, nomor, perihal, kepada, data, tanggal, penandatangan, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, req.tenantId, jenis.id, jenis.kode, nomor, String(perihal || jenis.nama),
          String(kepada || ''), JSON.stringify(data && typeof data === 'object' ? data : {}),
          tgl, String(penandatangan || ''), String(req.user?.id || ''))
      res.json({ success: true, surat: barisSurat(req.tenantId, id) })
    })
  })

  app.get('/api/administrasi/surat/:id', ADMIN, (req, res) => {
    aman(res, () => {
      const surat = barisSurat(req.tenantId, req.params.id)
      if (!surat) return res.status(404).json({ error: 'Surat tidak ditemukan' })
      const jenis = barisJenis(db.prepare('SELECT * FROM surat_jenis WHERE id=?').get(surat.jenis_id)) ||
        barisJenis(db.prepare('SELECT * FROM surat_jenis WHERE kode=? AND tenant_id=?').get(surat.kode, req.tenantId))
      const html = buildSuratHtml({ jenis, surat, settings: settingsTenant(req.tenantId) })
      res.json({ success: true, surat, jenis, html })
    })
  })

  app.get('/api/administrasi/surat/:id/pdf', ADMIN, async (req, res) => {
    try {
      const surat = barisSurat(req.tenantId, req.params.id)
      if (!surat) return res.status(404).json({ error: 'Surat tidak ditemukan' })
      const jenis = barisJenis(db.prepare('SELECT * FROM surat_jenis WHERE id=?').get(surat.jenis_id))
      const html = buildSuratHtml({ jenis, surat, settings: settingsTenant(req.tenantId) })
      const buf = await invoiceService.renderInvoicePdf(html)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="surat-${surat.nomor.replace(/[^a-zA-Z0-9]/g, '-')}.pdf"`)
      res.send(buf)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.get('/api/administrasi/surat/:id/jpeg', ADMIN, async (req, res) => {
    try {
      const surat = barisSurat(req.tenantId, req.params.id)
      if (!surat) return res.status(404).json({ error: 'Surat tidak ditemukan' })
      const jenis = barisJenis(db.prepare('SELECT * FROM surat_jenis WHERE id=?').get(surat.jenis_id))
      const html = buildSuratHtml({ jenis, surat, settings: settingsTenant(req.tenantId) })
      const buf = await invoiceService.renderInvoiceJpeg(html)
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Content-Disposition', `inline; filename="surat-${surat.nomor.replace(/[^a-zA-Z0-9]/g, '-')}.jpg"`)
      res.send(buf)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.delete('/api/administrasi/surat/:id', ADMIN, (req, res) => {
    aman(res, () => {
      const info = db.prepare('DELETE FROM surat_keluar WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
      res.json({ success: true, dihapus: info.changes })
    })
  })

  // ---- Rekap -------------------------------------------------------------

  app.get('/api/administrasi/rekap', ADMIN, (req, res) => {
    aman(res, () => {
      const perJenis = db.prepare(`SELECT kode, COUNT(*) AS jumlah FROM surat_keluar WHERE tenant_id=? GROUP BY kode`).all(req.tenantId)
      const total = db.prepare('SELECT COUNT(*) AS n FROM surat_keluar WHERE tenant_id=?').get(req.tenantId).n
      const bulanIni = db.prepare(`SELECT COUNT(*) AS n FROM surat_keluar WHERE tenant_id=? AND substr(tanggal,1,7)=?`)
        .get(req.tenantId, new Date().toISOString().slice(0, 7)).n
      res.json({ success: true, rekap: { total, bulan_ini: bulanIni, per_jenis: perJenis } })
    })
  })
}

module.exports = { setupAdministrasi, registerAdministrasiRoutes }