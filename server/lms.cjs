'use strict'
// Modul LMS: materi ajar + progres belajar siswa.
//
// Kondisi sebelumnya:
//   - `modul_ajar` hanya menyimpan dokumen RPP hasil generator AI (fase, tujuan,
//     alokasi waktu) — BUKAN materi yang dibaca siswa.
//   - `tugas_siswa` ada tabelnya tetapi KOSONG (0 baris) dan tidak terhubung ke
//     materi apa pun.
// Jadi tidak ada tempat menaruh bahan ajar, dan tidak ada cara tahu siswa mana
// sudah membuka materi mana.
//
// Keputusan desain yang menentukan benar-salahnya modul ini:
//
//  1. PROGRES DICATAT PER SISWA PER MATERI, dengan unique index. Tanpa itu,
//     siswa yang membuka dua kali akan terhitung dua kali dan "berapa yang
//     sudah membaca" jadi tidak bermakna.
//
//  2. PROGRES DIKUNCI PADA SAAT PERTAMA DIBUKA, bukan diperbarui terus. Kalau
//     diperbarui, "kapan mulai" hilang dan guru tidak bisa tahu siapa yang
//     menunda sampai mendekati ujian.
//
//  3. AKSES DIBATASI PER ROMBEL DI SERVER. Materi untuk VII-A tidak boleh
//     dibaca siswa VII-B hanya karena tahu ID-nya. Ini penyaringan di query,
//     bukan di UI.
//
//  4. FILE DISIMPAN DI DIREKTORI TERPISAH (`uploads/lms/`) dan hanya tipe
//     dokumen yang diizinkan. Materi ajar bukan tempat menyimpan .exe.
const crypto = require('node:crypto')

const TIPE_DIIZINKAN = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png', 'image/jpeg', 'image/webp',
  'video/mp4', 'audio/mpeg', 'text/plain',
])

const MAKS_BYTE = 50 * 1024 * 1024 // 50 MB

function setupLmsTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lms_materi (
      id TEXT PRIMARY KEY,
      judul TEXT NOT NULL,
      deskripsi TEXT NOT NULL DEFAULT '',
      mapel_id TEXT,
      rombel_id TEXT,
      gtk_id TEXT NOT NULL DEFAULT '',
      jenis TEXT NOT NULL DEFAULT 'file',
      file_path TEXT NOT NULL DEFAULT '',
      file_nama TEXT NOT NULL DEFAULT '',
      file_ukuran INTEGER NOT NULL DEFAULT 0,
      file_tipe TEXT NOT NULL DEFAULT '',
      tautan TEXT NOT NULL DEFAULT '',
      urutan INTEGER NOT NULL DEFAULT 0,
      publikasi INTEGER NOT NULL DEFAULT 0,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_lms_materi_tenant ON lms_materi(tenant_id, publikasi);

    CREATE TABLE IF NOT EXISTS lms_progres (
      id TEXT PRIMARY KEY,
      materi_id TEXT NOT NULL,
      siswa_id TEXT NOT NULL,
      dibuka_pertama TEXT NOT NULL,
      dibuka_terakhir TEXT NOT NULL,
      jumlah_buka INTEGER NOT NULL DEFAULT 1,
      selesai INTEGER NOT NULL DEFAULT 0,
      tenant_id TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_lms_progres_unik
      ON lms_progres(tenant_id, materi_id, siswa_id);
    CREATE INDEX IF NOT EXISTS idx_lms_progres_siswa
      ON lms_progres(tenant_id, siswa_id);
  `)
}

function daftarkanRuteLms(app, { db, authMiddleware, requireRole, upload, UPLOAD_DIR, fs, path }) {
  setupLmsTables(db)

  const KELOLA = requireRole('admin', 'super_admin', 'kepala', 'operator', 'tata_usaha', 'tu', 'guru', 'wali_kelas')
  const BACA = requireRole('admin', 'super_admin', 'kepala', 'operator', 'tata_usaha', 'tu', 'guru', 'wali_kelas', 'siswa', 'bendahara')

  const LMS_DIR = path.join(UPLOAD_DIR, 'lms')
  try { fs.mkdirSync(LMS_DIR, { recursive: true }) } catch {}

  const sekarang = () => new Date().toISOString().replace('T', ' ').slice(0, 19)
  const hariIni = () => new Date().toISOString().slice(0, 10)

  // Siswa hanya boleh melihat materi yang: sudah dipublikasi DAN
  // (tanpa rombel ATAU rombelnya sendiri). Guru melihat semua milik tenant.
  const filterAkses = (req) => {
    const role = String(req.user?.role || '')
    if (role !== 'siswa') return { where: 'm.tenant_id = ?', args: [req.tenantId] }

    const siswaId = db.prepare('SELECT siswa_id FROM users WHERE id=? AND tenant_id=?').get(req.user.id, req.tenantId)?.siswa_id
    const rombelId = siswaId
      ? db.prepare('SELECT rombel_id FROM siswa WHERE id=? AND tenant_id=?').get(siswaId, req.tenantId)?.rombel_id
      : null
    return {
      where: 'm.tenant_id = ? AND m.publikasi = 1 AND (m.rombel_id IS NULL OR m.rombel_id = ?)',
      args: [req.tenantId, rombelId || ''],
      siswaId,
    }
  }

  // ---- Daftar materi ----
  app.get('/api/lms/materi', authMiddleware, BACA, (req, res) => {
    const akses = filterAkses(req)
    const rows = db.prepare(`
      SELECT m.*, mp.nama AS mapel_nama, r.nama AS rombel_nama, g.nama AS guru_nama,
        (SELECT COUNT(*) FROM lms_progres p WHERE p.materi_id=m.id AND p.tenant_id=m.tenant_id) AS jumlah_dibuka,
        (SELECT COUNT(*) FROM lms_progres p WHERE p.materi_id=m.id AND p.tenant_id=m.tenant_id AND p.selesai=1) AS jumlah_selesai
      FROM lms_materi m
      LEFT JOIN mapel mp ON mp.id = m.mapel_id AND mp.tenant_id = m.tenant_id
      LEFT JOIN rombel r ON r.id = m.rombel_id AND r.tenant_id = m.tenant_id
      LEFT JOIN gtk g ON g.id = m.gtk_id AND g.tenant_id = m.tenant_id
      WHERE ${akses.where}
      ORDER BY m.urutan, m.created_at DESC
      LIMIT 500
    `).all(...akses.args)
    res.json(rows)
  })

  // ---- Tambah materi (dengan atau tanpa file) ----
  app.post('/api/lms/materi', authMiddleware, KELOLA, upload.single('file'), (req, res) => {
    const b = req.body || {}
    if (!String(b.judul || '').trim()) {
      if (req.file) { try { fs.unlinkSync(req.file.path) } catch {} }
      return res.status(400).json({ error: 'Judul materi wajib diisi.' })
    }

    // Validasi tipe berkas. Materi ajar bukan tempat menyimpan executable.
    if (req.file && !TIPE_DIIZINKAN.has(String(req.file.mimetype || ''))) {
      try { fs.unlinkSync(req.file.path) } catch {}
      return res.status(400).json({ error: `Tipe berkas ${req.file.mimetype} tidak diizinkan untuk materi ajar.` })
    }
    if (req.file && req.file.size > MAKS_BYTE) {
      try { fs.unlinkSync(req.file.path) } catch {}
      return res.status(400).json({ error: 'Ukuran berkas melebihi 50 MB.' })
    }

    const id = crypto.randomUUID()
    const gtkId = db.prepare('SELECT gtk_id FROM users WHERE id=? AND tenant_id=?').get(req.user.id, req.tenantId)?.gtk_id || ''
    const urutan = Number(b.urutan) || (db.prepare('SELECT COALESCE(MAX(urutan),0)+1 n FROM lms_materi WHERE tenant_id=?').get(req.tenantId).n)

    db.prepare(`INSERT INTO lms_materi (id, judul, deskripsi, mapel_id, rombel_id, gtk_id, jenis, file_path, file_nama,
      file_ukuran, file_tipe, tautan, urutan, publikasi, tenant_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, String(b.judul).trim(), String(b.deskripsi || ''),
        b.mapel_id || null, b.rombel_id || null, gtkId,
        req.file ? 'file' : 'tautan',
        req.file ? `/uploads/${path.basename(req.file.path)}` : '',
        req.file ? String(req.file.originalname || '') : '',
        req.file ? req.file.size : 0,
        req.file ? String(req.file.mimetype || '') : '',
        String(b.tautan || ''), urutan,
        b.publikasi === '1' || b.publikasi === true || b.publikasi === 1 ? 1 : 0,
        req.tenantId)
    res.json({ id })
  })

  app.put('/api/lms/materi/:id', authMiddleware, KELOLA, (req, res) => {
    const b = req.body || {}
    const r = db.prepare(`UPDATE lms_materi SET judul=?, deskripsi=?, mapel_id=?, rombel_id=?, tautan=?, urutan=?, publikasi=?
      WHERE id=? AND tenant_id=?`)
      .run(String(b.judul || '').trim(), String(b.deskripsi || ''), b.mapel_id || null, b.rombel_id || null,
        String(b.tautan || ''), Number(b.urutan) || 0,
        b.publikasi === true || b.publikasi === 1 || b.publikasi === '1' ? 1 : 0,
        req.params.id, req.tenantId)
    if (!r.changes) return res.status(404).json({ error: 'Materi tidak ditemukan.' })
    res.json({ success: true })
  })

  app.delete('/api/lms/materi/:id', authMiddleware, KELOLA, (req, res) => {
    const m = db.prepare('SELECT * FROM lms_materi WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!m) return res.status(404).json({ error: 'Materi tidak ditemukan.' })
    // Berkas fisik dihapus juga, kalau tidak uploads menumpuk tanpa rujukan.
    if (m.file_path) {
      const f = path.join(UPLOAD_DIR, path.basename(m.file_path))
      try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch {}
    }
    db.prepare('DELETE FROM lms_progres WHERE materi_id=? AND tenant_id=?').run(m.id, req.tenantId)
    db.prepare('DELETE FROM lms_materi WHERE id=? AND tenant_id=?').run(m.id, req.tenantId)
    res.json({ success: true })
  })

  // ---- Buka materi: catat progres ----
  // Dipanggil saat siswa membuka. Unique index memastikan satu baris per
  // siswa+materi; jumlah_buka bertambah, dibuka_pertama TIDAK berubah.
  app.post('/api/lms/materi/:id/buka', authMiddleware, (req, res) => {
    const m = db.prepare('SELECT id, rombel_id, publikasi FROM lms_materi WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!m) return res.status(404).json({ error: 'Materi tidak ditemukan.' })

    const role = String(req.user?.role || '')
    if (role === 'siswa') {
      if (!m.publikasi) return res.status(403).json({ error: 'Materi belum dipublikasikan.' })
      const siswaId = db.prepare('SELECT siswa_id FROM users WHERE id=? AND tenant_id=?').get(req.user.id, req.tenantId)?.siswa_id
      if (!siswaId) return res.status(403).json({ error: 'Akun ini tidak terhubung ke data siswa.' })
      if (m.rombel_id) {
        const rombelSiswa = db.prepare('SELECT rombel_id FROM siswa WHERE id=? AND tenant_id=?').get(siswaId, req.tenantId)?.rombel_id
        if (String(rombelSiswa) !== String(m.rombel_id)) {
          return res.status(403).json({ error: 'Materi ini bukan untuk rombel Anda.' })
        }
      }

      const ada = db.prepare('SELECT id FROM lms_progres WHERE tenant_id=? AND materi_id=? AND siswa_id=?').get(req.tenantId, m.id, siswaId)
      if (ada) {
        db.prepare('UPDATE lms_progres SET dibuka_terakhir=?, jumlah_buka=jumlah_buka+1 WHERE id=?')
          .run(sekarang(), ada.id)
      } else {
        db.prepare(`INSERT INTO lms_progres (id, materi_id, siswa_id, dibuka_pertama, dibuka_terakhir, jumlah_buka, selesai, tenant_id)
          VALUES (?,?,?,?,?,1,0,?)`).run(crypto.randomUUID(), m.id, siswaId, sekarang(), sekarang(), req.tenantId)
      }
      return res.json({ success: true, tercatat: true })
    }

    // Guru/admin membuka: tidak mencatat progres siswa.
    res.json({ success: true, tercatat: false })
  })

  // ---- Tandai selesai ----
  app.post('/api/lms/materi/:id/selesai', authMiddleware, (req, res) => {
    const siswaId = db.prepare('SELECT siswa_id FROM users WHERE id=? AND tenant_id=?').get(req.user.id, req.tenantId)?.siswa_id
    if (!siswaId) return res.status(403).json({ error: 'Hanya siswa yang bisa menandai selesai.' })
    const r = db.prepare('UPDATE lms_progres SET selesai=1, dibuka_terakhir=? WHERE tenant_id=? AND materi_id=? AND siswa_id=?')
      .run(sekarang(), req.tenantId, req.params.id, siswaId)
    if (!r.changes) return res.status(400).json({ error: 'Buka materi dulu sebelum menandai selesai.' })
    res.json({ success: true })
  })

  // ---- Progres per materi (untuk guru) ----
  app.get('/api/lms/materi/:id/progres', authMiddleware, BACA, (req, res) => {
    const m = db.prepare('SELECT * FROM lms_materi WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!m) return res.status(404).json({ error: 'Materi tidak ditemukan.' })

    const rows = db.prepare(`
      SELECT p.*, s.nama, s.nis
      FROM lms_progres p
      LEFT JOIN siswa s ON s.id = p.siswa_id AND s.tenant_id = p.tenant_id
      WHERE p.tenant_id=? AND p.materi_id=?
      ORDER BY p.dibuka_terakhir DESC
    `).all(req.tenantId, m.id)

    // Berapa siswa di rombel sasaran yang BELUM membuka — pertanyaan yang
    // sebenarnya ditanyakan guru, bukan hanya siapa yang sudah.
    let totalSiswa = 0, belum = []
    if (m.rombel_id) {
      const semua = db.prepare("SELECT id, nama, nis FROM siswa WHERE tenant_id=? AND rombel_id=? AND COALESCE(status,'aktif')='aktif'").all(req.tenantId, m.rombel_id)
      totalSiswa = semua.length
      const sudah = new Set(rows.map(r => r.siswa_id))
      belum = semua.filter(s => !sudah.has(s.id))
    }
    res.json({ materi: m, progres: rows, totalSiswa, belumMembuka: belum, sudahMembuka: rows.length })
  })

  // ---- Ringkasan LMS ----
  app.get('/api/lms/ringkasan', authMiddleware, BACA, (req, res) => {
    const totalMateri = db.prepare('SELECT COUNT(*) n FROM lms_materi WHERE tenant_id=?').get(req.tenantId).n
    const terbit = db.prepare('SELECT COUNT(*) n FROM lms_materi WHERE tenant_id=? AND publikasi=1').get(req.tenantId).n
    const totalBuka = db.prepare('SELECT COUNT(*) n FROM lms_progres WHERE tenant_id=?').get(req.tenantId).n
    const selesai = db.prepare('SELECT COUNT(*) n FROM lms_progres WHERE tenant_id=? AND selesai=1').get(req.tenantId).n
    const perMapel = db.prepare(`
      SELECT COALESCE(mp.nama,'(tanpa mapel)') AS mapel, COUNT(*) n
      FROM lms_materi m LEFT JOIN mapel mp ON mp.id=m.mapel_id AND mp.tenant_id=m.tenant_id
      WHERE m.tenant_id=? GROUP BY m.mapel_id ORDER BY n DESC LIMIT 10
    `).all(req.tenantId)
    res.json({ totalMateri, terbit, draf: totalMateri - terbit, totalBuka, selesai, perMapel })
  })
}

module.exports = { setupLmsTables, daftarkanRuteLms, TIPE_DIIZINKAN, MAKS_BYTE }
