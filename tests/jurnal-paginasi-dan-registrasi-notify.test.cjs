// Optimasi Jurnal (paginasi) + notifikasi registrasi (WA & email) + alur registrasi.
//
// Tiga hal yang dijaga:
//   1. /api/jurnal mendukung paginasi (page/limit) — dulu SELURUH riwayat
//      dikirim sekaligus (947 baris / 578 KB) sehingga halaman lambat.
//      Klien lama (tanpa page/limit) tetap menerima array penuh.
//   2. Registrasi mengirim pemberitahuan ke WA (antrean wa_queue) dan email
//      (sendmail), tanpa pernah menggagalkan pendaftaran.
//   3. FE registrasi mengirim `domain_type: 'custom'` saat memilih domain sendiri
//      — tanpa itu server mengabaikan domain custom.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'kunci-uji-jurnalku-jurnal-00000'
process.env.MAIL_DISABLED = '1' // jangan benar-benar kirim email saat uji

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const { bangunPesan, alamatAman, bersihHeader } = require('../server/mailer.cjs')
const { pesanWaRegistrasi, htmlEmailRegistrasi, notifikasiRegistrasi } = require('../server/register-notify.cjs')
const { setupWA } = require('../server/wa-queue.cjs')

// Worker WA hanya memproses antrean untuk tenant ber-`wa_gateway_config.enabled=1`
// dengan sesi 'connected'. Notifikasi registrasi WAJIB mengantre lewat tenant itu,
// bukan tenant yang baru mendaftar (yang belum punya sesi apa pun) — kalau tidak,
// pesan menggantung di antrean selamanya.
function siapkanSesiWA(db, tenantId = 'default') {
  db.exec(`CREATE TABLE IF NOT EXISTS wa_gateway_config (tenant_id TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0, provider TEXT DEFAULT 'baileys');`)
  db.prepare("INSERT OR REPLACE INTO wa_gateway_config (tenant_id, enabled, provider) VALUES (?,1,'baileys')").run(tenantId)
  db.prepare("INSERT OR REPLACE INTO wa_sessions (tenant_id, status, updated_at) VALUES (?,'connected',datetime('now'))").run(tenantId)
}

// ─── Paginasi Jurnal ────────────────────────────────────────────────────────

test('GET /api/jurnal mendukung page & limit, klien lama tetap dapat array penuh', () => {
  const idx = read('server/index.cjs')
  const awal = idx.indexOf("app.get('/api/jurnal', requireRole(")
  const akhir = idx.indexOf("app.post('/api/jurnal/bulk-status'", awal)
  const route = idx.slice(awal, akhir)

  assert.match(route, /req\.query\.page/, 'harus membaca page')
  assert.match(route, /req\.query\.limit/, 'harus membaca limit')
  assert.match(route, /adaPaginasi/, 'harus punya cabang tanpa paginasi')
  assert.match(route, /LIMIT \? OFFSET \?/, 'harus memakai LIMIT/OFFSET')
  assert.match(route, /has_more/, 'harus mengembalikan has_more')
  assert.match(route, /Math\.min\(5000/, 'limit dibatasi maksimum')
  // Tanpa page/limit → bentuk array seperti sebelumnya.
  assert.match(route, /if \(!adaPaginasi\) \{\s*\/\/[^\n]*\n\s*return res\.json\(db\.prepare\(sql\)\.all\(\.\.\.params\)\)/)
})

test('klausa WHERE dibangun terpisah (query punya subquery dengan WHERE sendiri)', () => {
  const idx = read('server/index.cjs')
  const awal = idx.indexOf("app.get('/api/jurnal', requireRole(")
  const route = idx.slice(awal, idx.indexOf("app.post('/api/jurnal/bulk-status'", awal))
  assert.match(route, /const where = \['j\.tenant_id = \?'\]/)
  assert.match(route, /const whereSql = ' WHERE ' \+ where\.join\(' AND '\)/)
  // Total dihitung dari tabel langsung, bukan memotong string SQL.
  assert.match(route, /SELECT COUNT\(\*\) AS n FROM jurnal_mengajar j\$\{whereSql\}/)
  assert.doesNotMatch(route, /sql\.split\('WHERE'\)/, 'jangan memotong SQL di WHERE')
})

test('paginasi jurnal benar-benar membatasi jumlah baris (uji query nyata)', () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE jurnal_mengajar (id TEXT PRIMARY KEY, guru_id TEXT, mapel_id TEXT, rombel_id TEXT,
    tanggal TEXT, jam_ke INTEGER, status TEXT DEFAULT 'draft', tenant_id TEXT DEFAULT 'default');
    CREATE TABLE gtk (id TEXT PRIMARY KEY, nama TEXT, tenant_id TEXT);
    CREATE TABLE mapel (id TEXT PRIMARY KEY, nama TEXT, tenant_id TEXT);
    CREATE TABLE rombel (id TEXT PRIMARY KEY, nama TEXT, tenant_id TEXT);
    CREATE TABLE jadwal (id TEXT PRIMARY KEY, gtk_id TEXT, mapel_id TEXT, rombel_id TEXT, hari TEXT, jam_mulai TEXT, tenant_id TEXT, jenis_kegiatan TEXT);`)
  const ins = db.prepare('INSERT INTO jurnal_mengajar (id,guru_id,mapel_id,rombel_id,tanggal,jam_ke,tenant_id) VALUES (?,?,?,?,?,?,?)')
  for (let i = 0; i < 60; i++) ins.run(`j${i}`, 'g1', 'm1', 'r1', `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, i % 8, 't1')

  const whereSql = ' WHERE j.tenant_id = ?'
  const total = db.prepare(`SELECT COUNT(*) AS n FROM jurnal_mengajar j${whereSql}`).get('t1').n
  assert.equal(total, 60)
  const rows = db.prepare(`SELECT j.id FROM jurnal_mengajar j${whereSql} ORDER BY j.tanggal DESC, j.jam_ke LIMIT ? OFFSET ?`).all('t1', 24, 0)
  assert.equal(rows.length, 24, 'halaman pertama 24 baris')
  const rows2 = db.prepare(`SELECT j.id FROM jurnal_mengajar j${whereSql} ORDER BY j.tanggal DESC, j.jam_ke LIMIT ? OFFSET ?`).all('t1', 24, 24)
  assert.equal(rows2.length, 24, 'halaman kedua 24 baris')
  assert.notEqual(rows[0].id, rows2[0].id, 'halaman berbeda tidak boleh sama')
})

test('halaman Jurnal memakai paginasi + status memuat + skeleton', () => {
  const page = read('src/pages/admin/JurnalPage.tsx')
  assert.match(page, /const PER_HALAMAN = 24/)
  assert.match(page, /page: halaman, limit: PER_HALAMAN/)
  assert.match(page, /gantiHalaman/)
  assert.match(page, /animate-pulse/, 'harus ada skeleton saat memuat')
  assert.match(page, /aria-busy/)
  assert.match(page, /reqSeq/, 'harus ada penjaga race request')
  assert.match(page, /clearTimeout/, 'filter harus di-debounce')
  // Ekspor memakai limit=0 (semua baris), bukan hanya halaman aktif.
  assert.match(page, /limit: 0/)
})

// ─── Notifikasi registrasi ─────────────────────────────────────────────────

test('mailer membangun pesan MIME multipart dan menolak alamat tidak valid', () => {
  assert.equal(alamatAman('Budi <budi@contoh.id>'), 'Budi <budi@contoh.id>')
  assert.equal(alamatAman('bukan-email'), '')
  // Header injection dinetralkan.
  assert.equal(bersihHeader('x\r\nBcc: evil@x.com'), 'x Bcc: evil@x.com')
  const pesan = bangunPesan({ to: 'a@b.id', subject: 'Uji', html: '<b>Hai</b>', text: 'Hai' })
  assert.match(pesan, /multipart\/alternative/)
  assert.match(pesan, /Content-Type: text\/plain; charset=UTF-8/)
  assert.match(pesan, /Content-Type: text\/html; charset=UTF-8/)
})

test('pesan WA registrasi memuat nama lembaga, email, dan tautan akses', () => {
  const wa = pesanWaRegistrasi({
    namaLembaga: 'MTs Contoh', namaAdmin: 'Budi', email: 'budi@x.id',
    url: 'https://contoh.jurnal.cc.cd', slug: 'contoh', domainCustom: null,
  })
  assert.match(wa, /MTs Contoh/)
  assert.match(wa, /budi@x\.id/)
  assert.match(wa, /contoh\.jurnal\.cc\.cd/)
  // Domain custom pending menyebut instruksi DNS.
  const wa2 = pesanWaRegistrasi({
    namaLembaga: 'MTs Contoh', namaAdmin: 'Budi', email: 'budi@x.id',
    domainCustom: 'jurnal.contoh.sch.id', domainStatus: 'pending',
  })
  assert.match(wa2, /menunggu DNS/)
})

test('email registrasi berisi HTML dengan data lembaga (ter-escape)', () => {
  const html = htmlEmailRegistrasi({
    namaLembaga: 'MTs <script>', namaAdmin: 'Budi', email: 'budi@x.id',
    url: 'https://x.jurnal.cc.cd', slug: 'x',
  })
  assert.match(html, /MTs &lt;script&gt;/, 'HTML harus di-escape')
  assert.doesNotMatch(html, /MTs <script>/)
  assert.match(html, /budi@x\.id/)
})

test('notifikasiRegistrasi mengantre WA dan mencatat status email (tidak melempar)', async () => {
  const db = new Database(':memory:')
  setupWA(db)
  siapkanSesiWA(db)
  const hasil = await notifikasiRegistrasi(db, {
    tenantId: 't1', namaLembaga: 'MTs Contoh', namaAdmin: 'Budi',
    email: 'budi@x.id', noHp: '081234567890', slug: 'contoh', url: 'https://contoh.jurnal.cc.cd',
  })
  assert.equal(hasil.wa.ok, true, 'WA harus masuk antrean')
  const baris = db.prepare('SELECT * FROM wa_queue WHERE tenant_id=?').all('default')
  assert.equal(baris.length, 1, 'satu pesan WA diantrekan lewat tenant pengirim (default)')
  assert.equal(baris[0].phone, '6281234567890', 'nomor dinormalisasi ke 62')
  assert.match(baris[0].message, /MTs Contoh/)
  // Tidak boleh diantrekan atas nama tenant baru (belum punya sesi WA).
  assert.equal(db.prepare('SELECT COUNT(*) c FROM wa_queue WHERE tenant_id=?').get('t1').c, 0)
  // MAIL_DISABLED=1 → email tidak dikirim, tapi status dilaporkan (bukan error).
  assert.equal(hasil.email.ok, false)
  assert.match(hasil.email.error, /dimatikan/)
})

test('notifikasiRegistrasi idempoten: dua panggilan tidak menggandakan WA', async () => {
  const db = new Database(':memory:')
  setupWA(db)
  siapkanSesiWA(db)
  const arg = {
    tenantId: 't1', namaLembaga: 'MTs Contoh', namaAdmin: 'Budi',
    email: 'budi@x.id', noHp: '081234567890', slug: 'contoh',
  }
  await notifikasiRegistrasi(db, arg)
  const kedua = await notifikasiRegistrasi(db, arg)
  assert.equal(kedua.wa.ok, true)
  assert.match(kedua.wa.reason, /sudah pernah/)
  assert.equal(db.prepare("SELECT COUNT(*) c FROM wa_queue WHERE tenant_id='default'").get().c, 1)
})

test('notifikasiRegistrasi tahan nomor WA kosong (email tetap diproses)', async () => {
  const db = new Database(':memory:')
  setupWA(db)
  siapkanSesiWA(db)
  const hasil = await notifikasiRegistrasi(db, {
    tenantId: 't2', namaLembaga: 'X', namaAdmin: 'Y', email: 'y@x.id', noHp: '',
  })
  assert.equal(hasil.wa.ok, false)
  assert.match(hasil.wa.reason, /tidak valid|kosong/)
  assert.equal(db.prepare("SELECT COUNT(*) c FROM wa_queue WHERE tenant_id='default'").get().c, 0)
})

test('tanpa sesi WA aktif, notifikasi WA gagal dengan alasan jelas (bukan menggantung)', async () => {
  const db = new Database(':memory:')
  setupWA(db) // sengaja TANPA sesi/gateway
  const hasil = await notifikasiRegistrasi(db, {
    tenantId: 't3', namaLembaga: 'X', namaAdmin: 'Y', email: 'y@x.id', noHp: '081234567890',
  })
  assert.equal(hasil.wa.ok, false)
  assert.match(hasil.wa.reason, /tidak ada sesi WhatsApp aktif/)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM wa_queue').get().c, 0, 'jangan antre kalau tak ada pengirim')
})

// ─── Alur registrasi ───────────────────────────────────────────────────────

test('route registrasi memanggil notifikasiRegistrasi (WA + email)', () => {
  const idx = read('server/index.cjs')
  assert.match(idx, /const \{ notifikasiRegistrasi \} = require\('\.\/register-notify\.cjs'\)/)
  const awal = idx.indexOf("app.post('/api/auth/register'")
  const route = idx.slice(awal, idx.indexOf('// Verify & activate custom domain', awal))
  assert.match(route, /notifikasiRegistrasi\(db, \{/)
  assert.match(route, /noHp: no_hp/)
  // Fire-and-forget: respons tidak menunggu dan tidak bisa gagal karena notifikasi.
  assert.match(route, /\.catch\(e => console\.error\('\[register-notify\] gagal total:/)
})

test('FE registrasi mengirim domain_type custom (bug: domain sendiri diabaikan)', () => {
  const page = read('src/pages/auth/RegisterPage.tsx')
  assert.match(page, /payload\.domain_type = 'custom'/, 'WAJIB kirim domain_type saat mode custom')
  assert.match(page, /payload\.domain_custom = form\.domain_custom/)
  // Layar konfirmasi menyebut pemberitahuan WA + email.
  assert.match(page, /Pemberitahuan WhatsApp/)
  assert.match(page, /Pemberitahuan Email/)
})

test('validasi registrasi server tetap menerima payload FE (kontrak cocok)', () => {
  const idx = read('server/index.cjs')
  const awal = idx.indexOf("app.post('/api/auth/register'")
  const route = idx.slice(awal, idx.indexOf('// Verify & activate custom domain', awal))
  // Field yang dibaca server harus ada di payload FE.
  const fe = read('src/pages/auth/RegisterPage.tsx')
  for (const field of ['nama_lembaga', 'nama', 'email', 'password', 'no_hp']) {
    assert.match(route, new RegExp(field), `server harus membaca ${field}`)
    assert.match(fe, new RegExp(`${field}:`), `FE harus mengirim ${field}`)
  }
  assert.match(route, /domain_type === 'custom' && custom_domain/)
})
