'use strict'

// PPDB — Penerimaan Peserta Didik Baru (per lembaga).
//
// Alur:
//   1. Calon siswa/wali mengisi formulir pendaftaran (halaman publik, tanpa login).
//   2. Panitia memverifikasi berkas → status `terverifikasi` (atau `ditolak`).
//   3. Calon yang diterima melakukan DAFTAR ULANG → status `daftar_ulang`.
//   4. Panitia memasukkan pendaftar `daftar_ulang` ke ANTRIAN SISWA AKTIF, lalu
//      menerimanya menjadi siswa resmi (membuat baris `siswa`).
//
// Prinsip:
//  - Semua operasi tenant-scoped (`tenant_id` dari host/token, bukan dari input).
//  - Pendaftaran publik dibatasi: satu gelombang harus dibuka, dan NISN/email
//    ganda dalam satu lembaga ditolak.
//  - Nomor pendaftaran dibuat server (urut per gelombang), bukan dari klien.
//
// Biodata: formulir mengumpulkan SELURUH kolom biodata yang dipakai rapor
// (agama, status keluarga, anak ke, data ayah/ibu/wali). Tanpa ini, siswa yang
// masuk lewat PPDB punya biodata rapor kosong dan admin harus mengisi manual.

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

// Kolom biodata tambahan. Ditambahkan dengan ALTER TABLE agar database lama
// (yang sudah punya ppdb_pendaftar versi awal) tetap kompatibel.
const KOLOM_BIODATA = [
  ['nama_panggilan', 'TEXT'],
  ['agama', 'TEXT'],
  ['status_keluarga', 'TEXT'],
  ['anak_ke', 'INTEGER'],
  ['alamat_ortu', 'TEXT'],
  ['nama_ayah', 'TEXT'],
  ['kerja_ayah', 'TEXT'],
  ['nama_ibu', 'TEXT'],
  ['kerja_ibu', 'TEXT'],
  ['nama_wali', 'TEXT'],
  ['kerja_wali', 'TEXT'],
  ['nama_ortu', 'TEXT'],       // sudah ada di skema awal
  ['no_hp_ortu', 'TEXT'],      // sudah ada di skema awal
]

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

  // Migrasi aditif: kolom biodata (aman dijalankan berulang).
  const ada = new Set(db.prepare('PRAGMA table_info(ppdb_pendaftar)').all().map(c => c.name))
  for (const [nama, tipe] of KOLOM_BIODATA) {
    if (!ada.has(nama)) {
      try { db.exec(`ALTER TABLE ppdb_pendaftar ADD COLUMN ${nama} ${tipe}`) } catch { /* sudah ada */ }
    }
  }
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

// Agama yang diterima (bebas teks tetap disimpan, ini hanya untuk validasi UI).
const AGAMA_SAH = new Set(['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu', 'Lainnya'])

function bersih(v, maks = 200) {
  return String(v ?? '').trim().slice(0, maks)
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

    const nama = bersih(data.nama, 120)
    if (nama.length < 3) return { ok: false, error: 'Nama lengkap wajib diisi (minimal 3 huruf).' }
    const jk = String(data.jenis_kelamin || '').toUpperCase()
    if (!['L', 'P'].includes(jk)) return { ok: false, error: 'Jenis kelamin wajib dipilih.' }

    const nisn = String(data.nisn || '').replace(/[^0-9]/g, '')
    if (nisn && nisn.length !== 10) return { ok: false, error: 'NISN harus 10 digit angka.' }
    if (nisn) {
      const dup = db.prepare('SELECT id,nomor_daftar FROM ppdb_pendaftar WHERE tenant_id=? AND nisn=?').get(tenantId, nisn)
      if (dup) return { ok: false, error: `NISN ini sudah terdaftar dengan nomor ${dup.nomor_daftar}.` }
    }
    const nik = String(data.nik || '').replace(/[^0-9]/g, '')
    if (nik && nik.length !== 16) return { ok: false, error: 'NIK harus 16 digit angka.' }
    const hp = normalHp(data.no_hp)
    if (hp && hp.length < 10) return { ok: false, error: 'Nomor HP tidak valid.' }
    const email = bersih(data.email, 120).toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Format email tidak valid.' }

    // Anak ke: opsional, 1-20.
    let anakKe = null
    if (data.anak_ke != null && String(data.anak_ke).trim() !== '') {
      const n = Number(data.anak_ke)
      if (!Number.isFinite(n) || n < 1 || n > 20) return { ok: false, error: 'Anak ke harus angka 1–20.' }
      anakKe = Math.round(n)
    }

    // Agama: opsional, tapi kalau diisi harus dikenal.
    const agama = bersih(data.agama, 30)
    if (agama && !AGAMA_SAH.has(agama)) return { ok: false, error: 'Agama tidak dikenal.' }

    // Rombel pilihan: opsional, harus milik tenant ini.
    let rombelId = null
    if (data.pilihan_rombel_id) {
      const r = db.prepare('SELECT id FROM rombel WHERE id=? AND tenant_id=?').get(data.pilihan_rombel_id, tenantId)
      if (!r) return { ok: false, error: 'Kelas tujuan tidak ditemukan pada lembaga ini.' }
      rombelId = r.id
    }

    const id = crypto.randomUUID()
    const nomor = nomorBerikutnya(tenantId, gel)
    db.prepare(`INSERT INTO ppdb_pendaftar (id,tenant_id,gelombang_id,nomor_daftar,nama,nama_panggilan,jenis_kelamin,nisn,nik,
        tempat_lahir,tanggal_lahir,alamat,no_hp,email,nama_ortu,no_hp_ortu,asal_sekolah,pilihan_rombel_id,
        agama,status_keluarga,anak_ke,alamat_ortu,nama_ayah,kerja_ayah,nama_ibu,kerja_ibu,nama_wali,kerja_wali,
        status,catatan,dokumen_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, tenantId, gel.id, nomor, nama, bersih(data.nama_panggilan, 60) || null, jk, nisn || null, nik || null,
      bersih(data.tempat_lahir, 80) || null, data.tanggal_lahir || null,
      bersih(data.alamat, 500) || null, hp || null, email || null,
      bersih(data.nama_ortu, 120) || null, normalHp(data.no_hp_ortu) || null,
      bersih(data.asal_sekolah, 150) || null, rombelId,
      agama || null, bersih(data.status_keluarga, 40) || null, anakKe,
      bersih(data.alamat_ortu, 500) || null,
      bersih(data.nama_ayah, 120) || null, bersih(data.kerja_ayah, 80) || null,
      bersih(data.nama_ibu, 120) || null, bersih(data.kerja_ibu, 80) || null,
      bersih(data.nama_wali, 120) || null, bersih(data.kerja_wali, 80) || null,
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

  const ambilPendaftar = (tenantId, id) => db.prepare('SELECT * FROM ppdb_pendaftar WHERE id=? AND tenant_id=?').get(id, tenantId)

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

  /** Simpan daftar berkas (dokumen_json) untuk satu pendaftar. */
  const simpanDokumen = (tenantId, id, dokumen) => {
    const p = ambilPendaftar(tenantId, id)
    if (!p) return { ok: false, error: 'Pendaftar tidak ditemukan' }
    const bersihDok = Array.isArray(dokumen) ? dokumen.filter(d => d && d.url).slice(0, 10) : []
    db.prepare("UPDATE ppdb_pendaftar SET dokumen_json=?, updated_at=datetime('now') WHERE id=? AND tenant_id=?")
      .run(JSON.stringify(bersihDok), id, tenantId)
    return { ok: true, dokumen: bersihDok }
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
   *  - MENYALIN SELURUH BIODATA dari pendaftaran (agama, ortu, wali, dst) agar
   *    rapor tidak kosong dan admin tidak perlu entri ulang.
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

    const jalan = db.transaction(() => {
      // Salin biodata lengkap supaya rapor & data siswa langsung terisi.
      db.prepare(`INSERT INTO siswa (id,tenant_id,nis,nisn,nik,nama,nama_panggilan,jenis_kelamin,
          tempat_lahir,tanggal_lahir,alamat,no_hp,nama_ortu,agama,status_keluarga,anak_ke,
          alamat_ortu,nama_ayah,kerja_ayah,nama_ibu,kerja_ibu,nama_wali,kerja_wali,
          asal_sekolah,rombel_id,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'aktif')`).run(
        siswaId, tenantId, nis, p.nisn || null, p.nik || null, p.nama, p.nama_panggilan || null, p.jenis_kelamin,
        p.tempat_lahir || null, p.tanggal_lahir || null, p.alamat || null,
        p.no_hp_ortu || p.no_hp || null, p.nama_ortu || null,
        p.agama || null, p.status_keluarga || null, p.anak_ke || null,
        p.alamat_ortu || null, p.nama_ayah || null, p.kerja_ayah || null,
        p.nama_ibu || null, p.kerja_ibu || null, p.nama_wali || null, p.kerja_wali || null,
        p.asal_sekolah || null, rombelId,
      )
      db.prepare("UPDATE ppdb_pendaftar SET status=?, siswa_id=?, diterima_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND tenant_id=?")
        .run(STATUS.DITERIMA, siswaId, id, tenantId)
    })
    jalan()

    return { ok: true, siswa_id: siswaId, nis, pendaftar: db.prepare('SELECT * FROM ppdb_pendaftar WHERE id=?').get(id) }
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

  /** Rombel yang bisa dipilih calon (untuk formulir publik). */
  const rombelPublik = (tenantId) => db.prepare(
    "SELECT id, nama, tingkat FROM rombel WHERE tenant_id=? ORDER BY tingkat, nama"
  ).all(tenantId)

  return {
    STATUS, gelombangAktif, daftarGelombang, simpanGelombang, hapusGelombang,
    daftarPublik, daftarPendaftar, ambilPendaftar, ubahStatus, simpanDokumen, tandaiDaftarUlang,
    ringkasan, antrianSiswa, terimaJadiSiswa, terimaBanyak, normalHp, rombelPublik,
  }
}

function registerRoutes(app, db, { requireRole, authMiddleware, wrap, upload, akarUnggahan } = {}) {
  const svc = buatLayananPpdb(db)
  const berkas = require('./ppdb-berkas.cjs')
  const w = wrap || ((fn) => (req, res) => { try { fn(req, res) } catch (e) { res.status(500).json({ error: e.message }) } })
  const PANITIA = requireRole ? requireRole('admin', 'super_admin', 'operator', 'tata_usaha', 'tu', 'kepala') : authMiddleware

  // --- Publik (tanpa login) — halaman pendaftaran calon siswa ---
  app.get('/api/ppdb/publik/info', w((req, res) => {
    const gel = svc.gelombangAktif(req.tenantId)
    res.json({
      dibuka: !!gel,
      gelombang: gel ? { id: gel.id, nama: gel.nama, tahun_ajaran: gel.tahun_ajaran, tanggal_buka: gel.tanggal_buka, tanggal_tutup: gel.tanggal_tutup, kuota: gel.kuota, biaya: gel.biaya, keterangan: gel.keterangan } : null,
      // Pilihan kelas tujuan untuk formulir (kosong bila lembaga belum punya rombel).
      rombel: svc.rombelPublik(req.tenantId),
      // Identitas lembaga agar halaman publik bisa menampilkan nama sekolah.
      lembaga: req.tenant ? { nama: req.tenant.nama, slug: req.tenant.slug, jenjang: req.tenant.jenjang } : null,
    })
  }))
  app.post('/api/ppdb/publik/daftar', w((req, res) => {
    const hasil = svc.daftarPublik(req.tenantId, req.body || {})
    if (!hasil.ok) return res.status(400).json({ error: hasil.error })
    res.json({ success: true, nomor_daftar: hasil.pendaftar.nomor_daftar, nama: hasil.pendaftar.nama, gelombang: hasil.gelombang?.nama, id: hasil.pendaftar.id })
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

  // Unggah berkas pendaftaran (publik, tanpa login) — OPSIONAL.
  // Diterima sebelum pendaftaran dikirim; hasilnya berupa daftar URL yang
  // kemudian disertakan klien pada saat POST /daftar (field dokumen_json).
  if (upload && akarUnggahan) {
    app.post('/api/ppdb/publik/unggah', (req, res) => {
      upload.array('berkas', berkas.MAKS_BERKAS)(req, res, (err) => {
        if (err) {
          const pesan = err.code === 'LIMIT_FILE_SIZE'
            ? `Ukuran berkas melebihi ${berkas.UKURAN_MAKS / 1024 / 1024} MB.`
            : err.code === 'LIMIT_FILE_COUNT'
              ? `Maksimal ${berkas.MAKS_BERKAS} berkas per pendaftaran.`
              : err.message || 'Gagal mengunggah berkas.'
          return res.status(400).json({ error: pesan })
        }
        const files = Array.isArray(req.files) ? req.files : []
        if (!files.length) return res.status(400).json({ error: 'Tidak ada berkas yang dikirim.' })
        try {
          const hasil = files.map(f => berkas.simpanBerkas(akarUnggahan, req.tenantId, f))
          res.json({ success: true, berkas: hasil })
        } catch (e) {
          res.status(400).json({ error: e.message })
        }
      })
    })

    // Hapus satu berkas (mis. calon salah unggah). Hanya dalam folder tenant sendiri.
    app.delete('/api/ppdb/publik/unggah', w((req, res) => {
      const url = String(req.body?.url || '')
      if (!url.startsWith('/uploads/ppdb/')) return res.status(400).json({ error: 'Berkas tidak dikenal.' })
      const dihapus = berkas.hapusBerkas(akarUnggahan, req.tenantId, url)
      res.json({ success: dihapus })
    }))
  }

  // Cek status pendaftaran (publik, pakai nomor + NISN agar tidak bisa diintip).
  app.post('/api/ppdb/publik/status', w((req, res) => {
    const nomor = String(req.body?.nomor_daftar || '').trim().toUpperCase()
    const nisn = String(req.body?.nisn || '').replace(/[^0-9]/g, '')
    const p = db.prepare('SELECT * FROM ppdb_pendaftar WHERE tenant_id=? AND nomor_daftar=?').get(req.tenantId, nomor)
    if (!p) return res.status(404).json({ error: 'Nomor pendaftaran tidak ditemukan.' })
    if (p.nisn && nisn !== p.nisn) return res.status(400).json({ error: 'NISN tidak cocok.' })
    res.json({
      nomor_daftar: p.nomor_daftar, nama: p.nama, status: p.status,
      catatan: p.catatan || null, gelombang_id: p.gelombang_id,
      dokumen: p.dokumen_json ? JSON.parse(p.dokumen_json) : [],
    })
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
  app.get('/api/ppdb/pendaftar/:id', PANITIA, w((req, res) => {
    const p = svc.ambilPendaftar(req.tenantId, req.params.id)
    if (!p) return res.status(404).json({ error: 'Pendaftar tidak ditemukan' })
    res.json({ ...p, dokumen: p.dokumen_json ? JSON.parse(p.dokumen_json) : [] })
  }))
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

module.exports = { buatLayananPpdb, registerRoutes, setupPpdbTables, STATUS, normalHp, KOLOM_BIODATA, AGAMA_SAH }
