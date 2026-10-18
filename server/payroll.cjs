'use strict'
// Modul Payroll & JTM (Jam Tatap Muka).
//
// Kondisi sebelumnya: `gtk` sudah menyimpan status kepegawaian (tetap/GTY/
// honorer), tetapi tidak ada tabel gaji, tidak ada perhitungan JTM, tidak ada
// slip. Penggajian dilakukan di luar sistem.
//
// Keputusan desain yang menentukan benar-salahnya modul ini:
//
//  1. JTM DIHITUNG DARI JURNAL MENGAJAR, bukan dari jadwal. Jadwal adalah
//     rencana; jurnal adalah bukti guru benar-benar masuk kelas. Membayar
//     berdasarkan jadwal berarti membayar pertemuan yang tidak pernah terjadi.
//
//  2. JAM SUBSTITUSI DIHITUNG UNTUK GURU PENGGANTI. Modul substitusi mencatat
//     siapa mengajar menggantikan siapa; kalau jam itu tidak masuk JTM
//     pengganti, guru yang menutup kelas orang lain tidak dibayar.
//
//  3. SLIP DISIMPAN SEBAGAI SNAPSHOT (angka beku), bukan dihitung ulang saat
//     dibaca. Kalau dihitung ulang, slip bulan lalu berubah ketika ada koreksi
//     jurnal — dan slip yang sudah dibayar tidak boleh berubah.
//
//  4. SATU SLIP PER GURU PER PERIODE, dijamin unique index.
const crypto = require('node:crypto')

const KUNCI_JP_MENIT = 'payroll_menit_per_jp'
const JP_MENIT_DEFAULT = 40

function setupPayrollTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payroll_komponen (
      id TEXT PRIMARY KEY,
      gtk_id TEXT NOT NULL,
      gaji_pokok INTEGER NOT NULL DEFAULT 0,
      tunjangan_jabatan INTEGER NOT NULL DEFAULT 0,
      tunjangan_kehadiran INTEGER NOT NULL DEFAULT 0,
      tunjangan_lain INTEGER NOT NULL DEFAULT 0,
      tarif_jtm INTEGER NOT NULL DEFAULT 0,
      potongan_tetap INTEGER NOT NULL DEFAULT 0,
      aktif INTEGER NOT NULL DEFAULT 1,
      tenant_id TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_komponen_unik
      ON payroll_komponen(tenant_id, gtk_id);

    CREATE TABLE IF NOT EXISTS payroll_periode (
      id TEXT PRIMARY KEY,
      bulan TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      catatan TEXT NOT NULL DEFAULT '',
      dibuat_id TEXT NOT NULL DEFAULT '',
      dibuat_nama TEXT NOT NULL DEFAULT '',
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_periode_unik
      ON payroll_periode(tenant_id, bulan);

    CREATE TABLE IF NOT EXISTS payroll_slip (
      id TEXT PRIMARY KEY,
      periode_id TEXT NOT NULL,
      gtk_id TEXT NOT NULL,
      nama TEXT NOT NULL DEFAULT '',
      jabatan TEXT NOT NULL DEFAULT '',
      status_kepegawaian TEXT NOT NULL DEFAULT '',
      jtm INTEGER NOT NULL DEFAULT 0,
      jtm_substitusi INTEGER NOT NULL DEFAULT 0,
      tarif_jtm INTEGER NOT NULL DEFAULT 0,
      gaji_pokok INTEGER NOT NULL DEFAULT 0,
      tunjangan_jabatan INTEGER NOT NULL DEFAULT 0,
      tunjangan_kehadiran INTEGER NOT NULL DEFAULT 0,
      tunjangan_lain INTEGER NOT NULL DEFAULT 0,
      honor_jtm INTEGER NOT NULL DEFAULT 0,
      potongan_tetap INTEGER NOT NULL DEFAULT 0,
      potongan_hadir INTEGER NOT NULL DEFAULT 0,
      total_bruto INTEGER NOT NULL DEFAULT 0,
      total_potongan INTEGER NOT NULL DEFAULT 0,
      total_bersih INTEGER NOT NULL DEFAULT 0,
      hari_tanpa_masuk INTEGER NOT NULL DEFAULT 0,
      catatan TEXT NOT NULL DEFAULT '',
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_slip_unik
      ON payroll_slip(tenant_id, periode_id, gtk_id);
    CREATE INDEX IF NOT EXISTS idx_payroll_slip_periode
      ON payroll_slip(tenant_id, periode_id);
  `)
}

// "07:30" -> 450 menit. Dipakai untuk menghitung durasi jam pelajaran.
const menit = (jam) => {
  const [h, m] = String(jam || '').split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0
}

function daftarkanRutePayroll(app, { db, authMiddleware, requireRole }) {
  setupPayrollTables(db)

  // Gaji = data paling sensitif di sistem. Guru boleh melihat slip DIRINYA
  // sendiri; hanya manajemen yang boleh melihat semua.
  const KELOLA = requireRole('admin', 'super_admin', 'kepala', 'bendahara', 'operator', 'tata_usaha', 'tu')
  const BACA_SEMUA = requireRole('admin', 'super_admin', 'kepala', 'bendahara', 'operator', 'tata_usaha', 'tu')

  const bacaAngkaGlobal = (kunci, bawaan) => {
    try {
      const n = Number(db.prepare('SELECT value FROM app_config WHERE key=?').get(kunci)?.value)
      return Number.isFinite(n) && n > 0 ? n : bawaan
    } catch { return bawaan }
  }
  const namaPemakai = (u) => u?.nama || u?.username || u?.email || 'Operator'

  // ======================= KOMPONEN GAJI =======================
  app.get('/api/payroll/komponen', authMiddleware, BACA_SEMUA, (req, res) => {
    const rows = db.prepare(`
      SELECT k.*, g.nama, g.jabatan, g.status_kepegawaian, g.nip
      FROM payroll_komponen k
      JOIN gtk g ON g.id = k.gtk_id AND g.tenant_id = k.tenant_id
      WHERE k.tenant_id = ?
      ORDER BY g.nama COLLATE NOCASE
    `).all(req.tenantId)
    res.json(rows)
  })

  app.put('/api/payroll/komponen/:gtkId', authMiddleware, KELOLA, (req, res) => {
    const g = db.prepare('SELECT id FROM gtk WHERE id=? AND tenant_id=?').get(req.params.gtkId, req.tenantId)
    if (!g) return res.status(404).json({ error: 'GTK tidak ditemukan.' })
    const b = req.body || {}
    const angka = (v) => Math.max(0, Math.round(Number(v) || 0))

    const ada = db.prepare('SELECT id FROM payroll_komponen WHERE tenant_id=? AND gtk_id=?').get(req.tenantId, req.params.gtkId)
    const nilai = [angka(b.gaji_pokok), angka(b.tunjangan_jabatan), angka(b.tunjangan_kehadiran),
      angka(b.tunjangan_lain), angka(b.tarif_jtm), angka(b.potongan_tetap), b.aktif === 0 ? 0 : 1]

    if (ada) {
      db.prepare(`UPDATE payroll_komponen SET gaji_pokok=?, tunjangan_jabatan=?, tunjangan_kehadiran=?,
        tunjangan_lain=?, tarif_jtm=?, potongan_tetap=?, aktif=?, updated_at=datetime('now')
        WHERE tenant_id=? AND gtk_id=?`).run(...nilai, req.tenantId, req.params.gtkId)
    } else {
      db.prepare(`INSERT INTO payroll_komponen (id, gtk_id, gaji_pokok, tunjangan_jabatan, tunjangan_kehadiran,
        tunjangan_lain, tarif_jtm, potongan_tetap, aktif, tenant_id)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(crypto.randomUUID(), req.params.gtkId, ...nilai, req.tenantId)
    }
    res.json({ success: true })
  })

  // ======================= HITUNG JTM =======================
  // JTM = jam mengajar yang terbukti dari jurnal + jam substitusi.
  // Dihitung per guru per bulan (YYYY-MM).
  const hitungJtm = (tenantId, gtkId, bulan) => {
    const menitPerJp = bacaAngkaGlobal(KUNCI_JP_MENIT, JP_MENIT_DEFAULT)

    // (a) Jurnal mengajar: setiap baris = satu pertemuan (jam_ke).
    const jurnal = db.prepare(`
      SELECT COUNT(DISTINCT tanggal || '#' || COALESCE(jam_ke, '')) AS n
      FROM jurnal_mengajar
      WHERE tenant_id=? AND guru_id=? AND substr(tanggal,1,7)=?
    `).get(tenantId, gtkId, bulan)?.n || 0

    // (b) Substitusi: guru ini masuk menggantikan guru lain. Durasi dihitung
    // dari jam_mulai/jam_selesai jadwal, dibagi menit per JP.
    const subs = db.prepare(`
      SELECT j.jam_mulai, j.jam_selesai
      FROM substitusi_guru s
      JOIN jadwal j ON j.id = s.jadwal_id AND j.tenant_id = s.tenant_id
      WHERE s.tenant_id=? AND s.gtk_pengganti_id=? AND substr(s.tanggal,1,7)=?
    `).all(tenantId, gtkId, bulan)

    let jpSubs = 0
    for (const s of subs) {
      const durasi = Math.max(0, menit(s.jam_selesai) - menit(s.jam_mulai))
      jpSubs += Math.round(durasi / menitPerJp)
    }

    return { jurnal, substitusi: jpSubs, total: jurnal + jpSubs, menitPerJp }
  }

  // Pratinjau JTM semua guru sebelum membuat periode — admin bisa memeriksa
  // angka sebelum mengunci slip.
  app.get('/api/payroll/jtm', authMiddleware, BACA_SEMUA, (req, res) => {
    const bulan = String(req.query.bulan || new Date().toISOString().slice(0, 7))
    const guru = db.prepare('SELECT id, nama, jabatan, status_kepegawaian FROM gtk WHERE tenant_id=? ORDER BY nama COLLATE NOCASE').all(req.tenantId)
    const hasil = guru.map(g => {
      const j = hitungJtm(req.tenantId, g.id, bulan)
      const k = db.prepare('SELECT tarif_jtm FROM payroll_komponen WHERE tenant_id=? AND gtk_id=?').get(req.tenantId, g.id)
      return { ...g, ...j, tarif_jtm: k?.tarif_jtm || 0, honor_jtm: (k?.tarif_jtm || 0) * j.total }
    })
    res.json({ bulan, menitPerJp: bacaAngkaGlobal(KUNCI_JP_MENIT, JP_MENIT_DEFAULT), guru: hasil })
  })

  // ======================= PERIODE =======================
  app.get('/api/payroll/periode', authMiddleware, BACA_SEMUA, (req, res) => {
    const rows = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM payroll_slip s WHERE s.periode_id=p.id AND s.tenant_id=p.tenant_id) AS jumlah_slip,
        (SELECT COALESCE(SUM(total_bersih),0) FROM payroll_slip s WHERE s.periode_id=p.id AND s.tenant_id=p.tenant_id) AS total_bersih
      FROM payroll_periode p
      WHERE p.tenant_id=?
      ORDER BY p.bulan DESC
      LIMIT 36
    `).all(req.tenantId)
    res.json(rows)
  })

  // Buat periode + hitung semua slip sekaligus (snapshot).
  app.post('/api/payroll/periode', authMiddleware, KELOLA, (req, res) => {
    const bulan = String(req.body?.bulan || '')
    if (!/^\d{4}-\d{2}$/.test(bulan)) return res.status(400).json({ error: 'Bulan wajib berformat YYYY-MM.' })
    const sudah = db.prepare('SELECT id FROM payroll_periode WHERE tenant_id=? AND bulan=?').get(req.tenantId, bulan)
    if (sudah) return res.status(409).json({ error: `Periode ${bulan} sudah ada. Hapus dulu bila ingin menghitung ulang.` })

    const menitPerJp = bacaAngkaGlobal(KUNCI_JP_MENIT, JP_MENIT_DEFAULT)
    const guru = db.prepare("SELECT id, nama, jabatan, status_kepegawaian FROM gtk WHERE tenant_id=? AND COALESCE(status,'aktif')<>'nonaktif' ORDER BY nama COLLATE NOCASE").all(req.tenantId)
    if (guru.length === 0) return res.status(400).json({ error: 'Belum ada data GTK untuk digaji.' })

    const periodeId = crypto.randomUUID()
    let jumlah = 0

    const jalankan = db.transaction(() => {
      db.prepare('INSERT INTO payroll_periode (id, bulan, status, dibuat_id, dibuat_nama, tenant_id) VALUES (?,?,?,?,?,?)')
        .run(periodeId, bulan, 'draft', req.user.id, namaPemakai(req.user), req.tenantId)

      for (const g of guru) {
        const k = db.prepare('SELECT * FROM payroll_komponen WHERE tenant_id=? AND gtk_id=?').get(req.tenantId, g.id)
        // Guru tanpa komponen tetap dibuatkan slip nol, supaya tidak ada yang
        // "hilang" diam-diam dari daftar gaji. Admin melihat siapa yang belum diisi.
        const jtm = hitungJtm(req.tenantId, g.id, bulan)
        const tarif = k?.tarif_jtm || 0
        const honor = tarif * jtm.total
        const pokok = k?.gaji_pokok || 0
        const tjJabatan = k?.tunjangan_jabatan || 0
        const tjHadir = k?.tunjangan_kehadiran || 0
        const tjLain = k?.tunjangan_lain || 0
        const potTetap = k?.potongan_tetap || 0

        // Potongan kehadiran: proporsional dari jumlah hari tanpa_masuk pada
        // bulan itu. Tarif potongan per hari = tunjangan_kehadiran / 25 hari kerja.
        const tanpaMasuk = db.prepare(`
          SELECT COUNT(*) n FROM absensi_guru
          WHERE tenant_id=? AND gtk_id=? AND substr(tanggal,1,7)=? AND status='tanpa_masuk'
        `).get(req.tenantId, g.id, bulan)?.n || 0
        const potHadir = tjHadir > 0 ? Math.round((tjHadir / 25) * tanpaMasuk) : 0

        const bruto = pokok + tjJabatan + tjHadir + tjLain + honor
        const potongan = potTetap + potHadir
        const bersih = bruto - potongan

        db.prepare(`INSERT INTO payroll_slip (id, periode_id, gtk_id, nama, jabatan, status_kepegawaian,
          jtm, jtm_substitusi, tarif_jtm, gaji_pokok, tunjangan_jabatan, tunjangan_kehadiran, tunjangan_lain,
          honor_jtm, potongan_tetap, potongan_hadir, total_bruto, total_potongan, total_bersih,
          hari_tanpa_masuk, tenant_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(crypto.randomUUID(), periodeId, g.id, g.nama, g.jabatan || '', g.status_kepegawaian || '',
            jtm.total, jtm.substitusi, tarif, pokok, tjJabatan, tjHadir, tjLain, honor,
            potTetap, potHadir, bruto, potongan, bersih, tanpaMasuk, req.tenantId)
        jumlah++
      }
    })
    jalankan()
    res.json({ id: periodeId, bulan, jumlah_slip: jumlah, menit_per_jp: menitPerJp })
  })

  app.get('/api/payroll/periode/:id/slip', authMiddleware, BACA_SEMUA, (req, res) => {
    const p = db.prepare('SELECT * FROM payroll_periode WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!p) return res.status(404).json({ error: 'Periode tidak ditemukan.' })
    const slip = db.prepare('SELECT * FROM payroll_slip WHERE periode_id=? AND tenant_id=? ORDER BY nama COLLATE NOCASE').all(p.id, req.tenantId)
    res.json({ periode: p, slip })
  })

  app.post('/api/payroll/periode/:id/final', authMiddleware, KELOLA, (req, res) => {
    const p = db.prepare('SELECT * FROM payroll_periode WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!p) return res.status(404).json({ error: 'Periode tidak ditemukan.' })
    if (p.status === 'final') return res.status(400).json({ error: 'Periode ini sudah final.' })
    db.prepare("UPDATE payroll_periode SET status='final', catatan=? WHERE id=? AND tenant_id=?")
      .run(String(req.body?.catatan || ''), p.id, req.tenantId)
    res.json({ success: true, status: 'final' })
  })

  app.delete('/api/payroll/periode/:id', authMiddleware, KELOLA, (req, res) => {
    const p = db.prepare('SELECT * FROM payroll_periode WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!p) return res.status(404).json({ error: 'Periode tidak ditemukan.' })
    // Periode final tidak boleh dihapus: slip yang sudah dibayar adalah bukti.
    if (p.status === 'final') return res.status(400).json({ error: 'Periode final tidak bisa dihapus. Itu bukti pembayaran.' })
    const jalankan = db.transaction(() => {
      db.prepare('DELETE FROM payroll_slip WHERE periode_id=? AND tenant_id=?').run(p.id, req.tenantId)
      db.prepare('DELETE FROM payroll_periode WHERE id=? AND tenant_id=?').run(p.id, req.tenantId)
    })
    jalankan()
    res.json({ success: true })
  })

  // Slip milik sendiri — guru boleh melihat gajinya tanpa melihat gaji orang lain.
  //
  // PENTING: `users.id` BUKAN `gtk.id`. Relasinya lewat kolom `users.gtk_id`.
  // Memakai req.user.id langsung akan selalu mengembalikan kosong — slip guru
  // tidak akan pernah muncul meski datanya ada.
  app.get('/api/payroll/slip-saya', authMiddleware, (req, res) => {
    const gtkId = db.prepare('SELECT gtk_id FROM users WHERE id=? AND tenant_id=?').get(req.user.id, req.tenantId)?.gtk_id
    if (!gtkId) return res.json([])
    const rows = db.prepare(`
      SELECT s.*, p.bulan, p.status AS status_periode
      FROM payroll_slip s
      JOIN payroll_periode p ON p.id = s.periode_id AND p.tenant_id = s.tenant_id
      WHERE s.tenant_id=? AND s.gtk_id=?
      ORDER BY p.bulan DESC LIMIT 24
    `).all(req.tenantId, gtkId)
    res.json(rows)
  })
}

module.exports = { setupPayrollTables, daftarkanRutePayroll, JP_MENIT_DEFAULT }
