'use strict'
// Tes: kategori GTK, paket langganan bertingkat, override fitur, manajemen data,
// dan SMTP per lembaga. Semua memakai DB sementara — tidak menyentuh produksi.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(48)
const Database = require('better-sqlite3')

const AKAR = path.join(__dirname, '..')
const gtkKategori = require(path.join(AKAR, 'server/gtk-kategori.cjs'))
const subscription = require(path.join(AKAR, 'server/subscription.cjs'))
const fiturOverride = require(path.join(AKAR, 'server/fitur-override.cjs'))
const dataAdmin = require(path.join(AKAR, 'server/data-admin.cjs'))
const smtpTenant = require(path.join(AKAR, 'server/smtp-tenant.cjs'))

// ---------- 1. KATEGORI GTK ----------
test('kategori GTK: status kepegawaian memuat PNS/ASN, PPPK, Honorer, GTT, GTY', () => {
  const nilai = gtkKategori.STATUS_KEPEGAWAIAN.map(s => s.value)
  for (const v of ['pns', 'pppk', 'honorer', 'gtt', 'gty']) assert.ok(nilai.includes(v), `status ${v} harus ada`)
  const label = Object.fromEntries(gtkKategori.STATUS_KEPEGAWAIAN.map(s => [s.value, s.label]))
  assert.match(label.pns, /PNS/i)
  assert.match(label.gtt, /GTT/i)
  assert.match(label.gty, /GTY/i)
})

test('kategori GTK: jabatan memuat Guru BK dan guru sertifikasi terpisah', () => {
  const jab = gtkKategori.JABATAN.map(j => j.value)
  assert.ok(jab.includes('guru_bk'), 'jabatan Guru BK harus ada')
  assert.ok(jab.includes('guru'))
  const sert = gtkKategori.SERTIFIKASI.map(s => s.value)
  assert.deepStrictEqual(sert.sort(), ['belum', 'sudah'])
})

test('kategori GTK: normalisasi menyatukan nilai lama ke kanonik', () => {
  assert.strictEqual(gtkKategori.normalisasiStatus('PNS'), 'pns')
  assert.strictEqual(gtkKategori.normalisasiStatus('ASN'), 'pns')
  assert.strictEqual(gtkKategori.normalisasiStatus('Guru Tetap Yayasan'), 'gty')
  assert.strictEqual(gtkKategori.normalisasiStatus('Guru Tidak Tetap'), 'gtt')
  assert.strictEqual(gtkKategori.normalisasiJabatan('Kepala Sekolah'), 'kepala')
  assert.strictEqual(gtkKategori.normalisasiJabatan('guru_bk'), 'guru_bk')
  assert.strictEqual(gtkKategori.normalisasiJabatan('Guru BK'), 'guru_bk')
  // Alias dikenal dipetakan; nilai benar-benar tak dikenal jatuh ke default aman.
  assert.strictEqual(gtkKategori.normalisasiStatus('Honor Daerah'), 'honorer')
  assert.strictEqual(gtkKategori.normalisasiStatus('Kontrak Khusus XYZ'), 'honorer')
  assert.strictEqual(gtkKategori.normalisasiSertifikasi('sudah'), 'sudah')
  assert.strictEqual(gtkKategori.normalisasiSertifikasi(''), 'belum')
})

// ---------- 2. PAKET LANGGANAN BERTINGKAT ----------
function dbKosong() {
  const f = path.join(os.tmpdir(), 'jurnal-tes-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.db')
  const db = new Database(f)
  db.exec('PRAGMA foreign_keys=ON')
  // `setupSubscriptionTables` memigrasi tabel tenants, jadi tabelnya harus ada.
  db.exec(`CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY, slug TEXT, nama TEXT, plan TEXT, features_json TEXT, aktif INTEGER DEFAULT 1,
    subscription_ends_at TEXT, trial_ends_at TEXT, expired_at TEXT)`)
  subscription.setupSubscriptionTables(db)
  return { db, f }
}

// Setel ulang definisi paket ke bawaan kode — `setupSubscriptionPlans` memakai
// INSERT OR IGNORE sehingga tanpa ini paket dari tes sebelumnya tetap tertinggal
// di file DB yang berbeda.
function resetPaket(db) {
  db.exec('DROP TABLE IF EXISTS subscription_plans')
  subscription.setupSubscriptionPlans(db)
}

test('paket: lite < pro < premium (bertingkat nyata, bukan semua fitur)', () => {
  const { db, f } = dbKosong()
  try {
    const map = subscription.planFeatureMap(db)
    const fitur = (p) => new Set(Array.isArray(map[p]) ? map[p] : map[p].fitur)
    const lite = fitur('lite'), pro = fitur('pro'), premium = fitur('premium'), trial = fitur('trial')
    assert.ok(lite.size < pro.size, `lite(${lite.size}) harus < pro(${pro.size})`)
    assert.ok(pro.size < premium.size, `pro(${pro.size}) harus < premium(${premium.size})`)
    // Setiap fitur lite ada di pro, setiap fitur pro ada di premium.
    for (const k of lite) assert.ok(pro.has(k), `fitur lite ${k} harus ada di pro`)
    for (const k of pro) assert.ok(premium.has(k), `fitur pro ${k} harus ada di premium`)
    // Lite tanpa fitur premium-level.
    for (const k of ['cashless', 'ekantin', 'rest_api', 'website', 'backup_drive']) {
      assert.ok(!lite.has(k), `lite tidak boleh punya ${k}`)
    }
    // Premium punya semua; trial boleh coba semua.
    assert.strictEqual(premium.size, subscription.FEATURE_KEYS.length)
    assert.strictEqual(trial.size, subscription.FEATURE_KEYS.length)
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('paket: sinkronisasi memperbarui definisi lama tetapi MENGHORMATI yang sudah disesuaikan manual', () => {
  const { db, f } = dbKosong()
  try {
    resetPaket(db)
    // Simulasikan definisi lama 'pro' = SEMUA fitur (bentuk sebelum diperbaiki).
    db.prepare("UPDATE subscription_plans SET fitur_json=? WHERE plan='pro'")
      .run(JSON.stringify(Object.fromEntries(subscription.FEATURE_KEYS.map(k => [k, true]))))
    // Simulasikan 'lite' yang sudah disesuaikan admin (menambah rest_api).
    const liteManual = [...subscription.PLAN_FEATURES.lite, 'rest_api']
    db.prepare("UPDATE subscription_plans SET fitur_json=? WHERE plan='lite'")
      .run(JSON.stringify(Object.fromEntries(liteManual.map(k => [k, true]))))
    subscription.setupSubscriptionPlans(db)
    const map = subscription.planFeatureMap(db)
    const ambil = (p) => new Set(Array.isArray(map[p]) ? map[p] : map[p].fitur)
    // 'pro' kembali ke definisi baru (tanpa cashless/ekantin).
    assert.ok(!ambil('pro').has('cashless'), 'pro harus disinkronkan ke definisi baru')
    // 'lite' yang disesuaikan manual TIDAK diubah.
    assert.ok(ambil('lite').has('rest_api'), 'lite yang disesuaikan manual tidak boleh ditimpa')
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('paket: normalizeFeatureSelection tidak pernah menambah hak di luar paket', () => {
  const hasil = subscription.normalizeFeatureSelection({ cashless: true, ekantin: true, jurnal: true }, 'lite')
  assert.strictEqual(hasil.cashless, false, 'lite tidak boleh dapat cashless walau diminta')
  assert.strictEqual(hasil.ekantin, false)
  assert.strictEqual(hasil.jurnal, true, 'fitur dalam paket tetap boleh')
})

// ---------- 3. OVERRIDE FITUR PER TENANT ----------
function dbTenant() {
  const { db, f } = dbKosong()
  db.exec(`CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY, slug TEXT, nama TEXT, plan TEXT, features_json TEXT, aktif INTEGER DEFAULT 1)`)
  return { db, f }
}

test('override fitur: membersihkan fitur di luar paket, tidak menambah hak', () => {
  const { db, f } = dbTenant()
  try {
    const map = subscription.planFeatureMap(db)
    // Tenant lite dengan override berisi fitur premium (kasus nyata produksi).
    db.prepare('INSERT INTO tenants(id,slug,nama,plan,features_json) VALUES(?,?,?,?,?)')
      .run('t1', 'lembaga-a', 'Lembaga A', 'lite', JSON.stringify({ jurnal: true, cashless: true, ekantin: true, rest_api: true }))
    const rencana = fiturOverride.rencanaRapikanOverride(db, map)
    assert.strictEqual(rencana.perlu.length, 1, 'harus ada 1 tenant yang perlu dirapikan')
    const baru = rencana.perlu[0].baru
    assert.strictEqual(baru.cashless, false, 'cashless harus dimatikan untuk lite')
    assert.strictEqual(baru.ekantin, false)
    assert.strictEqual(baru.jurnal, true, 'fitur dalam paket dipertahankan')
    // Terapkan → DB benar-benar berubah.
    const hasil = fiturOverride.rapikanOverride(db, map, { terapkan: true })
    assert.strictEqual(hasil.dirapikan, 1)
    const isi = JSON.parse(db.prepare("SELECT features_json FROM tenants WHERE id='t1'").get().features_json)
    assert.strictEqual(isi.cashless, false)
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

// ---------- 4. MANAJEMEN DATA ----------
function dbManajemen() {
  const { db, f } = dbTenant()
  db.exec(`
    CREATE TABLE IF NOT EXISTS gtk (id TEXT PRIMARY KEY, nama TEXT, tenant_id TEXT);
    CREATE TABLE IF NOT EXISTS rombel (id TEXT PRIMARY KEY, nama TEXT, wali_kelas_id TEXT REFERENCES gtk(id), tenant_id TEXT);
    CREATE TABLE IF NOT EXISTS absensi_guru (id TEXT PRIMARY KEY, gtk_id TEXT NOT NULL REFERENCES gtk(id), tenant_id TEXT);
    CREATE TABLE IF NOT EXISTS siswa (id TEXT PRIMARY KEY, nama TEXT, tenant_id TEXT);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT, tenant_id TEXT);
  `)
  db.prepare('INSERT INTO tenants(id,slug,nama,plan) VALUES(?,?,?,?)').run('t1', 'a', 'Lembaga A', 'lite')
  db.prepare('INSERT INTO tenants(id,slug,nama,plan) VALUES(?,?,?,?)').run('t2', 'b', 'Lembaga B', 'pro')
  db.prepare('INSERT INTO gtk(id,nama,tenant_id) VALUES(?,?,?)').run('g1', 'Guru A1', 't1')
  db.prepare('INSERT INTO gtk(id,nama,tenant_id) VALUES(?,?,?)').run('g2', 'Guru A2', 't1')
  db.prepare('INSERT INTO gtk(id,nama,tenant_id) VALUES(?,?,?)').run('g3', 'Guru B1', 't2')
  db.prepare('INSERT INTO rombel(id,nama,wali_kelas_id,tenant_id) VALUES(?,?,?,?)').run('r1', 'Kelas 1', 'g1', 't1')
  db.prepare('INSERT INTO absensi_guru(id,gtk_id,tenant_id) VALUES(?,?,?)').run('a1', 'g1', 't1')
  db.prepare('INSERT INTO siswa(id,nama,tenant_id) VALUES(?,?,?)').run('s1', 'Siswa A1', 't1')
  return { db, f }
}

test('manajemen data: ringkasan menghitung baris per bagian dan per tenant', () => {
  const { db, f } = dbManajemen()
  try {
    const svc = dataAdmin.buatManajemenData(db, { logger: { error() { } } })
    const semua = svc.ringkasan(null).find(r => r.key === 'gtk')
    assert.strictEqual(semua.jumlah, 3, 'total GTK semua tenant = 3')
    const t1 = svc.ringkasan('t1').find(r => r.key === 'gtk')
    assert.strictEqual(t1.jumlah, 2, 'GTK tenant t1 = 2')
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('manajemen data: hapus TANPA kode konfirmasi benar ditolak', () => {
  const { db, f } = dbManajemen()
  try {
    const svc = dataAdmin.buatManajemenData(db, { logger: { error() { } } })
    assert.throws(() => svc.hapus('gtk', 't1', 'KODESALAH', 'uji'), /Kode konfirmasi salah/)
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM gtk').get().n, 3, 'data tidak boleh terhapus')
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('manajemen data: hapus menyapu tabel turunan FK-aware dan TIDAK menyentuh tenant lain', () => {
  const { db, f } = dbManajemen()
  try {
    const svc = dataAdmin.buatManajemenData(db, { logger: { error() { } } })
    const kode = dataAdmin.kodeKonfirmasi('gtk', 't1', 2)
    const hasil = svc.hapus('gtk', 't1', kode, 'uji')
    assert.strictEqual(hasil.dihapus, 3, 'gtk t1 (2) + absensi_guru t1 (1) = 3')
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM gtk').get().n, 1, 'GTK tenant lain harus utuh')
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM gtk WHERE tenant_id='t2'").get().n, 1)
    // rombel tetap ada tetapi wali_kelas_id diputus (FK nullable).
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM rombel').get().n, 1, 'rombel tidak dihapus')
    assert.strictEqual(db.prepare('SELECT wali_kelas_id FROM rombel WHERE id=?').get('r1').wali_kelas_id, null)
    assert.strictEqual(hasil.integritas.ok, true, 'tidak boleh ada pelanggaran FK')
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('manajemen data: tabel terlarang (users) tidak pernah bisa dihapus', () => {
  const { db, f } = dbManajemen()
  try {
    const svc = dataAdmin.buatManajemenData(db, { logger: { error() { } } })
    db.prepare('INSERT INTO users(id,email,tenant_id) VALUES(?,?,?)').run('u1', 'a@b.c', 't1')
    assert.ok(dataAdmin.TABEL_TERLARANG.has('users'))
    assert.ok(!Object.values(dataAdmin.BAGIAN).some(b => b.tables.includes('users')), 'users tidak boleh ada di daftar bagian')
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM users').get().n, 1)
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('manajemen data: impor memaksa tenant_id tujuan (tidak menyeberang tenant)', () => {
  const { db, f } = dbManajemen()
  try {
    const svc = dataAdmin.buatManajemenData(db, { logger: { error() { } } })
    const payload = { tabel: { siswa: [{ id: 's9', nama: 'Siswa Impor', tenant_id: 't2' }] } }
    const hasil = svc.impor('siswa', 't1', payload, 'merge')
    assert.strictEqual(hasil.masuk, 1)
    assert.strictEqual(db.prepare("SELECT tenant_id FROM siswa WHERE id='s9'").get().tenant_id, 't1',
      'tenant_id harus dipaksa ke tujuan, bukan ikut payload')
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('manajemen data: riwayat mencatat operasi penghapusan (audit)', () => {
  const { db, f } = dbManajemen()
  try {
    const svc = dataAdmin.buatManajemenData(db, { logger: { error() { } } })
    const kode = dataAdmin.kodeKonfirmasi('siswa', 't1', 1)
    svc.hapus('siswa', 't1', kode, 'admin@uji.id')
    const riw = svc.riwayat(5)
    assert.strictEqual(riw.length, 1)
    assert.strictEqual(riw[0].aksi, 'hapus')
    assert.strictEqual(riw[0].bagian, 'siswa')
    assert.strictEqual(riw[0].oleh, 'admin@uji.id')
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

// ---------- 5. SMTP PER LEMBAGA ----------
test('smtp: enkripsi password tidak menyimpan teks asli dan bisa didekripsi', () => {
  const enc = smtpTenant.enkripsi('Rahasia123!', 'kunci-uji')
  assert.ok(!enc.includes('Rahasia123'), 'password tidak boleh tersimpan sebagai teks biasa')
  assert.strictEqual(smtpTenant.dekripsi(enc, 'kunci-uji'), 'Rahasia123!')
  assert.strictEqual(smtpTenant.dekripsi(enc, 'kunci-lain'), '', 'kunci salah tidak boleh mengembalikan teks')
})

test('smtp: simpan & baca tidak pernah mengembalikan password utuh', () => {
  const { db, f } = dbKosong()
  try {
    const svc = smtpTenant.buatLayananSmtp(db, { rahasia: 'kunci-uji', logger: { warn() { } } })
    svc.simpan('t1', { smtp_host: 'mail.lembaga.id', smtp_port: 587, smtp_aman: 'starttls', smtp_user: 'a@lembaga.id', smtp_pass: 'Pw123!', smtp_from: 'no-reply@lembaga.id', aktif: 1 })
    const baca = svc.baca('t1')
    assert.strictEqual(baca.smtp_host, 'mail.lembaga.id')
    assert.strictEqual(baca.smtp_pass, undefined, 'password mentah tidak boleh dikembalikan')
    assert.strictEqual(baca.smtp_pass_terisi, true, 'harus menandai password sudah diisi')
    assert.ok(!JSON.stringify(baca).includes('Pw123!'), 'respons baca tidak boleh memuat password')
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('smtp: kirim jatuh ke MTA sistem bila SMTP lembaga tidak aktif', async () => {
  const { db, f } = dbKosong()
  try {
    const svc = smtpTenant.buatLayananSmtp(db, { rahasia: 'k', logger: { warn() { } } })
    let fallbackDipanggil = false
    const r = await svc.kirim('t1', { to: 'x@y.id', subject: 's', html: 'h' }, async () => { fallbackDipanggil = true; return { ok: true } })
    assert.strictEqual(fallbackDipanggil, true, 'fallback MTA harus dipanggil')
    assert.strictEqual(r.ok, true)
    assert.strictEqual(r.via, 'mta-sistem')
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

test('smtp: kirim ke host tak dikenal menghasilkan error jelas, bukan menggantung', async () => {
  const hasil = await smtpTenant.kirimSmtp(
    { host: '127.0.0.1', port: 1, aman: 'none', user: 'a', pass: 'b' },
    { to: 'x@y.id', subject: 's', html: 'h' }
  )
  assert.strictEqual(hasil.ok, false)
  assert.ok(hasil.error && hasil.error.length > 0, 'harus ada pesan error')
})

test('smtp: registrasi memakai SMTP lembaga bila disuntikkan, dan mencatat jalurnya', async () => {
  const { notifikasiRegistrasi } = require(path.join(AKAR, 'server/register-notify.cjs'))
  const { db, f } = dbKosong()
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS wa_sessions (tenant_id TEXT, status TEXT, updated_at TEXT);
             CREATE TABLE IF NOT EXISTS wa_gateway_config (tenant_id TEXT, enabled INTEGER);
             CREATE TABLE IF NOT EXISTS wa_queue (id TEXT PRIMARY KEY, tenant_id TEXT, phone TEXT, message TEXT, status TEXT, created_at TEXT, target_type TEXT, target_id TEXT, dedupe_key TEXT)`)
    let dipakaiSmtp = false
    const smtpPalsu = { kirim: async (tenantId, pesan, fallback) => { dipakaiSmtp = true; assert.strictEqual(tenantId, 'tbaru'); return { ok: true, via: 'smtp-lembaga' } } }
    const hasil = await notifikasiRegistrasi(db, {
      tenantId: 'tbaru', namaLembaga: 'Lembaga Baru', namaAdmin: 'Admin', email: 'admin@baru.id', noHp: '628123456789',
      smtp: smtpPalsu,
    })
    assert.strictEqual(dipakaiSmtp, true, 'SMTP lembaga harus dipakai saat disuntikkan')
    assert.strictEqual(hasil.email.ok, true)
    assert.strictEqual(hasil.email.via, 'smtp-lembaga')
  } finally { db.close(); fs.rmSync(f, { force: true }) }
})

// ---------- 6. PARITAS & GERBANG ----------
test('paritas: halaman Manajemen Data hanya untuk super_admin, SMTP untuk admin', () => {
  const app = fs.readFileSync(path.join(AKAR, 'src/App.tsx'), 'utf8')
  const blokManajemen = app.slice(app.indexOf('path="manajemen-data"'), app.indexOf('path="manajemen-data"') + 220)
  assert.match(blokManajemen, /super_admin/, 'Manajemen Data harus super_admin saja')
  const blokSmtp = app.slice(app.indexOf('path="smtp"'), app.indexOf('path="smtp"') + 220)
  assert.match(blokSmtp, /admin/, 'SMTP harus bisa diakses admin')
})

test('paritas: deploy menyalin dist ke KEDUA domain (jurnal.cc.cd + jurnalmadrasah.web.id)', () => {
  const promote = fs.readFileSync(path.join(AKAR, 'scripts/promote-live.sh'), 'utf8')
  assert.match(promote, /SECONDARY_LIVE/, 'promote harus menangani domain sekunder')
  assert.match(promote, /jurnalmadrasah/, 'domain sekunder harus jurnalmadrasah.web.id')
  const sync = fs.existsSync(path.join(AKAR, 'scripts/check-live-frontend-sync.mjs'))
  assert.ok(sync, 'harus ada pemeriksa sinkronisasi frontend antar domain')
})
