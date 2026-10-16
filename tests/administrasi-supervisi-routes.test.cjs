// Uji integrasi route Menu Administrasi + Supervisi tanpa HTTP nyata.
// App tiruan menangkap handler yang didaftarkan, lalu handler dipanggil dengan
// req/res palsu + DB SQLite asli. Fokus: penomoran, render HTML, dan hitung nilai
// dari sisi route (bukan hanya inti).

const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')

const { setupAdministrasi, registerAdministrasiRoutes } = require('../server/administrasi-routes.cjs')
const { setupSupervisi, registerSupervisiRoutes } = require('../server/supervisi-routes.cjs')

const TENANT = 'tenant-uji'

function makeDb() {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE tenants (id TEXT PRIMARY KEY, nama TEXT)')
  db.exec('CREATE TABLE settings (id TEXT PRIMARY KEY, tenant_id TEXT, nama_lembaga TEXT, alamat TEXT, kepala_sekolah TEXT, kota_cetak TEXT)')
  db.exec('CREATE TABLE users (id TEXT PRIMARY KEY, nama TEXT, role TEXT)')
  db.prepare('INSERT INTO tenants (id, nama) VALUES (?,?)').run(TENANT, 'MI Uji')
  db.prepare('INSERT INTO settings (id, tenant_id, nama_lembaga, kepala_sekolah, kota_cetak) VALUES (?,?,?,?,?)')
    .run(`main_${TENANT}`, TENANT, 'MI Miftahul Uji', 'H. Ahmad Fauzi', 'Bondowoso')
  return db
}

function fakeApp() {
  const routes = new Map()
  const add = (m) => (path, ...rest) => routes.set(`${m} ${path}`, rest[rest.length - 1])
  return { routes, get: add('GET'), post: add('POST'), put: add('PUT'), delete: add('DELETE') }
}

function fakeRes() {
  return {
    code: 200, body: null, headers: {},
    status(c) { this.code = c; return this },
    json(b) { this.body = b; return this },
    send(b) { this.body = b; return this },
    setHeader(k, v) { this.headers[k] = v },
  }
}

function panggil(app, method, path, extra = {}) {
  const handler = app.routes.get(`${method} ${path}`)
  assert.ok(handler, `route ${method} ${path} harus terdaftar`)
  const req = { tenantId: TENANT, user: { id: 'u-uji' }, body: {}, query: {}, params: {}, ...extra }
  const res = fakeRes()
  return Promise.resolve(handler(req, res)).then(() => res)
}

test('administrasi: GET jenis mengembalikan 5 jenis bawaan', async () => {
  const db = makeDb()
  setupAdministrasi(db)
  const app = fakeApp()
  registerAdministrasiRoutes(app, db, { requireRole: () => (req, res, next) => next() })
  const res = await panggil(app, 'GET', '/api/administrasi/jenis')
  assert.equal(res.body.success, true)
  assert.equal(res.body.jenis.length, 5)
})

test('administrasi: POST surat memberi nomor berurutan lalu GET :id mengembalikan HTML lengkap', async () => {
  const db = makeDb()
  setupAdministrasi(db)
  const app = fakeApp()
  registerAdministrasiRoutes(app, db, { requireRole: () => (req, res, next) => next() })
  const jenis = db.prepare('SELECT id FROM surat_jenis WHERE tenant_id=? AND kode=?').get(TENANT, 'SK-SISWA')

  const r1 = await panggil(app, 'POST', '/api/administrasi/surat', {
    body: { jenis_id: jenis.id, perihal: 'Keterangan siswa', kepada: 'Siti', tanggal: '2026-10-16', data: { nama: 'Siti Aminah', nisn: '007123', keperluan: 'beasiswa' } },
  })
  assert.equal(r1.body.success, true)
  assert.equal(r1.body.surat.nomor, '001/SK-SISWA/X/2026')

  const r2 = await panggil(app, 'POST', '/api/administrasi/surat', {
    body: { jenis_kode: 'SK-SISWA', tanggal: '2026-10-17', data: { nama: 'Budi' } },
  })
  assert.equal(r2.body.surat.nomor, '002/SK-SISWA/X/2026')

  const detail = await panggil(app, 'GET', '/api/administrasi/surat/:id', { params: { id: r1.body.surat.id } })
  assert.equal(detail.body.success, true)
  assert.match(detail.body.html, /Siti Aminah/)
  assert.match(detail.body.html, /001\/SK-SISWA\/X\/2026/)
  assert.match(detail.body.html, /H\. Ahmad Fauzi/)
})

test('administrasi: surat tenant lain tidak bisa dibaca (tenant-scoped)', async () => {
  const db = makeDb()
  setupAdministrasi(db)
  db.prepare('INSERT INTO tenants (id, nama) VALUES (?,?)').run('tenant-lain', 'MI Lain')
  const app = fakeApp()
  registerAdministrasiRoutes(app, db, { requireRole: () => (req, res, next) => next() })
  const jenis = db.prepare('SELECT id FROM surat_jenis WHERE tenant_id=?').get(TENANT)
  const r1 = await panggil(app, 'POST', '/api/administrasi/surat', { body: { jenis_id: jenis.id, tanggal: '2026-10-16' } })

  const handler = app.routes.get('GET /api/administrasi/surat/:id')
  const res = fakeRes()
  await handler({ tenantId: 'tenant-lain', user: {}, params: { id: r1.body.surat.id }, query: {}, body: {} }, res)
  assert.equal(res.code, 404)
})

test('supervisi: POST sesi menghitung nilai & predikat di sisi server', async () => {
  const db = makeDb()
  setupSupervisi(db)
  const app = fakeApp()
  registerSupervisiRoutes(app, db, { requireRole: () => (req, res, next) => next() })

  const ins = db.prepare("SELECT id FROM supervisi_instrumen WHERE tenant_id=? AND aspek='akademik'").get(TENANT)
  const butir = db.prepare('SELECT id, max_skor FROM supervisi_butir WHERE instrumen_id=?').all(ins.id)
  const skor = butir.map(b => ({ butir_id: b.id, skor: b.max_skor })) // nilai penuh

  const res = await panggil(app, 'POST', '/api/supervisi/sesi', {
    body: { instrumen_id: ins.id, nama_terperiksa: 'Budi Santoso', jabatan: 'Guru', tanggal: '2026-10-16', skor, status: 'final' },
  })
  assert.equal(res.body.success, true)
  assert.equal(res.body.sesi.persen, 100)
  assert.match(res.body.sesi.predikat, /^A/)
  assert.equal(res.body.sesi.status, 'final')

  // nilai dihitung server: klien kirim skor berlebih -> dipangkas, bukan dipercaya
  const r2 = await panggil(app, 'POST', '/api/supervisi/sesi', {
    body: { instrumen_id: ins.id, nama_terperiksa: 'Ani', tanggal: '2026-10-16', skor: butir.map(b => ({ butir_id: b.id, skor: 999 })) },
  })
  assert.equal(r2.body.sesi.persen, 100)
  assert.equal(r2.body.sesi.skor_total, r2.body.sesi.skor_maks)
})

test('supervisi: tren mengelompokkan per bulan & aspek', async () => {
  const db = makeDb()
  setupSupervisi(db)
  const app = fakeApp()
  registerSupervisiRoutes(app, db, { requireRole: () => (req, res, next) => next() })
  const ins = db.prepare("SELECT id FROM supervisi_instrumen WHERE tenant_id=? AND aspek='manajerial'").get(TENANT)
  const butir = db.prepare('SELECT id, max_skor FROM supervisi_butir WHERE instrumen_id=?').all(ins.id)
  for (const tgl of ['2026-09-10', '2026-10-16']) {
    await panggil(app, 'POST', '/api/supervisi/sesi', {
      body: { instrumen_id: ins.id, nama_terperiksa: 'Guru X', tanggal: tgl, skor: butir.map(b => ({ butir_id: b.id, skor: 3 })) },
    })
  }
  const res = await panggil(app, 'GET', '/api/supervisi/tren', { query: {} })
  assert.equal(res.body.success, true)
  assert.equal(res.body.tren.per_bulan.length, 2)
  assert.ok(res.body.tren.per_aspek.some(a => a.aspek === 'manajerial' && a.jumlah === 2))
})

test('supervisi: instrumen baru + butir editable lewat route', async () => {
  const db = makeDb()
  setupSupervisi(db)
  const app = fakeApp()
  registerSupervisiRoutes(app, db, { requireRole: () => (req, res, next) => next() })
  const r = await panggil(app, 'POST', '/api/supervisi/instrumen', { body: { aspek: 'akademik', nama: 'Instrumen Kustom', deskripsi: 'uji' } })
  assert.equal(r.body.success, true)
  const id = r.body.instrumen.id
  const rb = await panggil(app, 'POST', '/api/supervisi/instrumen/:id/butir', { params: { id }, body: { pertanyaan: 'Butir baru?', max_skor: 5 } })
  assert.equal(rb.body.success, true)
  assert.equal(rb.body.butir.max_skor, 5)
  const list = await panggil(app, 'GET', '/api/supervisi/instrumen', { query: { aspek: 'akademik' } })
  assert.ok(list.body.instrumen.some(i => i.id === id && i.butir.length === 1))
})