'use strict'
// Modul Bimbingan Konseling (BK) — catatan konseling, pelanggaran, dan
// peringatan dini (early warning).
//
// Kenapa modul ini dipisah dari `catatan_kepribadian`:
//   - catatan_kepribadian = materi RAPOR (sikap & catatan wali kelas), dibaca
//     guru dan wali murid. Sifatnya akademis-administratif.
//   - BK = catatan PRIVAT guru BK: sesi konseling, pelanggaran, tindak lanjut.
//     Tidak semua guru boleh melihat; wali murid TIDAK boleh.
// Menggabungkannya akan membocorkan isi konseling ke rapor — itu masalah
// privasi, bukan sekadar kerapian menu.
//
// Sumber acuan fitur: APPSO menyebut "Bimbingan Konseling (BK) — catatan
// konseling, tracking pelanggaran, early warning, privacy-aware".
const crypto = require('node:crypto')

const JENIS_KASUS = ['akademik', 'kehadiran', 'perilaku', 'keluarga', 'kesehatan', 'karir', 'lainnya']
const TINGKAT_PELANGGARAN = ['ringan', 'sedang', 'berat']
const STATUS_SESI = ['terbuka', 'selesai', 'rujukan']

function setupBkTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bk_sesi (
      id TEXT PRIMARY KEY,
      siswa_id TEXT NOT NULL,
      tanggal TEXT NOT NULL,
      jenis_kasus TEXT NOT NULL DEFAULT 'lainnya',
      judul TEXT NOT NULL DEFAULT '',
      ringkasan TEXT NOT NULL DEFAULT '',
      tindak_lanjut TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'terbuka',
      konselor_id TEXT NOT NULL DEFAULT '',
      konselor_nama TEXT NOT NULL DEFAULT '',
      rahasia INTEGER NOT NULL DEFAULT 1,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bk_sesi_tenant ON bk_sesi(tenant_id, tanggal);
    CREATE INDEX IF NOT EXISTS idx_bk_sesi_siswa ON bk_sesi(tenant_id, siswa_id);

    CREATE TABLE IF NOT EXISTS bk_pelanggaran (
      id TEXT PRIMARY KEY,
      siswa_id TEXT NOT NULL,
      tanggal TEXT NOT NULL,
      jenis TEXT NOT NULL DEFAULT '',
      tingkat TEXT NOT NULL DEFAULT 'ringan',
      poin INTEGER NOT NULL DEFAULT 0,
      keterangan TEXT NOT NULL DEFAULT '',
      tindakan TEXT NOT NULL DEFAULT '',
      pencatat_id TEXT NOT NULL DEFAULT '',
      pencatat_nama TEXT NOT NULL DEFAULT '',
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_bk_pelanggaran_tenant ON bk_pelanggaran(tenant_id, tanggal);
    CREATE INDEX IF NOT EXISTS idx_bk_pelanggaran_siswa ON bk_pelanggaran(tenant_id, siswa_id);
  `)
}

// Ambang poin pelanggaran untuk peringatan dini. Bisa diubah admin lewat
// app_config (tanpa deploy); nilai bawaan mengikuti praktik umum sekolah.
const AMBANG_DEFAULT = { waspada: 25, panggilan1: 50, panggilan2: 75, skorsing: 100 }

function ambangPoin(db) {
  try {
    const row = db.prepare("SELECT value FROM app_config WHERE key='bk_ambang_poin'").get()
    if (row?.value) return { ...AMBANG_DEFAULT, ...JSON.parse(row.value) }
  } catch { /* pakai bawaan */ }
  return AMBANG_DEFAULT
}

// Status peringatan berdasarkan akumulasi poin.
function statusPeringatan(poin, ambang = AMBANG_DEFAULT) {
  const p = Number(poin) || 0
  if (p >= ambang.skorsing) return { level: 'skorsing', label: 'Peringatan berat', warna: 'merah' }
  if (p >= ambang.panggilan2) return { level: 'panggilan2', label: 'Panggilan orang tua ke-2', warna: 'oranye' }
  if (p >= ambang.panggilan1) return { level: 'panggilan1', label: 'Panggilan orang tua ke-1', warna: 'kuning' }
  if (p >= ambang.waspada) return { level: 'waspada', label: 'Perlu perhatian', warna: 'biru' }
  return { level: 'aman', label: 'Aman', warna: 'hijau' }
}

// Poin bawaan per tingkat, dipakai kalau pencatat tidak mengisi poin manual.
const POIN_DEFAULT = { ringan: 5, sedang: 15, berat: 40 }

function daftarkanRuteBk(app, { db, authMiddleware, STAFF, TEACHER, requireRole }) {
  setupBkTables(db)

  // Siapa yang boleh melihat isi konseling: guru BK, kepala, admin.
  // Guru biasa hanya melihat daftar siswa yang punya sesi (tanpa isi ringkasan)
  // supaya bisa merujuk, tetapi tidak membaca catatan privat rekannya.
  // CATATAN: requireRole(...roles) adalah middleware factory — dipanggil dengan
  // daftar argumen, bukan array.
  const BK_READ = requireRole('admin', 'super_admin', 'kepala', 'guru', 'wali_kelas')
  const BK_WRITE = requireRole('admin', 'super_admin', 'kepala', 'guru', 'wali_kelas')

  const namaPemakai = (user) => user?.nama || user?.username || user?.email || 'Guru BK'

  // ---- Sesi konseling ----
  app.get('/api/bk/sesi', authMiddleware, BK_READ, (req, res) => {
    const { siswa_id, jenis_kasus, status, dari, sampai } = req.query
    const where = ['tenant_id = ?']
    const args = [req.tenantId]
    if (siswa_id) { where.push('siswa_id = ?'); args.push(String(siswa_id)) }
    if (jenis_kasus) { where.push('jenis_kasus = ?'); args.push(String(jenis_kasus)) }
    if (status) { where.push('status = ?'); args.push(String(status)) }
    if (dari) { where.push('tanggal >= ?'); args.push(String(dari)) }
    if (sampai) { where.push('tanggal <= ?'); args.push(String(sampai)) }

    // Guru non-BK tidak menerima isi ringkasan sesi yang ditandai rahasia.
    const bolehBacaIsi = ['admin', 'super_admin', 'kepala'].includes(req.user.role)
    const kolom = bolehBacaIsi
      ? '*'
      : "id, siswa_id, tanggal, jenis_kasus, judul, status, konselor_nama, rahasia, created_at, CASE WHEN rahasia=0 THEN ringkasan ELSE '' END AS ringkasan, CASE WHEN rahasia=0 THEN tindak_lanjut ELSE '' END AS tindak_lanjut"

    const rows = db.prepare(`SELECT ${kolom} FROM bk_sesi WHERE ${where.join(' AND ')} ORDER BY tanggal DESC, created_at DESC LIMIT 500`).all(...args)
    res.json(rows)
  })

  app.post('/api/bk/sesi', authMiddleware, BK_WRITE, (req, res) => {
    const { siswa_id, tanggal, jenis_kasus, judul, ringkasan, tindak_lanjut, status, rahasia } = req.body || {}
    if (!siswa_id) return res.status(400).json({ error: 'Siswa wajib dipilih.' })
    if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(String(tanggal))) return res.status(400).json({ error: 'Tanggal wajib diisi (YYYY-MM-DD).' })
    const jenis = JENIS_KASUS.includes(String(jenis_kasus)) ? String(jenis_kasus) : 'lainnya'
    const st = STATUS_SESI.includes(String(status)) ? String(status) : 'terbuka'
    const siswa = db.prepare('SELECT id FROM siswa WHERE id=? AND tenant_id=?').get(String(siswa_id), req.tenantId)
    if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan di lembaga ini.' })

    const id = crypto.randomUUID()
    db.prepare(`INSERT INTO bk_sesi (id, siswa_id, tanggal, jenis_kasus, judul, ringkasan, tindak_lanjut, status, konselor_id, konselor_nama, rahasia, tenant_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, String(siswa_id), String(tanggal), jenis, String(judul || ''), String(ringkasan || ''), String(tindak_lanjut || ''),
        st, req.user.id, namaPemakai(req.user), rahasia === false || rahasia === 0 ? 0 : 1, req.tenantId)
    res.json({ id })
  })

  app.put('/api/bk/sesi/:id', authMiddleware, BK_WRITE, (req, res) => {
    const row = db.prepare('SELECT id FROM bk_sesi WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!row) return res.status(404).json({ error: 'Sesi tidak ditemukan.' })
    const { tanggal, jenis_kasus, judul, ringkasan, tindak_lanjut, status, rahasia } = req.body || {}
    db.prepare(`UPDATE bk_sesi SET tanggal=COALESCE(?,tanggal), jenis_kasus=COALESCE(?,jenis_kasus), judul=COALESCE(?,judul),
      ringkasan=COALESCE(?,ringkasan), tindak_lanjut=COALESCE(?,tindak_lanjut), status=COALESCE(?,status),
      rahasia=COALESCE(?,rahasia), updated_at=datetime('now') WHERE id=? AND tenant_id=?`)
      .run(tanggal || null, JENIS_KASUS.includes(String(jenis_kasus)) ? jenis_kasus : null, judul ?? null,
        ringkasan ?? null, tindak_lanjut ?? null, STATUS_SESI.includes(String(status)) ? status : null,
        rahasia === undefined ? null : (rahasia === false || rahasia === 0 ? 0 : 1), req.params.id, req.tenantId)
    res.json({ success: true })
  })

  app.delete('/api/bk/sesi/:id', authMiddleware, BK_WRITE, (req, res) => {
    const r = db.prepare('DELETE FROM bk_sesi WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
    if (!r.changes) return res.status(404).json({ error: 'Sesi tidak ditemukan.' })
    res.json({ success: true })
  })

  // ---- Pelanggaran ----
  app.get('/api/bk/pelanggaran', authMiddleware, BK_READ, (req, res) => {
    const { siswa_id, tingkat, dari, sampai } = req.query
    const where = ['tenant_id = ?']
    const args = [req.tenantId]
    if (siswa_id) { where.push('siswa_id = ?'); args.push(String(siswa_id)) }
    if (tingkat) { where.push('tingkat = ?'); args.push(String(tingkat)) }
    if (dari) { where.push('tanggal >= ?'); args.push(String(dari)) }
    if (sampai) { where.push('tanggal <= ?'); args.push(String(sampai)) }
    const rows = db.prepare(`SELECT * FROM bk_pelanggaran WHERE ${where.join(' AND ')} ORDER BY tanggal DESC, created_at DESC LIMIT 500`).all(...args)
    res.json(rows)
  })

  app.post('/api/bk/pelanggaran', authMiddleware, BK_WRITE, (req, res) => {
    const { siswa_id, tanggal, jenis, tingkat, poin, keterangan, tindakan } = req.body || {}
    if (!siswa_id) return res.status(400).json({ error: 'Siswa wajib dipilih.' })
    if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(String(tanggal))) return res.status(400).json({ error: 'Tanggal wajib diisi (YYYY-MM-DD).' })
    if (!String(jenis || '').trim()) return res.status(400).json({ error: 'Jenis pelanggaran wajib diisi.' })
    const siswa = db.prepare('SELECT id FROM siswa WHERE id=? AND tenant_id=?').get(String(siswa_id), req.tenantId)
    if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan di lembaga ini.' })

    const tk = TINGKAT_PELANGGARAN.includes(String(tingkat)) ? String(tingkat) : 'ringan'
    const p = poin === undefined || poin === '' ? POIN_DEFAULT[tk] : Math.max(0, Math.min(500, Number(poin) || 0))
    const id = crypto.randomUUID()
    db.prepare(`INSERT INTO bk_pelanggaran (id, siswa_id, tanggal, jenis, tingkat, poin, keterangan, tindakan, pencatat_id, pencatat_nama, tenant_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, String(siswa_id), String(tanggal), String(jenis).trim(), tk, p, String(keterangan || ''), String(tindakan || ''),
        req.user.id, namaPemakai(req.user), req.tenantId)
    res.json({ id, poin: p })
  })

  app.delete('/api/bk/pelanggaran/:id', authMiddleware, BK_WRITE, (req, res) => {
    const r = db.prepare('DELETE FROM bk_pelanggaran WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
    if (!r.changes) return res.status(404).json({ error: 'Pelanggaran tidak ditemukan.' })
    res.json({ success: true })
  })

  // ---- Ringkasan per siswa: akumulasi poin + status peringatan ----
  // Inilah "early warning" yang membedakan BK dari sekadar catatan:
  // sistem memberi tahu SEBELUM masalah membesar, bukan menunggu rapor.
  app.get('/api/bk/ringkasan', authMiddleware, BK_READ, (req, res) => {
    const ambang = ambangPoin(db)
    const rows = db.prepare(`
      SELECT s.id AS siswa_id, s.nama, s.nis, r.nama AS rombel_nama,
             COALESCE(SUM(p.poin), 0) AS total_poin,
             COUNT(p.id) AS jumlah_pelanggaran,
             MAX(p.tanggal) AS terakhir
      FROM siswa s
      LEFT JOIN rombel r ON r.id = s.rombel_id
      LEFT JOIN bk_pelanggaran p ON p.siswa_id = s.id AND p.tenant_id = s.tenant_id
      WHERE s.tenant_id = ?
      GROUP BY s.id
      HAVING total_poin > 0
      ORDER BY total_poin DESC
      LIMIT 300
    `).all(req.tenantId)

    const sesiTerakhir = db.prepare('SELECT siswa_id, MAX(tanggal) t FROM bk_sesi WHERE tenant_id=? GROUP BY siswa_id').all(req.tenantId)
    const petaSesi = new Map(sesiTerakhir.map(x => [x.siswa_id, x.t]))

    res.json({
      ambang,
      siswa: rows.map(r => ({
        ...r,
        status: statusPeringatan(r.total_poin, ambang),
        sesi_terakhir: petaSesi.get(r.siswa_id) || null,
      })),
    })
  })

  // ---- Statistik untuk dashboard BK ----
  app.get('/api/bk/statistik', authMiddleware, BK_READ, (req, res) => {
    const ambang = ambangPoin(db)
    const totalSesi = db.prepare('SELECT COUNT(*) n FROM bk_sesi WHERE tenant_id=?').get(req.tenantId)?.n || 0
    const sesiTerbuka = db.prepare("SELECT COUNT(*) n FROM bk_sesi WHERE tenant_id=? AND status='terbuka'").get(req.tenantId)?.n || 0
    const totalPelanggaran = db.prepare('SELECT COUNT(*) n FROM bk_pelanggaran WHERE tenant_id=?').get(req.tenantId)?.n || 0
    const perJenis = db.prepare('SELECT jenis_kasus, COUNT(*) n FROM bk_sesi WHERE tenant_id=? GROUP BY jenis_kasus').all(req.tenantId)
    const perTingkat = db.prepare('SELECT tingkat, COUNT(*) n FROM bk_pelanggaran WHERE tenant_id=? GROUP BY tingkat').all(req.tenantId)
    const perluPerhatian = db.prepare(`
      SELECT COUNT(*) n FROM (
        SELECT siswa_id, SUM(poin) t FROM bk_pelanggaran WHERE tenant_id=? GROUP BY siswa_id HAVING t >= ?
      )`).get(req.tenantId, ambang.waspada)?.n || 0
    res.json({ totalSesi, sesiTerbuka, totalPelanggaran, perluPerhatian, ambang, perJenis, perTingkat })
  })
}

module.exports = { setupBkTables, daftarkanRuteBk, statusPeringatan, ambangPoin, JENIS_KASUS, TINGKAT_PELANGGARAN, STATUS_SESI, POIN_DEFAULT, AMBANG_DEFAULT }
