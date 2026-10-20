// Login wali murid dengan OTP yang dikirim ke WhatsApp.
//
// Kenapa ada: sandi bawaan wali adalah 6 digit terakhir nomor WA — angka yang
// bisa ditebak siapa pun yang tahu nomornya. OTP memindahkan pembuktian ke
// pemilik nomor itu sendiri: kode 6 digit dibuat acak, berlaku 5 menit, dan
// hanya dikirim ke nomor yang memang terdaftar pada data siswa.
//
// Aturan yang dijaga di sini:
//   1. Nomor TIDAK terdaftar -> balasan tetap sama (jangan bocorkan siapa saja
//      yang terdaftar). Kode tidak dikirim, tapi respons tidak membedakan.
//   2. Satu kode hanya bisa dipakai sekali.
//   3. Percobaan salah dibatasi; kode mati setelah 5 kali.
//   4. Kode disimpan sebagai hash, bukan teks biasa.
//   5. Permintaan dibatasi per nomor supaya tidak jadi alat spam WA.

const crypto = require('crypto')
const bcrypt = require('bcryptjs')

const MASA_BERLAKU_MENIT = 5
const MAKS_PERCOBAAN = 5
const JEDA_KIRIM_DETIK = 60
const MAKS_KIRIM_PER_JAM = 5

function normalNomor(value) {
  let p = String(value || '').replace(/\D/g, '')
  if (p.startsWith('0')) p = '62' + p.slice(1)
  else if (p.startsWith('8')) p = '62' + p
  return /^62[1-9]\d{7,13}$/.test(p) ? p : ''
}

function hashKode(kode, garam) {
  return crypto.createHash('sha256').update(`${garam}:${kode}`).digest('hex')
}

function samakan(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  if (x.length !== y.length) return false
  return crypto.timingSafeEqual(x, y)
}

function setupOtpTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS otp_login(
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    kode_hash TEXT NOT NULL,
    garam TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_login(tenant_id, phone, created_at DESC);
  `)
}

function bersihkanKedaluwarsa(db) {
  // Simpan riwayat 1 hari untuk penelusuran, buang sisanya.
  try { db.prepare("DELETE FROM otp_login WHERE created_at < datetime('now','-1 day')").run() } catch {}
}

function daftarSiswaDenganNomor(db, tenantId, nomor) {
  const daftar = new Set([nomor])
  if (nomor.startsWith('62')) daftar.add('0' + nomor.slice(2))
  const tanda = [...daftar].map(() => '?').join(',')
  return db.prepare(`SELECT id,nis,nama,no_hp FROM siswa
    WHERE tenant_id=? AND COALESCE(status,'aktif')='aktif'
      AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(no_hp,''),' ',''),'-',''),'+',''),'.','') IN (${tanda})`)
    .all(tenantId, ...daftar)
}

function daftarkanRouteOtp(app, ctx) {
  const { db, waQueue, jwt, JWT_SECRET, JWT_EXPIRES_IN, authLimiter } = ctx
  setupOtpTables(db)

  // ---- Minta kode ----
  app.post('/api/auth/otp/request', authLimiter, (req, res) => {
    const tenantId = req.tenantId || 'default'
    const nomor = normalNomor(req.body?.phone ?? req.body?.email)
    const balasan = { ok: true, pesan: 'Jika nomor terdaftar, kode akan dikirim ke WhatsApp dalam beberapa saat.' }

    if (!nomor) return res.json(balasan)

    // Lembaga nonaktif tidak boleh mengirim OTP.
    try {
      const t = db.prepare('SELECT aktif FROM tenants WHERE id=?').get(tenantId)
      if (t && Number(t.aktif) !== 1) {
        return res.status(403).json({ error: 'Lembaga ini sedang tidak aktif.', code: 'TENANT_INACTIVE' })
      }
    } catch {}

    bersihkanKedaluwarsa(db)

    // Batas kirim: satu per 60 detik, maksimal 5 per jam per nomor.
    const terakhir = db.prepare(`SELECT created_at FROM otp_login
      WHERE tenant_id=? AND phone=? ORDER BY created_at DESC LIMIT 1`).get(tenantId, nomor)
    if (terakhir) {
      const detik = db.prepare("SELECT CAST((julianday('now') - julianday(?)) * 86400 AS INTEGER) d").get(terakhir.created_at)?.d ?? 0
      if (detik >= 0 && detik < JEDA_KIRIM_DETIK) {
        return res.status(429).json({ error: `Tunggu ${JEDA_KIRIM_DETIK - detik} detik sebelum meminta kode lagi.` })
      }
    }
    const perJam = db.prepare("SELECT COUNT(*) c FROM otp_login WHERE tenant_id=? AND phone=? AND created_at >= datetime('now','-1 hour')").get(tenantId, nomor).c
    if (perJam >= MAKS_KIRIM_PER_JAM) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan kode. Coba lagi dalam satu jam.' })
    }

    const anak = daftarSiswaDenganNomor(db, tenantId, nomor)
    if (!anak.length) return res.json(balasan) // jangan bocorkan bahwa nomor tidak terdaftar

    const kode = String(crypto.randomInt(0, 1000000)).padStart(6, '0')
    const garam = crypto.randomBytes(12).toString('hex')
    const id = crypto.randomUUID()
    db.prepare(`INSERT INTO otp_login(id,tenant_id,phone,kode_hash,garam,expires_at)
      VALUES(?,?,?,?,?,datetime('now',?))`).run(id, tenantId, nomor, hashKode(kode, garam), garam, `+${MASA_BERLAKU_MENIT} minutes`)

    const nama = anak[0].nama || ''
    const pesan = `*JURNALKU* — Kode masuk Portal Wali\n\nKode Anda: *${kode}*\n\nBerlaku ${MASA_BERLAKU_MENIT} menit untuk ${nama}${anak.length > 1 ? ` dan ${anak.length - 1} anak lainnya` : ''}.\nJangan berikan kode ini kepada siapa pun, termasuk yang mengaku pihak sekolah.`

    try {
      const hasil = waQueue.enqueue(db, {
        tenantId, phone: nomor, message: pesan,
        key: `otp:${id}`, targetType: 'wali_otp', targetId: anak[0].id,
      })
      // Kalau nomor masuk daftar putih (tidak dikirimi WA), jangan biarkan wali
      // menunggu kode yang tidak akan pernah datang.
      if (hasil && hasil.queued === false && hasil.reason === 'whitelisted') {
        console.warn('[otp] nomor ada di daftar putih, kode tidak dikirim:', nomor.slice(0, 4) + '****')
      }
    } catch (e) {
      console.error('[otp] gagal mengantre WA:', e.message)
    }

    res.json(balasan)
  })

  // ---- Verifikasi kode ----
  app.post('/api/auth/otp/verify', authLimiter, (req, res) => {
    const tenantId = req.tenantId || 'default'
    const nomor = normalNomor(req.body?.phone ?? req.body?.email)
    const kode = String(req.body?.code || '').replace(/\D/g, '')
    if (!nomor || kode.length !== 6) {
      return res.status(400).json({ error: 'Nomor WhatsApp dan kode 6 digit wajib diisi.' })
    }

    const row = db.prepare(`SELECT * FROM otp_login
      WHERE tenant_id=? AND phone=? AND used=0 ORDER BY created_at DESC LIMIT 1`).get(tenantId, nomor)
    if (!row) return res.status(400).json({ error: 'Kode tidak ditemukan. Minta kode baru.' })
    if (row.attempts >= MAKS_PERCOBAAN) return res.status(429).json({ error: 'Kode sudah terlalu banyak dicoba. Minta kode baru.' })

    const kedaluwarsa = db.prepare("SELECT (julianday(expires_at) <= julianday('now')) lewat").get()
    if (kedaluwarsa?.lewat) {
      return res.status(400).json({ error: 'Kode sudah kedaluwarsa. Minta kode baru.' })
    }

    if (!samakan(hashKode(kode, row.garam), row.kode_hash)) {
      db.prepare('UPDATE otp_login SET attempts=attempts+1 WHERE id=?').run(row.id)
      const sisa = MAKS_PERCOBAAN - (row.attempts + 1)
      return res.status(400).json({ error: `Kode salah.${sisa > 0 ? ` Sisa ${sisa} percobaan.` : ''}` })
    }

    // Kode benar: matikan agar tidak bisa dipakai dua kali.
    db.prepare('UPDATE otp_login SET used=1 WHERE id=?').run(row.id)

    const anak = daftarSiswaDenganNomor(db, tenantId, nomor)
    if (!anak.length) return res.status(403).json({ error: 'Nomor tidak lagi terdaftar pada siswa aktif.' })

    // Cari atau buat akun wali, lalu tautkan ke SEMUA anak dengan nomor ini.
    const emailWali = `wali-${nomor}@wali.jurnalku`
    let wali = db.prepare("SELECT * FROM users WHERE tenant_id=? AND role='wali_murid' AND (email=? OR replace(replace(replace(coalesce(nis,''),' ',''),'-',''),'+','')=?)")
      .get(tenantId, emailWali, nomor)
    if (!wali) {
      const id = crypto.randomUUID()
      // Sandi acak: jalur masuk utama wali adalah OTP. Sandi ini hanya cadangan
      // dan tidak pernah diberitahukan, sehingga tidak bisa ditebak.
      const sandiAcak = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10)
      const nama = `Wali ${anak[0].nama || ''}`.trim()
      try {
        db.prepare('INSERT INTO users (id,nama,email,password,role,tenant_id,nis,must_change_password) VALUES (?,?,?,?,?,?,?,0)')
          .run(id, nama, emailWali, sandiAcak, 'wali_murid', tenantId, nomor)
        wali = db.prepare('SELECT * FROM users WHERE id=?').get(id)
      } catch { wali = null }
    }
    if (!wali) return res.status(500).json({ error: 'Gagal menyiapkan akun wali.' })

    for (const a of anak) {
      try { db.prepare('INSERT OR IGNORE INTO user_students (tenant_id,user_id,student_id) VALUES (?,?,?)').run(tenantId, wali.id, a.id) } catch {}
    }

    const token = jwt.sign({
      id: wali.id, role: wali.role, nama: wali.nama, email: wali.email, tenant_id: wali.tenant_id,
      gtk_id: null, siswa_id: null, nis: wali.nis || null,
    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })

    res.json({
      token,
      user: { id: wali.id, nama: wali.nama, email: wali.email, role: wali.role, nis: wali.nis },
      anak: anak.map(a => ({ id: a.id, nama: a.nama, nis: a.nis })),
    })
  })
}

module.exports = { daftarkanRouteOtp, setupOtpTables, normalNomor, hashKode }
