// Route HTTP Program Belajar & Level (lembaga nonformal: kursus/bimbel/sanggar).
// Dipisah dari program-belajar.cjs supaya inti (validasi, daftar, seed) bisa
// diuji tanpa HTTP.
//
// Aturan:
//   - Tenant-scoped lewat req.tenantId.
//   - Admin lembaga boleh tambah/ubah/hapus (tanpa deploy).
//   - Nama program unik per lembaga, nama level unik per program.
//   - Hapus program menghapus levelnya juga.

const crypto = require('crypto')
const {
  setupProgramBelajarTables, seedProgramBawaan, normalizeProgramInput,
  normalizeLevelInput, daftarProgram,
} = require('./program-belajar.cjs')

function setupProgramBelajar(db) {
  setupProgramBelajarTables(db)
  const makeId = () => crypto.randomUUID()
  // `settings.jenjang` bisa belum ada (DB baru/parsial, atau DB uji yang hanya
  // memuat sebagian skema). Kolom hilang tidak boleh menggagalkan boot — seed
  // paket bawaan hanya kemudahan, bukan jalur kritis.
  let adaJenjang = false
  try {
    adaJenjang = db.prepare("SELECT COUNT(*) c FROM pragma_table_info('settings') WHERE name='jenjang'").get().c > 0
  } catch { adaJenjang = false }

  let tenantIds = []
  try {
    tenantIds = adaJenjang
      ? db.prepare(`SELECT t.id, COALESCE(s.jenjang,'') jenjang FROM tenants t
          LEFT JOIN settings s ON s.tenant_id = t.id`).all()
      : db.prepare("SELECT id, '' AS jenjang FROM tenants").all()
  } catch { tenantIds = [] }

  // Paket bawaan hanya untuk lembaga nonformal. Sekolah formal tetap memakai
  // mapel/rombel — menanam program kursus di sana hanya mengotori datanya.
  for (const { id, jenjang } of tenantIds) {
    const j = String(jenjang || '').toUpperCase()
    if (j === 'NF' || j.includes('NONFORMAL') || j.includes('NON-FORMAL') || j.includes('KURSUS')) {
      try { seedProgramBawaan(db, id, makeId) } catch { /* lewati lembaga tanpa id valid */ }
    }
  }
}

function registerProgramBelajarRoutes(app, db, { requireRole }) {
  const KELOLA = requireRole('admin', 'super_admin')
  const LIHAT = requireRole('admin', 'super_admin', 'kepala', 'operator', 'tata_usaha', 'guru', 'wali_kelas')

  const aman = (res, fn) => { try { fn() } catch (e) { res.status(400).json({ error: e.message }) } }
  const buatId = () => crypto.randomUUID()

  /** Apakah jenjang lembaga ini nonformal (kursus/bimbel/sanggar/diklat)? */
  function jenjangNonformal(tenantId) {
    try {
      const row = db.prepare("SELECT COALESCE(jenjang,'') jenjang FROM settings WHERE tenant_id=?").get(tenantId)
      const j = String(row?.jenjang || '').trim().toUpperCase()
      return j === 'NF' || j.includes('NONFORMAL') || j.includes('NON-FORMAL') || j.includes('KURSUS') || j.includes('DIKLAT') || j.includes(' BIMBEL') || j === 'BIMBEL'
    } catch { return false }
  }

  // Modul ini HANYA untuk lembaga nonformal. Sekolah formal memakai mapel +
  // rombel; membiarkan mereka membuka Program Belajar hanya membingungkan dan
  // mengotori data. Gerbang ini melindungi SEMUA route (termasuk GET), bukan
  // hanya seed — jadi sekolah formal tidak bisa membuka halaman/menunya.
  function hanyaNonformal(req, res, next) {
    if (!jenjangNonformal(req.tenantId)) {
      return res.status(403).json({
        error: 'Program Belajar hanya tersedia untuk lembaga nonformal (kursus, bimbel, sanggar, diklat). Sekolah formal memakai Mata Pelajaran & Rombongan Belajar.',
        code: 'NONFORMAL_ONLY',
      })
    }
    next()
  }

  // Lembaga yang BARU diset jenjang nonformal di Pengaturan belum punya paket
  // bawaan sampai server di-restart. Seed malas di GET menutup celah itu tanpa
  // memaksa restart; penanda `program_belajar_seed` menjaga agar hanya sekali.
  function seedJikaPerlu(tenantId) {
    if (!tenantId) return
    try {
      const sudah = db.prepare('SELECT tenant_id FROM program_belajar_seed WHERE tenant_id=?').get(tenantId)
      if (sudah) return
      if (jenjangNonformal(tenantId)) seedProgramBawaan(db, tenantId, buatId)
    } catch { /* kolom/tenant hilang → lewati, ini hanya kemudahan */ }
  }

  // ---- Program -----------------------------------------------------------

  app.get('/api/program-belajar', LIHAT, hanyaNonformal, (req, res) => {
    aman(res, () => {
      seedJikaPerlu(req.tenantId)
      res.json({ success: true, program: daftarProgram(db, req.tenantId) })
    })
  })

  app.post('/api/program-belajar', KELOLA, hanyaNonformal, (req, res) => {
    aman(res, () => {
      const nilai = normalizeProgramInput(req.body || {})
      const duplikat = db.prepare('SELECT id FROM program_belajar WHERE tenant_id=? AND lower(nama)=lower(?)').get(req.tenantId, nilai.nama)
      if (duplikat) throw new Error(`Program "${nilai.nama}" sudah ada`)
      const id = buatId()
      const urutan = nilai.urutan || (db.prepare('SELECT COALESCE(MAX(urutan),0)+1 AS n FROM program_belajar WHERE tenant_id=?').get(req.tenantId).n)
      db.prepare(`INSERT INTO program_belajar
        (id, tenant_id, nama, deskripsi, kategori, durasi_pertemuan, aktif, urutan) VALUES (?,?,?,?,?,?,?,?)`)
        .run(id, req.tenantId, nilai.nama, nilai.deskripsi, nilai.kategori, nilai.durasi_pertemuan, nilai.aktif, urutan)
      const row = db.prepare('SELECT * FROM program_belajar WHERE id=?').get(id)
      res.json({ success: true, program: { ...row, levels: [] } })
    })
  })

  app.put('/api/program-belajar/:id', KELOLA, hanyaNonformal, (req, res) => {
    aman(res, () => {
      const row = db.prepare('SELECT * FROM program_belajar WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
      if (!row) throw new Error('Program tidak ditemukan')
      const nilai = normalizeProgramInput({ ...row, ...req.body })
      const duplikat = db.prepare('SELECT id FROM program_belajar WHERE tenant_id=? AND lower(nama)=lower(?) AND id<>?')
        .get(req.tenantId, nilai.nama, row.id)
      if (duplikat) throw new Error(`Program "${nilai.nama}" sudah ada`)
      db.prepare(`UPDATE program_belajar SET nama=?, deskripsi=?, kategori=?, durasi_pertemuan=?, aktif=?, urutan=?,
        updated_at=datetime('now') WHERE id=? AND tenant_id=?`)
        .run(nilai.nama, nilai.deskripsi, nilai.kategori, nilai.durasi_pertemuan, nilai.aktif, nilai.urutan, row.id, req.tenantId)
      res.json({ success: true })
    })
  })

  app.delete('/api/program-belajar/:id', KELOLA, hanyaNonformal, (req, res) => {
    aman(res, () => {
      const row = db.prepare('SELECT id FROM program_belajar WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
      if (!row) throw new Error('Program tidak ditemukan')
      const jalankan = db.transaction(() => {
        db.prepare('DELETE FROM program_level WHERE tenant_id=? AND program_id=?').run(req.tenantId, row.id)
        db.prepare('DELETE FROM program_belajar WHERE id=? AND tenant_id=?').run(row.id, req.tenantId)
      })
      jalankan()
      res.json({ success: true })
    })
  })

  // ---- Level / grade -----------------------------------------------------

  app.post('/api/program-belajar/:id/level', KELOLA, hanyaNonformal, (req, res) => {
    aman(res, () => {
      const program = db.prepare('SELECT id FROM program_belajar WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
      if (!program) throw new Error('Program tidak ditemukan')
      const nilai = normalizeLevelInput(req.body || {})
      const duplikat = db.prepare('SELECT id FROM program_level WHERE program_id=? AND lower(nama)=lower(?)').get(program.id, nilai.nama)
      if (duplikat) throw new Error(`Level "${nilai.nama}" sudah ada di program ini`)
      const id = buatId()
      const urutan = nilai.urutan || (db.prepare('SELECT COALESCE(MAX(urutan),0)+1 AS n FROM program_level WHERE program_id=?').get(program.id).n)
      db.prepare(`INSERT INTO program_level
        (id, tenant_id, program_id, nama, grade, deskripsi, urutan) VALUES (?,?,?,?,?,?,?)`)
        .run(id, req.tenantId, program.id, nilai.nama, nilai.grade, nilai.deskripsi, urutan)
      res.json({ success: true, level: db.prepare('SELECT * FROM program_level WHERE id=?').get(id) })
    })
  })

  app.put('/api/program-level/:id', KELOLA, hanyaNonformal, (req, res) => {
    aman(res, () => {
      const row = db.prepare('SELECT * FROM program_level WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
      if (!row) throw new Error('Level tidak ditemukan')
      const nilai = normalizeLevelInput({ ...row, ...req.body })
      const duplikat = db.prepare('SELECT id FROM program_level WHERE program_id=? AND lower(nama)=lower(?) AND id<>?')
        .get(row.program_id, nilai.nama, row.id)
      if (duplikat) throw new Error(`Level "${nilai.nama}" sudah ada di program ini`)
      db.prepare(`UPDATE program_level SET nama=?, grade=?, deskripsi=?, urutan=?, updated_at=datetime('now')
        WHERE id=? AND tenant_id=?`)
        .run(nilai.nama, nilai.grade, nilai.deskripsi, nilai.urutan, row.id, req.tenantId)
      res.json({ success: true })
    })
  })

  app.delete('/api/program-level/:id', KELOLA, hanyaNonformal, (req, res) => {
    aman(res, () => {
      const info = db.prepare('DELETE FROM program_level WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
      if (!info.changes) throw new Error('Level tidak ditemukan')
      res.json({ success: true })
    })
  })
}

module.exports = { setupProgramBelajar, registerProgramBelajarRoutes }
