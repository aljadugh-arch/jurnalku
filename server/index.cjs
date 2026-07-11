const express = require('express')
try { require('dotenv').config({ path: require('path').join(__dirname, '.env') }) } catch {}
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const Database = require('better-sqlite3')
const path = require('path')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const multer = require('multer')
const { execSync } = require('child_process')
const { setupTenantTables, tenantMiddleware, registerTenantRoutes } = require('./tenant.cjs')

const app = express()
const PORT = process.env.PORT || 3001
const IS_PROD = process.env.NODE_ENV === 'production'
const JWT_SECRET = process.env.JWT_SECRET || 'jurnalku-secret-key-2024'

// FATAL: refuse to boot in production with the default secret
if (IS_PROD && JWT_SECRET === 'jurnalku-secret-key-2024') {
  console.error('FATAL: JWT_SECRET tidak diset di production. Set env JWT_SECRET dengan nilai acak.')
  process.exit(1)
}

app.set('trust proxy', 1) // behind nginx reverse proxy

// Security headers (allow inline for SPA + same-origin API)
app.use(helmet({
  contentSecurityPolicy: false, // SPA index.html served locally; nginx handles TLS
  crossOriginEmbedderPolicy: false
}))

// CORS: restrict to known origins in production, allow all in dev
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://jurnal.cc.cd')
  .split(',').map(s => s.trim())
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true) // curl / same-origin / mobile
    if (!IS_PROD) return cb(null, true)
    // allow main domain + any *.jurnal.cc.cd subdomain (multi-tenant)
    if (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.jurnal\.cc\.cd$/i.test(origin)) {
      return cb(null, true)
    }
    // allow registered custom domains (from tenant DB)
    const host = origin.replace(/^https?:\/\//, '').split(':')[0].toLowerCase()
    const tenant = db.prepare('SELECT id FROM tenants WHERE domain_custom = ? AND aktif = 1').get(host)
    if (tenant) return cb(null, true)
    return cb(new Error('Not allowed by CORS'))
  },
  credentials: true
}))

app.use(express.json({ limit: '2mb' }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
app.use(express.static(path.join(__dirname, '..', 'dist')))

// Rate limiter: strict on auth (brute-force), lenient global
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 1000,
  skipSuccessfulRequests: true,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi 1 menit.' },
  standardHeaders: true,
  legacyHeaders: false
})
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 2000, // lenient: SPA can burst on dashboard
  standardHeaders: true,
  legacyHeaders: false
})
app.use('/api/', apiLimiter)

// Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
})
const upload = multer({ storage })

// Database setup
const db = new Database(path.join(__dirname, 'jurnalku.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'guru',
    nip TEXT,
    nis TEXT,
    avatar TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY DEFAULT 'main',
    nama_lembaga TEXT DEFAULT 'Madrasah Digital',
    alamat TEXT DEFAULT '',
    telepon TEXT DEFAULT '',
    email TEXT DEFAULT '',
    logo TEXT DEFAULT '',
    theme TEXT DEFAULT 'light',
    primary_color TEXT DEFAULT '#1e40af',
    accent_color TEXT DEFAULT '#059669',
    sidebar_color TEXT DEFAULT '#1e293b',
    geo_latitude REAL,
    geo_longitude REAL,
    geo_radius INTEGER DEFAULT 200,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS siswa (
    id TEXT PRIMARY KEY,
    nis TEXT UNIQUE NOT NULL,
    nisn TEXT,
    nama TEXT NOT NULL,
    jenis_kelamin TEXT NOT NULL,
    tempat_lahir TEXT,
    tanggal_lahir TEXT,
    alamat TEXT,
    no_hp TEXT,
    nama_ortu TEXT,
    rombel_id TEXT,
    foto TEXT,
    status TEXT DEFAULT 'aktif',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS gtk (
    id TEXT PRIMARY KEY,
    nip TEXT UNIQUE,
    nuptk TEXT,
    nama TEXT NOT NULL,
    jenis_kelamin TEXT NOT NULL,
    tempat_lahir TEXT,
    tanggal_lahir TEXT,
    alamat TEXT,
    no_hp TEXT,
    email TEXT,
    jabatan TEXT DEFAULT 'guru',
    status_kepegawaian TEXT DEFAULT 'honorer',
    bidang_studi TEXT,
    foto TEXT,
    status TEXT DEFAULT 'aktif',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mapel (
    id TEXT PRIMARY KEY,
    kode TEXT UNIQUE NOT NULL,
    nama TEXT NOT NULL,
    kelompok TEXT DEFAULT 'wajib',
    tingkat TEXT DEFAULT '[]',
    jam_per_minggu INTEGER DEFAULT 2
  );

  CREATE TABLE IF NOT EXISTS rombel (
    id TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    tingkat TEXT NOT NULL,
    tahun_ajaran TEXT NOT NULL,
    wali_kelas_id TEXT,
    kapasitas INTEGER DEFAULT 36,
    FOREIGN KEY (wali_kelas_id) REFERENCES gtk(id)
  );

  CREATE TABLE IF NOT EXISTS jadwal (
    id TEXT PRIMARY KEY,
    mapel_id TEXT NOT NULL,
    rombel_id TEXT NOT NULL,
    gtk_id TEXT NOT NULL,
    hari TEXT NOT NULL,
    jam_mulai TEXT NOT NULL,
    jam_selesai TEXT NOT NULL,
    ruangan TEXT,
    FOREIGN KEY (mapel_id) REFERENCES mapel(id),
    FOREIGN KEY (rombel_id) REFERENCES rombel(id),
    FOREIGN KEY (gtk_id) REFERENCES gtk(id)
  );

  CREATE TABLE IF NOT EXISTS jurnal_mengajar (
    id TEXT PRIMARY KEY,
    guru_id TEXT NOT NULL,
    mapel_id TEXT NOT NULL,
    rombel_id TEXT NOT NULL,
    tanggal TEXT NOT NULL,
    jam_ke INTEGER,
    materi TEXT,
    kegiatan TEXT,
    catatan TEXT,
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (guru_id) REFERENCES gtk(id),
    FOREIGN KEY (mapel_id) REFERENCES mapel(id),
    FOREIGN KEY (rombel_id) REFERENCES rombel(id)
  );

  CREATE TABLE IF NOT EXISTS penilaian_harian (
    id TEXT PRIMARY KEY,
    jurnal_id TEXT,
    siswa_id TEXT NOT NULL,
    mapel_id TEXT NOT NULL,
    tanggal TEXT NOT NULL,
    sikap INTEGER DEFAULT 0,
    keaktifan INTEGER DEFAULT 0,
    pengetahuan INTEGER DEFAULT 0,
    catatan TEXT,
    tenant_id TEXT DEFAULT 'default',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (jurnal_id) REFERENCES jurnal_mengajar(id),
    FOREIGN KEY (siswa_id) REFERENCES siswa(id),
    FOREIGN KEY (mapel_id) REFERENCES mapel(id)
  );
  CREATE INDEX IF NOT EXISTS idx_penilaian_tenant ON penilaian_harian(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_penilaian_siswa ON penilaian_harian(siswa_id);
  CREATE INDEX IF NOT EXISTS idx_penilaian_tanggal ON penilaian_harian(tanggal);

  CREATE TABLE IF NOT EXISTS rapor (
    id TEXT PRIMARY KEY,
    siswa_id TEXT NOT NULL,
    mapel_id TEXT NOT NULL,
    tahun_ajaran TEXT NOT NULL,
    semester TEXT NOT NULL,
    jenis TEXT DEFAULT 'tengah',
    nilai_pengetahuan INTEGER DEFAULT 0,
    nilai_keterampilan INTEGER DEFAULT 0,
    nilai_sikap INTEGER DEFAULT 0,
    nilai_akhir INTEGER DEFAULT 0,
    predikat TEXT,
    deskripsi TEXT,
    kkm INTEGER DEFAULT 70,
    tenant_id TEXT DEFAULT 'default',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT,
    FOREIGN KEY (siswa_id) REFERENCES siswa(id),
    FOREIGN KEY (mapel_id) REFERENCES mapel(id)
  );
  CREATE INDEX IF NOT EXISTS idx_rapor_tenant ON rapor(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_rapor_siswa ON rapor(siswa_id);
  CREATE INDEX IF NOT EXISTS idx_rapor_semester ON rapor(tahun_ajaran, semester, jenis);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_rapor_unique ON rapor(siswa_id, mapel_id, tahun_ajaran, semester, jenis);

  CREATE TABLE IF NOT EXISTS rapor_sync_log (
    id TEXT PRIMARY KEY,
    target TEXT NOT NULL,
    rombel_id TEXT,
    tahun_ajaran TEXT,
    semester TEXT,
    total_records INTEGER,
    status TEXT,
    response TEXT,
    tenant_id TEXT DEFAULT 'default',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS absensi_siswa (
    id TEXT PRIMARY KEY,
    siswa_id TEXT NOT NULL,
    rombel_id TEXT,
    tanggal TEXT NOT NULL,
    jam_ke INTEGER,
    status TEXT NOT NULL,
    metode TEXT DEFAULT 'manual',
    keterangan TEXT,
    waktu_absen TEXT,
    FOREIGN KEY (siswa_id) REFERENCES siswa(id)
  );

  CREATE TABLE IF NOT EXISTS absensi_guru (
    id TEXT PRIMARY KEY,
    gtk_id TEXT NOT NULL,
    tanggal TEXT NOT NULL,
    waktu_masuk TEXT,
    waktu_pulang TEXT,
    latitude REAL,
    longitude REAL,
    status TEXT DEFAULT 'hadir',
    foto_selfie TEXT,
    jarak_dari_sekolah REAL,
    FOREIGN KEY (gtk_id) REFERENCES gtk(id)
  );

  CREATE TABLE IF NOT EXISTS ekskul (
    id TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    pembina_id TEXT,
    hari TEXT,
    jam_mulai TEXT,
    jam_selesai TEXT,
    deskripsi TEXT,
    FOREIGN KEY (pembina_id) REFERENCES gtk(id)
  );

  CREATE TABLE IF NOT EXISTS absensi_ekskul (
    id TEXT PRIMARY KEY,
    siswa_id TEXT NOT NULL,
    ekskul_id TEXT NOT NULL,
    tanggal TEXT NOT NULL,
    status TEXT NOT NULL,
    keterangan TEXT,
    FOREIGN KEY (siswa_id) REFERENCES siswa(id),
    FOREIGN KEY (ekskul_id) REFERENCES ekskul(id)
  );

  CREATE TABLE IF NOT EXISTS ekskul_anggota (
    id TEXT PRIMARY KEY,
    ekskul_id TEXT NOT NULL,
    siswa_id TEXT NOT NULL,
    tenant_id TEXT,
    UNIQUE(ekskul_id, siswa_id),
    FOREIGN KEY (ekskul_id) REFERENCES ekskul(id),
    FOREIGN KEY (siswa_id) REFERENCES siswa(id)
  );

  CREATE TABLE IF NOT EXISTS tahun_ajaran (
    id TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    semester TEXT NOT NULL,
    aktif INTEGER DEFAULT 0,
    tanggal_mulai TEXT,
    tanggal_selesai TEXT
  );

  CREATE TABLE IF NOT EXISTS jenis_tagihan (
    id TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    nominal REAL NOT NULL,
    deskripsi TEXT,
    tipe TEXT DEFAULT 'bulanan',
    aktif INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS tagihan (
    id TEXT PRIMARY KEY,
    siswa_id TEXT NOT NULL,
    jenis_tagihan_id TEXT NOT NULL,
    bulan TEXT,
    tahun TEXT,
    nominal REAL NOT NULL,
    status TEXT DEFAULT 'belum_bayar',
    tanggal_bayar TEXT,
    metode_bayar TEXT,
    keterangan TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (siswa_id) REFERENCES siswa(id),
    FOREIGN KEY (jenis_tagihan_id) REFERENCES jenis_tagihan(id)
  );

  CREATE TABLE IF NOT EXISTS tabungan (
    id TEXT PRIMARY KEY,
    siswa_id TEXT NOT NULL,
    tanggal TEXT NOT NULL,
    tipe TEXT NOT NULL,
    nominal REAL NOT NULL,
    saldo_akhir REAL NOT NULL,
    keterangan TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (siswa_id) REFERENCES siswa(id)
  );

  CREATE TABLE IF NOT EXISTS modul_ajar (
    id TEXT PRIMARY KEY,
    gtk_id TEXT,
    mapel TEXT NOT NULL,
    fase TEXT,
    materi_pokok TEXT,
    dimensi_profil TEXT DEFAULT '[]',
    model_pembelajaran TEXT,
    target_peserta TEXT,
    tujuan_pembelajaran TEXT,
    alokasi_waktu TEXT,
    hasil TEXT,
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pengajar (
    id TEXT PRIMARY KEY,
    gtk_id TEXT NOT NULL,
    mapel_id TEXT NOT NULL,
    rombel_id TEXT NOT NULL,
    jam_per_minggu INTEGER DEFAULT 2,
    FOREIGN KEY (gtk_id) REFERENCES gtk(id),
    FOREIGN KEY (mapel_id) REFERENCES mapel(id),
    FOREIGN KEY (rombel_id) REFERENCES rombel(id)
  );

  CREATE TABLE IF NOT EXISTS kalender_kbm (
    id TEXT PRIMARY KEY,
    tanggal TEXT NOT NULL,
    judul TEXT NOT NULL,
    jenis TEXT DEFAULT 'kbm_aktif',
    keterangan TEXT,
    warna TEXT DEFAULT '#3b82f6'
  );

  CREATE TABLE IF NOT EXISTS wa_gateway_config (
    id TEXT PRIMARY KEY DEFAULT 'main',
    provider TEXT DEFAULT 'baileys',
    enabled INTEGER DEFAULT 0,
    sender_name TEXT DEFAULT 'JURNALKU',
    baileys_session TEXT,
    baileys_webhook TEXT DEFAULT 'http://localhost:8000/send-message',
    sidobe_api_url TEXT DEFAULT 'https://api.sidobe.com',
    sidobe_api_key TEXT,
    sidobe_device_id TEXT
  );

  CREATE TABLE IF NOT EXISTS broadcast_log (
    id TEXT PRIMARY KEY,
    kategori TEXT NOT NULL,
    judul TEXT NOT NULL,
    pesan TEXT NOT NULL,
    total_penerima INTEGER DEFAULT 0,
    total_terkirim INTEGER DEFAULT 0,
    total_gagal INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS broadcast_detail (
    id TEXT PRIMARY KEY,
    broadcast_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    nama TEXT,
    status TEXT DEFAULT 'pending',
    error TEXT,
    sent_at TEXT,
    FOREIGN KEY (broadcast_id) REFERENCES broadcast_log(id)
  );
`);

// Seed WA Gateway config
const existWA = db.prepare("SELECT id FROM wa_gateway_config WHERE id = 'main'").get()
if (!existWA) {
  db.prepare("INSERT INTO wa_gateway_config (id) VALUES ('main')").run()
}
const existSettings = db.prepare('SELECT id FROM settings WHERE id = ?').get('main')
if (!existSettings) {
  db.prepare('INSERT INTO settings (id) VALUES (?)').run('main')
}

// Seed tahun ajaran (minimal, required by app)
const existTA = db.prepare('SELECT id FROM tahun_ajaran LIMIT 1').get()
if (!existTA) {
  db.prepare('INSERT INTO tahun_ajaran (id, nama, semester, aktif, tanggal_mulai, tanggal_selesai) VALUES (?,?,?,?,?,?)').run(uuidv4(), '2024/2025', 'Ganjil', 0, '2024-07-15', '2024-12-20')
  db.prepare('INSERT INTO tahun_ajaran (id, nama, semester, aktif, tanggal_mulai, tanggal_selesai) VALUES (?,?,?,?,?,?)').run(uuidv4(), '2024/2025', 'Genap', 1, '2025-01-06', '2025-06-20')
}

setupTenantTables(db)
for (const col of [
  ['settings', 'geo_latitude', 'REAL'],
  ['settings', 'geo_longitude', 'REAL'],
  ['settings', 'geo_radius', 'INTEGER DEFAULT 200'],
  ['settings', 'background', "TEXT DEFAULT ''"],
  ['settings', 'jenjang', "TEXT DEFAULT ''"],
  ['settings', 'hari_libur', "TEXT DEFAULT '[\"jumat\",\"minggu\"]'"],
  ['wa_gateway_config', 'tenant_id', "TEXT DEFAULT 'default'"],
  ['broadcast_log', 'tenant_id', "TEXT DEFAULT 'default'"],
  ['broadcast_detail', 'tenant_id', "TEXT DEFAULT 'default'"],
  ['modul_ajar', 'kurikulum', "TEXT DEFAULT 'merdeka'"]
]) {
  try { db.prepare(`ALTER TABLE ${col[0]} ADD COLUMN ${col[1]} ${col[2]}`).run() } catch {}
}
// Backfill legacy global rows -> 'default' tenant
try { db.prepare("UPDATE wa_gateway_config SET tenant_id='default' WHERE tenant_id IS NULL OR tenant_id=''").run() } catch {}
try { db.prepare("UPDATE broadcast_log SET tenant_id='default' WHERE tenant_id IS NULL OR tenant_id=''").run() } catch {}
try { db.prepare("UPDATE broadcast_detail SET tenant_id='default' WHERE tenant_id IS NULL OR tenant_id=''").run() } catch {}
// Ensure a WA config row exists per tenant (lazy: create on demand in getWaConfig)

// Tenant detection middleware (API routes only)
app.use(tenantMiddleware(db))

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Token required' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    // Override tenantId from JWT if present (user's actual tenant)
    if (req.user.tenant_id) req.tenantId = req.user.tenant_id
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

// Role-based authorization. Self-contained: verifies token AND role in one step.
// Usage: app.post('/api/x', ADMIN, handler)  — no need to also pass authMiddleware.
function requireRole(...roles) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'Token required' })
    try {
      req.user = jwt.verify(token, JWT_SECRET)
      if (req.user.tenant_id) req.tenantId = req.user.tenant_id
    } catch {
      return res.status(401).json({ error: 'Invalid token' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Akses ditolak: role tidak berwenang' })
    }
    next()
  }
}
const ADMIN = requireRole('admin', 'super_admin')
const SUPER = requireRole('super_admin')
const STAFF = requireRole('admin', 'super_admin', 'guru', 'wali_kelas')

// Lightweight input validation at trust boundaries (no external lib).
const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 120
const isStr = (v, min = 1, max = 200) => typeof v === 'string' && v.trim().length >= min && v.length <= max
// Returns error string or null
function vLogin({ email, password }) {
  if (!isEmail(email)) return 'Email tidak valid'
  if (!isStr(password, 1, 100)) return 'Password wajib diisi'
  return null
}
function vRegister({ nama, email, password }) {
  if (!isStr(nama, 2, 100)) return 'Nama minimal 2 karakter'
  if (!isEmail(email)) return 'Email tidak valid'
  if (!isStr(password, 6, 100)) return 'Password minimal 6 karakter'
  return null
}
function vChangePw({ current_password, new_password }) {
  if (!isStr(current_password, 1, 100)) return 'Password lama wajib diisi'
  if (!isStr(new_password, 6, 100)) return 'Password baru minimal 6 karakter'
  return null
}

// Tenant-aware DB helpers
function tDb(req) {
  const tid = req.tenantId || 'default'
  return {
    all: (sql, ...params) => db.prepare(sql + (sql.toLowerCase().includes('where') ? ' AND tenant_id=?' : ' WHERE tenant_id=?')).all(...params, tid),
    get: (sql, ...params) => db.prepare(sql + (sql.toLowerCase().includes('where') ? ' AND tenant_id=?' : ' WHERE tenant_id=?')).get(...params, tid),
    raw: (sql, ...params) => db.prepare(sql).all(...params),
    rawGet: (sql, ...params) => db.prepare(sql).get(...params),
    run: (sql, ...params) => db.prepare(sql).run(...params),
    tid
  }
}

// ==================== AUTH ====================
app.post('/api/auth/login', authLimiter, (req, res) => {
  const { email, password } = req.body
  const vErr = vLogin(req.body); if (vErr) return res.status(400).json({ error: vErr })
  const tenantId = req.tenantId || 'default'
  // super_admin can login from any tenant
  let user = db.prepare('SELECT * FROM users WHERE email = ? AND tenant_id = ?').get(email, tenantId)
  if (!user) user = db.prepare("SELECT * FROM users WHERE email = ? AND role = 'super_admin'").get(email)
  if (!user) user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Email atau password salah' })
  }
  const token = jwt.sign({ id: user.id, role: user.role, nama: user.nama, email: user.email, tenant_id: user.tenant_id }, JWT_SECRET, { expiresIn: '24h' })
  res.json({ token, user: { id: user.id, nama: user.nama, email: user.email, role: user.role, nip: user.nip, nis: user.nis, avatar: user.avatar } })
})

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, nama, email, role, nip, nis, avatar FROM users WHERE id = ?').get(req.user.id)
  res.json(user)
})

app.post('/api/auth/register', (req, res) => {
  const { nama_lembaga, nama, email, password, no_hp, domain_type, custom_domain, slug: slugInput } = req.body
  const vErr = vRegister(req.body); if (vErr) return res.status(400).json({ error: vErr })
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (exists) return res.status(400).json({ error: 'Email sudah terdaftar' })

  // Create new tenant for the lembaga
  const tenantId = uuidv4()
  let slug = slugInput
    ? slugInput.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 30)
    : (nama_lembaga || nama).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 30)
  if (!slug) slug = 'lembaga-' + Date.now().toString(36)
  if (db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug)) {
    return res.status(400).json({ error: 'Slug/subdomain sudah digunakan, pilih lain' })
  }

  // Custom domain: validate format & uniqueness
  let domainVal = null
  let domainStatus = null
  if (domain_type === 'custom' && custom_domain) {
    const d = custom_domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(d)) {
      return res.status(400).json({ error: 'Format domain tidak valid' })
    }
    const dup = db.prepare('SELECT id FROM tenants WHERE domain_custom = ?').get(d)
    if (dup) return res.status(400).json({ error: 'Domain sudah digunakan tenant lain' })
    domainVal = d
    domainStatus = 'pending' // menunggu DNS resolve + provisioning
  }

  db.prepare('INSERT INTO tenants (id, slug, nama, email, domain_custom, domain_status) VALUES (?,?,?,?,?,?)')
    .run(tenantId, slug, nama_lembaga || nama, email, domainVal, domainStatus)

  // Create admin user for the tenant
  const id = uuidv4()
  const hashed = bcrypt.hashSync(password, 10)
  db.prepare('INSERT INTO users (id, nama, email, password, role, tenant_id) VALUES (?,?,?,?,?,?)').run(id, nama, email, hashed, 'admin', tenantId)

  // Create default settings for tenant
  db.prepare('INSERT INTO settings (id, nama_lembaga, tenant_id) VALUES (?,?,?)').run(uuidv4(), nama_lembaga || nama, tenantId)
  db.prepare('INSERT INTO notif_settings (id, tenant_id) VALUES (?,?)').run('main_' + tenantId, tenantId)

  // Auto-login: return token + user so FE can go straight to dashboard.
  const token = jwt.sign({ id, role: 'admin', nama, email, tenant_id: tenantId }, JWT_SECRET, { expiresIn: '24h' })
  const appUrl = domainVal
    ? `https://${domainVal}`
    : `https://${slug}.jurnal.cc.cd`
  res.json({
    success: true,
    message: domainVal
      ? 'Registrasi berhasil! Silakan atur DNS domain Anda untuk mengaktifkan.'
      : 'Registrasi berhasil',
    slug,
    domain_custom: domainVal,
    domain_status: domainStatus,
    url: appUrl,
    token,
    user: { id, nama, email, role: 'admin' }
  })
})

// Verify & activate custom domain (admin only, must own tenant)
app.post('/api/tenant/verify-domain', authMiddleware, (req, res) => {
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.user.tenant_id)
  if (!tenant || !tenant.domain_custom) {
    return res.status(400).json({ error: 'Tidak ada domain custom yang terdaftar' })
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Hanya admin yang bisa aktivasi domain' })
  }

  const domain = tenant.domain_custom
  // Check DNS resolve
  try {
    const out = execSync(`dig +short ${domain} A @8.8.8.8`, { timeout: 10000 }).toString().trim()
    const ips = out.split('\n').map(s => s.trim()).filter(Boolean)
    if (!ips.includes('129.226.82.94')) {
      return res.json({
        success: false,
        status: 'dns_pending',
        message: `DNS belum mengarah ke server. Record A harus 129.226.82.94 (saat ini: ${ips.join(', ') || 'belum ada record'})`,
        expected_ip: '129.226.82.94',
        current_ips: ips
      })
    }
  } catch (e) {
    return res.json({
      success: false,
      status: 'dns_error',
      message: 'Gagal cek DNS: ' + (e.message || 'timeout')
    })
  }

  // DNS OK — trigger provisioning script
  try {
    const script = path.join(__dirname, 'scripts', 'provision-domain.sh')
    execSync(`bash ${script} ${domain}`, { timeout: 120000, stdio: 'pipe' })
    db.prepare('UPDATE tenants SET domain_status = ? WHERE id = ?').run('active', tenant.id)
    res.json({ success: true, status: 'active', message: `Domain ${domain} berhasil diaktifkan!`, url: `https://${domain}` })
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().slice(-300) : e.message
    db.prepare('UPDATE tenants SET domain_status = ? WHERE id = ?').run('error', tenant.id)
    res.status(500).json({ success: false, status: 'error', message: 'Gagal provisioning: ' + msg })
  }
})

// Get domain status for current tenant (admin)
app.get('/api/tenant/domain-status', authMiddleware, (req, res) => {
  const t = db.prepare('SELECT domain_custom, domain_status, slug FROM tenants WHERE id = ?').get(req.user.tenant_id)
  if (!t) return res.status(404).json({ error: 'Tenant tidak ditemukan' })
  res.json(t)
})

app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (!user) return res.status(400).json({ error: 'Email tidak ditemukan' })
  // Simulasi: generate token reset (tanpa kirim email real)
  const token = uuidv4()
  db.prepare("CREATE TABLE IF NOT EXISTS password_resets (id TEXT PRIMARY KEY, user_id TEXT, token TEXT, created_at TEXT DEFAULT (datetime('now')))").run()
  db.prepare('INSERT INTO password_resets (id, user_id, token) VALUES (?,?,?)').run(uuidv4(), user.id, token)
  res.json({ success: true, message: 'Link reset password telah dikirim ke email Anda' })
})

// Change password (authenticated user)
app.put('/api/auth/change-password', authMiddleware, (req, res) => {
  const { current_password, new_password } = req.body
  const vErr = vChangePw(req.body); if (vErr) return res.status(400).json({ error: vErr })
  
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  if (!user || !bcrypt.compareSync(current_password, user.password)) {
    return res.status(401).json({ error: 'Password lama salah' })
  }
  
  const hashedNew = bcrypt.hashSync(new_password, 10)
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedNew, req.user.id)
  res.json({ success: true, message: 'Password berhasil diubah' })
})

// Update own profile (nama, email)
app.put('/api/auth/profile', authMiddleware, (req, res) => {
  const { nama, email } = req.body
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama wajib diisi' })
  if (email && email.trim()) {
    const dup = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.user.id)
    if (dup) return res.status(409).json({ error: 'Email sudah dipakai akun lain' })
    db.prepare('UPDATE users SET nama = ?, email = ? WHERE id = ?').run(nama.trim(), email.trim(), req.user.id)
  } else {
    db.prepare('UPDATE users SET nama = ? WHERE id = ?').run(nama.trim(), req.user.id)
  }
  const user = db.prepare('SELECT id, nama, email, role, nip, nis, avatar FROM users WHERE id = ?').get(req.user.id)
  res.json(user)
})

// Upload own avatar
app.post('/api/auth/avatar', authMiddleware, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' })
  const avatarPath = `/uploads/${req.file.filename}`
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatarPath, req.user.id)
  res.json({ avatar: avatarPath })
})

// ==================== USER MANAGEMENT (admin lembaga) ====================
// Roles yang boleh dibuat operator lembaga. Kepala = pimpinan read-only.
const ASSIGNABLE_ROLES = ['kepala', 'admin', 'guru', 'wali_kelas', 'siswa']

app.get('/api/users', ADMIN, (req, res) => {
  res.json(db.prepare('SELECT id, nama, email, role, nip, nis, avatar FROM users WHERE tenant_id = ? ORDER BY role, nama').all(req.tenantId))
})

app.post('/api/users', ADMIN, (req, res) => {
  const { nama, email, password, role } = req.body
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama wajib diisi' })
  if (!isEmail(email)) return res.status(400).json({ error: 'Email tidak valid' })
  if (!isStr(password, 6, 100)) return res.status(400).json({ error: 'Password minimal 6 karakter' })
  if (!ASSIGNABLE_ROLES.includes(role)) return res.status(400).json({ error: 'Role tidak valid' })
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Email sudah terdaftar' })
  const id = uuidv4()
  db.prepare('INSERT INTO users (id, nama, email, password, role, tenant_id) VALUES (?,?,?,?,?,?)')
    .run(id, nama.trim(), email.trim(), bcrypt.hashSync(password, 10), role, req.tenantId)
  res.json({ id, nama, email, role })
})

app.put('/api/users/:id', ADMIN, (req, res) => {
  const { nama, email, role, password } = req.body
  const target = db.prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId)
  if (!target) return res.status(404).json({ error: 'User tidak ditemukan' })
  if (target.role === 'super_admin') return res.status(403).json({ error: 'Tidak bisa mengubah superadmin' })
  if (role && !ASSIGNABLE_ROLES.includes(role)) return res.status(400).json({ error: 'Role tidak valid' })
  db.prepare('UPDATE users SET nama = COALESCE(?, nama), email = COALESCE(?, email), role = COALESCE(?, role) WHERE id = ? AND tenant_id = ?')
    .run(nama || null, email || null, role || null, req.params.id, req.tenantId)
  if (password && isStr(password, 6, 100)) {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id)
  }
  res.json({ success: true })
})

app.delete('/api/users/:id', ADMIN, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Tidak bisa hapus akun sendiri' })
  const target = db.prepare('SELECT role FROM users WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId)
  if (!target) return res.status(404).json({ error: 'User tidak ditemukan' })
  if (target.role === 'super_admin') return res.status(403).json({ error: 'Tidak bisa menghapus superadmin' })
  db.prepare('DELETE FROM users WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId)
  res.json({ success: true })
})

// ---- Akun pengguna dari data guru (GTK) ----
// Daftar guru yang BELUM punya akun user (match by nip, atau nama jika nip kosong)
app.get('/api/gtk/tanpa-akun', ADMIN, (req, res) => {
  const rows = db.prepare(`
    SELECT g.id, g.nip, g.nama, g.email, g.no_hp, g.jabatan
    FROM gtk g
    WHERE g.tenant_id = ?
      AND g.status = 'aktif'
      AND NOT EXISTS (
        SELECT 1 FROM users u
        WHERE u.tenant_id = g.tenant_id
          AND ( (g.nip IS NOT NULL AND g.nip <> '' AND u.nip = g.nip)
                OR (g.email IS NOT NULL AND g.email <> '' AND u.email = g.email) )
      )
    ORDER BY g.nama
  `).all(req.tenantId)
  res.json(rows)
})

// Buat akun user dari satu/lebih guru. Body: { items: [{ gtk_id, password?, role? }] }
// Password default = NIP guru (jika kosong, pakai no_hp; jika kosong juga, wajib isi manual).
// Email login: gtk.email jika ada, else <nip|id>@<tenant>.local
app.post('/api/users/from-gtk', ADMIN, (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : []
  if (!items.length) return res.status(400).json({ error: 'Tidak ada guru dipilih' })
  const slug = (db.prepare('SELECT slug FROM tenants WHERE id = ?').get(req.tenantId) || {}).slug || 'app'
  const created = [], skipped = []
  const insert = db.prepare('INSERT INTO users (id, nama, email, password, role, nip, tenant_id) VALUES (?,?,?,?,?,?,?)')
  const tx = db.transaction(() => {
    for (const it of items) {
      const g = db.prepare('SELECT * FROM gtk WHERE id = ? AND tenant_id = ?').get(it.gtk_id, req.tenantId)
      if (!g) { skipped.push({ gtk_id: it.gtk_id, alasan: 'guru tidak ditemukan' }); continue }
      const role = ['guru', 'kepala'].includes(it.role) ? it.role : 'guru'
      const pwd = (it.password && String(it.password).length >= 6) ? String(it.password) : (g.nip || g.no_hp || '')
      if (!pwd || pwd.length < 6) { skipped.push({ nama: g.nama, alasan: 'password default (NIP/HP) < 6 karakter, isi manual' }); continue }
      const email = (g.email && g.email.trim()) ? g.email.trim() : `${(g.nip || g.id).toString().replace(/\s/g,'')}@${slug}.local`
      if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) { skipped.push({ nama: g.nama, alasan: 'email sudah dipakai: ' + email }); continue }
      const id = uuidv4()
      insert.run(id, g.nama, email, bcrypt.hashSync(pwd, 10), role, g.nip || null, req.tenantId)
      created.push({ id, nama: g.nama, email, password_default: (it.password ? undefined : pwd), role })
    }
  })
  tx()
  res.json({ dibuat: created.length, dilewati: skipped.length, created, skipped })
})

// ==================== SETTINGS ====================

app.get('/api/settings', (req, res) => {
  let tenantId = req.tenantId
  const token = req.headers.authorization?.split(' ')[1]
  if (token) {
    try {
      const user = jwt.verify(token, JWT_SECRET)
      if (user.tenant_id) tenantId = user.tenant_id
    } catch {}
  }
  const settings = db.prepare('SELECT * FROM settings WHERE id = ?').get('main_' + tenantId) || db.prepare('SELECT * FROM settings WHERE tenant_id = ? ORDER BY updated_at DESC, id DESC').get(tenantId) || db.prepare('SELECT * FROM settings WHERE id = ?').get('main')
  res.json(settings)
})

app.put('/api/settings', ADMIN, (req, res) => {
  const { nama_lembaga, alamat, telepon, email, theme, primary_color, accent_color, sidebar_color, geo_latitude, geo_longitude, geo_radius, jenjang, hari_libur } = req.body
  const id = 'main_' + req.tenantId
  db.prepare(`INSERT INTO settings (id, tenant_id, nama_lembaga, alamat, telepon, email, theme, primary_color, accent_color, sidebar_color, geo_latitude, geo_longitude, geo_radius, jenjang, hari_libur, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(id) DO UPDATE SET nama_lembaga=excluded.nama_lembaga, alamat=excluded.alamat, telepon=excluded.telepon, email=excluded.email, theme=excluded.theme, primary_color=excluded.primary_color, accent_color=excluded.accent_color, sidebar_color=excluded.sidebar_color, geo_latitude=excluded.geo_latitude, geo_longitude=excluded.geo_longitude, geo_radius=excluded.geo_radius, jenjang=excluded.jenjang, hari_libur=excluded.hari_libur, updated_at=datetime('now')`)
    .run(id, req.tenantId, nama_lembaga, alamat, telepon, email, theme, primary_color, accent_color, sidebar_color, geo_latitude || null, geo_longitude || null, geo_radius || 200, jenjang || '', JSON.stringify(hari_libur || []))
  res.json({ success: true })
})

app.post('/api/settings/logo', ADMIN, upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' })
  const logoPath = `/uploads/${req.file.filename}`
  const id = 'main_' + req.tenantId
  db.prepare(`INSERT INTO settings (id, tenant_id, logo, updated_at) VALUES (?,?,?,datetime('now'))
    ON CONFLICT(id) DO UPDATE SET logo=excluded.logo, updated_at=datetime('now')`).run(id, req.tenantId, logoPath)
  res.json({ logo: logoPath })
})

// Background dashboard/sidebar (#12)
app.post('/api/settings/background', ADMIN, upload.single('background'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' })
  const bgPath = `/uploads/${req.file.filename}`
  const id = 'main_' + req.tenantId
  db.prepare(`INSERT INTO settings (id, tenant_id, background, updated_at) VALUES (?,?,?,datetime('now'))
    ON CONFLICT(id) DO UPDATE SET background=excluded.background, updated_at=datetime('now')`).run(id, req.tenantId, bgPath)
  res.json({ background: bgPath })
})

app.delete('/api/settings/background', ADMIN, (req, res) => {
  const id = 'main_' + req.tenantId
  db.prepare(`INSERT INTO settings (id, tenant_id, background, updated_at) VALUES (?,?,'',datetime('now'))
    ON CONFLICT(id) DO UPDATE SET background='', updated_at=datetime('now')`).run(id, req.tenantId)
  res.json({ success: true })
})

// ==================== SISWA ====================
app.get('/api/siswa', authMiddleware, (req, res) => {
  const { search, rombel_id, status } = req.query
  let sql = 'SELECT * FROM siswa WHERE 1=1 AND tenant_id=?'
  const params = [req.tenantId]
  if (search) { sql += ' AND (nama LIKE ? OR nis LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  if (rombel_id) { sql += ' AND rombel_id = ?'; params.push(rombel_id) }
  if (status) { sql += ' AND status = ?'; params.push(status) }
  sql += ' ORDER BY nama'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/siswa', ADMIN, (req, res) => {
  const id = uuidv4()
  const { nis, nisn, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, nama_ortu, rombel_id } = req.body
  db.prepare('INSERT INTO siswa (id, nis, nisn, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, nama_ortu, rombel_id, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, nis, nisn, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, nama_ortu, rombel_id, req.tenantId)
  res.json({ id })
})

app.put('/api/siswa/:id', ADMIN, (req, res) => {
  const { nis, nisn, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, nama_ortu, rombel_id, status } = req.body
  db.prepare('UPDATE siswa SET nis=?, nisn=?, nama=?, jenis_kelamin=?, tempat_lahir=?, tanggal_lahir=?, alamat=?, no_hp=?, nama_ortu=?, rombel_id=?, status=? WHERE id=? AND tenant_id=?')
    .run(nis, nisn, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, nama_ortu, rombel_id, status, req.params.id, req.tenantId)
  res.json({ success: true })
})

app.delete('/api/siswa/:id', ADMIN, (req, res) => {
  try {
    db.prepare('DELETE FROM siswa WHERE id = ? AND tenant_id=?').run(req.params.id, req.tenantId)
    res.json({ success: true })
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return res.status(400).json({ error: 'Siswa masih digunakan di data lain (absensi/tagihan/tabungan/ekskul). Hapus data terkait dulu.' })
    throw e
  }
})

// ==================== GTK ====================
app.get('/api/gtk', authMiddleware, (req, res) => {
  const { search, jabatan, status_kepegawaian } = req.query
  let sql = 'SELECT * FROM gtk WHERE 1=1 AND tenant_id=?'
  const params = [req.tenantId]
  if (search) { sql += ' AND (nama LIKE ? OR nip LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  if (jabatan) { sql += ' AND jabatan = ?'; params.push(jabatan) }
  if (status_kepegawaian) { sql += ' AND status_kepegawaian = ?'; params.push(status_kepegawaian) }
  sql += ' ORDER BY nama'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/gtk', ADMIN, (req, res) => {
  const id = uuidv4()
  const { nip, nuptk, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, email, jabatan, status_kepegawaian, bidang_studi } = req.body
  db.prepare('INSERT INTO gtk (id, nip, nuptk, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, email, jabatan, status_kepegawaian, bidang_studi, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, nip, nuptk, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, email, jabatan, status_kepegawaian, bidang_studi, req.tenantId)
  res.json({ id })
})

app.put('/api/gtk/:id', ADMIN, (req, res) => {
  const { nip, nuptk, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, email, jabatan, status_kepegawaian, bidang_studi, status } = req.body
  db.prepare('UPDATE gtk SET nip=?, nuptk=?, nama=?, jenis_kelamin=?, tempat_lahir=?, tanggal_lahir=?, alamat=?, no_hp=?, email=?, jabatan=?, status_kepegawaian=?, bidang_studi=?, status=? WHERE id=? AND tenant_id=?')
    .run(nip, nuptk, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, email, jabatan, status_kepegawaian, bidang_studi, status, req.params.id, req.tenantId)
  res.json({ success: true })
})

app.delete('/api/gtk/:id', ADMIN, (req, res) => {
  try {
    db.prepare('DELETE FROM gtk WHERE id = ? AND tenant_id=?').run(req.params.id, req.tenantId)
    res.json({ success: true })
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return res.status(400).json({ error: 'GTK masih digunakan di data lain (jadwal/pengajar/ekskul). Hapus data terkait dulu.' })
    throw e
  }
})

app.post('/api/siswa/:id/foto', ADMIN, upload.single('foto'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' })
  const foto = '/uploads/' + req.file.filename
  db.prepare('UPDATE siswa SET foto=? WHERE id=? AND tenant_id=?').run(foto, req.params.id, req.tenantId)
  res.json({ foto })
})

app.post('/api/gtk/:id/foto', ADMIN, upload.single('foto'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' })
  const foto = '/uploads/' + req.file.filename
  db.prepare('UPDATE gtk SET foto=? WHERE id=? AND tenant_id=?').run(foto, req.params.id, req.tenantId)
  res.json({ foto })
})

// ==================== MAPEL ====================
app.get('/api/mapel', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM mapel WHERE tenant_id=? ORDER BY nama').all(req.tenantId))
})

app.post('/api/mapel', ADMIN, (req, res) => {
  const id = uuidv4()
  const { kode, nama, kelompok, jam_per_minggu } = req.body
  db.prepare('INSERT INTO mapel (id, kode, nama, kelompok, jam_per_minggu, tenant_id) VALUES (?,?,?,?,?,?)').run(id, kode, nama, kelompok, jam_per_minggu, req.tenantId)
  res.json({ id })
})

app.delete('/api/mapel/:id', ADMIN, (req, res) => {
  try {
    db.prepare('DELETE FROM mapel WHERE id = ? AND tenant_id=?').run(req.params.id, req.tenantId)
    res.json({ success: true })
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return res.status(400).json({ error: 'Mapel masih digunakan di data lain (jadwal/pengajar). Hapus data terkait dulu.' })
    throw e
  }
})

// ==================== ROMBEL ====================
app.get('/api/rombel', authMiddleware, (req, res) => {
  const rows = db.prepare(`SELECT r.*, g.nama as wali_kelas_nama, (SELECT COUNT(*) FROM siswa WHERE rombel_id = r.id) as jumlah_siswa FROM rombel r LEFT JOIN gtk g ON r.wali_kelas_id = g.id WHERE r.tenant_id=? ORDER BY r.tingkat, r.nama`).all(req.tenantId)
  res.json(rows)
})

app.post('/api/rombel', ADMIN, (req, res) => {
  const id = uuidv4()
  const { nama, tingkat, tahun_ajaran, wali_kelas_id, kapasitas } = req.body
  db.prepare('INSERT INTO rombel (id, nama, tingkat, tahun_ajaran, wali_kelas_id, kapasitas, tenant_id) VALUES (?,?,?,?,?,?,?)').run(id, nama, tingkat, tahun_ajaran, wali_kelas_id, kapasitas, req.tenantId)
  res.json({ id })
})

app.put('/api/rombel/:id', ADMIN, (req, res) => {
  const { nama, tingkat, tahun_ajaran, wali_kelas_id, kapasitas } = req.body
  db.prepare('UPDATE rombel SET nama=?, tingkat=?, tahun_ajaran=?, wali_kelas_id=?, kapasitas=? WHERE id=? AND tenant_id=?')
    .run(nama, tingkat, tahun_ajaran, wali_kelas_id, kapasitas, req.params.id, req.tenantId)
  res.json({ success: true })
})

app.delete('/api/rombel/:id', ADMIN, (req, res) => {
  try {
    db.prepare('DELETE FROM rombel WHERE id = ? AND tenant_id=?').run(req.params.id, req.tenantId)
    res.json({ success: true })
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return res.status(400).json({ error: 'Rombel masih digunakan (siswa/jadwal/pengajar). Hapus data terkait dulu.' })
    throw e
  }
})

// ==================== EKSKUL ====================
app.get('/api/ekskul', authMiddleware, (req, res) => {
  const rows = db.prepare(`SELECT e.*, g.nama as pembina_nama FROM ekskul e LEFT JOIN gtk g ON e.pembina_id = g.id WHERE e.tenant_id=? ORDER BY e.nama`).all(req.tenantId)
  res.json(rows)
})

app.post('/api/ekskul', ADMIN, (req, res) => {
  const id = uuidv4()
  const { nama, pembina_id, hari, jam_mulai, jam_selesai, deskripsi } = req.body
  db.prepare('INSERT INTO ekskul (id, nama, pembina_id, hari, jam_mulai, jam_selesai, deskripsi, tenant_id) VALUES (?,?,?,?,?,?,?,?)').run(id, nama, pembina_id || null, hari, jam_mulai, jam_selesai, deskripsi || '', req.tenantId)
  res.json({ id })
})

app.put('/api/ekskul/:id', ADMIN, (req, res) => {
  const { nama, pembina_id, hari, jam_mulai, jam_selesai, deskripsi } = req.body
  db.prepare('UPDATE ekskul SET nama=?, pembina_id=?, hari=?, jam_mulai=?, jam_selesai=?, deskripsi=? WHERE id=? AND tenant_id=?').run(nama, pembina_id || null, hari, jam_mulai, jam_selesai, deskripsi || '', req.params.id, req.tenantId)
  res.json({ success: true })
})

app.delete('/api/ekskul/:id', ADMIN, (req, res) => {
  try {
    db.prepare('DELETE FROM ekskul_anggota WHERE ekskul_id = ? AND tenant_id=?').run(req.params.id, req.tenantId)
    db.prepare('DELETE FROM ekskul WHERE id = ? AND tenant_id=?').run(req.params.id, req.tenantId)
    res.json({ success: true })
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return res.status(400).json({ error: 'Ekskul masih digunakan di absensi ekskul. Hapus data terkait dulu.' })
    throw e
  }
})

// Anggota ekskul: daftar siswa peserta ekskul
app.get('/api/ekskul/:id/anggota', authMiddleware, (req, res) => {
  const rows = db.prepare(`SELECT s.id, s.nis, s.nama, r.nama as rombel_nama
    FROM ekskul_anggota ea JOIN siswa s ON ea.siswa_id = s.id
    LEFT JOIN rombel r ON s.rombel_id = r.id
    WHERE ea.ekskul_id = ? AND ea.tenant_id = ? ORDER BY s.nama`).all(req.params.id, req.tenantId)
  res.json(rows)
})

// Set anggota (replace full list). body: { siswa_ids: [] }
app.post('/api/ekskul/:id/anggota', ADMIN, (req, res) => {
  const ids = Array.isArray(req.body.siswa_ids) ? req.body.siswa_ids : []
  const ekskul_id = req.params.id
  const del = db.prepare('DELETE FROM ekskul_anggota WHERE ekskul_id = ? AND tenant_id = ?')
  const ins = db.prepare('INSERT OR IGNORE INTO ekskul_anggota (id, ekskul_id, siswa_id, tenant_id) VALUES (?,?,?,?)')
  const trx = db.transaction(() => {
    del.run(ekskul_id, req.tenantId)
    for (const sid of ids) ins.run(uuidv4(), ekskul_id, sid, req.tenantId)
  })
  trx()
  res.json({ success: true, count: ids.length })
})

// Absensi ekskul
app.get('/api/absensi-ekskul', authMiddleware, (req, res) => {
  const { ekskul_id, tanggal } = req.query
  let sql = `SELECT ae.*, s.nama as siswa_nama, s.nis FROM absensi_ekskul ae LEFT JOIN siswa s ON ae.siswa_id = s.id WHERE ae.tenant_id=?`
  const params = [req.tenantId]
  if (ekskul_id) { sql += ' AND ae.ekskul_id = ?'; params.push(ekskul_id) }
  if (tanggal) { sql += ' AND ae.tanggal = ?'; params.push(tanggal) }
  sql += ' ORDER BY s.nama'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/absensi-ekskul/bulk', STAFF, (req, res) => {
  const { ekskul_id, tanggal, data } = req.body
  if (!data || !Array.isArray(data)) return res.status(400).json({ error: 'Data harus array' })
  let count = 0
  for (const d of data) {
    const exists = db.prepare('SELECT id FROM absensi_ekskul WHERE siswa_id = ? AND ekskul_id = ? AND tanggal = ? AND tenant_id = ?').get(d.siswa_id, ekskul_id, tanggal, req.tenantId)
    if (exists) {
      db.prepare('UPDATE absensi_ekskul SET status=?, keterangan=? WHERE id=? AND tenant_id=?').run(d.status, d.keterangan || '', exists.id, req.tenantId)
    } else {
      db.prepare('INSERT INTO absensi_ekskul (id, siswa_id, ekskul_id, tanggal, status, keterangan, tenant_id) VALUES (?,?,?,?,?,?,?)').run(uuidv4(), d.siswa_id, ekskul_id, tanggal, d.status, d.keterangan || '', req.tenantId)
    }
    count++
  }
  res.json({ count })
})

// ==================== KEGIATAN KHUSUS ====================
db.exec(`CREATE TABLE IF NOT EXISTS kegiatan_khusus (
  id TEXT PRIMARY KEY, nama TEXT NOT NULL, jenis TEXT DEFAULT 'kokurikuler',
  tanggal TEXT, deskripsi TEXT, created_at TEXT DEFAULT (datetime('now'))
)`)
db.exec(`CREATE TABLE IF NOT EXISTS absensi_kegiatan (
  id TEXT PRIMARY KEY, siswa_id TEXT NOT NULL, kegiatan_id TEXT NOT NULL,
  tanggal TEXT NOT NULL, status TEXT NOT NULL, keterangan TEXT,
  FOREIGN KEY (siswa_id) REFERENCES siswa(id), FOREIGN KEY (kegiatan_id) REFERENCES kegiatan_khusus(id)
)`)

app.get('/api/kegiatan-khusus', authMiddleware, (req, res) => {
  const { jenis } = req.query
  let sql = 'SELECT * FROM kegiatan_khusus WHERE tenant_id=?'
  if (jenis) sql += ` AND jenis = '${jenis === 'kokurikuler' ? 'kokurikuler' : 'insidental'}'`
  sql += ' ORDER BY tanggal DESC'
  res.json(db.prepare(sql).all(req.tenantId))
})

app.post('/api/kegiatan-khusus', ADMIN, (req, res) => {
  const id = uuidv4()
  const { nama, jenis, tanggal, deskripsi } = req.body
  db.prepare('INSERT INTO kegiatan_khusus (id, nama, jenis, tanggal, deskripsi, tenant_id) VALUES (?,?,?,?,?,?)').run(id, nama, jenis || 'kokurikuler', tanggal, deskripsi || '', req.tenantId)
  res.json({ id })
})

app.delete('/api/kegiatan-khusus/:id', ADMIN, (req, res) => {
  db.prepare('DELETE FROM kegiatan_khusus WHERE id = ? AND tenant_id=?').run(req.params.id, req.tenantId)
  db.prepare('DELETE FROM absensi_kegiatan WHERE kegiatan_id = ?').run(req.params.id)
  res.json({ success: true })
})

app.get('/api/absensi-kegiatan', authMiddleware, (req, res) => {
  const { kegiatan_id } = req.query
  if (!kegiatan_id) return res.json([])
  const owns = db.prepare('SELECT id FROM ekskul WHERE id = ? AND tenant_id = ?').get(kegiatan_id, req.tenantId)
  if (!owns) return res.json([])
  const rows = db.prepare(`SELECT ak.*, s.nama as siswa_nama, s.nis FROM absensi_kegiatan ak LEFT JOIN siswa s ON ak.siswa_id = s.id WHERE ak.kegiatan_id = ? ORDER BY s.nama`).all(kegiatan_id)
  res.json(rows)
})

app.post('/api/absensi-kegiatan/bulk', STAFF, (req, res) => {
  const { kegiatan_id, tanggal, data } = req.body
  if (!data || !Array.isArray(data)) return res.status(400).json({ error: 'Data harus array' })
  const owns = db.prepare('SELECT id FROM ekskul WHERE id = ? AND tenant_id = ?').get(kegiatan_id, req.tenantId)
  if (!owns) return res.status(403).json({ error: 'Kegiatan tidak ditemukan' })
  let count = 0
  for (const d of data) {
    const exists = db.prepare('SELECT id FROM absensi_kegiatan WHERE siswa_id = ? AND kegiatan_id = ?').get(d.siswa_id, kegiatan_id)
    if (exists) {
      db.prepare('UPDATE absensi_kegiatan SET status=?, keterangan=? WHERE id=?').run(d.status, d.keterangan || '', exists.id)
    } else {
      db.prepare('INSERT INTO absensi_kegiatan (id, siswa_id, kegiatan_id, tanggal, status, keterangan) VALUES (?,?,?,?,?,?)').run(uuidv4(), d.siswa_id, kegiatan_id, tanggal || '', d.status, d.keterangan || '')
    }
    count++
  }
  res.json({ count })
})

// ==================== GURU DASHBOARD ====================
app.get('/api/guru/dashboard', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  const gtk = user?.nip ? db.prepare('SELECT * FROM gtk WHERE nip = ?').get(user.nip) : null
  const gtkId = gtk?.id
  if (!gtkId) return res.json({ jadwal_hari_ini: [], rekap_jurnal: { draft: 0, submitted: 0, approved: 0 }, rombel_count: 0 })
  
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  const today = days[new Date().getDay()]
  const jadwal = db.prepare(`SELECT j.*, m.nama as mapel_nama, r.nama as rombel_nama FROM jadwal j LEFT JOIN mapel m ON j.mapel_id = m.id LEFT JOIN rombel r ON j.rombel_id = r.id WHERE j.gtk_id = ? AND j.hari = ? ORDER BY j.jam_mulai`).all(gtkId, today)
  
  const draft = db.prepare("SELECT COUNT(*) as c FROM jurnal_mengajar WHERE guru_id=? AND status='draft'").get(gtkId).c
  const submitted = db.prepare("SELECT COUNT(*) as c FROM jurnal_mengajar WHERE guru_id=? AND status='submitted'").get(gtkId).c
  const approved = db.prepare("SELECT COUNT(*) as c FROM jurnal_mengajar WHERE guru_id=? AND status='approved'").get(gtkId).c
  const rombelCount = db.prepare("SELECT COUNT(DISTINCT rombel_id) as c FROM pengajar WHERE gtk_id=?").get(gtkId).c
  
  res.json({ jadwal_hari_ini: jadwal, rekap_jurnal: { draft, submitted, approved }, rombel_count: rombelCount, gtk: gtk })
})

// ==================== GURU ABSENSI (CEKLOK) ====================
app.get('/api/guru/absensi-saya', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  const gtk = user?.nip ? db.prepare('SELECT * FROM gtk WHERE nip = ?').get(user.nip) : null
  if (!gtk) return res.json({ today: null, history: [] })
  const today = new Date().toISOString().split('T')[0]
  const todayRecord = db.prepare('SELECT * FROM absensi_guru WHERE gtk_id = ? AND tanggal = ?').get(gtk.id, today)
  const history = db.prepare('SELECT * FROM absensi_guru WHERE gtk_id = ? ORDER BY tanggal DESC LIMIT 30').all(gtk.id)
  res.json({ today: todayRecord || null, history, gtk })
})

app.post('/api/guru/ceklok', STAFF, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  const gtk = user?.nip ? db.prepare('SELECT * FROM gtk WHERE nip = ?').get(user.nip) : null
  if (!gtk) return res.status(400).json({ error: 'Data GTK tidak ditemukan' })
  const { type, latitude, longitude } = req.body
  const geo = db.prepare('SELECT geo_latitude, geo_longitude, geo_radius FROM settings WHERE tenant_id = ?').get(req.tenantId)
  if (geo?.geo_latitude && geo?.geo_longitude) {
    const lat = Number(latitude), lng = Number(longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'Lokasi tidak terbaca' })
    const toRad = (v) => v * Math.PI / 180
    const dLat = toRad(lat - Number(geo.geo_latitude))
    const dLng = toRad(lng - Number(geo.geo_longitude))
    const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(Number(geo.geo_latitude))) * Math.cos(toRad(lat)) * Math.sin(dLng/2) ** 2
    const distance = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    if (distance > Number(geo.geo_radius || 200)) return res.status(400).json({ error: `Di luar radius sekolah (${Math.round(distance)}m)` })
  }
  const today = new Date().toISOString().split('T')[0]
  const now = new Date().toTimeString().split(' ')[0].slice(0, 5)
  const exists = db.prepare('SELECT * FROM absensi_guru WHERE gtk_id = ? AND tanggal = ? AND tenant_id = ?').get(gtk.id, today, req.tenantId)
  if (type === 'masuk') {
    if (exists) return res.status(400).json({ error: 'Sudah ceklok masuk hari ini' })
    const id = uuidv4()
    db.prepare('INSERT INTO absensi_guru (id, gtk_id, tanggal, waktu_masuk, latitude, longitude, status, tenant_id) VALUES (?,?,?,?,?,?,?,?)').run(id, gtk.id, today, now, latitude || null, longitude || null, 'hadir', req.tenantId)
    res.json({ id, waktu_masuk: now })
  } else {
    if (!exists) return res.status(400).json({ error: 'Belum ceklok masuk' })
    db.prepare('UPDATE absensi_guru SET waktu_pulang=? WHERE id=?').run(now, exists.id)
    res.json({ id: exists.id, waktu_pulang: now })
  }
})

// ==================== SISWA DASHBOARD ====================
app.get('/api/siswa/dashboard', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  const siswa = user?.nis ? db.prepare('SELECT * FROM siswa WHERE nis = ?').get(user.nis) : null
  if (!siswa) return res.json({ jadwal: [], rekap: { hadir: 0, sakit: 0, izin: 0, alpha: 0 } })
  
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  const today = days[new Date().getDay()]
  const jadwal = db.prepare(`SELECT j.*, m.nama as mapel_nama, g.nama as guru_nama FROM jadwal j LEFT JOIN mapel m ON j.mapel_id = m.id LEFT JOIN gtk g ON j.gtk_id = g.id WHERE j.rombel_id = ? AND j.hari = ? ORDER BY j.jam_mulai`).all(siswa.rombel_id, today)
  
  const bulan = new Date().toISOString().slice(0, 7) + '%'
  const hadir = db.prepare("SELECT COUNT(*) as c FROM absensi_siswa WHERE siswa_id=? AND tanggal LIKE ? AND status='hadir'").get(siswa.id, bulan).c
  const sakit = db.prepare("SELECT COUNT(*) as c FROM absensi_siswa WHERE siswa_id=? AND tanggal LIKE ? AND status='sakit'").get(siswa.id, bulan).c
  const izin = db.prepare("SELECT COUNT(*) as c FROM absensi_siswa WHERE siswa_id=? AND tanggal LIKE ? AND status='izin'").get(siswa.id, bulan).c
  const alpha = db.prepare("SELECT COUNT(*) as c FROM absensi_siswa WHERE siswa_id=? AND tanggal LIKE ? AND status='alpha'").get(siswa.id, bulan).c
  
  res.json({ siswa, jadwal_hari_ini: jadwal, rekap: { hadir, sakit, izin, alpha } })
})

// ==================== SISWA JADWAL ====================
app.get('/api/siswa/jadwal', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  const siswa = user?.nis ? db.prepare('SELECT * FROM siswa WHERE nis = ?').get(user.nis) : null
  if (!siswa || !siswa.rombel_id) return res.json([])
  const rows = db.prepare(`SELECT j.*, m.nama as mapel_nama, g.nama as guru_nama FROM jadwal j LEFT JOIN mapel m ON j.mapel_id = m.id LEFT JOIN gtk g ON j.gtk_id = g.id WHERE j.rombel_id = ? ORDER BY j.hari, j.jam_mulai`).all(siswa.rombel_id)
  res.json(rows)
})

// ==================== SISWA ABSENSI ====================
app.get('/api/siswa/absensi', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  const siswa = user?.nis ? db.prepare('SELECT * FROM siswa WHERE nis = ?').get(user.nis) : null
  if (!siswa) return res.json([])
  res.json(db.prepare('SELECT * FROM absensi_siswa WHERE siswa_id = ? ORDER BY tanggal DESC LIMIT 60').all(siswa.id))
})

// ==================== SISWA EKSKUL ====================
app.get('/api/siswa/ekskul', authMiddleware, (req, res) => {
  const ekskulAll = db.prepare(`SELECT e.*, g.nama as pembina_nama FROM ekskul e LEFT JOIN gtk g ON e.pembina_id = g.id WHERE e.tenant_id=? ORDER BY e.nama`).all(req.tenantId)
  res.json(ekskulAll)
})

// ==================== NOTIFIKASI WA SETTINGS ====================
db.exec(`CREATE TABLE IF NOT EXISTS notif_settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  absensi_siswa_ke_wali INTEGER DEFAULT 0,
  guru_belum_ceklok INTEGER DEFAULT 0,
  batas_ceklok_guru TEXT DEFAULT '07:30',
  template_absensi_wali TEXT DEFAULT 'Assalamualaikum {nama_ortu}, anak Anda {nama} hari ini tercatat {status} di sekolah pada {tanggal}. - {lembaga}',
  template_guru_ceklok TEXT DEFAULT 'Assalamualaikum {nama}, Anda belum melakukan ceklok kehadiran hari ini ({tanggal}). Mohon segera lakukan absensi. - {lembaga}'
)`)
const existNotif = db.prepare("SELECT id FROM notif_settings WHERE id = 'main'").get()
if (!existNotif) db.prepare("INSERT INTO notif_settings (id) VALUES ('main')").run()

app.get('/api/notif-settings', authMiddleware, (req, res) => {
  res.json(db.prepare("SELECT * FROM notif_settings WHERE tenant_id = ?").get(req.tenantId) || {})
})

app.put('/api/notif-settings', ADMIN, (req, res) => {
  const { absensi_siswa_ke_wali, guru_belum_ceklok, batas_ceklok_guru, template_absensi_wali, template_guru_ceklok } = req.body
  db.prepare("UPDATE notif_settings SET absensi_siswa_ke_wali=?, guru_belum_ceklok=?, batas_ceklok_guru=?, template_absensi_wali=?, template_guru_ceklok=? WHERE id='main'")
    .run(absensi_siswa_ke_wali ? 1 : 0, guru_belum_ceklok ? 1 : 0, batas_ceklok_guru || '07:30', template_absensi_wali || '', template_guru_ceklok || '')
  res.json({ success: true })
})

// ==================== NOTIFIKASI WA OTOMATIS ====================
// Dipanggil saat absensi siswa disimpan - kirim notif ke wali murid
async function sendAbsensiNotifToWali(siswaId, status, tanggal) {
  const siswa = db.prepare('SELECT * FROM siswa WHERE id = ?').get(siswaId)
  if (!siswa || !siswa.no_hp) return
  const tenantId = siswa.tenant_id || 'default'
  const notifConf = db.prepare("SELECT * FROM notif_settings WHERE id = 'main'").get()
  if (!notifConf || !notifConf.absensi_siswa_ke_wali) return
  const settings = db.prepare("SELECT * FROM settings WHERE id = 'main'").get()
  const msg = (notifConf.template_absensi_wali || '')
    .replace(/\{nama_ortu\}/g, siswa.nama_ortu || 'Bapak/Ibu')
    .replace(/\{nama\}/g, siswa.nama)
    .replace(/\{status\}/g, status)
    .replace(/\{tanggal\}/g, tanggal)
    .replace(/\{lembaga\}/g, settings?.nama_lembaga || 'Sekolah')
  await waGateway.sendMessage(siswa.no_hp, msg, tenantId)
}

// Cron-like check: guru belum ceklok (dipanggil via endpoint manual atau scheduler)
app.post('/api/notif/cek-guru-ceklok', STAFF, async (req, res) => {
  const notifConf = db.prepare("SELECT * FROM notif_settings WHERE id = 'main'").get()
  if (!notifConf || !notifConf.guru_belum_ceklok) return res.json({ skipped: true, reason: 'Notifikasi nonaktif' })
  const today = new Date().toISOString().split('T')[0]
  const allGtk = db.prepare("SELECT * FROM gtk WHERE status = 'aktif' AND tenant_id = ?").all(req.tenantId)
  const settings = db.prepare("SELECT * FROM settings WHERE id = 'main'").get()
  let sent = 0
  for (const g of allGtk) {
    const absen = db.prepare('SELECT id FROM absensi_guru WHERE gtk_id = ? AND tanggal = ?').get(g.id, today)
    if (!absen && g.no_hp) {
      const msg = (notifConf.template_guru_ceklok || '')
        .replace(/\{nama\}/g, g.nama)
        .replace(/\{tanggal\}/g, today)
        .replace(/\{lembaga\}/g, settings?.nama_lembaga || 'Sekolah')
      await waGateway.sendMessage(g.no_hp, msg, req.tenantId)
      sent++
    }
  }
  res.json({ success: true, sent })
})

// ==================== REKAP ABSENSI ====================
app.get('/api/rekap-absensi', authMiddleware, (req, res) => {
  const { bulan, tipe } = req.query // bulan: "2026-07", tipe: "siswa"|"gtk"
  if (!bulan) return res.status(400).json({ error: 'Parameter bulan wajib' })
  const prefix = bulan + '%'

  if (tipe === 'gtk') {
    const gtks = db.prepare("SELECT id, nama, nip, jabatan FROM gtk WHERE tenant_id = ? ORDER BY nama").all(req.tenantId)
    const detail = gtks.map(g => {
      const hadir = db.prepare("SELECT COUNT(*) as c FROM absensi_guru WHERE gtk_id=? AND tanggal LIKE ? AND status='hadir' AND tenant_id=?").get(g.id, prefix, req.tenantId).c
      const sakit = db.prepare("SELECT COUNT(*) as c FROM absensi_guru WHERE gtk_id=? AND tanggal LIKE ? AND status='sakit' AND tenant_id=?").get(g.id, prefix, req.tenantId).c
      const izin = db.prepare("SELECT COUNT(*) as c FROM absensi_guru WHERE gtk_id=? AND tanggal LIKE ? AND status='izin' AND tenant_id=?").get(g.id, prefix, req.tenantId).c
      const alpha = db.prepare("SELECT COUNT(*) as c FROM absensi_guru WHERE gtk_id=? AND tanggal LIKE ? AND status='alpha' AND tenant_id=?").get(g.id, prefix, req.tenantId).c
      return { ...g, hadir, sakit, izin, alpha, total: hadir + sakit + izin + alpha }
    })
    const summary = { hadir: detail.reduce((s,d) => s+d.hadir, 0), sakit: detail.reduce((s,d) => s+d.sakit, 0), izin: detail.reduce((s,d) => s+d.izin, 0), alpha: detail.reduce((s,d) => s+d.alpha, 0) }
    res.json({ detail, summary })
  } else {
    const siswa = db.prepare("SELECT s.id, s.nama, s.nis, r.nama as rombel_nama FROM siswa s LEFT JOIN rombel r ON s.rombel_id = r.id WHERE s.tenant_id = ? ORDER BY r.nama, s.nama").all(req.tenantId)
    const detail = siswa.map(s => {
      const hadir = db.prepare("SELECT COUNT(*) as c FROM absensi_siswa WHERE siswa_id=? AND tanggal LIKE ? AND status='hadir' AND tenant_id=?").get(s.id, prefix, req.tenantId).c
      const sakit = db.prepare("SELECT COUNT(*) as c FROM absensi_siswa WHERE siswa_id=? AND tanggal LIKE ? AND status='sakit' AND tenant_id=?").get(s.id, prefix, req.tenantId).c
      const izin = db.prepare("SELECT COUNT(*) as c FROM absensi_siswa WHERE siswa_id=? AND tanggal LIKE ? AND status='izin' AND tenant_id=?").get(s.id, prefix, req.tenantId).c
      const alpha = db.prepare("SELECT COUNT(*) as c FROM absensi_siswa WHERE siswa_id=? AND tanggal LIKE ? AND status='alpha' AND tenant_id=?").get(s.id, prefix, req.tenantId).c
      return { ...s, hadir, sakit, izin, alpha, total: hadir + sakit + izin + alpha }
    })
    const summary = { hadir: detail.reduce((s,d) => s+d.hadir, 0), sakit: detail.reduce((s,d) => s+d.sakit, 0), izin: detail.reduce((s,d) => s+d.izin, 0), alpha: detail.reduce((s,d) => s+d.alpha, 0) }
    res.json({ detail, summary })
  }
})

// ==================== KALENDER KBM ====================
app.get('/api/kalender-kbm', authMiddleware, (req, res) => {
  const { year, month } = req.query
  if (year && month) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    res.json(db.prepare("SELECT * FROM kalender_kbm WHERE tanggal LIKE ? AND tenant_id=? ORDER BY tanggal").all(prefix + '%', req.tenantId))
  } else {
    res.json(db.prepare("SELECT * FROM kalender_kbm WHERE tenant_id=? ORDER BY tanggal DESC LIMIT 100").all(req.tenantId))
  }
})

app.post('/api/kalender-kbm', ADMIN, (req, res) => {
  const id = uuidv4()
  const { tanggal, judul, jenis, keterangan, warna } = req.body
  db.prepare('INSERT INTO kalender_kbm (id, tanggal, judul, jenis, keterangan, warna, tenant_id) VALUES (?,?,?,?,?,?,?)')
    .run(id, tanggal, judul, jenis || 'kbm_aktif', keterangan || '', warna || '#3b82f6', req.tenantId)
  res.json({ id })
})

app.delete('/api/kalender-kbm/:id', ADMIN, (req, res) => {
  db.prepare('DELETE FROM kalender_kbm WHERE id = ? AND tenant_id=?').run(req.params.id, req.tenantId)
  res.json({ success: true })
})

// ==================== PENGAJAR ====================
app.get('/api/pengajar', authMiddleware, (req, res) => {
  const rows = db.prepare(`SELECT p.*, g.nama as guru_nama, g.nip, m.nama as mapel_nama, r.nama as rombel_nama 
    FROM pengajar p 
    LEFT JOIN gtk g ON p.gtk_id = g.id 
    LEFT JOIN mapel m ON p.mapel_id = m.id 
    LEFT JOIN rombel r ON p.rombel_id = r.id 
    WHERE p.tenant_id = ?
    ORDER BY g.nama, m.nama`).all(req.tenantId)
  res.json(rows)
})

app.post('/api/pengajar', ADMIN, (req, res) => {
  const id = uuidv4()
  const { gtk_id, mapel_id, rombel_id, jam_per_minggu } = req.body
  db.prepare('INSERT INTO pengajar (id, gtk_id, mapel_id, rombel_id, jam_per_minggu, tenant_id) VALUES (?,?,?,?,?,?)')
    .run(id, gtk_id, mapel_id, rombel_id, jam_per_minggu || 2, req.tenantId)
  res.json({ id })
})

app.put('/api/pengajar/:id', ADMIN, (req, res) => {
  const { gtk_id, mapel_id, rombel_id, jam_per_minggu } = req.body
  db.prepare('UPDATE pengajar SET gtk_id=?, mapel_id=?, rombel_id=?, jam_per_minggu=? WHERE id=? AND tenant_id=?')
    .run(gtk_id, mapel_id, rombel_id, jam_per_minggu || 2, req.params.id, req.tenantId)
  res.json({ success: true })
})

app.delete('/api/pengajar/:id', ADMIN, (req, res) => {
  db.prepare('DELETE FROM pengajar WHERE id = ? AND tenant_id=?').run(req.params.id, req.tenantId)
  res.json({ success: true })
})

// Bulk import pengajar dari Excel. rows: [{guru, mapel, rombel, jam}]. Match by nama.
app.post('/api/pengajar/import', ADMIN, (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : []
  if (!rows.length) return res.status(400).json({ error: 'Data kosong' })
  const gtks = db.prepare('SELECT id, nama FROM gtk WHERE tenant_id=?').all(req.tenantId)
  const mapels = db.prepare('SELECT id, nama FROM mapel WHERE tenant_id=?').all(req.tenantId)
  const rombels = db.prepare('SELECT id, nama FROM rombel WHERE tenant_id=?').all(req.tenantId)
  const norm = s => String(s || '').trim().toLowerCase()
  const findId = (list, name) => (list.find(x => norm(x.nama) === norm(name)) || {}).id
  const ins = db.prepare('INSERT INTO pengajar (id, gtk_id, mapel_id, rombel_id, jam_per_minggu, tenant_id) VALUES (?,?,?,?,?,?)')
  const errors = []; let created = 0
  const trx = db.transaction(items => {
    items.forEach((r, i) => {
      const gtk_id = findId(gtks, r.guru), mapel_id = findId(mapels, r.mapel), rombel_id = findId(rombels, r.rombel)
      if (!gtk_id || !mapel_id || !rombel_id) {
        errors.push(`Baris ${i + 2}: ${!gtk_id ? 'guru' : !mapel_id ? 'mapel' : 'rombel'} "${!gtk_id ? r.guru : !mapel_id ? r.mapel : r.rombel}" tidak ditemukan`)
        return
      }
      ins.run(uuidv4(), gtk_id, mapel_id, rombel_id, Number(r.jam) || 2, req.tenantId)
      created++
    })
  })
  trx(rows)
  res.json({ success: true, count: created, errors })
})

// Bulk import rombel. rows: [{nama, tingkat, tahun_ajaran, kapasitas}]
app.post('/api/rombel/bulk', ADMIN, (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : []
  if (!rows.length) return res.status(400).json({ error: 'Data kosong' })
  const ins = db.prepare('INSERT INTO rombel (id, nama, tingkat, tahun_ajaran, kapasitas, tenant_id) VALUES (?,?,?,?,?,?)')
  const errors = []; let created = 0
  const trx = db.transaction(items => {
    items.forEach((r, i) => {
      if (!r.nama || !String(r.nama).trim()) { errors.push(`Baris ${i + 2}: nama rombel kosong`); return }
      ins.run(uuidv4(), String(r.nama).trim(), r.tingkat || 'I', r.tahun_ajaran || '2024/2025', Number(r.kapasitas) || 36, req.tenantId)
      created++
    })
  })
  trx(rows)
  res.json({ success: true, count: created, errors })
})

// ==================== JADWAL ====================
app.get('/api/jadwal', authMiddleware, (req, res) => {
  const { rombel_id, gtk_id } = req.query
  let sql = `SELECT j.*, m.nama as mapel_nama, m.kode as mapel_kode, r.nama as rombel_nama, g.nama as guru_nama FROM jadwal j LEFT JOIN mapel m ON j.mapel_id = m.id LEFT JOIN rombel r ON j.rombel_id = r.id LEFT JOIN gtk g ON j.gtk_id = g.id WHERE j.tenant_id=?`
  const params = [req.tenantId]
  if (rombel_id) { sql += ' AND j.rombel_id = ?'; params.push(rombel_id) }
  if (gtk_id) { sql += ' AND j.gtk_id = ?'; params.push(gtk_id) }
  sql += ' ORDER BY j.hari, j.jam_mulai'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/jadwal', ADMIN, (req, res) => {
  const { mapel_id, rombel_id, gtk_id, hari, jam_mulai, jam_selesai, ruangan } = req.body
  const overlap = '((j.jam_mulai < ? AND j.jam_selesai > ?) OR (j.jam_mulai < ? AND j.jam_selesai > ?) OR (j.jam_mulai >= ? AND j.jam_selesai <= ?))'
  const ovParams = [jam_selesai, jam_mulai, jam_selesai, jam_mulai, jam_mulai, jam_selesai]
  // 1. Anti-tabrakan GURU (guru tidak bisa 2 kelas sekaligus)
  const gConflict = db.prepare(`SELECT j.*, r.nama as rombel_nama FROM jadwal j LEFT JOIN rombel r ON j.rombel_id = r.id WHERE j.gtk_id = ? AND j.hari = ? AND j.tenant_id = ? AND ${overlap}`)
    .get(gtk_id, hari, req.tenantId, ...ovParams)
  if (gConflict) return res.status(409).json({ error: `Jadwal Ganda (Guru): guru sudah mengajar di kelas ${gConflict.rombel_nama} jam ${gConflict.jam_mulai}-${gConflict.jam_selesai} (${hari})` })
  // 2. Anti-tabrakan ROMBEL (kelas tidak bisa 2 mapel sekaligus)
  const rConflict = db.prepare(`SELECT j.*, m.nama as mapel_nama FROM jadwal j LEFT JOIN mapel m ON j.mapel_id = m.id WHERE j.rombel_id = ? AND j.hari = ? AND j.tenant_id = ? AND ${overlap}`)
    .get(rombel_id, hari, req.tenantId, ...ovParams)
  if (rConflict) return res.status(409).json({ error: `Jadwal Ganda (Kelas): kelas sudah ada pelajaran ${rConflict.mapel_nama} jam ${rConflict.jam_mulai}-${rConflict.jam_selesai} (${hari})` })
  // 3. Anti-tabrakan RUANGAN (opsional, hanya bila ruangan diisi)
  if (ruangan) {
    const roomConflict = db.prepare(`SELECT j.*, r.nama as rombel_nama FROM jadwal j LEFT JOIN rombel r ON j.rombel_id = r.id WHERE j.ruangan = ? AND j.ruangan != '' AND j.hari = ? AND j.tenant_id = ? AND ${overlap}`)
      .get(ruangan, hari, req.tenantId, ...ovParams)
    if (roomConflict) return res.status(409).json({ error: `Jadwal Ganda (Ruangan): ruangan ${ruangan} sudah dipakai kelas ${roomConflict.rombel_nama} jam ${roomConflict.jam_mulai}-${roomConflict.jam_selesai} (${hari})` })
  }
  const id = uuidv4()
  db.prepare('INSERT INTO jadwal (id, mapel_id, rombel_id, gtk_id, hari, jam_mulai, jam_selesai, ruangan, tenant_id) VALUES (?,?,?,?,?,?,?,?,?)').run(id, mapel_id, rombel_id, gtk_id, hari, jam_mulai, jam_selesai, ruangan, req.tenantId)
  res.json({ id })
})

// Scan konflik jadwal otomatis (semua bentrok guru/kelas/ruangan)
app.get('/api/jadwal/konflik', authMiddleware, (req, res) => {
  const rows = db.prepare(`SELECT j.*, m.nama as mapel_nama, r.nama as rombel_nama, g.nama as guru_nama FROM jadwal j LEFT JOIN mapel m ON j.mapel_id=m.id LEFT JOIN rombel r ON j.rombel_id=r.id LEFT JOIN gtk g ON j.gtk_id=g.id WHERE j.tenant_id=? ORDER BY j.hari, j.jam_mulai`).all(req.tenantId)
  const konflik = []
  const ov = (a, b) => a.hari === b.hari && a.jam_mulai < b.jam_selesai && a.jam_selesai > b.jam_mulai
  for (let i = 0; i < rows.length; i++) {
    for (let k = i + 1; k < rows.length; k++) {
      const a = rows[i], b = rows[k]
      if (!ov(a, b)) continue
      let jenis = null
      if (a.gtk_id && a.gtk_id === b.gtk_id) jenis = `Guru ${a.guru_nama} bentrok`
      else if (a.rombel_id === b.rombel_id) jenis = `Kelas ${a.rombel_nama} bentrok`
      else if (a.ruangan && a.ruangan === b.ruangan) jenis = `Ruangan ${a.ruangan} bentrok`
      if (jenis) konflik.push({ jenis, hari: a.hari, jam: `${a.jam_mulai}-${a.jam_selesai}`, a: `${a.mapel_nama} (${a.rombel_nama})`, b: `${b.mapel_nama} (${b.rombel_nama})` })
    }
  }
  res.json(konflik)
})

app.delete('/api/jadwal/:id', ADMIN, (req, res) => {
  db.prepare('DELETE FROM jadwal WHERE id = ? AND tenant_id=?').run(req.params.id, req.tenantId)
  res.json({ success: true })
})


// ==================== TAGIHAN & PEMBAYARAN ====================
app.get('/api/jenis-tagihan', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM jenis_tagihan WHERE tenant_id=? ORDER BY nama').all(req.tenantId))
})

app.post('/api/jenis-tagihan', ADMIN, (req, res) => {
  const id = uuidv4()
  const { nama, nominal, deskripsi, tipe } = req.body
  db.prepare('INSERT INTO jenis_tagihan (id, nama, nominal, deskripsi, tipe, tenant_id) VALUES (?,?,?,?,?,?)').run(id, nama, nominal, deskripsi, tipe, req.tenantId)
  res.json({ id })
})

app.get('/api/tagihan', authMiddleware, (req, res) => {
  const { siswa_id, status, jenis_tagihan_id } = req.query
  let sql = `SELECT t.*, s.nama as siswa_nama, s.nis, jt.nama as jenis_nama FROM tagihan t LEFT JOIN siswa s ON t.siswa_id = s.id LEFT JOIN jenis_tagihan jt ON t.jenis_tagihan_id = jt.id WHERE t.tenant_id=?`
  const params = [req.tenantId]
  if (siswa_id) { sql += ' AND t.siswa_id = ?'; params.push(siswa_id) }
  if (status) { sql += ' AND t.status = ?'; params.push(status) }
  if (jenis_tagihan_id) { sql += ' AND t.jenis_tagihan_id = ?'; params.push(jenis_tagihan_id) }
  sql += ' ORDER BY t.created_at DESC'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/tagihan/generate', ADMIN, (req, res) => {
  const { rombel_id, bulan, tahun } = req.body
  const jenis_nama = (req.body.jenis_nama || '').trim()
  const nominalRaw = req.body.nominal
  if (!jenis_nama) return res.status(400).json({ error: 'Nama jenis tagihan wajib diisi' })
  if (!nominalRaw || isNaN(Number(nominalRaw)) || Number(nominalRaw) <= 0) return res.status(400).json({ error: 'Nominal wajib diisi (angka > 0)' })
  const nominal = Number(nominalRaw)
  // Auto-find or create jenis_tagihan
  let jenis = db.prepare('SELECT id FROM jenis_tagihan WHERE nama = ? AND tenant_id = ?').get(jenis_nama, req.tenantId)
  if (!jenis) {
    const jid = uuidv4()
    db.prepare('INSERT INTO jenis_tagihan (id, nama, nominal, tenant_id) VALUES (?,?,?,?)').run(jid, jenis_nama, nominal, req.tenantId)
    jenis = { id: jid }
  }
  const jenis_tagihan_id = jenis.id
  // rombel_id='all' => semua siswa aktif; selain itu per rombel
  const siswaList = (!rombel_id || rombel_id === 'all')
    ? db.prepare("SELECT id FROM siswa WHERE status = 'aktif' AND tenant_id = ?").all(req.tenantId)
    : db.prepare("SELECT id FROM siswa WHERE rombel_id = ? AND status = 'aktif' AND tenant_id = ?").all(rombel_id, req.tenantId)
  // Cegah duplikat: skip siswa yg sudah punya tagihan jenis+bulan+tahun sama
  const dupChk = db.prepare('SELECT 1 FROM tagihan WHERE siswa_id=? AND jenis_tagihan_id=? AND bulan=? AND tahun=? AND tenant_id=?')
  const ins = db.prepare('INSERT INTO tagihan (id, siswa_id, jenis_tagihan_id, bulan, tahun, nominal, status, tenant_id) VALUES (?,?,?,?,?,?,?,?)')
  let created = 0, skipped = 0
  const trx = db.transaction((items) => {
    for (const s of items) {
      if (dupChk.get(s.id, jenis_tagihan_id, bulan, tahun, req.tenantId)) { skipped++; continue }
      ins.run(uuidv4(), s.id, jenis_tagihan_id, bulan, tahun, nominal, 'belum_bayar', req.tenantId)
      created++
    }
  })
  trx(siswaList)
  res.json({ success: true, count: created, skipped })
})

app.put('/api/tagihan/:id/bayar', ADMIN, (req, res) => {
  const { metode_bayar, keterangan } = req.body
  db.prepare("UPDATE tagihan SET status='lunas', tanggal_bayar=date('now'), metode_bayar=?, keterangan=? WHERE id=? AND tenant_id=?")
    .run(metode_bayar || 'tunai', keterangan || '', req.params.id, req.tenantId)
  res.json({ success: true })
})

// ==================== TABUNGAN ====================
app.get('/api/tabungan', authMiddleware, (req, res) => {
  const { siswa_id } = req.query
  if (!siswa_id) return res.status(400).json({ error: 'siswa_id required' })
  const rows = db.prepare('SELECT * FROM tabungan WHERE siswa_id = ? AND tenant_id = ? ORDER BY created_at DESC').all(siswa_id, req.tenantId)
  res.json(rows)
})

app.get('/api/tabungan/saldo', authMiddleware, (req, res) => {
  const rows = db.prepare(`SELECT s.id, s.nis, s.nama, COALESCE((SELECT saldo_akhir FROM tabungan WHERE siswa_id = s.id AND tenant_id = ? ORDER BY created_at DESC LIMIT 1), 0) as saldo FROM siswa s WHERE s.status = 'aktif' AND s.tenant_id = ? ORDER BY s.nama`).all(req.tenantId, req.tenantId)
  res.json(rows)
})

app.post('/api/tabungan', ADMIN, (req, res) => {
  const { siswa_id, tipe, keterangan } = req.body
  const nominal = Number(req.body.nominal ?? req.body.jumlah)
  if (!siswa_id) return res.status(400).json({ error: 'siswa_id wajib diisi' })
  if (!['setor', 'tarik'].includes(tipe)) return res.status(400).json({ error: 'tipe harus setor atau tarik' })
  if (!Number.isFinite(nominal) || nominal <= 0) return res.status(400).json({ error: 'nominal wajib berupa angka lebih dari 0' })
  const lastSaldo = db.prepare('SELECT saldo_akhir FROM tabungan WHERE siswa_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1').get(siswa_id, req.tenantId)
  const currentSaldo = lastSaldo ? lastSaldo.saldo_akhir : 0
  const saldo_akhir = tipe === 'setor' ? currentSaldo + nominal : currentSaldo - nominal
  if (saldo_akhir < 0) return res.status(400).json({ error: 'Saldo tidak mencukupi' })
  const id = uuidv4()
  db.prepare('INSERT INTO tabungan (id, siswa_id, tanggal, tipe, nominal, saldo_akhir, keterangan, tenant_id) VALUES (?,?,date(?),?,?,?,?,?)')
    .run(id, siswa_id, 'now', tipe, nominal, saldo_akhir, keterangan || '', req.tenantId)
  res.json({ id, saldo_akhir })
})

// ==================== JENIS TAGIHAN ====================
// ==================== TAGIHAN ====================
app.delete('/api/tagihan/:id', ADMIN, (req, res) => {
  db.prepare('DELETE FROM tagihan WHERE id = ? AND tenant_id=?').run(req.params.id, req.tenantId)
  res.json({ success: true })
})

// ==================== MODUL AJAR ====================
app.get('/api/modul-ajar', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM modul_ajar WHERE tenant_id = ? ORDER BY created_at DESC').all(req.tenantId))
})

app.post('/api/modul-ajar', STAFF, (req, res) => {
  const id = uuidv4()
  const { gtk_id, mapel, fase, materi_pokok, dimensi_profil, model_pembelajaran, target_peserta, tujuan_pembelajaran, alokasi_waktu, hasil, kurikulum } = req.body
  db.prepare('INSERT INTO modul_ajar (id, gtk_id, mapel, fase, materi_pokok, dimensi_profil, model_pembelajaran, target_peserta, tujuan_pembelajaran, alokasi_waktu, hasil, kurikulum, status, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, gtk_id, mapel, fase, materi_pokok, JSON.stringify(dimensi_profil || []), model_pembelajaran, target_peserta, tujuan_pembelajaran, alokasi_waktu, hasil || '', kurikulum || 'merdeka', 'generated', req.tenantId)
  res.json({ id })
})

// ==================== TAHUN AJARAN ====================
app.get('/api/tahun-ajaran', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM tahun_ajaran WHERE tenant_id=? ORDER BY nama DESC, semester').all(req.tenantId))
})

app.post('/api/tahun-ajaran', ADMIN, (req, res) => {
  const id = uuidv4()
  const { nama, semester, tanggal_mulai, tanggal_selesai } = req.body
  db.prepare('INSERT INTO tahun_ajaran (id, nama, semester, tanggal_mulai, tanggal_selesai, tenant_id) VALUES (?,?,?,?,?,?)').run(id, nama, semester, tanggal_mulai, tanggal_selesai, req.tenantId)
  res.json({ id })
})

app.put('/api/tahun-ajaran/:id/activate', ADMIN, (req, res) => {
  db.prepare('UPDATE tahun_ajaran SET aktif = 0 WHERE tenant_id = ?').run(req.tenantId)
  db.prepare('UPDATE tahun_ajaran SET aktif = 1 WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId)
  res.json({ success: true })
})

// ==================== ABSENSI SISWA ====================
app.get('/api/absensi-siswa', authMiddleware, (req, res) => {
  const { tanggal, rombel_id } = req.query
  let sql = `SELECT a.*, s.nama as siswa_nama, s.nis FROM absensi_siswa a LEFT JOIN siswa s ON a.siswa_id = s.id WHERE a.tenant_id = ?`
  const params = [req.tenantId]
  if (tanggal) { sql += ' AND a.tanggal = ?'; params.push(tanggal) }
  if (rombel_id) { sql += ' AND a.rombel_id = ?'; params.push(rombel_id) }
  sql += ' ORDER BY s.nama'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/absensi-siswa', STAFF, (req, res) => {
  const { siswa_id, rombel_id, tanggal, status, waktu_absen, metode, keterangan } = req.body
  const id = uuidv4()
  const exists = db.prepare('SELECT id FROM absensi_siswa WHERE siswa_id = ? AND tanggal = ? AND tenant_id = ?').get(siswa_id, tanggal, req.tenantId)
  if (exists) {
    db.prepare('UPDATE absensi_siswa SET status=?, waktu_absen=?, metode=?, keterangan=? WHERE id=?').run(status, waktu_absen || null, metode || 'manual', keterangan || '', exists.id)
    sendAbsensiNotifToWali(siswa_id, status, tanggal).catch(() => {})
    return res.json({ id: exists.id, updated: true })
  }
  db.prepare('INSERT INTO absensi_siswa (id, siswa_id, rombel_id, tanggal, status, waktu_absen, metode, keterangan, tenant_id) VALUES (?,?,?,?,?,?,?,?,?)').run(id, siswa_id, rombel_id || null, tanggal, status, waktu_absen || null, metode || 'manual', keterangan || '', req.tenantId)
  sendAbsensiNotifToWali(siswa_id, status, tanggal).catch(() => {})
  res.json({ id })
})

app.post('/api/absensi-siswa/bulk', STAFF, (req, res) => {
  const { tanggal, rombel_id, data } = req.body
  if (!data || !Array.isArray(data)) return res.status(400).json({ error: 'Data harus array' })
  let count = 0
  for (const d of data) {
    const exists = db.prepare('SELECT id FROM absensi_siswa WHERE siswa_id = ? AND tanggal = ? AND tenant_id = ?').get(d.siswa_id, tanggal, req.tenantId)
    if (exists) {
      db.prepare('UPDATE absensi_siswa SET status=?, waktu_absen=?, metode=?, keterangan=? WHERE id=?').run(d.status, d.waktu_absen || null, d.metode || 'manual', d.keterangan || '', exists.id)
    } else {
      db.prepare('INSERT INTO absensi_siswa (id, siswa_id, rombel_id, tanggal, status, waktu_absen, metode, keterangan, tenant_id) VALUES (?,?,?,?,?,?,?,?,?)').run(uuidv4(), d.siswa_id, rombel_id || null, tanggal, d.status, d.waktu_absen || null, d.metode || 'manual', d.keterangan || '', req.tenantId)
    }
    count++
  }
  res.json({ count })
})

// ==================== ABSENSI GURU ====================
app.get('/api/absensi-guru', authMiddleware, (req, res) => {
  const { tanggal } = req.query
  let sql = `SELECT a.*, g.nama as gtk_nama, g.nip FROM absensi_guru a LEFT JOIN gtk g ON a.gtk_id = g.id WHERE a.tenant_id = ?`
  const params = [req.tenantId]
  if (tanggal) { sql += ' AND a.tanggal = ?'; params.push(tanggal) }
  sql += ' ORDER BY g.nama'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/absensi-guru', STAFF, (req, res) => {
  const { gtk_id, tanggal, status, waktu_masuk, waktu_pulang, latitude, longitude, foto_selfie, keterangan } = req.body
  const id = uuidv4()
  const exists = db.prepare('SELECT id FROM absensi_guru WHERE gtk_id = ? AND tanggal = ? AND tenant_id = ?').get(gtk_id, tanggal, req.tenantId)
  if (exists) {
    db.prepare('UPDATE absensi_guru SET status=?, waktu_masuk=?, waktu_pulang=?, latitude=?, longitude=?, foto_selfie=?, keterangan=? WHERE id=?').run(status, waktu_masuk||null, waktu_pulang||null, latitude||null, longitude||null, foto_selfie||null, keterangan||'', exists.id)
    return res.json({ id: exists.id, updated: true })
  }
  db.prepare('INSERT INTO absensi_guru (id, gtk_id, tanggal, status, waktu_masuk, waktu_pulang, latitude, longitude, foto_selfie, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, gtk_id, tanggal, status, waktu_masuk||null, waktu_pulang||null, latitude||null, longitude||null, foto_selfie||null, req.tenantId)
  res.json({ id })
})

// ==================== JURNAL MENGAJAR ====================
app.get('/api/jurnal/me', authMiddleware, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id)
  if (!user || !user.gtk_id) return res.json([])
  const rows = db.prepare(`SELECT j.*, m.nama as mapel_nama, r.nama as rombel_nama FROM jurnal_mengajar j LEFT JOIN mapel m ON j.mapel_id = m.id LEFT JOIN rombel r ON j.rombel_id = r.id WHERE j.guru_id = ? ORDER BY j.tanggal DESC, j.jam_ke`).all(user.gtk_id)
  res.json(rows)
})

app.get('/api/jurnal', authMiddleware, (req, res) => {
  const { tanggal, gtk_id, guru_id, status } = req.query
  let sql = `SELECT j.*, g.nama as guru_nama, m.nama as mapel_nama, r.nama as rombel_nama FROM jurnal_mengajar j LEFT JOIN gtk g ON j.guru_id = g.id LEFT JOIN mapel m ON j.mapel_id = m.id LEFT JOIN rombel r ON j.rombel_id = r.id WHERE j.tenant_id = ?`
  const params = [req.tenantId]
  if (tanggal) { sql += ' AND j.tanggal = ?'; params.push(tanggal) }
  if (gtk_id || guru_id) { sql += ' AND j.guru_id = ?'; params.push(gtk_id || guru_id) }
  if (status) { sql += ' AND j.status = ?'; params.push(status) }
  sql += ' ORDER BY j.tanggal DESC, j.jam_ke'
  res.json(db.prepare(sql).all(...params))
})

// Supervisi Kepala Sekolah: rekap aktivitas mengajar per guru
app.get('/api/supervisi/rekap', authMiddleware, (req, res) => {
  const { from, to } = req.query
  const cond = []
  const params = []
  if (from) { cond.push('j.tanggal >= ?'); params.push(from) }
  if (to) { cond.push('j.tanggal <= ?'); params.push(to) }
  const where = cond.length ? ' AND ' + cond.join(' AND ') : ''
  const rows = db.prepare(`
    SELECT g.id as guru_id, g.nama as guru_nama, g.nip,
      COUNT(j.id) as total_jurnal,
      SUM(CASE WHEN j.status='approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN j.status='submitted' THEN 1 ELSE 0 END) as submitted,
      SUM(CASE WHEN j.status='draft' THEN 1 ELSE 0 END) as draft,
      MAX(j.tanggal) as terakhir_mengajar
    FROM gtk g
    LEFT JOIN jurnal_mengajar j ON j.guru_id = g.id AND j.tenant_id = g.tenant_id ${where}
    WHERE g.tenant_id = ? AND g.status = 'aktif'
    GROUP BY g.id ORDER BY total_jurnal DESC, g.nama
  `).all(...params, req.tenantId)
  res.json(rows)
})

app.post('/api/jurnal', STAFF, (req, res) => {
  const id = uuidv4()
  let { guru_id, mapel_id, rombel_id, tanggal, jam_ke, materi, kegiatan, catatan, status } = req.body
  // If guru_id not provided, use logged-in user's gtk_id
  if (!guru_id) {
    const user = db.prepare("SELECT gtk_id FROM users WHERE id = ?").get(req.user.id)
    guru_id = user?.gtk_id
  }
  if (!guru_id) return res.status(400).json({ error: 'guru_id required' })
  db.prepare('INSERT INTO jurnal_mengajar (id, guru_id, mapel_id, rombel_id, tanggal, jam_ke, materi, kegiatan, catatan, status, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id, guru_id, mapel_id, rombel_id, tanggal, jam_ke||1, materi||'', kegiatan||'', catatan||'', status||'draft', req.tenantId)
  res.json({ id })
})

app.put('/api/jurnal/:id', STAFF, (req, res) => {
  const { materi, kegiatan, catatan, status } = req.body
  // If only status is provided (admin approve/reject), only update status
  if (status && !materi && !kegiatan && !catatan) {
    db.prepare('UPDATE jurnal_mengajar SET status=? WHERE id=? AND tenant_id=?').run(status, req.params.id, req.tenantId)
  } else {
    db.prepare('UPDATE jurnal_mengajar SET materi=?, kegiatan=?, catatan=?, status=? WHERE id=? AND tenant_id=?').run(materi||'', kegiatan||'', catatan||'', status||'draft', req.params.id, req.tenantId)
  }
  res.json({ success: true })
})

app.delete('/api/jurnal/:id', STAFF, (req, res) => {
  db.prepare('DELETE FROM jurnal_mengajar WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// ==================== PENILAIAN HARIAN ====================
app.get('/api/penilaian-harian', authMiddleware, (req, res) => {
  const { siswa_id, mapel_id, tanggal_from, tanggal_to } = req.query
  let sql = `SELECT p.*, s.nama as siswa_nama, s.nis, m.nama as mapel_nama 
    FROM penilaian_harian p 
    LEFT JOIN siswa s ON p.siswa_id = s.id 
    LEFT JOIN mapel m ON p.mapel_id = m.id 
    WHERE p.tenant_id=?`
  const params = [req.tenantId]
  if (siswa_id) { sql += ' AND p.siswa_id = ?'; params.push(siswa_id) }
  if (mapel_id) { sql += ' AND p.mapel_id = ?'; params.push(mapel_id) }
  if (tanggal_from) { sql += ' AND p.tanggal >= ?'; params.push(tanggal_from) }
  if (tanggal_to) { sql += ' AND p.tanggal <= ?'; params.push(tanggal_to) }
  sql += ' ORDER BY p.tanggal DESC'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/penilaian-harian', STAFF, (req, res) => {
  const id = uuidv4()
  const { jurnal_id, siswa_id, mapel_id, tanggal, sikap, keaktifan, pengetahuan, catatan } = req.body
  db.prepare(`INSERT INTO penilaian_harian (id, jurnal_id, siswa_id, mapel_id, tanggal, sikap, keaktifan, pengetahuan, catatan, tenant_id) 
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, jurnal_id||null, siswa_id, mapel_id, tanggal, sikap||0, keaktifan||0, pengetahuan||0, catatan||'', req.tenantId)
  res.json({ id })
})

app.post('/api/penilaian-harian/bulk', STAFF, (req, res) => {
  const { jurnal_id, mapel_id, tanggal, data } = req.body
  if (!data || !Array.isArray(data)) return res.status(400).json({ error: 'Data harus array' })
  let count = 0
  for (const d of data) {
    const exists = db.prepare('SELECT id FROM penilaian_harian WHERE siswa_id = ? AND mapel_id = ? AND tanggal = ? AND tenant_id=?').get(d.siswa_id, mapel_id, tanggal, req.tenantId)
    if (exists) {
      db.prepare('UPDATE penilaian_harian SET sikap=?, keaktifan=?, pengetahuan=?, catatan=? WHERE id=?').run(d.sikap||0, d.keaktifan||0, d.pengetahuan||0, d.catatan||'', exists.id)
    } else {
      db.prepare('INSERT INTO penilaian_harian (id, jurnal_id, siswa_id, mapel_id, tanggal, sikap, keaktifan, pengetahuan, catatan, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(uuidv4(), jurnal_id||null, d.siswa_id, mapel_id, tanggal, d.sikap||0, d.keaktifan||0, d.pengetahuan||0, d.catatan||'', req.tenantId)
    }
    count++
  }
  res.json({ count })
})

app.put('/api/penilaian-harian/:id', STAFF, (req, res) => {
  const { sikap, keaktifan, pengetahuan, catatan } = req.body
  db.prepare('UPDATE penilaian_harian SET sikap=?, keaktifan=?, pengetahuan=?, catatan=? WHERE id=? AND tenant_id=?').run(sikap||0, keaktifan||0, pengetahuan||0, catatan||'', req.params.id, req.tenantId)
  res.json({ success: true })
})

app.delete('/api/penilaian-harian/:id', STAFF, (req, res) => {
  db.prepare('DELETE FROM penilaian_harian WHERE id = ? AND tenant_id=?').run(req.params.id, req.tenantId)
  res.json({ success: true })
})

app.get('/api/penilaian-harian/rekap/:siswa_id', authMiddleware, (req, res) => {
  const { semester, tahun } = req.query
  let sql = `SELECT p.mapel_id, m.nama as mapel_nama,
    AVG(p.sikap) as rata_sikap, 
    AVG(p.keaktifan) as rata_keaktifan, 
    AVG(p.pengetahuan) as rata_pengetahuan,
    COUNT(*) as jumlah_penilaian
    FROM penilaian_harian p
    LEFT JOIN mapel m ON p.mapel_id = m.id
    WHERE p.siswa_id = ? AND p.tenant_id=?`
  const params = [req.params.siswa_id, req.tenantId]
  if (semester && tahun) {
    // Filter by semester dates (rough estimation, bisa disesuaikan)
    const startMonth = semester === 'ganjil' ? '07' : '01'
    const endMonth = semester === 'ganjil' ? '12' : '06'
    sql += ` AND p.tanggal >= ? AND p.tanggal <= ?`
    params.push(`${tahun}-${startMonth}-01`, `${tahun}-${endMonth}-31`)
  }
  sql += ' GROUP BY p.mapel_id ORDER BY m.nama'
  res.json(db.prepare(sql).all(...params))
})

// ==================== RAPOR TENGAH SEMESTER ====================
function predikatFromNilai(n) {
  if (n >= 90) return 'A'
  if (n >= 80) return 'B'
  if (n >= 70) return 'C'
  return 'D'
}

// Get rapor list (filter by siswa/rombel/semester)
app.get('/api/rapor', authMiddleware, (req, res) => {
  const { siswa_id, tahun_ajaran, semester, jenis } = req.query
  let sql = `SELECT r.*, s.nama as siswa_nama, s.nis, m.nama as mapel_nama
    FROM rapor r
    LEFT JOIN siswa s ON r.siswa_id = s.id
    LEFT JOIN mapel m ON r.mapel_id = m.id
    WHERE r.tenant_id=?`
  const params = [req.tenantId]
  if (siswa_id) { sql += ' AND r.siswa_id = ?'; params.push(siswa_id) }
  if (tahun_ajaran) { sql += ' AND r.tahun_ajaran = ?'; params.push(tahun_ajaran) }
  if (semester) { sql += ' AND r.semester = ?'; params.push(semester) }
  if (jenis) { sql += ' AND r.jenis = ?'; params.push(jenis) }
  sql += ' ORDER BY m.nama'
  res.json(db.prepare(sql).all(...params))
})

// Generate rapor tengah semester dari penilaian_harian (agregasi)
app.post('/api/rapor/generate', STAFF, (req, res) => {
  const { rombel_id, tahun_ajaran, semester, jenis } = req.body
  if (!rombel_id || !tahun_ajaran || !semester) return res.status(400).json({ error: 'rombel_id, tahun_ajaran, semester wajib' })
  const jenisR = jenis || 'tengah'
  const startMonth = semester === 'ganjil' ? '07' : '01'
  const endMonth = semester === 'ganjil' ? '12' : '06'
  const from = `${tahun_ajaran.split('/')[0]}-${startMonth}-01`
  const to = `${semester === 'ganjil' ? tahun_ajaran.split('/')[0] : tahun_ajaran.split('/')[1] || tahun_ajaran.split('/')[0]}-${endMonth}-31`

  const siswaList = db.prepare('SELECT id FROM siswa WHERE rombel_id = ? AND tenant_id=?').all(rombel_id, req.tenantId)
  let count = 0
  const insert = db.prepare(`INSERT INTO rapor (id, siswa_id, mapel_id, tahun_ajaran, semester, jenis, nilai_pengetahuan, nilai_keterampilan, nilai_sikap, nilai_akhir, predikat, deskripsi, tenant_id, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(siswa_id, mapel_id, tahun_ajaran, semester, jenis) DO UPDATE SET
    nilai_pengetahuan=excluded.nilai_pengetahuan, nilai_keterampilan=excluded.nilai_keterampilan, nilai_sikap=excluded.nilai_sikap, nilai_akhir=excluded.nilai_akhir, predikat=excluded.predikat, updated_at=datetime('now')`)

  for (const s of siswaList) {
    const rekap = db.prepare(`SELECT mapel_id, AVG(pengetahuan) as p, AVG(keaktifan) as k, AVG(sikap) as sk
      FROM penilaian_harian WHERE siswa_id=? AND tenant_id=? AND tanggal>=? AND tanggal<=? GROUP BY mapel_id`).all(s.id, req.tenantId, from, to)
    for (const r of rekap) {
      const peng = Math.round(r.p || 0)
      const ket = Math.round(r.k || 0)
      const sik = Math.round(r.sk || 0)
      const akhir = Math.round((peng * 0.5) + (ket * 0.3) + (sik * 0.2))
      insert.run(uuidv4(), s.id, r.mapel_id, tahun_ajaran, semester, jenisR, peng, ket, sik, akhir, predikatFromNilai(akhir), '', req.tenantId)
      count++
    }
  }
  res.json({ count, message: `${count} nilai rapor ${jenisR} semester berhasil digenerate` })
})

// Update single rapor entry
app.put('/api/rapor/:id', STAFF, (req, res) => {
  const { nilai_pengetahuan, nilai_keterampilan, nilai_sikap, deskripsi } = req.body
  const akhir = Math.round(((nilai_pengetahuan||0) * 0.5) + ((nilai_keterampilan||0) * 0.3) + ((nilai_sikap||0) * 0.2))
  db.prepare(`UPDATE rapor SET nilai_pengetahuan=?, nilai_keterampilan=?, nilai_sikap=?, nilai_akhir=?, predikat=?, deskripsi=?, updated_at=datetime('now') WHERE id=? AND tenant_id=?`)
    .run(nilai_pengetahuan||0, nilai_keterampilan||0, nilai_sikap||0, akhir, predikatFromNilai(akhir), deskripsi||'', req.params.id, req.tenantId)
  res.json({ success: true })
})

// Sync rapor akhir semester ke RDM (Rapor Digital Madrasah)
app.post('/api/rapor/sync-rdm', ADMIN, async (req, res) => {
  const { rombel_id, tahun_ajaran, semester, rdm_url, nama_sheet } = req.body
  const target = rdm_url || 'https://rapor.mtsplussd7.cc.cd/api/sync-sheets'
  const rapors = db.prepare(`SELECT r.*, s.nis, s.nama as siswa_nama, m.nama as mapel_nama
    FROM rapor r LEFT JOIN siswa s ON r.siswa_id=s.id LEFT JOIN mapel m ON r.mapel_id=m.id
    WHERE r.tenant_id=? AND r.tahun_ajaran=? AND r.semester=? AND r.jenis='akhir'
    ${rombel_id ? 'AND s.rombel_id=?' : ''} ORDER BY s.nama, m.nama`)
    .all(...(rombel_id ? [req.tenantId, tahun_ajaran, semester, rombel_id] : [req.tenantId, tahun_ajaran, semester]))

  // Group by siswa: [no, nama, nilai per mapel...]
  const bySiswa = {}
  rapors.forEach((r, i) => {
    if (!bySiswa[r.siswa_id]) bySiswa[r.siswa_id] = { nis: r.nis, nama: r.siswa_nama, nilai: {} }
    bySiswa[r.siswa_id].nilai[r.mapel_nama] = r.nilai_akhir
  })
  const payload = Object.values(bySiswa).map((s, idx) => ({ no: idx+1, nis: s.nis, nama: s.nama, ...s.nilai }))

  const logId = uuidv4()
  try {
    const resp = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, nama_sheet: nama_sheet || 'KELAS 7 A' })
    })
    const txt = await resp.text()
    db.prepare(`INSERT INTO rapor_sync_log (id, target, rombel_id, tahun_ajaran, semester, total_records, status, response, tenant_id) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(logId, target, rombel_id||null, tahun_ajaran, semester, payload.length, resp.ok ? 'success' : 'failed', txt.slice(0, 500), req.tenantId)
    res.json({ success: resp.ok, total: payload.length, rdm_response: txt.slice(0, 300) })
  } catch (e) {
    db.prepare(`INSERT INTO rapor_sync_log (id, target, rombel_id, tahun_ajaran, semester, total_records, status, response, tenant_id) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(logId, target, rombel_id||null, tahun_ajaran, semester, payload.length, 'error', e.message, req.tenantId)
    res.status(500).json({ error: e.message, total: payload.length })
  }
})

// ==================== DASHBOARD STATS ====================
app.get('/api/dashboard/stats', authMiddleware, (req, res) => {
  const today = new Date().toISOString().split('T')[0]
  const tid = req.tenantId
  const totalSiswa = db.prepare("SELECT COUNT(*) as c FROM siswa WHERE tenant_id=?").get(tid).c
  const totalGTK = db.prepare("SELECT COUNT(*) as c FROM gtk WHERE tenant_id=?").get(tid).c
  const totalMapel = db.prepare("SELECT COUNT(*) as c FROM mapel WHERE tenant_id=?").get(tid).c
  const totalRombel = db.prepare("SELECT COUNT(*) as c FROM rombel WHERE tenant_id=?").get(tid).c
  const totalJurnal = db.prepare("SELECT COUNT(*) as c FROM jurnal_mengajar WHERE tanggal=? AND tenant_id=?").get(today, tid).c
  const siswaAktif = db.prepare("SELECT COUNT(*) as c FROM siswa WHERE status='aktif' AND tenant_id=?").get(tid).c
  const gtkAktif = db.prepare("SELECT COUNT(*) as c FROM gtk WHERE status='aktif' AND tenant_id=?").get(tid).c

  // Absensi hari ini
  const absensiSiswaHadir = db.prepare("SELECT COUNT(*) as c FROM absensi_siswa WHERE tanggal=? AND status='hadir' AND tenant_id=?").get(today, tid).c
  const absensiSiswaTotal = db.prepare("SELECT COUNT(*) as c FROM absensi_siswa WHERE tanggal=? AND tenant_id=?").get(today, tid).c
  const absensiGuruHadir = db.prepare("SELECT COUNT(*) as c FROM absensi_guru WHERE tanggal=? AND status='hadir' AND tenant_id=?").get(today, tid).c
  const absensiGuruTotal = db.prepare("SELECT COUNT(*) as c FROM absensi_guru WHERE tanggal=? AND tenant_id=?").get(today, tid).c

  // Rekap absensi 7 hari terakhir
  const rekapAbsensi = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const tgl = d.toISOString().split('T')[0]
    const hari = d.toLocaleDateString('id-ID', { weekday: 'short' })
    const siswaH = db.prepare("SELECT COUNT(*) as c FROM absensi_siswa WHERE tanggal=? AND status='hadir' AND tenant_id=?").get(tgl, tid).c
    const siswaS = db.prepare("SELECT COUNT(*) as c FROM absensi_siswa WHERE tanggal=? AND status='sakit' AND tenant_id=?").get(tgl, tid).c
    const siswaI = db.prepare("SELECT COUNT(*) as c FROM absensi_siswa WHERE tanggal=? AND status='izin' AND tenant_id=?").get(tgl, tid).c
    const siswaA = db.prepare("SELECT COUNT(*) as c FROM absensi_siswa WHERE tanggal=? AND status='alpha' AND tenant_id=?").get(tgl, tid).c
    const guruH = db.prepare("SELECT COUNT(*) as c FROM absensi_guru WHERE tanggal=? AND status='hadir' AND tenant_id=?").get(tgl, tid).c
    rekapAbsensi.push({ tanggal: tgl, hari, siswa_hadir: siswaH, siswa_sakit: siswaS, siswa_izin: siswaI, siswa_alpha: siswaA, guru_hadir: guruH })
  }

  // Jurnal terbaru
  const jurnalTerbaru = db.prepare(`SELECT j.*, g.nama as guru_nama, m.nama as mapel_nama, r.nama as rombel_nama 
    FROM jurnal_mengajar j 
    LEFT JOIN gtk g ON j.guru_id = g.id 
    LEFT JOIN mapel m ON j.mapel_id = m.id 
    LEFT JOIN rombel r ON j.rombel_id = r.id 
    WHERE j.tenant_id=?
    ORDER BY j.created_at DESC LIMIT 5`).all(tid)

  // Tagihan summary
  const tagihanBelumBayar = db.prepare("SELECT COUNT(*) as c FROM tagihan WHERE status='belum_bayar' AND tenant_id=?").get(tid).c
  const tagihanLunas = db.prepare("SELECT COUNT(*) as c FROM tagihan WHERE status='lunas' AND tenant_id=?").get(tid).c

  res.json({
    total_siswa: totalSiswa,
    total_gtk: totalGTK,
    total_mapel: totalMapel,
    total_rombel: totalRombel,
    siswa_aktif: siswaAktif,
    gtk_aktif: gtkAktif,
    jurnal_hari_ini: totalJurnal,
    absensi_siswa: { hadir: absensiSiswaHadir, total: absensiSiswaTotal },
    absensi_guru: { hadir: absensiGuruHadir, total: absensiGuruTotal },
    rekap_absensi: rekapAbsensi,
    jurnal_terbaru: jurnalTerbaru,
    tagihan: { belum_bayar: tagihanBelumBayar, lunas: tagihanLunas }
  })
})

// ==================== WA GATEWAY ====================
const WAGateway = require('./wa-gateway.cjs')
const waGateway = new WAGateway(db)

// Get WA config (per-tenant)
app.get('/api/wa-gateway/config', authMiddleware, (req, res) => {
  res.json(waGateway.getConfig(req.tenantId))
})

// Update WA config (per-tenant)
app.put('/api/wa-gateway/config', ADMIN, (req, res) => {
  const { provider, enabled, sender_name, baileys_webhook, sidobe_api_url, sidobe_api_key, sidobe_device_id } = req.body
  waGateway.getConfig(req.tenantId) // pastikan baris ada
  db.prepare(`UPDATE wa_gateway_config SET provider=?, enabled=?, sender_name=?, baileys_webhook=?, sidobe_api_url=?, sidobe_api_key=?, sidobe_device_id=? WHERE tenant_id=?`)
    .run(provider, enabled ? 1 : 0, sender_name || 'JURNALKU', baileys_webhook || '', sidobe_api_url || '', sidobe_api_key || '', sidobe_device_id || '', req.tenantId)
  res.json({ success: true })
})

// Test send WA (per-tenant)
app.post('/api/wa-gateway/test', ADMIN, async (req, res) => {
  const { phone, message } = req.body
  const result = await waGateway.sendMessage(phone, message || 'Test pesan dari JURNALKU', req.tenantId)
  res.json(result)
})

// ==================== BROADCAST ====================
// List broadcasts (per-tenant)
app.get('/api/broadcast', authMiddleware, (req, res) => {
  const data = db.prepare('SELECT * FROM broadcast_log WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50').all(req.tenantId)
  res.json(data)
})

// Get broadcast detail (per-tenant)
app.get('/api/broadcast/:id', authMiddleware, (req, res) => {
  const broadcast = db.prepare('SELECT * FROM broadcast_log WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId)
  if (!broadcast) return res.status(404).json({ error: 'Broadcast tidak ditemukan' })
  const details = db.prepare('SELECT * FROM broadcast_detail WHERE broadcast_id = ? ORDER BY nama').all(req.params.id)
  res.json({ ...broadcast, details })
})

// Create & send broadcast (per-tenant)
app.post('/api/broadcast', ADMIN, async (req, res) => {
  const { kategori, judul, pesan, penerima } = req.body
  if (!penerima || penerima.length === 0) return res.status(400).json({ error: 'Tidak ada penerima' })
  const tenantId = req.tenantId
  const broadcastId = uuidv4()
  db.prepare('INSERT INTO broadcast_log (id, kategori, judul, pesan, total_penerima, status, tenant_id) VALUES (?,?,?,?,?,?,?)')
    .run(broadcastId, kategori, judul, pesan, penerima.length, 'sending', tenantId)

  const insDetail = db.prepare('INSERT INTO broadcast_detail (id, broadcast_id, phone, nama, status, tenant_id) VALUES (?,?,?,?,?,?)')
  for (const p of penerima) {
    insDetail.run(uuidv4(), broadcastId, p.phone, p.nama, 'pending', tenantId)
  }

  res.json({ id: broadcastId, status: 'sending', total: penerima.length })

  // Send async
  const config = waGateway.getConfig(tenantId)
  let terkirim = 0, gagal = 0
  for (const p of penerima) {
    const result = await waGateway.sendMessage(p.phone, waGateway.renderTemplate(pesan, p, config), tenantId)
    if (result.success) {
      terkirim++
      db.prepare("UPDATE broadcast_detail SET status='sent', sent_at=datetime('now') WHERE broadcast_id=? AND phone=?").run(broadcastId, p.phone)
    } else {
      gagal++
      db.prepare("UPDATE broadcast_detail SET status='failed', error=? WHERE broadcast_id=? AND phone=?").run(result.error || 'Unknown', broadcastId, p.phone)
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  db.prepare("UPDATE broadcast_log SET total_terkirim=?, total_gagal=?, status='completed', completed_at=datetime('now') WHERE id=?")
    .run(terkirim, gagal, broadcastId)
})

// Quick broadcast by category (per-tenant)
app.post('/api/broadcast/quick', ADMIN, async (req, res) => {
  const { kategori, pesan } = req.body
  const tenantId = req.tenantId
  let penerima = []

  if (kategori === 'semua_siswa') {
    penerima = db.prepare("SELECT nama, nis, no_hp as phone FROM siswa WHERE status='aktif' AND tenant_id=? AND no_hp IS NOT NULL AND no_hp != ''").all(tenantId)
  } else if (kategori === 'semua_gtk') {
    penerima = db.prepare("SELECT nama, nip, no_hp as phone FROM gtk WHERE status='aktif' AND tenant_id=? AND no_hp IS NOT NULL AND no_hp != ''").all(tenantId)
  } else if (kategori === 'wali_murid') {
    penerima = db.prepare("SELECT nama, nis, no_hp_wali as phone FROM siswa WHERE status='aktif' AND tenant_id=? AND no_hp_wali IS NOT NULL AND no_hp_wali != ''").all(tenantId)
  } else if (kategori === 'per_rombel') {
    const { rombel_id } = req.body
    penerima = db.prepare("SELECT s.nama, s.nis, s.no_hp as phone FROM siswa s WHERE s.rombel_id=? AND s.status='aktif' AND s.tenant_id=? AND s.no_hp IS NOT NULL").all(rombel_id, tenantId)
  }

  if (penerima.length === 0) return res.status(400).json({ error: 'Tidak ada penerima dengan nomor HP valid' })

  const broadcastId = uuidv4()
  db.prepare('INSERT INTO broadcast_log (id, kategori, judul, pesan, total_penerima, status, tenant_id) VALUES (?,?,?,?,?,?,?)')
    .run(broadcastId, kategori, 'Quick: ' + kategori, pesan, penerima.length, 'sending', tenantId)

  const insDetail = db.prepare('INSERT INTO broadcast_detail (id, broadcast_id, phone, nama, status, tenant_id) VALUES (?,?,?,?,?,?)')
  for (const p of penerima) {
    insDetail.run(uuidv4(), broadcastId, p.phone, p.nama, 'pending', tenantId)
  }

  res.json({ id: broadcastId, status: 'sending', total: penerima.length })

  // Async send
  const config = waGateway.getConfig(tenantId)
  let terkirim = 0, gagal = 0
  for (const p of penerima) {
    const result = await waGateway.sendMessage(p.phone, waGateway.renderTemplate(pesan, p, config), tenantId)
    if (result.success) {
      terkirim++
      db.prepare("UPDATE broadcast_detail SET status='sent', sent_at=datetime('now') WHERE broadcast_id=? AND phone=?").run(broadcastId, p.phone)
    } else {
      gagal++
      db.prepare("UPDATE broadcast_detail SET status='failed', error=? WHERE broadcast_id=? AND phone=?").run(result.error || 'Unknown', broadcastId, p.phone)
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  db.prepare("UPDATE broadcast_log SET total_terkirim=?, total_gagal=?, status='completed', completed_at=datetime('now') WHERE id=?")
    .run(terkirim, gagal, broadcastId)
})

// Multi-tenant management routes
registerTenantRoutes(app, db, authMiddleware, uuidv4, requireRole('super_admin'))

// SPA fallback - serve index.html for non-API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' })
  if (req.method !== 'GET') return next()
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
})

// Start server
app.listen(PORT, () => {
  console.log(`JURNALKU API Server running on http://localhost:${PORT}`)
})

module.exports = app
