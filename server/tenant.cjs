/**
 * Multi-tenant middleware & helpers
 * 
 * Strategy: Shared Database with tenant_id
 * Detection: subdomain-based (xxx.jurnal.cc.cd) or custom domain mapping
 * 
 * Flow:
 * 1. Request masuk → detect tenant dari Host header
 * 2. Cek subdomain (xxx.jurnal.cc.cd) atau custom domain (jurnal.sdit-alfatih.sch.id)
 * 3. Set req.tenant = { id, slug, nama, domain_custom, ... }
 * 4. Semua query otomatis filter by tenant_id
 */

const BASE_DOMAIN = process.env.BASE_DOMAIN || 'jurnal.cc.cd'

/**
 * Setup tenant tables in database
 */
function setupTenantTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS foundations (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL,
      alamat TEXT,
      telepon TEXT,
      email TEXT,
      logo TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      nama TEXT NOT NULL,
      domain_custom TEXT,
      logo TEXT,
      alamat TEXT,
      telepon TEXT,
      email TEXT,
      wa_gateway_url TEXT,
      wa_gateway_key TEXT,
      plan TEXT DEFAULT 'free',
      max_siswa INTEGER DEFAULT 100,
      max_gtk INTEGER DEFAULT 20,
      aktif INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      expired_at TEXT,
      foundation_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
    CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain_custom);
  `)

  // Ensure columns exist on pre-existing tenants tables (CREATE TABLE IF NOT EXISTS
  // is a no-op when the table predates these columns), THEN index foundation_id.
  try {
    const cols = db.prepare("PRAGMA table_info(tenants)").all()
    const names = new Set(cols.map(c => c.name))
    if (!names.has('domain_status')) db.exec("ALTER TABLE tenants ADD COLUMN domain_status TEXT DEFAULT 'active'")
    if (!names.has('foundation_id')) db.exec("ALTER TABLE tenants ADD COLUMN foundation_id TEXT")
  } catch {}
  db.exec("CREATE INDEX IF NOT EXISTS idx_tenants_foundation ON tenants(foundation_id)")

  // Add tenant_id to all data tables if not exists
  const tables = [
    'users', 'siswa', 'gtk', 'mapel', 'rombel', 'jadwal', 'sesi_kelas_guru',
    'jurnal_mengajar', 'absensi_siswa', 'absensi_guru',
    'ekskul', 'absensi_ekskul', 'tahun_ajaran',
    'jenis_tagihan', 'tagihan', 'tabungan',
    'kalender_kbm', 'modul_ajar', 'kegiatan_khusus',
    'notif_settings', 'broadcast_log', 'settings',
    'pengajar', 'absensi_kegiatan', 'penilaian_harian'
  ]

  for (const table of tables) {
    try {
      const info = db.prepare(`PRAGMA table_info(${table})`).all()
      const hasCol = info.some(col => col.name === 'tenant_id')
      if (!hasCol) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN tenant_id TEXT DEFAULT 'default'`)
        db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id)`)
      }
    } catch (e) {
      // Table might not exist yet, skip
    }
  }

  // Ensure optional NIK columns exist on pre-existing databases.
  for (const table of ['siswa', 'gtk']) {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all()
      if (!cols.some(c => c.name === 'nik')) db.exec(`ALTER TABLE ${table} ADD COLUMN nik TEXT`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_nik_tenant ON ${table}(nik, tenant_id)`)
    } catch (e) { console.error(`[migration] ${table}.nik failed`, e.message) }
  }

  // Ensure users.must_change_password column exists (force first-login password reset)
  try {
    const userCols = db.prepare("PRAGMA table_info(users)").all()
    if (!userCols.some(c => c.name === 'must_change_password')) {
      db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0")
    }
  } catch {}

  // Ensure default tenant exists
  const defaultTenant = db.prepare('SELECT id FROM tenants WHERE id = ?').get('default')
  if (!defaultTenant) {
    db.prepare(`INSERT INTO tenants (id, slug, nama) VALUES (?, ?, ?)`)
      .run('default', 'demo', 'Demo Lembaga')
  }
}

/**
 * Middleware: detect tenant from request Host header
 */
function tenantMiddleware(db) {
  return (req, res, next) => {
    // Tenant icons are dynamic too; resolve their host just like API routes.
    if (!req.path.startsWith('/api') && !['/favicon.ico', '/apple-touch-icon.png'].includes(req.path)) return next()

    const host = (req.headers.host || '').split(':')[0].toLowerCase()

    let tenant = null

    // 1. Check if it's a subdomain of BASE_DOMAIN
    if (host.endsWith('.' + BASE_DOMAIN)) {
      const slug = host.replace('.' + BASE_DOMAIN, '')
      if (slug && slug !== 'www') {
        // Custom domain is an alias, not a replacement: tenant remains reachable by slug too.
        tenant = db.prepare('SELECT * FROM tenants WHERE slug = ? AND aktif = 1').get(slug)
      }
    }

    // 2. Check custom domain mapping
    if (!tenant && host !== 'localhost') {
      tenant = db.prepare("SELECT * FROM tenants WHERE lower(trim(domain_custom, '.')) = ? AND aktif = 1").get(host.replace(/\.$/, ''))
    }

    // 3. Fallback to default tenant (main domain or localhost)
    if (!tenant) {
      tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get('default')
    }

    if (!tenant) {
      return res.status(404).json({ error: 'Lembaga tidak ditemukan' })
    }

    req.tenant = tenant
    req.tenantId = tenant.id
    next()
  }
}

/**
 * Helper: wrap db query with tenant filter
 */
function tenantQuery(db, sql, tenantId, params = []) {
  return db.prepare(sql).all(...params, tenantId)
}

/**
 * Admin-only routes for tenant management (super_admin)
 */
function registerTenantRoutes(app, db, authMiddleware, uuidv4, SUPER) {
  SUPER = SUPER || authMiddleware // fallback: inline role checks below still enforce super_admin
  // List all tenants (super_admin only)
  app.get('/api/tenants', authMiddleware, (req, res) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' })
    const tenants = db.prepare('SELECT * FROM tenants ORDER BY created_at DESC').all()
    res.json(tenants)
  })

  // Create new tenant
  app.post('/api/tenants', authMiddleware, (req, res) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' })
    const { slug, nama, domain_custom, email, telepon, alamat, max_siswa, max_gtk } = req.body
    if (!slug || !nama) return res.status(400).json({ error: 'slug dan nama wajib' })

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Slug hanya boleh huruf kecil, angka, dan dash' })
    }

    // Check duplicate
    const exists = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug)
    if (exists) return res.status(409).json({ error: 'Slug sudah digunakan' })

    const id = uuidv4()
    db.prepare(`INSERT INTO tenants (id, slug, nama, domain_custom, email, telepon, alamat, plan, max_siswa, max_gtk, trial_ends_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now','+1 month'))`)
      .run(id, slug, nama, domain_custom || null, email || null, telepon || null, alamat || null, 'trial', max_siswa || 100, max_gtk || 20)

    // Create default admin user for tenant.
    // Catatan: must_change_password=1 agar user dipaksa ganti password
    // pada login pertama. Middleware akan mencekal API lain sampai diganti.
    const bcrypt = require('bcryptjs')
    const adminId = uuidv4()
    const adminEmail = email || `admin@${slug}.jurnal.cc.cd`
    // Generate password acak (16 char base64) supaya admin pertama tidak
    // mendapat password default yang lemah dan publik.
    const adminInitialPassword = require('crypto').randomBytes(12).toString('base64').replace(/[+/=]/g, 'X')
    const hashedPw = bcrypt.hashSync(adminInitialPassword, 10)
    db.prepare('INSERT INTO users (id, nama, email, password, role, tenant_id, must_change_password) VALUES (?,?,?,?,?,?,1)')
      .run(adminId, `Admin ${nama}`, adminEmail, hashedPw, 'admin', id)

    // Create default settings for tenant
    db.prepare('INSERT OR IGNORE INTO settings (id, nama_lembaga, tenant_id) VALUES (?,?,?)')
      .run(uuidv4(), nama, id)

    // Create default notif_settings for tenant
    db.prepare(`INSERT OR IGNORE INTO notif_settings (id, tenant_id) VALUES (?, ?)`)
      .run('main_' + id, id)

    // Kirim password hanya SEKALI di response. Simpan hash saja di DB;
    // super_admin wajib mencatat password ini untuk diberikan ke klien,
    // karena password tidak pernah dikirim ulang dan tidak dapat di-decrypt.
    // User harus ganti setelah login pertama (must_change_password=1).
    console.log(`[tenant] Created tenant "${nama}" admin_email=${adminEmail} initial_password=${adminInitialPassword} (wajib ganti setelah login)`)
    res.json({ id, slug, nama, admin_email: adminEmail, admin_initial_password: adminInitialPassword, must_change_password: true })
  })

  // Update tenant
  app.put('/api/tenants/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' })
    const { nama, domain_custom, plan, max_siswa, max_gtk, aktif, expired_at } = req.body
    db.prepare(`UPDATE tenants SET nama=COALESCE(?,nama), domain_custom=?, plan=COALESCE(?,plan), 
      max_siswa=COALESCE(?,max_siswa), max_gtk=COALESCE(?,max_gtk), aktif=COALESCE(?,aktif), 
      expired_at=? WHERE id=?`)
      .run(nama, domain_custom || null, plan, max_siswa, max_gtk, aktif, expired_at || null, req.params.id)
    res.json({ success: true })
  })

  // Set custom domain for tenant
  app.put('/api/tenants/:id/domain', authMiddleware, (req, res) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' })
    const { domain_custom } = req.body
    if (domain_custom) {
      const existing = db.prepare('SELECT id FROM tenants WHERE domain_custom = ? AND id != ?').get(domain_custom, req.params.id)
      if (existing) return res.status(400).json({ error: 'Domain sudah digunakan tenant lain' })
    }
    db.prepare('UPDATE tenants SET domain_custom = ? WHERE id = ?').run(domain_custom || null, req.params.id)
    res.json({ success: true, domain_custom })
  })

  // Delete tenant (cascade all data)
  app.delete('/api/tenants/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' })
    if (req.params.id === 'default') return res.status(400).json({ error: 'Tidak bisa hapus tenant default' })
    const tid = req.params.id
    const tenant = db.prepare('SELECT slug, nama FROM tenants WHERE id = ?').get(tid)
    if (!tenant) return res.status(404).json({ error: 'Tenant tidak ditemukan' })
    try {
      const tables = [
        'absensi_ekskul', 'absensi_siswa', 'absensi_guru', 'absensi_kegiatan', 'sesi_kelas_guru',
        'ekskul_anggota', 'tagihan', 'tabungan', 'jadwal', 'pengajar',
        'siswa', 'gtk', 'mapel', 'rombel', 'ekskul', 'jenis_tagihan',
        'tahun_ajaran', 'kalender_kbm', 'modul_ajar', 'kegiatan_khusus',
        'notif_settings', 'broadcast_log', 'penilaian_harian', 'jurnal_mengajar',
        'settings', 'users'
      ]
      for (const table of tables) {
        db.prepare(`DELETE FROM ${table} WHERE tenant_id = ?`).run(tid)
      }
      db.prepare('DELETE FROM tenants WHERE id = ?').run(tid)
      res.json({ success: true, deleted: tenant.nama })
    } catch (e) {
      console.error('Delete tenant error:', e)
      res.status(500).json({ error: 'Gagal menghapus lembaga' })
    }
  })

  // Get tenant info (for current tenant - public)
  app.get('/api/tenant/info', (req, res) => {
    const host = (req.headers.host || '').split(':')[0].toLowerCase()
    let tenant = null

    if (host.endsWith('.' + BASE_DOMAIN)) {
      const slug = host.replace('.' + BASE_DOMAIN, '')
      tenant = db.prepare('SELECT slug, nama, logo, plan FROM tenants WHERE slug = ? AND aktif = 1').get(slug)
    }
    if (!tenant && host !== BASE_DOMAIN) {
      tenant = db.prepare('SELECT slug, nama, logo, plan FROM tenants WHERE domain_custom = ? AND aktif = 1').get(host)
    }
    if (!tenant) {
      tenant = db.prepare('SELECT slug, nama, logo, plan FROM tenants WHERE id = ?').get('default')
    }

    res.json(tenant || { slug: 'default', nama: 'JURNALKU', logo: null, plan: 'free' })
  })

  // ==================== FOUNDATION ROUTES (Cross-tenant sharing) ====================

  // List all foundations (super_admin only)
  app.get('/api/foundations', authMiddleware, (req, res) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' })
    const foundations = db.prepare('SELECT * FROM foundations ORDER BY created_at DESC').all()
    res.json(foundations)
  })

  // Create foundation (super_admin only)
  app.post('/api/foundations', authMiddleware, (req, res) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' })
    const { nama, alamat, telepon, email, logo } = req.body
    if (!nama) return res.status(400).json({ error: 'Nama yayasan wajib diisi' })
    const id = uuidv4()
    db.prepare('INSERT INTO foundations (id, nama, alamat, telepon, email, logo) VALUES (?,?,?,?,?,?)')
      .run(id, nama, alamat || null, telepon || null, email || null, logo || null)
    res.json({ id, nama, alamat, telepon, email, logo })
  })

  // Update foundation (super_admin only)
  app.put('/api/foundations/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' })
    const { nama, alamat, telepon, email, logo } = req.body
    db.prepare('UPDATE foundations SET nama=?, alamat=?, telepon=?, email=?, logo=? WHERE id=?')
      .run(nama, alamat || null, telepon || null, email || null, logo || null, req.params.id)
    res.json({ success: true })
  })

  // Delete foundation (super_admin only)
  app.delete('/api/foundations/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' })
    db.prepare('DELETE FROM foundations WHERE id = ?').run(req.params.id)
    res.json({ success: true })
  })

  // Get tenants in a foundation (admin/super_admin of any tenant in that foundation)
  app.get('/api/foundations/tenants', authMiddleware, (req, res) => {
    const foundationId = db.prepare('SELECT foundation_id FROM tenants WHERE id=?').get(req.tenantId)?.foundation_id
    if (!foundationId) return res.json([])
    if (!['admin', 'super_admin', 'operator', 'kepala'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' })
    const tenants = db.prepare('SELECT id, slug, nama, domain_custom, aktif FROM tenants WHERE foundation_id=? AND aktif=1 ORDER BY nama').all(foundationId)
    res.json(tenants)
  })

  app.get('/api/foundations/:id/tenants', authMiddleware, (req, res) => {
    const foundationId = req.params.id
    const userFoundationId = db.prepare('SELECT foundation_id FROM tenants WHERE id = ?').get(req.tenantId)?.foundation_id
    if (req.user.role !== 'super_admin' && userFoundationId !== foundationId) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const tenants = db.prepare('SELECT id, slug, nama, domain_custom, aktif FROM tenants WHERE foundation_id = ? AND aktif = 1').all(foundationId)
    res.json(tenants)
  })

  // Cross-tenant: Get students from other tenants in same foundation (admin+)
  app.get('/api/foundation/students', authMiddleware, (req, res) => {
    const userFoundationId = db.prepare('SELECT foundation_id FROM tenants WHERE id = ?').get(req.tenantId)?.foundation_id
    if (!userFoundationId) return res.status(403).json({ error: 'Tenant tidak tergabung dalam yayasan' })
    if (!['admin', 'super_admin', 'operator', 'kepala'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' })

    const { search, limit = 100, offset = 0, tenant_id } = req.query
    let targetTenants = db.prepare('SELECT id FROM tenants WHERE foundation_id = ? AND aktif = 1').all(userFoundationId).map(t => t.id)
    if (tenant_id) {
      if (!targetTenants.includes(tenant_id)) return res.status(403).json({ error: 'Tenant tidak dalam yayasan yang sama' })
      targetTenants = [tenant_id]
    }

    let sql = `SELECT s.*, t.nama as tenant_nama, t.slug as tenant_slug FROM siswa s JOIN tenants t ON s.tenant_id = t.id WHERE s.tenant_id IN (${targetTenants.map(() => '?').join(',')})`
    const params = [...targetTenants]
    if (search) {
      sql += ' AND (s.nama LIKE ? OR s.nis LIKE ? OR s.nisn LIKE ?)'
      const q = `%${search}%`
      params.push(q, q, q)
    }
    sql += ' ORDER BY s.nama LIMIT ? OFFSET ?'
    params.push(Number(limit), Number(offset))

    const students = db.prepare(sql).all(...params)
    res.json(students)
  })

  // Cross-tenant: Get GTK from other tenants in same foundation (admin+)
  app.get('/api/foundation/gtk', authMiddleware, (req, res) => {
    const userFoundationId = db.prepare('SELECT foundation_id FROM tenants WHERE id = ?').get(req.tenantId)?.foundation_id
    if (!userFoundationId) return res.status(403).json({ error: 'Tenant tidak tergabung dalam yayasan' })
    if (!['admin', 'super_admin', 'operator', 'kepala'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' })

    const { search, limit = 100, offset = 0, tenant_id } = req.query
    let targetTenants = db.prepare('SELECT id FROM tenants WHERE foundation_id = ? AND aktif = 1').all(userFoundationId).map(t => t.id)
    if (tenant_id) {
      if (!targetTenants.includes(tenant_id)) return res.status(403).json({ error: 'Tenant tidak dalam yayasan yang sama' })
      targetTenants = [tenant_id]
    }

    let sql = `SELECT g.*, t.nama as tenant_nama, t.slug as tenant_slug FROM gtk g JOIN tenants t ON g.tenant_id = t.id WHERE g.tenant_id IN (${targetTenants.map(() => '?').join(',')})`
    const params = [...targetTenants]
    if (search) {
      sql += ' AND (g.nama LIKE ? OR g.nip LIKE ?)'
      const q = `%${search}%`
      params.push(q, q)
    }
    sql += ' ORDER BY g.nama LIMIT ? OFFSET ?'
    params.push(Number(limit), Number(offset))

    const gtk = db.prepare(sql).all(...params)
    res.json(gtk)
  })

  // Cross-tenant: Get absensi rekap from other tenants in same foundation (admin+)
  app.get('/api/foundation/absensi', authMiddleware, (req, res) => {
    const userFoundationId = db.prepare('SELECT foundation_id FROM tenants WHERE id = ?').get(req.tenantId)?.foundation_id
    if (!userFoundationId) return res.status(403).json({ error: 'Tenant tidak tergabung dalam yayasan' })
    if (!['admin', 'super_admin', 'operator', 'kepala'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' })

    const { tanggal, tenant_id } = req.query
    if (!tanggal) return res.status(400).json({ error: 'Parameter tanggal wajib' })

    let targetTenants = db.prepare('SELECT id FROM tenants WHERE foundation_id = ? AND aktif = 1').all(userFoundationId).map(t => t.id)
    if (tenant_id) {
      if (!targetTenants.includes(tenant_id)) return res.status(403).json({ error: 'Tenant tidak dalam yayasan yang sama' })
      targetTenants = [tenant_id]
    }

    const placeholders = targetTenants.map(() => '?').join(',')
    const absensi = db.prepare(`
      SELECT a.*, s.nama as siswa_nama, s.nis, r.nama as rombel_nama, t.nama as tenant_nama, t.slug as tenant_slug
      FROM absensi_siswa a
      JOIN siswa s ON a.siswa_id = s.id
      JOIN rombel r ON s.rombel_id = r.id
      JOIN tenants t ON a.tenant_id = t.id
      WHERE a.tenant_id IN (${placeholders}) AND a.tanggal = ?
      ORDER BY t.nama, r.nama, s.nama
    `).all(...targetTenants, tanggal)
    res.json(absensi)
  })

  // Cross-tenant: Get nilai from other tenants in same foundation (admin+)
  app.get('/api/foundation/nilai', authMiddleware, (req, res) => {
    const userFoundationId = db.prepare('SELECT foundation_id FROM tenants WHERE id = ?').get(req.tenantId)?.foundation_id
    if (!userFoundationId) return res.status(403).json({ error: 'Tenant tidak tergabung dalam yayasan' })
    if (!['admin', 'super_admin', 'operator', 'kepala', 'guru', 'wali_kelas'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' })

    const { semester, tahun_ajaran, mapel_id, tenant_id } = req.query
    let targetTenants = db.prepare('SELECT id FROM tenants WHERE foundation_id = ? AND aktif = 1').all(userFoundationId).map(t => t.id)
    if (tenant_id) {
      if (!targetTenants.includes(tenant_id)) return res.status(403).json({ error: 'Tenant tidak dalam yayasan yang sama' })
      targetTenants = [tenant_id]
    }

    const placeholders = targetTenants.map(() => '?').join(',')
    let sql = `
      SELECT n.*, s.nama as siswa_nama, s.nis, m.nama as mapel_nama, t.nama as tenant_nama, t.slug as tenant_slug
      FROM rapor n
      JOIN siswa s ON n.siswa_id = s.id
      JOIN mapel m ON n.mapel_id = m.id
      JOIN tenants t ON n.tenant_id = t.id
      WHERE n.tenant_id IN (${placeholders})
    `
    const params = [...targetTenants]
    if (semester) { sql += ' AND n.semester = ?'; params.push(semester) }
    if (tahun_ajaran) { sql += ' AND n.tahun_ajaran = ?'; params.push(tahun_ajaran) }
    if (mapel_id) { sql += ' AND n.mapel_id = ?'; params.push(mapel_id) }
    sql += ' ORDER BY t.nama, s.nama, m.nama'

    const nilai = db.prepare(sql).all(...params)
    res.json(nilai)
  })
}

module.exports = { setupTenantTables, tenantMiddleware, tenantQuery, registerTenantRoutes, BASE_DOMAIN }
