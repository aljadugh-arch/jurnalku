'use strict'
// Metode login yang ditampilkan & diizinkan per lembaga.
// Disimpan di settings.metode_login sebagai JSON array. Bawaannya "sandi" saja
// (username + password akun), sesuai keputusan pemilik produk agar halaman
// login tidak menampilkan tiga cara sekaligus. Admin dapat menyalakan OTP WA
// atau tautan email lagi kapan saja dari Pengaturan.

const SEMUA = ['sandi', 'otp', 'tautan']
const BAWAAN = ['sandi']

function normalisasi(nilai, { kosongKeBawaan = true } = {}) {
  let arr = nilai
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr) } catch { arr = null }
  }
  if (!Array.isArray(arr)) return kosongKeBawaan ? [...BAWAAN] : []
  const bersih = [...new Set(arr.map(String).filter(m => SEMUA.includes(m)))]
  return bersih.length ? bersih : (kosongKeBawaan ? [...BAWAAN] : [])
}

function bacaMetode(db, tenantId) {
  try {
    const row = db.prepare('SELECT metode_login FROM settings WHERE tenant_id=?').get(tenantId)
    return normalisasi(row?.metode_login)
  } catch { return [...BAWAAN] }
}

function metodeAktif(db, tenantId, metode) {
  return bacaMetode(db, tenantId).includes(metode)
}

function daftarkanRouteMetodeLogin(app, ctx) {
  const { db, authMiddleware } = ctx

  // Admin lembaga mengubah metode login yang ditampilkan.
  app.put('/api/settings/metode-login', authMiddleware, (req, res) => {
    if (!['admin', 'super_admin', 'operator', 'tata_usaha', 'tu'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Tidak berwenang mengubah metode login.' })
    }
    const diminta = req.body?.metode
    const bersih = normalisasi(diminta, { kosongKeBawaan: false })
    if (!bersih.length) return res.status(400).json({ error: 'Pilih minimal satu metode login.' })
    db.prepare(`INSERT INTO settings (id, tenant_id, metode_login, updated_at)
      VALUES (?,?,?,datetime('now'))
      ON CONFLICT(id) DO UPDATE SET tenant_id=excluded.tenant_id, metode_login=excluded.metode_login, updated_at=datetime('now')`)
      .run(`main_${req.tenantId}`, req.tenantId, JSON.stringify(bersih))
    res.json({ ok: true, metode: bersih })
  })

  app.get('/api/settings/metode-login', (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json({ metode: bacaMetode(db, req.tenantId), semua: SEMUA })
  })
}

module.exports = { SEMUA, BAWAAN, normalisasi, bacaMetode, metodeAktif, daftarkanRouteMetodeLogin }
