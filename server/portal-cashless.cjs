const crypto = require('node:crypto')

function setupPortalCashless(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS user_students(tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,student_id TEXT NOT NULL,PRIMARY KEY(tenant_id,user_id,student_id));
  CREATE TABLE IF NOT EXISTS cashless_ledger(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,student_id TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount!=0),kind TEXT NOT NULL,idempotency_key TEXT NOT NULL,actor_id TEXT NOT NULL,reference TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(tenant_id,idempotency_key));
  CREATE TABLE IF NOT EXISTS cashless_invoices(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,student_id TEXT NOT NULL,provider TEXT NOT NULL,external_ref TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),status TEXT NOT NULL CHECK(status IN('pending','paid','expired','failed')),created_by TEXT,expires_at TEXT,paid_at TEXT,UNIQUE(tenant_id,provider,external_ref));
  CREATE TABLE IF NOT EXISTS cashless_provider_config(tenant_id TEXT NOT NULL,provider TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,webhook_secret TEXT,config_json TEXT NOT NULL DEFAULT '{}',PRIMARY KEY(tenant_id,provider));
  CREATE TABLE IF NOT EXISTS cashless_cards(tenant_id TEXT NOT NULL,student_id TEXT NOT NULL,qr_token_hash TEXT NOT NULL,pin_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(tenant_id,student_id),UNIQUE(tenant_id,qr_token_hash));
  CREATE TABLE IF NOT EXISTS asrama(id TEXT NOT NULL,tenant_id TEXT NOT NULL,nama TEXT NOT NULL,gender TEXT,PRIMARY KEY(tenant_id,id));
  CREATE TABLE IF NOT EXISTS kamar(id TEXT NOT NULL,tenant_id TEXT NOT NULL,asrama_id TEXT NOT NULL,nama TEXT NOT NULL,kapasitas INTEGER NOT NULL CHECK(kapasitas>0),PRIMARY KEY(tenant_id,id));
  CREATE TABLE IF NOT EXISTS penempatan_kamar(id TEXT NOT NULL,tenant_id TEXT NOT NULL,kamar_id TEXT NOT NULL,student_id TEXT NOT NULL,mulai TEXT NOT NULL,selesai TEXT,PRIMARY KEY(tenant_id,id));
  CREATE TABLE IF NOT EXISTS perizinan_santri(id TEXT NOT NULL,tenant_id TEXT NOT NULL,student_id TEXT NOT NULL,jenis TEXT NOT NULL,mulai TEXT NOT NULL,selesai TEXT,status TEXT NOT NULL DEFAULT 'pending',alasan TEXT,actor_id TEXT NOT NULL,PRIMARY KEY(tenant_id,id));
  CREATE TABLE IF NOT EXISTS kantin_menu(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,kategori TEXT NOT NULL,nama TEXT NOT NULL,deskripsi TEXT,harga INTEGER NOT NULL CHECK(harga>0),stok INTEGER NOT NULL DEFAULT 0 CHECK(stok>=0),foto TEXT,aktif INTEGER NOT NULL DEFAULT 1 CHECK(aktif IN (0,1)),urut INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS kantin_orders(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,student_id TEXT NOT NULL,items TEXT NOT NULL,total INTEGER NOT NULL CHECK(total>0),status TEXT NOT NULL CHECK(status IN ('pending','paid','preparing','ready','completed','cancelled')),payment_method TEXT NOT NULL CHECK(payment_method IN ('cashless','bank_transfer','manual')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT,created_by TEXT);
  CREATE TABLE IF NOT EXISTS cashless_topup_manual(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,student_id TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),bukti_transfer TEXT,bank_dari TEXT,no_rek_dari TEXT,atas_nama TEXT,status TEXT NOT NULL CHECK(status IN ('pending','verified','rejected')),verified_by TEXT,verified_at TEXT,catatan TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`)
}

const validAmount = a => { if (!Number.isSafeInteger(a) || a <= 0) throw Error('nominal wajib integer positif') }
const balance = (db, t, s) => db.prepare('SELECT COALESCE(SUM(amount),0) saldo FROM cashless_ledger WHERE tenant_id=? AND student_id=?').get(t, s).saldo

function post(db, x) {
  validAmount(x.amount)
  if (![x.tenantId, x.studentId, x.actorId, x.key].every(Boolean)) throw Error('data ledger tidak lengkap')
  return db.prepare('INSERT OR IGNORE INTO cashless_ledger(id,tenant_id,student_id,amount,kind,idempotency_key,actor_id,reference) VALUES(?,?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(), x.tenantId, x.studentId, x.kind === 'debit' ? -x.amount : x.amount, x.kind, x.key, x.actorId, x.reference || null)
}

const credit = (db, x) => post(db, { ...x, kind: 'credit' })
const debit = (db, x) => db.transaction(() => {
  if (db.prepare('SELECT id FROM cashless_ledger WHERE tenant_id=? AND idempotency_key=?').get(x.tenantId, x.key)) return
  if (balance(db, x.tenantId, x.studentId) < x.amount) throw Error('saldo tidak cukup')
  return post(db, { ...x, kind: 'debit' })
})()

function processWebhook(db, { tenantId, provider, payload, signature, secret }) {
  if (!secret) throw Error('webhook secret kosong')
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(String(signature || ''))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw Error('signature tidak valid')
  const e = JSON.parse(payload)
  return db.transaction(() => {
    const selectedProvider = provider || e.provider
    const inv = selectedProvider
      ? db.prepare('SELECT * FROM cashless_invoices WHERE tenant_id=? AND provider=? AND external_ref=?').get(tenantId, selectedProvider, e.external_ref)
      : db.prepare('SELECT * FROM cashless_invoices WHERE tenant_id=? AND external_ref=?').get(tenantId, e.external_ref)
    if (!inv) throw Error('invoice tidak ditemukan')
    if (e.status === 'paid' && inv.status !== 'paid') {
      credit(db, { tenantId, studentId: inv.student_id, amount: inv.amount, actorId: 'webhook:' + inv.provider, key: 'invoice:' + inv.id, reference: inv.id })
      db.prepare("UPDATE cashless_invoices SET status='paid',paid_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?").run(inv.id, tenantId)
    }
    return inv
  })()
}

const opaqueQr = () => crypto.randomBytes(32).toString('base64url')
const linkedStudentIds = (db, t, u) => db.prepare('SELECT student_id FROM user_students WHERE tenant_id=? AND user_id=? ORDER BY student_id').all(t, u).map(x => x.student_id)

function selectPenilaianStudentId(role, linked, requested) {
  if (requested && !linked.includes(String(requested))) throw Error('Bukan siswa/anak tertaut')
  if (role === 'siswa') {
    if (linked.length !== 1) throw Error('Akun siswa harus tertaut tepat satu siswa')
    if (requested && String(requested) !== linked[0]) throw Error('Bukan siswa tertaut')
    return linked[0]
  }
  if (requested) return String(requested)
  if (linked.length === 1) return linked[0]
  throw Error('student_id wajib dipilih')
}

const pesantrenMenu = t => t === 'pesantren' ? ['Santri', 'Asrama', 'Kamar', 'Musyrif', 'Perizinan', 'Tahfidz', 'Cashless/Kantin'] : []

function registerPortalRoutes(app, db, { requireRole, uuid, bcrypt }) {
  const portal = requireRole('siswa', 'wali_murid', 'super_admin')
  const cashier = requireRole('bendahara', 'super_admin')
  const ids = r => linkedStudentIds(db, r.tenantId, r.user.id)
  const student = (r, id) => db.prepare('SELECT id FROM siswa WHERE id=? AND tenant_id=?').get(id, r.tenantId)

  app.get('/api/portal/children', portal, (r, s) => s.json(ids(r).map(id => db.prepare('SELECT id,nis,nama,rombel_id,foto FROM siswa WHERE id=? AND tenant_id=?').get(id, r.tenantId)).filter(Boolean)))

  const authorize = (r, s) => {
    const id = String(r.query.student_id || '')
    if (!ids(r).includes(id)) { s.status(403).json({ error: 'Bukan siswa/anak tertaut' }); return null }
    return db.prepare("SELECT s.*,ro.nama rombel_nama FROM siswa s LEFT JOIN rombel ro ON ro.id=s.rombel_id AND ro.tenant_id=s.tenant_id WHERE s.id=? AND s.tenant_id=? AND s.status='aktif'").get(id, r.tenantId)
  }

  app.get('/api/portal/dashboard', portal, (r, s) => {
    const siswa = authorize(r, s)
    if (!siswa) return
    const hari = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'][new Date().getDay()]
    const rekap = Object.fromEntries(['hadir', 'sakit', 'izin', 'alpha'].map(status => [status, 0]))
    db.prepare("SELECT status,COUNT(*) jumlah FROM absensi_siswa WHERE tenant_id=? AND siswa_id=? AND substr(tanggal,1,7)=substr(date('now'),1,7) GROUP BY status").all(r.tenantId, siswa.id).forEach(x => { rekap[x.status] = x.jumlah })
    s.json({
      siswa,
      jadwal_hari_ini: db.prepare('SELECT j.*,m.nama mapel_nama,g.nama guru_nama FROM jadwal j JOIN mapel m ON m.id=j.mapel_id AND m.tenant_id=j.tenant_id JOIN gtk g ON g.id=j.gtk_id AND g.tenant_id=j.tenant_id WHERE j.tenant_id=? AND j.rombel_id=? AND lower(j.hari)=? ORDER BY j.jam_mulai').all(r.tenantId, siswa.rombel_id, hari),
      rekap,
      absensi_terbaru: db.prepare('SELECT tanggal,status,keterangan,waktu_absen FROM absensi_siswa WHERE tenant_id=? AND siswa_id=? ORDER BY tanggal DESC LIMIT 10').all(r.tenantId, siswa.id)
    })
  })

  app.get('/api/portal/summary', portal, (r, s) => {
    const siswa = authorize(r, s)
    if (!siswa) return
    const tagihan = db.prepare('SELECT t.*,j.nama jenis_nama FROM tagihan t JOIN jenis_tagihan j ON j.id=t.jenis_tagihan_id AND j.tenant_id=t.tenant_id WHERE t.tenant_id=? AND t.siswa_id=? ORDER BY t.tahun DESC,t.bulan DESC').all(r.tenantId, siswa.id)
    const tabungan = db.prepare('SELECT * FROM tabungan WHERE tenant_id=? AND siswa_id=? ORDER BY tanggal DESC,created_at DESC LIMIT 100').all(r.tenantId, siswa.id)
    s.json({
      siswa,
      saldo: balance(db, r.tenantId, siswa.id),
      mutasi: db.prepare('SELECT * FROM cashless_ledger WHERE tenant_id=? AND student_id=? ORDER BY created_at DESC LIMIT 100').all(r.tenantId, siswa.id),
      invoices: db.prepare('SELECT * FROM cashless_invoices WHERE tenant_id=? AND student_id=? ORDER BY rowid DESC LIMIT 100').all(r.tenantId, siswa.id),
      tagihan,
      tagihan_summary: { total: tagihan.reduce((n, x) => n + x.nominal, 0), belum_bayar: tagihan.filter(x => x.status !== 'lunas' && x.status !== 'sudah_bayar').reduce((n, x) => n + x.nominal, 0) },
      tabungan,
      tabungan_saldo: tabungan[0]?.saldo_akhir || 0
    })
  })

  app.get('/api/cashless/students', cashier, (r, s) => s.json(db.prepare('SELECT id,nis,nama,rombel_id FROM siswa WHERE tenant_id=? AND (? IS NULL OR rombel_id=?) ORDER BY nama').all(r.tenantId, r.query.rombel_id || null, r.query.rombel_id || null)))

  app.get('/api/cashless/history', cashier, (r, s) => s.json({
    ledger: db.prepare('SELECT * FROM cashless_ledger WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100').all(r.tenantId),
    invoices: db.prepare('SELECT * FROM cashless_invoices WHERE tenant_id=? ORDER BY rowid DESC LIMIT 100').all(r.tenantId)
  }))

  app.post('/api/cashless/topup/manual', cashier, (r, s) => {
    if (!student(r, r.body.student_id)) return s.status(404).json({ error: 'Siswa tidak ditemukan' })
    try { credit(db, { tenantId: r.tenantId, studentId: r.body.student_id, amount: r.body.amount, actorId: r.user.id, key: r.body.idempotency_key }); s.json({ saldo: balance(db, r.tenantId, r.body.student_id) }) }
    catch (e) { s.status(400).json({ error: e.message }) }
  })

  app.post('/api/cashless/card/issue', cashier, (r, s) => {
    if (!student(r, r.body.student_id)) return s.status(404).json({ error: 'Siswa tidak ditemukan' })
    if (!/^\d{6}$/.test(String(r.body.pin || ''))) return s.status(400).json({ error: 'PIN wajib 6 digit' })
    const qr = opaqueQr()
    db.prepare('INSERT INTO cashless_cards VALUES(?,?,?,?,1) ON CONFLICT(tenant_id,student_id) DO UPDATE SET qr_token_hash=excluded.qr_token_hash,pin_hash=excluded.pin_hash,active=1')
      .run(r.tenantId, r.body.student_id, crypto.createHash('sha256').update(qr).digest('hex'), bcrypt.hashSync(r.body.pin, 10))
    s.json({ qr_token: qr })
  })

  app.post('/api/cashless/debit', cashier, (r, s) => {
    if (!/^\d{6}$/.test(String(r.body.pin || ''))) return s.status(400).json({ error: 'PIN wajib 6 digit' })
    const c = db.prepare('SELECT * FROM cashless_cards WHERE tenant_id=? AND qr_token_hash=? AND active=1')
      .get(r.tenantId, crypto.createHash('sha256').update(String(r.body.qr_token || '')).digest('hex'))
    if (!c || !bcrypt.compareSync(r.body.pin, c.pin_hash)) return s.status(401).json({ error: 'QR atau PIN salah' })
    try { debit(db, { tenantId: r.tenantId, studentId: c.student_id, amount: r.body.amount, actorId: r.user.id, key: r.body.idempotency_key }); s.json({ saldo: balance(db, r.tenantId, c.student_id) }) }
    catch (e) { s.status(400).json({ error: e.message }) }
  })

  app.post('/api/cashless/topup/invoice', portal, (r, s) => {
    const id = r.body.student_id, provider = r.body.provider || 'simulasi'
    if (!ids(r).includes(id)) return s.status(403).json({ error: 'Forbidden' })
    try { validAmount(r.body.amount) } catch (e) { return s.status(400).json({ error: e.message }) }
    const sim = provider === 'simulasi' && process.env.NODE_ENV !== 'production'
    const cfg = db.prepare('SELECT enabled FROM cashless_provider_config WHERE tenant_id=? AND provider=?').get(r.tenantId, provider)
    if (!sim && !cfg?.enabled) return s.status(403).json({ error: 'Provider tidak aktif' })
    const x = { id: uuid(), external_ref: uuid() }
    db.prepare("INSERT INTO cashless_invoices(id,tenant_id,student_id,provider,external_ref,amount,status,created_by) VALUES(?,?,?,?,?,?,'pending',?)")
      .run(x.id, r.tenantId, id, provider, x.external_ref, r.body.amount, r.user.id)
    s.json({ ...x, status: 'pending' })
  })

  app.post('/api/cashless/webhook/:tenant/:provider', (r, s) => {
    const t = db.prepare('SELECT id FROM tenants WHERE slug=? AND aktif=1').get(r.params.tenant)
    const c = t && db.prepare("SELECT webhook_secret FROM cashless_provider_config WHERE tenant_id=? AND provider=? AND enabled=1 AND webhook_secret!=''").get(t.id, r.params.provider)
    if (!c) return s.status(404).json({ error: 'Provider tidak aktif' })
    try { processWebhook(db, { tenantId: t.id, provider: r.params.provider, payload: r.rawBody || Buffer.from(JSON.stringify(r.body)), signature: r.headers['x-signature'], secret: c.webhook_secret }); s.json({ ok: true }) }
    catch (e) { s.status(401).json({ error: e.message }) }
  })

  const mode = (r, s, n) => db.prepare("SELECT 1 FROM settings WHERE tenant_id=? AND jenjang='pesantren'").get(r.tenantId) ? n() : s.status(403).json({ error: 'Fitur khusus pesantren' })
  for (const [route, table] of [['asrama', 'asrama'], ['kamar', 'kamar'], ['penempatan', 'penempatan_kamar'], ['perizinan', 'perizinan_santri']]) {
    app.get('/api/pesantren/' + route, portal, mode, (r, s) => s.json(db.prepare(`SELECT * FROM ${table} WHERE tenant_id=?`).all(r.tenantId)))
    app.post('/api/pesantren/' + route, requireRole('admin', 'super_admin'), mode, (r, s) => {
      const specs = {
        asrama: ['nama', 'gender'],
        kamar: ['asrama_id', 'nama', 'kapasitas'],
        penempatan_kamar: ['kamar_id', 'student_id', 'mulai', 'selesai'],
        perizinan_santri: ['student_id', 'jenis', 'mulai', 'selesai', 'status', 'alasan', 'actor_id']
      }
      const cols = specs[table]
      const id = uuid()
      try { db.prepare(`INSERT INTO ${table}(id,tenant_id,${cols}) VALUES(?,?${',?'.repeat(cols.length)})`).run(id, r.tenantId, ...cols.map(c => c === 'actor_id' ? r.user.id : r.body[c] ?? null)); s.json({ id }) }
      catch (e) { s.status(400).json({ error: e.message }) }
    })
    app.delete('/api/pesantren/' + route + '/:id', requireRole('admin', 'super_admin'), mode, (r, s) => { db.prepare(`DELETE FROM ${table} WHERE id=? AND tenant_id=?`).run(r.params.id, r.tenantId); s.json({ ok: true }) })
  }
}

function registerKantinRoutes(app, db, { requireRole, uuid, bcrypt }) {
  const portal = requireRole('siswa', 'wali_murid', 'admin', 'bendahara', 'super_admin')
  const cashier = requireRole('admin', 'bendahara', 'super_admin')
  const kadmin = requireRole('admin', 'bendahara', 'super_admin')

  // Kantin Menu Management
  app.get('/api/kantin/menu', portal, (req, res) => {
    const { kategori, aktif } = req.query
    let sql = 'SELECT * FROM kantin_menu WHERE tenant_id = ?'
    const params = [req.tenantId]
    if (kategori) { sql += ' AND kategori = ?'; params.push(kategori) }
    if (aktif !== undefined) { sql += ' AND aktif = ?'; params.push(aktif ? 1 : 0) }
    sql += ' ORDER BY urut, nama'
    res.json(db.prepare(sql).all(...params))
  })

  app.post('/api/kantin/menu', kadmin, (req, res) => {
    const { kategori, nama, deskripsi, harga, stok, foto, aktif, urut } = req.body
    if (!kategori || !nama || !Number.isInteger(harga) || harga <= 0) {
      return res.status(400).json({ error: 'kategori, nama, harga (integer > 0) wajib' })
    }
    const id = uuid()
    db.prepare('INSERT INTO kantin_menu (id, tenant_id, kategori, nama, deskripsi, harga, stok, foto, aktif, urut) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, req.tenantId, kategori, nama, deskripsi || '', harga, stok || 0, foto || null, aktif ? 1 : 0, urut || 0)
    res.json({ id })
  })

  // Batch create menu items (bulk add / spreadsheet paste / CSV import)
  app.post('/api/kantin/menu/batch', kadmin, (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : null
    if (!items || !items.length) return res.status(400).json({ error: 'items (array non-kosong) wajib' })
    if (items.length > 1000) return res.status(400).json({ error: 'maksimal 1000 item per batch' })

    const errors = []
    const clean = items.map((it, i) => {
      const row = i + 1
      const kategori = String(it.kategori ?? '').trim()
      const nama = String(it.nama ?? '').trim()
      const harga = Number(it.harga)
      if (!kategori) errors.push(`Baris ${row}: kategori wajib`)
      if (!nama) errors.push(`Baris ${row}: nama wajib`)
      if (!Number.isInteger(harga) || harga <= 0) errors.push(`Baris ${row}: harga harus bilangan bulat > 0`)
      const stok = Number.isInteger(Number(it.stok)) && Number(it.stok) >= 0 ? Number(it.stok) : 0
      const urut = Number.isInteger(Number(it.urut)) ? Number(it.urut) : 0
      const aktif = (it.aktif === undefined || it.aktif === null) ? 1 : (it.aktif ? 1 : 0)
      return { kategori, nama, deskripsi: String(it.deskripsi ?? '').trim(), harga, stok, foto: it.foto || null, aktif, urut }
    })
    if (errors.length) return res.status(400).json({ error: 'Validasi gagal', details: errors.slice(0, 50) })

    const stmt = db.prepare('INSERT INTO kantin_menu (id, tenant_id, kategori, nama, deskripsi, harga, stok, foto, aktif, urut) VALUES (?,?,?,?,?,?,?,?,?,?)')
    const insertMany = db.transaction(rows => {
      const ids = []
      for (const r of rows) {
        const id = uuid()
        stmt.run(id, req.tenantId, r.kategori, r.nama, r.deskripsi, r.harga, r.stok, r.foto, r.aktif, r.urut)
        ids.push(id)
      }
      return ids
    })
    const ids = insertMany(clean)
    res.json({ inserted: ids.length, ids })
  })

  app.put('/api/kantin/menu/:id', kadmin, (req, res) => {
    const { kategori, nama, deskripsi, harga, stok, foto, aktif, urut } = req.body
    if (!kategori || !nama || !Number.isInteger(harga) || harga <= 0) {
      return res.status(400).json({ error: 'kategori, nama, harga (integer > 0) wajib' })
    }
    db.prepare('UPDATE kantin_menu SET kategori=?, nama=?, deskripsi=?, harga=?, stok=?, foto=?, aktif=?, urut=? WHERE id=? AND tenant_id=?')
      .run(kategori, nama, deskripsi || '', harga, stok || 0, foto || null, aktif ? 1 : 0, urut || 0, req.params.id, req.tenantId)
    res.json({ success: true })
  })

  app.delete('/api/kantin/menu/:id', kadmin, (req, res) => {
    db.prepare('DELETE FROM kantin_menu WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
    res.json({ success: true })
  })

  // Kantin Orders
  app.get('/api/kantin/orders', cashier, (req, res) => {
    const { student_id, status, limit = 50, offset = 0 } = req.query
    let sql = `SELECT o.*, s.nis, s.nama as siswa_nama FROM kantin_orders o JOIN siswa s ON s.id = o.student_id AND s.tenant_id = o.tenant_id WHERE o.tenant_id = ?`
    const params = [req.tenantId]
    if (student_id) { sql += ' AND o.student_id = ?'; params.push(student_id) }
    if (status) { sql += ' AND o.status = ?'; params.push(status) }
    sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?'
    params.push(Number(limit), Number(offset))
    res.json(db.prepare(sql).all(...params))
  })

  app.post('/api/kantin/orders', portal, (req, res) => {
    const { student_id, items, payment_method = 'cashless' } = req.body
    if (!student_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'student_id dan items wajib' })
    }
    const siswa = db.prepare('SELECT id FROM siswa WHERE id = ? AND tenant_id = ? AND status = ?').get(student_id, req.tenantId, 'aktif')
    if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan atau tidak aktif' })

    let total = 0
    const validatedItems = []
    for (const item of items) {
      if (!item.menu_id || !Number.isInteger(item.qty) || item.qty <= 0) {
        return res.status(400).json({ error: 'Setiap item wajib punya menu_id dan qty > 0' })
      }
      const menu = db.prepare('SELECT * FROM kantin_menu WHERE id = ? AND tenant_id = ? AND aktif = 1').get(item.menu_id, req.tenantId)
      if (!menu) return res.status(404).json({ error: `Menu ${item.menu_id} tidak ditemukan` })
      if (menu.stok < item.qty) return res.status(400).json({ error: `Stok ${menu.nama} tidak cukup (tersisa ${menu.stok})` })
      const subtotal = menu.harga * item.qty
      total += subtotal
      validatedItems.push({ menu_id: menu.id, nama: menu.nama, harga: menu.harga, qty: item.qty, subtotal })
    }

    if (payment_method === 'cashless') {
      const saldo = balance(db, req.tenantId, student_id)
      if (saldo < total) return res.status(400).json({ error: `Saldo cashless tidak cukup (Rp ${saldo})` })
    }

    const id = uuid()
    const now = new Date().toISOString()
    db.transaction(() => {
      db.prepare('INSERT INTO kantin_orders (id, tenant_id, student_id, items, total, status, payment_method, created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, req.tenantId, student_id, JSON.stringify(validatedItems), total, payment_method === 'cashless' ? 'paid' : 'pending', payment_method, now)
      for (const item of validatedItems) {
        db.prepare('UPDATE kantin_menu SET stok = stok - ? WHERE id = ? AND tenant_id = ?').run(item.qty, item.menu_id, req.tenantId)
      }
      if (payment_method === 'cashless') {
        debit(db, { tenantId: req.tenantId, studentId: student_id, amount: total, actorId: req.user.id, key: 'kantin:' + id, reference: id })
      }
    })()

    res.json({ id, total, status: payment_method === 'cashless' ? 'paid' : 'pending' })
  })

  app.put('/api/kantin/orders/:id/status', cashier, (req, res) => {
    const { status } = req.body
    const validStatus = ['pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled']
    if (!validStatus.includes(status)) return res.status(400).json({ error: 'Status tidak valid' })

    const order = db.prepare('SELECT * FROM kantin_orders WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId)
    if (!order) return res.status(404).json({ error: 'Order tidak ditemukan' })

    const now = new Date().toISOString()
    db.prepare('UPDATE kantin_orders SET status = ?, completed_at = CASE WHEN ? = ? THEN ? ELSE completed_at END WHERE id = ? AND tenant_id = ?')
      .run(status, status, 'completed', now, req.params.id, req.tenantId)

    if (status === 'cancelled' && order.status === 'paid' && order.payment_method === 'cashless') {
      credit(db, { tenantId: req.tenantId, studentId: order.student_id, amount: order.total, actorId: req.user.id, key: 'kantin_refund:' + order.id, reference: order.id })
    }

    res.json({ success: true })
  })

  // Cashless Bank Transfer Config
  app.get('/api/cashless/provider/bank_transfer', kadmin, (req, res) => {
    const cfg = db.prepare('SELECT * FROM cashless_provider_config WHERE tenant_id = ? AND provider = ?').get(req.tenantId, 'bank_transfer')
    if (!cfg) return res.json({ enabled: 0, config: { va_prefix: '', bank_code: '', admin_fee: 0, manual_verify: true } })
    res.json({ enabled: cfg.enabled, config: JSON.parse(cfg.config_json || '{}') })
  })

  app.put('/api/cashless/provider/bank_transfer', kadmin, (req, res) => {
    const { enabled, va_prefix, bank_code, admin_fee, manual_verify, shopee_merchant_id, shopee_partner_key, shopee_partner_secret, gopay_client_id, gopay_client_secret, gopay_merchant_id } = req.body
    const config = { 
      va_prefix: va_prefix || '', 
      bank_code: bank_code || '', 
      admin_fee: Number(admin_fee) || 0, 
      manual_verify: manual_verify !== false,
      shopee_merchant_id: shopee_merchant_id || '',
      shopee_partner_key: shopee_partner_key || '',
      shopee_partner_secret: shopee_partner_secret || '',
      gopay_client_id: gopay_client_id || '',
      gopay_client_secret: gopay_client_secret || '',
      gopay_merchant_id: gopay_merchant_id || ''
    }
    db.prepare('INSERT INTO cashless_provider_config (tenant_id, provider, enabled, config_json) VALUES (?,?,?,?) ON CONFLICT(tenant_id,provider) DO UPDATE SET enabled=excluded.enabled, config_json=excluded.config_json')
      .run(req.tenantId, 'bank_transfer', enabled ? 1 : 0, JSON.stringify(config))
    res.json({ success: true })
  })

  // Shopee Partner QR Scraping
  app.post('/api/cashless/provider/bank_transfer/shopee/qr', kadmin, async (req, res) => {
    const cfg = db.prepare('SELECT config_json FROM cashless_provider_config WHERE tenant_id = ? AND provider = ?').get(req.tenantId, 'bank_transfer')
    if (!cfg) return res.status(404).json({ error: 'Konfigurasi bank transfer tidak ditemukan' })
    const config = JSON.parse(cfg.config_json || '{}')
    const { merchant_id, partner_key, partner_secret } = config
    if (!merchant_id || !partner_key || !partner_secret) {
      return res.status(400).json({ error: 'Kredensial Shopee Partner (merchant_id, partner_key, partner_secret) belum dikonfigurasi' })
    }

    try {
      const puppeteer = (await import('puppeteer-core')).default
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        executablePath: '/usr/bin/chromium-browser'
      })
      
      const page = await browser.newPage()
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
      
      // Login to Shopee Partner
      await page.goto('https://partner.shopee.co.id/', { waitUntil: 'networkidle2', timeout: 30000 })
      
      // Fill login form (adjust selectors based on actual page)
      await page.waitForSelector('input[name="username"], input[type="email"]', { timeout: 10000 })
      await page.type('input[name="username"], input[type="email"]', merchant_id)
      await page.type('input[name="password"], input[type="password"]', partner_secret)
      await page.click('button[type="submit"], button:has-text("Login")')
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
      
      // Navigate to QR code page
      await page.goto('https://partner.shopee.co.id/merchant/qr-code', { waitUntil: 'networkidle2', timeout: 30000 })
      
      // Extract QR code image
      const qrDataUrl = await page.$eval('img[alt*="QR"], img[src*="qr"], .qr-code img', el => el.src).catch(() => null)
      
      await browser.close()
      
      if (qrDataUrl) {
        res.json({ success: true, qr_code: qrDataUrl })
      } else {
        res.status(500).json({ error: 'QR code tidak ditemukan di halaman Shopee Partner' })
      }
    } catch (e) {
      console.error('[Shopee QR Scrape]', e)
      res.status(500).json({ error: 'Gagal scrape QR Shopee: ' + e.message })
    }
  })

  // GoPay Merchant QR Scraping
  app.post('/api/cashless/provider/bank_transfer/gopay/qr', kadmin, async (req, res) => {
    const cfg = db.prepare('SELECT config_json FROM cashless_provider_config WHERE tenant_id = ? AND provider = ?').get(req.tenantId, 'bank_transfer')
    if (!cfg) return res.status(404).json({ error: 'Konfigurasi bank transfer tidak ditemukan' })
    const config = JSON.parse(cfg.config_json || '{}')
    const { gopay_client_id, gopay_client_secret, gopay_merchant_id } = config
    if (!gopay_client_id || !gopay_client_secret || !gopay_merchant_id) {
      return res.status(400).json({ error: 'Kredensial GoPay Merchant (client_id, client_secret, merchant_id) belum dikonfigurasi' })
    }

    try {
      const puppeteer = (await import('puppeteer-core')).default
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        executablePath: '/usr/bin/chromium-browser'
      })
      
      const page = await browser.newPage()
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
      
      // Login to GoPay Merchant
      await page.goto('https://merchant.gopay.co.id/', { waitUntil: 'networkidle2', timeout: 30000 })
      
      await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 })
      await page.type('input[name="email"], input[type="email"]', gopay_client_id)
      await page.type('input[name="password"], input[type="password"]', gopay_client_secret)
      await page.click('button[type="submit"], button:has-text("Login")')
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
      
      // Navigate to QR code page
      await page.goto(`https://merchant.gopay.co.id/merchant/${gopay_merchant_id}/qr-code`, { waitUntil: 'networkidle2', timeout: 30000 })
      
      // Extract QR code image
      const qrDataUrl = await page.$eval('img[alt*="QR"], img[src*="qr"], .qr-code img', el => el.src).catch(() => null)
      
      await browser.close()
      
      if (qrDataUrl) {
        res.json({ success: true, qr_code: qrDataUrl })
      } else {
        res.status(500).json({ error: 'QR code tidak ditemukan di halaman GoPay Merchant' })
      }
    } catch (e) {
      console.error('[GoPay QR Scrape]', e)
      res.status(500).json({ error: 'Gagal scrape QR GoPay: ' + e.message })
    }
  })

  // Auto-fetch mutation (last 3 digits verification like Fazapay)
  app.post('/api/cashless/provider/bank_transfer/fetch-mutation', kadmin, async (req, res) => {
    const cfg = db.prepare('SELECT config_json FROM cashless_provider_config WHERE tenant_id = ? AND provider = ?').get(req.tenantId, 'bank_transfer')
    if (!cfg) return res.status(404).json({ error: 'Konfigurasi bank transfer tidak ditemukan' })
    const config = JSON.parse(cfg.config_json || '{}')
    const { bank_code, va_prefix } = config
    
    // This would integrate with bank APIs or scraping
    // For now return structure for manual implementation per bank
    res.json({ 
      success: true, 
      message: 'Integrasi mutasi bank memerlukan API per bank (BRI, BNI, Mandiri, BCA, dll) atau scraping internet banking',
      config: { bank_code, va_prefix },
      note: 'Implementasi penuh butuh akses API bank atau headless browser ke internet banking masing-masing bank'
    })
  })

  // Manual Topup (Bank Transfer)
  app.get('/api/cashless/topup/manual', kadmin, (req, res) => {
    const { status, limit = 50, offset = 0 } = req.query
    let sql = `SELECT t.*, s.nis, s.nama as siswa_nama FROM cashless_topup_manual t JOIN siswa s ON s.id = t.student_id AND s.tenant_id = t.tenant_id WHERE t.tenant_id = ?`
    const params = [req.tenantId]
    if (status) { sql += ' AND t.status = ?'; params.push(status) }
    sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?'
    params.push(Number(limit), Number(offset))
    res.json(db.prepare(sql).all(...params))
  })

  app.post('/api/cashless/topup/manual', portal, async (req, res) => {
    const { student_id, amount, bukti_transfer, bank_dari, no_rek_dari, atas_nama } = req.body
    if (!student_id || !Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ error: 'student_id dan amount (integer > 0) wajib' })
    }
    const ids = linkedStudentIds(db, req.tenantId, req.user.id)
    if (!ids.includes(student_id)) return res.status(403).json({ error: 'Bukan siswa/anak tertaut' })

    const id = uuid()
    db.prepare('INSERT INTO cashless_topup_manual (id, tenant_id, student_id, amount, bukti_transfer, bank_dari, no_rek_dari, atas_nama, status, created_at) VALUES (?,?,?,?,?,?,?,?,\'pending\',?)')
      .run(id, req.tenantId, student_id, amount, bukti_transfer || null, bank_dari || '', no_rek_dari || '', atas_nama || '', new Date().toISOString())
    res.json({ id, status: 'pending' })
  })

  app.put('/api/cashless/topup/manual/:id/verify', kadmin, (req, res) => {
    const { status, catatan } = req.body
    if (!['verified', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status harus verified atau rejected' })

    const topup = db.prepare('SELECT * FROM cashless_topup_manual WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId)
    if (!topup) return res.status(404).json({ error: 'Topup tidak ditemukan' })
    if (topup.status !== 'pending') return res.status(400).json({ error: 'Topup sudah diproses' })

    const now = new Date().toISOString()
    db.transaction(() => {
      db.prepare('UPDATE cashless_topup_manual SET status = ?, verified_by = ?, verified_at = ?, catatan = ? WHERE id = ? AND tenant_id = ?')
        .run(status, req.user.id, now, catatan || '', req.params.id, req.tenantId)
      if (status === 'verified') {
        credit(db, { tenantId: req.tenantId, studentId: topup.student_id, amount: topup.amount, actorId: req.user.id, key: 'topup_manual:' + topup.id, reference: topup.id })
      }
    })()

    res.json({ success: true, saldo: balance(db, req.tenantId, topup.student_id) })
  })

  // Kantin QR Scan for Kasir (debit by scanning student QR)
  app.post('/api/kantin/scan', cashier, (req, res) => {
    const { qr_token, pin, order_id } = req.body
    if (!qr_token || !/^\d{6}$/.test(String(pin || ''))) return res.status(400).json({ error: 'QR token dan PIN 6 digit wajib' })

    const card = db.prepare('SELECT * FROM cashless_cards WHERE tenant_id = ? AND qr_token_hash = ? AND active = 1')
      .get(req.tenantId, crypto.createHash('sha256').update(qr_token).digest('hex'))
    if (!card || !bcrypt.compareSync(pin, card.pin_hash)) return res.status(401).json({ error: 'QR atau PIN salah' })

    if (order_id) {
      const order = db.prepare('SELECT * FROM kantin_orders WHERE id = ? AND tenant_id = ?').get(order_id, req.tenantId)
      if (!order) return res.status(404).json({ error: 'Order tidak ditemukan' })
      if (order.student_id !== card.student_id) return res.status(403).json({ error: 'Order bukan milik siswa ini' })
      if (order.status !== 'pending') return res.status(400).json({ error: 'Order tidak bisa dibayar (status: ' + order.status + ')' })

      const saldo = balance(db, req.tenantId, card.student_id)
      if (saldo < order.total) return res.status(400).json({ error: `Saldo tidak cukup (Rp ${saldo})` })

      db.transaction(() => {
        db.prepare('UPDATE kantin_orders SET status = ?, payment_method = ?, paid_at = ? WHERE id = ? AND tenant_id = ?')
          .run('paid', 'cashless', new Date().toISOString(), order_id, req.tenantId)
        debit(db, { tenantId: req.tenantId, studentId: card.student_id, amount: order.total, actorId: req.user.id, key: 'kantin_pay:' + order_id, reference: order_id })
      })()
      res.json({ success: true, saldo: balance(db, req.tenantId, card.student_id) })
    } else {
      res.json({ student_id: card.student_id, saldo: balance(db, req.tenantId, card.student_id) })
    }
  })
}

module.exports = { setupPortalCashless, balance, credit, debit, processWebhook, opaqueQr, linkedStudentIds, selectPenilaianStudentId, pesantrenMenu, registerPortalRoutes, registerKantinRoutes }