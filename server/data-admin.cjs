'use strict'

// Manajemen Data Super Admin — operasi massal per bagian data, lintas tenant.
//
// Tujuan (permintaan pemilik platform): dari SATU halaman super admin bisa
// melihat isi tiap bagian data, mengekspor, mengimpor, dan MENGHAPUS data
// (siswa, GTK, nilai, dst) — baik untuk satu lembaga maupun seluruh platform —
// tanpa harus masuk ke dashboard tiap lembaga satu per satu.
//
// Prinsip keselamatan:
//  - TIDAK PERNAH menyentuh tabel sensitif (users, wa_gateway_config, kredensial).
//  - Semua operasi dibatasi daftar tabel yang dikenal (SECTIONS dari
//    backup-restore.cjs) → tidak ada nama tabel arbitrer dari klien.
//  - Penghapusan WAJIB memakai kode konfirmasi yang dihitung server dan hanya
//    berlaku untuk (bagian + tenant + jumlah baris) yang sama.
//  - Setiap operasi ditulis ke `data_admin_log` sebagai jejak audit.

const crypto = require('node:crypto')
const { SECTIONS, EXCLUDED } = require('./backup-restore.cjs')

// Bagian yang boleh dikelola massal + kunci tabelnya.
const BAGIAN = Object.freeze({
  siswa: { label: 'Data Siswa', tables: ['siswa'] },
  gtk: { label: 'Data GTK', tables: ['gtk'] },
  mapel: { label: 'Mata Pelajaran', tables: ['mapel'] },
  rombel: { label: 'Rombongan Belajar', tables: ['rombel'] },
  nilai: { label: 'Nilai & Rapor', tables: ['penilaian_harian', 'rapor', 'catatan_kepribadian'] },
  jurnal: { label: 'Jurnal Mengajar', tables: ['jurnal_mengajar'] },
  absensi: { label: 'Absensi', tables: ['absensi_siswa', 'absensi_guru'] },
  jadwal: { label: 'Jadwal', tables: ['jadwal', 'pengajar'] },
  tagihan: { label: 'Tagihan & Pembayaran', tables: ['tagihan', 'jenis_tagihan'] },
  tabungan: { label: 'Tabungan', tables: ['tabungan'] },
  keuangan: { label: 'Laporan Keuangan', tables: ['keuangan_transaksi'] },
  ekskul: { label: 'Ekstrakurikuler', tables: ['ekskul', 'ekskul_anggota'] },
  kantin: { label: 'Kantin', tables: ['kantin_menu', 'kantin_orders'] },
  modul: { label: 'Modul Ajar', tables: ['modul_ajar'] },
  pengaturan: { label: 'Pengaturan Lembaga', tables: ['settings'] },
  notif: { label: 'Pengaturan Notifikasi', tables: ['notif_settings'] },
})

const TABEL_TERLARANG = new Set(['users', 'wa_gateway_config', 'tenants', 'subscription_plans', 'data_admin_log'])

function kodeKonfirmasi(bagian, tenantId, jumlah) {
  return crypto.createHash('sha256')
    .update(`hapus|${bagian}|${tenantId || 'semua'}|${jumlah}`)
    .digest('hex').slice(0, 8).toUpperCase()
}

/**
 * Graf ketergantungan FK: untuk tiap tabel, daftar tabel yang MERUJUK ke tabel itu.
 * Dipakai agar penghapusan bisa menyapu data turunan lebih dulu — tanpa ini,
 * FK `NOT NULL` (mis. jurnal_mengajar.guru_id → gtk.id) membuat DELETE gagal.
 */
function grafKetergantungan(db) {
  const tabel = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name)
  const anak = {} // induk -> Set(anak yang merujuk induk)
  for (const t of tabel) {
    anak[t] = anak[t] || new Set()
    let fks = []
    try { fks = db.prepare(`PRAGMA foreign_key_list("${t}")`).all() } catch { fks = [] }
    for (const f of fks) {
      if (!f.table || TABEL_TERLARANG.has(f.table)) continue
      if (!anak[f.table]) anak[f.table] = new Set()
      anak[f.table].add(t)
    }
  }
  return anak
}

/**
 * Urutan hapus: turunan lebih dulu, induk terakhir (post-order DFS).
 * Dikembalikan daftar tabel unik, dibatasi hanya tabel yang punya tenant_id.
 */
function urutanHapus(db, tabelInti) {
  const anak = grafKetergantungan(db)
  const punyaTenant = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
      .map(r => r.name)
      .filter(t => {
        try { return db.prepare(`PRAGMA table_info("${t}")`).all().some(c => c.name === 'tenant_id') } catch { return false }
      })
  )
  const urut = [], dikunjungi = new Set()
  const telusuri = (t) => {
    if (dikunjungi.has(t)) return
    dikunjungi.add(t)
    for (const a of (anak[t] || [])) {
      if (TABEL_TERLARANG.has(a) || a === t) continue
      telusuri(a)
    }
    if (punyaTenant.has(t)) urut.push(t)
  }
  telusuri(tabelInti)
  return urut
}

/** Cek integritas FK — dipakai untuk MEMBUKTIKAN penghapusan tidak meninggalkan orphan. */
function cekIntegritasFk(db) {
  try {
    const rows = db.prepare('PRAGMA foreign_key_check').all()
    return { ok: rows.length === 0, pelanggaran: rows.length, contoh: rows.slice(0, 5) }
  } catch (e) { return { ok: null, error: e.message } }
}

function buatManajemenData(db, { logger = console } = {}) {
  // Audit trail operasi destruktif.
  db.exec(`CREATE TABLE IF NOT EXISTS data_admin_log (
    id TEXT PRIMARY KEY,
    aksi TEXT NOT NULL,
    bagian TEXT NOT NULL,
    tenant_id TEXT,
    jumlah INTEGER NOT NULL DEFAULT 0,
    detail TEXT,
    oleh TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  const catat = (aksi, bagian, tenantId, jumlah, detail, oleh) => {
    try {
      db.prepare('INSERT INTO data_admin_log(id,aksi,bagian,tenant_id,jumlah,detail,oleh) VALUES(?,?,?,?,?,?,?)')
        .run(crypto.randomUUID(), aksi, bagian, tenantId || null, jumlah, detail || null, oleh || null)
    } catch (e) { logger.error?.('[manajemen-data] gagal catat audit', e.message) }
  }

  const daftarTenant = () => db.prepare('SELECT id, slug, nama, plan, aktif FROM tenants ORDER BY nama').all()

  const bagianValid = (key) => Object.prototype.hasOwnProperty.call(BAGIAN, key)
  const tabelAman = (t) => !TABEL_TERLARANG.has(t) && Object.values(SECTIONS).some(s => s.tables.includes(t))
    && Object.values(BAGIAN).some(b => b.tables.includes(t))

  /** Ringkasan: jumlah baris tiap bagian, opsional per tenant. */
  function ringkasan(tenantId) {
    const out = []
    for (const [key, def] of Object.entries(BAGIAN)) {
      let total = 0
      const perTabel = []
      for (const t of def.tables) {
        if (!tabelAman(t)) continue
        try {
          const row = tenantId
            ? db.prepare(`SELECT COUNT(*) AS n FROM "${t}" WHERE tenant_id=?`).get(tenantId)
            : db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get()
          const n = row?.n || 0
          total += n
          perTabel.push({ tabel: t, jumlah: n })
        } catch { /* tabel belum ada di DB ini — lewati */ }
      }
      out.push({ key, label: def.label, jumlah: total, per_tabel: perTabel })
    }
    return out
  }

  /** Ekspor baris satu bagian (satu tenant atau seluruh platform) sebagai JSON. */
  function ekspor(bagian, tenantId) {
    if (!bagianValid(bagian)) throw new Error('Bagian data tidak dikenal')
    const def = BAGIAN[bagian]
    const hasil = {}
    for (const t of def.tables) {
      if (!tabelAman(t)) continue
      try {
        const rows = tenantId
          ? db.prepare(`SELECT * FROM "${t}" WHERE tenant_id=?`).all(tenantId)
          : db.prepare(`SELECT * FROM "${t}"`).all()
        hasil[t] = rows
      } catch { hasil[t] = [] }
    }
    return { bagian, label: def.label, tenant_id: tenantId || null, dibuat: new Date().toISOString(), tabel: hasil }
  }

  /**
   * Impor baris satu bagian. `mode='merge'` = INSERT OR REPLACE (aman, kunci
   * primer tetap dihormati); `mode='replace'` = hapus dulu isi tenant itu.
   */
  function impor(bagian, tenantId, payload, mode = 'merge') {
    if (!bagianValid(bagian)) throw new Error('Bagian data tidak dikenal')
    const def = BAGIAN[bagian]
    const data = payload?.tabel || payload || {}
    let masuk = 0, dilewati = 0
    const jalan = db.transaction(() => {
      if (mode === 'replace') {
        for (const t of def.tables) {
          if (!tabelAman(t)) continue
          try { tenantId ? db.prepare(`DELETE FROM "${t}" WHERE tenant_id=?`).run(tenantId) : db.prepare(`DELETE FROM "${t}"`).run() } catch { /* lewati */ }
        }
      }
      for (const t of def.tables) {
        if (!tabelAman(t)) continue
        const rows = Array.isArray(data[t]) ? data[t] : []
        if (!rows.length) continue
        let kolom
        try { kolom = db.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name) } catch { continue }
        if (!kolom.length) continue
        const pakai = kolom.filter(c => c !== 'tenant_id' && Object.prototype.hasOwnProperty.call(rows[0], c))
        if (!pakai.length) continue
        const stmt = db.prepare(`INSERT OR REPLACE INTO "${t}" (${[...pakai, 'tenant_id'].map(c => `"${c}"`).join(',')}) VALUES (${[...pakai, 'tenant_id'].map(() => '?').join(',')})`)
        for (const r of rows) {
          // Paksa tenant_id ke tenant tujuan → mencegah impor menyeberang tenant.
          const vals = pakai.map(c => r[c] === undefined ? null : r[c])
          vals.push(tenantId || r.tenant_id)
          try { stmt.run(...vals); masuk++ } catch { dilewati++ }
        }
      }
    })
    jalan()
    return { bagian, label: def.label, mode, masuk, dilewati, tenant_id: tenantId || null }
  }

  /**
   * Analisis penghapusan FK-aware.
   *  - Kolom FK NOT NULL → baris anak HARUS dihapus (kalau tidak, DELETE induk gagal).
   *  - Kolom FK nullable  → cukup di-NULL-kan (mis. rombel.wali_kelas_id) supaya
   *    data yang bukan milik bagian ini tidak ikut terhapus.
   * Mengembalikan urutan hapus (anak lebih dulu) + daftar kolom yang di-NULL-kan.
   */
  function analisisHapus(tabelInti) {
    const semuaTabel = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name)
    const punyaTenant = new Set(semuaTabel.filter(t => {
      try { return db.prepare(`PRAGMA table_info("${t}")`).all().some(c => c.name === 'tenant_id') } catch { return false }
    }))
    const notNull = {}
    const rujuk = {} // induk -> [{anak, kolom}]
    for (const t of semuaTabel) {
      notNull[t] = {}
      try { for (const c of db.prepare(`PRAGMA table_info("${t}")`).all()) notNull[t][c.name] = !!c.notnull } catch { /* lewati */ }
      let fks = []
      try { fks = db.prepare(`PRAGMA foreign_key_list("${t}")`).all() } catch { fks = [] }
      for (const f of fks) {
        if (!f.table || f.table === t || TABEL_TERLARANG.has(f.table) || TABEL_TERLARANG.has(t)) continue
        ;(rujuk[f.table] = rujuk[f.table] || []).push({ anak: t, kolom: f.from })
      }
    }
    const hapus = [], setNull = [], terhalang = []
    const dikunjungi = new Set()
    const telusuri = (t) => {
      if (dikunjungi.has(t)) return
      dikunjungi.add(t)
      for (const { anak, kolom } of (rujuk[t] || [])) {
        if (TABEL_TERLARANG.has(anak)) continue
        if (notNull[anak]?.[kolom]) {
          // Anak wajib dihapus lebih dulu — tapi hanya bila bisa dipisah per tenant.
          if (!punyaTenant.has(anak)) { terhalang.push({ tabel: anak, kolom, alasan: 'tabel anak tidak punya tenant_id — tidak bisa dihapus aman' }); continue }
          telusuri(anak)
          hapus.push(anak)
        } else {
          // Nullable: putuskan tautannya saja, jangan hapus datanya.
          setNull.push({ tabel: anak, kolom })
        }
      }
    }
    telusuri(tabelInti)
    hapus.push(tabelInti)
    // Dedup, pertahankan urutan (anak dulu, induk terakhir).
    const unik = [...new Set(hapus)].filter(t => punyaTenant.has(t))
    const setNullUnik = []
    const seen = new Set()
    for (const s of setNull) { const k = s.tabel + '.' + s.kolom; if (!seen.has(k)) { seen.add(k); setNullUnik.push(s) } }
    return { hapus: unik, setNull: setNullUnik, terhalang }
  }

  /**
   * Hapus seluruh baris satu bagian. `kode` wajib cocok dengan kodeKonfirmasi
   * yang dihitung dari (bagian, tenantId, jumlah baris saat ini) — mencegah
   * penghapusan karena salah klik atau permintaan yang basi.
   *
   * Penghapusan menyapu tabel turunan lebih dulu (FK-aware) dan melaporkan
   * RINCIAN per tabel. Bila ada tabel yang gagal dihapus, itu DILAPORKAN —
   * tidak pernah lagi dilaporkan "berhasil" dengan angka 0.
   */
  function hapus(bagian, tenantId, kode, oleh) {
    if (!bagianValid(bagian)) throw new Error('Bagian data tidak dikenal')
    const def = BAGIAN[bagian]
    let jumlah = 0
    const hitung = []
    for (const t of def.tables) {
      if (!tabelAman(t)) continue
      try {
        const row = tenantId
          ? db.prepare(`SELECT COUNT(*) AS n FROM "${t}" WHERE tenant_id=?`).get(tenantId)
          : db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get()
        const n = row?.n || 0
        hitung.push({ tabel: t, jumlah: n })
        jumlah += n
      } catch { /* lewati */ }
    }
    const benar = kodeKonfirmasi(bagian, tenantId, jumlah)
    if (String(kode || '').trim().toUpperCase() !== benar) {
      const err = new Error(`Kode konfirmasi salah. Kode yang benar untuk ${jumlah} baris: ${benar}`)
      err.kode_benar = benar
      err.jumlah = jumlah
      throw err
    }

    const rencana = analisisHapus(def.tables[0])
    const rincian = []
    const gagal = []
    const diNull = []
    let dihapus = 0

    const jalan = db.transaction(() => {
      for (const s of rencana.setNull) {
        try {
          const info = tenantId
            ? db.prepare(`UPDATE "${s.tabel}" SET "${s.kolom}"=NULL WHERE tenant_id=?`).run(tenantId)
            : db.prepare(`UPDATE "${s.tabel}" SET "${s.kolom}"=NULL`).run()
          if (info.changes) diNull.push({ tabel: s.tabel, kolom: s.kolom, jumlah: info.changes })
        } catch (e) { gagal.push({ tabel: s.tabel, operasi: 'null ' + s.kolom, error: e.message }) }
      }
      for (const t of rencana.hapus) {
        try {
          const info = tenantId
            ? db.prepare(`DELETE FROM "${t}" WHERE tenant_id=?`).run(tenantId)
            : db.prepare(`DELETE FROM "${t}"`).run()
          const n = info.changes || 0
          dihapus += n
          if (n) rincian.push({ tabel: t, jumlah: n })
        } catch (e) {
          // JANGAN telan error — laporkan supaya tidak ada klaim sukses palsu.
          gagal.push({ tabel: t, operasi: 'delete', error: e.message })
        }
      }
    })
    jalan()

    const integritas = cekIntegritasFk(db)
    catat('hapus', bagian, tenantId, dihapus, JSON.stringify({ rincian, gagal, diNull }), oleh)

    if (gagal.length) {
      const err = new Error(`Sebagian data gagal dihapus (${gagal.length} tabel). Lihat rincian.`)
      err.partial = { bagian, label: def.label, dihapus, rincian, gagal, di_null: diNull, integritas, tenant_id: tenantId || null }
      throw err
    }
    return {
      bagian, label: def.label, dihapus, tenant_id: tenantId || null,
      rincian, di_null: diNull, tabel_disentuh: rencana.hapus, terhalang: rencana.terhalang, integritas,
    }
  }

  function riwayat(limit = 50) {
    try { return db.prepare('SELECT * FROM data_admin_log ORDER BY created_at DESC LIMIT ?').all(limit) } catch { return [] }
  }

  return { ringkasan, ekspor, impor, hapus, riwayat, daftarTenant, kodeKonfirmasi, BAGIAN, EXCLUDED }
}

function registerRoutes(app, db, { SUPER, authMiddleware, wrap, logger } = {}) {
  const svc = buatManajemenData(db, { logger })
  const gate = SUPER || authMiddleware
  const w = wrap || ((fn) => (req, res) => { try { fn(req, res) } catch (e) { res.status(500).json({ error: e.message }) } })

  app.get('/api/data-admin/bagian', gate, w((req, res) => {
    res.json({ bagian: Object.entries(svc.BAGIAN).map(([key, v]) => ({ key, label: v.label })), tenant: svc.daftarTenant(), dikecualikan: svc.EXCLUDED })
  }))

  app.get('/api/data-admin/ringkasan', gate, w((req, res) => {
    res.json({ tenant_id: req.query.tenant_id || null, ringkasan: svc.ringkasan(req.query.tenant_id || null) })
  }))

  app.get('/api/data-admin/ekspor/:bagian', gate, w((req, res) => {
    const data = svc.ekspor(req.params.bagian, req.query.tenant_id || null)
    res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="jurnalku-${req.params.bagian}-${Date.now()}.json"` }).send(JSON.stringify(data, null, 2))
  }))

  app.post('/api/data-admin/impor', gate, w((req, res) => {
    const { bagian, tenant_id, mode } = req.body || {}
    if (!req.body?.payload) return res.status(400).json({ error: 'Payload impor wajib diisi' })
    res.json({ success: true, ...svc.impor(bagian, tenant_id || null, req.body.payload, mode === 'replace' ? 'replace' : 'merge') })
  }))

  // Kode konfirmasi dihitung server dari kondisi data SAAT INI.
  app.get('/api/data-admin/kode-hapus', gate, w((req, res) => {
    const bagian = req.query.bagian
    const tenantId = req.query.tenant_id || null
    const ringkas = svc.ringkasan(tenantId).find(r => r.key === bagian)
    if (!ringkas) return res.status(404).json({ error: 'Bagian data tidak dikenal' })
    res.json({ bagian, tenant_id: tenantId, jumlah: ringkas.jumlah, kode: svc.kodeKonfirmasi(bagian, tenantId, ringkas.jumlah) })
  }))

  app.post('/api/data-admin/hapus', gate, w((req, res) => {
    const { bagian, tenant_id, kode } = req.body || {}
    try {
      res.json({ success: true, ...svc.hapus(bagian, tenant_id || null, kode, req.user?.email || req.user?.nama || null) })
    } catch (e) {
      if (e.kode_benar) return res.status(400).json({ error: e.message, kode_benar: e.kode_benar, jumlah: e.jumlah })
      throw e
    }
  }))

  app.get('/api/data-admin/riwayat', gate, w((req, res) => res.json(svc.riwayat(Number(req.query.limit) || 50))))

  return svc
}

module.exports = { buatManajemenData, registerRoutes, BAGIAN, kodeKonfirmasi, TABEL_TERLARANG }
