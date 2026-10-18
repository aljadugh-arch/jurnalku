'use strict'
// Modul Substitusi Guru (guru pengganti).
//
// Kondisi sebelumnya: jadwal menyimpan `gtk_id` tetap. Kalau guru berhalangan,
// tidak ada cara mencatat siapa yang benar-benar mengajar — jurnal mengajar dan
// absensi guru jadi menunjuk orang yang tidak hadir. Modul ini menyimpan
// penggantian PER TANGGAL, bukan mengubah jadwal permanen.
//
// Keputusan desain penting:
//
//  1. Substitusi berlaku per TANGGAL, bukan mengubah `jadwal.gtk_id`. Kalau
//     jadwal diubah permanen, guru asli kehilangan jadwalnya selamanya.
//
//  2. Bentrok dicegah di SERVER. Guru pengganti yang sudah punya jadwal di jam
//     yang sama tidak boleh ditugaskan — kalau lolos, dua kelas kehilangan guru
//     dan tidak ada yang sadar sampai jam pelajaran dimulai.
//
//  3. Satu jadwal pada satu tanggal hanya boleh punya SATU substitusi aktif.
//     Dijamin unique index, bukan pengecekan aplikasi yang bisa balapan.
const crypto = require('node:crypto')

const HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']

function setupSubstitusiTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS substitusi_guru (
      id TEXT PRIMARY KEY,
      jadwal_id TEXT NOT NULL,
      tanggal TEXT NOT NULL,
      gtk_asli_id TEXT NOT NULL,
      gtk_pengganti_id TEXT NOT NULL,
      alasan TEXT NOT NULL DEFAULT '',
      catatan TEXT NOT NULL DEFAULT '',
      dicatat_id TEXT NOT NULL DEFAULT '',
      dicatat_nama TEXT NOT NULL DEFAULT '',
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_substitusi_unik
      ON substitusi_guru(tenant_id, jadwal_id, tanggal);
    CREATE INDEX IF NOT EXISTS idx_substitusi_tanggal
      ON substitusi_guru(tenant_id, tanggal);
  `)
}

// Nama hari dari tanggal ISO. Dipakai untuk mencocokkan `jadwal.hari`.
function hariDariTanggal(iso) {
  const d = new Date(String(iso) + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return ''
  return HARI[d.getUTCDay()]
}

// Dua rentang jam bertumpuk? Format "HH:MM". Perbandingan string aman karena
// semuanya nol-depan, tapi tetap dinormalkan agar "7:30" tidak salah urut.
const normJam = (j) => String(j || '').trim().padStart(5, '0')
function bentrok(mulai1, selesai1, mulai2, selesai2) {
  const a1 = normJam(mulai1), b1 = normJam(selesai1)
  const a2 = normJam(mulai2), b2 = normJam(selesai2)
  return a1 < b2 && a2 < b1
}

function daftarkanRuteSubstitusi(app, { db, authMiddleware, requireRole }) {
  setupSubstitusiTables(db)

  const KELOLA = requireRole('admin', 'super_admin', 'kepala', 'operator', 'tata_usaha', 'tu', 'wali_kelas')
  const BACA = requireRole('admin', 'super_admin', 'kepala', 'operator', 'tata_usaha', 'tu', 'guru', 'wali_kelas', 'bendahara')

  const namaPemakai = (u) => u?.nama || u?.username || u?.email || 'Operator'
  const hariIni = () => new Date().toISOString().slice(0, 10)

  // Cari jadwal bentrok untuk seorang guru pada tanggal tertentu.
  // Mengembalikan daftar jadwal yang jamnya bertumpuk.
  const cariBentrok = (tenantId, gtkId, tanggal, jamMulai, jamSelesai, kecualiJadwalId) => {
    const hari = hariDariTanggal(tanggal)
    if (!hari) return []
    const baris = db.prepare(`
      SELECT j.id, j.jam_mulai, j.jam_selesai, r.nama AS rombel, m.nama AS mapel
      FROM jadwal j
      LEFT JOIN rombel r ON r.id = j.rombel_id AND r.tenant_id = j.tenant_id
      LEFT JOIN mapel m ON m.id = j.mapel_id AND m.tenant_id = j.tenant_id
      WHERE j.tenant_id = ? AND j.gtk_id = ? AND lower(j.hari) = ?
        AND (? IS NULL OR j.id <> ?)
    `).all(tenantId, gtkId, hari, kecualiJadwalId || null, kecualiJadwalId || null)

    // Substitusi lain di tanggal yang sama juga menempati waktu guru itu.
    const subs = db.prepare(`
      SELECT s.jadwal_id, j.jam_mulai, j.jam_selesai, r.nama AS rombel, m.nama AS mapel
      FROM substitusi_guru s
      JOIN jadwal j ON j.id = s.jadwal_id AND j.tenant_id = s.tenant_id
      LEFT JOIN rombel r ON r.id = j.rombel_id AND r.tenant_id = j.tenant_id
      LEFT JOIN mapel m ON m.id = j.mapel_id AND m.tenant_id = j.tenant_id
      WHERE s.tenant_id = ? AND s.gtk_pengganti_id = ? AND s.tanggal = ?
    `).all(tenantId, gtkId, tanggal)

    return [...baris, ...subs].filter(x => bentrok(jamMulai, jamSelesai, x.jam_mulai, x.jam_selesai))
  }

  // ---- Daftar substitusi ----
  app.get('/api/substitusi', authMiddleware, BACA, (req, res) => {
    const { dari, sampai, tanggal, gtk_id } = req.query
    const where = ['s.tenant_id = ?']
    const args = [req.tenantId]
    if (tanggal) { where.push('s.tanggal = ?'); args.push(String(tanggal)) }
    if (dari) { where.push('s.tanggal >= ?'); args.push(String(dari)) }
    if (sampai) { where.push('s.tanggal <= ?'); args.push(String(sampai)) }
    if (gtk_id) { where.push('(s.gtk_asli_id = ? OR s.gtk_pengganti_id = ?)'); args.push(String(gtk_id), String(gtk_id)) }

    const rows = db.prepare(`
      SELECT s.*,
             ga.nama AS nama_asli, gp.nama AS nama_pengganti,
             j.jam_mulai, j.jam_selesai, j.hari,
             r.nama AS rombel, m.nama AS mapel
      FROM substitusi_guru s
      LEFT JOIN gtk ga ON ga.id = s.gtk_asli_id AND ga.tenant_id = s.tenant_id
      LEFT JOIN gtk gp ON gp.id = s.gtk_pengganti_id AND gp.tenant_id = s.tenant_id
      LEFT JOIN jadwal j ON j.id = s.jadwal_id AND j.tenant_id = s.tenant_id
      LEFT JOIN rombel r ON r.id = j.rombel_id AND r.tenant_id = j.tenant_id
      LEFT JOIN mapel m ON m.id = j.mapel_id AND m.tenant_id = j.tenant_id
      WHERE ${where.join(' AND ')}
      ORDER BY s.tanggal DESC, j.jam_mulai
      LIMIT 500
    `).all(...args)
    res.json(rows)
  })

  // ---- Calon pengganti + status bentrok ----
  // Endpoint ini yang membuat modul berguna: admin melihat siapa yang BENTROK
  // sebelum menugaskan, bukan sesudah.
  app.get('/api/substitusi/calon', authMiddleware, BACA, (req, res) => {
    const jadwalId = String(req.query.jadwal_id || '')
    const tanggal = String(req.query.tanggal || hariIni())
    if (!jadwalId) return res.status(400).json({ error: 'jadwal_id wajib diisi.' })

    const j = db.prepare('SELECT * FROM jadwal WHERE id=? AND tenant_id=?').get(jadwalId, req.tenantId)
    if (!j) return res.status(404).json({ error: 'Jadwal tidak ditemukan.' })

    const guru = db.prepare("SELECT id, nama, nip FROM gtk WHERE tenant_id=? ORDER BY nama COLLATE NOCASE").all(req.tenantId)
    const hasil = guru.map(g => {
      const b = cariBentrok(req.tenantId, g.id, tanggal, j.jam_mulai, j.jam_selesai, jadwalId)
      return {
        id: g.id, nama: g.nama, nip: g.nip,
        bentrok: b.length > 0,
        detail_bentrok: b.map(x => `${x.jam_mulai}-${x.jam_selesai} ${x.mapel || ''} ${x.rombel || ''}`.trim()),
      }
    })
    res.json({ jadwal: { id: j.id, jam_mulai: j.jam_mulai, jam_selesai: j.jam_selesai, hari: j.hari }, calon: hasil })
  })

  // ---- Catat substitusi ----
  app.post('/api/substitusi', authMiddleware, KELOLA, (req, res) => {
    const { jadwal_id, tanggal, gtk_pengganti_id, alasan, catatan, paksa } = req.body || {}
    if (!jadwal_id) return res.status(400).json({ error: 'Jadwal wajib dipilih.' })
    if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(String(tanggal))) return res.status(400).json({ error: 'Tanggal wajib diisi (YYYY-MM-DD).' })
    if (!gtk_pengganti_id) return res.status(400).json({ error: 'Guru pengganti wajib dipilih.' })

    const j = db.prepare('SELECT * FROM jadwal WHERE id=? AND tenant_id=?').get(String(jadwal_id), req.tenantId)
    if (!j) return res.status(404).json({ error: 'Jadwal tidak ditemukan.' })
    if (String(j.gtk_id) === String(gtk_pengganti_id)) {
      return res.status(400).json({ error: 'Guru pengganti tidak boleh sama dengan guru asli.' })
    }
    const pengganti = db.prepare('SELECT id, nama FROM gtk WHERE id=? AND tenant_id=?').get(String(gtk_pengganti_id), req.tenantId)
    if (!pengganti) return res.status(404).json({ error: 'Guru pengganti tidak ditemukan.' })

    // Sudah ada substitusi untuk jadwal+tanggal ini?
    const sudah = db.prepare('SELECT id, gtk_pengganti_id FROM substitusi_guru WHERE tenant_id=? AND jadwal_id=? AND tanggal=?')
      .get(req.tenantId, j.id, String(tanggal))
    if (sudah) return res.status(409).json({ error: 'Jadwal ini sudah punya guru pengganti pada tanggal tersebut. Hapus dulu yang lama.' })

    // Bentrok: TOLAK kecuali admin memaksa dengan alasan sadar.
    const b = cariBentrok(req.tenantId, pengganti.id, String(tanggal), j.jam_mulai, j.jam_selesai, j.id)
    if (b.length > 0 && !paksa) {
      return res.status(409).json({
        error: `${pengganti.nama} sudah punya jadwal di jam yang sama pada tanggal itu.`,
        bentrok: b.map(x => `${x.jam_mulai}-${x.jam_selesai} ${x.mapel || ''} ${x.rombel || ''}`.trim()),
        bisa_paksa: true,
      })
    }

    const id = crypto.randomUUID()
    db.prepare(`INSERT INTO substitusi_guru (id, jadwal_id, tanggal, gtk_asli_id, gtk_pengganti_id, alasan, catatan, dicatat_id, dicatat_nama, tenant_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, j.id, String(tanggal), j.gtk_id, pengganti.id, String(alasan || ''), String(catatan || ''),
        req.user.id, namaPemakai(req.user), req.tenantId)
    res.json({ id, nama_pengganti: pengganti.nama, dipaksa: b.length > 0 })
  })

  app.delete('/api/substitusi/:id', authMiddleware, KELOLA, (req, res) => {
    const r = db.prepare('DELETE FROM substitusi_guru WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
    if (!r.changes) return res.status(404).json({ error: 'Catatan substitusi tidak ditemukan.' })
    res.json({ success: true })
  })

  // ---- Statistik ----
  app.get('/api/substitusi/statistik', authMiddleware, BACA, (req, res) => {
    const bulan = String(req.query.bulan || new Date().toISOString().slice(0, 7))
    const total = db.prepare("SELECT COUNT(*) n FROM substitusi_guru WHERE tenant_id=? AND substr(tanggal,1,7)=?").get(req.tenantId, bulan).n
    const perGuru = db.prepare(`
      SELECT gp.nama, COUNT(*) n
      FROM substitusi_guru s
      JOIN gtk gp ON gp.id = s.gtk_pengganti_id AND gp.tenant_id = s.tenant_id
      WHERE s.tenant_id=? AND substr(s.tanggal,1,7)=?
      GROUP BY s.gtk_pengganti_id ORDER BY n DESC LIMIT 10
    `).all(req.tenantId, bulan)
    const perAlasan = db.prepare(`
      SELECT CASE WHEN trim(alasan)='' THEN '(tanpa alasan)' ELSE alasan END AS alasan, COUNT(*) n
      FROM substitusi_guru WHERE tenant_id=? AND substr(tanggal,1,7)=?
      GROUP BY alasan ORDER BY n DESC
    `).all(req.tenantId, bulan)
    res.json({ bulan, total, perGuru, perAlasan })
  })
}

module.exports = { setupSubstitusiTables, daftarkanRuteSubstitusi, hariDariTanggal, bentrok }
