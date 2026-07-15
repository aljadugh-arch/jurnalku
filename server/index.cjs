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
const { parseGuruHariRules, guruBolehMengajar } = require('./jadwal-rules.cjs')

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
  ['settings', 'durasi_jtm', 'INTEGER'],
  ['settings', 'hari_libur', "TEXT DEFAULT '[\"jumat\"]'"],
  ['settings', 'bg_size', "TEXT DEFAULT 'cover'"],
  ['settings', 'bg_position', "TEXT DEFAULT 'center'"],
  ['settings', 'bg_repeat', "TEXT DEFAULT 'no-repeat'"],
  ['settings', 'bg_blur', "INTEGER DEFAULT 0"],
  ['wa_gateway_config', 'tenant_id', "TEXT DEFAULT 'default'"],
  ['broadcast_log', 'tenant_id', "TEXT DEFAULT 'default'"],
  ['broadcast_detail', 'tenant_id', "TEXT DEFAULT 'default'"],
  ['modul_ajar', 'kurikulum', "TEXT DEFAULT 'merdeka'"],
  ['gtk', 'kode_guru', "TEXT DEFAULT ''"],
  ['jadwal', 'template_id', 'TEXT'],
  ['jadwal', 'jenis_kegiatan', "TEXT DEFAULT 'mapel'"],
  ['jadwal', 'nama_kegiatan', "TEXT DEFAULT ''"],
  ['users', 'gtk_id', 'TEXT'],
  ['users', 'kode_guru', "TEXT DEFAULT ''"],
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
]) {
  try { db.prepare(`ALTER TABLE ${col[0]} ADD COLUMN ${col[1]} ${col[2]}`).run() } catch {}
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
)`)
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
const STAFF = requireRole('admin', 'super_admin', 'guru', 'wali_kelas', 'operator', 'tata_usaha', 'tu', 'kepala')

// Lightweight input validation at trust boundaries (no external lib).
const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 120
const isStr = (v, min = 1, max = 200) => typeof v === 'string' && v.trim().length >= min && v.length <= max
// Returns error string or null
function vLogin({ email, password }) {
  if (!isStr(email, 1, 120)) return 'Email/kode guru wajib diisi'
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
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  if (!u) return null
  const tid = tenantId || u.tenant_id
  let gtk = null
  if (u.gtk_id) gtk = db.prepare('SELECT * FROM gtk WHERE id = ? AND tenant_id = ?').get(u.gtk_id, tid)
  if (!gtk && u.nip) gtk = db.prepare('SELECT * FROM gtk WHERE nip = ? AND tenant_id = ?').get(u.nip, tid)
  if (!gtk && u.kode_guru) gtk = db.prepare("SELECT * FROM gtk WHERE kode_guru = ? AND kode_guru != '' AND tenant_id = ?").get(u.kode_guru, tid)
  if (!gtk && u.email) gtk = db.prepare("SELECT * FROM gtk WHERE email = ? AND email != '' AND tenant_id = ?").get(u.email, tid)
  // Kalau ketemu tapi users.gtk_id kosong, simpan biar next lookup instan.
  if (gtk && !u.gtk_id) { try { db.prepare('UPDATE users SET gtk_id = ? WHERE id = ?').run(gtk.id, u.id) } catch {} }
  // Auto-create GTK on-demand utk staf (admin/operator/TU/kepala) yg belum punya GTK -> agar bisa ceklok.
  if (!gtk && ['admin', 'operator', 'tata_usaha', 'tu', 'kepala'].includes(u.role)) {
    try {
      const gid = require('crypto').randomUUID()
      const nama = u.nama || ('Staf ' + ((u.email || '').split('@')[0] || ''))
      const jabatan = u.role === 'kepala' ? 'Kepala' : (u.role === 'operator' ? 'Operator' : (['tu', 'tata_usaha'].includes(u.role) ? 'Tata Usaha' : 'Admin'))
      db.prepare("INSERT INTO gtk (id, nama, jenis_kelamin, email, jabatan, status_kepegawaian, kode_guru, tenant_id) VALUES (?, ?, 'L', ?, ?, 'Tetap', '', ?)")
        .run(gid, nama, u.email || '', jabatan, tid)
      db.prepare('UPDATE users SET gtk_id = ? WHERE id = ?').run(gid, u.id)
      gtk = db.prepare('SELECT * FROM gtk WHERE id = ?').get(gid)
    } catch {}
  }
  return gtk
}

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { email, password } = req.body
  const vErr = vLogin(req.body); if (vErr) return res.status(400).json({ error: vErr })
  const tenantId = req.tenantId || 'default'
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
  // 3) Fallback users.kode_guru / users.nip langsung.
  if (!user) user = db.prepare("SELECT * FROM users WHERE tenant_id = ? AND ((kode_guru != '' AND lower(kode_guru) = ?) OR nip = ?)").get(tenantId, identLower, ident)
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Email/kode guru atau password salah' })
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
  // Auto-sync admin ke GTK untuk ceklok
  if (role === 'admin') {
    const existing = db.prepare('SELECT id FROM gtk WHERE nama = ? AND tenant_id = ?').get(nama.trim(), req.tenantId)
    if (!existing) {
      const gtkId = uuidv4()
      db.prepare('INSERT INTO gtk (id, nama, jabatan, email, tenant_id) VALUES (?,?,?,?,?)').run(gtkId, nama.trim(), 'Admin', email.trim(), req.tenantId)
      db.prepare('UPDATE users SET gtk_id = ? WHERE id = ?').run(gtkId, id)
    }
  }
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
  // Auto-sync admin ke GTK untuk ceklok
  if (role === 'admin' || target.role === 'admin') {
    const finalNama = nama || target.nama
    const finalEmail = email || target.email
    const existing = db.prepare('SELECT id FROM gtk WHERE nama = ? AND tenant_id = ?').get(finalNama, req.tenantId)
    if (!existing) {
      const gtkId = uuidv4()
      db.prepare('INSERT INTO gtk (id, nama, jabatan, email, tenant_id) VALUES (?,?,?,?,?)').run(gtkId, finalNama, 'Admin', finalEmail, req.tenantId)
      db.prepare('UPDATE users SET gtk_id = ? WHERE id = ?').run(gtkId, req.params.id)
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
  const { nama_lembaga, alamat, telepon, email, theme, primary_color, accent_color, sidebar_color, geo_latitude, geo_longitude, geo_radius, jenjang, durasi_jtm, hari_libur, bg_size, bg_position, bg_repeat, bg_blur } = req.body
  const id = 'main_' + req.tenantId
  const bg_size_v = bg_size || 'cover'
  const bg_position_v = bg_position || 'center'
  const bg_repeat_v = bg_repeat || 'no-repeat'
  const bg_blur_v = bg_blur || 0
  const durasi = durasi_jtm === '' || durasi_jtm == null ? null : Number(durasi_jtm)
  if (durasi !== null && (!Number.isInteger(durasi) || durasi < 20 || durasi > 120)) return res.status(400).json({ error: 'Durasi JTM harus 20–120 menit.' })
  db.prepare(`INSERT INTO settings (id, tenant_id, nama_lembaga, alamat, telepon, email, theme, primary_color, accent_color, sidebar_color, geo_latitude, geo_longitude, geo_radius, jenjang, durasi_jtm, hari_libur, bg_size, bg_position, bg_repeat, bg_blur, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(id) DO UPDATE SET nama_lembaga=excluded.nama_lembaga, alamat=excluded.alamat, telepon=excluded.telepon, email=excluded.email, theme=excluded.theme, primary_color=excluded.primary_color, accent_color=excluded.accent_color, sidebar_color=excluded.sidebar_color, geo_latitude=excluded.geo_latitude, geo_longitude=excluded.geo_longitude, geo_radius=excluded.geo_radius, jenjang=excluded.jenjang, durasi_jtm=excluded.durasi_jtm, hari_libur=excluded.hari_libur, bg_size=excluded.bg_size, bg_position=excluded.bg_position, bg_repeat=excluded.bg_repeat, bg_blur=excluded.bg_blur, updated_at=datetime('now')`)
    .run(id, req.tenantId, nama_lembaga, alamat, telepon, email, theme, primary_color, accent_color, sidebar_color, geo_latitude || null, geo_longitude || null, geo_radius || 200, jenjang || '', durasi, JSON.stringify(hari_libur || []), bg_size_v, bg_position_v, bg_repeat_v, bg_blur_v)
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
  try {
    db.prepare('INSERT INTO siswa (id, nis, nisn, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, nama_ortu, rombel_id, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, nis, nisn, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, no_hp, nama_ortu, rombel_id, req.tenantId)
    res.json({ id })
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
    res.json({ success: true })
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.code === 'SQLITE_CONSTRAINT') return res.status(400).json({ error: 'NIS ' + nis + ' sudah dipakai siswa lain.' })
    throw e
  }
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
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  const gtkId = gtk?.id
  if (!gtkId) return res.json({ jadwal_hari_ini: [], rekap_jurnal: { draft: 0, submitted: 0, approved: 0 }, rombel_count: 0, wali_rombel: [] })
  
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  const today = days[new Date().getDay()]
  const jadwal = db.prepare(`SELECT j.*, m.nama as mapel_nama, r.nama as rombel_nama FROM jadwal j LEFT JOIN mapel m ON j.mapel_id = m.id LEFT JOIN rombel r ON j.rombel_id = r.id WHERE j.gtk_id = ? AND j.hari = ? AND j.tenant_id=? ORDER BY j.jam_mulai`).all(gtkId, today, req.tenantId)
  
  const draft = db.prepare("SELECT COUNT(*) as c FROM jurnal_mengajar WHERE guru_id=? AND tenant_id=? AND status='draft'").get(gtkId, req.tenantId).c
  const submitted = db.prepare("SELECT COUNT(*) as c FROM jurnal_mengajar WHERE guru_id=? AND tenant_id=? AND status='submitted'").get(gtkId, req.tenantId).c
  const approved = db.prepare("SELECT COUNT(*) as c FROM jurnal_mengajar WHERE guru_id=? AND tenant_id=? AND status='approved'").get(gtkId, req.tenantId).c
  const rombelCount = db.prepare("SELECT COUNT(DISTINCT rombel_id) as c FROM pengajar WHERE gtk_id=? AND tenant_id=?").get(gtkId, req.tenantId).c
  const waliRombel = db.prepare(`SELECT r.*, (SELECT COUNT(*) FROM siswa s WHERE s.rombel_id=r.id AND s.tenant_id=?) as jumlah_siswa FROM rombel r WHERE r.wali_kelas_id=? AND r.tenant_id=? ORDER BY r.tingkat, r.nama`).all(req.tenantId, gtkId, req.tenantId)
  
  res.json({ jadwal_hari_ini: jadwal, rekap_jurnal: { draft, submitted, approved }, rombel_count: rombelCount, wali_rombel: waliRombel, gtk: gtk })
})

app.get('/api/guru/wali-kelas', authMiddleware, (req, res) => {
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  if (!gtk) return res.json({ gtk: null, rombels: [], siswa: [] })
  const rombels = db.prepare(`SELECT r.*, (SELECT COUNT(*) FROM siswa s WHERE s.rombel_id=r.id AND s.tenant_id=?) as jumlah_siswa FROM rombel r WHERE r.wali_kelas_id=? AND r.tenant_id=? ORDER BY r.tingkat, r.nama`).all(req.tenantId, gtk.id, req.tenantId)
  const siswa = db.prepare(`SELECT s.*, r.nama as rombel_nama FROM siswa s JOIN rombel r ON s.rombel_id=r.id WHERE r.wali_kelas_id=? AND s.tenant_id=? ORDER BY r.tingkat, r.nama, s.nama`).all(gtk.id, req.tenantId)
  res.json({ gtk, rombels, siswa })
})

// ==================== GURU ABSENSI (CEKLOK) ====================
app.get('/api/guru/absensi-saya', authMiddleware, (req, res) => {
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  if (!gtk) return res.json({ today: null, history: [] })
  const today = todayJakarta()
  const todayRecord = db.prepare('SELECT * FROM absensi_guru WHERE gtk_id = ? AND tanggal = ?').get(gtk.id, today)
  const history = db.prepare('SELECT * FROM absensi_guru WHERE gtk_id = ? ORDER BY tanggal DESC LIMIT 30').all(gtk.id)
  res.json({ today: todayRecord || null, history, gtk })
})

app.post('/api/guru/ceklok', STAFF, (req, res) => {
  const gtk = resolveGtkForUser(req.user.id, req.tenantId)
  if (!gtk) return res.status(400).json({ error: 'Akun Anda belum terhubung ke data GTK. Minta admin buatkan akun dari menu Data GTK (Buat Akun Guru).' })
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
  const today = todayJakarta()
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
// mode: 'monthly' (default, param bulan=YYYY-MM), 'weekly' (param mulai=YYYY-MM-DD; 7 hari),
//       'semester' (param tahun_ajaran=YYYY/YYYY + semester=ganjil|genap),
//       'yearly'   (param tahun=YYYY -> 12 bulan). tipe: 'siswa' | 'gtk'.
function buildRekapRange(q) {
  const mode = (q.mode || 'monthly').toLowerCase()
  if (mode === 'weekly') {
    const start = q.mulai || q.tanggal_mulai
    if (!start) return { error: 'Parameter mulai (YYYY-MM-DD) wajib untuk mode weekly' }
    const d = new Date(start + 'T00:00:00')
    if (isNaN(d.getTime())) return { error: 'Format mulai tidak valid' }
    const end = new Date(d.getTime() + 6 * 86400000)
    const iso = x => x.toISOString().slice(0, 10)
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
  const siswa = db.prepare("SELECT s.id, s.nama, s.nis, r.nama as rombel_nama FROM siswa s LEFT JOIN rombel r ON s.rombel_id = r.id WHERE s.tenant_id = ? ORDER BY r.nama, s.nama").all(req.tenantId)
  const detail = siswa.map(s => {
    const hadir = cnt('absensi_siswa', s.id, 'siswa_id', 'hadir')
    const sakit = cnt('absensi_siswa', s.id, 'siswa_id', 'sakit')
    const izin  = cnt('absensi_siswa', s.id, 'siswa_id', 'izin')
    const alpha = cnt('absensi_siswa', s.id, 'siswa_id', 'alpha')
    return { ...s, hadir, sakit, izin, alpha, total: hadir + sakit + izin + alpha }
  })
  const summary = { hadir: detail.reduce((s,d) => s+d.hadir, 0), sakit: detail.reduce((s,d) => s+d.sakit, 0), izin: detail.reduce((s,d) => s+d.izin, 0), alpha: detail.reduce((s,d) => s+d.alpha, 0) }
  res.json({ mode, from, to, label, detail, summary })
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
  const rombelSet = [...new Set(pengajar.map(p => p.rombel_id))]
  const tx = db.transaction(() => {
    if (overwrite) {
      const del = db.prepare('DELETE FROM jadwal WHERE tenant_id=? AND rombel_id=?')
      rombelSet.forEach(rid => del.run(tid, rid))
    }
    // State bentrok in-memory: guruBusy[gtk_id][hari] = Set(slotKe), rombelBusy[rombel_id][hari] = Set(slotKe)
    const guruBusy = {}, rombelBusy = {}, jamTerpakai = {}
    // Maks jam SATU MAPEL (pengajar) dalam SATU KELAS per HARI = 2 (biar mapel 4 jam kebagi 2 hari, bukan borong 1 hari).
    // Total per minggu tetap dibatasi jam_per_minggu tiap pengajar.
    const MAKS_JAM_MAPEL_PER_HARI = Number(req.body.maks_jam_mapel_per_hari) || 2
    const jamPengajarHari = {} // key: pengajar.id|hari -> count
    const phKey = (pid, h) => `${pid}|${h}`
    const mark = (obj, k1, k2, v) => { (obj[k1] ??= {})[k2] ??= new Set(); obj[k1][k2].add(v) }
    const has = (obj, k1, k2, v) => obj[k1]?.[k2]?.has(v)
    // Muat jadwal existing (kalau tak overwrite) agar tak bentrok
    if (!overwrite) {
      const ex = db.prepare('SELECT gtk_id, rombel_id, mapel_id, hari, jam_mulai FROM jadwal WHERE tenant_id=?').all(tid)
      ex.forEach(j => {
        const s = slots.find(x => x.mulai === j.jam_mulai)
        if (!s) return
        mark(guruBusy, j.gtk_id, j.hari, s.ke)
        mark(rombelBusy, j.rombel_id, j.hari, s.ke)
        const p = pengajar.find(pp => pp.gtk_id === j.gtk_id && pp.rombel_id === j.rombel_id && pp.mapel_id === j.mapel_id)
        if (p) { const k = phKey(p.id, j.hari); jamPengajarHari[k] = (jamPengajarHari[k] || 0) + 1; jamTerpakai[p.id] = (jamTerpakai[p.id] || 0) + 1 }
      })
    }
    const ins = db.prepare('INSERT INTO jadwal (id, mapel_id, rombel_id, gtk_id, hari, jam_mulai, jam_selesai, ruangan, template_id, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
    let created = 0
    // Round-robin: pool pengajar dgn sisa jam > 0. Isi rombel per hari per slot.
    pengajar.forEach(p => { jamTerpakai[p.id] = 0 })
    for (const rid of rombelSet) {
      const poolRombel = pengajar.filter(p => p.rombel_id === rid)
      for (const h of hari) {
        for (const s of slots) {
          if (has(rombelBusy, rid, h, s.ke)) continue // kelas sudah ada pelajaran di slot ini
          // cari pengajar yg: sisa jam minggu > 0, guru tak sibuk di slot ini, & belum penuh batas mapel/hari
          const cand = poolRombel.find(p => {
            const target = p.jam_per_minggu || 0
            if (!target) return false // wajib punya target jam
            const dipakai = jamTerpakai[p.id] || 0
            const perHari = jamPengajarHari[phKey(p.id, h)] || 0
            return dipakai < target
              && perHari < MAKS_JAM_MAPEL_PER_HARI
              && !has(guruBusy, p.gtk_id, h, s.ke)
              && guruBolehMengajar(p.gtk_nama, h, guruHariRules)
          })
          if (!cand) continue
          ins.run(uuidv4(), cand.mapel_id, rid, cand.gtk_id, h, s.mulai, s.selesai, '', template_id || null, tid)
          mark(guruBusy, cand.gtk_id, h, s.ke)
          mark(rombelBusy, rid, h, s.ke)
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
  res.json({ success: true })
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
  }
  res.json({ count, jenis: isPulang ? 'pulang' : 'masuk' })
})

// QR permanen per siswa = siswa.id (UUID, tidak pernah berubah). Scan -> tandai hadir hari ini.
app.post('/api/absensi-siswa/qr-scan', STAFF, (req, res) => {
  const raw = req.body.token
  if (!raw) return res.status(400).json({ error: 'Token QR kosong' })
  // QR bisa berisi id murni, atau URL/teks yang memuat id. Ambil token bersih.
  let token = String(raw).trim()
  // Kalau QR berisi URL (mis. .../s/<id>) ambil segmen terakhir.
  if (token.includes('/')) token = token.split('/').filter(Boolean).pop() || token
  if (token.includes('?')) token = token.split('?')[0]
  let siswa = db.prepare('SELECT * FROM siswa WHERE id = ? AND tenant_id = ?').get(token, req.tenantId)
  // Fallback: QR lama/manual mungkin memuat NIS/NISN.
  if (!siswa) siswa = db.prepare('SELECT * FROM siswa WHERE (nis = ? OR nisn = ?) AND tenant_id = ?').get(token, token, req.tenantId)
  if (!siswa) return res.status(404).json({ error: 'QR tidak dikenali / siswa tidak ditemukan' })
  const tanggal = todayJakarta()
  const waktu = timeJakarta()
  // Ambil jendela waktu sesi dari settings tenant
  const cfg = db.prepare('SELECT sesi_masuk_mulai, sesi_masuk_selesai, sesi_pulang_mulai, sesi_pulang_selesai FROM settings WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 1').get(req.tenantId) || {}
  const inWin = (t, a, b) => a && b && t >= a && t <= b
  const isMasuk = inWin(waktu, cfg.sesi_masuk_mulai, cfg.sesi_masuk_selesai)
  const isPulang = inWin(waktu, cfg.sesi_pulang_mulai, cfg.sesi_pulang_selesai)
  // Jika kedua jendela dikonfigurasi tapi waktu di luar keduanya -> tolak
  if (!isMasuk && !isPulang && (cfg.sesi_masuk_mulai || cfg.sesi_pulang_mulai)) {
    return res.status(400).json({ error: `Di luar jam absensi. Masuk ${cfg.sesi_masuk_mulai||'-'}–${cfg.sesi_masuk_selesai||'-'}, Pulang ${cfg.sesi_pulang_mulai||'-'}–${cfg.sesi_pulang_selesai||'-'}` })
  }
  const sesiPulang = isPulang && !isMasuk
  const exists = db.prepare('SELECT id, status, status_pulang FROM absensi_siswa WHERE siswa_id = ? AND tanggal = ? AND tenant_id = ?').get(siswa.id, tanggal, req.tenantId)
  if (sesiPulang) {
    // Sesi pulang: catat waktu_pulang & status_pulang
    if (!exists) {
      db.prepare('INSERT INTO absensi_siswa (id, siswa_id, rombel_id, tanggal, status, status_pulang, waktu_pulang, metode, tenant_id) VALUES (?,?,?,?,?,?,?,?,?)').run(uuidv4(), siswa.id, siswa.rombel_id, tanggal, 'hadir', 'hadir', waktu, 'qr', req.tenantId)
    } else {
      if (exists.status_pulang === 'hadir') return res.json({ siswa: { nama: siswa.nama, nis: siswa.nis }, already: true, sesi: 'pulang' })
      db.prepare('UPDATE absensi_siswa SET status_pulang=?, waktu_pulang=? WHERE id=?').run('hadir', waktu, exists.id)
    }
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
    db.prepare('UPDATE absensi_guru SET status=?, waktu_masuk=?, waktu_pulang=?, latitude=?, longitude=?, foto_selfie=?, keterangan=? WHERE id=?').run(status, waktu_masuk||null, waktu_pulang||null, latitude||null, longitude||null, foto_selfie||null, keterangan||'', exists.id)
    return res.json({ id: exists.id, updated: true })
  }
  db.prepare('INSERT INTO absensi_guru (id, gtk_id, tanggal, status, waktu_masuk, waktu_pulang, latitude, longitude, foto_selfie, tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, gtk_id, tanggal, status, waktu_masuk||null, waktu_pulang||null, latitude||null, longitude||null, foto_selfie||null, req.tenantId)
  res.json({ id })
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
  const rows = db.prepare(`SELECT j.*, m.nama as mapel_nama, r.nama as rombel_nama FROM jurnal_mengajar j LEFT JOIN mapel m ON j.mapel_id = m.id LEFT JOIN rombel r ON j.rombel_id = r.id WHERE j.guru_id = ? ORDER BY j.tanggal DESC, j.jam_ke`).all(gtk.id)
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

// ==================== CATATAN KEPRIBADIAN ====================
app.get('/api/catatan-kepribadian', authMiddleware, (req, res) => {
  const { siswa_id, rombel_id, tahun_ajaran, semester } = req.query
  let sql = `SELECT c.*, s.nama as siswa_nama, s.nis, r.nama as rombel_nama
    FROM catatan_kepribadian c
    LEFT JOIN siswa s ON c.siswa_id = s.id
    LEFT JOIN rombel r ON s.rombel_id = r.id
    WHERE c.tenant_id=?`
  const params = [req.tenantId]
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
app.get('/api/dashboard/stats', authMiddleware, (req, res) => {
  const today = todayJakarta()
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

// ==================== SUPERADMIN: TENANT MANAGEMENT ====================
// List all tenants (super_admin only)
app.get('/api/tenants', authMiddleware, (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Akses ditolak' })
  try {
    const tenants = db.prepare(`
      SELECT t.id, t.slug, t.nama, t.domain_custom, t.email, t.telepon, t.plan, t.max_siswa, t.max_gtk, t.aktif, t.created_at, t.expired_at,
        (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
        (SELECT COUNT(*) FROM siswa WHERE tenant_id = t.id) as siswa_count,
        (SELECT COUNT(*) FROM gtk WHERE tenant_id = t.id) as gtk_count
      FROM tenants t
      ORDER BY t.created_at DESC
    `).all()
    res.json(tenants)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Create new tenant (super_admin only)
app.post('/api/tenants', authMiddleware, (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Akses ditolak' })
  const { slug, nama, email, telepon, plan, max_siswa, max_gtk } = req.body
  if (!slug || !nama) return res.status(400).json({ error: 'Slug dan nama wajib diisi' })
  const id = uuidv4()
  try {
    db.prepare('INSERT INTO tenants (id, slug, nama, email, telepon, plan, max_siswa, max_gtk, aktif) VALUES (?,?,?,?,?,?,?,?,1)')
      .run(id, slug.toLowerCase(), nama, email || '', telepon || '', plan || 'free', max_siswa || 100, max_gtk || 20)
    // Create default admin user for new tenant
    const adminId = uuidv4()
    const adminPass = require('bcryptjs').hashSync('admin123', 10)
    db.prepare('INSERT INTO users (id, email, password, nama, role, tenant_id) VALUES (?,?,?,?,?,?)')
      .run(adminId, `admin@${slug}.com`, adminPass, 'Admin', 'admin', id)
    res.json({ id, slug, nama, admin_email: `admin@${slug}.com`, admin_password: 'admin123' })
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Slug sudah dipakai' })
    res.status(500).json({ error: e.message })
  }
})

// Update tenant (super_admin only)
app.put('/api/tenants/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Akses ditolak' })
  const { aktif, plan, max_siswa, max_gtk, expired_at } = req.body
  try {
    const updates = []
    const values = []
    if (aktif !== undefined) { updates.push('aktif = ?'); values.push(aktif ? 1 : 0) }
    if (plan) { updates.push('plan = ?'); values.push(plan) }
    if (max_siswa !== undefined) { updates.push('max_siswa = ?'); values.push(max_siswa) }
    if (max_gtk !== undefined) { updates.push('max_gtk = ?'); values.push(max_gtk) }
    if (expired_at !== undefined) { updates.push('expired_at = ?'); values.push(expired_at || null) }
    if (updates.length === 0) return res.status(400).json({ error: 'Tidak ada field untuk diupdate' })
    values.push(req.params.id)
    db.prepare(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Set custom domain (super_admin only)
app.put('/api/tenants/:id/domain', authMiddleware, (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Akses ditolak' })
  const { domain_custom } = req.body
  try {
    db.prepare('UPDATE tenants SET domain_custom = ? WHERE id = ?').run(domain_custom || null, req.params.id)
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Delete tenant (super_admin only)
app.delete('/api/tenants/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Akses ditolak' })
  try {
    const tenant = db.prepare('SELECT nama FROM tenants WHERE id = ?').get(req.params.id)
    if (!tenant) return res.status(404).json({ error: 'Tenant tidak ditemukan' })
    // Delete all tenant data (cascade via tenant_id FK)
    const tables = ['users', 'siswa', 'gtk', 'rombel', 'mapel', 'jadwal', 'absensi_siswa', 'absensi_guru', 'jurnal_mengajar', 'settings', 'tenants']
    db.transaction(() => {
      tables.slice(0, -1).forEach(t => db.prepare(`DELETE FROM ${t} WHERE tenant_id = ?`).run(req.params.id))
      db.prepare('DELETE FROM tenants WHERE id = ?').run(req.params.id)
    })()
    res.json({ success: true, deleted: tenant.nama })
  } catch (e) { res.status(500).json({ error: e.message }) }
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
  console.log(`JURNALKU API Server running on http://localhost:${PORT}`)
})

module.exports = app
