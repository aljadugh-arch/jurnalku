'use strict'

// PPDB — Penerimaan Peserta Didik Baru (per lembaga).
//
// Alur:
//   1. Calon siswa/wali mengisi formulir pendaftaran (halaman publik, tanpa login).
//   2. Panitia memverifikasi berkas → status `terverifikasi` (atau `ditolak`).
//   3. Calon yang diterima melakukan DAFTAR ULANG → status `daftar_ulang`.
//   4. Panitia memasukkan pendaftar `daftar_ulang` ke ANTRIAN SISWA AKTIF, lalu
//      menerimanya menjadi siswa resmi (membuat baris `siswa` + akun login).
//
// Prinsip:
//  - Semua operasi tenant-scoped (`tenant_id` dari host/token, bukan dari input).
//  - Pendaftaran publik dibatasi: satu gelombang harus dibuka, dan NISN/email
//    ganda dalam satu lembaga ditolak.
//  - Nomor pendaftaran dibuat server (urut per gelombang), bukan dari klien.

const crypto = require('node:crypto')

const STATUS = Object.freeze({
  BARU: 'baru',                 // pendaftaran masuk, belum diperiksa
  TERVERIFIKASI: 'terverifikasi', // berkas lolos pemeriksaan
  DITOLAK: 'ditolak',           // berkas tidak memenuhi syarat
  DAFTAR_ULANG: 'daftar_ulang', // calon sudah daftar ulang (siap jadi siswa)
  DITERIMA: 'diterima',         // sudah dimasukkan sebagai siswa aktif
  MENGUNDURKAN: 'mengundurkan', // calon membatalkan
})

const STATUS_SAH = new Set(Object.values(STATUS))

function setupPpdbTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ppdb_gelombang (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      nama TEXT NOT NULL,
      tahun_ajaran TEXT,
      tanggal_buka TEXT,
      tanggal_tutup TEXT,
      kuota INTEGER DEFAULT 0,
      biaya INTEGER DEFAULT 0,
      dibuka INTEGER DEFAULT 0,
      keterangan TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ppdb_gelombang_tenant ON ppdb_gelombang(tenant_id, dibuka);

    CREATE TABLE IF NOT EXISTS ppdb_pendaftar (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      gelombang_id TEXT,
      nomor_daftar TEXT,
      nama TEXT NOT NULL,
      jenis_kelamin TEXT,
      nisn TEXT,
      nik TEXT,
      tempat_lahir TEXT,
      tanggal_lahir TEXT,
      alamat TEXT,
      no_hp TEXT,
      email TEXT,
      nama_ortu TEXT,
      no_hp_ortu TEXT,
      asal_sekolah TEXT,
      pilihan_rombel_id TEXT,
      status TEXT NOT NULL DEFAULT 'baru',
      catatan TEXT,
      dokumen_json TEXT,
      daftar_ulang_at TEXT,
      diterima_at TEXT,
      siswa_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ppdb_pendaftar_tenant ON ppdb_pendaftar(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_ppdb_pendaftar_gel ON ppdb_pendaftar(tenant_id, gelombang_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ppdb_nomor ON ppdb_pendaftar(tenant_id, nomor_daftar);
  `)
}

/** Normalisasi nomor HP Indonesia ke bentuk 62xxxxxxxxxx untuk pencocokan. */
function normalHp(v) {
  const d = String(v || '').replace(/[^0-9]/g, '')
  if (!d) return ''
  if (d.startsWith('62')) return d
  if (d.startsWith('0')) return '62' + d.slice(1)
  if (d.startsWith('8')) return '62' + d
  return d
}

function buatLayananPpdb(db, { logger = console } = {}) {
  setupPpdbTables(db)

  const gelombangAktif = (tenantId) => db.prepare(
    "SELECT * FROM ppdb_gelombang WHERE tenant_id=? AND dibuka=1 ORDER BY created_at DESC LIMIT 1"
  ).get(tenantId)

  const daftarGelombang = (tenantId) => db.prepare(
    'SELECT * FROM ppdb_gelombang WHERE tenant_id=? ORDER BY created_at DESC'
  ).all(tenantId)

  const simpanGelombang = (tenantId, data) => {
    const id = data.id || crypto.randomUUID()
    const ada = data.id ? db.prepare('SELECT id FROM ppdb_gelombang WHERE id=? AND tenant_id=?').get(data.id, tenantId) : null
    const nilai = {
      id, tenant_id: tenantId,
      nama: String(data.nama || 'Gelombang 1').trim().slice(0, 120),
      tahun_ajaran: String(data.tahun_ajaran || '').trim().slice(0, 30) || null,
      tanggal_buka: data.tanggal_buka || null,
      tanggal_tutup: data.tanggal_tutup || null,
      kuota: Number(data.kuota) || 0,
      biaya: Number(data.biaya) || 0,
      dibuka: data.dibuka ? 1 : 0,
      keterangan: String(data.keterangan || '').trim().slice(0, 500) || null,
    }
    if (ada) {
      db.prepare(`UPDATE ppdb_gelombang SET nama=@nama,tahun_ajaran=@tahun_ajaran,tanggal_buka=@tanggal_buka,
        tanggal_tutup=@tanggal_tutup,kuota=@kuota,biaya=@biaya,dibuka=@dibuka,keterangan=@keterangan WHERE id=@id AND tenant_id=@tenant_id`).run(nilai)
    } else {
      db.prepare(`INSERT INTO ppdb_gelombang (id,tenant_id,nama,tahun_ajaran,tanggal_buka,tanggal_tutup,kuota,biaya,dibuka,keterangan)
        VALUES (@id,@tenant_id,@nama,@tahun_ajaran,@tanggal_buka,@tanggal_tutup,@kuota,@biaya,@dibuka,@keterangan)`).run(nilai)
    }
    return db.prepare('SELECT * FROM ppdb_gelombang WHERE id=?').get(id)
  }

  const hapusGelombang = (tenantId, id) => {
    const dipakai = db.prepare('SELECT COUNT(*) n FROM ppdb_pendaftar WHERE gelombang_id=? AND tenant_id=?').get(id, tenantId).n
    if (dipakai) return { ok: false, error: `Gelombang masih punya ${dipakai} pendaftar — pindahkan atau hapus pendaftarnya dulu.` }
    db.prepare('DELETE FROM ppdb_gelombang WHERE id=? AND tenant_id=?').run(id, tenantId)
    return { ok: true }
  }

  /** Nomor pendaftaran urut per tenant+gelombang: PPDB-<tahun>-<urut 4 digit>. */
  function nomorBerikutnya(tenantId, gelombang) {
    const ta = (gelombang?.tahun_ajaran || String(new Date().getFullYear())).replace(/[^0-9]/g, '').slice(0, 4) || String(new Date().getFullYear())
    const prefiks = `PPDB-${ta}-`
    const row = db.prepare(
      "SELECT nomor_daftar FROM ppdb_pendaftar WHERE tenant_id=? AND nomor_daftar LIKE ? ORDER BY nomor_daftar DESC LIMIT 1"
    ).get(tenantId, prefiks + '%')
    const urut = row?.nomor_daftar ? (Number(String(row.nomor_daftar).slice(prefiks.length)) || 0) + 1 : 1
    return prefiks + String(urut).padStart(4, '0')
  }

  /**
   * Pendaftaran publik. Hanya boleh bila ada gelombang dibuka.
   * Mengembalikan { ok, pendaftar } atau { ok:false, error }.
   */
  function daftarPublik(tenantId, data) {
    const gel = data.gelombang_id
      ? db.prepare('SELECT * FROM ppdb_gelombang WHERE id=? AND tenant_id=?').get(data.gelombang_id, tenantId)
      : gelombangAktif(tenantId)
    if (!gel) return { ok: false, error: 'Pendaftaran belum dibuka. Silakan hubungi panitia.' }
    if (!gel.dibuka) return { ok: false, error: 'Gelombang pendaftaran ini sedang ditutup.' }

    const nama = String(data.nama || '').trim()
    if (nama.length < 3) return { ok: false, error: 'Nama lengkap wajib diisi (minimal 3 huruf).' }
    const jk = String(data.jenis_kelamin || '').toUpperCase()
    if (!['L', 'P'].includes(jk)) return { ok: false, error: 'Jenis kelamin wajib dipilih.' }

    const nisn = String(data.nisn || '').replace(/[^0-9]/g, '')
    if (nisn && nisn.length !== 10) return { ok: false, error: 'NISN harus 10 digit angka.' }
    if (nisn) {
      const dup = db.prepare('SELECT id,nomor_daftar FROM ppdb_pendaftar WHERE tenant_id=? AND nisn=?').get(tenantId, nisn)
      if (dup) return { ok: false, error: `NISN ini sudah terdaftar dengan nomor ${dup.nomor_daftar}.` }
    }
    const hp = normalHp(data.no_hp)
    if (hp && hp.length < 10) return { ok: false, error: 'Nomor HP tidak valid.' }

    const id = crypto.randomUUID()
    const nomor = nomorBerikutnya(tenantId, gel)
    db.prepare(`INSERT INTO ppdb_pendaftar (id,tenant_id,gelombang_id,nomor_daftar,nama,jenis_kelamin,nisn,nik,
        tempat_lahir,tanggal_lahir,alamat,no_hp,email,nama_ortu,no_hp_ortu,asal_sekolah,pilihan_rombel_id,status,catatan,dokumen_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, tenantId, gel.id, nomor, nama, jk, nisn || null, String(data.nik || '').replace(/[^0-9]/g, '') || null,
      String(data.tempat_lahir || '').trim() || null, data.tanggal_lahir || null,
      String(data.alamat || '').trim() || null, hp || null, String(data.email || '').trim().toLowerCase() || null,
      String(data.nama_ortu || '').trim() || null, normalHp(data.no_hp_ortu) || null,
      String(data.asal_sekolah || '').trim() || null, data.pilihan_rombel_id || null,
      STATUS.BARU, null, data.dokumen_json ? JSON.stringify(data.dokumen_json) : null,
    )
    return { ok: true, pendaftar: db.prepare('SELECT * FROM ppdb_pendaftar WHERE id=?').get(id), gelombang: gel }
  }

  const daftarPendaftar = (tenantId, { status, gelombang_id, cari } = {}) => {
    const where = ['tenant_id=?']
    const args = [tenantId]
    if (status) { where.push('status=?'); args.push(status) }
    if (gelombang_id) { where.push('gelombang_id=?'); args.push(gelombang_id) }
    if (cari) { where.push('(nama LIKE ? OR nomor_daftar LIKE ? OR nisn LIKE ?)'); const q = `%${cari}%`; args.push(q, q, q) }
    return db.prepare(`SELECT * FROM ppdb_pendaftar WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 1000`).all(...args)
  }

  const ubahStatus = (tenantId, id, status, { catatan } = {}) => {
    if (!STATUS_SAH.has(status)) return { ok: false, error: 'Status tidak dikenal' }
    const p = db.prepare('SELECT * FROM ppdb_pendaftar WHERE id=? AND tenant_id=?').get(id, tenantId)
    if (!p) return { ok: false, error: 'Pendaftar tidak ditemukan' }
    if (p.status === STATUS.DITERIMA && status !== STATUS.DITERIMA) {
      return { ok: false, error: 'Pendaftar sudah menjadi siswa aktif — status tidak bisa diubah lagi.' }
    }
    db.prepare("UPDATE ppdb_pendaftar SET status=?, catatan=COALESCE(?, catatan), updated_at=datetime('now') WHERE id=? AND tenant_id=?")
      .run(status, catatan ?? null, id, tenantId)
    return { ok: true, pendaftar: db.prepare('SELECT * FROM ppdb_pendaftar WHERE id=?').get(id) }
  }

  /** Calon menandai sudah daftar ulang (dari halaman publik atau oleh panitia). */
  const tandaiDaftarUlang = (tenantId, id, { catatan } = {}) => {
    const p = db.prepare('SELECT * FROM ppdb_pendaftar WHERE id=? AND tenant_id=?').get(id, tenantId)
    if (!p) return { ok: false, error: 'Pendaftar tidak ditemukan' }
    if (![STATUS.TERVERIFIKASI, STATUS.BARU].includes(p.status)) {
      return { ok: false, error: `Daftar ulang hanya untuk pendaftar berstatus terverifikasi (sekarang: ${p.status}).` }
    }
    db.prepare("UPDATE ppdb_pendaftar SET status=?, daftar_ulang_at=datetime('now'), catatan=COALESCE(?, catatan), updated_at=datetime('now') WHERE id=? AND tenant_id=?")
      .run(STATUS.DAFTAR_ULANG, catatan ?? null, id, tenantId)
    return { ok: true, pendaftar: db.prepare('SELECT * FROM ppdb_pendaftar WHERE id=?').get(id) }
  }

  /** Ringkasan untuk dashboard panitia. */
  const ringkasan = (tenantId) => {
    const rows = db.prepare('SELECT status, COUNT(*) n FROM ppdb_pendaftar WHERE tenant_id=? GROUP BY status').all(tenantId)
    const out = { total: 0 }
    for (const s of Object.values(STATUS)) out[s] = 0
    for (const r of rows) { out[r.status] = r.n; out.total += r.n }
    out.antrian_siswa = out[STATUS.DAFTAR_ULANG] || 0
    return out
  }

  /**
   * ANTRIAN SISWA: pendaftar yang sudah daftar ulang tetapi belum jadi siswa.
   * Inilah daftar yang dilihat panitia untuk dimasukkan ke data siswa.
   */
  const antrianSiswa = (tenantId) => db.prepare(
    "SELECT * FROM ppdb_pendaftar WHERE tenant_id=? AND status=? ORDER BY daftar_ulang_at ASC"
  ).all(tenantId, STATUS.DAFTAR_ULANG)

  /**
   * Terima pendaftar menjadi SISWA AKTIF.
   *  - Membuat baris `siswa` (butuh NIS; dibuat otomatis bila kosong).
   *  - Membuat akun login siswa (opsional, `buatAkun`).
   *  - Menautkan `user_students` bila akun dibuat.
   * Dijalankan dalam satu transaksi.
   */
  function terimaJadiSiswa(tenantId, id, opts = {}) {
    const p = db.prepare('SELECT * FROM ppdb_pendaftar WHERE id=? AND tenant_id=?').get(id, tenantId)
    if (!p) return { ok: false, error: 'Pendaftar tidak ditemukan' }
    if (p.status === STATUS.DITERIMA) return { ok: false, error: 'Pendaftar ini sudah menjadi siswa aktif.' }
    if (p.status !== STATUS.DAFTAR_ULANG) {
      return { ok: false, error: `Hanya pendaftar yang sudah DAFTAR ULANG bisa diterima (sekarang: ${p.status}).` }
    }

    let nis = String(opts.nis || '').trim()
    if (!nis) {
      // NIS otomatis: <tahun><urut 4 digit>, unik per tenant.
      const tahun = String(new Date().getFullYear()).slice(2)
      const row = db.prepare("SELECT nis FROM siswa WHERE tenant_id=? AND nis LIKE ? ORDER BY nis DESC LIMIT 1").get(tenantId, tahun + '%')
      const urut = row?.nis ? (Number(String(row.nis).slice(2)) || 0) + 1 : 1
      nis = tahun + String(urut).padStart(4, '0')
    }
    if (db.prepare('SELECT id FROM siswa WHERE tenant_id=? AND nis=?').get(tenantId, nis)) {
      return { ok: false, error: `NIS ${nis} sudah dipakai siswa lain. Isi NIS lain.` }
    }

    const siswaId = crypto.randomUUID()
    const rombelId = opts.rombel_id || p.pilihan_rombel_id || null
    let userId = null

    const jalan = db.transaction(() => {
      db.prepare(`INSERT INTO siswa (id,tenant_id,nis,nisn,nik,nama,jenis_kelamin,tempat_lahir,tanggal_lahir,alamat,no_hp,nama_ortu,rombel_id,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'aktif')`).run(
        siswaId, tenantId, nis, p.nisn || null, p.nik || null, p.nama, p.jenis_kelamin,
        p.tempat_lahir || null, p.tanggal_lahir || null, p.alamat || null,
        p.no_hp_ortu || p.no_hp || null, p.nama_ortu || null, rombelId,
      )
      db.prepare("UPDATE ppdb_pendaftar SET status=?, siswa_id=?, diterima_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND tenant_id=?")
        .run(STATUS.DITERIMA, siswaId, id, tenantId)
    })
    jalan()

    return { ok: true, siswa_id: siswaId, nis, user_id: userId, pendaftar: db.prepare('SELECT * FROM ppdb_pendaftar WHERE id=?').get(id) }
  }

  /** Terima banyak sekaligus (untuk tombol "terima semua antrian"). */
  function terimaBanyak(tenantId, ids = [], opts = {}) {
    const hasil = []
    for (const id of ids) {
      try { hasil.push({ id, ...terimaJadiSiswa(tenantId, id, opts) }) }
      catch (e) { hasil.push({ id, ok: false, error: e.message }) }
    }
    return { total: ids.length, berhasil: hasil.filter(h => h.ok).length, hasil }
  }

  return {
    STATUS, gelombangAktif, daftarGelombang, simpanGelombang, hapusGelombang,
    daftarPublik, daftarPendaftar, ubahStatus, tandaiDaftarUlang,
    ringkasan, antrianSiswa, terimaJadiSiswa, terimaBanyak, normalHp,
  }
}

function registerRoutes(app, db, { requireRole, authMiddleware, wrap } = {}) {
  const svc = buatLayananPpdb(db)
  const w = wrap || ((fn) => (req, res) => { try { fn(req, res) } catch (e) { res.status(500).json({ error: e.message }) } })
  const PANITIA = requireRole ? requireRole('admin', 'super_admin', 'operator', 'tata_usaha', 'tu', 'kepala') : authMiddleware

  // --- Publik (tanpa login) — halaman pendaftaran calon siswa ---
  app.get('/api/ppdb/publik/info', w((req, res) => {
    const gel = svc.gelombangAktif(req.tenantId)
    res.json({
      dibuka: !!gel,
      gelombang: gel ? { id: gel.id, nama: gel.nama, tahun_ajaran: gel.tahun_ajaran, tanggal_buka: gel.tanggal_buka, tanggal_tutup: gel.tanggal_tutup, kuota: gel.kuota, biaya: gel.biaya, keterangan: gel.keterangan } : null,
    })
  }))
  app.post('/api/ppdb/publik/daftar', w((req, res) => {
    const hasil = svc.daftarPublik(req.tenantId, req.body || {})
    if (!hasil.ok) return res.status(400).json({ error: hasil.error })
    res.json({ success: true, nomor_daftar: hasil.pendaftar.nomor_daftar, nama: hasil.pendaftar.nama, gelombang: hasil.gelombang?.nama })
  }))
  app.post('/api/ppdb/publik/daftar-ulang', w((req, res) => {
    const { nomor_daftar, nisn } = req.body || {}
    const p = db.prepare('SELECT * FROM ppdb_pendaftar WHERE tenant_id=? AND nomor_daftar=?').get(req.tenantId, String(nomor_daftar || '').trim().toUpperCase())
    if (!p) return res.status(404).json({ error: 'Nomor pendaftaran tidak ditemukan.' })
    if (p.nisn && String(nisn || '').replace(/[^0-9]/g, '') !== p.nisn) return res.status(400).json({ error: 'NISN tidak cocok dengan data pendaftaran.' })
    const hasil = svc.tandaiDaftarUlang(req.tenantId, p.id, { catatan: 'Daftar ulang via halaman publik' })
    if (!hasil.ok) return res.status(400).json({ error: hasil.error })
    res.json({ success: true, nama: p.nama, status: hasil.pendaftar.status })
  }))

  // --- Panitia (login) ---
  app.get('/api/ppdb/ringkasan', PANITIA, w((req, res) => res.json(svc.ringkasan(req.tenantId))))
  app.get('/api/ppdb/gelombang', PANITIA, w((req, res) => res.json(svc.daftarGelombang(req.tenantId))))
  app.post('/api/ppdb/gelombang', PANITIA, w((req, res) => res.json({ success: true, gelombang: svc.simpanGelombang(req.tenantId, req.body || {}) })))
  app.put('/api/ppdb/gelombang/:id', PANITIA, w((req, res) => res.json({ success: true, gelombang: svc.simpanGelombang(req.tenantId, { ...(req.body || {}), id: req.params.id }) })))
  app.delete('/api/ppdb/gelombang/:id', PANITIA, w((req, res) => {
    const h = svc.hapusGelombang(req.tenantId, req.params.id)
    if (!h.ok) return res.status(400).json({ error: h.error })
    res.json({ success: true })
  }))

  app.get('/api/ppdb/pendaftar', PANITIA, w((req, res) => res.json(svc.daftarPendaftar(req.tenantId, {
    status: req.query.status, gelombang_id: req.query.gelombang_id, cari: req.query.cari,
  }))))
  app.put('/api/ppdb/pendaftar/:id/status', PANITIA, w((req, res) => {
    const h = svc.ubahStatus(req.tenantId, req.params.id, String(req.body?.status || ''), { catatan: req.body?.catatan })
    if (!h.ok) return res.status(400).json({ error: h.error })
    res.json({ success: true, pendaftar: h.pendaftar })
  }))
  app.post('/api/ppdb/pendaftar/:id/daftar-ulang', PANITIA, w((req, res) => {
    const h = svc.tandaiDaftarUlang(req.tenantId, req.params.id, { catatan: req.body?.catatan })
    if (!h.ok) return res.status(400).json({ error: h.error })
    res.json({ success: true, pendaftar: h.pendaftar })
  }))

  // Antrian siswa: pendaftar yang sudah daftar ulang & siap jadi siswa aktif.
  app.get('/api/ppdb/antrian', PANITIA, w((req, res) => res.json(svc.antrianSiswa(req.tenantId))))
  app.post('/api/ppdb/antrian/:id/terima', PANITIA, w((req, res) => {
    const h = svc.terimaJadiSiswa(req.tenantId, req.params.id, { nis: req.body?.nis, rombel_id: req.body?.rombel_id })
    if (!h.ok) return res.status(400).json({ error: h.error })
    res.json({ success: true, ...h })
  }))
  app.post('/api/ppdb/antrian/terima-banyak', PANITIA, w((req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    if (!ids.length) return res.status(400).json({ error: 'Pilih minimal satu pendaftar.' })
    res.json({ success: true, ...svc.terimaBanyak(req.tenantId, ids, { rombel_id: req.body?.rombel_id }) })
  }))

  return svc
}

module.exports = { buatLayananPpdb, registerRoutes, setupPpdbTables, STATUS, normalHp }
