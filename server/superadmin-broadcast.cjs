'use strict'
// Pengumuman platform dari superadmin ke seluruh pengguna lembaga lewat WhatsApp.
//
// Kenapa per tenant: worker WA memakai sesi milik masing-masing lembaga
// (wa_sessions.tenant_id). Pesan untuk wali/guru lembaga A harus masuk ke
// antrean tenant A, bukan ke nomor platform — kalau tidak, worker tidak akan
// pernah mengirimnya.
//
// Batasan yang dijaga:
//   1. Hanya super_admin.
//   2. Penerima diambil dari nomor yang benar-benar terdaftar (GTK, wali/siswa,
//      kontak lembaga), dinormalisasi dan dideduplikasi.
//   3. Satu broadcast maksimal 3000 pesan; percobaan kedua memakai kunci
//      idempotensi yang sama sehingga tidak dobel.
//   4. Pesan dipotong 900 karakter agar tidak dipecah sembarangan oleh gateway.

const crypto = require('crypto')
const waQueue = require('./wa-queue.cjs')

const MAKS_PESAN = 3000
const MAKS_PANJANG = 900

const JENIS_LABEL = { gtk: 'Guru/GTK', wali: 'Wali/Siswa', lembaga: 'Kontak lembaga' }

function siapkanTabel(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS platform_broadcast (
    id TEXT PRIMARY KEY,
    judul TEXT NOT NULL,
    pesan TEXT NOT NULL,
    target TEXT NOT NULL,
    tenant_count INTEGER NOT NULL DEFAULT 0,
    pesan_count INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_by_nama TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)
}

function kumpulanPenerima(db, tenantId) {
  const hasil = []
  const push = (phone, jenis, nama) => {
    const p = waQueue.normalizePhone(phone)
    if (p) hasil.push({ phone: p, jenis, nama: String(nama || '').slice(0, 60) })
  }
  try {
    for (const r of db.prepare("SELECT nama, no_hp FROM gtk WHERE tenant_id=? AND COALESCE(status,'aktif')='aktif'").all(tenantId)) push(r.no_hp, 'gtk', r.nama)
  } catch { /* tabel belum ada */ }
  try {
    for (const r of db.prepare("SELECT nama, no_hp FROM siswa WHERE tenant_id=? AND COALESCE(status,'aktif')='aktif'").all(tenantId)) push(r.no_hp, 'wali', r.nama)
  } catch { /* abaikan */ }
  try {
    const s = db.prepare('SELECT telepon, nama_lembaga FROM settings WHERE tenant_id=?').get(tenantId)
    if (s) push(s.telepon, 'lembaga', s.nama_lembaga)
  } catch { /* abaikan */ }
  try {
    for (const r of db.prepare("SELECT nama, nis FROM users WHERE tenant_id=? AND role='wali_murid'").all(tenantId)) push(r.nis, 'wali', r.nama)
  } catch { /* abaikan */ }

  // Dedupe: satu nomor hanya menerima satu pesan per broadcast.
  const unik = new Map()
  for (const r of hasil) if (!unik.has(r.phone)) unik.set(r.phone, r)
  return [...unik.values()]
}

function daftarTenant(db, target) {
  const semua = db.prepare('SELECT id, nama FROM tenants WHERE aktif=1 ORDER BY nama').all()
  if (!target || target === 'semua' || (Array.isArray(target) && target.includes('semua'))) return semua
  const ids = new Set(Array.isArray(target) ? target.map(String) : [String(target)])
  return semua.filter(t => ids.has(t.id))
}

function rangkaiPesan(judul, pesan) {
  const isi = String(pesan || '').trim()
  const potong = isi.length > MAKS_PANJANG ? isi.slice(0, MAKS_PANJANG - 1) + '…' : isi
  return `📢 *PENGUMUMAN JURNALKU*\n\n*${String(judul || '').trim()}*\n\n${potong}\n\n—\nPesan resmi platform JURNALKU. Jangan balas ke nomor ini.`
}

function daftarkanRouteBroadcast(app, ctx) {
  const { db, authMiddleware } = ctx
  siapkanTabel(db)

  const hanyaSuperadmin = (req, res, next) => {
    if (req.user?.role !== 'super_admin') return res.status(403).json({ error: 'Hanya super admin.' })
    next()
  }

  // Ringkasan audiens: jumlah lembaga, nomor unik, dan status sesi WA.
  app.get('/api/superadmin/broadcast/audiens', authMiddleware, hanyaSuperadmin, (req, res) => {
    const tenants = daftarTenant(db, req.query.target || 'semua')
    const sesi = new Map(db.prepare('SELECT tenant_id, status FROM wa_sessions').all().map(r => [r.tenant_id, r.status]))
    const per = tenants.map(t => {
      const penerima = kumpulanPenerima(db, t.id)
      return {
        id: t.id,
        nama: t.nama,
        wa: sesi.get(t.id) || 'belum_ada',
        nomor: penerima.length,
        rincian: {
          gtk: penerima.filter(p => p.jenis === 'gtk').length,
          wali: penerima.filter(p => p.jenis === 'wali').length,
          lembaga: penerima.filter(p => p.jenis === 'lembaga').length,
        },
      }
    })
    res.json({
      tenant_count: tenants.length,
      nomor_count: per.reduce((s, x) => s + x.nomor, 0),
      siap_kirim: per.filter(x => x.wa === 'connected').reduce((s, x) => s + x.nomor, 0),
      per_tenant: per,
    })
  })

  // Riwayat + status pengiriman (dihitung dari antrean WA).
  app.get('/api/superadmin/broadcast', authMiddleware, hanyaSuperadmin, (req, res) => {
    const batas = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
    const rows = db.prepare('SELECT * FROM platform_broadcast ORDER BY created_at DESC LIMIT ?').all(batas)
    const hasil = rows.map(b => {
      const stat = db.prepare(`SELECT status, COUNT(*) c FROM wa_queue WHERE idempotency_key LIKE ? GROUP BY status`)
        .all(`broadcast:${b.id}:%`)
      const peta = Object.fromEntries(stat.map(s => [s.status, s.c]))
      const total = stat.reduce((s, x) => s + x.c, 0)
      return {
        ...b,
        terkirim: peta.sent || 0,
        menunggu: (peta.pending || 0) + (peta.processing || 0),
        gagal: peta.failed || 0,
        total_antrean: total,
      }
    })
    res.json(hasil)
  })

  // Kirim pengumuman. `kering: true` hanya menghitung, tidak mengantrekan.
  app.post('/api/superadmin/broadcast', authMiddleware, hanyaSuperadmin, (req, res) => {
    const judul = String(req.body?.judul || '').trim()
    const pesan = String(req.body?.pesan || '').trim()
    const target = req.body?.target ?? 'semua'
    const kering = req.body?.kering === true

    if (judul.length < 3) return res.status(400).json({ error: 'Judul minimal 3 karakter.' })
    if (pesan.length < 10) return res.status(400).json({ error: 'Isi pengumuman minimal 10 karakter.' })

    const tenants = daftarTenant(db, target)
    if (!tenants.length) return res.status(400).json({ error: 'Tidak ada lembaga aktif pada target ini.' })

    const rencana = tenants.map(t => ({ tenant: t, penerima: kumpulanPenerima(db, t.id) }))
    const total = rencana.reduce((s, x) => s + x.penerima.length, 0)
    if (!total) return res.status(400).json({ error: 'Tidak ada nomor WhatsApp terdaftar pada target ini.' })
    if (total > MAKS_PESAN) {
      return res.status(400).json({ error: `Terlalu banyak penerima (${total}). Maksimal ${MAKS_PESAN} per pengumuman; pilih sebagian lembaga.` })
    }

    if (kering) {
      return res.json({ ok: true, kering: true, tenant_count: tenants.length, nomor_count: total })
    }

    const id = crypto.randomUUID()
    const isi = rangkaiPesan(judul, pesan)
    let terkirimKeAntrean = 0

    const jalan = db.transaction(() => {
      db.prepare(`INSERT INTO platform_broadcast(id,judul,pesan,target,tenant_count,pesan_count,created_by,created_by_nama)
        VALUES(?,?,?,?,?,?,?,?)`).run(
        id, judul, pesan, Array.isArray(target) ? JSON.stringify(target) : String(target),
        tenants.length, total, req.user.id, req.user.nama || '',
      )
      for (const { tenant, penerima } of rencana) {
        for (const p of penerima) {
          const r = waQueue.enqueue(db, {
            tenantId: tenant.id,
            phone: p.phone,
            message: isi,
            key: `broadcast:${id}:${p.phone}`,
            targetType: 'broadcast',
            targetId: id,
          })
          if (r.queued) terkirimKeAntrean++
        }
      }
    })
    jalan()

    res.json({
      ok: true,
      id,
      tenant_count: tenants.length,
      nomor_count: total,
      masuk_antrean: terkirimKeAntrean,
      catatan: 'Pesan terkirim mengikuti status sesi WhatsApp tiap lembaga. Lembaga yang sesinya belum tersambung akan menyusul otomatis.',
    })
  })
}

module.exports = { daftarkanRouteBroadcast, kumpulanPenerima, rangkaiPesan, siapkanTabel, MAKS_PESAN }
