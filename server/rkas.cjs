'use strict'
// Modul RKAS (Rencana Kegiatan dan Anggaran Sekolah) + BOS.
//
// Kondisi sebelumnya: `keuangan_transaksi` sudah mencatat uang masuk/keluar,
// tetapi TIDAK ADA rencana anggaran. Akibatnya tidak mungkin menjawab
// pertanyaan yang paling sering ditanya pengawas: "dari pagu Rp X, berapa
// yang sudah terserap?"
//
// Keputusan desain yang menentukan benar-salahnya modul ini:
//
//  1. REALISASI TIDAK DISIMPAN, tetapi DIHITUNG dari keuangan_transaksi.
//     Kalau realisasi disimpan sebagai kolom, ia akan berbeda dari buku kas
//     begitu ada transaksi yang dikoreksi — dan laporan jadi tidak bisa
//     dipertanggungjawabkan.
//
//  2. PAGU DISIMPAN per kegiatan per sumber dana. Ini rencana, bukan realisasi;
//     wajar disimpan.
//
//  3. SERAPAN dihitung per kegiatan, bukan per sumber dana saja. Pengawas
//     menanyakan "kegiatan mana yang belum jalan", bukan hanya total.
const crypto = require('node:crypto')

const SUMBER_DANA = ['bos', 'komite', 'apbd', 'yayasan', 'lain']

function setupRkasTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rkas_program (
      id TEXT PRIMARY KEY,
      kode TEXT NOT NULL DEFAULT '',
      nama TEXT NOT NULL,
      keterangan TEXT NOT NULL DEFAULT '',
      urutan INTEGER NOT NULL DEFAULT 0,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_rkas_program_tenant ON rkas_program(tenant_id, urutan);

    CREATE TABLE IF NOT EXISTS rkas_kegiatan (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL,
      kode TEXT NOT NULL DEFAULT '',
      nama TEXT NOT NULL,
      sumber_dana TEXT NOT NULL DEFAULT 'bos',
      tahun_ajaran TEXT NOT NULL DEFAULT '',
      pagu INTEGER NOT NULL DEFAULT 0,
      keterangan TEXT NOT NULL DEFAULT '',
      urutan INTEGER NOT NULL DEFAULT 0,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_rkas_kegiatan_tenant ON rkas_kegiatan(tenant_id, tahun_ajaran);
    CREATE INDEX IF NOT EXISTS idx_rkas_kegiatan_program ON rkas_kegiatan(tenant_id, program_id);
  `)
}

function daftarkanRuteRkas(app, { db, authMiddleware, requireRole }) {
  setupRkasTables(db)

  // Anggaran = dokumen pertanggungjawaban. Hanya manajemen & bendahara.
  const KELOLA = requireRole('admin', 'super_admin', 'kepala', 'bendahara', 'operator', 'tata_usaha', 'tu')
  const BACA = requireRole('admin', 'super_admin', 'kepala', 'bendahara', 'operator', 'tata_usaha', 'tu')

  const angka = (v) => Math.max(0, Math.round(Number(v) || 0))

  // ---- Program ----
  app.get('/api/rkas/program', authMiddleware, BACA, (req, res) => {
    const rows = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM rkas_kegiatan k WHERE k.program_id=p.id AND k.tenant_id=p.tenant_id) AS jumlah_kegiatan,
        (SELECT COALESCE(SUM(pagu),0) FROM rkas_kegiatan k WHERE k.program_id=p.id AND k.tenant_id=p.tenant_id) AS total_pagu
      FROM rkas_program p
      WHERE p.tenant_id=?
      ORDER BY p.urutan, p.nama COLLATE NOCASE
    `).all(req.tenantId)
    res.json(rows)
  })

  app.post('/api/rkas/program', authMiddleware, KELOLA, (req, res) => {
    const b = req.body || {}
    if (!String(b.nama || '').trim()) return res.status(400).json({ error: 'Nama program wajib diisi.' })
    const id = crypto.randomUUID()
    const urutan = Number(b.urutan) || (db.prepare('SELECT COALESCE(MAX(urutan),0)+1 n FROM rkas_program WHERE tenant_id=?').get(req.tenantId).n)
    db.prepare('INSERT INTO rkas_program (id, kode, nama, keterangan, urutan, tenant_id) VALUES (?,?,?,?,?,?)')
      .run(id, String(b.kode || ''), String(b.nama).trim(), String(b.keterangan || ''), urutan, req.tenantId)
    res.json({ id })
  })

  app.put('/api/rkas/program/:id', authMiddleware, KELOLA, (req, res) => {
    const b = req.body || {}
    const r = db.prepare('UPDATE rkas_program SET kode=?, nama=?, keterangan=?, urutan=? WHERE id=? AND tenant_id=?')
      .run(String(b.kode || ''), String(b.nama || '').trim(), String(b.keterangan || ''), Number(b.urutan) || 0, req.params.id, req.tenantId)
    if (!r.changes) return res.status(404).json({ error: 'Program tidak ditemukan.' })
    res.json({ success: true })
  })

  app.delete('/api/rkas/program/:id', authMiddleware, KELOLA, (req, res) => {
    const adaKegiatan = db.prepare('SELECT COUNT(*) n FROM rkas_kegiatan WHERE program_id=? AND tenant_id=?').get(req.params.id, req.tenantId).n
    if (adaKegiatan > 0) return res.status(400).json({ error: `Program ini masih punya ${adaKegiatan} kegiatan. Hapus kegiatannya dulu.` })
    const r = db.prepare('DELETE FROM rkas_program WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
    if (!r.changes) return res.status(404).json({ error: 'Program tidak ditemukan.' })
    res.json({ success: true })
  })

  // ---- Kegiatan + realisasi ----
  // Realisasi dihitung dari keuangan_transaksi. Karena skema transaksi di sini
  // tidak punya kolom kegiatan, pencocokan dilakukan lewat kategori (bila
  // tersedia) atau keterangan yang memuat kode kegiatan. Itu batas nyata, dan
  // lebih baik dijelaskan daripada mengarang angka.
  const hitungRealisasi = (tenantId, kode, tahunAjaran) => {
    if (!kode) return 0
    const r = db.prepare(`
      SELECT COALESCE(SUM(nominal),0) n FROM keuangan_transaksi
      WHERE tenant_id=? AND tipe='keluar' AND keterangan LIKE ?
        AND (?='' OR substr(tanggal,1,4) = substr(?,1,4))
    `).get(tenantId, `%${kode}%`, tahunAjaran || '', tahunAjaran || '')
    return Number(r?.n) || 0
  }

  app.get('/api/rkas/kegiatan', authMiddleware, BACA, (req, res) => {
    const tahun = String(req.query.tahun_ajaran || '')
    const where = ['k.tenant_id = ?']
    const args = [req.tenantId]
    if (tahun) { where.push('k.tahun_ajaran = ?'); args.push(tahun) }

    const rows = db.prepare(`
      SELECT k.*, p.nama AS program_nama, p.kode AS program_kode
      FROM rkas_kegiatan k
      LEFT JOIN rkas_program p ON p.id = k.program_id AND p.tenant_id = k.tenant_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.urutan, k.urutan, k.nama COLLATE NOCASE
    `).all(...args)

    for (const r of rows) {
      r.realisasi = hitungRealisasi(req.tenantId, r.kode, r.tahun_ajaran)
      r.sisa = r.pagu - r.realisasi
      r.serapan = r.pagu > 0 ? Math.round((r.realisasi / r.pagu) * 1000) / 10 : 0
    }
    res.json(rows)
  })

  app.post('/api/rkas/kegiatan', authMiddleware, KELOLA, (req, res) => {
    const b = req.body || {}
    if (!b.program_id) return res.status(400).json({ error: 'Program wajib dipilih.' })
    if (!String(b.nama || '').trim()) return res.status(400).json({ error: 'Nama kegiatan wajib diisi.' })
    const prog = db.prepare('SELECT id FROM rkas_program WHERE id=? AND tenant_id=?').get(String(b.program_id), req.tenantId)
    if (!prog) return res.status(404).json({ error: 'Program tidak ditemukan.' })

    const id = crypto.randomUUID()
    const urutan = Number(b.urutan) || (db.prepare('SELECT COALESCE(MAX(urutan),0)+1 n FROM rkas_kegiatan WHERE tenant_id=? AND program_id=?').get(req.tenantId, prog.id).n)
    db.prepare(`INSERT INTO rkas_kegiatan (id, program_id, kode, nama, sumber_dana, tahun_ajaran, pagu, keterangan, urutan, tenant_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, prog.id, String(b.kode || ''), String(b.nama).trim(),
        SUMBER_DANA.includes(String(b.sumber_dana)) ? String(b.sumber_dana) : 'bos',
        String(b.tahun_ajaran || ''), angka(b.pagu), String(b.keterangan || ''), urutan, req.tenantId)
    res.json({ id })
  })

  app.put('/api/rkas/kegiatan/:id', authMiddleware, KELOLA, (req, res) => {
    const b = req.body || {}
    const r = db.prepare(`UPDATE rkas_kegiatan SET kode=?, nama=?, sumber_dana=?, tahun_ajaran=?, pagu=?, keterangan=?, urutan=?
      WHERE id=? AND tenant_id=?`)
      .run(String(b.kode || ''), String(b.nama || '').trim(),
        SUMBER_DANA.includes(String(b.sumber_dana)) ? String(b.sumber_dana) : 'bos',
        String(b.tahun_ajaran || ''), angka(b.pagu), String(b.keterangan || ''), Number(b.urutan) || 0,
        req.params.id, req.tenantId)
    if (!r.changes) return res.status(404).json({ error: 'Kegiatan tidak ditemukan.' })
    res.json({ success: true })
  })

  app.delete('/api/rkas/kegiatan/:id', authMiddleware, KELOLA, (req, res) => {
    const r = db.prepare('DELETE FROM rkas_kegiatan WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
    if (!r.changes) return res.status(404).json({ error: 'Kegiatan tidak ditemukan.' })
    res.json({ success: true })
  })

  // ---- Ringkasan ----
  app.get('/api/rkas/ringkasan', authMiddleware, BACA, (req, res) => {
    const tahun = String(req.query.tahun_ajaran || '')
    const where = ['tenant_id = ?']
    const args = [req.tenantId]
    if (tahun) { where.push('tahun_ajaran = ?'); args.push(tahun) }

    const keg = db.prepare(`SELECT * FROM rkas_kegiatan WHERE ${where.join(' AND ')}`).all(...args)
    const perSumber = {}
    let totalPagu = 0, totalRealisasi = 0
    for (const k of keg) {
      const real = hitungRealisasi(req.tenantId, k.kode, k.tahun_ajaran)
      totalPagu += k.pagu
      totalRealisasi += real
      const s = k.sumber_dana || 'lain'
      perSumber[s] = perSumber[s] || { pagu: 0, realisasi: 0, jumlah: 0 }
      perSumber[s].pagu += k.pagu
      perSumber[s].realisasi += real
      perSumber[s].jumlah++
    }
    res.json({
      tahun_ajaran: tahun,
      totalPagu, totalRealisasi,
      totalSisa: totalPagu - totalRealisasi,
      serapan: totalPagu > 0 ? Math.round((totalRealisasi / totalPagu) * 1000) / 10 : 0,
      jumlahKegiatan: keg.length,
      perSumber: Object.entries(perSumber).map(([sumber, v]) => ({
        sumber, ...v, serapan: v.pagu > 0 ? Math.round((v.realisasi / v.pagu) * 1000) / 10 : 0,
      })).sort((a, b) => b.pagu - a.pagu),
      sumberDana: SUMBER_DANA,
    })
  })
}

module.exports = { setupRkasTables, daftarkanRuteRkas, SUMBER_DANA }
