'use strict'
// QR per ruang kelas: bukti guru benar-benar berada di ruangan, sebagai
// pelengkap (dan cadangan) geolokasi GPS.
//
// Cara kerja:
//   - Admin mencetak QR untuk tiap rombel. Isi QR ditandatangani HMAC dengan
//     JWT_SECRET dan berlaku untuk SATU TANGGAL, jadi QR lama tidak bisa
//     dipakai lagi besok dan tidak bisa dikarang sendiri.
//   - Guru memindai QR dari halaman dashboard. Server memverifikasi tanda
//     tangan, tanggal, tenant, dan bahwa rombel itu memang jadwalnya hari ini.
//   - Sesi kelas ditandai qr_verified=1 + waktu pindai. Pemindaian ini TIDAK
//     membutuhkan GPS, sehingga tetap bekerja di dalam gedung.

const crypto = require('crypto')
const { blokDariJadwal, menit: keMenit } = require('./jadwal-block.cjs')

const MASA_SEBELUM_MENIT = 30
const MASA_SESUDAH_MENIT = 60

function tanda(secret, tenantId, rombelId, tanggal) {
  return crypto.createHmac('sha256', String(secret))
    .update(`${tenantId}|${rombelId}|${tanggal}`)
    .digest('hex')
    .slice(0, 32)
}

function buatPayload({ tenantId, rombelId, tanggal }, secret) {
  const isi = { t: tenantId, r: rombelId, d: tanggal, s: tanda(secret, tenantId, rombelId, tanggal) }
  return Buffer.from(JSON.stringify(isi)).toString('base64url')
}

function bacaPayload(payload) {
  try { return JSON.parse(Buffer.from(String(payload), 'base64url').toString('utf8')) } catch { return null }
}

function verifikasiPayload(payload, { tenantId, tanggal, secret }) {
  const isi = bacaPayload(payload)
  if (!isi || !isi.t || !isi.r || !isi.d || !isi.s) return { ok: false, error: 'QR tidak dikenali.' }
  if (String(isi.t) !== String(tenantId)) return { ok: false, error: 'QR milik lembaga lain.' }
  if (String(isi.d) !== String(tanggal)) return { ok: false, error: 'QR ini sudah kedaluwarsa. Minta admin mencetak QR untuk hari ini.' }
  const harapan = tanda(secret, isi.t, isi.r, isi.d)
  const a = Buffer.from(String(isi.s))
  const b = Buffer.from(harapan)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, error: 'QR tidak sah.' }
  return { ok: true, rombel_id: String(isi.r) }
}

function menit(hm) {
  const [h, m] = String(hm || '00:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function daftarkanRouteQrKelas(app, ctx) {
  const { db, authMiddleware, TEACHER, JWT_SECRET, todayJakarta, timeJakarta, resolveGtkForUser } = ctx
  const ROLE_ADMIN = ['admin', 'kepala', 'operator', 'tata_usaha', 'tu', 'super_admin']

  // Daftar QR kelas untuk dicetak (per tanggal; bawaan hari ini).
  app.get('/api/admin/qr-kelas', authMiddleware, (req, res) => {
    if (!ROLE_ADMIN.includes(req.user.role)) return res.status(403).json({ error: 'Tidak berwenang.' })
    const diminta = String(req.query.tanggal || '')
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(diminta) ? diminta : todayJakarta()
    const rombel = db.prepare('SELECT id, nama, tingkat FROM rombel WHERE tenant_id=? ORDER BY nama').all(req.tenantId)
    res.json({
      tanggal,
      berlaku_sampai: `${tanggal} 23:59`,
      kelas: rombel.map(r => ({
        id: r.id,
        nama: r.nama,
        tingkat: r.tingkat,
        payload: buatPayload({ tenantId: req.tenantId, rombelId: r.id, tanggal }, JWT_SECRET),
      })),
    })
  })

  // Guru memindai QR ruang -> sesi kelas tercatat tanpa perlu GPS.
  app.post('/api/guru/sesi-kelas/qr', TEACHER, (req, res) => {
    const gtk = resolveGtkForUser(req.user.id, req.tenantId)
    const gtkId = gtk?.id
    if (!gtkId) return res.status(400).json({ error: 'Akun guru belum terhubung GTK' })

    const tanggal = todayJakarta()
    const cek = verifikasiPayload(req.body?.payload, { tenantId: req.tenantId, tanggal, secret: JWT_SECRET })
    if (!cek.ok) return res.status(400).json({ error: cek.error })

    const sekarang = timeJakarta()
    const kini = menit(sekarang)
    const jadwal = db.prepare(`SELECT * FROM jadwal
      WHERE tenant_id=? AND gtk_id=? AND rombel_id=? AND lower(hari)=?
      ORDER BY jam_mulai`).all(req.tenantId, gtkId, cek.rombel_id, require('./attendance-rules.cjs').hariJakarta())
      .find(j => kini >= menit(j.jam_mulai) - MASA_SEBELUM_MENIT && kini <= menit(j.jam_selesai) + MASA_SESUDAH_MENIT)
    if (!jadwal) return res.status(403).json({ error: 'Tidak ada jam mengajar Anda di ruang ini saat ini.' })

    // Satu mapel JTM 2 tersimpan sebagai dua baris jadwal berurutan. Pindai QR
    // sekali harus mencakup SELURUH blok: sesi dibuat untuk tiap baris (supaya
    // kedua jam tampil "berjalan/selesai" di dashboard), tetapi jurnal dan
    // absensi mapel cukup sekali karena keduanya berkunci sesi, bukan jam.
    const blok = blokDariJadwal(db, jadwal)
    const blokIds = blok.map(b => b.id)
    const blokMulai = blok[0].jam_mulai
    const blokSelesai = blok[blok.length - 1].jam_selesai

    // Sesi aktif lain? Harus diselesaikan dulu (sama seperti alur GPS).
    const aktif = db.prepare("SELECT * FROM sesi_kelas_guru WHERE tenant_id=? AND guru_id=? AND tanggal=? AND status='aktif' LIMIT 1")
      .get(req.tenantId, gtkId, tanggal)
    if (aktif && !blokIds.includes(aktif.jadwal_id)) {
      return res.status(409).json({ error: 'Selesaikan dahulu kelas yang sedang aktif.' })
    }

    // Pemindaian masih diterima sampai 60 menit setelah jam selesai (mis. guru
    // baru sempat memindai setelah kelas bubar). Tetapi sesi TIDAK boleh dibiarkan
    // 'aktif': dashboard akan langsung menutupnya, dan guru melihat tombol yang
    // seolah tidak berubah. Simpan sebagai selesai + beri tahu klien.
    const lewatSelesai = kini > keMenit(blokSelesai)
    const statusSesi = lewatSelesai ? 'selesai' : 'aktif'
    const waktuSelesai = lewatSelesai ? blokSelesai : null

    const upsert = db.prepare(`INSERT INTO sesi_kelas_guru
      (id,jadwal_id,guru_id,mapel_id,rombel_id,tanggal,waktu_masuk,waktu_selesai,status,menit_terlambat,tenant_id,updated_at,jadwal_source,qr_verified,qr_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),'reguler',1,?)
      ON CONFLICT(tenant_id,jadwal_id,tanggal) DO UPDATE SET
        waktu_masuk=excluded.waktu_masuk,
        waktu_selesai=CASE WHEN excluded.status='selesai' THEN COALESCE(sesi_kelas_guru.waktu_selesai, excluded.waktu_selesai) ELSE NULL END,
        status=excluded.status,
        qr_verified=1,qr_at=excluded.qr_at,updated_at=datetime('now')`)

    const simpan = db.transaction(() => {
      for (const b of blok) {
        upsert.run(crypto.randomUUID(), b.id, gtkId, b.mapel_id, b.rombel_id, tanggal, sekarang, waktuSelesai, statusSesi,
          Math.max(0, kini - keMenit(blokMulai) - 10), req.tenantId, sekarang)
      }
    })
    simpan()

    const sesi = db.prepare('SELECT * FROM sesi_kelas_guru WHERE tenant_id=? AND jadwal_id=? AND tanggal=?').get(req.tenantId, blok[0].id, tanggal)
    res.json({
      ok: true,
      setelah_selesai: lewatSelesai,
      pesan: lewatSelesai
        ? `Kelas ${blokMulai}-${blokSelesai} sudah berakhir. Kehadiran lewat QR tetap tercatat.`
        : null,
      sesi,
      blok: { jadwal_ids: blokIds, mulai: blokMulai, selesai: blokSelesai, jumlah_jam: blok.length },
      // Baris pertama blok dipakai sebagai kunci jurnal & absensi mapel.
      jadwal: { id: blok[0].id, jam_mulai: blokMulai, jam_selesai: blokSelesai, rombel_id: jadwal.rombel_id },
    })
  })
}

module.exports = { buatPayload, verifikasiPayload, daftarkanRouteQrKelas, bacaPayload }
