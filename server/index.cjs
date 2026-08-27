const express = require('express')
try { require('dotenv').config({ path: require('path').join(__dirname, '.env') }) } catch {}
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const multer = require('multer')
const { execSync } = require('child_process')
const { setupTenantTables, tenantMiddleware, registerTenantRoutes } = require('./tenant.cjs')
const { parseGuruHariRules, guruBolehMengajar } = require('./jadwal-rules.cjs')
const { intervalTumpangTindih } = require('./jadwal-time-rules.cjs')
const { bulkAssignGuru } = require('./jadwal-guru-repair.cjs')
const { detectJadwalConflicts } = require('./jadwal-conflicts.cjs')
const { importJadwalRows } = require('./jadwal-import.cjs')
const { setupPortalCashless, registerPortalRoutes, registerKantinRoutes, selectPenilaianStudentId } = require('./portal-cashless.cjs')
const waQueue = require('./wa-queue.cjs')
const { isDriveFolderUrl } = require('./library-config.cjs')
const { getLateDashboard } = require('./dashboard-late.cjs')
const { registerRoutes: registerBackupRestoreRoutes } = require('./backup-restore.cjs')
const { registerFinanceExcelRoutes } = require('./finance-excel.cjs')
const { FEATURE_KEYS, addMonthsIso, accessForTenant, featureForPath, normalizeFeatureSelection, generateUnlockCode, hashUnlockCode, setupSubscriptionTables } = require('./subscription.cjs')
const { setupBackupTables, registerBackupRoutes } = require('./backup-drive.cjs')
const { DOCUMENT_TYPES, buildPrompt, validateGenerateInput, createTemplateContent, createDocumentDocx, callAi } = require('./ai-documents.cjs')

const app = express()
const PORT = process.env.PORT || 3001
const IS_PROD = process.env.NODE_ENV === 'production'
const JWT_SECRET = process.env.JWT_SECRET || 'jurnalku-secret-key-2024'
const todayJakarta = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
const timeJakarta = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false })

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

app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { req.rawBody = Buffer.from(buf) } }))
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
const UPLOAD_DIR = path.join(__dirname, 'uploads')
const ktsStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[file.mimetype]
    cb(null, `kts-${String(req.tenantId).replace(/[^a-z0-9_-]/gi, '_')}-${crypto.randomBytes(16).toString('hex')}${ext}`)
  }
})
const ktsUpload = multer({
  storage: ktsStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpeg|webp)$/.test(file.mimetype))
})

// Database setup
const dbPath = process.env.DB_PATH ? path.resolve(__dirname, process.env.DB_PATH) : path.join(__dirname, 'jurnalku.db')
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
setupPortalCashless(db)
setupBackupTables(db)
waQueue.setupWA(db)

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

  CREATE TABLE IF NOT EXISTS library_config (
    tenant_id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Perpustakaan Digital',
    description TEXT NOT NULL DEFAULT '',
    drive_folder_url TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    visibility_roles TEXT NOT NULL DEFAULT '["all"]',
    updated_at TEXT DEFAULT (datetime('now'))
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

  CREATE TABLE IF NOT EXISTS template_jadwal (
    id TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    jenis TEXT DEFAULT 'reguler',
    maks_jtm INTEGER DEFAULT 15,
    keterangan TEXT,
    tenant_id TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
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

  CREATE TABLE IF NOT EXISTS posting (
    id TEXT PRIMARY KEY, judul TEXT NOT NULL, isi TEXT NOT NULL,
    kategori TEXT DEFAULT 'berita', penulis_id TEXT NOT NULL,
    penulis_nama TEXT NOT NULL, tenant_id TEXT NOT NULL,
    media TEXT DEFAULT '[]',
    activity_type TEXT DEFAULT '',
    location_lat REAL,
    location_lng REAL,
    location_name TEXT DEFAULT '',
    poll_data TEXT DEFAULT '[]',
    tags TEXT DEFAULT '[]',
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    shares_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posting_likes (
    id TEXT PRIMARY KEY,
    posting_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(posting_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_posting_likes_posting ON posting_likes(posting_id);
  CREATE INDEX IF NOT EXISTS idx_posting_likes_user ON posting_likes(user_id);

  CREATE TABLE IF NOT EXISTS posting_shares (
    id TEXT PRIMARY KEY,
    posting_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_posting_shares_posting ON posting_shares(posting_id);
  CREATE INDEX IF NOT EXISTS idx_posting_shares_user ON posting_shares(user_id);

  CREATE TABLE IF NOT EXISTS tugas_siswa (
    id TEXT PRIMARY KEY,
    guru_id TEXT NOT NULL,
    mapel_id TEXT,
    rombel_id TEXT NOT NULL,
    judul TEXT NOT NULL,
    deskripsi TEXT DEFAULT '',
    deadline TEXT,
    tenant_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
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

  CREATE TABLE IF NOT EXISTS catatan_kepribadian (
    id TEXT PRIMARY KEY,
    siswa_id TEXT NOT NULL,
    tahun_ajaran TEXT NOT NULL,
    semester TEXT NOT NULL,
    sikap_spiritual TEXT DEFAULT '',
    sikap_sosial TEXT DEFAULT '',
    kelakuan TEXT DEFAULT 'Baik',
    kerajinan TEXT DEFAULT 'Baik',
    kerapian TEXT DEFAULT 'Baik',
    kedisiplinan TEXT DEFAULT 'Baik',
    catatan_wali_kelas TEXT DEFAULT '',
    saran TEXT DEFAULT '',
    tenant_id TEXT DEFAULT 'default',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT,
    FOREIGN KEY (siswa_id) REFERENCES siswa(id)
  );
  CREATE INDEX IF NOT EXISTS idx_catatan_kepribadian_tenant ON catatan_kepribadian(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_catatan_kepribadian_siswa ON catatan_kepribadian(siswa_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_catatan_kepribadian_unique ON catatan_kepribadian(siswa_id, tahun_ajaran, semester, tenant_id);

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

  -- ==================== E-KANTIN & CASHLESS EXTENSIONS ====================
  CREATE TABLE IF NOT EXISTS kantin_menu (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    kategori TEXT NOT NULL, -- makanan, minuman, snack, dll
    nama TEXT NOT NULL,
    deskripsi TEXT,
    harga INTEGER NOT NULL CHECK(harga > 0),
    stok INTEGER DEFAULT 0 CHECK(stok >= 0),
    foto TEXT,
    aktif INTEGER DEFAULT 1,
    urut INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_kantin_menu_tenant ON kantin_menu(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_kantin_menu_aktif ON kantin_menu(aktif);

  CREATE TABLE IF NOT EXISTS kantin_orders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    items TEXT NOT NULL, -- JSON array: [{menu_id, nama, harga, qty, subtotal}]
    total INTEGER NOT NULL CHECK(total > 0),
    status TEXT DEFAULT 'pending', -- pending, paid, preparing, ready, completed, cancelled
    payment_method TEXT, -- cashless, cash, manual
    paid_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (student_id) REFERENCES siswa(id)
  );
  CREATE INDEX IF NOT EXISTS idx_kantin_orders_tenant ON kantin_orders(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_kantin_orders_student ON kantin_orders(student_id);
  CREATE INDEX IF NOT EXISTS idx_kantin_orders_status ON kantin_orders(status);
  CREATE INDEX IF NOT EXISTS idx_kantin_orders_created ON kantin_orders(created_at);

  -- Bank transfer provider config (extend cashless_provider_config)
  -- provider: 'bank_transfer', config_json: {va_prefix, bank_code, admin_fee, manual_verify: true}

  CREATE TABLE IF NOT EXISTS cashless_topup_manual (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount > 0),
    bukti_transfer TEXT, -- path to uploaded file
    bank_dari TEXT, -- nama bank pengirim
    no_rek_dari TEXT,
    atas_nama TEXT,
    status TEXT DEFAULT 'pending', -- pending, verified, rejected
    verified_by TEXT,
    verified_at TEXT,
    catatan TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    provider TEXT,
    unique_code TEXT,
    transfer_amount INTEGER,
    FOREIGN KEY (student_id) REFERENCES siswa(id)
  );
  CREATE INDEX IF NOT EXISTS idx_cashless_topup_manual_tenant ON cashless_topup_manual(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_cashless_topup_manual_student ON cashless_topup_manual(student_id);
  CREATE INDEX IF NOT EXISTS idx_cashless_topup_manual_status ON cashless_topup_manual(status);

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
setupSubscriptionTables(db)

// Migrasi: kolom UNIQUE global (nip/nis/kode) peninggalan pra-multi-tenant bikin
// import/edit gagal begitu ada NIP/NIS kosong kedua atau kode sama antar-sekolah.
// Ganti jadi UNIQUE composite per-tenant via recreate table (aman: tidak ada FK ke kolom ini).
function migrateUniquePerTenant(db) {
  try {
    const idx = db.prepare("PRAGMA index_list(gtk)").all()
    const hasGlobalUnique = idx.some(i => i.unique && i.origin === 'u' && !i.name.includes('tenant'))
    if (hasGlobalUnique) {
      db.exec(`
        DROP TABLE IF EXISTS gtk_new;
        CREATE TABLE gtk_new (
          id TEXT PRIMARY KEY, nip TEXT, nuptk TEXT, nama TEXT NOT NULL, jenis_kelamin TEXT NOT NULL,
          tempat_lahir TEXT, tanggal_lahir TEXT, alamat TEXT, no_hp TEXT, email TEXT,
          jabatan TEXT DEFAULT 'guru', status_kepegawaian TEXT DEFAULT 'honorer', bidang_studi TEXT,
          foto TEXT, status TEXT DEFAULT 'aktif', created_at TEXT DEFAULT (datetime('now')),
          tenant_id TEXT DEFAULT 'default', kode_guru TEXT DEFAULT ''
        );
        INSERT INTO gtk_new SELECT id, NULLIF(nip,''), nuptk, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, email, jabatan, status_kepegawaian, bidang_studi, foto, status, created_at, tenant_id, kode_guru FROM gtk;
        DROP TABLE gtk;
        ALTER TABLE gtk_new RENAME TO gtk;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_gtk_nip_tenant ON gtk(nip, tenant_id) WHERE nip IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_gtk_tenant ON gtk(tenant_id);
      `)
      console.log('[migrate] gtk: UNIQUE global -> per-tenant OK')
    }
  } catch (e) { console.error('migrate gtk unique failed', e.message) }

  try {
    const idx = db.prepare("PRAGMA index_list(siswa)").all()
    const hasGlobalUnique = idx.some(i => i.unique && i.origin === 'u')
    if (hasGlobalUnique) {
      db.exec(`
        DROP TABLE IF EXISTS siswa_new;
        CREATE TABLE siswa_new (
          id TEXT PRIMARY KEY, nis TEXT NOT NULL, nisn TEXT, nama TEXT NOT NULL, jenis_kelamin TEXT NOT NULL,
          tempat_lahir TEXT, tanggal_lahir TEXT, alamat TEXT, no_hp TEXT, nama_ortu TEXT,
          rombel_id TEXT, foto TEXT, status TEXT DEFAULT 'aktif', created_at TEXT DEFAULT (datetime('now')),
          tenant_id TEXT DEFAULT 'default'
        );
        INSERT INTO siswa_new SELECT id, nis, nisn, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, nama_ortu, rombel_id, foto, status, created_at, tenant_id FROM siswa;
        DROP TABLE siswa;
        ALTER TABLE siswa_new RENAME TO siswa;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_siswa_nis_tenant ON siswa(nis, tenant_id);
        CREATE INDEX IF NOT EXISTS idx_siswa_tenant ON siswa(tenant_id);
      `)
      console.log('[migrate] siswa: UNIQUE global -> per-tenant OK')
    }
  } catch (e) { console.error('migrate siswa unique failed', e.message) }

  try {
    const idx = db.prepare("PRAGMA index_list(mapel)").all()
    const hasGlobalUnique = idx.some(i => i.unique && i.origin === 'u')
    if (hasGlobalUnique) {
      db.exec(`
        DROP TABLE IF EXISTS mapel_new;
        CREATE TABLE mapel_new (
          id TEXT PRIMARY KEY, kode TEXT NOT NULL, nama TEXT NOT NULL, kelompok TEXT DEFAULT 'wajib',
          tingkat TEXT DEFAULT '[]', jam_per_minggu INTEGER DEFAULT 2, tenant_id TEXT DEFAULT 'default'
        );
        INSERT INTO mapel_new SELECT id, kode, nama, kelompok, tingkat, jam_per_minggu, tenant_id FROM mapel;
        DROP TABLE mapel;
        ALTER TABLE mapel_new RENAME TO mapel;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mapel_kode_tenant ON mapel(kode, tenant_id);
        CREATE INDEX IF NOT EXISTS idx_mapel_tenant ON mapel(tenant_id);
      `)
      console.log('[migrate] mapel: UNIQUE global -> per-tenant OK')
    }
  } catch (e) { console.error('migrate mapel unique failed', e.message) }
}

for (const col of [
  ['settings', 'geo_latitude', 'REAL'],
  ['settings', 'geo_longitude', 'REAL'],
  ['settings', 'geo_radius', 'INTEGER DEFAULT 200'],
  ['settings', 'background', "TEXT DEFAULT ''"],
  ['settings', 'jenjang', "TEXT DEFAULT ''"],
  ['settings', 'hari_libur', "TEXT DEFAULT '[\"jumat\"]'"],
  ['settings', 'bg_size', "TEXT DEFAULT 'cover'"],
  ['settings', 'bg_position', "TEXT DEFAULT 'center'"],
  ['settings', 'bg_repeat', "TEXT DEFAULT 'no-repeat'"],
  ['settings', 'bg_blur', "INTEGER DEFAULT 0"],
  ['settings', 'kts_depan', "TEXT DEFAULT ''"],
  ['settings', 'kts_belakang', "TEXT DEFAULT ''"],
  ['wa_gateway_config', 'tenant_id', "TEXT DEFAULT 'default'"],
  ['broadcast_log', 'tenant_id', "TEXT DEFAULT 'default'"],
  ['broadcast_detail', 'tenant_id', "TEXT DEFAULT 'default'"],
  ['modul_ajar', 'kurikulum', "TEXT DEFAULT 'merdeka'"],
  ['gtk', 'kode_guru', "TEXT DEFAULT ''"],
  ['jadwal', 'template_id', 'TEXT'],
  ['jadwal', 'jenis_kegiatan', "TEXT DEFAULT 'mapel'"],
  ['jadwal', 'nama_kegiatan', "TEXT DEFAULT ''"],
  ['users', 'tenant_id', "TEXT DEFAULT 'default'"],
  ['users', 'gtk_id', 'TEXT'],
  ['users', 'kode_guru', "TEXT DEFAULT ''"],
  ['users', 'siswa_id', 'TEXT'],
  ['users', 'must_change_password', 'INTEGER DEFAULT 0'],
  ['absensi_guru', 'keterangan', "TEXT DEFAULT ''"],
  // Absensi siswa: pisah masuk & pulang (Item 1)
  ['absensi_siswa', 'waktu_masuk', 'TEXT'],
  ['absensi_siswa', 'waktu_pulang', 'TEXT'],
  ['absensi_siswa', 'status_pulang', "TEXT DEFAULT ''"],
  ['absensi_siswa', 'keterangan_pulang', "TEXT DEFAULT ''"],
  // Catatan kepribadian: sikap umum tunggal (Item 2)
  ['catatan_kepribadian', 'sikap_umum', "TEXT DEFAULT ''"],
  // Pengaturan jam sesi absensi QR siswa (Item: sesi masuk & pulang)
  ['settings', 'sesi_masuk_mulai', "TEXT DEFAULT '06:00'"],
  ['settings', 'sesi_masuk_selesai', "TEXT DEFAULT '07:30'"],
  ['settings', 'sesi_pulang_mulai', "TEXT DEFAULT '13:00'"],
  ['settings', 'sesi_pulang_selesai', "TEXT DEFAULT '15:00'"],
  // Batas waktu ceklok GTK/guru (masuk & pulang)
  ['settings', 'ceklok_masuk_mulai', "TEXT DEFAULT '06:00'"],
  ['settings', 'ceklok_masuk_selesai', "TEXT DEFAULT '07:30'"],
  ['settings', 'ceklok_pulang_mulai', "TEXT DEFAULT '13:00'"],
    ['settings', 'ceklok_pulang_selesai', "TEXT DEFAULT '16:00'"],
    ['tenants', 'foundation_id', 'TEXT']
  ]) {
  try { db.prepare(`ALTER TABLE ${col[0]} ADD COLUMN ${col[1]} ${col[2]}`).run() } catch {}
}

function studentInitialPassword(siswa) {
  const nisn = String(siswa?.nisn || '').trim()
  if (nisn) return nisn
  const tgl = String(siswa?.tanggal_lahir || '').replace(/\D/g, '')
  if (tgl) return tgl
  return String(siswa?.nis || '').trim()
}

function studentActiveIdentifier(siswa) {
  const nisn = String(siswa?.nisn || '').trim()
  return nisn || String(siswa?.nis || '').trim()
}

function studentLocalEmail(tenantId, nis) {
  const safeTenant = String(tenantId || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 36) || 'default'
  const safeNis = String(nis || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)
  return `siswa-${safeTenant}-${safeNis}@local.jurnalku`
}

function ensureStudentUser(siswa, tenantId, opts = {}) {
  if (!siswa || !siswa.id || !siswa.nis) return null
  const initial = studentInitialPassword(siswa)
  if (!initial) return null

  const byStudent = db.prepare('SELECT * FROM users WHERE siswa_id = ? AND tenant_id = ?').get(siswa.id, tenantId)
  const byNis = db.prepare("SELECT * FROM users WHERE role = 'siswa' AND nis = ? AND tenant_id = ?").get(siswa.nis, tenantId)
  const user = byStudent || byNis

  if (user) {
    const nextPassword = opts.resetPassword ? bcrypt.hashSync(initial, 10) : user.password
    db.prepare('UPDATE users SET nama=?, nis=?, siswa_id=?, password=?, must_change_password=? WHERE id=? AND tenant_id=?')
      .run(siswa.nama, siswa.nis, siswa.id, nextPassword, opts.resetPassword ? 1 : (user.must_change_password || 0), user.id, tenantId)
    return db.prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?').get(user.id, tenantId)
  }

  const id = uuidv4()
  const email = studentLocalEmail(tenantId, siswa.nis)
  db.prepare('INSERT INTO users (id, nama, email, password, role, nis, siswa_id, tenant_id, must_change_password) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, siswa.nama, email, bcrypt.hashSync(initial, 10), 'siswa', siswa.nis, siswa.id, tenantId, 1)
  return db.prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?').get(id, tenantId)
}

// Migrate jadwal.mapel_id to NULLABLE (for istirahat/kegiatan support)
try {
  const tableInfo = db.prepare("PRAGMA table_info(jadwal)").all()
  const mapelCol = tableInfo.find((c) => c.name === 'mapel_id')
  if (mapelCol && mapelCol.notnull === 1) {
    console.log('[migration] jadwal.mapel_id is NOT NULL, migrating to nullable...')
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE jadwal_new (
        id TEXT PRIMARY KEY,
        mapel_id TEXT,
        rombel_id TEXT NOT NULL,
        gtk_id TEXT,
        hari TEXT NOT NULL,
        jam_mulai TEXT NOT NULL,
        jam_selesai TEXT NOT NULL,
        ruangan TEXT,
        template_id TEXT,
        jenis_kegiatan TEXT DEFAULT 'mapel',
        nama_kegiatan TEXT DEFAULT '',
        tenant_id TEXT DEFAULT 'default',
        FOREIGN KEY (mapel_id) REFERENCES mapel(id),
        FOREIGN KEY (rombel_id) REFERENCES rombel(id),
        FOREIGN KEY (gtk_id) REFERENCES gtk(id)
      );
      INSERT INTO jadwal_new SELECT id, mapel_id, rombel_id, gtk_id, hari, jam_mulai, jam_selesai, ruangan, template_id, COALESCE(jenis_kegiatan, 'mapel'), COALESCE(nama_kegiatan, ''), COALESCE(tenant_id, 'default') FROM jadwal;
      DROP TABLE jadwal;
      ALTER TABLE jadwal_new RENAME TO jadwal;
      COMMIT;
    `)
    console.log('[migration] jadwal.mapel_id is now nullable')
  }
} catch (e) { console.error('[migration] jadwal nullable failed:', e.message) }

// Backfill link users->gtk untuk akun guru/kepala lama yang belum punya gtk_id.
// Cocokkan via nip, lalu kode_guru, lalu email (per tenant). Idempoten.
try {
  const orphans = db.prepare("SELECT id, nip, kode_guru, email, tenant_id FROM users WHERE (gtk_id IS NULL OR gtk_id='') AND role IN ('guru','kepala')").all()
  const findByNip = db.prepare('SELECT id, kode_guru FROM gtk WHERE nip = ? AND tenant_id = ?')
  const findByKode = db.prepare("SELECT id FROM gtk WHERE kode_guru = ? AND kode_guru != '' AND tenant_id = ?")
  const findByEmail = db.prepare("SELECT id, kode_guru FROM gtk WHERE email = ? AND email != '' AND tenant_id = ?")
  const upd = db.prepare('UPDATE users SET gtk_id = ?, kode_guru = COALESCE(NULLIF(kode_guru,\'\'), ?) WHERE id = ?')
  for (const u of orphans) {
    let g = (u.nip ? findByNip.get(u.nip, u.tenant_id) : null)
      || (u.kode_guru ? findByKode.get(u.kode_guru, u.tenant_id) : null)
      || (u.email ? findByEmail.get(u.email, u.tenant_id) : null)
    if (g) upd.run(g.id, g.kode_guru || '', u.id)
  }
} catch (e) { console.error('backfill users.gtk_id gagal:', e.message) }

// Backfill admin/operator: link ke gtk kalau match (nip/kode/email/nama),
// kalau tidak ada match buat baris gtk sintetis (mereka juga mengajar -> perlu ceklok). Idempoten.
try {
  const { randomUUID } = require('crypto')
  const staff = db.prepare("SELECT id, nip, kode_guru, email, tenant_id FROM users WHERE (gtk_id IS NULL OR gtk_id='') AND role IN ('admin','operator','tata_usaha','tu','kepala')").all()
  const byNip = db.prepare('SELECT id, kode_guru FROM gtk WHERE nip = ? AND tenant_id = ?')
  const byKode = db.prepare("SELECT id FROM gtk WHERE kode_guru = ? AND kode_guru != '' AND tenant_id = ?")
  const byEmail = db.prepare("SELECT id, kode_guru FROM gtk WHERE email = ? AND email != '' AND tenant_id = ?")
  const byNama = db.prepare("SELECT id, kode_guru FROM gtk WHERE lower(nama) = lower(?) AND tenant_id = ?")
  const insGtk = db.prepare("INSERT INTO gtk (id, nama, jenis_kelamin, email, jabatan, status_kepegawaian, kode_guru, tenant_id) VALUES (?, ?, 'L', ?, 'Admin/Operator', 'Tetap', '', ?)")
  const upd = db.prepare("UPDATE users SET gtk_id = ?, kode_guru = COALESCE(NULLIF(kode_guru,''), ?) WHERE id = ?")
  for (const u of staff) {
    const local = (u.email || '').split('@')[0] || 'Admin'
    let g = (u.nip ? byNip.get(u.nip, u.tenant_id) : null)
      || (u.kode_guru ? byKode.get(u.kode_guru, u.tenant_id) : null)
      || (u.email ? byEmail.get(u.email, u.tenant_id) : null)
      || byNama.get('Admin ' + local, u.tenant_id)
    if (!g) {
      // SEBELUM buat, cek: apakah ada GTK dengan email/nip sama tapi nama BEDA?
      // (kasus: guru existing promosi jadi admin, nama GTK asli ≠ 'Admin ...')
      const byEmailAny = u.email ? db.prepare("SELECT id, kode_guru FROM gtk WHERE lower(email) = lower(?) AND tenant_id = ?").get(u.email, u.tenant_id) : null
      const byNipAny = u.nip ? db.prepare('SELECT id, kode_guru FROM gtk WHERE nip = ? AND tenant_id = ?').get(u.nip, u.tenant_id) : null
      if (byEmailAny || byNipAny) {
        g = byEmailAny || byNipAny  // link ke GTK existing, jangan buat baru
      } else {
        const gid = randomUUID()
        insGtk.run(gid, 'Admin ' + local, u.email || '', u.tenant_id)
        g = { id: gid, kode_guru: '' }
      }
    }
    upd.run(g.id, g.kode_guru || '', u.id)
  }
} catch (e) { console.error('backfill admin gtk gagal:', e.message) }

// Jalankan migrasi UNIQUE per-tenant SETELAH semua kolom (kode_guru dll) dipastikan ada.
// FK dimatikan sementara karena recreate table siswa/gtk direferensikan FK dari tabel absensi.
try {
  db.pragma('foreign_keys = OFF')
  migrateUniquePerTenant(db)
} finally {
  db.pragma('foreign_keys = ON')
}

db.exec(`CREATE TABLE IF NOT EXISTS template_jadwal (
  id TEXT PRIMARY KEY, nama TEXT NOT NULL, jenis TEXT DEFAULT 'reguler',
  maks_jtm INTEGER DEFAULT 15, keterangan TEXT, tenant_id TEXT DEFAULT 'default',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS beasiswa (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  siswa_id TEXT NOT NULL,
  program TEXT NOT NULL CHECK(length(trim(program)) BETWEEN 1 AND 120),
  nominal REAL NOT NULL CHECK(nominal > 0),
  status TEXT NOT NULL DEFAULT 'aktif' CHECK(status IN ('aktif','selesai','dibatalkan')),
  tanggal_mulai TEXT NOT NULL,
  tanggal_selesai TEXT,
  catatan TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (siswa_id) REFERENCES siswa(id)
);
CREATE INDEX IF NOT EXISTS idx_beasiswa_tenant ON beasiswa(tenant_id);
CREATE INDEX IF NOT EXISTS idx_beasiswa_tenant_siswa ON beasiswa(tenant_id,siswa_id);
CREATE TABLE IF NOT EXISTS keuangan_akun (id TEXT PRIMARY KEY, nama TEXT NOT NULL, saldo_awal REAL DEFAULT 0, tenant_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS keuangan_kategori (id TEXT PRIMARY KEY, nama TEXT NOT NULL, tipe TEXT NOT NULL CHECK(tipe IN ('masuk','keluar')), tenant_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS keuangan_transaksi (id TEXT PRIMARY KEY, tanggal TEXT NOT NULL, akun_id TEXT NOT NULL, kategori_id TEXT NOT NULL, tipe TEXT NOT NULL CHECK(tipe IN ('masuk','keluar')), nominal REAL NOT NULL CHECK(nominal>0), keterangan TEXT, bukti TEXT, tenant_id TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS peminatan_jenis (id TEXT PRIMARY KEY, nama TEXT NOT NULL, slug TEXT NOT NULL, aktif INTEGER NOT NULL DEFAULT 1 CHECK(aktif IN (0,1)), tenant_id TEXT NOT NULL, UNIQUE(tenant_id,slug));
CREATE TABLE IF NOT EXISTS tahfidz_kelompok (id TEXT PRIMARY KEY, nama TEXT NOT NULL, pembimbing_id TEXT, tenant_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tahfidz_peserta (kelompok_id TEXT NOT NULL, siswa_id TEXT NOT NULL, tenant_id TEXT NOT NULL, PRIMARY KEY(kelompok_id,siswa_id,tenant_id));
CREATE TABLE IF NOT EXISTS tahfidz_pertemuan (id TEXT PRIMARY KEY, kelompok_id TEXT NOT NULL, tanggal TEXT NOT NULL, materi TEXT, tenant_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tahfidz_absensi (pertemuan_id TEXT NOT NULL, siswa_id TEXT NOT NULL, status TEXT NOT NULL, catatan TEXT, tenant_id TEXT NOT NULL, PRIMARY KEY(pertemuan_id,siswa_id,tenant_id));
CREATE TABLE IF NOT EXISTS rombel_jam_pulang (rombel_id TEXT NOT NULL, hari TEXT NOT NULL, jam_pulang TEXT NOT NULL, tenant_id TEXT NOT NULL, PRIMARY KEY(rombel_id,hari,tenant_id));
CREATE INDEX IF NOT EXISTS idx_keuangan_tenant_tanggal ON keuangan_transaksi(tenant_id,tanggal);
CREATE INDEX IF NOT EXISTS idx_tahfidz_peserta_tenant ON tahfidz_peserta(tenant_id);`)
try { db.exec('ALTER TABLE tahfidz_kelompok ADD COLUMN jenis_id TEXT') } catch(e) { if(!String(e.message).includes('duplicate column')) throw e }
db.transaction(()=>{for(const {tenant_id} of db.prepare('SELECT DISTINCT tenant_id FROM tahfidz_kelompok WHERE jenis_id IS NULL').all()){let j=db.prepare("SELECT id FROM peminatan_jenis WHERE tenant_id=? AND slug='tahfidz'").get(tenant_id);if(!j){j={id:uuidv4()};db.prepare("INSERT INTO peminatan_jenis(id,nama,slug,tenant_id) VALUES(?,'Tahfidz','tahfidz',?)").run(j.id,tenant_id)}db.prepare('UPDATE tahfidz_kelompok SET jenis_id=? WHERE tenant_id=? AND jenis_id IS NULL').run(j.id,tenant_id)}})()
// Backfill legacy global rows -> 'default' tenant
try { db.prepare("UPDATE wa_gateway_config SET tenant_id='default' WHERE tenant_id IS NULL OR tenant_id=''").run() } catch {}
try { db.prepare("UPDATE broadcast_log SET tenant_id='default' WHERE tenant_id IS NULL OR tenant_id=''").run() } catch {}
try { db.exec('ALTER TABLE rombel_jam_pulang ADD COLUMN aktif INTEGER NOT NULL DEFAULT 1 CHECK (aktif IN (0,1))') } catch (e) { if (!String(e.message).includes('duplicate column')) throw e }
try { db.prepare("UPDATE broadcast_detail SET tenant_id='default' WHERE tenant_id IS NULL OR tenant_id=''").run() } catch {}

try {
  db.prepare(`UPDATE users SET siswa_id=(SELECT s.id FROM siswa s WHERE s.tenant_id=users.tenant_id AND s.nis=users.nis LIMIT 1)
    WHERE role='siswa' AND (siswa_id IS NULL OR siswa_id='') AND nis IS NOT NULL AND nis<>''`).run()
} catch {}

// Ensure a WA config row exists per tenant (lazy: create on demand in getWaConfig)

// Tenant detection middleware (API routes only)
app.use(tenantMiddleware(db))

function getTenantAccess(tenantId) {
  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(tenantId || 'default')
  return accessForTenant(tenant || { id: tenantId || 'default', plan: 'trial' })
}

function isSubscriptionBypass(req) {
  return req.path.startsWith('/api/auth') || req.path === '/api/health' || req.path === '/api/settings' || req.path === '/api/subscription/status' || req.path === '/api/subscription/unlock' || req.path === '/api/tenant/info' || req.path.startsWith('/api/tenants')
}

function enforceTenantAccess(req, res, next) {
  if (!req.path.startsWith('/api') || isSubscriptionBypass(req)) return next()
  const token = req.headers.authorization?.split(' ')[1]
  if (token) { try { const decoded = jwt.verify(token, JWT_SECRET); if (decoded.tenant_id) req.tenantId = decoded.tenant_id } catch {} }
  const access = getTenantAccess(req.tenantId)
  req.tenantAccess = access
  if (access.locked) return res.status(402).json({ error: 'Masa percobaan/langganan sudah berakhir. Masukkan kunci unlock untuk melanjutkan.', code: 'SUBSCRIPTION_LOCKED', subscription: access })
  const feature = featureForPath(req.path)
  if (feature && access.features[feature] === false) return res.status(403).json({ error: 'Fitur ini dinonaktifkan untuk lembaga ini', code: 'FEATURE_DISABLED', feature })
  next()
}

app.use(enforceTenantAccess)

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Token required' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    // Override tenantId from JWT if present (user's actual tenant)
    if (req.user.tenant_id) req.tenantId = req.user.tenant_id

    // Enforce wajib ganti password jika user masih punya flag must_change_password=1.
    // Boleh akses endpoint khusus tanpa harus ganti dulu:
    // - /api/auth/me              (cek sesi)
    // - /api/auth/change-password (proses ganti)
    // - /api/auth/logout          (logout)
    const allowList = ['/api/auth/me', '/api/auth/change-password', '/api/auth/logout', '/api/siswa/dashboard', '/api/siswa/portal', '/api/siswa/absensi', '/api/siswa/ekskul', '/api/siswa/penilaian', '/api/siswa/tugas', '/api/settings']
    if (!allowList.includes(req.path) && !req.path.startsWith('/api/siswa/') && !req.path.startsWith('/api/settings')) {
      try {
        const row = db.prepare('SELECT must_change_password FROM users WHERE id = ?').get(req.user.id)
        if (row && row.must_change_password === 1) {
          return res.status(403).json({
            error: 'Wajib ganti password sebelum melanjutkan',
            code: 'MUST_CHANGE_PASSWORD',
          })
        }
      } catch {}
    }
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
const STAFF = requireRole('admin', 'super_admin', 'guru', 'wali_kelas', 'operator', 'tata_usaha', 'tu', 'kepala')
const TEACHER = requireRole('guru', 'wali_kelas')
const JOURNAL_REVIEWER = requireRole('admin', 'super_admin', 'kepala', 'operator')
const BENDAHARA = requireRole('bendahara', 'admin', 'super_admin', 'operator')
const DASHBOARD_ROLES = requireRole('admin', 'super_admin', 'kepala', 'operator', 'bendahara', 'tata_usaha', 'tu')

app.get('/api/subscription/status', authMiddleware, (req, res) => {
  const tenantId = req.user.role === 'super_admin' && req.query.tenant_id ? String(req.query.tenant_id) : req.tenantId
  const tenant = db.prepare('SELECT id,nama,slug,plan,trial_ends_at,subscription_ends_at,features_json FROM tenants WHERE id=?').get(tenantId)
  if (!tenant) return res.status(404).json({ error: 'Lembaga tidak ditemukan' })
  res.json({ ...accessForTenant(tenant), tenant_id: tenant.id, tenant_name: tenant.nama, prices: { lite: 50000, pro: 80000 }, feature_keys: FEATURE_KEYS })
})

app.put('/api/subscription/features', ADMIN, (req, res) => {
  if (req.user.role === 'super_admin' && req.body.tenant_id && req.body.tenant_id !== req.tenantId) return res.status(400).json({ error: 'Gunakan domain lembaga untuk mengatur fitur tenant' })
  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(req.tenantId)
  if (!tenant) return res.status(404).json({ error: 'Lembaga tidak ditemukan' })
  const features = normalizeFeatureSelection(req.body.features, ['lite','pro'].includes(tenant.plan) ? tenant.plan : 'trial')
  db.prepare('UPDATE tenants SET features_json=? WHERE id=?').run(JSON.stringify(features), tenant.id)
  res.json({ success: true, ...accessForTenant({ ...tenant, features_json: JSON.stringify(features) }) })
})

app.post('/api/subscription/unlock', ADMIN, (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase()
  if (!code) return res.status(400).json({ error: 'Kunci unlock wajib diisi' })
  const key = db.prepare('SELECT * FROM subscription_unlock_keys WHERE code_hash=?').get(hashUnlockCode(code))
  if (!key || key.used_at) return res.status(400).json({ error: 'Kunci unlock tidak valid atau sudah digunakan' })
  if (key.tenant_id !== req.tenantId) return res.status(403).json({ error: 'Kunci ini bukan untuk lembaga Anda' })
  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(req.tenantId)
  const currentEnd = tenant.subscription_ends_at && new Date(tenant.subscription_ends_at) > new Date() ? tenant.subscription_ends_at : new Date().toISOString()
  const newEnd = addMonthsIso(currentEnd, key.months)
  const apply = db.transaction(() => {
    const features = normalizeFeatureSelection(JSON.parse(tenant.features_json || '{}'), key.plan)
    db.prepare('UPDATE tenants SET plan=?,subscription_ends_at=?,features_json=?,expired_at=NULL,aktif=1 WHERE id=?').run(key.plan, newEnd, JSON.stringify(features), tenant.id)
    db.prepare("UPDATE subscription_unlock_keys SET used_at=datetime('now'),used_by=? WHERE id=? AND used_at IS NULL").run(req.user.id, key.id)
  })
  apply()
  res.json({ success: true, ...getTenantAccess(req.tenantId) })
})

app.post('/api/tenants/:id/unlock-keys', SUPER, (req, res) => {
  const plan = String(req.body.plan || '')
  const months = Number(req.body.months || 1)
  if (!['lite','pro'].includes(plan) || !Number.isInteger(months) || months < 1 || months > 24) return res.status(400).json({ error: 'Paket atau durasi tidak valid' })
  if (!db.prepare('SELECT 1 FROM tenants WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Lembaga tidak ditemukan' })
  let code, hash
  do { code = generateUnlockCode(); hash = hashUnlockCode(code) } while (db.prepare('SELECT 1 FROM subscription_unlock_keys WHERE code_hash=?').get(hash))
  db.prepare('INSERT INTO subscription_unlock_keys(id,code_hash,tenant_id,plan,months,created_by) VALUES(?,?,?,?,?,?)').run(uuidv4(), hash, req.params.id, plan, months, req.user.id)
  res.status(201).json({ code, plan, months, tenant_id: req.params.id, note: 'Kunci hanya ditampilkan sekali. Simpan dan kirim kepada admin lembaga.' })
})

const backupUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } })
registerBackupRestoreRoutes(app, db, { ADMIN, upload: backupUpload, dbPath: path.join(__dirname, 'jurnalku.db') })
registerFinanceExcelRoutes(app, db, { authorize: requireRole('bendahara', 'admin', 'super_admin', 'operator'), upload: multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }) })
registerPortalRoutes(app, db, { auth: authMiddleware, requireRole, uuid: uuidv4, bcrypt })
registerKantinRoutes(app, db, { requireRole, uuid: uuidv4, bcrypt })
registerBackupRoutes(app, db, { requireRole, uuid: uuidv4 })
const BEASISWA_ROLES = requireRole('admin', 'super_admin', 'bendahara')
const BEASISWA_SELECT = `SELECT b.*, s.nama siswa_nama, s.nis siswa_nis
  FROM beasiswa b JOIN siswa s ON s.id=b.siswa_id AND s.tenant_id=b.tenant_id`
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z'))
function validateBeasiswa(body) {
  const nominal = Number(body.nominal)
  if (!isStr(body.siswa_id, 1, 100)) return 'Siswa wajib dipilih'
  if (!isStr(body.program, 1, 120)) return 'Program wajib diisi, maksimal 120 karakter'
  if (!Number.isFinite(nominal) || nominal <= 0) return 'Nominal harus lebih dari 0'
  if (!['aktif', 'selesai', 'dibatalkan'].includes(body.status)) return 'Status tidak valid'
  if (!validDate(body.tanggal_mulai) || (body.tanggal_selesai && !validDate(body.tanggal_selesai))) return 'Tanggal tidak valid'
  if (body.tanggal_selesai && body.tanggal_mulai > body.tanggal_selesai) return 'Tanggal mulai tidak boleh setelah tanggal selesai'
  if (body.catatan != null && (typeof body.catatan !== 'string' || body.catatan.length > 1000)) return 'Catatan maksimal 1000 karakter'
  return null
}
function beasiswaValues(body) {
  return [body.siswa_id.trim(), body.program.trim(), Number(body.nominal), body.status, body.tanggal_mulai, body.tanggal_selesai || null, (body.catatan || '').trim()]
}
app.get('/api/beasiswa', BEASISWA_ROLES, (req, res) => {
  res.json(db.prepare(BEASISWA_SELECT + ' WHERE b.tenant_id=? ORDER BY b.tanggal_mulai DESC, b.created_at DESC').all(req.tenantId))
})
app.post('/api/beasiswa', BEASISWA_ROLES, (req, res) => {
  const error = validateBeasiswa(req.body || {})
  if (error) return res.status(400).json({ error })
  if (!db.prepare('SELECT 1 FROM siswa WHERE id=? AND tenant_id=?').get(req.body.siswa_id, req.tenantId)) return res.status(404).json({ error: 'Siswa tidak ditemukan' })
  const id = uuidv4()
  db.prepare('INSERT INTO beasiswa(id,siswa_id,program,nominal,status,tanggal_mulai,tanggal_selesai,catatan,tenant_id) VALUES(?,?,?,?,?,?,?,?,?)').run(id, ...beasiswaValues(req.body), req.tenantId)
  res.status(201).json(db.prepare(BEASISWA_SELECT + ' WHERE b.id=? AND b.tenant_id=?').get(id, req.tenantId))
})
app.put('/api/beasiswa/:id', BEASISWA_ROLES, (req, res) => {
  const error = validateBeasiswa(req.body || {})
  if (error) return res.status(400).json({ error })
  if (!db.prepare('SELECT 1 FROM beasiswa WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)) return res.status(404).json({ error: 'Beasiswa tidak ditemukan' })
  if (!db.prepare('SELECT 1 FROM siswa WHERE id=? AND tenant_id=?').get(req.body.siswa_id, req.tenantId)) return res.status(404).json({ error: 'Siswa tidak ditemukan' })
  db.prepare("UPDATE beasiswa SET siswa_id=?,program=?,nominal=?,status=?,tanggal_mulai=?,tanggal_selesai=?,catatan=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?").run(...beasiswaValues(req.body), req.params.id, req.tenantId)
  res.json(db.prepare(BEASISWA_SELECT + ' WHERE b.id=? AND b.tenant_id=?').get(req.params.id, req.tenantId))
})
app.delete('/api/beasiswa/:id', BEASISWA_ROLES, (req, res) => {
  const info = db.prepare('DELETE FROM beasiswa WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
  if (!info.changes) return res.status(404).json({ error: 'Beasiswa tidak ditemukan' })
  res.json({ success: true })
})

app.get('/api/bendahara/dashboard', BENDAHARA, (req,res) => {
  const tid=req.tenantId
  const tagihan_belum=db.prepare("SELECT count(*) jumlah,coalesce(sum(nominal),0) nominal FROM tagihan WHERE tenant_id=? AND status='belum_bayar'").get(tid)
  const lunas_bulan_ini=db.prepare("SELECT count(*) jumlah,coalesce(sum(nominal),0) nominal FROM tagihan WHERE tenant_id=? AND status='lunas' AND strftime('%Y-%m',tanggal_bayar)=strftime('%Y-%m','now')").get(tid)
  const saldo_tabungan=db.prepare("SELECT coalesce(sum(CASE WHEN tipe='setor' THEN nominal ELSE -nominal END),0) saldo FROM tabungan WHERE tenant_id=?").get(tid).saldo
  const siswa_aktif=db.prepare("SELECT count(*) jumlah FROM siswa WHERE tenant_id=? AND coalesce(status,'aktif')='aktif'").get(tid).jumlah
  res.json({tagihan_belum,lunas_bulan_ini,saldo_tabungan,siswa_aktif})
})

app.get('/api/health', (_req, res) => {
  try {
    db.prepare('SELECT 1').get()
    res.json({ ok: true, service: 'jurnalku', database: 'ok', uptime: Math.floor(process.uptime()) })
  } catch {
    res.status(503).json({ ok: false, service: 'jurnalku', database: 'error' })
  }
})

// ============================================================================
// REST API untuk kolaborasi web app eksternal (External API Integration)
// ============================================================================

// API Key middleware for external apps
const API_KEYS = new Map()
function generateApiKey() {
  return 'jrnl_' + crypto.randomBytes(24).toString('hex')
}

function apiKeyMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key
  if (!apiKey) return res.status(401).json({ error: 'API Key required' })
  let keyData = API_KEYS.get(apiKey)
  if (!keyData) {
    const row = db.prepare('SELECT * FROM external_api_keys WHERE api_key = ?').get(apiKey)
    if (row) {
      keyData = { ...row, permissions: JSON.parse(row.permissions || '[]'), enabled: !!row.enabled }
      API_KEYS.set(apiKey, keyData)
    }
  }
  if (!keyData) return res.status(403).json({ error: 'Invalid API Key' })
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) return res.status(403).json({ error: 'API Key expired' })
  if (!keyData.enabled) return res.status(403).json({ error: 'API Key disabled' })
  db.prepare('UPDATE external_api_keys SET last_used_at=CURRENT_TIMESTAMP, usage_count=usage_count+1 WHERE api_key=?').run(apiKey)
  req.apiKey = keyData
  req.tenantId = keyData.tenant_id
  next()
}

// Create API Key (admin only)
app.post('/api/external/api-keys', ADMIN, (req, res) => {
  const { name, expires_in_days = 365, permissions = ['read'] } = req.body
  if (!name) return res.status(400).json({ error: 'Nama API Key wajib diisi' })
  
  const apiKey = generateApiKey()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + Number(expires_in_days))
  
  const keyData = {
    id: uuidv4(),
    name,
    api_key: apiKey,
    tenant_id: req.tenantId,
    permissions: Array.isArray(permissions) ? permissions : ['read'],
    enabled: true,
    created_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
    last_used_at: null,
    usage_count: 0
  }
  
  // Store in memory and persist to DB
  API_KEYS.set(apiKey, keyData)
  
  db.prepare('CREATE TABLE IF NOT EXISTS external_api_keys (id TEXT PRIMARY KEY, name TEXT, api_key TEXT UNIQUE, tenant_id TEXT, permissions TEXT, enabled INTEGER DEFAULT 1, created_at TEXT, expires_at TEXT, last_used_at TEXT, usage_count INTEGER DEFAULT 0)').run()
  db.prepare('INSERT INTO external_api_keys (id, name, api_key, tenant_id, permissions, enabled, created_at, expires_at, last_used_at, usage_count) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(keyData.id, keyData.name, keyData.api_key, keyData.tenant_id, JSON.stringify(keyData.permissions), keyData.enabled ? 1 : 0, keyData.created_at, keyData.expires_at, keyData.last_used_at, keyData.usage_count)
  
  res.json({ 
    success: true, 
    api_key: apiKey, // Only shown once!
    key_info: { ...keyData, api_key: '***' }
  })
})

// List API Keys (admin only)
app.get('/api/external/api-keys', ADMIN, (req, res) => {
  const keys = db.prepare('SELECT id, name, tenant_id, permissions, enabled, created_at, expires_at, last_used_at, usage_count FROM external_api_keys WHERE tenant_id = ? ORDER BY created_at DESC').all(req.tenantId)
  res.json(keys.map(k => ({ ...k, permissions: JSON.parse(k.permissions || '[]') })))
})

// Revoke API Key (admin only)
app.delete('/api/external/api-keys/:id', ADMIN, (req, res) => {
  const key = db.prepare('SELECT api_key FROM external_api_keys WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId)
  if (!key) return res.status(404).json({ error: 'API Key tidak ditemukan' })
  API_KEYS.delete(key.api_key)
  db.prepare('DELETE FROM external_api_keys WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId)
  res.json({ success: true })
})

// ============================================================================
// Public REST API Endpoints (protected by API Key)
// ============================================================================

// Get tenant info (public endpoint with API key)
app.get('/api/external/v1/tenant/info', apiKeyMiddleware, (req, res) => {
  const tenant = db.prepare('SELECT id, slug, nama, email, telepon, alamat, domain_custom, domain_status, plan, trial_ends_at, subscription_ends_at FROM tenants WHERE id = ?').get(req.tenantId)
  if (!tenant) return res.status(404).json({ error: 'Tenant tidak ditemukan' })
  res.json({ tenant })
})

// Get siswa list with pagination
app.get('/api/external/v1/siswa', apiKeyMiddleware, (req, res) => {
  if (!req.apiKey.permissions.includes('read') && !req.apiKey.permissions.includes('siswa:read')) {
    return res.status(403).json({ error: 'Permission denied: siswa:read required' })
  }
  const { page = 1, limit = 50, search = '', rombel_id, status = 'aktif' } = req.query
  const offset = (Number(page) - 1) * Number(limit)
  
  let sql = 'SELECT s.id, s.nis, s.nisn, s.nama, s.jenis_kelamin, s.rombel_id, s.status, s.created_at, r.nama as rombel_nama FROM siswa s LEFT JOIN rombel r ON r.id = s.rombel_id AND r.tenant_id = s.tenant_id WHERE s.tenant_id = ? AND s.status = ?'
  const params = [req.tenantId, status]
  
  if (search) {
    sql += ' AND (s.nama LIKE ? OR s.nis LIKE ? OR s.nisn LIKE ?)'
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  if (rombel_id) {
    sql += ' AND s.rombel_id = ?'
    params.push(rombel_id)
  }
  
  sql += ' ORDER BY s.nama LIMIT ? OFFSET ?'
  params.push(Number(limit), offset)
  
  const data = db.prepare(sql).all(...params)
  const total = db.prepare(sql.replace('SELECT s.id, s.nis, s.nisn, s.nama, s.jenis_kelamin, s.rombel_id, s.status, s.created_at, r.nama as rombel_nama', 'SELECT COUNT(*) as count').split('ORDER BY')[0]).get(...params.slice(0, -2)).count
  
  res.json({ data, pagination: { page: Number(page), limit: Number(limit), total, total_pages: Math.ceil(total / Number(limit)) } })
})

// Get siswa by ID
app.get('/api/external/v1/siswa/:id', apiKeyMiddleware, (req, res) => {
  if (!req.apiKey.permissions.includes('read') && !req.apiKey.permissions.includes('siswa:read')) {
    return res.status(403).json({ error: 'Permission denied: siswa:read required' })
  }
  const siswa = db.prepare('SELECT s.*, r.nama as rombel_nama, r.tingkat FROM siswa s LEFT JOIN rombel r ON r.id = s.rombel_id AND r.tenant_id = s.tenant_id WHERE s.id = ? AND s.tenant_id = ?').get(req.params.id, req.tenantId)
  if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan' })
  res.json({ siswa })
})

// Get guru/GTK list
app.get('/api/external/v1/gtk', apiKeyMiddleware, (req, res) => {
  if (!req.apiKey.permissions.includes('read') && !req.apiKey.permissions.includes('gtk:read')) {
    return res.status(403).json({ error: 'Permission denied: gtk:read required' })
  }
  const { page = 1, limit = 50, search = '' } = req.query
  const offset = (Number(page) - 1) * Number(limit)
  
  let sql = 'SELECT g.*, u.email, u.role as user_role FROM gtk g LEFT JOIN users u ON u.gtk_id = g.id AND u.tenant_id = g.tenant_id WHERE g.tenant_id = ? AND g.status_kepegawaian = \'Tetap\''
  const params = [req.tenantId]
  
  if (search) {
    sql += ' AND (g.nama LIKE ? OR g.kode_guru LIKE ? OR g.nip LIKE ?)'
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  
  sql += ' ORDER BY g.nama LIMIT ? OFFSET ?'
  params.push(Number(limit), offset)
  
  const data = db.prepare(sql).all(...params)
  res.json({ data })
})

// Get absensi (attendance)
app.get('/api/external/v1/absensi', apiKeyMiddleware, (req, res) => {
  if (!req.apiKey.permissions.includes('read') && !req.apiKey.permissions.includes('absensi:read')) {
    return res.status(403).json({ error: 'Permission denied: absensi:read required' })
  }
  const { tanggal, rombel_id, siswa_id, page = 1, limit = 100 } = req.query
  const offset = (Number(page) - 1) * Number(limit)
  
  let sql = 'SELECT a.*, s.nis, s.nama as siswa_nama, r.nama as rombel_nama FROM absensi_siswa a JOIN siswa s ON s.id = a.siswa_id AND s.tenant_id = a.tenant_id LEFT JOIN rombel r ON r.id = s.rombel_id AND r.tenant_id = s.tenant_id WHERE a.tenant_id = ?'
  const params = [req.tenantId]
  
  if (tanggal) { sql += ' AND a.tanggal = ?'; params.push(tanggal) }
  if (rombel_id) { sql += ' AND s.rombel_id = ?'; params.push(rombel_id) }
  if (siswa_id) { sql += ' AND a.siswa_id = ?'; params.push(siswa_id) }
  
  sql += ' ORDER BY a.tanggal DESC, a.waktu_absen DESC LIMIT ? OFFSET ?'
  params.push(Number(limit), offset)
  
  const data = db.prepare(sql).all(...params)
  res.json({ data })
})

// Get nilai (grades)
app.get('/api/external/v1/nilai', apiKeyMiddleware, (req, res) => {
  if (!req.apiKey.permissions.includes('read') && !req.apiKey.permissions.includes('nilai:read')) {
    return res.status(403).json({ error: 'Permission denied: nilai:read required' })
  }
  const { siswa_id, mapel_id, rombel_id, semester, tahun_ajaran, page = 1, limit = 100 } = req.query
  const offset = (Number(page) - 1) * Number(limit)
  
  let sql = 'SELECT n.*, s.nis, s.nama as siswa_nama, m.nama as mapel_nama, g.nama as guru_nama FROM nilai n JOIN siswa s ON s.id = n.siswa_id AND s.tenant_id = n.tenant_id JOIN mapel m ON m.id = n.mapel_id AND m.tenant_id = n.tenant_id LEFT JOIN gtk g ON g.id = n.gtk_id AND g.tenant_id = n.tenant_id WHERE n.tenant_id = ?'
  const params = [req.tenantId]
  
  if (siswa_id) { sql += ' AND n.siswa_id = ?'; params.push(siswa_id) }
  if (mapel_id) { sql += ' AND n.mapel_id = ?'; params.push(mapel_id) }
  if (rombel_id) { sql += ' AND s.rombel_id = ?'; params.push(rombel_id) }
  if (semester) { sql += ' AND n.semester = ?'; params.push(semester) }
  if (tahun_ajaran) { sql += ' AND n.tahun_ajaran = ?'; params.push(tahun_ajaran) }
  
  sql += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?'
  params.push(Number(limit), offset)
  
  const data = db.prepare(sql).all(...params)
  res.json({ data })
})

// Get jadwal (schedule)
app.get('/api/external/v1/jadwal', apiKeyMiddleware, (req, res) => {
  if (!req.apiKey.permissions.includes('read') && !req.apiKey.permissions.includes('jadwal:read')) {
    return res.status(403).json({ error: 'Permission denied: jadwal:read required' })
  }
  const { rombel_id, guru_id, hari, semester, tahun_ajaran } = req.query
  
  let sql = 'SELECT j.*, m.nama as mapel_nama, g.nama as guru_nama, r.nama as rombel_nama FROM jadwal j JOIN mapel m ON m.id = j.mapel_id AND m.tenant_id = j.tenant_id LEFT JOIN gtk g ON g.id = j.gtk_id AND g.tenant_id = j.tenant_id LEFT JOIN rombel r ON r.id = j.rombel_id AND r.tenant_id = j.tenant_id WHERE j.tenant_id = ?'
  const params = [req.tenantId]
  
  if (rombel_id) { sql += ' AND j.rombel_id = ?'; params.push(rombel_id) }
  if (guru_id) { sql += ' AND j.gtk_id = ?'; params.push(guru_id) }
  if (hari) { sql += ' AND lower(j.hari) = ?'; params.push(hari.toLowerCase()) }
  if (semester) { sql += ' AND j.semester = ?'; params.push(semester) }
  if (tahun_ajaran) { sql += ' AND j.tahun_ajaran = ?'; params.push(tahun_ajaran) }
  
  sql += ' ORDER BY j.hari, j.jam_mulai'
  
  const data = db.prepare(sql).all(...params)
  res.json({ data })
})

// Get rombel (classes)
app.get('/api/external/v1/rombel', apiKeyMiddleware, (req, res) => {
  if (!req.apiKey.permissions.includes('read') && !req.apiKey.permissions.includes('rombel:read')) {
    return res.status(403).json({ error: 'Permission denied: rombel:read required' })
  }
  const { tingkat, tahun_ajaran, wali_kelas_id } = req.query
  
  let sql = 'SELECT r.*, g.nama as wali_kelas_nama, g.kode_guru FROM rombel r LEFT JOIN gtk g ON g.id = r.wali_kelas_id AND g.tenant_id = r.tenant_id WHERE r.tenant_id = ?'
  const params = [req.tenantId]
  
  if (tingkat) { sql += ' AND r.tingkat = ?'; params.push(tingkat) }
  if (tahun_ajaran) { sql += ' AND r.tahun_ajaran = ?'; params.push(tahun_ajaran) }
  if (wali_kelas_id) { sql += ' AND r.wali_kelas_id = ?'; params.push(wali_kelas_id) }
  
  sql += ' ORDER BY r.tingkat, r.nama'
  
  const data = db.prepare(sql).all(...params)
  res.json({ data })
})

// Get mapel (subjects)
app.get('/api/external/v1/mapel', apiKeyMiddleware, (req, res) => {
  if (!req.apiKey.permissions.includes('read') && !req.apiKey.permissions.includes('mapel:read')) {
    return res.status(403).json({ error: 'Permission denied: mapel:read required' })
  }
  const { tingkat, semester, tahun_ajaran } = req.query
  
  let sql = 'SELECT * FROM mapel WHERE tenant_id = ? AND aktif = 1'
  const params = [req.tenantId]
  
  if (tingkat) { sql += ' AND tingkat = ?'; params.push(tingkat) }
  if (semester) { sql += ' AND semester = ?'; params.push(semester) }
  if (tahun_ajaran) { sql += ' AND tahun_ajaran = ?'; params.push(tahun_ajaran) }
  
  sql += ' ORDER BY nama'
  
  const data = db.prepare(sql).all(...params)
  res.json({ data })
})

// Get tagihan (billing)
app.get('/api/external/v1/tagihan', apiKeyMiddleware, (req, res) => {
  if (!req.apiKey.permissions.includes('read') && !req.apiKey.permissions.includes('tagihan:read')) {
    return res.status(403).json({ error: 'Permission denied: tagihan:read required' })
  }
  const { siswa_id, status, jenis, page = 1, limit = 50 } = req.query
  const offset = (Number(page) - 1) * Number(limit)
  
  let sql = 'SELECT t.*, s.nis, s.nama as siswa_nama FROM tagihan t JOIN siswa s ON s.id = t.siswa_id AND s.tenant_id = t.tenant_id WHERE t.tenant_id = ?'
  const params = [req.tenantId]
  
  if (siswa_id) { sql += ' AND t.siswa_id = ?'; params.push(siswa_id) }
  if (status) { sql += ' AND t.status = ?'; params.push(status) }
  if (jenis) { sql += ' AND t.jenis = ?'; params.push(jenis) }
  
  sql += ' ORDER BY t.tanggal_jatuh_tempo DESC LIMIT ? OFFSET ?'
  params.push(Number(limit), offset)
  
  const data = db.prepare(sql).all(...params)
  res.json({ data })
})

// Get pembayaran (payments)
app.get('/api/external/v1/pembayaran', apiKeyMiddleware, (req, res) => {
  if (!req.apiKey.permissions.includes('read') && !req.apiKey.permissions.includes('pembayaran:read')) {
    return res.status(403).json({ error: 'Permission denied: pembayaran:read required' })
  }
  const { siswa_id, tagihan_id, metode, tanggal_mulai, tanggal_selesai, page = 1, limit = 50 } = req.query
  const offset = (Number(page) - 1) * Number(limit)
  
  let sql = 'SELECT p.*, t.nomor as tagihan_nomor, t.jenis as tagihan_jenis, s.nis, s.nama as siswa_nama FROM pembayaran p JOIN tagihan t ON t.id = p.tagihan_id AND t.tenant_id = p.tenant_id JOIN siswa s ON s.id = t.siswa_id AND s.tenant_id = t.tenant_id WHERE p.tenant_id = ?'
  const params = [req.tenantId]
  
  if (siswa_id) { sql += ' AND t.siswa_id = ?'; params.push(siswa_id) }
  if (tagihan_id) { sql += ' AND p.tagihan_id = ?'; params.push(tagihan_id) }
  if (metode) { sql += ' AND p.metode = ?'; params.push(metode) }
  if (tanggal_mulai) { sql += ' AND p.tanggal >= ?'; params.push(tanggal_mulai) }
  if (tanggal_selesai) { sql += ' AND p.tanggal <= ?'; params.push(tanggal_selesai) }
  
  sql += ' ORDER BY p.tanggal DESC LIMIT ? OFFSET ?'
  params.push(Number(limit), offset)
  
  const data = db.prepare(sql).all(...params)
  res.json({ data })
})

// Cashless balance check
app.get('/api/external/v1/cashless/balance/:student_id', apiKeyMiddleware, (req, res) => {
  if (!req.apiKey.permissions.includes('read') && !req.apiKey.permissions.includes('cashless:read')) {
    return res.status(403).json({ error: 'Permission denied: cashless:read required' })
  }
  const student = db.prepare('SELECT id, nis, nama FROM siswa WHERE id = ? AND tenant_id = ?').get(req.params.student_id, req.tenantId)
  if (!student) return res.status(404).json({ error: 'Siswa tidak ditemukan' })
  
  const balance = db.prepare('SELECT COALESCE(SUM(amount),0) as saldo FROM cashless_ledger WHERE tenant_id = ? AND student_id = ?').get(req.tenantId, req.params.student_id).saldo
  
  res.json({ student_id: req.params.student_id, nis: student.nis, nama: student.nama, saldo: balance })
})

// Cashless transactions
app.get('/api/external/v1/cashless/transactions/:student_id', apiKeyMiddleware, (req, res) => {
  if (!req.apiKey.permissions.includes('read') && !req.apiKey.permissions.includes('cashless:read')) {
    return res.status(403).json({ error: 'Permission denied: cashless:read required' })
  }
  const { page = 1, limit = 50, kind } = req.query
  const offset = (Number(page) - 1) * Number(limit)
  
  let sql = 'SELECT * FROM cashless_ledger WHERE tenant_id = ? AND student_id = ?'
  const params = [req.tenantId, req.params.student_id]
  
  if (kind) { sql += ' AND kind = ?'; params.push(kind) }
  
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(Number(limit), offset)
  
  const data = db.prepare(sql).all(...params)
  res.json({ data })
})

// Webhook endpoints for external notifications
app.post('/api/external/webhook/cashless', apiKeyMiddleware, (req, res) => {
  if (!req.apiKey.permissions.includes('write') && !req.apiKey.permissions.includes('cashless:write')) {
    return res.status(403).json({ error: 'Permission denied: cashless:write required' })
  }
  // Validate webhook payload
  const { student_id, amount, kind, reference, idempotency_key } = req.body
  if (!student_id || !Number.isInteger(amount) || amount <= 0 || !kind || !['credit', 'debit'].includes(kind)) {
    return res.status(400).json({ error: 'Invalid payload: student_id, amount (integer > 0), kind (credit/debit) required' })
  }
  
  // Check idempotency
  if (idempotency_key) {
    const existing = db.prepare('SELECT id FROM cashless_ledger WHERE tenant_id = ? AND idempotency_key = ?').get(req.tenantId, idempotency_key)
    if (existing) return res.json({ success: true, duplicate: true, id: existing.id })
  }
  
  const id = uuidv4()
  const tx = {
    id,
    tenant_id: req.tenantId,
    student_id,
    amount: kind === 'debit' ? -amount : amount,
    kind,
    idempotency_key: idempotency_key || null,
    actor_id: req.apiKey.id,
    reference: reference || null,
    created_at: new Date().toISOString()
  }
  
  db.prepare('INSERT INTO cashless_ledger (id, tenant_id, student_id, amount, kind, idempotency_key, actor_id, reference, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(tx.id, tx.tenant_id, tx.student_id, tx.amount, tx.kind, tx.idempotency_key, tx.actor_id, tx.reference, tx.created_at)
  
  // Update API key usage
  db.prepare('UPDATE external_api_keys SET usage_count = usage_count + 1, last_used_at = ? WHERE api_key = ?').run(new Date().toISOString(), req.headers['x-api-key'])
  
  res.json({ success: true, transaction: tx })
})

// Load persisted API keys on startup
setTimeout(() => {
  try {
    const keys = db.prepare('SELECT * FROM external_api_keys WHERE enabled = 1').all()
    keys.forEach(k => {
      if (k.expires_at && new Date(k.expires_at) < new Date()) return
      API_KEYS.set(k.api_key, { ...k, permissions: JSON.parse(k.permissions || '[]') })
    })
    console.log('[External API] Loaded', API_KEYS.size, 'API keys')
  } catch (e) {
    console.log('[External API] No existing keys table:', e.message)
  }
}, 1000)

// Lightweight input validation at trust boundaries (no external lib).
const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 120
const isStr = (v, min = 1, max = 200) => typeof v === 'string' && v.trim().length >= min && v.length <= max
// Returns error string or null
function vLogin({ email, password }) {
  if (!isStr(email, 1, 120)) return 'Email/kode guru/NIS/NISN wajib diisi'
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
// Resolve baris GTK milik user login. Prioritas: gtk_id (link kuat) -> nip -> kode_guru -> email.
// Semua scoped tenant. Dipakai ceklok, absensi-saya, dashboard, wali-kelas.
function resolveGtkForUser(userId, tenantId) {
  if (!tenantId) return null
  const u = db.prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?').get(userId, tenantId)
  if (!u) return null
  const tid = tenantId
  let gtk = null
  if (u.gtk_id) gtk = db.prepare('SELECT * FROM gtk WHERE id = ? AND tenant_id = ?').get(u.gtk_id, tid)
  if (!gtk && u.nip) gtk = db.prepare('SELECT * FROM gtk WHERE nip = ? AND tenant_id = ?').get(u.nip, tid)
  if (!gtk && u.kode_guru) gtk = db.prepare("SELECT * FROM gtk WHERE kode_guru = ? AND kode_guru != '' AND tenant_id = ?").get(u.kode_guru, tid)
  if (!gtk && u.email) gtk = db.prepare("SELECT * FROM gtk WHERE email = ? AND email != '' AND tenant_id = ?").get(u.email, tid)
  // Simpan juga hasil fallback saat gtk_id lama menunjuk GTK tenant lain / sudah tidak valid.
  if (gtk && u.gtk_id !== gtk.id) { try { db.prepare('UPDATE users SET gtk_id = ? WHERE id = ? AND tenant_id = ?').run(gtk.id, u.id, tid) } catch {} }
  // Auto-create GTK on-demand utk staf (admin/operator/TU/kepala) yg belum punya GTK -> agar bisa ceklok.
  if (!gtk && ['admin', 'operator', 'tata_usaha', 'tu', 'kepala'].includes(u.role)) {
    try {
      const gid = require('crypto').randomUUID()
      const nama = u.nama || ('Staf ' + ((u.email || '').split('@')[0] || ''))
      const jabatan = u.role === 'kepala' ? 'Kepala' : (u.role === 'operator' ? 'Operator' : (['tu', 'tata_usaha'].includes(u.role) ? 'Tata Usaha' : 'Admin'))
      db.prepare("INSERT INTO gtk (id, nama, jenis_kelamin, email, jabatan, status_kepegawaian, kode_guru, tenant_id) VALUES (?, ?, 'L', ?, ?, 'Tetap', '', ?)")
        .run(gid, nama, u.email || '', jabatan, tid)
      db.prepare('UPDATE users SET gtk_id = ? WHERE id = ? AND tenant_id = ?').run(gid, u.id, tid)
      gtk = db.prepare('SELECT * FROM gtk WHERE id = ? AND tenant_id = ?').get(gid, tid)
    } catch {}
  }
  return gtk
}


const DEMO_HOSTS = new Set(['jurnal.cc.cd', 'jurnalmadrasah.web.id'])
app.post('/api/auth/demo', (req, res) => {
  const demoHost = String(req.hostname || '').toLowerCase()
  if (!DEMO_HOSTS.has(demoHost)) return res.status(404).json({ error: 'Not found' })
  const role = String(req.body?.role || 'admin')
  const allowed = ['admin','kepala','guru','wali_kelas','bendahara','siswa']
  if (!allowed.includes(role)) return res.status(400).json({ error: 'Role demo tidak tersedia' })
  const demoTenant = () => {
    let t = db.prepare('SELECT id FROM tenants WHERE slug=? OR id=? LIMIT 1').get('demo','default')
    if (t) return t.id
    const id = 'default'
    db.prepare('INSERT INTO tenants (id, slug, nama, email) VALUES (?,?,?,?)').run(id, 'demo', 'Demo Jurnal Madrasah', 'demo@jurnalmadrasah.web.id')
    try { db.prepare('INSERT INTO settings (id, nama_lembaga, tenant_id) VALUES (?,?,?)').run('main_default', 'Demo Jurnal Madrasah', id) } catch {}
    return id
  }
  const makeDemo = (wantRole) => {
    const tenantId = demoTenant()
    const actualRole = wantRole === 'wali_kelas' ? 'guru' : wantRole
    let user = db.prepare('SELECT * FROM users WHERE tenant_id=? AND role=? ORDER BY created_at LIMIT 1').get(tenantId, actualRole)
    if (user) return user
    const id = uuidv4()
    const pass = bcrypt.hashSync(uuidv4(), 10)
    const nama = 'Demo ' + actualRole.replace('_',' ')
    const email = `demo-${actualRole}@jurnalmadrasah.web.id`
    let gtkId = null, siswaId = null, nis = null
    if (['guru','kepala','bendahara'].includes(actualRole)) {
      gtkId = uuidv4()
      try { db.prepare("INSERT INTO gtk (id,nama,jenis_kelamin,email,jabatan,status_kepegawaian,tenant_id) VALUES (?,?, 'L', ?, ?, 'Tetap', ?)").run(gtkId, nama, email, actualRole, tenantId) } catch { gtkId = null }
    }
    if (actualRole === 'siswa') {
      let rombel = db.prepare('SELECT id FROM rombel WHERE tenant_id=? LIMIT 1').get(tenantId)
      if (!rombel) { const rid = uuidv4(); db.prepare("INSERT INTO rombel (id,nama,tingkat,tahun_ajaran,kapasitas,tenant_id) VALUES (?,?,?,?,?,?)").run(rid,'Demo A','VII','2026/2027',36,tenantId); rombel = { id: rid } }
      siswaId = uuidv4(); nis = 'DEMO001'
      try { db.prepare("INSERT INTO siswa (id,nis,nisn,nama,jenis_kelamin,rombel_id,status,tenant_id) VALUES (?,?,?,?,?,?, 'aktif', ?)").run(siswaId, nis, 'DEMO001', nama, 'L', rombel.id, tenantId) } catch { const st = db.prepare('SELECT * FROM siswa WHERE tenant_id=? LIMIT 1').get(tenantId); siswaId = st?.id; nis = st?.nis }
    }
    db.prepare('INSERT INTO users (id,nama,email,password,role,tenant_id,gtk_id,siswa_id,nis,must_change_password) VALUES (?,?,?,?,?,?,?,?,?,0)').run(id,nama,email,pass,actualRole,tenantId,gtkId,siswaId,nis)
    return db.prepare('SELECT * FROM users WHERE id=?').get(id)
  }
  const tenantId = 'default'
  let user = db.prepare('SELECT * FROM users WHERE tenant_id=? AND role=? ORDER BY created_at LIMIT 1').get(tenantId, role)
  if (!user && role === 'wali_kelas') user = db.prepare("SELECT * FROM users WHERE tenant_id=? AND role='guru' ORDER BY created_at LIMIT 1").get(tenantId)
  if (!user) user = makeDemo(role)
  const token = jwt.sign({ id: user.id, email: user.email, nama: user.nama, role: user.role, tenant_id: user.tenant_id, gtk_id: user.gtk_id, siswa_id: user.siswa_id, nis: user.nis }, JWT_SECRET, { expiresIn: '8h' })
  res.json({ token, user: { id: user.id, email: user.email, nama: user.nama, role: user.role, tenant_id: user.tenant_id, avatar: user.avatar || null } })
})

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { email, password } = req.body
  const vErr = vLogin(req.body); if (vErr) return res.status(400).json({ error: vErr })
  let tenantId = req.tenantId || 'default'
  const ident = String(email).trim()
  const identLower = ident.toLowerCase()
  // 1) Email langsung (per tenant, lalu super_admin, lalu global email).
  let user = db.prepare('SELECT * FROM users WHERE lower(email) = ? AND tenant_id = ?').get(identLower, tenantId)
  if (!user) user = db.prepare("SELECT * FROM users WHERE lower(email) = ? AND role = 'super_admin'").get(identLower)
  if (!user) user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(identLower)
  // 2) Kode guru / NIP -> cari GTK di tenant, lalu user yang terhubung.
  if (!user) {
    const g = db.prepare("SELECT * FROM gtk WHERE tenant_id = ? AND ((kode_guru != '' AND lower(kode_guru) = ?) OR nip = ?)").get(tenantId, identLower, ident)
    if (g) {
      user = db.prepare('SELECT * FROM users WHERE gtk_id = ? AND tenant_id = ?').get(g.id, tenantId)
        || (g.nip ? db.prepare('SELECT * FROM users WHERE nip = ? AND tenant_id = ?').get(g.nip, tenantId) : null)
        || (g.email ? db.prepare('SELECT * FROM users WHERE lower(email) = ? AND tenant_id = ?').get(String(g.email).toLowerCase(), tenantId) : null)
    }
  }
  // 3) NIS / NISN siswa -> auto-provision user siswa jika belum ada.
  if (!user) {
    let siswa = db.prepare("SELECT * FROM siswa WHERE tenant_id = ? AND status = 'aktif' AND (nis = ? OR nisn = ?)").get(tenantId, ident, ident)
    if (!siswa) siswa = db.prepare("SELECT * FROM siswa WHERE status = 'aktif' AND (nis = ? OR nisn = ?) ORDER BY tenant_id LIMIT 1").get(ident, ident)
    if (siswa) { tenantId = siswa.tenant_id || tenantId; user = ensureStudentUser(siswa, tenantId) }
  }
  // 4) Fallback users.kode_guru / users.nip / users.nis langsung.
  if (!user) user = db.prepare("SELECT * FROM users WHERE tenant_id = ? AND ((kode_guru != '' AND lower(kode_guru) = ?) OR nip = ? OR nis = ?)").get(tenantId, identLower, ident, ident)
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Email/kode guru/NIS/NISN atau password salah' })
  }
  const token = jwt.sign({ id: user.id, role: user.role, nama: user.nama, email: user.email, tenant_id: user.tenant_id, gtk_id: user.gtk_id || null, siswa_id: user.siswa_id || null, nis: user.nis || null }, JWT_SECRET, { expiresIn: '24h' })
  res.json({ token, user: { id: user.id, nama: user.nama, email: user.email, role: user.role, nip: user.nip, nis: user.nis, siswa_id: user.siswa_id, gtk_id: user.gtk_id, avatar: user.avatar } })
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

  db.prepare("INSERT INTO tenants (id, slug, nama, email, domain_custom, domain_status, plan, trial_ends_at) VALUES (?,?,?,?,?,?,'trial',datetime('now','+1 month'))")
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
  const reqHost = (req.headers['host'] || req.headers['x-forwarded-host'] || '').split(':')[0]
  const subdomainBase = reqHost === 'jurnalmadrasah.web.id' || reqHost.endsWith('.jurnalmadrasah.web.id')
    ? 'jurnalmadrasah.web.id' : 'jurnal.cc.cd'
  const appUrl = domainVal
    ? `https://${domainVal}`
    : `https://${slug}.${subdomainBase}`
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
  // Reset flag must_change_password agar user berikutnya boleh pakai semua API.
  db.prepare('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?').run(hashedNew, req.user.id)
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
const ASSIGNABLE_ROLES = ['kepala', 'admin', 'bendahara', 'guru', 'wali_kelas', 'siswa', 'wali_murid']

app.get('/api/users', ADMIN, (req, res) => {
  const rows = db.prepare('SELECT id, nama, email, role, nip, nis, avatar FROM users WHERE tenant_id = ? ORDER BY role, nama').all(req.tenantId)
  const links = db.prepare('SELECT student_id FROM user_students WHERE tenant_id=? AND user_id=? ORDER BY student_id')
  res.json(rows.map(row => ({ ...row, student_ids: links.all(req.tenantId, row.id).map(x => x.student_id) })))
})

function validStudentLinks(tenantId, role, value) {
  const student_ids = Array.isArray(value) ? [...new Set(value.filter(x => typeof x === 'string' && x))] : []
  if (role === 'siswa' && student_ids.length !== 1) throw Error('Akun siswa wajib tertaut tepat satu siswa aktif')
  if (role === 'wali_murid' && student_ids.length < 1) throw Error('Akun wali murid wajib tertaut minimal satu siswa aktif')
  if (!['siswa', 'wali_murid'].includes(role)) return []
  const found = db.prepare(`SELECT id FROM siswa WHERE tenant_id=? AND status='aktif' AND id IN (${student_ids.map(() => '?').join(',')})`).all(tenantId, ...student_ids)
  if (found.length !== student_ids.length) throw Error('Siswa tidak aktif atau bukan milik lembaga')
  return student_ids
}

const replaceUserLinks = db.transaction((tenantId, userId, student_ids) => {
  db.prepare('DELETE FROM user_students WHERE tenant_id=? AND user_id=?').run(tenantId, userId)
  const insert = db.prepare('INSERT INTO user_students(tenant_id,user_id,student_id) VALUES(?,?,?)')
  student_ids.forEach(studentId => insert.run(tenantId, userId, studentId))
})

app.post('/api/users', ADMIN, (req, res) => {
  const { nama, email, password, role, student_ids = [] } = req.body
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama wajib diisi' })
  if (!isEmail(email)) return res.status(400).json({ error: 'Email tidak valid' })
  if (!isStr(password, 6, 100)) return res.status(400).json({ error: 'Password minimal 6 karakter' })
  if (!ASSIGNABLE_ROLES.includes(role)) return res.status(400).json({ error: 'Role tidak valid' })
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Email sudah terdaftar' })
  let links
  try { links = validStudentLinks(req.tenantId, role, student_ids) } catch (e) { return res.status(400).json({ error: e.message }) }
  const id = uuidv4()
  db.transaction(() => {
    db.prepare('INSERT INTO users (id, nama, email, password, role, tenant_id) VALUES (?,?,?,?,?,?)')
      .run(id, nama.trim(), email.trim(), bcrypt.hashSync(password, 10), role, req.tenantId)
    replaceUserLinks(req.tenantId, id, links)
  })()
  // Auto-link GTK untuk semua role staf (guru, kepala, wali_kelas, bendahara, admin)
  const STAFF_ROLES = ['guru', 'wali_kelas', 'kepala', 'admin', 'bendahara', 'operator', 'tata_usaha', 'tu']
  if (STAFF_ROLES.includes(role)) {
    // 1. Cari GTK by nama persis
    let gtk = db.prepare('SELECT id FROM gtk WHERE lower(nama)=lower(?) AND tenant_id=?').get(nama.trim(), req.tenantId)
    // 2. Cari by email
    if (!gtk && email) gtk = db.prepare("SELECT id FROM gtk WHERE lower(email)=lower(?) AND email!='' AND tenant_id=?").get(email.trim(), req.tenantId)
    if (gtk) {
      db.prepare('UPDATE users SET gtk_id=? WHERE id=?').run(gtk.id, id)
      db.prepare("UPDATE gtk SET email=? WHERE id=? AND (email IS NULL OR email='')").run(email.trim(), gtk.id)
    } else if (['admin', 'kepala', 'operator', 'tata_usaha', 'tu'].includes(role)) {
      // Buat GTK baru untuk staf non-guru jika belum ada
      const gtkId = uuidv4()
      const jabatan = role === 'kepala' ? 'Kepala' : role === 'admin' ? 'Admin' : 'Operator'
      db.prepare("INSERT INTO gtk (id, nama, jabatan, email, jenis_kelamin, status_kepegawaian, tenant_id) VALUES (?,?,?,?,'L','Tetap',?)").run(gtkId, nama.trim(), jabatan, email.trim(), req.tenantId)
      db.prepare('UPDATE users SET gtk_id=? WHERE id=?').run(gtkId, id)
    }
    // else: guru tidak ada di data GTK → biarkan, admin harus tambah dari Data GTK dulu
  }
  res.json({ id, nama, email, role })
})

app.put('/api/users/:id', ADMIN, (req, res) => {
  const { nama, email, role, password, student_ids } = req.body
  const target = db.prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId)
  if (!target) return res.status(404).json({ error: 'User tidak ditemukan' })
  if (target.role === 'super_admin') return res.status(403).json({ error: 'Tidak bisa mengubah superadmin' })
  if (role && !ASSIGNABLE_ROLES.includes(role)) return res.status(400).json({ error: 'Role tidak valid' })
  const finalRole = role || target.role
  let links
  try { links = validStudentLinks(req.tenantId, finalRole, student_ids === undefined ? db.prepare('SELECT student_id FROM user_students WHERE tenant_id=? AND user_id=?').all(req.tenantId, req.params.id).map(x => x.student_id) : student_ids) } catch (e) { return res.status(400).json({ error: e.message }) }
  if (password && !isStr(password, 6, 100)) return res.status(400).json({ error: 'Password minimal 6 karakter' })
  db.transaction(() => {
    db.prepare('UPDATE users SET nama = COALESCE(?, nama), email = COALESCE(?, email), role = COALESCE(?, role) WHERE id = ? AND tenant_id = ?')
      .run(nama || null, email || null, role || null, req.params.id, req.tenantId)
    if (password) db.prepare('UPDATE users SET password = ? WHERE id = ? AND tenant_id=?').run(bcrypt.hashSync(password, 10), req.params.id, req.tenantId)
    replaceUserLinks(req.tenantId, req.params.id, links)
  })()
  // Auto-link GTK saat update user
  const finalNama = nama || target.nama
  const finalEmail = email || target.email
  const finalRole2 = role || target.role
  const STAFF_ROLES2 = ['guru', 'wali_kelas', 'kepala', 'admin', 'bendahara', 'operator', 'tata_usaha', 'tu']
  if (STAFF_ROLES2.includes(finalRole2) && !target.gtk_id) {
    let gtk2 = db.prepare('SELECT id FROM gtk WHERE lower(nama)=lower(?) AND tenant_id=?').get(finalNama, req.tenantId)
    if (!gtk2 && finalEmail) gtk2 = db.prepare("SELECT id FROM gtk WHERE lower(email)=lower(?) AND email!='' AND tenant_id=?").get(finalEmail, req.tenantId)
    if (gtk2) {
      db.prepare('UPDATE users SET gtk_id=? WHERE id=? AND tenant_id=?').run(gtk2.id, req.params.id, req.tenantId)
      db.prepare("UPDATE gtk SET email=? WHERE id=? AND (email IS NULL OR email='')").run(finalEmail, gtk2.id)
    }
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
  const insert = db.prepare('INSERT INTO users (id, nama, email, password, role, nip, gtk_id, kode_guru, tenant_id) VALUES (?,?,?,?,?,?,?,?,?)')
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
      insert.run(id, g.nama, email, bcrypt.hashSync(pwd, 10), role, g.nip || null, g.id, g.kode_guru || '', req.tenantId)
      created.push({ id, nama: g.nama, email, kode_guru: g.kode_guru || '', password_default: (it.password ? undefined : pwd), role })
    }
  })
  tx()
  res.json({ dibuat: created.length, dilewati: skipped.length, created, skipped })
})

// ==================== SETTINGS ====================

const libraryFor = tenantId => db.prepare('SELECT name, description, drive_folder_url, enabled, visibility_roles FROM library_config WHERE tenant_id = ?').get(tenantId)

app.get('/api/library', authMiddleware, (req, res) => {
  const config = libraryFor(req.tenantId)
  if (!config?.enabled) return res.json(null)
  const visibility_roles = JSON.parse(config.visibility_roles)
  if (!visibility_roles.includes('all') && !visibility_roles.includes(req.user.role)) return res.status(403).json({ error: 'Perpustakaan tidak tersedia untuk role ini' })
  res.json({ ...config, enabled: true, visibility_roles })
})
app.get('/api/library/admin', ADMIN, (req, res) => {
  const config = libraryFor(req.tenantId)
  res.json(config ? { ...config, enabled: !!config.enabled, visibility_roles: JSON.parse(config.visibility_roles) } : null)
})
app.put('/api/library/admin', ADMIN, (req, res) => {
  const name = String(req.body.name || '').trim()
  const description = String(req.body.description || '').trim()
  const driveUrl = String(req.body.drive_folder_url || '').trim()
  if (!name || name.length > 120) return res.status(400).json({ error: 'Nama perpustakaan wajib diisi (maksimal 120 karakter)' })
  if (description.length > 1000) return res.status(400).json({ error: 'Deskripsi maksimal 1000 karakter' })
  if (!isDriveFolderUrl(driveUrl)) return res.status(400).json({ error: 'URL folder Google Drive tidak valid' })
  const allowedRoles = ['all','admin','super_admin','guru','siswa','wali_murid','kepala_madrasah','bendahara']
  const roles = [...new Set(Array.isArray(req.body.visibility_roles) ? req.body.visibility_roles : [])].filter(role => allowedRoles.includes(role))
  if (!roles.length) return res.status(400).json({ error: 'Pilih minimal satu role' })
  db.prepare(`INSERT INTO library_config (tenant_id,name,description,drive_folder_url,enabled,visibility_roles,updated_at)
    VALUES (?,?,?,?,?,?,datetime('now')) ON CONFLICT(tenant_id) DO UPDATE SET
    name=excluded.name,description=excluded.description,drive_folder_url=excluded.drive_folder_url,
    enabled=excluded.enabled,visibility_roles=excluded.visibility_roles,updated_at=datetime('now')`)
    .run(req.tenantId, name, description, driveUrl, req.body.enabled ? 1 : 0, JSON.stringify(roles))
  res.json({ success: true })
})

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
  res.set('Cache-Control', 'no-store')
  res.json(settings || {})
})

app.get('/api/geocode/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 3 || q.length > 200) return res.status(400).json({ error: 'Kata pencarian tidak valid' })
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=id&addressdetails=0&limit=5&q=${encodeURIComponent(q)}`
    const upstream = await fetch(url, {
      headers: {
        'Accept-Language': 'id',
        'User-Agent': 'JURNALKU/1.0 (https://jurnal.cc.cd)',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!upstream.ok) return res.status(502).json({ error: `Layanan peta HTTP ${upstream.status}` })
    res.set('Cache-Control', 'public, max-age=86400')
    res.json(await upstream.json())
  } catch (error) {
    console.error('[geocode]', error.message)
    res.status(502).json({ error: 'Layanan pencarian lokasi tidak tersedia' })
  }
})

app.put('/api/settings', ADMIN, (req, res) => {
  const { nama_lembaga, alamat, telepon, email, theme, primary_color, accent_color, sidebar_color, geo_latitude, geo_longitude, geo_radius, jenjang, hari_libur, bg_size, bg_position, bg_repeat, bg_blur, pwa_enabled, pwa_name, pwa_theme_color, pwa_bg_color } = req.body
  const id = 'main_' + req.tenantId
  const bg_size_v = bg_size || 'cover'
  const bg_position_v = bg_position || 'center'
  const bg_repeat_v = bg_repeat || 'no-repeat'
  const bg_blur_v = bg_blur || 0
  db.prepare(`INSERT INTO settings (id, tenant_id, nama_lembaga, alamat, telepon, email, theme, primary_color, accent_color, sidebar_color, geo_latitude, geo_longitude, geo_radius, jenjang, hari_libur, bg_size, bg_position, bg_repeat, bg_blur, pwa_enabled, pwa_name, pwa_theme_color, pwa_bg_color, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(id) DO UPDATE SET nama_lembaga=excluded.nama_lembaga, alamat=excluded.alamat, telepon=excluded.telepon, email=excluded.email, theme=excluded.theme, primary_color=excluded.primary_color, accent_color=excluded.accent_color, sidebar_color=excluded.sidebar_color, geo_latitude=excluded.geo_latitude, geo_longitude=excluded.geo_longitude, geo_radius=excluded.geo_radius, jenjang=excluded.jenjang, hari_libur=excluded.hari_libur, bg_size=excluded.bg_size, bg_position=excluded.bg_position, bg_repeat=excluded.bg_repeat, bg_blur=excluded.bg_blur, pwa_enabled=excluded.pwa_enabled, pwa_name=excluded.pwa_name, pwa_theme_color=excluded.pwa_theme_color, pwa_bg_color=excluded.pwa_bg_color, updated_at=datetime('now')`)
    .run(id, req.tenantId, nama_lembaga, alamat, telepon, email, theme, primary_color, accent_color, sidebar_color, geo_latitude || null, geo_longitude || null, geo_radius || 200, jenjang || '', JSON.stringify(hari_libur || []), bg_size_v, bg_position_v, bg_repeat_v, bg_blur_v, pwa_enabled ? 1 : 0, pwa_name || '', pwa_theme_color || '#1e40af', pwa_bg_color || '#ffffff')
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

const removeTenantUpload = (url) => {
  if (!url || !url.startsWith('/uploads/kts-')) return
  const file = path.resolve(UPLOAD_DIR, path.basename(url))
  const relative = path.relative(UPLOAD_DIR, file)
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) fs.rmSync(file, { force: true })
}

app.post('/api/settings/kts-template', ADMIN, ktsUpload.fields([
  { name: 'depan', maxCount: 1 }, { name: 'belakang', maxCount: 1 }
]), (req, res) => {
  const files = req.files || {}
  if (!files.depan?.[0] && !files.belakang?.[0]) return res.status(400).json({ error: 'Pilih gambar depan atau belakang' })
  const id = 'main_' + req.tenantId
  db.prepare(`INSERT INTO settings (id, tenant_id, updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(id) DO NOTHING`).run(id, req.tenantId)
  const current = db.prepare('SELECT kts_depan, kts_belakang FROM settings WHERE id=?').get(id) || {}
  const saved = {}
  for (const side of ['depan', 'belakang']) {
    if (!files[side]?.[0]) continue
    const url = '/uploads/' + files[side][0].filename
    db.prepare(`UPDATE settings SET kts_${side}=?, updated_at=datetime('now') WHERE id=?`).run(url, id)
    removeTenantUpload(current['kts_' + side])
    saved['kts_' + side] = url
  }
  res.json(saved)
})

app.delete('/api/settings/kts-template/:side', ADMIN, (req, res) => {
  if (!['depan', 'belakang'].includes(req.params.side)) return res.status(400).json({ error: 'Sisi tidak valid' })
  const id = 'main_' + req.tenantId
  const column = 'kts_' + req.params.side
  const current = db.prepare(`SELECT ${column} FROM settings WHERE id=?`).get(id)
  db.prepare(`UPDATE settings SET ${column}='', updated_at=datetime('now') WHERE id=?`).run(id)
  removeTenantUpload(current?.[column])
  res.json({ success: true, [column]: '' })
})

// Pengaturan jam sesi absensi QR siswa + batas waktu ceklok GTK
app.put('/api/settings/jam-absensi', ADMIN, (req, res) => {
  const f = req.body || {}
  const id = 'main_' + req.tenantId
  const cols = ['sesi_masuk_mulai','sesi_masuk_selesai','sesi_pulang_mulai','sesi_pulang_selesai','ceklok_masuk_mulai','ceklok_masuk_selesai','ceklok_pulang_mulai','ceklok_pulang_selesai']
  // Pastikan baris settings tenant ada
  db.prepare(`INSERT INTO settings (id, tenant_id, updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(id) DO NOTHING`).run(id, req.tenantId)
  for (const c of cols) {
    if (typeof f[c] === 'string' && /^\d{2}:\d{2}$/.test(f[c])) {
      db.prepare(`UPDATE settings SET ${c}=?, updated_at=datetime('now') WHERE id=?`).run(f[c], id)
    }
  }
  const saved = db.prepare('SELECT * FROM settings WHERE id=?').get(id)
  res.json({ success: true, settings: saved })
})
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

app.post('/api/settings/reset-data', ADMIN, (req, res) => {
  const { confirm } = req.body || {}
  if (confirm !== 'RESET DATA') return res.status(400).json({ error: 'Ketik RESET DATA untuk konfirmasi' })
  const tables = [
    'broadcast_detail', 'broadcast_log', 'wa_gateway_config',
    'absensi_kegiatan', 'kegiatan_khusus',
    'rapor_sync_log', 'catatan_kepribadian', 'rapor', 'penilaian_harian',
    'absensi_ekskul', 'ekskul_anggota', 'ekskul',
    'absensi_siswa', 'absensi_guru', 'jurnal_mengajar',
    'tagihan', 'jenis_tagihan', 'tabungan',
    'modul_ajar', 'pengajar', 'jadwal', 'template_jadwal', 'kalender_kbm',
    'siswa', 'rombel', 'mapel', 'gtk', 'tahun_ajaran'
  ]
  const deleted = {}
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM users WHERE tenant_id=? AND role NOT IN (\'admin\',\'super_admin\')').run(req.tenantId)
    for (const table of tables) {
      try {
        const info = db.prepare(`DELETE FROM ${table} WHERE tenant_id=?`).run(req.tenantId)
        deleted[table] = info.changes
      } catch (e) {
        deleted[table] = 'skip'
      }
    }
  })
  tx()
  res.json({ success: true, deleted })
})

// ==================== SISWA ====================
app.get('/api/siswa', authMiddleware, (req, res) => {
  const { search, rombel_id, status } = req.query
  let sql = `SELECT s.*, r.nama rombel_nama FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id WHERE 1=1 AND s.tenant_id=?`
  const params = [req.tenantId]
  if (['guru','wali_kelas'].includes(req.user.role)) {
    const gtk = resolveGtkForUser(req.user.id, req.tenantId)
    // A teacher without a linked GTK must never receive the tenant-wide list.
    if (!gtk) return res.json([])
    sql += ` AND (r.wali_kelas_id=? OR s.rombel_id IN (SELECT rombel_id FROM pengajar WHERE gtk_id=? AND tenant_id=? UNION SELECT rombel_id FROM jadwal WHERE gtk_id=? AND tenant_id=?))`
    params.push(gtk.id, gtk.id, req.tenantId, gtk.id, req.tenantId)
  }
  if (search) { sql += ' AND (s.nama LIKE ? OR s.nis LIKE ? OR s.nisn LIKE ? OR r.nama LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`) }
  if (rombel_id) { sql += ' AND s.rombel_id = ?'; params.push(rombel_id) }
  if (status) { sql += ' AND s.status = ?'; params.push(status) }
  sql += ' ORDER BY s.nama'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/siswa', ADMIN, (req, res) => {
  const id = uuidv4()
  const { nis, nisn, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, nama_ortu, rombel_id } = req.body
  try {
    db.prepare('INSERT INTO siswa (id, nis, nisn, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, nama_ortu, rombel_id, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, nis, nisn, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, nama_ortu, rombel_id, req.tenantId)
    const siswa = db.prepare('SELECT * FROM siswa WHERE id = ? AND tenant_id = ?').get(id, req.tenantId)
    ensureStudentUser(siswa, req.tenantId)
    res.json({ id, akun_siswa: true })
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.code === 'SQLITE_CONSTRAINT') return res.status(400).json({ error: 'NIS ' + nis + ' sudah dipakai siswa lain.' })
    throw e
  }
})

app.put('/api/siswa/:id', ADMIN, (req, res) => {
  const { nis, nisn, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, nama_ortu, rombel_id, status } = req.body
  try {
    db.prepare('UPDATE siswa SET nis=?, nisn=?, nama=?, jenis_kelamin=?, tempat_lahir=?, tanggal_lahir=?, alamat=?, no_hp=?, nama_ortu=?, rombel_id=?, status=? WHERE id=? AND tenant_id=?')
      .run(nis, nisn, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, nama_ortu, rombel_id, status, req.params.id, req.tenantId)
    const siswa = db.prepare('SELECT * FROM siswa WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId)
    if (siswa && siswa.status === 'aktif') ensureStudentUser(siswa, req.tenantId)
    res.json({ success: true })
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.code === 'SQLITE_CONSTRAINT') return res.status(400).json({ error: 'NIS ' + nis + ' sudah dipakai siswa lain.' })
    throw e
  }
})

app.post('/api/siswa/generate-akun', ADMIN, (req, res) => {
  const resetPassword = req.body?.reset_password === true
  const siswaList = db.prepare("SELECT * FROM siswa WHERE tenant_id = ? AND status = 'aktif' ORDER BY nama").all(req.tenantId)
  let dibuat = 0
  let sinkron = 0
  const gagal = []
  const tx = db.transaction(() => {
    for (const siswa of siswaList) {
      try {
        const existed = db.prepare('SELECT id FROM users WHERE (siswa_id = ? OR (role = ? AND nis = ?)) AND tenant_id = ?').get(siswa.id, 'siswa', siswa.nis, req.tenantId)
        const user = ensureStudentUser(siswa, req.tenantId, { resetPassword })
        if (user) existed ? sinkron++ : dibuat++
      } catch (e) {
        gagal.push({ nis: siswa.nis, nama: siswa.nama, error: e.message })
      }
    }
  })
  tx()
  res.json({ success: true, total: siswaList.length, dibuat, sinkron, gagal })
})

app.delete('/api/siswa/:id', ADMIN, (req, res) => {
  try {
    db.prepare('DELETE FROM users WHERE siswa_id = ? AND tenant_id = ? AND role = ?').run(req.params.id, req.tenantId, 'siswa')
    db.prepare('DELETE FROM siswa WHERE id = ? AND tenant_id=?').run(req.params.id, req.tenantId)
    res.json({ success: true })
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return res.status(400).json({ error: 'Siswa masih digunakan di data lain (absensi/tagihan/tabungan/ekskul). Hapus data terkait dulu.' })
    throw e
  }
})

// ==================== BULK DELETE (Hapus Semua per kategori) ====================
// Hapus semua data satu kategori dalam tenant. Admin only, wajib konfirmasi 'HAPUS SEMUA'.
// Cascade: ikut hapus data turunan yang bergantung, biar tidak kena FOREIGN KEY.
const BULK_DELETE_MAP = {
  siswa: { label: 'Siswa', main: 'siswa', cascade: ['absensi_siswa', 'tagihan', 'tabungan', 'ekskul_anggota', 'absensi_ekskul', 'penilaian_harian', 'catatan_kepribadian', 'rapor'] },
  gtk: { label: 'GTK', main: 'gtk', cascade: ['jadwal', 'pengajar', 'modul_ajar', 'absensi_guru', 'jurnal_mengajar'] },
  mapel: { label: 'Mapel', main: 'mapel', cascade: ['jadwal', 'pengajar', 'modul_ajar', 'penilaian_harian'] },
  rombel: { label: 'Rombel', main: 'rombel', cascade: ['jadwal', 'siswa'] },
  jadwal: { label: 'Jadwal', main: 'jadwal', cascade: [] },
  absensi_siswa: { label: 'Absensi Siswa', main: 'absensi_siswa', cascade: [] },
  absensi_guru: { label: 'Absensi Guru', main: 'absensi_guru', cascade: [] },
  jurnal_mengajar: { label: 'Jurnal Mengajar', main: 'jurnal_mengajar', cascade: [] },
  tagihan: { label: 'Tagihan', main: 'tagihan', cascade: [] },
  tabungan: { label: 'Tabungan', main: 'tabungan', cascade: [] },
}

app.get('/api/bulk-delete/:kategori/count', ADMIN, (req, res) => {
  const cfg = BULK_DELETE_MAP[req.params.kategori]
  if (!cfg) return res.status(400).json({ error: 'Kategori tidak dikenal' })
  let count = 0
  try { count = db.prepare(`SELECT COUNT(*) c FROM ${cfg.main} WHERE tenant_id=?`).get(req.tenantId).c } catch {}
  res.json({ kategori: req.params.kategori, label: cfg.label, count })
})

app.post('/api/bulk-delete/:kategori', ADMIN, (req, res) => {
  const cfg = BULK_DELETE_MAP[req.params.kategori]
  if (!cfg) return res.status(400).json({ error: 'Kategori tidak dikenal' })
  if ((req.body || {}).confirm !== 'HAPUS SEMUA') return res.status(400).json({ error: 'Ketik HAPUS SEMUA untuk konfirmasi' })
  const deleted = {}
  const tx = db.transaction(() => {
    for (const t of cfg.cascade) {
      try { deleted[t] = db.prepare(`DELETE FROM ${t} WHERE tenant_id=?`).run(req.tenantId).changes } catch { deleted[t] = 'skip' }
    }
    try { deleted[cfg.main] = db.prepare(`DELETE FROM ${cfg.main} WHERE tenant_id=?`).run(req.tenantId).changes } catch (e) { deleted[cfg.main] = 'error' }
  })
  try { tx() } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return res.status(400).json({ error: `Sebagian ${cfg.label} masih dipakai data lain. Coba hapus data turunan dulu.` })
    throw e
  }
  res.json({ success: true, deleted })
})


// ==================== GTK ====================
app.get('/api/gtk', authMiddleware, (req, res) => {
  const { search, jabatan, status_kepegawaian } = req.query
  let sql = `SELECT g.*, COALESCE(GROUP_CONCAT(DISTINCT m.nama), '') as bidang_studi
    FROM gtk g
    LEFT JOIN pengajar p ON p.gtk_id = g.id AND p.tenant_id = g.tenant_id
    LEFT JOIN mapel m ON m.id = p.mapel_id AND m.tenant_id = g.tenant_id
    WHERE 1=1 AND g.tenant_id=?`
  const params = [req.tenantId]
  if (search) { sql += ' AND (g.nama LIKE ? OR g.nip LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  if (jabatan) { sql += ' AND g.jabatan = ?'; params.push(jabatan) }
  if (status_kepegawaian) { sql += ' AND g.status_kepegawaian = ?'; params.push(status_kepegawaian) }
  sql += ' GROUP BY g.id ORDER BY g.nama'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/gtk', ADMIN, (req, res) => {
  const id = uuidv4()
  const { nip, nuptk, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, email, jabatan, status_kepegawaian, bidang_studi, kode_guru } = req.body
  try {
    db.prepare('INSERT INTO gtk (id, nip, nuptk, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, email, jabatan, status_kepegawaian, bidang_studi, kode_guru, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, nip || null, nuptk, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, email, jabatan, status_kepegawaian, bidang_studi, kode_guru || '', req.tenantId)
    res.json({ id })
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.code === 'SQLITE_CONSTRAINT') return res.status(400).json({ error: 'NIP ' + nip + ' sudah dipakai GTK lain.' })
    throw e
  }
})

app.put('/api/gtk/:id', ADMIN, (req, res) => {
  const { nip, nuptk, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, email, jabatan, status_kepegawaian, bidang_studi, status, kode_guru } = req.body
  try {
    db.prepare('UPDATE gtk SET nip=?, nuptk=?, nama=?, jenis_kelamin=?, tempat_lahir=?, tanggal_lahir=?, alamat=?, no_hp=?, email=?, jabatan=?, status_kepegawaian=?, bidang_studi=?, status=?, kode_guru=? WHERE id=? AND tenant_id=?')
      .run(nip || null, nuptk, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, email, jabatan, status_kepegawaian, bidang_studi, status, kode_guru || '', req.params.id, req.tenantId)
    res.json({ success: true })
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.code === 'SQLITE_CONSTRAINT') return res.status(400).json({ error: 'NIP ' + nip + ' sudah dipakai GTK lain.' })
    throw e
  }
})

app.delete('/api/gtk/:id', ADMIN, (req, res) => {
  const id = req.params.id
  const tenantId = req.tenantId
  const force = req.query.force === '1' || req.query.force === 'true'
  const countRef = (table, col) => {
    try { return db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE tenant_id=? AND ${col}=?`).get(tenantId, id).c } catch { return 0 }
  }
  // Riwayat penting: TIDAK boleh terhapus otomatis walau force (jejak akademik).
  const histRefs = [
    ['jurnal_mengajar', 'guru_id', 'jurnal mengajar'],
    ['absensi_guru', 'gtk_id', 'absensi guru'],
    ['supervisi', 'guru_id', 'supervisi'],
  ].map(([table, col, label]) => ({ table, col, label, count: countRef(table, col) })).filter(x => x.count > 0)
  // Data penugasan: boleh ikut terhapus saat force (bukan riwayat).
  const assignRefs = [
    ['jadwal', 'gtk_id', 'jadwal'],
    ['pengajar', 'gtk_id', 'pengajar'],
    ['modul_ajar', 'gtk_id', 'modul ajar'],
    ['ekskul', 'pembina_id', 'ekskul'],
  ].map(([table, col, label]) => ({ table, col, label, count: countRef(table, col) })).filter(x => x.count > 0)

  if (histRefs.length) {
    const detail = histRefs.map(x => `${x.label}: ${x.count}`).join(', ')
    return res.status(400).json({ error: `GTK punya riwayat ${detail}. Tidak bisa dihapus demi jaga jejak akademik.`, kind: 'history' })
  }
  if (assignRefs.length && !force) {
    const detail = assignRefs.map(x => `${x.label}: ${x.count}`).join(', ')
    return res.status(409).json({ error: `GTK masih dipakai di ${detail}.`, kind: 'assignment', refs: assignRefs.map(x => ({ label: x.label, count: x.count })) })
  }

  try {
    const tx = db.transaction(() => {
      db.prepare('UPDATE rombel SET wali_kelas_id=NULL WHERE wali_kelas_id=? AND tenant_id=?').run(id, tenantId)
      if (force) {
        if (assignRefs.some(x => x.table === 'ekskul')) {
          try {
            const ekskuls = db.prepare('SELECT id FROM ekskul WHERE tenant_id=? AND pembina_id=?').all(tenantId, id)
            for (const e of ekskuls) {
              try { db.prepare('DELETE FROM ekskul_anggota WHERE ekskul_id=?').run(e.id) } catch {}
              try { db.prepare('DELETE FROM absensi_ekskul WHERE ekskul_id=?').run(e.id) } catch {}
            }
          } catch {}
        }
        for (const x of assignRefs) {
          try { db.prepare(`DELETE FROM ${x.table} WHERE tenant_id=? AND ${x.col}=?`).run(tenantId, id) } catch {}
        }
      }
      const info = db.prepare('DELETE FROM gtk WHERE id = ? AND tenant_id=?').run(id, tenantId)
      return info.changes
    })
    const changes = tx()
    if (!changes) return res.status(404).json({ error: 'GTK tidak ditemukan di tenant ini.' })
    res.json({ success: true, forced: force })
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return res.status(400).json({ error: 'GTK masih digunakan di data lain. Hapus/pindahkan data terkait dulu.' })
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
  try {
    db.prepare('INSERT INTO mapel (id, kode, nama, kelompok, jam_per_minggu, tenant_id) VALUES (?,?,?,?,?,?)').run(id, kode, nama, kelompok, jam_per_minggu, req.tenantId)
    res.json({ id })
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.code === 'SQLITE_CONSTRAINT') return res.status(400).json({ error: 'Kode mapel ' + kode + ' sudah dipakai.' })
    throw e
  }
})

app.put('/api/mapel/:id', ADMIN, (req, res) => {
  const { kode, nama, kelompok, jam_per_minggu } = req.body
  if (!kode || !nama) return res.status(400).json({ error: 'Kode dan nama wajib diisi.' })
  try {
    const result = db.prepare('UPDATE mapel SET kode=?, nama=?, kelompok=?, jam_per_minggu=? WHERE id=? AND tenant_id=?')
      .run(kode, nama, kelompok, jam_per_minggu, req.params.id, req.tenantId)
    if (!result.changes) return res.status(404).json({ error: 'Mata pelajaran tidak ditemukan.' })
    res.json({ success: true })
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.code === 'SQLITE_CONSTRAINT') return res.status(400).json({ error: 'Kode mapel ' + kode + ' sudah dipakai.' })
    throw e
  }
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
  const rows = db.prepare(`SELECT r.*, g.nama as wali_kelas_nama, (SELECT COUNT(*) FROM siswa WHERE rombel_id = r.id AND tenant_id = r.tenant_id) as jumlah_siswa FROM rombel r LEFT JOIN gtk g ON r.wali_kelas_id = g.id AND g.tenant_id = r.tenant_id WHERE r.tenant_id=? ORDER BY r.tingkat, r.nama`).all(req.tenantId)
  res.json(rows)
})

app.get('/api/rombel/:id/siswa', ADMIN, (req, res) => {
  const rows = db.prepare(`SELECT s.id, s.nama, s.nis, s.nisn, s.rombel_id, s.status FROM rombel r JOIN siswa s ON s.rombel_id = r.id WHERE r.id = ? AND r.tenant_id = ? AND s.tenant_id = ? ORDER BY s.nama`).all(req.params.id, req.tenantId, req.tenantId)
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

app.get('/api/guru/ekskul', STAFF, (req, res) => {
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  if (!gtk) return res.json([])
  const rows = db.prepare(`SELECT e.*, g.nama as pembina_nama,
    (SELECT COUNT(*) FROM ekskul_anggota ea WHERE ea.ekskul_id=e.id AND ea.tenant_id=e.tenant_id) as jumlah_anggota
    FROM ekskul e LEFT JOIN gtk g ON g.id=e.pembina_id AND g.tenant_id=e.tenant_id
    WHERE e.pembina_id=? AND e.tenant_id=? ORDER BY e.nama`).all(gtk.id, req.tenantId)
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
  if (['guru', 'wali_kelas'].includes(req.user.role)) {
    const gtk = resolveGtkForUser(req.user.id, req.tenantId)
    if (!gtk || !db.prepare('SELECT 1 FROM ekskul WHERE id=? AND pembina_id=? AND tenant_id=?').get(req.params.id, gtk.id, req.tenantId)) return res.status(403).json({ error: 'Bukan pembina ekskul ini' })
  }
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
  if (['guru', 'wali_kelas'].includes(req.user.role)) {
    const gtk = resolveGtkForUser(req.user.id, req.tenantId)
    if (!gtk || !db.prepare('SELECT 1 FROM ekskul WHERE id=? AND pembina_id=? AND tenant_id=?').get(ekskul_id, gtk.id, req.tenantId)) return res.status(403).json({ error: 'Bukan pembina ekskul ini' })
  }
  let sql = `SELECT ae.*, s.nama as siswa_nama, s.nis FROM absensi_ekskul ae LEFT JOIN siswa s ON ae.siswa_id = s.id WHERE ae.tenant_id=?`
  const params = [req.tenantId]
  if (ekskul_id) { sql += ' AND ae.ekskul_id = ?'; params.push(ekskul_id) }
  if (tanggal) { sql += ' AND ae.tanggal = ?'; params.push(tanggal) }
  sql += ' ORDER BY s.nama'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/absensi-ekskul/bulk', STAFF, (req, res) => {
  const { ekskul_id, tanggal, data } = req.body
  if (['guru', 'wali_kelas'].includes(req.user.role)) {
    const gtk = resolveGtkForUser(req.user.id, req.tenantId)
    if (!gtk || !db.prepare('SELECT 1 FROM ekskul WHERE id=? AND pembina_id=? AND tenant_id=?').get(ekskul_id, gtk.id, req.tenantId)) return res.status(403).json({ error: 'Bukan pembina ekskul ini' })
  }
  if (!data || !Array.isArray(data)) return res.status(400).json({ error: 'Data harus array' })
  const validStatuses = new Set(['hadir', 'izin', 'sakit', 'alpa'])
  const allowedMember = db.prepare('SELECT 1 FROM ekskul_anggota WHERE ekskul_id=? AND siswa_id=? AND tenant_id=?')
  if (data.some(d => !d.siswa_id || !validStatuses.has(d.status) || !allowedMember.get(ekskul_id, d.siswa_id, req.tenantId))) return res.status(400).json({ error: 'Peserta atau status absensi tidak valid' })
  try { assertKbmActive(req, tanggal) } catch (e) { return res.status(400).json({ error: e.message }) }
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
  db.prepare('DELETE FROM absensi_kegiatan WHERE kegiatan_id = ? AND tenant_id = ?').run(req.params.id, req.tenantId)
  res.json({ success: true })
})

app.get('/api/absensi-kegiatan', authMiddleware, (req, res) => {
  const { kegiatan_id } = req.query
  if (!kegiatan_id) return res.json([])
  const owns = db.prepare('SELECT id FROM kegiatan_khusus WHERE id = ? AND tenant_id = ?').get(kegiatan_id, req.tenantId)
  if (!owns) return res.json([])
  const rows = db.prepare(`SELECT ak.*, s.nama as siswa_nama, s.nis FROM absensi_kegiatan ak LEFT JOIN siswa s ON ak.siswa_id = s.id WHERE ak.kegiatan_id = ? AND ak.tenant_id = ? ORDER BY s.nama`).all(kegiatan_id, req.tenantId)
  res.json(rows)
})


app.get('/api/absensi-kegiatan/rekap', authMiddleware, (req, res) => {
  const { kegiatan_id, mulai, selesai, minimal_hadir } = req.query
  if (!kegiatan_id || !mulai || !selesai) return res.status(400).json({ error: 'kegiatan_id, mulai, selesai wajib diisi' })
  const kegiatan = db.prepare('SELECT id FROM kegiatan_khusus WHERE id=? AND tenant_id=?').get(kegiatan_id, req.tenantId)
  if (!kegiatan) return res.status(404).json({ error: 'Kegiatan tidak ditemukan' })
  const min = Number(minimal_hadir) || 1
  const rows = db.prepare(`SELECT s.id, s.nama, s.nis, r.nama as rombel_nama,
    COUNT(ak.id) as total,
    SUM(CASE WHEN ak.status='hadir' THEN 1 ELSE 0 END) as hadir,
    SUM(CASE WHEN ak.status='izin' THEN 1 ELSE 0 END) as izin,
    SUM(CASE WHEN ak.status='sakit' THEN 1 ELSE 0 END) as sakit,
    SUM(CASE WHEN ak.status IN ('alpha','alpa') THEN 1 ELSE 0 END) as alpha
    FROM siswa s
    LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
    LEFT JOIN absensi_kegiatan ak ON ak.siswa_id=s.id AND ak.kegiatan_id=? AND ak.tenant_id=s.tenant_id AND ak.tanggal>=? AND ak.tanggal<=?
    WHERE s.tenant_id=? AND COALESCE(s.status,'aktif')='aktif'
    GROUP BY s.id ORDER BY r.nama, s.nama`).all(kegiatan_id, mulai, selesai, req.tenantId)
    .map(r => ({ ...r, hasil: (r.hadir || 0) >= min ? 'terpenuhi' : 'kurang', kelulusan: (r.hadir || 0) >= min ? 'lulus' : 'tidak_lulus' }))
  res.json({ kegiatan_id, mulai, selesai, minimal_hadir: min, rows })
})

app.post('/api/absensi-kegiatan/bulk-range', STAFF, (req, res) => {
  const { kegiatan_id, mulai, selesai, data } = req.body
  const dates = dateRange(mulai, selesai)
  if (!kegiatan_id || !dates.length || !Array.isArray(data)) return res.status(400).json({ error: 'kegiatan_id, rentang, data wajib' })
  const owns = db.prepare('SELECT id FROM kegiatan_khusus WHERE id = ? AND tenant_id = ?').get(kegiatan_id, req.tenantId)
  if (!owns) return res.status(404).json({ error: 'Kegiatan tidak ditemukan' })
  let count=0
  for (const tanggal of dates) for (const d of data) {
    const exists = db.prepare('SELECT id FROM absensi_kegiatan WHERE siswa_id=? AND kegiatan_id=? AND tanggal=? AND tenant_id=?').get(d.siswa_id,kegiatan_id,tanggal,req.tenantId)
    if (exists) db.prepare('UPDATE absensi_kegiatan SET status=?, keterangan=? WHERE id=? AND tenant_id=?').run(d.status||'hadir', d.keterangan||'', exists.id, req.tenantId)
    else db.prepare('INSERT INTO absensi_kegiatan (id,siswa_id,kegiatan_id,tanggal,status,keterangan,tenant_id) VALUES (?,?,?,?,?,?,?)').run(uuidv4(), d.siswa_id,kegiatan_id,tanggal,d.status||'hadir',d.keterangan||'',req.tenantId)
    count++
  }
  res.json({ count, dates: dates.length })
})

app.post('/api/absensi-kegiatan/bulk', STAFF, (req, res) => {
  const { kegiatan_id, tanggal, data } = req.body
  if (!data || !Array.isArray(data)) return res.status(400).json({ error: 'Data harus array' })
  const owns = db.prepare('SELECT id FROM kegiatan_khusus WHERE id = ? AND tenant_id = ?').get(kegiatan_id, req.tenantId)
  if (!owns) return res.status(403).json({ error: 'Kegiatan tidak ditemukan' })
  let count = 0
  for (const d of data) {
    const exists = db.prepare('SELECT id FROM absensi_kegiatan WHERE siswa_id = ? AND kegiatan_id = ? AND tenant_id = ?').get(d.siswa_id, kegiatan_id, req.tenantId)
    if (exists) {
      db.prepare('UPDATE absensi_kegiatan SET status=?, keterangan=? WHERE id=? AND tenant_id=?').run(d.status, d.keterangan || '', exists.id, req.tenantId)
    } else {
      db.prepare('INSERT INTO absensi_kegiatan (id, siswa_id, kegiatan_id, tanggal, status, keterangan, tenant_id) VALUES (?,?,?,?,?,?,?)').run(uuidv4(), d.siswa_id, kegiatan_id, tanggal || '', d.status, d.keterangan || '', req.tenantId)
    }
    count++
  }
  res.json({ count })
})

// ==================== GURU DASHBOARD ====================

function pengajarAsJadwal(gtkId, tenantId) {
  return db.prepare(`SELECT p.id, p.mapel_id, p.rombel_id, p.gtk_id, '' as hari, '' as jam_mulai, '' as jam_selesai, '' as ruangan,
    m.nama as mapel_nama, m.kode as mapel_kode, r.nama as rombel_nama, g.nama as guru_nama
    FROM pengajar p
    JOIN mapel m ON m.id=p.mapel_id AND m.tenant_id=p.tenant_id
    LEFT JOIN rombel r ON r.id=p.rombel_id AND r.tenant_id=p.tenant_id
    LEFT JOIN gtk g ON g.id=p.gtk_id AND g.tenant_id=p.tenant_id
    WHERE p.gtk_id=? AND p.tenant_id=? ORDER BY m.nama, r.nama`).all(gtkId, tenantId)
}

app.get('/api/guru/dashboard', authMiddleware, (req, res) => {
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  const gtkId = gtk?.id
  if (!gtkId) return res.json({ jadwal_hari_ini: [], rekap_jurnal: { total: 0 }, rombel_count: 0, wali_rombel: [] })
  
  const today = require('./attendance-rules.cjs').hariJakarta()
  let jadwal = db.prepare(`SELECT j.*, m.nama as mapel_nama, r.nama as rombel_nama FROM jadwal j JOIN mapel m ON j.mapel_id=m.id AND m.tenant_id=j.tenant_id LEFT JOIN rombel r ON j.rombel_id=r.id AND r.tenant_id=j.tenant_id WHERE j.gtk_id=? AND lower(j.hari)=? AND j.tenant_id=? AND j.jenis_kegiatan = 'mapel' ORDER BY j.jam_mulai`).all(gtkId, today, req.tenantId)
  if (!jadwal.length) jadwal = db.prepare(`SELECT j.*, m.nama as mapel_nama, r.nama as rombel_nama FROM jadwal j JOIN mapel m ON j.mapel_id=m.id AND m.tenant_id=j.tenant_id LEFT JOIN rombel r ON j.rombel_id=r.id AND r.tenant_id=j.tenant_id WHERE j.gtk_id=? AND j.tenant_id=? AND j.jenis_kegiatan = 'mapel' ORDER BY j.hari,j.jam_mulai`).all(gtkId, req.tenantId)
  if (!jadwal.length) jadwal = pengajarAsJadwal(gtkId, req.tenantId)
  
  const totalJurnal = db.prepare("SELECT COUNT(*) as c FROM jurnal_mengajar WHERE guru_id=? AND tenant_id=?").get(gtkId, req.tenantId).c
  const rombelCount = db.prepare("SELECT COUNT(DISTINCT rombel_id) as c FROM pengajar WHERE gtk_id=? AND tenant_id=?").get(gtkId, req.tenantId).c
  const waliRombel = db.prepare(`SELECT r.*, (SELECT COUNT(*) FROM siswa s WHERE s.rombel_id=r.id AND s.tenant_id=?) as jumlah_siswa FROM rombel r WHERE r.wali_kelas_id=? AND r.tenant_id=? ORDER BY r.tingkat, r.nama`).all(req.tenantId, gtkId, req.tenantId)
  const mapelDiampu = db.prepare(`SELECT DISTINCT m.id, m.nama, m.kode, m.kelompok FROM pengajar p JOIN mapel m ON m.id=p.mapel_id AND m.tenant_id=p.tenant_id WHERE p.gtk_id=? AND p.tenant_id=? ORDER BY m.kelompok, m.nama`).all(gtkId, req.tenantId)
  const ekskulDiampu = db.prepare('SELECT id,nama,hari,jam_mulai,jam_selesai FROM ekskul WHERE pembina_id=? AND tenant_id=? ORDER BY nama').all(gtkId, req.tenantId)
  
  const tugas = db.prepare(`SELECT t.*, m.nama mapel_nama, r.nama rombel_nama FROM tugas_siswa t LEFT JOIN mapel m ON m.id=t.mapel_id AND m.tenant_id=t.tenant_id LEFT JOIN rombel r ON r.id=t.rombel_id AND r.tenant_id=t.tenant_id WHERE t.guru_id=? AND t.tenant_id=? ORDER BY t.created_at DESC LIMIT 20`).all(gtkId, req.tenantId)
  res.json({ jadwal_hari_ini: jadwal, mapel_diampu: mapelDiampu, ekskul_diampu: ekskulDiampu, tugas, rekap_jurnal: { total: totalJurnal }, rombel_count: rombelCount, wali_rombel: waliRombel, gtk: gtk })
})


function titleHari(row) {
  return { ...row, hari: row.hari ? row.hari.charAt(0).toUpperCase() + row.hari.slice(1).toLowerCase() : row.hari }
}

app.get('/api/guru/jadwal', authMiddleware, (req, res) => {
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  if (!gtk) return res.json([])
  let rows = db.prepare(`SELECT j.*, m.nama AS mapel_nama, m.kode AS mapel_kode, r.nama AS rombel_nama
    FROM jadwal j LEFT JOIN mapel m ON j.mapel_id=m.id AND m.tenant_id=j.tenant_id LEFT JOIN rombel r ON j.rombel_id=r.id AND r.tenant_id=j.tenant_id
    WHERE j.gtk_id=? AND j.tenant_id=?
    ORDER BY j.hari,j.jam_mulai`).all(gtk.id, req.tenantId)
  if (!rows.length) rows = pengajarAsJadwal(gtk.id, req.tenantId)
  res.json(rows.map(titleHari))
})

app.get('/api/guru/wali-kelas', authMiddleware, (req, res) => {
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  if (!gtk) return res.json({ gtk: null, rombels: [], siswa: [] })
  const rombels = db.prepare(`SELECT r.*, (SELECT COUNT(*) FROM siswa s WHERE s.rombel_id=r.id AND s.tenant_id=?) as jumlah_siswa FROM rombel r WHERE r.wali_kelas_id=? AND r.tenant_id=? ORDER BY r.tingkat, r.nama`).all(req.tenantId, gtk.id, req.tenantId)
  const siswa = db.prepare(`SELECT s.*, r.nama as rombel_nama FROM siswa s JOIN rombel r ON s.rombel_id=r.id WHERE r.wali_kelas_id=? AND s.tenant_id=? ORDER BY r.tingkat, r.nama, s.nama`).all(gtk.id, req.tenantId)
  res.json({ gtk, rombels, siswa })
})


app.get('/api/guru/tugas', authMiddleware, (req, res) => {
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  if (!gtk) return res.json([])
  res.json(db.prepare(`SELECT t.*, m.nama mapel_nama, r.nama rombel_nama FROM tugas_siswa t LEFT JOIN mapel m ON m.id=t.mapel_id AND m.tenant_id=t.tenant_id LEFT JOIN rombel r ON r.id=t.rombel_id AND r.tenant_id=t.tenant_id WHERE t.guru_id=? AND t.tenant_id=? ORDER BY t.created_at DESC LIMIT 50`).all(gtk.id, req.tenantId))
})
app.post('/api/guru/tugas', TEACHER, (req, res) => {
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  if (!gtk) return res.status(400).json({ error: 'Akun guru belum terhubung GTK' })
  const { mapel_id, rombel_id, judul, deskripsi, deadline } = req.body || {}
  if (!rombel_id || !judul) return res.status(400).json({ error: 'Rombel dan judul wajib' })
  const allowed = db.prepare(`SELECT 1 FROM jadwal WHERE gtk_id=? AND rombel_id=? AND tenant_id=? UNION SELECT 1 FROM pengajar WHERE gtk_id=? AND rombel_id=? AND tenant_id=?`).get(gtk.id, rombel_id, req.tenantId, gtk.id, rombel_id, req.tenantId)
  if (!allowed) return res.status(403).json({ error: 'Rombel bukan kelas yang diampu' })
  if (mapel_id) {
    const okMapel = db.prepare(`SELECT 1 FROM jadwal WHERE gtk_id=? AND rombel_id=? AND mapel_id=? AND tenant_id=? UNION SELECT 1 FROM pengajar WHERE gtk_id=? AND rombel_id=? AND mapel_id=? AND tenant_id=?`).get(gtk.id, rombel_id, mapel_id, req.tenantId, gtk.id, rombel_id, mapel_id, req.tenantId)
    if (!okMapel) return res.status(403).json({ error: 'Mapel bukan yang diampu di rombel ini' })
  }
  const id = uuidv4()
  db.prepare('INSERT INTO tugas_siswa (id,guru_id,mapel_id,rombel_id,judul,deskripsi,deadline,tenant_id) VALUES (?,?,?,?,?,?,?,?)').run(id, gtk.id, mapel_id || null, rombel_id, judul.trim(), deskripsi || '', deadline || null, req.tenantId)
  res.json({ id })
})
app.delete('/api/guru/tugas/:id', TEACHER, (req, res) => {
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  if (!gtk) return res.status(400).json({ error: 'Akun guru belum terhubung GTK' })
  db.prepare('DELETE FROM tugas_siswa WHERE id=? AND guru_id=? AND tenant_id=?').run(req.params.id, gtk.id, req.tenantId)
  res.json({ success: true })
})
app.get('/api/siswa/tugas', authMiddleware, (req, res) => {
  const sid = selectLinkedStudent(req)
  if (!sid) return res.json([])
  const siswa = db.prepare('SELECT rombel_id FROM siswa WHERE id=? AND tenant_id=?').get(sid, req.tenantId)
  if (!siswa?.rombel_id) return res.json([])
  res.json(db.prepare(`SELECT t.*, m.nama mapel_nama, g.nama guru_nama FROM tugas_siswa t LEFT JOIN mapel m ON m.id=t.mapel_id AND m.tenant_id=t.tenant_id LEFT JOIN gtk g ON g.id=t.guru_id AND g.tenant_id=t.tenant_id WHERE t.rombel_id=? AND t.tenant_id=? ORDER BY COALESCE(t.deadline,t.created_at) DESC LIMIT 30`).all(siswa.rombel_id, req.tenantId))
})

// ==================== GURU ABSENSI (CEKLOK) ====================
app.get('/api/ceklok/admin', STAFF, (req, res) => {
  const tanggal = String(req.query.tanggal || todayJakarta()).trim()
  const status = String(req.query.status || '').trim()
  const staffRoles = ['guru', 'wali_kelas', 'kepala', 'admin', 'bendahara', 'operator', 'tata_usaha', 'tu']
  const staffGtkIds = db.prepare(`SELECT DISTINCT gtk_id FROM users WHERE tenant_id=? AND gtk_id IS NOT NULL AND role IN (${staffRoles.map(() => '?').join(',')})`).all(req.tenantId, ...staffRoles).map(row => row.gtk_id)
  const gtkRows = db.prepare("SELECT id, nama, nip FROM gtk WHERE tenant_id=? AND status_kepegawaian!='Nonaktif' ORDER BY nama").all(req.tenantId)
  const visibleGtk = staffGtkIds.length ? gtkRows.filter(row => staffGtkIds.includes(row.id)) : gtkRows
  const attendance = db.prepare('SELECT * FROM absensi_guru WHERE tanggal=? AND tenant_id=?').all(tanggal, req.tenantId)
  const byGtk = new Map(attendance.map(row => [row.gtk_id, row]))
  let records = visibleGtk.map(gtk => {
    const row = byGtk.get(gtk.id)
    return {
      id: row?.id || `missing-${gtk.id}`,
      guru_id: gtk.id,
      guru_nama: gtk.nama,
      nip: gtk.nip || '',
      tanggal,
      jam_masuk: row?.waktu_masuk || null,
      jam_keluar: row?.waktu_pulang || null,
      status: row?.status || 'tidak_hadir',
      latitude_masuk: row?.latitude ?? null,
      longitude_masuk: row?.longitude ?? null,
      jarak_masuk: row?.jarak ?? null,
      keterangan: row?.keterangan || ''
    }
  })
  if (status) records = records.filter(row => row.status === status)
  const summary = {
    hadir: records.filter(row => row.status === 'hadir').length,
    terlambat: records.filter(row => row.status === 'terlambat').length,
    tidak_hadir: records.filter(row => row.status === 'tidak_hadir').length,
    total_guru: visibleGtk.length
  }
  res.json({ records, summary })
})

app.get('/api/siswa/qr-identifiers', STAFF, (req, res) => {
  const rombelId = String(req.query.rombel_id || '').trim()
  let sql = "SELECT id, nis, nisn, nama, rombel_id FROM siswa WHERE tenant_id=? AND status='aktif'"
  const params = [req.tenantId]
  if (rombelId) { sql += ' AND rombel_id=?'; params.push(rombelId) }
  sql += ' ORDER BY nama'
  const data = db.prepare(sql).all(...params).map(siswa => ({
    ...siswa,
    identifier: studentActiveIdentifier(siswa),
    identifier_type: String(siswa.nisn || '').trim() ? 'NISN' : 'NIS'
  }))
  res.json(data)
})

app.get('/api/guru/absensi-saya', authMiddleware, (req, res) => {
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  if (!gtk) {
    // Buat GTK dummy untuk admin/kepala supaya bisa ceklok
    const ADMIN_ROLES = ['admin','super_admin','kepala','bendahara','operator','tata_usaha','tu']
    if (ADMIN_ROLES.includes(req.user.role)) {
      const gid = uuidv4()
      const nm = req.user.nama || req.user.email || 'Admin'
      try { db.prepare("INSERT INTO gtk (id,nama,jenis_kelamin,email,jabatan,status_kepegawaian,tenant_id) VALUES (?,?,'L',?,'Admin','Tetap',?)").run(gid,nm,req.user.email||'',req.tenantId) } catch {}
      try { db.prepare('UPDATE users SET gtk_id=? WHERE id=?').run(gid, req.user.id) } catch {}
      const gtk2 = db.prepare('SELECT * FROM gtk WHERE id=?').get(gid)
      if (gtk2) {
        const today2 = todayJakarta()
        const todayRecord2 = db.prepare('SELECT * FROM absensi_guru WHERE gtk_id=? AND tanggal=? AND tenant_id=?').get(gtk2.id, today2, req.tenantId)
        const history2 = db.prepare('SELECT * FROM absensi_guru WHERE gtk_id=? AND tenant_id=? ORDER BY tanggal DESC LIMIT 30').all(gtk2.id, req.tenantId)
        return res.json({ today: todayRecord2 || null, history: history2, gtk: gtk2 })
      }
    }
    return res.json({ today: null, history: [] })
  }
  const today = todayJakarta()
  const todayRecord = db.prepare('SELECT * FROM absensi_guru WHERE gtk_id = ? AND tanggal = ? AND tenant_id = ?').get(gtk.id, today, req.tenantId)
  const history = db.prepare('SELECT * FROM absensi_guru WHERE gtk_id = ? AND tenant_id = ? ORDER BY tanggal DESC LIMIT 30').all(gtk.id, req.tenantId)
  res.json({ today: todayRecord || null, history, gtk })
})

app.post('/api/guru/ceklok', STAFF, (req, res) => {
  let gtk = resolveGtkForUser(req.user.id, req.tenantId)
  if (!gtk) {
    const ADMIN_ROLES2 = ['admin','super_admin','kepala','bendahara','operator','tata_usaha','tu']
    if (ADMIN_ROLES2.includes(req.user.role)) {
      const gid2 = uuidv4()
      const nm2 = req.user.nama || req.user.email || 'Admin'
      try { db.prepare("INSERT INTO gtk (id,nama,jenis_kelamin,email,jabatan,status_kepegawaian,tenant_id) VALUES (?,?,'L',?,'Admin','Tetap',?)").run(gid2,nm2,req.user.email||'',req.tenantId) } catch {}
      try { db.prepare('UPDATE users SET gtk_id=? WHERE id=?').run(gid2, req.user.id) } catch {}
      gtk = db.prepare('SELECT * FROM gtk WHERE id=?').get(gid2)
    }
    if (!gtk) return res.status(400).json({ error: 'Akun Anda belum terhubung ke data GTK. Minta admin buatkan akun dari menu Data GTK (Buat Akun Guru).' })
  }
  const { type, latitude, longitude } = req.body
  // Selalu baca baris canonical. Tenant lama bisa punya baris settings duplikat tanpa koordinat.
  const geo = db.prepare('SELECT geo_latitude, geo_longitude, geo_radius FROM settings WHERE id = ?').get('main_' + req.tenantId)
    || db.prepare('SELECT geo_latitude, geo_longitude, geo_radius FROM settings WHERE tenant_id = ? ORDER BY updated_at DESC, id DESC').get(req.tenantId)
  if (geo?.geo_latitude != null && geo?.geo_longitude != null) {
    const lat = Number(latitude), lng = Number(longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'Lokasi tidak terbaca' })
    const toRad = (v) => v * Math.PI / 180
    const dLat = toRad(lat - Number(geo.geo_latitude))
    const dLng = toRad(lng - Number(geo.geo_longitude))
    const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(Number(geo.geo_latitude))) * Math.cos(toRad(lat)) * Math.sin(dLng/2) ** 2
    const distance = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    if (distance > Number(geo.geo_radius || 200)) return res.status(400).json({ error: `Di luar radius sekolah (${Math.round(distance)}m)` })
  }
  const today = todayJakarta()
  const now = timeJakarta()
  // Batas waktu ceklok GTK. Ceklok pulang tetap dibatasi window; ceklok masuk boleh telat (ditandai 'terlambat').
  const tcfg = db.prepare('SELECT ceklok_masuk_mulai, ceklok_masuk_selesai, ceklok_pulang_mulai, ceklok_pulang_selesai FROM settings WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 1').get(req.tenantId) || {}
  let statusMasuk = 'hadir'
  if (type === 'masuk' && tcfg.ceklok_masuk_selesai && now > tcfg.ceklok_masuk_selesai) {
    statusMasuk = 'terlambat' // lewat batas jam masuk: tetap boleh, ditandai terlambat
  }
  if (type === 'pulang' && tcfg.ceklok_pulang_mulai && tcfg.ceklok_pulang_selesai) {
    if (now < tcfg.ceklok_pulang_mulai || now > tcfg.ceklok_pulang_selesai)
      return res.status(400).json({ error: `Di luar jam ceklok pulang (${tcfg.ceklok_pulang_mulai}–${tcfg.ceklok_pulang_selesai})` })
  }
  const exists = db.prepare('SELECT * FROM absensi_guru WHERE gtk_id = ? AND tanggal = ? AND tenant_id = ?').get(gtk.id, today, req.tenantId)
  if (type === 'masuk') {
    if (exists) return res.status(400).json({ error: 'Sudah ceklok masuk hari ini' })
    const id = uuidv4()
    db.prepare('INSERT INTO absensi_guru (id, gtk_id, tanggal, waktu_masuk, latitude, longitude, status, tenant_id) VALUES (?,?,?,?,?,?,?,?)').run(id, gtk.id, today, now, latitude || null, longitude || null, statusMasuk, req.tenantId)
    res.json({ id, waktu_masuk: now, status: statusMasuk })
  } else {
    // Ceklok pulang. Jika belum ceklok masuk (mis. terlambat/lupa), tetap boleh:
    // buat record hari ini dgn waktu_masuk kosong, tandai status agar tercatat.
    if (!exists) {
      const id = uuidv4()
      db.prepare('INSERT INTO absensi_guru (id, gtk_id, tanggal, waktu_masuk, waktu_pulang, latitude, longitude, status, tenant_id) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(id, gtk.id, today, null, now, latitude || null, longitude || null, 'tanpa_masuk', req.tenantId)
      return res.json({ id, waktu_pulang: now, warning: 'Ceklok pulang tercatat, namun Anda belum ceklok masuk hari ini.' })
    }
    if (exists.waktu_pulang) return res.status(400).json({ error: 'Sudah ceklok pulang hari ini' })
    db.prepare('UPDATE absensi_guru SET waktu_pulang=? WHERE id=?').run(now, exists.id)
    res.json({ id: exists.id, waktu_pulang: now })
  }
})


// ==================== JAMAAH / PORTAL / PWA PATCH ====================
db.exec(`CREATE TABLE IF NOT EXISTS jamaah_sesi (id TEXT PRIMARY KEY, nama TEXT, mulai TEXT, selesai TEXT, minimal_hadir INTEGER DEFAULT 10, tenant_id TEXT DEFAULT 'default', created_at TEXT DEFAULT (datetime('now')))`)
for (const [name, definition] of [['pwa_enabled','INTEGER DEFAULT 0'], ['pwa_name','TEXT DEFAULT ""'], ['pwa_icon','TEXT DEFAULT ""'], ['pwa_bg_color','TEXT DEFAULT "#ffffff"'], ['pwa_theme_color','TEXT DEFAULT "#1e40af"']]) if (!db.prepare('PRAGMA table_info(settings)').all().some(c => c.name === name)) db.exec(`ALTER TABLE settings ADD COLUMN ${name} ${definition}`)

function linkedStudentIds(req) {
  const ids = db.prepare('SELECT student_id FROM user_students WHERE tenant_id=? AND user_id=? ORDER BY student_id').all(req.tenantId, req.user.id).map(x => x.student_id)
  if (req.user.role === 'siswa' && !ids.length && req.user.nis) {
    const s = db.prepare('SELECT id FROM siswa WHERE nis=? AND tenant_id=?').get(req.user.nis, req.tenantId)
    if (s) ids.push(s.id)
  }
  return ids
}
function selectLinkedStudent(req) {
  const ids = linkedStudentIds(req)
  const id = req.query.student_id || ids[0]
  if (!id || !ids.includes(String(id))) return null
  return id
}

app.get('/api/pwa/manifest', (req, res) => {
  const s = db.prepare('SELECT pwa_enabled,pwa_name,pwa_icon,nama_lembaga,logo,primary_color,pwa_bg_color,pwa_theme_color FROM settings WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 1').get(req.tenantId) || {}
  if (s.pwa_enabled === 0) return res.status(404).json({ error: 'PWA dinonaktifkan' })
  const t = req.tenant || db.prepare('SELECT nama FROM tenants WHERE id=?').get(req.tenantId) || {}
  const name = s.pwa_name || (t.nama ? t.nama + ' Apps' : 'Jurnalku')
  const icon = s.pwa_icon || s.logo || '/logo-jurnalku-256.png'
  res.type('application/manifest+json').set('Cache-Control', 'no-store').json({ name, short_name: name.slice(0, 24), start_url: '/', scope: '/', display: 'standalone', background_color: s.pwa_bg_color || '#ffffff', theme_color: s.pwa_theme_color || s.primary_color || '#2563eb', icons: [{ src: icon, sizes: '256x256', type: 'image/png' }, { src: icon, sizes: '512x512', type: 'image/png' }] })
})
app.put('/api/settings/pwa', ADMIN, (req, res) => {
  const id = 'main_' + req.tenantId
  db.prepare(`INSERT INTO settings (id,tenant_id,updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(id) DO NOTHING`).run(id, req.tenantId)
  const current = db.prepare('SELECT pwa_icon FROM settings WHERE id=? AND tenant_id=?').get(id, req.tenantId)
  const pwaIcon = req.body.pwa_icon === undefined ? (current?.pwa_icon || '') : (req.body.pwa_icon || '')
  db.prepare(`UPDATE settings SET pwa_enabled=?, pwa_name=?, pwa_icon=?, pwa_bg_color=?, pwa_theme_color=?, updated_at=datetime('now') WHERE id=? AND tenant_id=?`).run(req.body.pwa_enabled ? 1 : 0, req.body.pwa_name || '', pwaIcon, req.body.pwa_bg_color || '#ffffff', req.body.pwa_theme_color || '#1e40af', id, req.tenantId)
  res.json({ success: true })
})

// Regenerate PWA manifest - just returns current manifest (dynamic)
app.post('/api/settings/pwa-manifest', ADMIN, (req, res) => {
  const s = db.prepare('SELECT pwa_name,pwa_icon,nama_lembaga,logo,primary_color,pwa_bg_color,pwa_theme_color FROM settings WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 1').get(req.tenantId) || {}
  const t = req.tenant || db.prepare('SELECT nama FROM tenants WHERE id=?').get(req.tenantId) || {}
  const name = s.pwa_name || (t.nama ? t.nama + ' Apps' : 'Jurnalku')
  const icon = s.pwa_icon || s.logo || '/logo-jurnalku-256.png'
  res.type('application/manifest+json').set('Cache-Control', 'no-store').json({ name, short_name: name.slice(0, 24), start_url: '/', scope: '/', display: 'standalone', background_color: s.pwa_bg_color || '#ffffff', theme_color: s.pwa_theme_color || s.primary_color || '#2563eb', icons: [{ src: icon, sizes: '256x256', type: 'image/png' }, { src: icon, sizes: '512x512', type: 'image/png' }] })
})

app.post('/api/jamaah/sesi', ADMIN, (req, res) => {
  const { nama, mulai, selesai, minimal_hadir, tanggal, data } = req.body
  const dates = Array.isArray(tanggal) ? tanggal : String(tanggal || '').split(',').map(x => x.trim()).filter(Boolean)
  if (!nama || !dates.length || !Array.isArray(data)) return res.status(400).json({ error: 'nama, tanggal[], data wajib' })
  const id = uuidv4()
  const ins = db.prepare('INSERT INTO absensi_kegiatan (id,siswa_id,kegiatan_id,tanggal,status,keterangan,tenant_id) VALUES (?,?,?,?,?,?,?)')
  db.transaction(() => {
    db.prepare('INSERT INTO jamaah_sesi (id,nama,mulai,selesai,minimal_hadir,tenant_id) VALUES (?,?,?,?,?,?)').run(id, nama, mulai || dates[0], selesai || dates[dates.length - 1], Number(minimal_hadir) || 10, req.tenantId)
    for (const d of dates) for (const row of data) ins.run(uuidv4(), row.siswa_id, id, d, row.status || 'hadir', row.keterangan || '', req.tenantId)
  })()
  res.json({ id, count: dates.length * data.length })
})
app.get('/api/jamaah/rekap', authMiddleware, (req, res) => {
  const { mulai, selesai, minimal_hadir } = req.query
  const min = Number(minimal_hadir) || 10
  const rows = db.prepare(`SELECT s.id,s.nis,s.nama,r.nama rombel_nama,COUNT(a.id) total,SUM(a.status='hadir') hadir,SUM(a.status!='hadir') tidak_hadir
    FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
    LEFT JOIN absensi_kegiatan a ON a.siswa_id=s.id AND a.tenant_id=s.tenant_id AND a.kegiatan_id IN (SELECT id FROM jamaah_sesi WHERE tenant_id=s.tenant_id) AND (?='' OR a.tanggal>=?) AND (?='' OR a.tanggal<=?)
    WHERE s.tenant_id=? AND COALESCE(s.status,'aktif')='aktif' GROUP BY s.id ORDER BY r.nama,s.nama`).all(mulai||'', mulai||'', selesai||'', selesai||'', req.tenantId)
    .map(x => ({ ...x, hasil: (x.hadir || 0) >= min ? 'lulus' : 'tidak_lulus', minimal_hadir: min }))
  res.json({ mulai: mulai || '', selesai: selesai || '', minimal_hadir: min, rows })
})


// ==================== JAMAAH REKAP MANUAL ====================
db.exec(`CREATE TABLE IF NOT EXISTS jamaah_rekap_manual (
  id TEXT PRIMARY KEY,
  siswa_id TEXT NOT NULL,
  nama_sesi TEXT DEFAULT 'Shalat Jamaah',
  periode TEXT NOT NULL,
  jumlah_hadir INTEGER DEFAULT 0,
  minimal_hadir INTEGER DEFAULT 10,
  tenant_id TEXT DEFAULT 'default',
  created_at TEXT DEFAULT (datetime('now'))
)`)

app.post('/api/jamaah/rekap-manual', ADMIN, (req, res) => {
  const { nama, periode, minimal_hadir, data } = req.body
  if (!periode || !Array.isArray(data)) return res.status(400).json({ error: 'periode dan data[] wajib' })
  const min = Number(minimal_hadir) || 10
  const ins = db.prepare('INSERT INTO jamaah_rekap_manual (id,siswa_id,nama_sesi,periode,jumlah_hadir,minimal_hadir,tenant_id) VALUES (?,?,?,?,?,?,?)')
  db.transaction(() => {
    for (const row of data) {
      ins.run(uuidv4(), row.siswa_id, nama || 'Shalat Jamaah', periode, Number(row.jumlah_hadir) || 0, min, req.tenantId)
    }
  })()
  res.json({ message: `${data.length} rekap jamaah tersimpan`, count: data.length })
})

app.get('/api/jamaah/rekap-manual', authMiddleware, (req, res) => {
  const min = Number(req.query.minimal_hadir) || 10
  const rows = db.prepare(`SELECT r.id,r.siswa_id,r.nama_sesi,r.periode,r.jumlah_hadir,r.minimal_hadir,r.created_at,
    s.nama,s.nis,rm.nama rombel_nama
    FROM jamaah_rekap_manual r
    LEFT JOIN siswa s ON s.id=r.siswa_id AND s.tenant_id=r.tenant_id
    LEFT JOIN rombel rm ON rm.id=s.rombel_id AND rm.tenant_id=s.tenant_id
    WHERE r.tenant_id=? ORDER BY r.created_at DESC, s.nama`).all(req.tenantId)
    .map(x => ({ ...x, hasil: (x.jumlah_hadir || 0) >= (x.minimal_hadir || min) ? 'lolos' : 'tidak_lolos' }))
  res.json({ rows })
})


// ==================== KEUANGAN (DEBET/KREDIT) ====================
// Akun keuangan
app.get('/api/keuangan/akun', BENDAHARA, (req, res) => {
  res.json(db.prepare('SELECT * FROM keuangan_akun WHERE tenant_id=? ORDER BY nama').all(req.tenantId))
})
app.post('/api/keuangan/akun', BENDAHARA, (req, res) => {
  const { nama, saldo_awal } = req.body
  if (!nama) return res.status(400).json({ error: 'Nama akun wajib' })
  const id = uuidv4()
  db.prepare('INSERT INTO keuangan_akun (id,nama,saldo_awal,tenant_id) VALUES (?,?,?,?)').run(id, nama, Number(saldo_awal)||0, req.tenantId)
  res.json({ id, success: true })
})

// Kategori keuangan
app.get('/api/keuangan/kategori', BENDAHARA, (req, res) => {
  res.json(db.prepare('SELECT * FROM keuangan_kategori WHERE tenant_id=? ORDER BY tipe,nama').all(req.tenantId))
})
app.post('/api/keuangan/kategori', BENDAHARA, (req, res) => {
  const { nama, tipe } = req.body
  if (!nama || !['masuk','keluar'].includes(tipe)) return res.status(400).json({ error: 'Nama & tipe (masuk/keluar) wajib' })
  const id = uuidv4()
  db.prepare('INSERT INTO keuangan_kategori (id,nama,tipe,tenant_id) VALUES (?,?,?,?)').run(id, nama, tipe, req.tenantId)
  res.json({ id, success: true })
})

// Transaksi keuangan
app.get('/api/keuangan/transaksi', BENDAHARA, (req, res) => {
  const { mulai, selesai, tipe, akun_id, kategori_id } = req.query
  let sql = `SELECT t.*, a.nama akun_nama, k.nama kategori_nama FROM keuangan_transaksi t
    LEFT JOIN keuangan_akun a ON a.id=t.akun_id AND a.tenant_id=t.tenant_id
    LEFT JOIN keuangan_kategori k ON k.id=t.kategori_id AND k.tenant_id=t.tenant_id
    WHERE t.tenant_id=?`
  const params = [req.tenantId]
  if (mulai) { sql += ' AND t.tanggal >= ?'; params.push(mulai) }
  if (selesai) { sql += ' AND t.tanggal <= ?'; params.push(selesai) }
  if (tipe) { sql += ' AND t.tipe = ?'; params.push(tipe) }
  if (akun_id) { sql += ' AND t.akun_id = ?'; params.push(akun_id) }
  if (kategori_id) { sql += ' AND t.kategori_id = ?'; params.push(kategori_id) }
  sql += ' ORDER BY t.tanggal DESC, t.created_at DESC'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/keuangan/transaksi', BENDAHARA, (req, res) => {
  const { tanggal, akun_id, kategori_id, tipe, nominal, keterangan } = req.body
  if (!tanggal || !akun_id || !kategori_id || !['masuk','keluar'].includes(tipe)) return res.status(400).json({ error: 'Data tidak lengkap' })
  if (!nominal || Number(nominal) <= 0) return res.status(400).json({ error: 'Nominal harus > 0' })
  const id = uuidv4()
  db.prepare('INSERT INTO keuangan_transaksi (id,tanggal,akun_id,kategori_id,tipe,nominal,keterangan,tenant_id) VALUES (?,?,?,?,?,?,?,?)').run(id, tanggal, akun_id, kategori_id, tipe, Number(nominal), keterangan||'', req.tenantId)
  res.json({ id, success: true })
})

app.delete('/api/keuangan/transaksi/:id', BENDAHARA, (req, res) => {
  db.prepare('DELETE FROM keuangan_transaksi WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
  res.json({ success: true })
})

// Laporan keuangan
app.get('/api/keuangan/laporan', BENDAHARA, (req, res) => {
  const { mulai, selesai } = req.query
  let where = 'WHERE t.tenant_id=?'
  const params = [req.tenantId]
  if (mulai) { where += ' AND t.tanggal >= ?'; params.push(mulai) }
  if (selesai) { where += ' AND t.tanggal <= ?'; params.push(selesai) }
  const debet = db.prepare(`SELECT COALESCE(SUM(nominal),0) total FROM keuangan_transaksi t ${where} AND tipe='masuk'`).get(...params).total
  const kredit = db.prepare(`SELECT COALESCE(SUM(nominal),0) total FROM keuangan_transaksi t ${where} AND tipe='keluar'`).get(...params).total
  const saldo_awal = db.prepare('SELECT COALESCE(SUM(saldo_awal),0) total FROM keuangan_akun WHERE tenant_id=?').get(req.tenantId).total
  const per_kategori = db.prepare(`SELECT k.nama, t.tipe, SUM(t.nominal) total FROM keuangan_transaksi t LEFT JOIN keuangan_kategori k ON k.id=t.kategori_id AND k.tenant_id=t.tenant_id ${where} GROUP BY t.kategori_id, t.tipe ORDER BY t.tipe, k.nama`).all(...params)
  const per_akun = db.prepare(`SELECT a.nama, SUM(CASE WHEN t.tipe='masuk' THEN t.nominal ELSE 0 END) debet, SUM(CASE WHEN t.tipe='keluar' THEN t.nominal ELSE 0 END) kredit FROM keuangan_transaksi t LEFT JOIN keuangan_akun a ON a.id=t.akun_id AND a.tenant_id=t.tenant_id ${where} GROUP BY t.akun_id ORDER BY a.nama`).all(...params)
  res.json({ saldo_awal, debet, kredit, saldo: saldo_awal + debet - kredit, per_kategori, per_akun })
})


// ==================== LAPORAN MINGGUAN/BULANAN ====================
app.get('/api/bendahara/laporan', BENDAHARA, (req, res) => {
  const { mulai, selesai } = req.query
  const tid = req.tenantId
  let dateFilter = ''
  const params = [tid]
  if (mulai) { dateFilter += " AND tanggal_bayar >= ?"; params.push(mulai) }
  if (selesai) { dateFilter += " AND tanggal_bayar <= ?"; params.push(selesai) }

  // Tagihan lunas (uang masuk dari pembayaran)
  const tagihan_masuk = db.prepare(`SELECT COALESCE(SUM(nominal),0) total, COUNT(*) jumlah FROM tagihan WHERE tenant_id=? AND status='lunas'${dateFilter}`).get(...params)

  // Tabungan setor & tarik
  let tabParams = [tid]
  let tabFilter = ''
  if (mulai) { tabFilter += " AND tanggal >= ?"; tabParams.push(mulai) }
  if (selesai) { tabFilter += " AND tanggal <= ?"; tabParams.push(selesai) }
  const tab_setor = db.prepare(`SELECT COALESCE(SUM(nominal),0) total, COUNT(*) jumlah FROM tabungan WHERE tenant_id=? AND tipe='setor'${tabFilter}`).get(...tabParams)
  const tab_tarik = db.prepare(`SELECT COALESCE(SUM(nominal),0) total, COUNT(*) jumlah FROM tabungan WHERE tenant_id=? AND tipe='tarik'${tabFilter}`).get(...tabParams)

  // Keuangan transaksi (debet/kredit)
  let keuParams = [tid]
  let keuFilter = ''
  if (mulai) { keuFilter += " AND tanggal >= ?"; keuParams.push(mulai) }
  if (selesai) { keuFilter += " AND tanggal <= ?"; keuParams.push(selesai) }
  const keu_masuk = db.prepare(`SELECT COALESCE(SUM(nominal),0) total, COUNT(*) jumlah FROM keuangan_transaksi WHERE tenant_id=? AND tipe='masuk'${keuFilter}`).get(...keuParams)
  const keu_keluar = db.prepare(`SELECT COALESCE(SUM(nominal),0) total, COUNT(*) jumlah FROM keuangan_transaksi WHERE tenant_id=? AND tipe='keluar'${keuFilter}`).get(...keuParams)

  // Tagihan belum bayar
  const tagihan_pending = db.prepare("SELECT COALESCE(SUM(nominal),0) total, COUNT(*) jumlah FROM tagihan WHERE tenant_id=? AND status='belum_bayar'").get(tid)

  // Per hari breakdown (untuk chart)
  const harian = db.prepare(`SELECT tanggal_bayar tanggal, SUM(nominal) total FROM tagihan WHERE tenant_id=? AND status='lunas'${dateFilter} GROUP BY tanggal_bayar ORDER BY tanggal_bayar`).all(...params)

  res.json({
    periode: { mulai: mulai || '', selesai: selesai || '' },
    pemasukan: {
      tagihan: tagihan_masuk,
      tabungan_setor: tab_setor,
      keuangan_debet: keu_masuk,
      total: tagihan_masuk.total + tab_setor.total + keu_masuk.total
    },
    pengeluaran: {
      tabungan_tarik: tab_tarik,
      keuangan_kredit: keu_keluar,
      total: tab_tarik.total + keu_keluar.total
    },
    saldo_bersih: (tagihan_masuk.total + tab_setor.total + keu_masuk.total) - (tab_tarik.total + keu_keluar.total),
    tagihan_pending,
    harian
  })
})

app.get('/api/siswa/portal', authMiddleware, (req, res) => {
  if (!['siswa','wali_murid'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' })
  const id = selectLinkedStudent(req)
  if (!id) return res.json({ children: linkedStudentIds(req).map(x => db.prepare('SELECT id,nama,nis FROM siswa WHERE id=? AND tenant_id=?').get(x, req.tenantId)).filter(Boolean) })
  const siswa = db.prepare('SELECT s.*,r.nama rombel_nama FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id WHERE s.id=? AND s.tenant_id=?').get(id, req.tenantId)
  const tagihan = db.prepare(`SELECT t.*,jt.nama jenis_nama FROM tagihan t LEFT JOIN jenis_tagihan jt ON jt.id=t.jenis_tagihan_id AND jt.tenant_id=t.tenant_id WHERE t.siswa_id=? AND t.tenant_id=? ORDER BY t.created_at DESC`).all(id, req.tenantId)
  const tabungan = db.prepare('SELECT * FROM tabungan WHERE siswa_id=? AND tenant_id=? ORDER BY created_at DESC LIMIT 50').all(id, req.tenantId)
  const saldo = tabungan[0]?.saldo_akhir || 0
  res.json({ siswa, absensi_harian: db.prepare('SELECT * FROM absensi_siswa WHERE siswa_id=? AND tenant_id=? ORDER BY tanggal DESC LIMIT 60').all(id, req.tenantId), jamaah: db.prepare(`SELECT a.*,j.nama sesi_nama FROM absensi_kegiatan a LEFT JOIN jamaah_sesi j ON j.id=a.kegiatan_id AND j.tenant_id=a.tenant_id WHERE a.siswa_id=? AND a.tenant_id=? AND j.id IS NOT NULL ORDER BY a.tanggal DESC`).all(id, req.tenantId), ekskul: db.prepare(`SELECT a.*,e.nama ekskul_nama FROM absensi_ekskul a LEFT JOIN ekskul e ON e.id=a.ekskul_id AND e.tenant_id=a.tenant_id WHERE a.siswa_id=? AND a.tenant_id=? ORDER BY a.tanggal DESC`).all(id, req.tenantId), kegiatan: db.prepare(`SELECT a.*,k.nama kegiatan_nama,k.jenis FROM absensi_kegiatan a LEFT JOIN kegiatan_khusus k ON k.id=a.kegiatan_id AND k.tenant_id=a.tenant_id WHERE a.siswa_id=? AND a.tenant_id=? ORDER BY a.tanggal DESC`).all(id, req.tenantId), nilai: db.prepare(`SELECT p.*,m.nama mapel_nama FROM penilaian_harian p LEFT JOIN mapel m ON m.id=p.mapel_id AND m.tenant_id=p.tenant_id WHERE p.siswa_id=? AND p.tenant_id=? ORDER BY p.tanggal DESC`).all(id, req.tenantId), tagihan, tabungan, saldo })
})

// ==================== SISWA DASHBOARD ====================
app.get('/api/siswa/dashboard', authMiddleware, (req, res) => {
  if (!['siswa', 'wali_murid'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' })
  let linked = db.prepare('SELECT student_id FROM user_students WHERE tenant_id=? AND user_id=? ORDER BY student_id').all(req.tenantId, req.user.id).map(x => x.student_id)
  if (!linked.length && req.user.role === 'siswa' && req.user.nis) {
    const row = db.prepare('SELECT id FROM siswa WHERE tenant_id=? AND (nis=? OR nisn=?)').get(req.tenantId, req.user.nis, req.user.nis)
    if (row) linked = [row.id]
  }
  if (!linked.length && req.user.role === 'siswa') {
    const userRow = db.prepare('SELECT nis,siswa_id FROM users WHERE id=? AND tenant_id=?').get(req.user.id, req.tenantId)
    if (userRow?.siswa_id) linked = [userRow.siswa_id]
    else if (userRow?.nis) {
      const row = db.prepare('SELECT id FROM siswa WHERE tenant_id=? AND (nis=? OR nisn=?)').get(req.tenantId, userRow.nis, userRow.nis)
      if (row) linked = [row.id]
    }
  }
  let selected = req.query.student_id
  if (!selected && req.user.role === 'siswa') selected = linked[0]
  if (!selected && req.user.role === 'wali_murid' && linked.length === 1) selected = linked[0]
  const children = linked.map(id => db.prepare('SELECT id,nama,nis,foto,rombel_id FROM siswa WHERE id=? AND tenant_id=?').get(id, req.tenantId)).filter(Boolean)
  if (!selected) return res.json({ children, siswa: null, jadwal_hari_ini: [], rekap: { hadir: 0, sakit: 0, izin: 0, alpha: 0 }, absensi_detail: [], tagihan_detail: [], nilai_detail: [], tabungan_detail: [], tagihan: { total: 0, belum_bayar: 0, lunas: 0 }, tabungan: { saldo: 0, setor: 0, tarik: 0 } })
  if (!linked.includes(String(selected))) return res.status(403).json({ error: 'Bukan siswa/anak tertaut' })
  const siswa = db.prepare('SELECT * FROM siswa WHERE id=? AND tenant_id=?').get(selected, req.tenantId)
  if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan' })
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  const today = days[new Date().getDay()].toLowerCase()
  const jadwal = db.prepare(`SELECT j.*, m.nama as mapel_nama, g.nama as guru_nama FROM jadwal j LEFT JOIN mapel m ON j.mapel_id = m.id AND m.tenant_id=j.tenant_id LEFT JOIN gtk g ON j.gtk_id = g.id AND g.tenant_id=j.tenant_id WHERE j.tenant_id=? AND j.rombel_id = ? AND lower(j.hari) = ? ORDER BY j.jam_mulai`).all(req.tenantId, siswa.rombel_id, today)
  const bulan = todayJakarta().slice(0, 7) + '%'
  const count = status => db.prepare('SELECT COUNT(*) as c FROM absensi_siswa WHERE tenant_id=? AND siswa_id=? AND tanggal LIKE ? AND status=?').get(req.tenantId, siswa.id, bulan, status).c
  const [hadir, sakit, izin, alpha] = ['hadir','sakit','izin','alpha'].map(count)
  const absensi_detail = db.prepare('SELECT tanggal,status,waktu_absen,keterangan FROM absensi_siswa WHERE siswa_id=? AND tenant_id=? ORDER BY tanggal DESC LIMIT 20').all(siswa.id, req.tenantId)
  const kegiatan_detail = db.prepare(`SELECT a.tanggal,a.status,a.keterangan,k.nama kegiatan_nama,k.jenis FROM absensi_kegiatan a LEFT JOIN kegiatan_khusus k ON k.id=a.kegiatan_id AND k.tenant_id=a.tenant_id WHERE a.siswa_id=? AND a.tenant_id=? AND k.id IS NOT NULL ORDER BY a.tanggal DESC LIMIT 20`).all(siswa.id, req.tenantId)
  const jamaah_detail = db.prepare(`SELECT a.tanggal,a.status,a.keterangan,j.nama sesi_nama FROM absensi_kegiatan a LEFT JOIN jamaah_sesi j ON j.id=a.kegiatan_id AND j.tenant_id=a.tenant_id WHERE a.siswa_id=? AND a.tenant_id=? AND j.id IS NOT NULL ORDER BY a.tanggal DESC LIMIT 20`).all(siswa.id, req.tenantId)
  const ekskul_detail = db.prepare(`SELECT a.tanggal,a.status,a.keterangan,e.nama ekskul_nama FROM absensi_ekskul a LEFT JOIN ekskul e ON e.id=a.ekskul_id AND e.tenant_id=a.tenant_id WHERE a.siswa_id=? AND a.tenant_id=? ORDER BY a.tanggal DESC LIMIT 20`).all(siswa.id, req.tenantId)
  const tagihan_detail = db.prepare(`SELECT t.id,t.bulan,t.tahun,t.nominal,t.status,t.tanggal_bayar,t.keterangan,j.nama as jenis_nama FROM tagihan t LEFT JOIN jenis_tagihan j ON j.id=t.jenis_tagihan_id AND j.tenant_id=t.tenant_id WHERE t.siswa_id=? AND t.tenant_id=? ORDER BY t.tahun DESC,t.bulan DESC LIMIT 20`).all(siswa.id, req.tenantId)
  const nilai_detail = db.prepare(`SELECT p.tanggal,p.sikap,p.keaktifan,p.pengetahuan,p.catatan,m.nama as mapel_nama FROM penilaian_harian p LEFT JOIN mapel m ON m.id=p.mapel_id AND m.tenant_id=p.tenant_id WHERE p.siswa_id=? AND p.tenant_id=? ORDER BY p.tanggal DESC LIMIT 20`).all(siswa.id, req.tenantId)
  const tabungan_detail = db.prepare('SELECT tanggal,tipe,nominal,saldo_akhir,keterangan FROM tabungan WHERE siswa_id=? AND tenant_id=? ORDER BY created_at DESC LIMIT 20').all(siswa.id, req.tenantId)
  const rekapKategori = rows => rows.reduce((a,r)=>{ const k=(r.status||'lain').toLowerCase(); a[k]=(a[k]||0)+1; return a }, {})
  const tagihanAll = db.prepare('SELECT nominal,status FROM tagihan WHERE siswa_id=? AND tenant_id=?').all(siswa.id, req.tenantId)
  const tabunganAll = db.prepare('SELECT tipe,nominal,saldo_akhir FROM tabungan WHERE siswa_id=? AND tenant_id=? ORDER BY created_at DESC').all(siswa.id, req.tenantId)
  const nilaiRapor = db.prepare(`SELECT r.*,m.nama mapel_nama FROM rapor r LEFT JOIN mapel m ON m.id=r.mapel_id AND m.tenant_id=r.tenant_id WHERE r.siswa_id=? AND r.tenant_id=? ORDER BY r.updated_at DESC LIMIT 20`).all(siswa.id, req.tenantId)
  const nilaiAll = nilai_detail.length ? nilai_detail : nilaiRapor.map(r => ({ tanggal: r.updated_at, mapel_nama: r.mapel_nama, pengetahuan: r.nilai_pengetahuan, keaktifan: r.nilai_keterampilan, sikap: r.nilai_sikap, catatan: r.deskripsi }))
  const tagihan = { total: tagihanAll.reduce((n,t)=>n+Number(t.nominal||0),0), belum_bayar: tagihanAll.filter(t=>!['lunas','sudah_bayar'].includes(t.status)).reduce((n,t)=>n+Number(t.nominal||0),0), lunas: tagihanAll.filter(t=>['lunas','sudah_bayar'].includes(t.status)).reduce((n,t)=>n+Number(t.nominal||0),0) }
  const tabungan = { saldo: tabunganAll[0]?.saldo_akhir || 0, setor: tabunganAll.filter(t=>t.tipe==='setor').reduce((n,t)=>n+Number(t.nominal||0),0), tarik: tabunganAll.filter(t=>t.tipe==='tarik').reduce((n,t)=>n+Number(t.nominal||0),0) }
  const tugas = siswa?.rombel_id ? db.prepare(`SELECT t.*, m.nama mapel_nama, g.nama guru_nama FROM tugas_siswa t LEFT JOIN mapel m ON m.id=t.mapel_id AND m.tenant_id=t.tenant_id LEFT JOIN gtk g ON g.id=t.guru_id AND g.tenant_id=t.tenant_id WHERE t.rombel_id=? AND t.tenant_id=? ORDER BY COALESCE(t.deadline,t.created_at) DESC LIMIT 30`).all(siswa.rombel_id, req.tenantId) : []
  let catatan_kepribadian = [], kokurikuler_detail = [], kegiatan_lain_detail = []
  if (siswa?.id) {
    try { catatan_kepribadian = db.prepare('SELECT tahun_ajaran,semester,COALESCE(catatan_umum,catatan_wali_kelas,\'\') catatan_umum,COALESCE(catatan_akademik,\'\') catatan_akademik,COALESCE(catatan_sosial,sikap_sosial,\'\') catatan_sosial,COALESCE(catatan_spiritual,sikap_spiritual,\'\') catatan_spiritual,saran FROM catatan_kepribadian WHERE siswa_id=? AND tenant_id=? ORDER BY tahun_ajaran DESC,semester DESC LIMIT 4').all(siswa.id, req.tenantId) } catch { catatan_kepribadian = [] }
    try { kokurikuler_detail = db.prepare(`SELECT a.tanggal,a.status,a.keterangan,k.nama kegiatan_nama,k.jenis FROM absensi_kegiatan a LEFT JOIN kegiatan_khusus k ON k.id=a.kegiatan_id AND k.tenant_id=a.tenant_id WHERE a.siswa_id=? AND a.tenant_id=? AND k.jenis='kokurikuler' ORDER BY a.tanggal DESC LIMIT 20`).all(siswa.id, req.tenantId) } catch { kokurikuler_detail = [] }
    try { kegiatan_lain_detail = db.prepare(`SELECT a.tanggal,a.status,a.keterangan,k.nama kegiatan_nama,k.jenis FROM absensi_kegiatan a LEFT JOIN kegiatan_khusus k ON k.id=a.kegiatan_id AND k.tenant_id=a.tenant_id WHERE a.siswa_id=? AND a.tenant_id=? AND (k.jenis IS NULL OR k.jenis NOT IN ('kokurikuler')) ORDER BY a.tanggal DESC LIMIT 20`).all(siswa.id, req.tenantId) } catch { kegiatan_lain_detail = [] }
  }
  res.json({ children, siswa, jadwal_hari_ini: jadwal, tugas, rekap: { hadir, sakit, izin, alpha }, rekap_lengkap: { kbm: rekapKategori(absensi_detail), kegiatan: rekapKategori(kegiatan_detail), jamaah: rekapKategori(jamaah_detail), ekskul: rekapKategori(ekskul_detail), kokurikuler: rekapKategori(kokurikuler_detail), kegiatan_lain: rekapKategori(kegiatan_lain_detail) }, absensi_detail, kegiatan_detail, jamaah_detail, ekskul_detail, kokurikuler_detail, kegiatan_lain_detail, tagihan_detail, nilai_detail: nilaiAll, tabungan_detail, tagihan, tabungan, catatan_kepribadian })
})

// ==================== SISWA JADWAL ====================
app.get('/api/siswa/jadwal', authMiddleware, (req, res) => {
  const studentId = selectLinkedStudent(req)
  const siswa = studentId ? db.prepare('SELECT * FROM siswa WHERE id = ? AND tenant_id = ?').get(studentId, req.tenantId) : null
  if (!siswa || !siswa.rombel_id) return res.json([])
  const rows = db.prepare(`SELECT j.*, m.nama as mapel_nama, g.nama as guru_nama FROM jadwal j LEFT JOIN mapel m ON j.mapel_id = m.id AND m.tenant_id = j.tenant_id LEFT JOIN gtk g ON j.gtk_id = g.id AND g.tenant_id = j.tenant_id WHERE j.rombel_id = ? AND j.tenant_id = ? ORDER BY j.hari, j.jam_mulai`).all(siswa.rombel_id, req.tenantId)
  res.json(rows)
})

// ==================== SISWA ABSENSI ====================
app.get('/api/rekap-absensi-siswa/rombel', authMiddleware, (req, res) => {
  const { rombel_id, bulan } = req.query
  if (!rombel_id) return res.status(400).json({ error: 'rombel_id wajib' })
  const ym = String(bulan || todayJakarta().slice(0, 7))
  const siswaRows = db.prepare(`SELECT s.*, r.nama as rombel_nama FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id WHERE s.rombel_id=? AND s.tenant_id=? ORDER BY s.nama`).all(rombel_id, req.tenantId)
  const abs = db.prepare(`SELECT siswa_id, tanggal, status FROM absensi_siswa WHERE rombel_id=? AND tenant_id=? AND tanggal LIKE ?`).all(rombel_id, req.tenantId, ym + '%')
  const by = {}
  for (const a of abs) (by[a.siswa_id] ||= {})[Number(a.tanggal.slice(8, 10))] = a.status
  const rows = siswaRows.map(s => {
    const hari = by[s.id] || {}
    const c = st => Object.values(hari).filter(x => x === st).length
    return { ...s, hari, sakit: c('sakit'), izin: c('izin'), alpha: c('alpha'), hadir: c('hadir') }
  })
  res.json({ bulan: ym, rombel: siswaRows[0]?.rombel_nama || '', rows })
})

app.get('/api/siswa/absensi', authMiddleware, (req, res) => {
  // resolve siswa from user account (scoped to tenant)
  let siswaId = req.user.siswa_id || null
  if (!siswaId && req.user.nis) {
    const s = db.prepare('SELECT id FROM siswa WHERE nis=? AND tenant_id=?').get(req.user.nis, req.tenantId)
      || db.prepare('SELECT id FROM siswa WHERE nisn=? AND tenant_id=?').get(req.user.nis, req.tenantId)
      || db.prepare('SELECT id FROM siswa WHERE nis=?').get(req.user.nis)
    siswaId = s?.id || null
  }
  if (!siswaId) return res.json([])
  res.json(db.prepare('SELECT * FROM absensi_siswa WHERE siswa_id=? AND tenant_id=? ORDER BY tanggal DESC LIMIT 90').all(siswaId, req.tenantId))
})

// ==================== SISWA EKSKUL ====================
app.get('/api/siswa/penilaian', authMiddleware, (req, res) => {
  if (!['siswa', 'wali_murid'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' })
  const linked = db.prepare('SELECT student_id FROM user_students WHERE tenant_id=? AND user_id=? ORDER BY student_id').all(req.tenantId, req.user.id).map(row => row.student_id)
  let studentId
  try { studentId = selectPenilaianStudentId(req.user.role, linked, req.query.student_id) }
  catch (error) { return res.status(403).json({ error: error.message }) }
  const siswa = db.prepare('SELECT id FROM siswa WHERE id=? AND tenant_id=?').get(studentId, req.tenantId)
  if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan' })
  res.json(db.prepare(`SELECT p.tanggal, p.sikap, p.keaktifan, p.pengetahuan, p.catatan, m.nama AS mapel_nama
    FROM penilaian_harian p LEFT JOIN mapel m ON m.id=p.mapel_id AND m.tenant_id=p.tenant_id
    WHERE p.siswa_id=? AND p.tenant_id=? ORDER BY p.tanggal DESC`).all(studentId, req.tenantId))
})

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
for (const [name, definition] of [
  ['notif_jadwal_guru', 'INTEGER DEFAULT 0'],
  ['template_jadwal_guru', "TEXT DEFAULT 'Assalamualaikum {nama_guru}, sekarang waktunya mengajar {mapel} di rombel {rombel}, pukul {jam_mulai}-{jam_selesai} pada {tanggal}. - {lembaga}'"],
  ['tenant_id', 'TEXT']
]) if (!db.prepare('PRAGMA table_info(notif_settings)').all().some(c => c.name === name)) db.exec(`ALTER TABLE notif_settings ADD COLUMN ${name} ${definition}`)

app.get('/api/notif-settings', authMiddleware, (req, res) => {
  res.json(db.prepare("SELECT * FROM notif_settings WHERE tenant_id = ?").get(req.tenantId) || {})
})

app.put('/api/notif-settings', ADMIN, (req, res) => {
  const { absensi_siswa_ke_wali, guru_belum_ceklok, batas_ceklok_guru, template_absensi_wali, template_guru_ceklok, notif_jadwal_guru, template_jadwal_guru } = req.body
  db.prepare("UPDATE notif_settings SET absensi_siswa_ke_wali=?, guru_belum_ceklok=?, batas_ceklok_guru=?, template_absensi_wali=?, template_guru_ceklok=?, notif_jadwal_guru=?, template_jadwal_guru=? WHERE tenant_id=?")
    .run(absensi_siswa_ke_wali ? 1 : 0, guru_belum_ceklok ? 1 : 0, batas_ceklok_guru || '07:30', template_absensi_wali || '', template_guru_ceklok || '', notif_jadwal_guru ? 1 : 0, template_jadwal_guru || '', req.tenantId)
  res.json({ success: true })
})

app.get('/api/notif-whitelist', ADMIN, (req, res) => {
  res.json(db.prepare('SELECT * FROM wa_notif_whitelist WHERE tenant_id=? ORDER BY created_at DESC').all(req.tenantId))
})
app.post('/api/notif-whitelist', ADMIN, (req, res) => {
  const { target_type, target_id, phone, reason } = req.body
  db.prepare('INSERT INTO wa_notif_whitelist(id,tenant_id,target_type,target_id,phone,reason,aktif) VALUES(?,?,?,?,?,?,1)').run(uuidv4(), req.tenantId, target_type || 'phone', target_id || '', waQueue.normalizePhone(phone || ''), reason || '')
  res.json({ success: true })
})
app.delete('/api/notif-whitelist/:id', ADMIN, (req, res) => {
  db.prepare('DELETE FROM wa_notif_whitelist WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
  res.json({ success: true })
})
app.post('/api/notif/jadwal-guru', STAFF, (req, res) => {
  res.json({ success: true, ...waQueue.queueDueSchedules(db, { tenantId: req.tenantId, date: todayJakarta(), time: timeJakarta() }) })
})

// ==================== NOTIFIKASI WA OTOMATIS ====================
// Dipanggil saat absensi siswa disimpan - kirim notif ke wali murid
async function sendAbsensiNotifToWali(siswaId, status, tanggal) {
  const siswa = db.prepare('SELECT tenant_id FROM siswa WHERE id = ?').get(siswaId)
  if (siswa) waQueue.queueWaliAttendance(db, { tenantId: siswa.tenant_id, studentId: siswaId, date: tanggal, session: status.includes('(pulang)') ? 'pulang' : 'masuk', status: status.replace(' (pulang)', '') })
}

// Cron-like check: guru belum ceklok (dipanggil via endpoint manual atau scheduler)
app.post('/api/notif/cek-guru-ceklok', STAFF, (req, res) => {
  res.json({ success: true, ...waQueue.queueDueTeachers(db, { tenantId: req.tenantId, date: todayJakarta(), time: timeJakarta() }) })
})

// ==================== REKAP ABSENSI ====================
// mode: 'monthly' (default, param bulan=YYYY-MM), 'weekly' (param mulai=YYYY-MM-DD; 7 hari),
//       'semester' (param tahun_ajaran=YYYY/YYYY + semester=ganjil|genap),
//       'yearly'   (param tahun=YYYY -> 12 bulan). tipe: 'siswa' | 'gtk'.
function buildRekapRange(q) {
  const mode = (q.mode || 'monthly').toLowerCase()
  if (mode === 'daily' || mode === 'harian') {
    const date = q.tanggal || q.mulai || q.tanggal_mulai
    if (!date) return { error: 'Parameter tanggal/mulai (YYYY-MM-DD) wajib untuk mode daily' }
    const d = new Date(date + 'T00:00:00')
    if (isNaN(d.getTime())) return { error: 'Format tanggal tidak valid' }
    const iso = x => `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`
    return { mode: 'daily', from: iso(d), to: iso(d), label: `Harian ${iso(d)}` }
  }
  if (mode === 'weekly') {
    const start = q.mulai || q.tanggal_mulai
    if (!start) return { error: 'Parameter mulai (YYYY-MM-DD) wajib untuk mode weekly' }
    const d = new Date(start + 'T00:00:00')
    if (isNaN(d.getTime())) return { error: 'Format mulai tidak valid' }
    const explicitEnd = q.selesai || q.tanggal_selesai || q.to
    const end = explicitEnd ? new Date(explicitEnd + 'T00:00:00') : new Date(d.getTime() + 6 * 86400000)
    if (isNaN(end.getTime())) return { error: 'Format selesai tidak valid' }
    const iso = x => `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`
    return { mode, from: iso(d), to: iso(end), label: `Minggu ${iso(d)} s/d ${iso(end)}` }
  }
  if (mode === 'semester') {
    const ta = q.tahun_ajaran
    const sem = (q.semester || '').toLowerCase()
    if (!ta || !['ganjil', 'genap'].includes(sem)) return { error: 'tahun_ajaran (YYYY/YYYY) & semester (ganjil|genap) wajib' }
    const [ay1, ay2] = ta.split('/').map(x => parseInt(x, 10))
    if (!ay1 || !ay2) return { error: 'Format tahun_ajaran salah' }
    // Ganjil: Jul(y1)-Des(y1); Genap: Jan(y2)-Jun(y2)
    if (sem === 'ganjil') return { mode, from: `${ay1}-07-01`, to: `${ay1}-12-31`, label: `Semester Ganjil ${ta}` }
    return { mode, from: `${ay2}-01-01`, to: `${ay2}-06-30`, label: `Semester Genap ${ta}` }
  }
  if (mode === 'yearly') {
    const y = parseInt(q.tahun || '', 10)
    if (!y) return { error: 'Parameter tahun (YYYY) wajib' }
    return { mode, from: `${y}-01-01`, to: `${y}-12-31`, label: `Tahun ${y}` }
  }
  // monthly (default)
  const bulan = q.bulan
  if (!bulan) return { error: 'Parameter bulan (YYYY-MM) wajib' }
  const [yy, mm] = bulan.split('-').map(x => parseInt(x, 10))
  if (!yy || !mm) return { error: 'Format bulan salah' }
  const lastDay = new Date(yy, mm, 0).getDate()
  return { mode: 'monthly', from: `${bulan}-01`, to: `${bulan}-${String(lastDay).padStart(2, '0')}`, label: `Bulan ${bulan}` }
}

app.get('/api/rekap-absensi', authMiddleware, (req, res) => {
  const { tipe } = req.query
  // Backward compat: kalau hanya bulan+tipe -> monthly.
  const range = buildRekapRange(req.query)
  if (range.error) return res.status(400).json({ error: range.error })
  const { from, to, mode, label } = range

  const cnt = (table, id, col, status) =>
    db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE ${col}=? AND tanggal BETWEEN ? AND ? AND status=? AND tenant_id=?`)
      .get(id, from, to, status, req.tenantId).c

  if (tipe === 'gtk') {
    const gtks = db.prepare("SELECT id, nama, nip, jabatan FROM gtk WHERE tenant_id = ? ORDER BY nama").all(req.tenantId)
    const detail = gtks.map(g => {
      const hadir = cnt('absensi_guru', g.id, 'gtk_id', 'hadir')
      const sakit = cnt('absensi_guru', g.id, 'gtk_id', 'sakit')
      const izin  = cnt('absensi_guru', g.id, 'gtk_id', 'izin')
      const alpha = cnt('absensi_guru', g.id, 'gtk_id', 'alpha')
      return { ...g, hadir, sakit, izin, alpha, total: hadir + sakit + izin + alpha }
    })
    const summary = { hadir: detail.reduce((s,d) => s+d.hadir, 0), sakit: detail.reduce((s,d) => s+d.sakit, 0), izin: detail.reduce((s,d) => s+d.izin, 0), alpha: detail.reduce((s,d) => s+d.alpha, 0) }
    return res.json({ mode, from, to, label, detail, summary })
  }
  const siswa = db.prepare("SELECT s.id, s.nama, s.nis, s.nisn, r.nama as rombel_nama FROM siswa s LEFT JOIN rombel r ON s.rombel_id = r.id WHERE s.tenant_id = ? ORDER BY r.nama, s.nama").all(req.tenantId)
  const detail = siswa.map(s => {
    const hadir = cnt('absensi_siswa', s.id, 'siswa_id', 'hadir')
    const sakit = cnt('absensi_siswa', s.id, 'siswa_id', 'sakit')
    const izin  = cnt('absensi_siswa', s.id, 'siswa_id', 'izin')
    const alpha = cnt('absensi_siswa', s.id, 'siswa_id', 'alpha')
    const byDateRows = db.prepare(`SELECT tanggal, status FROM absensi_siswa WHERE siswa_id=? AND tanggal BETWEEN ? AND ? AND tenant_id=? ORDER BY tanggal`).all(s.id, from, to, req.tenantId)
    const per_tanggal = {}
    byDateRows.forEach(r => { per_tanggal[r.tanggal] = (String(r.status || '').charAt(0) || '').toUpperCase() })
    return { ...s, hadir, sakit, izin, alpha, total: hadir + sakit + izin + alpha, per_tanggal }
  })
  const summary = { hadir: detail.reduce((s,d) => s+d.hadir, 0), sakit: detail.reduce((s,d) => s+d.sakit, 0), izin: detail.reduce((s,d) => s+d.izin, 0), alpha: detail.reduce((s,d) => s+d.alpha, 0) }
  res.json({ mode, from, to, label, detail, summary })
})


const { dayNameForDate, isHoliday } = require('./holiday-rules.cjs')

function isHolidayDate(tanggal, tenantId) {
  if (tenantId) {
    const settings = db.prepare('SELECT hari_libur FROM settings WHERE tenant_id=?').get(tenantId)
    const events = db.prepare("SELECT jenis FROM kalender_kbm WHERE tenant_id=? AND tanggal=? AND jenis='libur'").all(tenantId, tanggal)
    return isHoliday({ date: tanggal, holidayDays: settings?.hari_libur, calendarEvents: events })
  }
  return ['jumat', 'minggu'].includes(dayNameForDate(tanggal))
}
function assertKbmActive(req, tanggal) {
  if (isHolidayDate(tanggal, req.tenantId)) throw new Error('Hari libur: absensi nonaktif')
  const row = db.prepare("SELECT id FROM kalender_kbm WHERE tenant_id=? AND tanggal=? AND jenis='kbm_aktif' LIMIT 1").get(req.tenantId, tanggal)
  if (!row) throw new Error('KBM belum diaktifkan di Kalender KBM untuk tanggal ini')
}
function dateRange(start, end) {
  const out=[], a=new Date(String(start)+'T00:00:00+07:00'), b=new Date(String(end)+'T00:00:00+07:00')
  if (isNaN(a) || isNaN(b) || a>b) return out
  for (let d=new Date(a); d<=b; d.setDate(d.getDate()+1)) out.push(d.toISOString().slice(0,10))
  return out
}

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

app.get('/api/kalender-kbm/status', authMiddleware, (req, res) => {
  const tanggal = req.query.tanggal || todayJakarta()
  const aktif = !!db.prepare("SELECT id FROM kalender_kbm WHERE tenant_id=? AND tanggal=? AND jenis='kbm_aktif' LIMIT 1").get(req.tenantId, tanggal)
  res.json({ tanggal, aktif: !isHolidayDate(tanggal, req.tenantId) && aktif, libur: isHolidayDate(tanggal, req.tenantId) })
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

// Mapel + rombel yg diampu guru yang login (utk penilaian & fitur guru). Auto-scope by pengajar.
app.get('/api/guru/pengajar-saya', authMiddleware, (req, res) => {
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  if (!gtk) return res.json({ gtk: null, mapel: [], rombel: [], pengajar: [] })
  const rows = db.prepare(`SELECT p.*, m.nama as mapel_nama, r.nama as rombel_nama, r.tingkat as rombel_tingkat
    FROM pengajar p
    LEFT JOIN mapel m ON p.mapel_id = m.id
    LEFT JOIN rombel r ON p.rombel_id = r.id
    WHERE p.gtk_id = ? AND p.tenant_id = ?
    ORDER BY r.tingkat, r.nama, m.nama`).all(gtk.id, req.tenantId)
  const mapelMap = new Map(), rombelMap = new Map()
  rows.forEach(p => {
    if (p.mapel_id && !mapelMap.has(p.mapel_id)) mapelMap.set(p.mapel_id, { id: p.mapel_id, nama: p.mapel_nama })
    if (p.rombel_id && !rombelMap.has(p.rombel_id)) rombelMap.set(p.rombel_id, { id: p.rombel_id, nama: p.rombel_nama, tingkat: p.rombel_tingkat })
  })
  res.json({ gtk, mapel: [...mapelMap.values()], rombel: [...rombelMap.values()], pengajar: rows })
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




function ensurePengajarFromJadwal({ gtk_id, mapel_id, rombel_id, tenant_id }) {
  if (!gtk_id || !mapel_id || !rombel_id) return
  const exists = db.prepare('SELECT id FROM pengajar WHERE gtk_id=? AND mapel_id=? AND rombel_id=? AND tenant_id=?').get(gtk_id, mapel_id, rombel_id, tenant_id)
  if (!exists) db.prepare('INSERT INTO pengajar (id, gtk_id, mapel_id, rombel_id, jam_per_minggu, tenant_id) VALUES (?,?,?,?,?,?)').run(uuidv4(), gtk_id, mapel_id, rombel_id, 2, tenant_id)
}

// ==================== JADWAL ====================
app.get('/api/jadwal', authMiddleware, (req, res) => {
  const { rombel_id, gtk_id } = req.query
  let sql = `SELECT j.*, m.nama as mapel_nama, m.kode as mapel_kode, r.nama as rombel_nama, g.nama as gtk_nama, g.nama as guru_nama, CASE WHEN g.id IS NULL THEN 0 ELSE 1 END as guru_valid FROM jadwal j LEFT JOIN mapel m ON j.mapel_id = m.id AND m.tenant_id = j.tenant_id LEFT JOIN rombel r ON j.rombel_id = r.id AND r.tenant_id = j.tenant_id LEFT JOIN gtk g ON j.gtk_id = g.id AND g.tenant_id = j.tenant_id WHERE j.tenant_id=?`
  const params = [req.tenantId]
  if (rombel_id) { sql += ' AND j.rombel_id = ?'; params.push(rombel_id) }
  if (gtk_id) { sql += ' AND j.gtk_id = ?'; params.push(gtk_id) }
  sql += ' ORDER BY j.hari, j.jam_mulai'
  let rows = db.prepare(sql).all(...params)
  if (gtk_id && !rows.length) rows = pengajarAsJadwal(gtk_id, req.tenantId)
  res.json(gtk_id ? rows.map(titleHari) : rows)
})

app.patch('/api/jadwal/bulk-guru', ADMIN, (req, res) => {
  try {
    res.json(bulkAssignGuru(db, req.tenantId, req.body?.schedule_ids, req.body?.gtk_id))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.post('/api/jadwal/import', ADMIN, (req, res) => {
  try { res.json(importJadwalRows(db, req.tenantId, req.body?.rows, uuidv4)) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

app.post('/api/jadwal', ADMIN, (req, res) => {
  const { mapel_id, rombel_id, gtk_id, hari, jam_mulai, jam_selesai, ruangan, template_id, jenis_kegiatan, nama_kegiatan } = req.body
  const jenis = jenis_kegiatan || 'mapel'
  const overlap = '((j.jam_mulai < ? AND j.jam_selesai > ?) OR (j.jam_mulai < ? AND j.jam_selesai > ?) OR (j.jam_mulai >= ? AND j.jam_selesai <= ?))'
  const ovParams = [jam_selesai, jam_mulai, jam_selesai, jam_mulai, jam_mulai, jam_selesai]
  if (!rombel_id && jenis !== 'kegiatan' && jenis !== 'istirahat') return res.status(400).json({ error: 'Rombel wajib dipilih.' })
  if (!rombel_id) {
    const targets = db.prepare('SELECT id FROM rombel WHERE tenant_id=?').all(req.tenantId)
    if (!targets.length) return res.status(400).json({ error: 'Belum ada rombel.' })
    const insert = db.prepare('INSERT INTO jadwal (id, mapel_id, rombel_id, gtk_id, hari, jam_mulai, jam_selesai, ruangan, template_id, jenis_kegiatan, nama_kegiatan, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    db.transaction(() => targets.forEach(r => insert.run(uuidv4(), mapel_id || null, r.id, gtk_id || null, hari, jam_mulai, jam_selesai, ruangan, template_id || null, jenis, nama_kegiatan || '', req.tenantId)))()
    return res.json({ created: targets.length })
  }
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
  // 4. Validasi maks JTM per minggu bila template dipilih
  if (template_id) {
    const tpl = db.prepare('SELECT * FROM template_jadwal WHERE id=? AND tenant_id=?').get(template_id, req.tenantId)
    if (tpl) {
      const jamGuru = db.prepare('SELECT COUNT(*) as c FROM jadwal WHERE gtk_id=? AND template_id=? AND tenant_id=?').get(gtk_id, template_id, req.tenantId).c
      if (jamGuru >= tpl.maks_jtm) return res.status(409).json({ error: `Melebihi maks JTM (${tpl.maks_jtm}) untuk template "${tpl.nama}"` })
    }
  }
  if (jenis === 'mapel') {
    if (!gtk_id) return res.status(400).json({ error: 'Guru wajib dipilih untuk mapel.' })
    if (!mapel_id) return res.status(400).json({ error: 'Mapel wajib dipilih untuk jenis "mapel".' })
    const mapel = db.prepare('SELECT id FROM mapel WHERE id=? AND tenant_id=?').get(mapel_id, req.tenantId)
    if (!mapel) return res.status(400).json({ error: 'Mapel tidak ditemukan. Muat ulang halaman lalu pilih lagi.' })
  } else if (jenis === 'istirahat') {
    if (!nama_kegiatan || nama_kegiatan.trim().length < 2) return res.status(400).json({ error: 'Nama istirahat wajib diisi (min 2 karakter).' })
  } else {
    if (!nama_kegiatan || nama_kegiatan.trim().length < 2) return res.status(400).json({ error: 'Nama kegiatan wajib diisi (min 2 karakter).' })
  }
  const id = uuidv4()
  try {
    db.prepare('INSERT INTO jadwal (id, mapel_id, rombel_id, gtk_id, hari, jam_mulai, jam_selesai, ruangan, template_id, jenis_kegiatan, nama_kegiatan, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id, mapel_id || null, rombel_id, gtk_id || null, hari, jam_mulai, jam_selesai, ruangan, template_id || null, jenis, nama_kegiatan || '', req.tenantId)
    if (jenis === 'mapel') ensurePengajarFromJadwal({ gtk_id, mapel_id, rombel_id, tenant_id: req.tenantId })
    res.json({ id })
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || e.code === 'SQLITE_CONSTRAINT') return res.status(400).json({ error: 'Data tidak valid. Periksa rombel dan guru yang dipilih sudah terdaftar di sistem.' })
    throw e
  }
})

// === Simulasi/Generate jadwal otomatis sepekan (anti-bentrok) ===
// body: { hari: ['senin',...], slots: [{ke,mulai,selesai},...], rombel_ids?: [], overwrite?: bool, template_id?: string }
// Greedy: isi tiap slot kosong dgn pengajar (gtk+mapel utk rombel itu) yg belum penuh jam_per_minggu,
// tanpa menabrakkan guru (2 kelas sekaligus) & rombel (2 mapel sekaligus).
app.post('/api/jadwal/generate', ADMIN, (req, res) => {
  const { hari, slots, rombel_ids, overwrite, template_id } = req.body
  if (!Array.isArray(hari) || !hari.length || !Array.isArray(slots) || !slots.length) {
    return res.status(400).json({ error: 'Parameter hari & slots wajib diisi.' })
  }
  const tid = req.tenantId
  // Ambil relasi pengajar (guru mengajar mapel apa di rombel mana + target jam/minggu)
  let pengajar = db.prepare('SELECT p.*, g.nama AS gtk_nama FROM pengajar p JOIN gtk g ON g.id=p.gtk_id WHERE p.tenant_id=?').all(tid)
  if (rombel_ids && rombel_ids.length) pengajar = pengajar.filter(p => rombel_ids.includes(p.rombel_id))
  if (!pengajar.length) return res.status(400).json({ error: 'Belum ada data Pengajar (guru-mapel-rombel). Isi menu Pengajar dulu.' })

  let guruHariRules
  try { guruHariRules = parseGuruHariRules(req.body.aturan_hari_guru || '') }
  catch (e) { return res.status(400).json({ error: e.message }) }
  const rombels = db.prepare('SELECT id, wali_kelas_id AS guru_kelas_id FROM rombel WHERE tenant_id=?').all(tid)
    .filter(r => !rombel_ids?.length || rombel_ids.includes(r.id))
  const rombelSet = [...new Set(pengajar.map(p => p.rombel_id))]
  const jamPulang = Object.fromEntries(db.prepare('SELECT rombel_id,hari,jam_pulang FROM rombel_jam_pulang WHERE tenant_id=?').all(tid).map(x => [`${x.rombel_id}:${x.hari}`, x.jam_pulang]))
  const tx = db.transaction(() => {
    if (overwrite) {
      const del = db.prepare('DELETE FROM jadwal WHERE tenant_id=? AND rombel_id=?')
      rombelSet.forEach(rid => del.run(tid, rid))
    }
    // State bentrok memakai interval aktual; nomor slot beda rombel tidak selalu punya waktu sama.
    const guruBusy = {}, rombelBusy = {}, jamTerpakai = {}
    // Maks jam SATU MAPEL (pengajar) dalam SATU KELAS per HARI = 2 (biar mapel 4 jam kebagi 2 hari, bukan borong 1 hari).
    // Total per minggu tetap dibatasi jam_per_minggu tiap pengajar.
    const MAKS_JAM_MAPEL_PER_HARI = Number(req.body.maks_jam_mapel_per_hari) || 2
    const jamPengajarHari = {} // key: pengajar.id|hari -> count
    const phKey = (pid, h) => `${pid}|${h}`
    const mark = (obj, k1, k2, mulai, selesai) => { (obj[k1] ??= {})[k2] ??= []; obj[k1][k2].push({ mulai, selesai }) }
    const has = (obj, k1, k2, mulai, selesai) => obj[k1]?.[k2]?.some(x => intervalTumpangTindih(x.mulai, x.selesai, mulai, selesai))
    // Muat jadwal existing (kalau tak overwrite) agar tak bentrok
    if (!overwrite) {
      const ex = db.prepare('SELECT gtk_id, rombel_id, mapel_id, hari, jam_mulai, jam_selesai FROM jadwal WHERE tenant_id=?').all(tid)
      ex.forEach(j => {
        mark(guruBusy, j.gtk_id, j.hari, j.jam_mulai, j.jam_selesai)
        mark(rombelBusy, j.rombel_id, j.hari, j.jam_mulai, j.jam_selesai)
        const p = pengajar.find(pp => pp.gtk_id === j.gtk_id && pp.rombel_id === j.rombel_id && pp.mapel_id === j.mapel_id)
        if (p) { const k = phKey(p.id, j.hari); jamPengajarHari[k] = (jamPengajarHari[k] || 0) + 1; jamTerpakai[p.id] = (jamTerpakai[p.id] || 0) + 1 }
      })
    }
    const ins = db.prepare('INSERT INTO jadwal (id, mapel_id, rombel_id, gtk_id, hari, jam_mulai, jam_selesai, ruangan, template_id, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
    let created = 0
    // Round-robin: pool pengajar dgn sisa jam > 0. Isi rombel per hari per slot.
    pengajar.forEach(p => { jamTerpakai[p.id] = 0 })
    for (const rid of rombelSet) {
      const rombel = rombels.find(r => r.id === rid) || {}
      const poolDasar = pengajar.filter(p => p.rombel_id === rid)
      const poolRombel = req.body.mode_guru_kelas && rombel.guru_kelas_id
        ? [...poolDasar.filter(p => p.gtk_id === rombel.guru_kelas_id), ...poolDasar.filter(p => p.gtk_id !== rombel.guru_kelas_id)]
        : poolDasar
      for (const h of hari) {
        for (const s of slots) {
          if (req.body.mode_guru_kelas && jamPulang[`${rid}:${h}`] && s.selesai > jamPulang[`${rid}:${h}`]) continue
          if (has(rombelBusy, rid, h, s.mulai, s.selesai)) continue
          // cari pengajar yg: sisa jam minggu > 0, guru tak sibuk di slot ini, & belum penuh batas mapel/hari
          const cand = poolRombel.find(p => {
            const target = p.jam_per_minggu || 0
            if (!target) return false // wajib punya target jam
            const dipakai = jamTerpakai[p.id] || 0
            const perHari = jamPengajarHari[phKey(p.id, h)] || 0
            return dipakai < target
              && perHari < MAKS_JAM_MAPEL_PER_HARI
              && !has(guruBusy, p.gtk_id, h, s.mulai, s.selesai)
              && guruBolehMengajar(p.gtk_nama, h, guruHariRules)
          })
          if (!cand) continue
          ins.run(uuidv4(), cand.mapel_id, rid, cand.gtk_id, h, s.mulai, s.selesai, '', template_id || null, tid)
          mark(guruBusy, cand.gtk_id, h, s.mulai, s.selesai)
          mark(rombelBusy, rid, h, s.mulai, s.selesai)
          const kk = phKey(cand.id, h)
          jamPengajarHari[kk] = (jamPengajarHari[kk] || 0) + 1
          jamTerpakai[cand.id] = (jamTerpakai[cand.id] || 0) + 1
          created++
        }
      }
    }
    // Ringkasan pengajar yg belum penuh target
    const kurang = pengajar
      .filter(p => p.jam_per_minggu && jamTerpakai[p.id] < p.jam_per_minggu)
      .map(p => ({ gtk_id: p.gtk_id, terisi: jamTerpakai[p.id], target: p.jam_per_minggu }))
    return { created, kurang }
  })
  try {
    const result = tx()
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: 'Gagal generate jadwal: ' + e.message })
  }
})

app.put('/api/jadwal/:id', ADMIN, (req, res) => {
  const { mapel_id, rombel_id, gtk_id, hari, jam_mulai, jam_selesai, ruangan, template_id, jenis_kegiatan, nama_kegiatan } = req.body
  const jenis = jenis_kegiatan || 'mapel'
  const jadwalId = req.params.id
  const overlap = '((j.jam_mulai < ? AND j.jam_selesai > ?) OR (j.jam_mulai < ? AND j.jam_selesai > ?) OR (j.jam_mulai >= ? AND j.jam_selesai <= ?))'
  const ovParams = [jam_selesai, jam_mulai, jam_selesai, jam_mulai, jam_mulai, jam_selesai]
  // exclude diri sendiri (j.id != ?) dari semua cek tabrakan
  const gConflict = db.prepare(`SELECT j.*, r.nama as rombel_nama FROM jadwal j LEFT JOIN rombel r ON j.rombel_id = r.id WHERE j.gtk_id = ? AND j.hari = ? AND j.tenant_id = ? AND j.id != ? AND ${overlap}`)
    .get(gtk_id, hari, req.tenantId, jadwalId, ...ovParams)
  if (gConflict) return res.status(409).json({ error: `Jadwal Ganda (Guru): guru sudah mengajar di kelas ${gConflict.rombel_nama} jam ${gConflict.jam_mulai}-${gConflict.jam_selesai} (${hari})` })
  const rConflict = db.prepare(`SELECT j.*, m.nama as mapel_nama FROM jadwal j LEFT JOIN mapel m ON j.mapel_id = m.id WHERE j.rombel_id = ? AND j.hari = ? AND j.tenant_id = ? AND j.id != ? AND ${overlap}`)
    .get(rombel_id, hari, req.tenantId, jadwalId, ...ovParams)
  if (rConflict) return res.status(409).json({ error: `Jadwal Ganda (Kelas): kelas sudah ada pelajaran ${rConflict.mapel_nama} jam ${rConflict.jam_mulai}-${rConflict.jam_selesai} (${hari})` })
  if (ruangan) {
    const roomConflict = db.prepare(`SELECT j.*, r.nama as rombel_nama FROM jadwal j LEFT JOIN rombel r ON j.rombel_id = r.id WHERE j.ruangan = ? AND j.ruangan != '' AND j.hari = ? AND j.tenant_id = ? AND j.id != ? AND ${overlap}`)
      .get(ruangan, hari, req.tenantId, jadwalId, ...ovParams)
    if (roomConflict) return res.status(409).json({ error: `Jadwal Ganda (Ruangan): ruangan ${ruangan} sudah dipakai kelas ${roomConflict.rombel_nama} jam ${roomConflict.jam_mulai}-${roomConflict.jam_selesai} (${hari})` })
  }
  if (template_id) {
    const tpl = db.prepare('SELECT * FROM template_jadwal WHERE id=? AND tenant_id=?').get(template_id, req.tenantId)
    if (tpl) {
      const jamGuru = db.prepare('SELECT COUNT(*) as c FROM jadwal WHERE gtk_id=? AND template_id=? AND tenant_id=? AND id != ?').get(gtk_id, template_id, req.tenantId, jadwalId).c
      if (jamGuru >= tpl.maks_jtm) return res.status(409).json({ error: `Melebihi maks JTM (${tpl.maks_jtm}) untuk template "${tpl.nama}"` })
    }
  }
  if (jenis === 'mapel' && !mapel_id) return res.status(400).json({ error: 'Mapel wajib dipilih untuk jenis "mapel".' })
  if (jenis === 'mapel' && !gtk_id) return res.status(400).json({ error: 'Guru wajib dipilih untuk mapel.' })
  if (jenis === 'istirahat' && (!nama_kegiatan || nama_kegiatan.trim().length < 2)) return res.status(400).json({ error: 'Nama istirahat wajib diisi (min 2 karakter).' })
  if (jenis === 'kegiatan' && (!nama_kegiatan || nama_kegiatan.trim().length < 2)) return res.status(400).json({ error: 'Nama kegiatan wajib diisi (min 2 karakter).' })
  const result = db.prepare('UPDATE jadwal SET mapel_id=?, rombel_id=?, gtk_id=?, hari=?, jam_mulai=?, jam_selesai=?, ruangan=?, template_id=?, jenis_kegiatan=?, nama_kegiatan=? WHERE id=? AND tenant_id=?')
    .run(mapel_id || null, rombel_id, gtk_id, hari, jam_mulai, jam_selesai, ruangan, template_id || null, jenis, nama_kegiatan || '', jadwalId, req.tenantId)
  if (result.changes === 0) return res.status(404).json({ error: 'Jadwal tidak ditemukan' })
  if (jenis === 'mapel') ensurePengajarFromJadwal({ gtk_id, mapel_id, rombel_id, tenant_id: req.tenantId })
  res.json({ success: true })
})

// Scan konflik jadwal otomatis (semua bentrok guru/kelas/ruangan)
app.get('/api/jadwal/konflik', authMiddleware, (req, res) => {
  const rows = db.prepare(`SELECT j.*, m.nama as mapel_nama, r.nama as rombel_nama, g.nama as guru_nama FROM jadwal j LEFT JOIN mapel m ON j.mapel_id=m.id LEFT JOIN rombel r ON j.rombel_id=r.id LEFT JOIN gtk g ON j.gtk_id=g.id WHERE j.tenant_id=? ORDER BY j.hari, j.jam_mulai`).all(req.tenantId)
  res.json(detectJadwalConflicts(rows))
})

app.delete('/api/jadwal/:id', ADMIN, (req, res) => {
  db.prepare('DELETE FROM jadwal WHERE id = ? AND tenant_id=?').run(req.params.id, req.tenantId)
  res.json({ success: true })
})

// ==================== TEMPLATE JADWAL ====================
app.get('/api/template-jadwal', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM template_jadwal WHERE tenant_id=? ORDER BY created_at DESC').all(req.tenantId))
})

app.post('/api/template-jadwal', ADMIN, (req, res) => {
  const { nama, jenis, maks_jtm, keterangan } = req.body
  if (!nama) return res.status(400).json({ error: 'Nama template wajib diisi' })
  const jtm = Number(maks_jtm) || 15
  if (jtm < 1 || jtm > 40) return res.status(400).json({ error: 'Maks JTM harus 1-40' })
  const id = uuidv4()
  db.prepare('INSERT INTO template_jadwal (id, nama, jenis, maks_jtm, keterangan, tenant_id) VALUES (?,?,?,?,?,?)').run(id, nama, jenis || 'reguler', jtm, keterangan || '', req.tenantId)
  res.json({ id })
})

app.delete('/api/template-jadwal/:id', ADMIN, (req, res) => {
  const used = db.prepare('SELECT COUNT(*) as c FROM jadwal WHERE template_id=? AND tenant_id=?').get(req.params.id, req.tenantId).c
  if (used > 0) return res.status(400).json({ error: `Template dipakai ${used} jadwal. Lepas dulu sebelum hapus.` })
  db.prepare('DELETE FROM template_jadwal WHERE id = ? AND tenant_id=?').run(req.params.id, req.tenantId)
  res.json({ success: true })
})


// ==================== TAGIHAN & PEMBAYARAN ====================
app.get('/api/tagihan/siswa', BENDAHARA, (req, res) => {
  const { rombel_id, q = '' } = req.query
  let sql = `SELECT s.id, s.nama, s.nis, s.rombel_id, r.nama AS rombel_nama FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id WHERE s.status='aktif' AND s.tenant_id=?`
  const params = [req.tenantId]
  if (rombel_id && rombel_id !== 'all') { sql += ' AND s.rombel_id=?'; params.push(rombel_id) }
  if (q) { sql += ' AND (LOWER(s.nama) LIKE ? OR s.nis LIKE ?)'; params.push(`%${String(q).toLowerCase()}%`, `%${q}%`) }
  res.json(db.prepare(sql + ' ORDER BY r.nama, s.nama').all(...params))
})

app.get('/api/jenis-tagihan', BENDAHARA, (req, res) => {
  res.json(db.prepare('SELECT * FROM jenis_tagihan WHERE tenant_id=? ORDER BY nama').all(req.tenantId))
})

app.post('/api/jenis-tagihan', BENDAHARA, (req, res) => {
  const id = uuidv4()
  const { nama, nominal, deskripsi, tipe } = req.body
  db.prepare('INSERT INTO jenis_tagihan (id, nama, nominal, deskripsi, tipe, tenant_id) VALUES (?,?,?,?,?,?)').run(id, nama, nominal, deskripsi, tipe, req.tenantId)
  res.json({ id })
})

app.get('/api/tagihan', BENDAHARA, (req, res) => {
  const { siswa_id, status, jenis_tagihan_id, rombel_id } = req.query
  let sql = `SELECT t.*, s.nama as siswa_nama, s.nis, s.rombel_id, r.nama as rombel_nama, jt.nama as jenis_nama FROM tagihan t LEFT JOIN siswa s ON t.siswa_id = s.id AND s.tenant_id = t.tenant_id LEFT JOIN rombel r ON s.rombel_id = r.id AND r.tenant_id = t.tenant_id LEFT JOIN jenis_tagihan jt ON t.jenis_tagihan_id = jt.id AND jt.tenant_id = t.tenant_id WHERE t.tenant_id=?`
  const params = [req.tenantId]
  if (siswa_id) { sql += ' AND t.siswa_id = ?'; params.push(siswa_id) }
  if (status) { sql += ' AND t.status = ?'; params.push(status) }
  if (jenis_tagihan_id) { sql += ' AND t.jenis_tagihan_id = ?'; params.push(jenis_tagihan_id) }
  if (rombel_id) { sql += ' AND s.rombel_id = ?'; params.push(rombel_id) }
  sql += ' ORDER BY r.nama, s.nama, t.created_at DESC'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/tagihan/generate', BENDAHARA, (req, res) => {
  const { rombel_id, bulan, tahun, siswa_ids } = req.body
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
  let siswaList
  if (Array.isArray(siswa_ids)) {
    if (!siswa_ids.length) return res.status(400).json({ error: 'Pilih minimal satu siswa' })
    const placeholders = siswa_ids.map(() => '?').join(',')
    siswaList = db.prepare(`SELECT id FROM siswa WHERE id IN (${placeholders}) AND status='aktif' AND tenant_id = ?`).all(...siswa_ids, req.tenantId)
    if (siswaList.length !== new Set(siswa_ids).size) return res.status(400).json({ error: 'Pilihan siswa tidak valid' })
  } else {
    siswaList = (!rombel_id || rombel_id === 'all')
      ? db.prepare("SELECT id FROM siswa WHERE status = 'aktif' AND tenant_id = ?").all(req.tenantId)
      : db.prepare("SELECT id FROM siswa WHERE rombel_id = ? AND status = 'aktif' AND tenant_id = ?").all(rombel_id, req.tenantId)
  }
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

app.put('/api/tagihan/:id/bayar', BENDAHARA, (req, res) => {
  const { metode_bayar, keterangan } = req.body
  db.prepare("UPDATE tagihan SET status='lunas', tanggal_bayar=date('now'), metode_bayar=?, keterangan=? WHERE id=? AND tenant_id=?")
    .run(metode_bayar || 'tunai', keterangan || '', req.params.id, req.tenantId)
  res.json({ success: true })
})

// ==================== TABUNGAN ====================
app.get('/api/tabungan', BENDAHARA, (req, res) => {
  const { siswa_id } = req.query
  if (!siswa_id) return res.status(400).json({ error: 'siswa_id required' })
  const rows = db.prepare('SELECT * FROM tabungan WHERE siswa_id = ? AND tenant_id = ? ORDER BY created_at DESC').all(siswa_id, req.tenantId)
  res.json(rows)
})

app.get('/api/tabungan/saldo', BENDAHARA, (req, res) => {
  const { rombel_id } = req.query
  let sql = `SELECT s.id, s.nis, s.nama,s.rombel_id,r.nama rombel_nama, COALESCE((SELECT saldo_akhir FROM tabungan WHERE siswa_id = s.id AND tenant_id = ? ORDER BY created_at DESC LIMIT 1), 0) as saldo FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id WHERE s.status = 'aktif' AND s.tenant_id = ?`
  const params = [req.tenantId, req.tenantId]
  if (rombel_id) { sql += ' AND s.rombel_id = ?'; params.push(rombel_id) }
  sql += ' ORDER BY r.nama,s.nama'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/tabungan', BENDAHARA, (req, res) => {
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


// ==================== PEMINATAN ====================
app.get('/api/peminatan/jenis',authMiddleware,(req,res)=>res.json(db.prepare('SELECT * FROM peminatan_jenis WHERE tenant_id=? ORDER BY nama').all(req.tenantId)))
app.post('/api/peminatan/jenis',ADMIN,(req,res)=>{const nama=String(req.body.nama||'').trim(),slug=nama.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(!nama||!slug)return res.status(400).json({error:'Nama wajib'});try{const id=uuidv4();db.prepare('INSERT INTO peminatan_jenis(id,nama,slug,tenant_id) VALUES(?,?,?,?)').run(id,nama,slug,req.tenantId);res.json({id})}catch{return res.status(409).json({error:'Jenis sudah ada'})}})
app.put('/api/peminatan/jenis/:id',ADMIN,(req,res)=>{const nama=String(req.body.nama||'').trim();if(!nama)return res.status(400).json({error:'Nama wajib'});const r=db.prepare('UPDATE peminatan_jenis SET nama=?,aktif=? WHERE id=? AND tenant_id=?').run(nama,req.body.aktif?1:0,req.params.id,req.tenantId);res.status(r.changes?200:404).json(r.changes?{success:true}:{error:'Tidak ditemukan'})})
app.delete('/api/peminatan/jenis/:id',ADMIN,(req,res)=>{if(db.prepare('SELECT 1 FROM tahfidz_kelompok WHERE jenis_id=? AND tenant_id=?').get(req.params.id,req.tenantId))return res.status(409).json({error:'Jenis masih dipakai'});db.prepare('DELETE FROM peminatan_jenis WHERE id=? AND tenant_id=?').run(req.params.id,req.tenantId);res.json({success:true})})
app.get('/api/peminatan/kelompok',authMiddleware,(req,res)=>res.json(db.prepare('SELECT k.*,j.nama jenis_nama FROM tahfidz_kelompok k JOIN peminatan_jenis j ON j.id=k.jenis_id AND j.tenant_id=k.tenant_id WHERE k.tenant_id=?').all(req.tenantId)))
// Legacy aliases
app.get('/api/tahfidz/kelompok', authMiddleware, (req, res) => res.json(db.prepare(`SELECT k.*,g.nama pembimbing_nama,count(p.siswa_id) jumlah_peserta FROM tahfidz_kelompok k LEFT JOIN gtk g ON g.id=k.pembimbing_id AND g.tenant_id=k.tenant_id LEFT JOIN tahfidz_peserta p ON p.kelompok_id=k.id AND p.tenant_id=k.tenant_id WHERE k.tenant_id=? GROUP BY k.id ORDER BY k.nama`).all(req.tenantId)))
app.get('/api/guru/peminatan', STAFF, (req, res) => {
  if (!['guru', 'wali_kelas'].includes(req.user.role)) return res.status(403).json({ error: 'Akses khusus guru' })
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  if (!gtk) return res.json([])
  res.json(db.prepare(`SELECT k.*,j.nama jenis_nama,count(p.siswa_id) jumlah_anggota
    FROM tahfidz_kelompok k
    LEFT JOIN peminatan_jenis j ON j.id=k.jenis_id AND j.tenant_id=k.tenant_id
    LEFT JOIN tahfidz_peserta p ON p.kelompok_id=k.id AND p.tenant_id=k.tenant_id
    WHERE k.pembimbing_id=? AND k.tenant_id=? GROUP BY k.id ORDER BY k.nama`).all(gtk.id, req.tenantId))
})
app.post('/api/tahfidz/kelompok', ADMIN, (req, res) => {
  const { nama, pembimbing_id, siswa_ids=[] } = req.body
  if (!isStr(nama) || !Array.isArray(siswa_ids)) return res.status(400).json({ error: 'Data kelompok tidak valid' })
  const valid = siswa_ids.length ? db.prepare(`SELECT id FROM siswa WHERE tenant_id=? AND id IN (${siswa_ids.map(()=>'?').join(',')})`).all(req.tenantId,...siswa_ids).map(x=>x.id) : []
  if (valid.length !== new Set(siswa_ids).size) return res.status(400).json({ error: 'Peserta tidak valid' })
  const id=uuidv4(); db.transaction(()=>{ db.prepare('INSERT INTO tahfidz_kelompok VALUES(?,?,?,?)').run(id,nama,pembimbing_id||null,req.tenantId); const q=db.prepare('INSERT INTO tahfidz_peserta VALUES(?,?,?)'); valid.forEach(s=>q.run(id,s,req.tenantId)) })()
  res.json({ id })
})
app.get('/api/tahfidz/kelompok/:id/peserta', authMiddleware, (req,res)=>{
  if (['guru','wali_kelas'].includes(req.user.role)) {
    const gtk=resolveGtkForUser(req.user.id,req.tenantId)
    if(!gtk||!db.prepare('SELECT 1 FROM tahfidz_kelompok WHERE id=? AND pembimbing_id=? AND tenant_id=?').get(req.params.id,gtk.id,req.tenantId)) return res.status(403).json({error:'Bukan pembimbing kegiatan ini'})
  }
  res.json(db.prepare(`SELECT s.* FROM tahfidz_peserta p JOIN siswa s ON s.id=p.siswa_id AND s.tenant_id=p.tenant_id LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id WHERE p.kelompok_id=? AND p.tenant_id=? ORDER BY s.nama`).all(req.params.id,req.tenantId))
})
app.get('/api/tahfidz/pertemuan', authMiddleware, (req,res)=>{
  if (['guru','wali_kelas'].includes(req.user.role)) {
    const gtk=resolveGtkForUser(req.user.id,req.tenantId)
    if(!gtk) return res.json([])
    if(req.query.kelompok_id&&!db.prepare('SELECT 1 FROM tahfidz_kelompok WHERE id=? AND pembimbing_id=? AND tenant_id=?').get(req.query.kelompok_id,gtk.id,req.tenantId)) return res.status(403).json({error:'Bukan pembimbing kegiatan ini'})
  }
  let sql=`SELECT p.*,k.nama kelompok_nama,count(a.siswa_id) jumlah_absensi FROM tahfidz_pertemuan p JOIN tahfidz_kelompok k ON k.id=p.kelompok_id AND k.tenant_id=p.tenant_id LEFT JOIN tahfidz_absensi a ON a.pertemuan_id=p.id AND a.tenant_id=p.tenant_id WHERE p.tenant_id=?`, args=[req.tenantId]
  if(req.query.kelompok_id){sql+=' AND p.kelompok_id=?';args.push(req.query.kelompok_id)}
  res.json(db.prepare(sql+' GROUP BY p.id ORDER BY p.tanggal DESC').all(...args))
})
app.get('/api/tahfidz/rekap', authMiddleware, (req,res)=>res.json(db.prepare(`SELECT s.id,s.nama,k.id kelompok_id,k.nama kelompok_nama,count(a.pertemuan_id) total,sum(a.status='hadir') hadir,sum(a.status='izin') izin,sum(a.status='sakit') sakit,sum(a.status='alpa') alpa FROM tahfidz_peserta tp JOIN tahfidz_kelompok k ON k.id=tp.kelompok_id AND k.tenant_id=tp.tenant_id JOIN siswa s ON s.id=tp.siswa_id AND s.tenant_id=tp.tenant_id LEFT JOIN tahfidz_absensi a ON a.siswa_id=s.id AND a.tenant_id=tp.tenant_id LEFT JOIN tahfidz_pertemuan p ON p.id=a.pertemuan_id AND p.kelompok_id=k.id AND p.tenant_id=tp.tenant_id WHERE tp.tenant_id=? GROUP BY k.id,s.id ORDER BY k.nama,s.nama`).all(req.tenantId)))
app.post('/api/tahfidz/pertemuan', STAFF, (req,res)=>{
  const { kelompok_id,tanggal,materi,absensi=[] }=req.body
  const group=db.prepare('SELECT id,pembimbing_id FROM tahfidz_kelompok WHERE id=? AND tenant_id=?').get(kelompok_id,req.tenantId)
  if(!group||!tanggal||!Array.isArray(absensi)) return res.status(400).json({error:'Data pertemuan tidak valid'})
  if(['guru','wali_kelas'].includes(req.user.role)){const gtk=resolveGtkForUser(req.user.id,req.tenantId);if(!gtk||group.pembimbing_id!==gtk.id)return res.status(403).json({error:'Bukan pembimbing kegiatan ini'})}
  const anggota=new Set(db.prepare('SELECT siswa_id FROM tahfidz_peserta WHERE kelompok_id=? AND tenant_id=?').all(kelompok_id,req.tenantId).map(x=>x.siswa_id))
  if(absensi.some(a=>!anggota.has(a.siswa_id)||!['hadir','izin','sakit','alpa'].includes(a.status))) return res.status(400).json({error:'Absensi hanya untuk peserta terpilih'})
  const id=uuidv4(); db.transaction(()=>{db.prepare('INSERT INTO tahfidz_pertemuan VALUES(?,?,?,?,?)').run(id,kelompok_id,tanggal,materi||'',req.tenantId);const q=db.prepare('INSERT INTO tahfidz_absensi VALUES(?,?,?,?,?)');absensi.forEach(a=>q.run(id,a.siswa_id,a.status,a.catatan||'',req.tenantId))})()
  res.json({id})
})

// ==================== JAM PULANG ROMBEL ====================
app.get('/api/rombel-jam-pulang', ADMIN, (req, res) => {
  res.json(db.prepare('SELECT rombel_id,hari,jam_pulang,aktif FROM rombel_jam_pulang WHERE tenant_id=? ORDER BY rombel_id,hari').all(req.tenantId))
})
app.put('/api/rombel-jam-pulang', ADMIN, (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : []
  const days = new Set(['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'])
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/
  if (!rows.length || rows.some(x => !x || !days.has(x.hari) || typeof x.aktif !== 'boolean' || (x.aktif && !time.test(x.jam_pulang)))) return res.status(400).json({ error: 'Hari/jam/status tidak valid' })
  const owns = db.prepare('SELECT 1 FROM rombel WHERE id=? AND tenant_id=?')
  if (rows.some(x => !owns.get(x.rombel_id, req.tenantId))) return res.status(404).json({ error: 'Rombel tidak ditemukan' })
  const upsert = db.prepare('INSERT INTO rombel_jam_pulang(rombel_id,hari,jam_pulang,tenant_id,aktif) VALUES(?,?,?,?,?) ON CONFLICT(rombel_id,hari,tenant_id) DO UPDATE SET jam_pulang=excluded.jam_pulang,aktif=excluded.aktif')
  db.transaction(items => { for (const x of items) upsert.run(x.rombel_id, x.hari, x.jam_pulang || '00:00', req.tenantId, x.aktif ? 1 : 0) })(rows)
  res.json({ success: true })
})


app.put('/api/rombel-jam-pulang/:rombel_id/:hari', ADMIN, (req, res) => {
  const { rombel_id, hari } = req.params
  const jam = req.body?.jam_pulang
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(jam || '')) return res.status(400).json({ error: 'Jam pulang tidak valid' })
  const owns = db.prepare('SELECT 1 FROM rombel WHERE id=? AND tenant_id=?').get(rombel_id, req.tenantId)
  if (!owns) return res.status(404).json({ error: 'Rombel tidak ditemukan' })
  db.prepare('INSERT INTO rombel_jam_pulang(rombel_id,hari,jam_pulang,tenant_id,aktif) VALUES(?,?,?,?,1) ON CONFLICT(rombel_id,hari,tenant_id) DO UPDATE SET jam_pulang=excluded.jam_pulang,aktif=1')
    .run(rombel_id, hari, jam, req.tenantId)
  res.json({ success: true })
})

// ==================== JENIS TAGIHAN ====================
// ==================== TAGIHAN ====================
app.delete('/api/tagihan/:id', BENDAHARA, (req, res) => {
  db.prepare('DELETE FROM tagihan WHERE id = ? AND tenant_id=?').run(req.params.id, req.tenantId)
  res.json({ success: true })
})


app.put('/api/tagihan/:id', BENDAHARA, (req, res) => {
  const { nominal, status, tanggal_bayar, metode_bayar, keterangan } = req.body
  db.prepare('UPDATE tagihan SET nominal=COALESCE(?,nominal), status=COALESCE(?,status), tanggal_bayar=?, metode_bayar=?, keterangan=COALESCE(?,keterangan) WHERE id=? AND tenant_id=?')
    .run(nominal ?? null, status || null, tanggal_bayar || null, metode_bayar || null, keterangan ?? null, req.params.id, req.tenantId)
  res.json({ success: true })
})

app.put('/api/tabungan/:id', BENDAHARA, (req, res) => {
  const { tanggal, tipe, nominal, keterangan } = req.body
  const row = db.prepare('SELECT * FROM tabungan WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
  if (!row) return res.status(404).json({ error: 'Transaksi tabungan tidak ditemukan' })
  if (nominal !== undefined && (isNaN(Number(nominal)) || Number(nominal) <= 0)) return res.status(400).json({ error: 'Nominal harus lebih dari 0' })
  db.prepare('UPDATE tabungan SET tanggal=COALESCE(?,tanggal), tipe=COALESCE(?,tipe), nominal=COALESCE(?,nominal), keterangan=COALESCE(?,keterangan) WHERE id=? AND tenant_id=?')
    .run(tanggal || null, tipe || null, nominal != null ? Number(nominal) : null, keterangan ?? null, req.params.id, req.tenantId)
  // Recalculate saldo_akhir untuk semua mutasi siswa ini (chronological)
  const allMutasi = db.prepare("SELECT id,tipe,nominal FROM tabungan WHERE siswa_id=? AND tenant_id=? ORDER BY created_at ASC, id ASC").all(row.siswa_id, req.tenantId)
  let saldo = 0
  const upd = db.prepare('UPDATE tabungan SET saldo_akhir=? WHERE id=?')
  db.transaction(() => {
    for (const m of allMutasi) {
      saldo += m.tipe === 'setor' ? Number(m.nominal) : -Number(m.nominal)
      upd.run(saldo, m.id)
    }
  })()
  res.json({ success: true, saldo_akhir: saldo })
})

app.delete('/api/tabungan/:id', BENDAHARA, (req, res) => {
  const row = db.prepare('SELECT siswa_id FROM tabungan WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
  if (!row) return res.status(404).json({ error: 'Mutasi tidak ditemukan' })
  db.prepare('DELETE FROM tabungan WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
  // Recalculate saldo setelah hapus
  const remaining = db.prepare("SELECT id,tipe,nominal FROM tabungan WHERE siswa_id=? AND tenant_id=? ORDER BY created_at ASC, id ASC").all(row.siswa_id, req.tenantId)
  let saldo = 0
  const upd = db.prepare('UPDATE tabungan SET saldo_akhir=? WHERE id=?')
  db.transaction(() => { for (const m of remaining) { saldo += m.tipe === 'setor' ? Number(m.nominal) : -Number(m.nominal); upd.run(saldo, m.id) } })()
  res.json({ success: true })
})

// ==================== MODUL AJAR ====================
db.exec(`CREATE TABLE IF NOT EXISTS ai_documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  grade TEXT NOT NULL,
  topic TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  content TEXT NOT NULL,
  created_by TEXT,
  tenant_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
); CREATE INDEX IF NOT EXISTS idx_ai_documents_tenant ON ai_documents(tenant_id, created_at DESC);`)
try { db.exec("ALTER TABLE ai_documents ADD COLUMN generation_mode TEXT NOT NULL DEFAULT 'ai'") } catch (error) { if (!String(error.message).includes('duplicate column name')) throw error }

app.get('/api/ai-documents/types', authMiddleware, (_req, res) => {
  res.json(Object.entries(DOCUMENT_TYPES).map(([value, item]) => ({ value, ...item })))
})

app.get('/api/ai-documents', STAFF, (req, res) => {
  const rows = db.prepare('SELECT id,type,title,subject,grade,topic,generation_mode,created_at FROM ai_documents WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100').all(req.tenantId)
  res.json(rows)
})

app.get('/api/ai-documents/:id', STAFF, (req, res) => {
  const row = db.prepare('SELECT * FROM ai_documents WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
  if (!row) return res.status(404).json({ error: 'Dokumen tidak ditemukan' })
  res.json({ ...row, metadata: JSON.parse(row.metadata_json || '{}') })
})

app.post('/api/ai-documents/generate', STAFF, async (req, res) => {
  const checked = validateGenerateInput(req.body)
  if (checked.error) return res.status(400).json({ error: checked.error })
  try {
    const input = checked.value
    const content = input.mode === 'template' ? createTemplateContent(input) : await callAi(buildPrompt(input))
    const id = uuidv4()
    const title = `${DOCUMENT_TYPES[input.type].label} ${input.subject} ${input.grade}`.trim()
    db.prepare('INSERT INTO ai_documents(id,type,title,subject,grade,topic,metadata_json,content,created_by,tenant_id,generation_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, input.type, title, input.subject.trim(), input.grade.trim(), input.topic.trim(), JSON.stringify(input), content, req.user?.id || null, req.tenantId, input.mode)
    res.status(201).json({ id, title, content, input, generation_mode: input.mode })
  } catch (error) {
    console.error('[AI Documents] generate failed:', error.message)
    res.status(error.message.includes('belum dikonfigurasi') ? 503 : 502).json({ error: error.message })
  }
})

app.post('/api/ai-documents/export-docx', STAFF, async (req, res) => {
  try {
    let data = req.body || {}
    if (data.id) {
      const row = db.prepare('SELECT * FROM ai_documents WHERE id=? AND tenant_id=?').get(data.id, req.tenantId)
      if (!row) return res.status(404).json({ error: 'Dokumen tidak ditemukan' })
      data = { ...JSON.parse(row.metadata_json || '{}'), type: row.type, subject: row.subject, grade: row.grade, topic: row.topic, content: row.content }
    }
    if (!data.content || !DOCUMENT_TYPES[String(data.type || '').toUpperCase()]) return res.status(400).json({ error: 'Jenis dan isi dokumen wajib diisi' })
    const buffer = await createDocumentDocx(data)
    const filename = `${String(data.type).toUpperCase()}-${String(data.subject || 'dokumen').replace(/[^a-z0-9]+/gi, '-')}.docx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buffer)
  } catch (error) {
    console.error('[AI Documents] export failed:', error.message)
    res.status(500).json({ error: 'Gagal membuat DOCX' })
  }
})

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
  if (!nama || !['Ganjil', 'Genap'].includes(semester)) return res.status(400).json({ error: 'Tahun ajaran dan semester tidak valid' })
  if (db.prepare('SELECT 1 FROM tahun_ajaran WHERE tenant_id=? AND lower(trim(nama))=lower(trim(?)) AND lower(trim(semester))=lower(trim(?))').get(req.tenantId, nama, semester)) return res.status(409).json({ error: 'Tahun ajaran dan semester sudah ada' })
  db.prepare('INSERT INTO tahun_ajaran (id, nama, semester, tanggal_mulai, tanggal_selesai, tenant_id) VALUES (?,?,?,?,?,?)').run(id, nama.trim(), semester, tanggal_mulai, tanggal_selesai, req.tenantId)
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
  // jenis: 'masuk' (default) | 'pulang'. Kalau 'pulang', field yang diupdate adalah waktu_pulang & status_pulang.
  const { siswa_id, rombel_id, tanggal, status, waktu_absen, metode, keterangan, jenis } = req.body
  const isPulang = jenis === 'pulang'
  const jam = waktu_absen || null
  const id = uuidv4()
  const exists = db.prepare('SELECT id FROM absensi_siswa WHERE siswa_id = ? AND tanggal = ? AND tenant_id = ?').get(siswa_id, tanggal, req.tenantId)
  if (exists) {
    if (isPulang) {
      db.prepare('UPDATE absensi_siswa SET status_pulang=?, waktu_pulang=?, keterangan_pulang=?, metode=COALESCE(?, metode) WHERE id=?')
        .run(status, jam, keterangan || '', metode || null, exists.id)
    } else {
      db.prepare('UPDATE absensi_siswa SET status=?, waktu_absen=?, waktu_masuk=?, metode=?, keterangan=? WHERE id=?')
        .run(status, jam, jam, metode || 'manual', keterangan || '', exists.id)
    }
    sendAbsensiNotifToWali(siswa_id, isPulang ? (status + ' (pulang)') : status, tanggal).catch(() => {})
    return res.json({ id: exists.id, updated: true, jenis: isPulang ? 'pulang' : 'masuk' })
  }
  if (isPulang) {
    // Belum ada record masuk -> tetap buat row baru, tandai kolom pulang saja
    db.prepare('INSERT INTO absensi_siswa (id, siswa_id, rombel_id, tanggal, status, status_pulang, waktu_pulang, metode, keterangan_pulang, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, siswa_id, rombel_id || null, tanggal, 'hadir', status, jam, metode || 'manual', keterangan || '', req.tenantId)
  } else {
    db.prepare('INSERT INTO absensi_siswa (id, siswa_id, rombel_id, tanggal, status, waktu_absen, waktu_masuk, metode, keterangan, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, siswa_id, rombel_id || null, tanggal, status, jam, jam, metode || 'manual', keterangan || '', req.tenantId)
  }
  sendAbsensiNotifToWali(siswa_id, isPulang ? (status + ' (pulang)') : status, tanggal).catch(() => {})
  res.json({ id, jenis: isPulang ? 'pulang' : 'masuk' })
})

app.post('/api/absensi-siswa/bulk', STAFF, (req, res) => {
  // jenis: 'masuk' (default) | 'pulang' — bulk seragam untuk 1 sesi
  const { tanggal, rombel_id, data, jenis } = req.body
  const isPulang = jenis === 'pulang'
  if (!data || !Array.isArray(data)) return res.status(400).json({ error: 'Data harus array' })
  let count = 0
  for (const d of data) {
    const exists = db.prepare('SELECT id FROM absensi_siswa WHERE siswa_id = ? AND tanggal = ? AND tenant_id = ?').get(d.siswa_id, tanggal, req.tenantId)
    const jam = d.waktu_absen || null
    if (exists) {
      if (isPulang) {
        db.prepare('UPDATE absensi_siswa SET status_pulang=?, waktu_pulang=?, keterangan_pulang=?, metode=COALESCE(?, metode) WHERE id=?')
          .run(d.status, jam, d.keterangan || '', d.metode || null, exists.id)
      } else {
        db.prepare('UPDATE absensi_siswa SET status=?, waktu_absen=?, waktu_masuk=?, metode=?, keterangan=? WHERE id=?')
          .run(d.status, jam, jam, d.metode || 'manual', d.keterangan || '', exists.id)
      }
    } else {
      if (isPulang) {
        db.prepare('INSERT INTO absensi_siswa (id, siswa_id, rombel_id, tanggal, status, status_pulang, waktu_pulang, metode, keterangan_pulang, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .run(uuidv4(), d.siswa_id, rombel_id || null, tanggal, 'hadir', d.status, jam, d.metode || 'manual', d.keterangan || '', req.tenantId)
      } else {
        db.prepare('INSERT INTO absensi_siswa (id, siswa_id, rombel_id, tanggal, status, waktu_absen, waktu_masuk, metode, keterangan, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .run(uuidv4(), d.siswa_id, rombel_id || null, tanggal, d.status, jam, jam, d.metode || 'manual', d.keterangan || '', req.tenantId)
      }
    }
    count++
    try { waQueue.queueWaliAttendance(db, { tenantId: req.tenantId, studentId: d.siswa_id, date: tanggal, session: isPulang ? 'pulang' : 'masuk', status: d.status }) } catch {}
  }
  res.json({ count, jenis: isPulang ? 'pulang' : 'masuk' })
})

app.post('/api/absensi-siswa/bulk-range', STAFF, (req, res) => {
  const { mulai, selesai, rombel_id, status, jenis } = req.body
  const dates = dateRange(mulai, selesai).filter(d => !isHolidayDate(d, req.tenantId))
  if (!rombel_id || !dates.length) return res.status(400).json({ error: 'Rombel dan rentang tanggal wajib valid' })
  const siswa = db.prepare("SELECT id FROM siswa WHERE rombel_id=? AND status='aktif' AND tenant_id=? ORDER BY nama").all(rombel_id, req.tenantId)
  let count = 0
  for (const tanggal of dates) {
    try { assertKbmActive(req, tanggal) } catch { continue }
    for (const x of siswa) {
      const exists = db.prepare('SELECT id FROM absensi_siswa WHERE siswa_id=? AND tanggal=? AND tenant_id=?').get(x.id, tanggal, req.tenantId)
      if (exists) db.prepare('UPDATE absensi_siswa SET status=?, metode=? WHERE id=? AND tenant_id=?').run(status || 'hadir', 'batch-range', exists.id, req.tenantId)
      else db.prepare('INSERT INTO absensi_siswa (id,siswa_id,rombel_id,tanggal,status,metode,tenant_id) VALUES (?,?,?,?,?,?,?)').run(uuidv4(), x.id, rombel_id, tanggal, status || 'hadir', 'batch-range', req.tenantId)
      count++
    }
  }
  res.json({ count, dates: dates.length, jenis: jenis || 'masuk' })
})

// QR permanen per siswa = siswa.id (UUID, tidak pernah berubah). Scan -> tandai hadir hari ini.
function normalizeQrToken(raw) {
  let token = String(raw || '').trim()
  // Dukung id murni, URL /s/<id>, dan query/hash dari QR lama.
  try {
    if (/^https?:\/\//i.test(token)) token = new URL(token).pathname.split('/').filter(Boolean).pop() || token
  } catch {}
  if (token.includes('/')) token = token.split('/').filter(Boolean).pop() || token
  return token.split(/[?#]/)[0].trim()
}
app.post('/api/absensi-siswa/qr-scan', STAFF, (req, res) => {
  const token = normalizeQrToken(req.body.token)
  if (!token) return res.status(400).json({ error: 'Token QR kosong' })
  let siswa = db.prepare('SELECT * FROM siswa WHERE id = ? AND tenant_id = ?').get(token, req.tenantId)
  // Fallback: QR lama/manual mungkin memuat NIS/NISN.
  if (!siswa) siswa = db.prepare('SELECT * FROM siswa WHERE (nis = ? OR nisn = ?) AND tenant_id = ?').get(token, token, req.tenantId)
  if (!siswa) return res.status(404).json({ error: 'QR tidak dikenali / siswa tidak ditemukan' })
  const tanggal = todayJakarta()
  try { assertKbmActive(req, tanggal) } catch (e) { return res.status(400).json({ error: e.message }) }
  const waktu = timeJakarta()
  // Batas rombel/hari paling spesifik; settings lama menjadi fallback.
  const cfg = db.prepare('SELECT sesi_pulang_mulai FROM settings WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 1').get(req.tenantId) || {}
  const hari = require('./attendance-rules.cjs').hariJakarta()
  const batas = siswa.rombel_id && db.prepare('SELECT jam_pulang,aktif FROM rombel_jam_pulang WHERE rombel_id=? AND hari=? AND tenant_id=?').get(siswa.rombel_id, hari, req.tenantId)
  let sesi
  try { sesi = require('./attendance-rules.cjs').sesiAbsensiSiswa({ waktu, jamPulang: batas?.jam_pulang, fallbackPulang: cfg.sesi_pulang_mulai, explicit: req.body.sesi, aktif: batas && batas.aktif }) }
  catch (e) { return res.status(400).json({ error: e.message }) }
  const sesiPulang = sesi === 'pulang'
  const exists = db.prepare('SELECT id, status, status_pulang FROM absensi_siswa WHERE siswa_id = ? AND tanggal = ? AND tenant_id = ?').get(siswa.id, tanggal, req.tenantId)
  if (sesiPulang) {
    // Sesi pulang: catat waktu_pulang & status_pulang
    if (!exists) {
      db.prepare('INSERT INTO absensi_siswa (id, siswa_id, rombel_id, tanggal, status, status_pulang, waktu_pulang, metode, tenant_id) VALUES (?,?,?,?,?,?,?,?,?)').run(uuidv4(), siswa.id, siswa.rombel_id, tanggal, 'hadir', 'hadir', waktu, 'qr', req.tenantId)
    } else {
      if (exists.status_pulang === 'hadir') return res.json({ siswa: { nama: siswa.nama, nis: siswa.nis }, already: true, sesi: 'pulang' })
      db.prepare('UPDATE absensi_siswa SET status_pulang=?, waktu_pulang=? WHERE id=?').run('hadir', waktu, exists.id)
    }
    try { waQueue.queueWaliAttendance(db, { tenantId: req.tenantId, studentId: siswa.id, date: tanggal, session: 'pulang', status: 'hadir' }) } catch {}
    return res.json({ siswa: { nama: siswa.nama, nis: siswa.nis }, waktu, sesi: 'pulang' })
  }
  // Sesi masuk (default)
  if (exists) {
    if (exists.status === 'hadir') return res.json({ siswa: { nama: siswa.nama, nis: siswa.nis }, already: true, sesi: 'masuk' })
    db.prepare('UPDATE absensi_siswa SET status=?, waktu_masuk=?, waktu_absen=?, metode=? WHERE id=?').run('hadir', waktu, waktu, 'qr', exists.id)
  } else {
    db.prepare('INSERT INTO absensi_siswa (id, siswa_id, rombel_id, tanggal, status, waktu_masuk, waktu_absen, metode, tenant_id) VALUES (?,?,?,?,?,?,?,?,?)').run(uuidv4(), siswa.id, siswa.rombel_id, tanggal, 'hadir', waktu, waktu, 'qr', req.tenantId)
  }
  sendAbsensiNotifToWali(siswa.id, 'hadir', tanggal).catch(() => {})
  res.json({ siswa: { nama: siswa.nama, nis: siswa.nis }, waktu, sesi: 'masuk' })
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
    db.prepare('UPDATE absensi_guru SET status=?, waktu_masuk=?, waktu_pulang=?, latitude=?, longitude=?, foto_selfie=?, keterangan=? WHERE id=? AND tenant_id=?').run(status, waktu_masuk||null, waktu_pulang||null, latitude||null, longitude||null, foto_selfie||null, keterangan||'', exists.id, req.tenantId)
    return res.json({ id: exists.id, updated: true })
  }
  db.prepare('INSERT INTO absensi_guru (id, gtk_id, tanggal, status, waktu_masuk, waktu_pulang, latitude, longitude, foto_selfie, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, gtk_id, tanggal, status, waktu_masuk||null, waktu_pulang||null, latitude||null, longitude||null, foto_selfie||null, req.tenantId)
  res.json({ id })
})

app.get('/api/absensi-guru/jadwal-harian', STAFF, (req, res) => {
  const tanggal = req.query.tanggal || todayJakarta()
  if (isHolidayDate(tanggal, req.tenantId)) return res.json({ tanggal, libur: true, rows: [] })
  const d = new Date(tanggal + 'T00:00:00+07:00')
  const hari = HARI_ID[isNaN(d.getTime()) ? new Date().getDay() : d.getDay()]
  const rows = db.prepare(`SELECT g.id,g.nama,g.nip,MIN(j.jam_mulai) waktu_masuk,MAX(j.jam_selesai) waktu_pulang,COUNT(j.id) jam
    FROM gtk g JOIN jadwal j ON j.gtk_id=g.id AND j.tenant_id=g.tenant_id
    WHERE g.tenant_id=? AND lower(j.hari)=? AND j.jenis_kegiatan='mapel' GROUP BY g.id ORDER BY g.nama`).all(req.tenantId, hari)
  res.json({ tanggal, hari, libur: false, rows })
})
app.post('/api/absensi-guru/batch-jadwal', STAFF, (req, res) => {
  const { tanggal, data } = req.body
  try { assertKbmActive(req, tanggal) } catch (e) { return res.status(400).json({ error: e.message }) }
  if (!Array.isArray(data)) return res.status(400).json({ error: 'Data harus array' })
  let count=0
  for (const d of data) {
    const exists = db.prepare('SELECT id FROM absensi_guru WHERE gtk_id=? AND tanggal=? AND tenant_id=?').get(d.gtk_id, tanggal, req.tenantId)
    if (exists) db.prepare('UPDATE absensi_guru SET status=?, waktu_masuk=?, waktu_pulang=?, keterangan=? WHERE id=? AND tenant_id=?').run(d.status||'hadir', d.waktu_masuk||null, d.waktu_pulang||null, d.keterangan||'', exists.id, req.tenantId)
    else db.prepare('INSERT INTO absensi_guru (id,gtk_id,tanggal,status,waktu_masuk,waktu_pulang,keterangan,tenant_id) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(), d.gtk_id, tanggal, d.status||'hadir', d.waktu_masuk||null, d.waktu_pulang||null, d.keterangan||'', req.tenantId)
    count++
  }
  res.json({ count })
})

// ==================== JURNAL MENGAJAR ====================
// Jadwal hari ini untuk guru login. Frontend pakai untuk auto-isi mapel & rombel di form jurnal.
// Query opt: ?tanggal=YYYY-MM-DD (default hari ini Jakarta) -> mapping hari dalam bahasa Indonesia.
const HARI_ID = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']
app.get('/api/jurnal/jadwal-hari-ini', authMiddleware, (req, res) => {
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  if (!gtk) return res.json({ gtk_id: null, hari: null, jadwal: [] })
  const tgl = req.query.tanggal || todayJakarta()
  const d = new Date(tgl + 'T00:00:00+07:00')
  const hari = HARI_ID[isNaN(d.getTime()) ? new Date().getDay() : d.getDay()]
  const rows = db.prepare(`SELECT j.id as jadwal_id, j.mapel_id, j.rombel_id, j.jam_mulai, j.jam_selesai, j.ruangan,
    m.nama as mapel_nama, m.kode as mapel_kode, r.nama as rombel_nama
    FROM jadwal j
    LEFT JOIN mapel m ON j.mapel_id = m.id
    LEFT JOIN rombel r ON j.rombel_id = r.id
    WHERE j.gtk_id = ? AND lower(j.hari) = ? AND j.tenant_id = ?
    ORDER BY j.jam_mulai`).all(gtk.id, hari, req.tenantId)
  res.json({ gtk_id: gtk.id, tanggal: tgl, hari, jadwal: rows })
})

app.get('/api/jurnal/me', authMiddleware, (req, res) => {
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  if (!gtk) return res.json([])
  const rows = db.prepare(`SELECT j.*, m.nama as mapel_nama, r.nama as rombel_nama FROM jurnal_mengajar j LEFT JOIN mapel m ON j.mapel_id = m.id LEFT JOIN rombel r ON j.rombel_id = r.id WHERE j.guru_id = ? AND j.tenant_id = ? ORDER BY j.tanggal DESC, j.jam_ke`).all(gtk.id, req.tenantId)
  res.json(rows)
})

app.get('/api/jurnal', JOURNAL_REVIEWER, (req, res) => {
  const { tanggal, gtk_id, guru_id, status } = req.query
  let sql = `SELECT j.*, COALESCE((
      SELECT jg.nama
      FROM jadwal jd
      JOIN gtk jg ON jg.id = jd.gtk_id AND jg.tenant_id = jd.tenant_id
      WHERE jd.mapel_id = j.mapel_id AND jd.rombel_id = j.rombel_id AND jd.tenant_id = j.tenant_id
        AND lower(jd.hari) = CASE strftime('%w', j.tanggal)
          WHEN '0' THEN 'minggu' WHEN '1' THEN 'senin' WHEN '2' THEN 'selasa'
          WHEN '3' THEN 'rabu' WHEN '4' THEN 'kamis' WHEN '5' THEN 'jumat' WHEN '6' THEN 'sabtu'
        END
      ORDER BY CASE WHEN jd.gtk_id = j.guru_id THEN 0 ELSE 1 END, jd.jam_mulai, jd.id
      LIMIT 1
    ), g.nama) as guru_nama, m.nama as mapel_nama, r.nama as rombel_nama
    FROM jurnal_mengajar j
    LEFT JOIN gtk g ON j.guru_id = g.id AND g.tenant_id = j.tenant_id
    LEFT JOIN mapel m ON j.mapel_id = m.id AND m.tenant_id = j.tenant_id
    LEFT JOIN rombel r ON j.rombel_id = r.id AND r.tenant_id = j.tenant_id
    WHERE j.tenant_id = ?`
  const params = [req.tenantId]
  if (tanggal) { sql += ' AND j.tanggal = ?'; params.push(tanggal) }
  if (gtk_id || guru_id) { sql += ' AND j.guru_id = ?'; params.push(gtk_id || guru_id) }
  if (status) { sql += ' AND j.status = ?'; params.push(status) }
  sql += ' ORDER BY j.tanggal DESC, j.jam_ke'
  res.json(db.prepare(sql).all(...params))
})

app.post('/api/jurnal/bulk-status', JOURNAL_REVIEWER, (req, res) => {
  const { status, tanggal, guru_id, confirmation } = req.body || {}
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status tidak valid' })
  const expectedConfirmation = status === 'approved' ? 'SETUJUI SEMUA' : 'TOLAK SEMUA'
  if (confirmation !== expectedConfirmation) return res.status(400).json({ error: `Konfirmasi harus ${expectedConfirmation}` })

  let sql = "UPDATE jurnal_mengajar SET status=? WHERE tenant_id=? AND status='submitted'"
  const params = [status, req.tenantId]
  if (tanggal) { sql += ' AND tanggal=?'; params.push(tanggal) }
  if (guru_id) { sql += ' AND guru_id=?'; params.push(guru_id) }
  const result = db.prepare(sql).run(...params)
  res.json({ success: true, count: result.changes, status })
})

// Supervisi Kepala Sekolah: rekap aktivitas mengajar per guru
app.get('/api/supervisi/rekap', JOURNAL_REVIEWER, (req, res) => {
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
  let { guru_id, mapel_id, rombel_id, tanggal, jam_ke, materi, kegiatan, catatan } = req.body
  const teacher = ['guru', 'wali_kelas'].includes(req.user.role)
  if (teacher) {
    const gtk = resolveGtkForUser(req.user.id, req.tenantId)
    if (!gtk) return res.status(403).json({ error: 'Akun guru belum terhubung ke GTK' })
    guru_id = gtk.id
  }
  if (!guru_id) return res.status(400).json({ error: 'guru_id required' })
  if (!tanggal || !mapel_id || !rombel_id) return res.status(400).json({ error: 'mapel_id, rombel_id, dan tanggal wajib' })
  const gtk = db.prepare('SELECT id FROM gtk WHERE id = ? AND tenant_id = ?').get(guru_id, req.tenantId)
  const mapel = db.prepare('SELECT id FROM mapel WHERE id = ? AND tenant_id = ?').get(mapel_id, req.tenantId)
  const rombel = db.prepare('SELECT id FROM rombel WHERE id = ? AND tenant_id = ?').get(rombel_id, req.tenantId)
  if (!gtk || !mapel || !rombel) return res.status(400).json({ error: 'GTK, mapel, atau rombel tidak valid untuk lembaga ini' })
  db.prepare('INSERT INTO jurnal_mengajar (id, guru_id, mapel_id, rombel_id, tanggal, jam_ke, materi, kegiatan, catatan, status, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id, guru_id, mapel_id, rombel_id, tanggal, jam_ke||1, materi||'', kegiatan||'', catatan||'', 'submitted', req.tenantId)
  res.json({ id })
})

app.put('/api/jurnal/:id', STAFF, (req, res) => {
  const { materi, kegiatan, catatan, status } = req.body
  const reviewer = ['admin','super_admin','kepala','operator'].includes(req.user.role)
  if (reviewer && ['approved','rejected'].includes(status)) {
    const result = db.prepare("UPDATE jurnal_mengajar SET status=? WHERE id=? AND tenant_id=? AND status='submitted'").run(status, req.params.id, req.tenantId)
    return res.status(result.changes ? 200 : 404).json(result.changes ? { success: true } : { error: 'Jurnal submitted tidak ditemukan' })
  } else {
    if (!['guru','wali_kelas'].includes(req.user.role) || !['draft','submitted'].includes(status)) return res.status(403).json({ error: 'Status jurnal tidak diizinkan' })
    const gtk = resolveGtkForUser(req.user.id, req.tenantId)
    if (!gtk) return res.status(403).json({ error: 'Akun guru belum terhubung ke GTK' })
    const result = db.prepare("UPDATE jurnal_mengajar SET materi=?, kegiatan=?, catatan=?, status=? WHERE id=? AND guru_id=? AND tenant_id=? AND status IN ('draft','rejected')").run(materi||'', kegiatan||'', catatan||'', status, req.params.id, gtk.id, req.tenantId)
    return res.status(result.changes ? 200 : 404).json(result.changes ? { success: true } : { error: 'Jurnal tidak ditemukan atau tidak dapat diubah' })
  }
})

app.delete('/api/jurnal/:id', STAFF, (req, res) => {
  const reviewer = ['admin','super_admin','kepala','operator'].includes(req.user.role)
  let result
  if (reviewer) {
    result = db.prepare('DELETE FROM jurnal_mengajar WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
  } else {
    const gtk = resolveGtkForUser(req.user.id, req.tenantId)
    if (!gtk) return res.status(403).json({ error: 'Akun guru belum terhubung ke GTK' })
    result = db.prepare("DELETE FROM jurnal_mengajar WHERE id=? AND guru_id=? AND tenant_id=? AND status IN ('draft','rejected')").run(req.params.id, gtk.id, req.tenantId)
  }
  res.status(result.changes ? 200 : 404).json(result.changes ? { success: true } : { error: 'Jurnal tidak ditemukan atau tidak dapat dihapus' })
})

// ==================== POSTING ====================

for (const [name, definition] of [
  ['media', 'TEXT DEFAULT \'[]\''],
  ['activity_type', 'TEXT DEFAULT \'\''],
  ['location_lat', 'REAL'],
  ['location_lng', 'REAL'],
  ['location_name', 'TEXT DEFAULT \'\''],
  ['poll_data', 'TEXT DEFAULT \'[]\''],
  ['tags', 'TEXT DEFAULT \'[]\''],
  ['likes_count', 'INTEGER DEFAULT 0'],
  ['comments_count', 'INTEGER DEFAULT 0'],
  ['shares_count', 'INTEGER DEFAULT 0'],
  ['media_url', 'TEXT DEFAULT \'\''],
  ['media_type', 'TEXT DEFAULT \'\''],
  ['link_url', 'TEXT DEFAULT \'\''],
  ['lokasi', 'TEXT DEFAULT \'\''],
  ['sticker', 'TEXT DEFAULT \'\''],
  ['emoticon', 'TEXT DEFAULT \'\'']
]) if (!db.prepare('PRAGMA table_info(posting)').all().some(c => c.name === name)) db.exec(`ALTER TABLE posting ADD COLUMN ${name} ${definition}`)

app.get('/api/notifications', authMiddleware, (req, res) => {
  const role = req.user.role || ''
  const rows = db.prepare(`SELECT id, judul, isi, kategori, penulis_nama, created_at FROM posting WHERE tenant_id=? AND (kategori IN ('pengumuman','info','berita') OR kategori IS NULL) ORDER BY created_at DESC LIMIT 20`).all(req.tenantId)
  res.json(rows.map(r => ({ ...r, role })))
})

app.get('/api/posting', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM posting WHERE tenant_id=? ORDER BY created_at DESC').all(req.tenantId)
  const likedIds = new Set(db.prepare('SELECT posting_id FROM posting_likes WHERE user_id=?').all(req.user.id).map(r => r.posting_id))
  const jp = (v, d) => { try { const p = JSON.parse(v); return Array.isArray(p) ? p : d } catch { return d } }
  res.json(rows.map(p => ({
    ...p,
    media: jp(p.media, []),
    poll_data: jp(p.poll_data, []),
    tags: jp(p.tags, []),
    user_liked: likedIds.has(p.id)
  })))
})

app.post('/api/posting', STAFF, (req, res) => {
  const { judul, isi, kategori, media, activity_type, location_lat, location_lng, location_name, poll_data, tags } = req.body
  if (!judul?.trim() || !isi?.trim()) return res.status(400).json({ error: 'Judul dan isi wajib diisi.' })
  const id = uuidv4()
  db.prepare(`INSERT INTO posting (id, tenant_id, author_user_id, konten, judul, isi, kategori, penulis_id, penulis_nama, media, activity_type, location_lat, location_lng, location_name, poll_data, tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.tenantId, req.user.id, isi.trim(), judul.trim(), isi.trim(), kategori || 'berita', req.user.id, req.user.nama || req.user.username || '', JSON.stringify(media || []), activity_type || '', location_lat || null, location_lng || null, location_name || '', JSON.stringify(poll_data || []), JSON.stringify(tags || []))
  res.json({ id })
})

app.post('/api/posting/upload', STAFF, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File wajib diunggah' })
  const mime = req.file.mimetype || ''
  const mediaType = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file'
  res.json({ media_url: '/uploads/' + req.file.filename, media_type: mediaType, filename: req.file.originalname })
})

app.delete('/api/posting/:id', STAFF, (req, res) => {
  const row = db.prepare('SELECT penulis_id FROM posting WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
  if (!row) return res.status(404).json({ error: 'Posting tidak ditemukan.' })
  if (!['admin','super_admin'].includes(req.user.role) && row.penulis_id !== req.user.id) return res.status(403).json({ error: 'Tidak boleh menghapus posting pengguna lain.' })
  db.prepare('DELETE FROM posting WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
  res.json({ success: true })
})

app.put('/api/posting/:id', STAFF, (req, res) => {
  const row = db.prepare('SELECT penulis_id FROM posting WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
  if (!row) return res.status(404).json({ error: 'Posting tidak ditemukan.' })
  if (!['admin','super_admin'].includes(req.user.role) && row.penulis_id !== req.user.id) return res.status(403).json({ error: 'Tidak boleh mengedit posting pengguna lain.' })
  const { judul, isi, kategori, media, activity_type, location_lat, location_lng, location_name, poll_data, tags } = req.body
  if (!judul?.trim() || !isi?.trim()) return res.status(400).json({ error: 'Judul dan isi wajib diisi.' })
  db.prepare(`UPDATE posting SET judul=?, isi=?, konten=?, kategori=?, media=?, activity_type=?, location_lat=?, location_lng=?, location_name=?, poll_data=?, tags=? WHERE id=? AND tenant_id=?`)
    .run(judul.trim(), isi.trim(), isi.trim(), kategori || 'berita', JSON.stringify(media || []), activity_type || '', location_lat || null, location_lng || null, location_name || '', JSON.stringify(poll_data || []), JSON.stringify(tags || []), req.params.id, req.tenantId)
  res.json({ success: true })
})

app.post('/api/posting/:id/like', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT likes_count FROM posting WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
  if (!row) return res.status(404).json({ error: 'Posting tidak ditemukan.' })
  const liked = db.prepare('SELECT 1 FROM posting_likes WHERE posting_id=? AND user_id=?').get(req.params.id, req.user.id)
  if (liked) {
    db.prepare('DELETE FROM posting_likes WHERE posting_id=? AND user_id=?').run(req.params.id, req.user.id)
    db.prepare('UPDATE posting SET likes_count = likes_count - 1 WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
  } else {
    db.prepare('INSERT INTO posting_likes (id, posting_id, user_id, created_at) VALUES (?,?,?,datetime(\'now\'))').run(uuidv4(), req.params.id, req.user.id)
    db.prepare('UPDATE posting SET likes_count = likes_count + 1 WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
  }
  res.json({ success: true })
})

app.post('/api/posting/:id/share', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT shares_count FROM posting WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
  if (!row) return res.status(404).json({ error: 'Posting tidak ditemukan.' })
  db.prepare('INSERT INTO posting_shares (id, posting_id, user_id, created_at) VALUES (?,?,?,datetime(\'now\'))').run(uuidv4(), req.params.id, req.user.id)
  db.prepare('UPDATE posting SET shares_count = shares_count + 1 WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
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
      db.prepare('UPDATE penilaian_harian SET sikap=?, keaktifan=?, pengetahuan=?, catatan=? WHERE id=? AND tenant_id=?').run(d.sikap||0, d.keaktifan||0, d.pengetahuan||0, d.catatan||'', exists.id, req.tenantId)
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

// ==================== CATATAN KEPRIBADIAN ====================
function teacherCanAccessStudent(req, siswaId) {
  if (!['guru', 'wali_kelas'].includes(req.user.role)) return true
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  if (!gtk) return false
  return !!db.prepare(`SELECT 1 FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
    WHERE s.id=? AND s.tenant_id=? AND (r.wali_kelas_id=? OR s.rombel_id IN
      (SELECT rombel_id FROM pengajar WHERE gtk_id=? AND tenant_id=? UNION SELECT rombel_id FROM jadwal WHERE gtk_id=? AND tenant_id=?))`)
    .get(siswaId, req.tenantId, gtk.id, gtk.id, req.tenantId, gtk.id, req.tenantId)
}

app.get('/api/catatan-kepribadian', authMiddleware, (req, res) => {
  const { siswa_id, rombel_id, tahun_ajaran, semester } = req.query
  let sql = `SELECT c.*, s.nama as siswa_nama, s.nis, r.nama as rombel_nama
    FROM catatan_kepribadian c
    LEFT JOIN siswa s ON c.siswa_id = s.id
    LEFT JOIN rombel r ON s.rombel_id = r.id
    WHERE c.tenant_id=?`
  const params = [req.tenantId]
  if (['guru','wali_kelas'].includes(req.user.role)) {
    const gtk = resolveGtkForUser(req.user.id, req.tenantId)
    if (!gtk) return res.json([])
    sql += ` AND (r.wali_kelas_id=? OR s.rombel_id IN (SELECT rombel_id FROM pengajar WHERE gtk_id=? AND tenant_id=? UNION SELECT rombel_id FROM jadwal WHERE gtk_id=? AND tenant_id=?))`
    params.push(gtk.id, gtk.id, req.tenantId, gtk.id, req.tenantId)
  }
  if (siswa_id) { sql += ' AND c.siswa_id=?'; params.push(siswa_id) }
  if (rombel_id) { sql += ' AND s.rombel_id=?'; params.push(rombel_id) }
  if (tahun_ajaran) { sql += ' AND c.tahun_ajaran=?'; params.push(tahun_ajaran) }
  if (semester) { sql += ' AND c.semester=?'; params.push(semester) }
  sql += ' ORDER BY s.nama'
  res.json(db.prepare(sql).all(...params))
})

app.put('/api/catatan-kepribadian', STAFF, (req, res) => {
  const { siswa_id, tahun_ajaran, semester, sikap_spiritual, sikap_sosial, kelakuan, kerajinan, kerapian, kedisiplinan, catatan_wali_kelas, saran } = req.body
  if (!siswa_id || !tahun_ajaran || !semester) return res.status(400).json({ error: 'siswa_id, tahun_ajaran, semester wajib' })
  if (!teacherCanAccessStudent(req, siswa_id)) return res.status(403).json({ error: 'Siswa tidak termasuk cakupan pengajaran Anda' })
  const siswa = db.prepare('SELECT id FROM siswa WHERE id=? AND tenant_id=?').get(siswa_id, req.tenantId)
  if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan' })
  const id = uuidv4()
  db.prepare(`INSERT INTO catatan_kepribadian (id, siswa_id, tahun_ajaran, semester, sikap_spiritual, sikap_sosial, kelakuan, kerajinan, kerapian, kedisiplinan, catatan_wali_kelas, saran, tenant_id, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(siswa_id, tahun_ajaran, semester, tenant_id) DO UPDATE SET
    sikap_spiritual=excluded.sikap_spiritual,
    sikap_sosial=excluded.sikap_sosial,
    kelakuan=excluded.kelakuan,
    kerajinan=excluded.kerajinan,
    kerapian=excluded.kerapian,
    kedisiplinan=excluded.kedisiplinan,
    catatan_wali_kelas=excluded.catatan_wali_kelas,
    saran=excluded.saran,
    updated_at=datetime('now')`)
    .run(id, siswa_id, tahun_ajaran, semester, sikap_spiritual || '', sikap_sosial || '', kelakuan || 'Baik', kerajinan || 'Baik', kerapian || 'Baik', kedisiplinan || 'Baik', catatan_wali_kelas || '', saran || '', req.tenantId)
  res.json({ success: true })
})

app.post('/api/catatan-kepribadian/bulk', STAFF, (req, res) => {
  const { tahun_ajaran, semester, data } = req.body
  if (!tahun_ajaran || !semester || !Array.isArray(data)) return res.status(400).json({ error: 'tahun_ajaran, semester, data wajib' })
  if (data.some(d => d.siswa_id && !teacherCanAccessStudent(req, d.siswa_id))) return res.status(403).json({ error: 'Terdapat siswa di luar cakupan pengajaran Anda' })
  const upsert = db.prepare(`INSERT INTO catatan_kepribadian (id, siswa_id, tahun_ajaran, semester, sikap_spiritual, sikap_sosial, kelakuan, kerajinan, kerapian, kedisiplinan, catatan_wali_kelas, saran, tenant_id, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(siswa_id, tahun_ajaran, semester, tenant_id) DO UPDATE SET
    sikap_spiritual=excluded.sikap_spiritual, sikap_sosial=excluded.sikap_sosial, kelakuan=excluded.kelakuan, kerajinan=excluded.kerajinan, kerapian=excluded.kerapian, kedisiplinan=excluded.kedisiplinan, catatan_wali_kelas=excluded.catatan_wali_kelas, saran=excluded.saran, updated_at=datetime('now')`)
  let count = 0
  const tx = db.transaction(rows => {
    for (const d of rows) {
      if (!d.siswa_id) continue
      const siswa = db.prepare('SELECT id FROM siswa WHERE id=? AND tenant_id=?').get(d.siswa_id, req.tenantId)
      if (!siswa) continue
      upsert.run(uuidv4(), d.siswa_id, tahun_ajaran, semester, d.sikap_spiritual || '', d.sikap_sosial || '', d.kelakuan || 'Baik', d.kerajinan || 'Baik', d.kerapian || 'Baik', d.kedisiplinan || 'Baik', d.catatan_wali_kelas || '', d.saran || '', req.tenantId)
      count++
    }
  })
  tx(data)
  res.json({ count })
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
app.get('/api/dashboard/stats', DASHBOARD_ROLES, (req, res) => {
  const today = todayJakarta()
  const tid = req.tenantId
  const totalSiswa = db.prepare("SELECT COUNT(*) as c FROM siswa WHERE tenant_id=?").get(tid).c
  const totalGTK = db.prepare("SELECT COUNT(*) as c FROM gtk WHERE tenant_id=?").get(tid).c
  const totalMapel = db.prepare("SELECT COUNT(*) as c FROM mapel WHERE tenant_id=?").get(tid).c
  const totalRombel = db.prepare("SELECT COUNT(*) as c FROM rombel WHERE tenant_id=?").get(tid).c
  const totalJurnal = db.prepare("SELECT COUNT(*) as c FROM jurnal_mengajar WHERE tanggal=? AND tenant_id=?").get(today, tid).c
  const siswaAktif = db.prepare("SELECT COUNT(*) as c FROM siswa WHERE status='aktif' AND tenant_id=?").get(tid).c
  const gtkAktif = db.prepare("SELECT COUNT(*) as c FROM gtk WHERE status='aktif' AND tenant_id=?").get(tid).c
  const terlambat = getLateDashboard(db, tid, today)

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
    tagihan: { belum_bayar: tagihanBelumBayar, lunas: tagihanLunas },
    terlambat
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
  const result = waQueue.enqueue(db, { tenantId: req.tenantId, phone, message: message || 'Test pesan dari JURNALKU', key: `test:${uuidv4()}` })
  // Baileys path is queued first, sent by worker shortly after. UI needs queued=true as success, not failure.
  res.json({ ...result, success: !!result.queued, status: result.queued ? 'queued' : 'failed', message: result.queued ? 'Pesan masuk antrean dan akan dikirim Baileys' : (result.reason || 'Gagal antre') })
})

app.get('/api/wa-gateway/status', ADMIN, (req, res) => {
  res.json(db.prepare('SELECT status,phone,last_error,updated_at,qr IS NOT NULL AS has_qr FROM wa_sessions WHERE tenant_id=?').get(req.tenantId) || { status: 'disconnected' })
})
app.post('/api/wa-gateway/connect', ADMIN, (req, res) => {
  waGateway.getConfig(req.tenantId)
  db.prepare("UPDATE wa_gateway_config SET enabled=1,provider='baileys' WHERE tenant_id=?").run(req.tenantId)
  db.prepare("INSERT INTO wa_sessions(tenant_id,status,requested_action) VALUES(?,'connecting','connect') ON CONFLICT(tenant_id) DO UPDATE SET status='connecting',requested_action='connect',qr=NULL,last_error=NULL").run(req.tenantId)
  res.json({ status: 'starting' })
})
app.get('/api/wa-gateway/qr', ADMIN, async (req, res) => {
  const row = db.prepare('SELECT qr FROM wa_sessions WHERE tenant_id=?').get(req.tenantId)
  row?.qr ? res.json({ data_url: await require('qrcode').toDataURL(row.qr) }) : res.status(404).json({ error: 'QR belum tersedia' })
})

app.get('/api/wa-gateway/qr-image', ADMIN, async (req, res) => {
  const row = db.prepare('SELECT qr,status FROM wa_sessions WHERE tenant_id=?').get(req.tenantId)
  if (!row?.qr) return res.json({ status: row?.status || 'not_ready', qr: null })
  const QRCode = require('qrcode')
  res.json({ status: row.status, qr: row.qr, image: await QRCode.toDataURL(row.qr, { margin: 1, width: 280 }) })
})

app.post('/api/wa-gateway/logout', ADMIN, (req, res) => {
  db.prepare('UPDATE wa_gateway_config SET enabled=0 WHERE tenant_id=?').run(req.tenantId)
  db.prepare("INSERT INTO wa_sessions(tenant_id,status,requested_action) VALUES(?,'disconnecting','logout') ON CONFLICT(tenant_id) DO UPDATE SET status='disconnecting',requested_action='logout'").run(req.tenantId)
  res.json({ status: 'disconnecting' })
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
  const details = db.prepare('SELECT * FROM broadcast_detail WHERE broadcast_id = ? AND tenant_id = ? ORDER BY nama').all(req.params.id, req.tenantId)
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
// Catatan: route /api/tenants* didefinisikan di server/tenant.cjs
// lewat registerTenantRoutes() (di atas). Handler duplikat yang dulunya
// ada di sini (versi inline yang tidak memvalidasi slug dan hardcode
// password 'admin123') sudah dihapus demi konsistensi. Lihat
// tenant.cjs#registerTenantRoutes untuk versi yang lebih aman dengan
// initial_password acak + flag must_change_password.

// SPA fallback - serve index.html for non-API GET routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' })
  if (req.method !== 'GET') return next()
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
})

// Global error handler: cegah crash 500 kosong, kembalikan JSON error yang bisa dibaca frontend
app.use((err, req, res, next) => {
  console.error('Unhandled error:', req.method, req.path, err.message)
  if (res.headersSent) return next(err)
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT')
    return res.status(400).json({ error: 'Data duplikat (kode/NIP/NIS sudah dipakai).' })
  if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY')
    return res.status(400).json({ error: 'Data masih dipakai di tabel lain. Hapus data terkait dulu.' })
  res.status(500).json({ error: 'Terjadi kesalahan server: ' + (err.message || 'unknown') })
})

// Start server
app.listen(PORT, () => {

// ==================== WA AUTO SCHEDULER ====================
// Jalankan notif otomatis setiap 1 menit untuk semua tenant aktif
setInterval(async () => {
  try {
    const date = todayJakarta()
    const time = timeJakarta()
    const tenants = db.prepare("SELECT id FROM tenants WHERE aktif=1 OR aktif IS NULL").all()
    for (const t of tenants) {
      try {
        // Notif guru belum ceklok
        waQueue.queueDueTeachers(db, { tenantId: t.id, date, time })
        // Notif jadwal guru (hanya hari kerja)
        waQueue.queueDueSchedules(db, { tenantId: t.id, date, time })
      } catch {}
    }
  } catch {}
}, 60 * 1000) // setiap 1 menit

  console.log(`JURNALKU API Server running on http://localhost:${PORT}`)
})

module.exports = app
