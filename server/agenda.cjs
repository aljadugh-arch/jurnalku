'use strict'
// Agenda pribadi per pengguna. Berbeda dari kalender_kbm (kalender akademik
// lembaga yang diisi admin), agenda di sini adalah pengingat milik satu akun:
// guru mencatat "kumpulkan tugas VII-A", siswa mencatat "ulangan matematika",
// wali murid mencatat "bayar SPP", bendahara mencatat "rekap kas pekan ini".
//
// Semua peran boleh menulis agenda sendiri. Admin juga boleh membuat agenda
// untuk seluruh lembaga (tampil ke semua pengguna), tetapi itu tetap terpisah
// dari kalender KBM supaya tidak mengotori kalender akademik.

const crypto = require('crypto')

const JUDUL_MAKS = 160
const CATATAN_MAKS = 1000
const PRIORITAS = new Set(['rendah', 'normal', 'tinggi'])

function todayJakarta() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

function tambahMenit(hhmm, delta) {
  const [h, m] = String(hhmm || '00:00').slice(0, 5).split(':').map(Number)
  const total = Math.max(0, Math.min(23 * 60 + 59, (h * 60 + m) + delta))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function daftarkanRouteAgenda(app, { db, authMiddleware }) {
  db.exec(`CREATE TABLE IF NOT EXISTS agenda_pribadi (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    tanggal TEXT NOT NULL,
    jam TEXT,
    judul TEXT NOT NULL,
    catatan TEXT DEFAULT '',
    prioritas TEXT DEFAULT 'normal',
    selesai INTEGER DEFAULT 0,
    selesai_at TEXT,
    pengingat_menit INTEGER DEFAULT 0,
    sumber TEXT DEFAULT 'manual',
    ref_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT
  )`)
  db.exec('CREATE INDEX IF NOT EXISTS idx_agenda_user_tanggal ON agenda_pribadi(tenant_id,user_id,tanggal)')

  // Agenda bersama: dibuat admin, tampil untuk seluruh pengguna lembaga.
  db.exec(`CREATE TABLE IF NOT EXISTS agenda_lembaga (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    tanggal TEXT NOT NULL,
    jam TEXT,
    judul TEXT NOT NULL,
    catatan TEXT DEFAULT '',
    prioritas TEXT DEFAULT 'normal',
    dibuat_oleh TEXT,
    selesai_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`)
  db.exec('CREATE INDEX IF NOT EXISTS idx_agenda_lembaga ON agenda_lembaga(tenant_id,tanggal)')

  // Status "selesai" untuk agenda lembaga bersifat per pengguna: satu guru
  // menandai selesai tidak boleh menghapus centang milik guru lain.
  db.exec(`CREATE TABLE IF NOT EXISTS agenda_lembaga_selesai (
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    agenda_id TEXT NOT NULL,
    selesai_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (tenant_id,user_id,agenda_id)
  )`)

  const bersihTeks = (v, maks) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, maks)
  // Validasi tanggal harus memeriksa bahwa tanggalnya benar-benar ada:
  // pola 4-2-2 saja meloloskan 2026-13-45 yang akan merusak urutan agenda.
  const tanggalSah = (v) => {
    const t = String(v || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
    const d = new Date(`${t}T12:00:00Z`)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10) === t ? t : null
  }
  const jamSah = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v).slice(0, 5) : null)

  // GET /api/agenda?dari=&sampai=  (default: hari ini sampai 7 hari ke depan)
  app.get('/api/agenda', authMiddleware, (req, res) => {
    const dari = tanggalSah(req.query.dari) || todayJakarta()
    const sampai = tanggalSah(req.query.sampai) || dari
    const pribadi = db.prepare(`SELECT * FROM agenda_pribadi
      WHERE tenant_id=? AND user_id=? AND tanggal BETWEEN ? AND ?
      ORDER BY tanggal, COALESCE(jam,'99:99'), prioritas DESC, created_at`).all(req.tenantId, req.user.id, dari, sampai)

    const bersama = db.prepare(`SELECT a.*, (SELECT selesai_at FROM agenda_lembaga_selesai s
        WHERE s.tenant_id=a.tenant_id AND s.user_id=? AND s.agenda_id=a.id) selesai_at
      FROM agenda_lembaga a
      WHERE a.tenant_id=? AND a.tanggal BETWEEN ? AND ?
      ORDER BY a.tanggal, COALESCE(a.jam,'99:99'), a.created_at`).all(req.user.id, req.tenantId, dari, sampai)
      .map(a => ({ ...a, selesai: a.selesai_at ? 1 : 0, bersama: 1, user_id: req.user.id }))

    const semua = [...pribadi.map(a => ({ ...a, bersama: 0 })), ...bersama]
      .sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal))
        || String(a.jam || '99:99').localeCompare(String(b.jam || '99:99'))
        || String(b.prioritas || '').localeCompare(String(a.prioritas || '')))

    const hariIni = todayJakarta()
    res.json({
      dari, sampai,
      hari_ini: hariIni,
      jumlah: semua.length,
      belum_selesai: semua.filter(a => !a.selesai).length,
      lewat: semua.filter(a => !a.selesai && (a.tanggal < hariIni || (a.tanggal === hariIni && a.jam && a.jam < new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta' }).slice(0, 5)))).length,
      agenda: semua.map(a => ({
        id: a.id, tanggal: a.tanggal, jam: a.jam || null,
        judul: a.judul, catatan: a.catatan || '',
        prioritas: a.prioritas || 'normal',
        selesai: Number(a.selesai) ? true : false,
        bersama: Number(a.bersama) ? true : false,
        pengingat_menit: Number(a.pengingat_menit || 0),
        sumber: a.sumber || 'manual',
        created_at: a.created_at,
      })),
    })
  })

  app.post('/api/agenda', authMiddleware, (req, res) => {
    const tanggal = tanggalSah(req.body?.tanggal)
    const judul = bersihTeks(req.body?.judul, JUDUL_MAKS)
    if (!tanggal) return res.status(400).json({ error: 'Tanggal agenda wajib diisi.' })
    if (!judul) return res.status(400).json({ error: 'Judul agenda wajib diisi.' })
    const jam = jamSah(req.body?.jam)
    const prioritas = PRIORITAS.has(String(req.body?.prioritas)) ? String(req.body.prioritas) : 'normal'
    const pengingat = Math.max(0, Math.min(1440, Number(req.body?.pengingat_menit) || 0))
    const id = crypto.randomUUID()
    db.prepare(`INSERT INTO agenda_pribadi (id,tenant_id,user_id,tanggal,jam,judul,catatan,prioritas,pengingat_menit,sumber,ref_id,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(
      id, req.tenantId, req.user.id, tanggal, jam, judul,
      bersihTeks(req.body?.catatan, CATATAN_MAKS), prioritas, pengingat,
      bersihTeks(req.body?.sumber, 32) || 'manual', bersihTeks(req.body?.ref_id, 64) || null,
    )
    res.status(201).json({ id, ok: true })
  })

  app.patch('/api/agenda/:id', authMiddleware, (req, res) => {
    const row = db.prepare('SELECT * FROM agenda_pribadi WHERE id=? AND tenant_id=? AND user_id=?')
      .get(req.params.id, req.tenantId, req.user.id)
    if (!row) return res.status(404).json({ error: 'Agenda tidak ditemukan.' })
    const ubah = {}
    if (req.body?.judul !== undefined) {
      const j = bersihTeks(req.body.judul, JUDUL_MAKS)
      if (!j) return res.status(400).json({ error: 'Judul agenda tidak boleh kosong.' })
      ubah.judul = j
    }
    if (req.body?.tanggal !== undefined) {
      const t = tanggalSah(req.body.tanggal)
      if (!t) return res.status(400).json({ error: 'Format tanggal harus YYYY-MM-DD.' })
      ubah.tanggal = t
    }
    if (req.body?.jam !== undefined) ubah.jam = jamSah(req.body.jam)
    if (req.body?.catatan !== undefined) ubah.catatan = bersihTeks(req.body.catatan, CATATAN_MAKS)
    if (req.body?.prioritas !== undefined && PRIORITAS.has(String(req.body.prioritas))) ubah.prioritas = String(req.body.prioritas)
    if (req.body?.pengingat_menit !== undefined) {
      ubah.pengingat_menit = Math.max(0, Math.min(1440, Number(req.body.pengingat_menit) || 0))
    }
    if (req.body?.selesai !== undefined) {
      ubah.selesai = req.body.selesai ? 1 : 0
      ubah.selesai_at = req.body.selesai ? new Date().toISOString() : null
    }
    if (!Object.keys(ubah).length) return res.json({ ok: true, tidak_berubah: true })
    const set = Object.keys(ubah).map(k => `${k}=?`).join(', ')
    db.prepare(`UPDATE agenda_pribadi SET ${set}, updated_at=datetime('now') WHERE id=? AND tenant_id=? AND user_id=?`)
      .run(...Object.values(ubah), req.params.id, req.tenantId, req.user.id)
    res.json({ ok: true })
  })

  app.delete('/api/agenda/:id', authMiddleware, (req, res) => {
    const r = db.prepare('DELETE FROM agenda_pribadi WHERE id=? AND tenant_id=? AND user_id=?')
      .run(req.params.id, req.tenantId, req.user.id)
    if (!r.changes) return res.status(404).json({ error: 'Agenda tidak ditemukan.' })
    res.json({ ok: true })
  })

  // Agenda lembaga: hanya admin yang membuat, semua pengguna melihat.
  app.post('/api/agenda-lembaga', authMiddleware, (req, res) => {
    if (!['admin', 'super_admin', 'operator', 'tata_usaha', 'tu'].includes(String(req.user.role))) {
      return res.status(403).json({ error: 'Hanya admin yang dapat membuat agenda lembaga.' })
    }
    const tanggal = tanggalSah(req.body?.tanggal)
    const judul = bersihTeks(req.body?.judul, JUDUL_MAKS)
    if (!tanggal || !judul) return res.status(400).json({ error: 'Tanggal dan judul agenda wajib diisi.' })
    const id = crypto.randomUUID()
    db.prepare(`INSERT INTO agenda_lembaga (id,tenant_id,tanggal,jam,judul,catatan,prioritas,dibuat_oleh)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      id, req.tenantId, tanggal, jamSah(req.body?.jam), judul,
      bersihTeks(req.body?.catatan, CATATAN_MAKS),
      PRIORITAS.has(String(req.body?.prioritas)) ? String(req.body.prioritas) : 'normal',
      req.user.id,
    )
    res.status(201).json({ id, ok: true })
  })

  app.delete('/api/agenda-lembaga/:id', authMiddleware, (req, res) => {
    if (!['admin', 'super_admin', 'operator', 'tata_usaha', 'tu'].includes(String(req.user.role))) {
      return res.status(403).json({ error: 'Hanya admin yang dapat menghapus agenda lembaga.' })
    }
    const r = db.prepare('DELETE FROM agenda_lembaga WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
    if (!r.changes) return res.status(404).json({ error: 'Agenda tidak ditemukan.' })
    db.prepare('DELETE FROM agenda_lembaga_selesai WHERE tenant_id=? AND agenda_id=?').run(req.tenantId, req.params.id)
    res.json({ ok: true })
  })

  // Tandai selesai agenda lembaga (per pengguna).
  app.post('/api/agenda-lembaga/:id/selesai', authMiddleware, (req, res) => {
    const ada = db.prepare('SELECT 1 FROM agenda_lembaga WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
    if (!ada) return res.status(404).json({ error: 'Agenda tidak ditemukan.' })
    if (req.body?.selesai === false) {
      db.prepare('DELETE FROM agenda_lembaga_selesai WHERE tenant_id=? AND user_id=? AND agenda_id=?')
        .run(req.tenantId, req.user.id, req.params.id)
    } else {
      db.prepare(`INSERT OR REPLACE INTO agenda_lembaga_selesai (tenant_id,user_id,agenda_id,selesai_at)
        VALUES (?,?,?,datetime('now'))`).run(req.tenantId, req.user.id, req.params.id)
    }
    res.json({ ok: true })
  })
}

module.exports = { daftarkanRouteAgenda, tambahMenit }
