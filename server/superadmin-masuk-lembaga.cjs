// "Masuk sebagai Lembaga" — superadmin melihat dashboard lembaga tanpa
// logout, lalu bisa kembali ke panel platform.
//
// Kenapa perlu: menu superadmin hanya 12 menu platform. Untuk memeriksa data
// satu lembaga (siswa, rapor, keuangan), superadmin harus mengetik URL manual.
//
// Prinsip keamanan:
//   1. Hanya super_admin yang boleh meminta token ini.
//   2. Token yang diterbitkan tetap membawa role super_admin (bukan meniru
//      admin lembaga), hanya tenant_id-nya yang diganti. Jadi hak akses tidak
//      bertambah — superadmin memang sudah boleh melihat semuanya.
//   3. Token menyimpan `tenant_asli` supaya bisa kembali tanpa login ulang.
//   4. Lembaga nonaktif tidak bisa dimasuki lewat jalur ini.
//   5. Setiap perpindahan dicatat di log server.

const crypto = require('crypto')

function daftarkanRouteMasukLembaga(app, ctx) {
  const { db, jwt, JWT_SECRET, JWT_EXPIRES_IN } = ctx

  // Klaim lama (`exp`, `iat`) harus DIBUANG sebelum menandatangani token baru:
  // jsonwebtoken menolak `expiresIn` bila payload sudah membawa `exp`.
  function klaimBersih(u) {
    const { exp, iat, nbf, ...sisa } = u
    return sisa
  }

  // Daftar lembaga yang bisa dipilih (dipakai halaman pemilih).
  app.get('/api/superadmin/lembaga', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'Token required' })
    let u
    try { u = jwt.verify(token, JWT_SECRET) } catch { return res.status(401).json({ error: 'Invalid token' }) }
    if (u.role !== 'super_admin') return res.status(403).json({ error: 'Khusus super admin' })

    const rows = db.prepare(`SELECT t.id,t.slug,t.nama,t.aktif,t.plan,t.domain_custom,t.base_domain,
        (SELECT COUNT(*) FROM siswa s WHERE s.tenant_id=t.id) siswa,
        (SELECT COUNT(*) FROM users us WHERE us.tenant_id=t.id) pengguna
      FROM tenants t WHERE t.id <> 'default' ORDER BY COALESCE(t.aktif,1) DESC, t.nama`).all()
    res.json({
      // Saat masuk lembaga, yang "sekarang" adalah tenant_id (lembaga yang
      // dibuka); tenant_asli adalah tempat kembali. Sebelumnya keduanya
      // tertukar sehingga UI menandai lembaga yang salah.
      aktif_sekarang: u.tenant_asli ? u.tenant_id : (u.tenant_id || 'default'),
      asal: u.tenant_asli || null,
      mode: u.tenant_asli ? 'masuk_lembaga' : 'platform',
      lembaga: rows,
    })
  })

  // Terbitkan token untuk masuk ke satu lembaga.
  app.post('/api/superadmin/masuk-lembaga', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'Token required' })
    let u
    try { u = jwt.verify(token, JWT_SECRET) } catch { return res.status(401).json({ error: 'Invalid token' }) }
    if (u.role !== 'super_admin') return res.status(403).json({ error: 'Khusus super admin' })

    const tenantId = String(req.body?.tenant_id || '').trim()
    if (!tenantId) return res.status(400).json({ error: 'tenant_id wajib diisi' })

    const t = db.prepare('SELECT id,slug,nama,aktif FROM tenants WHERE id=?').get(tenantId)
    if (!t) return res.status(404).json({ error: 'Lembaga tidak ditemukan' })
    if (Number(t.aktif) !== 1) {
      return res.status(403).json({ error: 'Lembaga ini sedang tidak aktif.', code: 'TENANT_INACTIVE' })
    }

    // Simpan tenant asal pada perpindahan pertama, agar "kembali" selalu ke
    // tempat yang benar meski superadmin berpindah beberapa lembaga.
    const tenantAsli = u.tenant_asli || u.tenant_id
    const baru = jwt.sign({
      ...klaimBersih(u),
      tenant_id: t.id,
      tenant_asli: tenantAsli,
      masuk_sebagai_superadmin: true,
    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })

    console.log(`[masuk-lembaga] ${u.email || u.id} -> ${t.slug} (${t.id})`)
    res.json({
      token: baru,
      lembaga: { id: t.id, slug: t.slug, nama: t.nama },
      user: { id: u.id, nama: u.nama, email: u.email, role: u.role },
    })
  })

  // Kembali ke panel platform.
  app.post('/api/superadmin/kembali-platform', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'Token required' })
    let u
    try { u = jwt.verify(token, JWT_SECRET) } catch { return res.status(401).json({ error: 'Invalid token' }) }
    if (u.role !== 'super_admin') return res.status(403).json({ error: 'Khusus super admin' })
    if (!u.tenant_asli) return res.json({ token, sudah_di_platform: true })

    const baru = jwt.sign({
      ...klaimBersih(u),
      tenant_id: u.tenant_asli,
      tenant_asli: undefined,
      masuk_sebagai_superadmin: undefined,
    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })

    console.log(`[masuk-lembaga] ${u.email || u.id} kembali ke platform`)
    res.json({ token: baru })
  })
}

module.exports = { daftarkanRouteMasukLembaga }
