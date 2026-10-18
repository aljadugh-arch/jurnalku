'use strict'
// Modul Sirkulasi Perpustakaan.
//
// Kondisi sebelumnya: `library_config` hanya menyimpan SATU link Google Drive
// per lembaga. Tidak ada katalog buku, tidak ada catatan siapa meminjam apa,
// tidak ada tanggal jatuh tempo, tidak ada denda. Akibatnya "perpustakaan"
// hanya bisa menampilkan folder Drive — bukan mengelola koleksi.
//
// Yang dibangun di sini:
//   - katalog buku (judul, pengarang, ISBN, kategori, jumlah salinan)
//   - peminjaman & pengembalian dengan jatuh tempo
//   - denda keterlambatan otomatis (tarif dari app_config, bisa diubah admin)
//   - ketersediaan dihitung dari salinan dikurangi yang sedang dipinjam
//
// Keputusan penting: STOK TIDAK DISIMPAN sebagai angka terpisah. Kalau stok
// disimpan, ia akan melenceng begitu ada peminjaman ganda atau pembatalan.
// Stok selalu dihitung: jumlah_salinan - COUNT(pinjam aktif).
const crypto = require('node:crypto')

const KUNCI_DENDA = 'pustaka_denda_per_hari'
const KUNCI_LAMA_PINJAM = 'pustaka_lama_pinjam_hari'
const DENDA_DEFAULT = 1000
const LAMA_PINJAM_DEFAULT = 7

function setupPustakaTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pustaka_buku (
      id TEXT PRIMARY KEY,
      judul TEXT NOT NULL,
      pengarang TEXT NOT NULL DEFAULT '',
      penerbit TEXT NOT NULL DEFAULT '',
      tahun INTEGER,
      isbn TEXT NOT NULL DEFAULT '',
      kategori TEXT NOT NULL DEFAULT '',
      rak TEXT NOT NULL DEFAULT '',
      jumlah_salinan INTEGER NOT NULL DEFAULT 1,
      keterangan TEXT NOT NULL DEFAULT '',
      aktif INTEGER NOT NULL DEFAULT 1,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pustaka_buku_tenant ON pustaka_buku(tenant_id, judul);

    CREATE TABLE IF NOT EXISTS pustaka_pinjam (
      id TEXT PRIMARY KEY,
      buku_id TEXT NOT NULL,
      siswa_id TEXT,
      gtk_id TEXT,
      peminjam_nama TEXT NOT NULL DEFAULT '',
      peminjam_kelas TEXT NOT NULL DEFAULT '',
      tanggal_pinjam TEXT NOT NULL,
      jatuh_tempo TEXT NOT NULL,
      tanggal_kembali TEXT,
      denda INTEGER NOT NULL DEFAULT 0,
      denda_dibayar INTEGER NOT NULL DEFAULT 0,
      kondisi TEXT NOT NULL DEFAULT 'baik',
      catatan TEXT NOT NULL DEFAULT '',
      dicatat_id TEXT NOT NULL DEFAULT '',
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pustaka_pinjam_tenant ON pustaka_pinjam(tenant_id, tanggal_pinjam);
    CREATE INDEX IF NOT EXISTS idx_pustaka_pinjam_buku ON pustaka_pinjam(tenant_id, buku_id);
  `)
}

// app_config bersifat GLOBAL (kolom: key, value, updated_at — tanpa tenant_id),
// sama seperti pemakaian di adzan-push.cjs dan bk.cjs. Tarif denda & lama
// pinjam karena itu berlaku untuk semua lembaga, bisa diubah admin tanpa deploy.
const bacaAngka = (db, tenantId, kunci, bawaan) => {
  try {
    const r = db.prepare('SELECT value FROM app_config WHERE key=?').get(kunci)
    const n = Number(r?.value)
    return Number.isFinite(n) && n >= 0 ? n : bawaan
  } catch { return bawaan }
}

// Denda dihitung dari selisih hari, bukan disimpan saat pinjam: tarif bisa
// berubah dan buku yang dikembalikan terlambat harus dihitung saat kembali.
function hitungDenda(jatuhTempo, kembali, tarifPerHari) {
  if (!jatuhTempo) return 0
  const akhir = kembali || new Date().toISOString().slice(0, 10)
  const a = Date.parse(jatuhTempo + 'T00:00:00Z')
  const b = Date.parse(akhir + 'T00:00:00Z')
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  const telat = Math.floor((b - a) / 86400000)
  return telat > 0 ? telat * tarifPerHari : 0
}

function daftarkanRutePustaka(app, { db, authMiddleware, requireRole }) {
  setupPustakaTables(db)

  const KELOLA = requireRole('admin', 'super_admin', 'kepala', 'operator', 'tata_usaha', 'tu')
  // Pustakawan belum tentu ada sebagai role; guru & siswa boleh MEMBACA
  // katalog dan meminjam, tetapi tidak boleh mengubah koleksi.
  const BACA = requireRole('admin', 'super_admin', 'kepala', 'operator', 'tata_usaha', 'tu', 'guru', 'wali_kelas', 'siswa', 'bendahara')

  const hariIni = () => new Date().toISOString().slice(0, 10)
  const tambahHari = (tgl, n) => {
    const d = new Date(tgl + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }

  // Stok dihitung, tidak disimpan. Satu query untuk semua buku agar tidak N+1.
  const ambilBuku = (tenantId, filter = '') => {
    const args = [tenantId]
    let where = 'b.tenant_id = ?'
    if (filter) { where += ' AND (b.judul LIKE ? OR b.pengarang LIKE ? OR b.isbn LIKE ?)'; args.push(`%${filter}%`, `%${filter}%`, `%${filter}%`) }
    return db.prepare(`
      SELECT b.*,
        (SELECT COUNT(*) FROM pustaka_pinjam p
          WHERE p.buku_id = b.id AND p.tenant_id = b.tenant_id AND p.tanggal_kembali IS NULL) AS dipinjam,
        b.jumlah_salinan - (SELECT COUNT(*) FROM pustaka_pinjam p
          WHERE p.buku_id = b.id AND p.tenant_id = b.tenant_id AND p.tanggal_kembali IS NULL) AS tersedia
      FROM pustaka_buku b
      WHERE ${where}
      ORDER BY b.judul COLLATE NOCASE
      LIMIT 500
    `).all(...args)
  }

  // ---- Katalog ----
  app.get('/api/pustaka/buku', authMiddleware, BACA, (req, res) => {
    const cari = String(req.query.cari || '').trim()
    res.json(ambilBuku(req.tenantId, cari))
  })

  app.post('/api/pustaka/buku', authMiddleware, KELOLA, (req, res) => {
    const b = req.body || {}
    if (!String(b.judul || '').trim()) return res.status(400).json({ error: 'Judul buku wajib diisi.' })
    const salinan = Math.max(1, Math.min(999, Number(b.jumlah_salinan) || 1))
    const id = crypto.randomUUID()
    db.prepare(`INSERT INTO pustaka_buku (id, judul, pengarang, penerbit, tahun, isbn, kategori, rak, jumlah_salinan, keterangan, tenant_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, String(b.judul).trim(), String(b.pengarang || ''), String(b.penerbit || ''),
        Number(b.tahun) || null, String(b.isbn || ''), String(b.kategori || ''), String(b.rak || ''),
        salinan, String(b.keterangan || ''), req.tenantId)
    res.json({ id })
  })

  app.put('/api/pustaka/buku/:id', authMiddleware, KELOLA, (req, res) => {
    const b = req.body || {}
    const ada = db.prepare('SELECT id FROM pustaka_buku WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!ada) return res.status(404).json({ error: 'Buku tidak ditemukan.' })

    // Salinan tidak boleh diturunkan di bawah jumlah yang sedang dipinjam —
    // kalau dibiarkan, "tersedia" jadi negatif dan katalog menampilkan angka mustahil.
    if (b.jumlah_salinan != null) {
      const dipinjam = db.prepare("SELECT COUNT(*) n FROM pustaka_pinjam WHERE buku_id=? AND tenant_id=? AND tanggal_kembali IS NULL").get(req.params.id, req.tenantId).n
      const baru = Math.max(1, Number(b.jumlah_salinan) || 1)
      if (baru < dipinjam) return res.status(400).json({ error: `Tidak bisa mengurangi ke ${baru} — ${dipinjam} salinan sedang dipinjam.` })
    }

    db.prepare(`UPDATE pustaka_buku SET judul=?, pengarang=?, penerbit=?, tahun=?, isbn=?, kategori=?, rak=?, jumlah_salinan=?, keterangan=?, aktif=? WHERE id=? AND tenant_id=?`)
      .run(String(b.judul || '').trim(), String(b.pengarang || ''), String(b.penerbit || ''), Number(b.tahun) || null,
        String(b.isbn || ''), String(b.kategori || ''), String(b.rak || ''), Math.max(1, Number(b.jumlah_salinan) || 1),
        String(b.keterangan || ''), b.aktif === 0 ? 0 : 1, req.params.id, req.tenantId)
    res.json({ success: true })
  })

  app.delete('/api/pustaka/buku/:id', authMiddleware, KELOLA, (req, res) => {
    const dipinjam = db.prepare("SELECT COUNT(*) n FROM pustaka_pinjam WHERE buku_id=? AND tenant_id=? AND tanggal_kembali IS NULL").get(req.params.id, req.tenantId).n
    if (dipinjam > 0) return res.status(400).json({ error: `Buku masih dipinjam ${dipinjam} eksemplar. Kembalikan dulu.` })
    const r = db.prepare('DELETE FROM pustaka_buku WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
    if (!r.changes) return res.status(404).json({ error: 'Buku tidak ditemukan.' })
    res.json({ success: true })
  })

  // ---- Peminjaman ----
  app.get('/api/pustaka/pinjam', authMiddleware, BACA, (req, res) => {
    const status = String(req.query.status || 'aktif')
    const tarif = bacaAngka(db, req.tenantId, KUNCI_DENDA, DENDA_DEFAULT)
    const where = ['p.tenant_id = ?']
    const args = [req.tenantId]
    if (status === 'aktif') where.push('p.tanggal_kembali IS NULL')
    else if (status === 'selesai') where.push('p.tanggal_kembali IS NOT NULL')

    const rows = db.prepare(`
      SELECT p.*, b.judul, b.pengarang,
             CASE WHEN p.tanggal_kembali IS NULL AND p.jatuh_tempo < ? THEN 1 ELSE 0 END AS terlambat
      FROM pustaka_pinjam p
      LEFT JOIN pustaka_buku b ON b.id = p.buku_id AND b.tenant_id = p.tenant_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.jatuh_tempo, p.created_at DESC
      LIMIT 500
    `).all(hariIni(), ...args)

    // Denda berjalan dihitung saat baca, supaya kartu "terlambat" akurat
    // tanpa perlu cron yang memperbarui kolom setiap malam.
    for (const r of rows) {
      r.denda_berjalan = r.tanggal_kembali ? r.denda : hitungDenda(r.jatuh_tempo, null, tarif)
    }
    res.json(rows)
  })

  app.post('/api/pustaka/pinjam', authMiddleware, KELOLA, (req, res) => {
    const { buku_id, siswa_id, gtk_id, peminjam_nama, peminjam_kelas, catatan } = req.body || {}
    if (!buku_id) return res.status(400).json({ error: 'Buku wajib dipilih.' })

    const buku = db.prepare('SELECT id, judul, jumlah_salinan, aktif FROM pustaka_buku WHERE id=? AND tenant_id=?').get(String(buku_id), req.tenantId)
    if (!buku) return res.status(404).json({ error: 'Buku tidak ditemukan.' })
    if (!buku.aktif) return res.status(400).json({ error: 'Buku tidak aktif.' })

    const dipinjam = db.prepare("SELECT COUNT(*) n FROM pustaka_pinjam WHERE buku_id=? AND tenant_id=? AND tanggal_kembali IS NULL").get(buku.id, req.tenantId).n
    if (dipinjam >= buku.jumlah_salinan) {
      return res.status(400).json({ error: `Semua ${buku.jumlah_salinan} salinan sedang dipinjam.` })
    }

    // Nama peminjam diturunkan dari DB bila id diberikan — jangan percaya
    // nama yang dikirim klien, karena itu bisa dipalsukan.
    let nama = String(peminjam_nama || '').trim()
    let kelas = String(peminjam_kelas || '').trim()
    if (siswa_id) {
      const s = db.prepare('SELECT nama, rombel_id FROM siswa WHERE id=? AND tenant_id=?').get(String(siswa_id), req.tenantId)
      if (!s) return res.status(404).json({ error: 'Siswa tidak ditemukan.' })
      nama = s.nama
      if (s.rombel_id) {
        const rb = db.prepare('SELECT nama FROM rombel WHERE id=? AND tenant_id=?').get(s.rombel_id, req.tenantId)
        kelas = rb?.nama || kelas
      }
    } else if (gtk_id) {
      const g = db.prepare('SELECT nama FROM gtk WHERE id=? AND tenant_id=?').get(String(gtk_id), req.tenantId)
      if (!g) return res.status(404).json({ error: 'GTK tidak ditemukan.' })
      nama = g.nama
    }
    if (!nama) return res.status(400).json({ error: 'Peminjam wajib dipilih atau diisi namanya.' })

    const lama = bacaAngka(db, req.tenantId, KUNCI_LAMA_PINJAM, LAMA_PINJAM_DEFAULT) || LAMA_PINJAM_DEFAULT
    const tgl = hariIni()
    const id = crypto.randomUUID()
    db.prepare(`INSERT INTO pustaka_pinjam (id, buku_id, siswa_id, gtk_id, peminjam_nama, peminjam_kelas, tanggal_pinjam, jatuh_tempo, catatan, dicatat_id, tenant_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, buku.id, siswa_id || null, gtk_id || null, nama, kelas, tgl, tambahHari(tgl, lama),
        String(catatan || ''), req.user.id, req.tenantId)
    res.json({ id, jatuh_tempo: tambahHari(tgl, lama) })
  })

  app.post('/api/pustaka/pinjam/:id/kembali', authMiddleware, KELOLA, (req, res) => {
    const p = db.prepare('SELECT * FROM pustaka_pinjam WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!p) return res.status(404).json({ error: 'Catatan peminjaman tidak ditemukan.' })
    if (p.tanggal_kembali) return res.status(400).json({ error: 'Buku ini sudah dikembalikan.' })

    const tarif = bacaAngka(db, req.tenantId, KUNCI_DENDA, DENDA_DEFAULT)
    const tgl = String(req.body?.tanggal_kembali || hariIni())
    const denda = hitungDenda(p.jatuh_tempo, tgl, tarif)
    db.prepare('UPDATE pustaka_pinjam SET tanggal_kembali=?, denda=?, kondisi=?, catatan=? WHERE id=? AND tenant_id=?')
      .run(tgl, denda, String(req.body?.kondisi || 'baik'), String(req.body?.catatan || p.catatan || ''), p.id, req.tenantId)
    res.json({ success: true, denda, terlambat_hari: Math.max(0, Math.round((Date.parse(tgl) - Date.parse(p.jatuh_tempo)) / 86400000)) })
  })

  // Perpanjangan: hanya untuk yang belum kembali, dan hanya menggeser jatuh tempo.
  app.post('/api/pustaka/pinjam/:id/perpanjang', authMiddleware, KELOLA, (req, res) => {
    const p = db.prepare('SELECT * FROM pustaka_pinjam WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!p) return res.status(404).json({ error: 'Catatan peminjaman tidak ditemukan.' })
    if (p.tanggal_kembali) return res.status(400).json({ error: 'Sudah dikembalikan, tidak bisa diperpanjang.' })
    const lama = bacaAngka(db, req.tenantId, KUNCI_LAMA_PINJAM, LAMA_PINJAM_DEFAULT) || LAMA_PINJAM_DEFAULT
    const baru = tambahHari(p.jatuh_tempo, lama)
    db.prepare('UPDATE pustaka_pinjam SET jatuh_tempo=? WHERE id=? AND tenant_id=?').run(baru, p.id, req.tenantId)
    res.json({ success: true, jatuh_tempo: baru })
  })

  // ---- Statistik ----
  app.get('/api/pustaka/statistik', authMiddleware, BACA, (req, res) => {
    const tarif = bacaAngka(db, req.tenantId, KUNCI_DENDA, DENDA_DEFAULT)
    const lama = bacaAngka(db, req.tenantId, KUNCI_LAMA_PINJAM, LAMA_PINJAM_DEFAULT)
    const totalJudul = db.prepare('SELECT COUNT(*) n FROM pustaka_buku WHERE tenant_id=? AND aktif=1').get(req.tenantId).n
    const totalSalinan = db.prepare('SELECT COALESCE(SUM(jumlah_salinan),0) n FROM pustaka_buku WHERE tenant_id=? AND aktif=1').get(req.tenantId).n
    const dipinjam = db.prepare('SELECT COUNT(*) n FROM pustaka_pinjam WHERE tenant_id=? AND tanggal_kembali IS NULL').get(req.tenantId).n
    const terlambat = db.prepare('SELECT COUNT(*) n FROM pustaka_pinjam WHERE tenant_id=? AND tanggal_kembali IS NULL AND jatuh_tempo < ?').get(req.tenantId, hariIni()).n
    const dendaBelumBayar = db.prepare('SELECT COALESCE(SUM(denda - denda_dibayar),0) n FROM pustaka_pinjam WHERE tenant_id=? AND tanggal_kembali IS NOT NULL').get(req.tenantId).n
    res.json({ totalJudul, totalSalinan, dipinjam, tersedia: Math.max(0, totalSalinan - dipinjam), terlambat, dendaBelumBayar, tarifDenda: tarif, lamaPinjam: lama })
  })
}

module.exports = { setupPustakaTables, daftarkanRutePustaka, hitungDenda, DENDA_DEFAULT, LAMA_PINJAM_DEFAULT }
