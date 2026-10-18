'use strict'
// Modul Alumni & Mutasi Siswa.
//
// Kenapa perlu modul tersendiri, bukan sekadar mengubah kolom `siswa.status`:
//   - Mengubah status saja TIDAK menyimpan KAPAN, KEMANA, dan ATAS DASAR APA
//     siswa keluar. Untuk akreditasi dan audit, itu yang ditanyakan.
//   - Siswa yang sudah keluar tidak boleh ikut terhitung di absensi, jadwal,
//     tagihan, dan rekap rombel — tetapi datanya harus tetap ada (bukan dihapus).
//
// Desain: satu tabel `mutasi_siswa` sebagai RIWAYAT (append-only), dan kolom
// `siswa.status` + `siswa.rombel_id` diperbarui agar modul lain otomatis
// berhenti menghitung siswa tersebut. Riwayat tidak pernah dihapus.
const crypto = require('node:crypto')

const JENIS_MUTASI = ['alumni', 'pindah_keluar', 'pindah_masuk', 'keluar', 'meninggal', 'dikeluarkan']

const LABEL_JENIS = {
  alumni: 'Lulus / Alumni',
  pindah_keluar: 'Pindah ke lembaga lain',
  pindah_masuk: 'Pindah masuk (dari lembaga lain)',
  keluar: 'Keluar / berhenti',
  meninggal: 'Meninggal dunia',
  dikeluarkan: 'Dikeluarkan',
}

// Status siswa setelah mutasi dijalankan. `pindah_masuk` justru mengaktifkan.
const STATUS_SETELAH = {
  alumni: 'alumni',
  pindah_keluar: 'pindah',
  pindah_masuk: 'aktif',
  keluar: 'keluar',
  meninggal: 'meninggal',
  dikeluarkan: 'dikeluarkan',
}

function setupMutasiTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mutasi_siswa (
      id TEXT PRIMARY KEY,
      siswa_id TEXT NOT NULL,
      jenis TEXT NOT NULL,
      tanggal TEXT NOT NULL,
      tahun_ajaran TEXT NOT NULL DEFAULT '',
      dari_rombel_id TEXT,
      dari_rombel_nama TEXT NOT NULL DEFAULT '',
      ke_sekolah TEXT NOT NULL DEFAULT '',
      no_surat TEXT NOT NULL DEFAULT '',
      alasan TEXT NOT NULL DEFAULT '',
      keterangan TEXT NOT NULL DEFAULT '',
      dicatat_id TEXT NOT NULL DEFAULT '',
      dicatat_nama TEXT NOT NULL DEFAULT '',
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_mutasi_tenant ON mutasi_siswa(tenant_id, tanggal);
    CREATE INDEX IF NOT EXISTS idx_mutasi_siswa ON mutasi_siswa(tenant_id, siswa_id);
  `)
}

function daftarkanRuteMutasi(app, { db, authMiddleware, requireRole }) {
  setupMutasiTables(db)

  // Alumni & mutasi = data administratif sensitif. Operator/TU boleh mencatat,
  // guru tidak (guru tidak berwenang mengeluarkan siswa).
  const BACA = requireRole('admin', 'super_admin', 'kepala', 'operator', 'tata_usaha', 'tu', 'bendahara')
  const TULIS = requireRole('admin', 'super_admin', 'kepala', 'operator', 'tata_usaha', 'tu')

  const namaPemakai = (user) => user?.nama || user?.username || user?.email || 'Operator'

  // ---- Daftar mutasi (riwayat) ----
  app.get('/api/mutasi', authMiddleware, BACA, (req, res) => {
    const { jenis, dari, sampai, tahun_ajaran, siswa_id } = req.query
    const where = ['m.tenant_id = ?']
    const args = [req.tenantId]
    if (jenis) { where.push('m.jenis = ?'); args.push(String(jenis)) }
    if (dari) { where.push('m.tanggal >= ?'); args.push(String(dari)) }
    if (sampai) { where.push('m.tanggal <= ?'); args.push(String(sampai)) }
    if (tahun_ajaran) { where.push('m.tahun_ajaran = ?'); args.push(String(tahun_ajaran)) }
    if (siswa_id) { where.push('m.siswa_id = ?'); args.push(String(siswa_id)) }

    const rows = db.prepare(`
      SELECT m.*, s.nama AS nama_siswa, s.nis AS nis_siswa
      FROM mutasi_siswa m
      LEFT JOIN siswa s ON s.id = m.siswa_id AND s.tenant_id = m.tenant_id
      WHERE ${where.join(' AND ')}
      ORDER BY m.tanggal DESC, m.created_at DESC
      LIMIT 500
    `).all(...args)
    res.json(rows)
  })

  // ---- Catat mutasi ----
  // Efek samping SENGAJA eksplisit: ubah status siswa + kosongkan rombel untuk
  // jenis yang mengeluarkan. Tanpa ini, siswa "alumni" tetap muncul di absensi
  // dan rekap rombel — persis masalah yang modul ini selesaikan.
  app.post('/api/mutasi', authMiddleware, TULIS, (req, res) => {
    const { siswa_id, jenis, tanggal, tahun_ajaran, ke_sekolah, no_surat, alasan, keterangan } = req.body || {}
    if (!siswa_id) return res.status(400).json({ error: 'Siswa wajib dipilih.' })
    if (!JENIS_MUTASI.includes(String(jenis))) return res.status(400).json({ error: 'Jenis mutasi tidak dikenal.' })
    if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(String(tanggal))) return res.status(400).json({ error: 'Tanggal wajib diisi (YYYY-MM-DD).' })

    const siswa = db.prepare('SELECT id, nama, nis, rombel_id, status FROM siswa WHERE id=? AND tenant_id=?').get(String(siswa_id), req.tenantId)
    if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan di lembaga ini.' })

    const rombel = siswa.rombel_id
      ? db.prepare('SELECT nama FROM rombel WHERE id=? AND tenant_id=?').get(siswa.rombel_id, req.tenantId)
      : null

    const id = crypto.randomUUID()
    const statusBaru = STATUS_SETELAH[String(jenis)] || 'aktif'

    const jalankan = db.transaction(() => {
      db.prepare(`INSERT INTO mutasi_siswa (id, siswa_id, jenis, tanggal, tahun_ajaran, dari_rombel_id, dari_rombel_nama,
        ke_sekolah, no_surat, alasan, keterangan, dicatat_id, dicatat_nama, tenant_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, String(siswa_id), String(jenis), String(tanggal), String(tahun_ajaran || ''),
          siswa.rombel_id || null, rombel?.nama || '', String(ke_sekolah || ''), String(no_surat || ''),
          String(alasan || ''), String(keterangan || ''), req.user.id, namaPemakai(req.user), req.tenantId)

      // Status selalu diperbarui. Rombel dikosongkan HANYA bila siswa keluar,
      // supaya ia tidak lagi muncul di absensi/jadwal/rekap kelas itu.
      if (statusBaru === 'aktif') {
        db.prepare('UPDATE siswa SET status=? WHERE id=? AND tenant_id=?').run('aktif', String(siswa_id), req.tenantId)
      } else {
        db.prepare('UPDATE siswa SET status=?, rombel_id=NULL WHERE id=? AND tenant_id=?').run(statusBaru, String(siswa_id), req.tenantId)
      }
    })
    jalankan()

    res.json({ id, status_baru: statusBaru, rombel_dikosongkan: statusBaru !== 'aktif' })
  })

  // ---- Batalkan / urungkan mutasi ----
  // Riwayat mutasi TIDAK dihapus (jejak audit), tetapi siswa dikembalikan aktif
  // ke rombel asalnya. Dicatat sebagai koreksi, bukan penghapusan.
  app.post('/api/mutasi/:id/urungkan', authMiddleware, TULIS, (req, res) => {
    const row = db.prepare('SELECT * FROM mutasi_siswa WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!row) return res.status(404).json({ error: 'Catatan mutasi tidak ditemukan.' })

    const jalankan = db.transaction(() => {
      db.prepare('UPDATE siswa SET status=?, rombel_id=? WHERE id=? AND tenant_id=?')
        .run('aktif', row.dari_rombel_id || null, row.siswa_id, req.tenantId)
      db.prepare(`INSERT INTO mutasi_siswa (id, siswa_id, jenis, tanggal, tahun_ajaran, dari_rombel_id, dari_rombel_nama,
        ke_sekolah, no_surat, alasan, keterangan, dicatat_id, dicatat_nama, tenant_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(crypto.randomUUID(), row.siswa_id, 'pindah_masuk', new Date().toISOString().slice(0, 10),
          row.tahun_ajaran, row.dari_rombel_id, row.dari_rombel_nama, '', '',
          'Pembatalan mutasi', `Mengurungkan catatan ${row.jenis} tanggal ${row.tanggal}`,
          req.user.id, namaPemakai(req.user), req.tenantId)
    })
    jalankan()
    res.json({ success: true, status_baru: 'aktif', rombel_dipulihkan: row.dari_rombel_id || null })
  })

  // ---- Daftar alumni (siswa berstatus alumni) ----
  app.get('/api/alumni', authMiddleware, BACA, (req, res) => {
    const { tahun_ajaran, search } = req.query
    const where = ["s.tenant_id = ?", "s.status = 'alumni'"]
    const args = [req.tenantId]
    if (search) { where.push('(s.nama LIKE ? OR s.nis LIKE ? OR s.nisn LIKE ?)'); args.push(`%${search}%`, `%${search}%`, `%${search}%`) }

    let rows = db.prepare(`
      SELECT s.id, s.nis, s.nisn, s.nama, s.jenis_kelamin, s.status,
             m.tanggal AS tanggal_lulus, m.tahun_ajaran AS tahun_lulus, m.dari_rombel_nama
      FROM siswa s
      LEFT JOIN mutasi_siswa m ON m.siswa_id = s.id AND m.tenant_id = s.tenant_id AND m.jenis = 'alumni'
      WHERE ${where.join(' AND ')}
      ORDER BY m.tanggal DESC, s.nama
      LIMIT 1000
    `).all(...args)

    if (tahun_ajaran) rows = rows.filter(r => String(r.tahun_lulus || '') === String(tahun_ajaran))
    res.json(rows)
  })

  // ---- Statistik untuk kartu ringkasan ----
  app.get('/api/mutasi/statistik', authMiddleware, BACA, (req, res) => {
    const perJenis = db.prepare('SELECT jenis, COUNT(*) n FROM mutasi_siswa WHERE tenant_id=? GROUP BY jenis').all(req.tenantId)
    const perStatus = db.prepare('SELECT status, COUNT(*) n FROM siswa WHERE tenant_id=? GROUP BY status').all(req.tenantId)
    const tahunIni = db.prepare("SELECT COUNT(*) n FROM mutasi_siswa WHERE tenant_id=? AND substr(tanggal,1,4)=?").get(req.tenantId, String(new Date().getFullYear()))?.n || 0
    res.json({
      perJenis,
      perStatus,
      mutasiTahunIni: tahunIni,
      label: LABEL_JENIS,
    })
  })
}

module.exports = { setupMutasiTables, daftarkanRuteMutasi, JENIS_MUTASI, LABEL_JENIS, STATUS_SETELAH }
