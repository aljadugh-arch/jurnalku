const ExcelJS = require('exceljs')
const crypto = require('node:crypto')

const HEADERS = {
  Tagihan: ['id', 'nis', 'jenis_tagihan', 'bulan', 'tahun', 'nominal', 'status', 'tanggal_bayar', 'metode_bayar', 'keterangan'],
  Tabungan: ['id', 'nis', 'tanggal', 'tipe', 'nominal', 'keterangan'],
  Cashless: ['id', 'nis', 'tanggal', 'jenis', 'nominal', 'referensi'],
  Keuangan: ['id', 'tanggal', 'akun', 'kategori', 'tipe', 'nominal', 'keterangan'],
}

const QUERIES = {
  Tagihan: `SELECT t.id,s.nis,j.nama jenis_tagihan,t.bulan,t.tahun,t.nominal,t.status,t.tanggal_bayar,t.metode_bayar,t.keterangan FROM tagihan t JOIN siswa s ON s.id=t.siswa_id AND s.tenant_id=t.tenant_id JOIN jenis_tagihan j ON j.id=t.jenis_tagihan_id AND j.tenant_id=t.tenant_id WHERE t.tenant_id=? ORDER BY t.created_at`,
  Tabungan: `SELECT t.id,s.nis,t.tanggal,t.tipe,t.nominal,t.keterangan FROM tabungan t JOIN siswa s ON s.id=t.siswa_id AND s.tenant_id=t.tenant_id WHERE t.tenant_id=? ORDER BY t.created_at`,
  Cashless: `SELECT l.id,s.nis,l.created_at tanggal,l.kind jenis,ABS(l.amount) nominal,l.reference referensi FROM cashless_ledger l JOIN siswa s ON s.id=l.student_id AND s.tenant_id=l.tenant_id WHERE l.tenant_id=? ORDER BY l.created_at`,
  Keuangan: `SELECT t.id,t.tanggal,a.nama akun,k.nama kategori,t.tipe,t.nominal,t.keterangan FROM keuangan_transaksi t JOIN keuangan_akun a ON a.id=t.akun_id AND a.tenant_id=t.tenant_id JOIN keuangan_kategori k ON k.id=t.kategori_id AND k.tenant_id=t.tenant_id WHERE t.tenant_id=? ORDER BY t.tanggal,t.created_at`,
}

const text = value => String(value ?? '').trim()
const amount = value => Number(value)
const safeFilenamePart = value => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Tenant'
const jakartaDate = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
const financeExportFilename = (tenantName, date = jakartaDate()) => `Rekap_Keuangan_${safeFilenamePart(tenantName)}_${date}.xlsx`

function financeIdentity(db, tenant) {
  const settings = db.prepare('SELECT nama_lembaga,alamat,logo FROM settings WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 1').get(tenant) || {}
  const tenantRow = db.prepare('SELECT nama FROM tenants WHERE id=? LIMIT 1').get(tenant) || {}
  return {
    nama_lembaga: text(settings.nama_lembaga || tenantRow.nama || 'Lembaga'),
    alamat: text(settings.alamat),
    logo: text(settings.logo),
  }
}

async function exportFinance(db, tenant) {
  const identity = financeIdentity(db, tenant)
  const wb = new ExcelJS.Workbook()
  wb.creator = identity.nama_lembaga
  wb.company = identity.nama_lembaga
  wb.title = `Rekap Keuangan - ${identity.nama_lembaga}`
  wb.subject = `Data keuangan tenant ${identity.nama_lembaga}`

  const summary = wb.addWorksheet('Ringkasan')
  summary.addRow(['REKAPITULASI KEUANGAN'])
  summary.addRow([identity.nama_lembaga])
  summary.addRow([identity.alamat])
  summary.addRow([`Tanggal ekspor: ${jakartaDate()}`])
  summary.mergeCells('A1:G1')
  summary.mergeCells('A2:G2')
  summary.mergeCells('A3:G3')
  summary.mergeCells('A4:G4')
  summary.getRow(1).font = { bold: true, size: 16 }
  summary.getRow(2).font = { bold: true, size: 13 }
  summary.getColumn(1).width = 34

  for (const name of Object.keys(HEADERS)) {
    const sheet = wb.addWorksheet(name)
    sheet.addRow([identity.nama_lembaga])
    sheet.addRow([identity.alamat])
    sheet.addRow(HEADERS[name])
    for (const row of db.prepare(QUERIES[name]).all(tenant)) sheet.addRow(HEADERS[name].map(key => row[key] ?? ''))
    sheet.getRow(1).font = { bold: true, size: 13 }
    sheet.getRow(3).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 3 }]
    sheet.columns.forEach(column => { column.width = 18 })
    sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: HEADERS[name].length } }
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

async function previewFinance(db, tenant, buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await buffer)
  const rows = []
  const errors = []
  let count = 0
  if (!wb.worksheets.length) throw Error('Workbook kosong')
  for (const sheet of wb.worksheets) {
    if (sheet.name === 'Ringkasan') continue
    if (!HEADERS[sheet.name]) { errors.push({ sheet: sheet.name, row: 1, error: 'Sheet tidak didukung' }); continue }
    const headerRow = sheet.getRow(3).values.slice(1).map(text).join('|') === HEADERS[sheet.name].join('|') ? 3 : 1
    const headers = sheet.getRow(headerRow).values.slice(1).map(text)
    if (headers.join('|') !== HEADERS[sheet.name].join('|')) { errors.push({ sheet: sheet.name, row: headerRow, error: 'Header tidak cocok' }); continue }
    sheet.eachRow((row, number) => {
      if (number <= headerRow) return
      if (++count > 5000) return
      const data = Object.fromEntries(headers.map((header, index) => [header, row.getCell(index + 1).value]))
      try { rows.push(validate(db, tenant, sheet.name, data, number)) } catch (error) { errors.push({ sheet: sheet.name, row: number, error: error.message }) }
    })
  }
  if (count > 5000) throw Error('Maksimal 5000 baris')
  const ids = new Set()
  for (const row of rows) {
    if (ids.has(row.id)) errors.push({ sheet: row.sheet, row: row.row, error: 'Duplikat id dalam workbook' })
    else ids.add(row.id)
  }
  return { valid: rows.length, errors, rows, committable: errors.length === 0 }
}

function ref(db, table, field, value, tenant, extra = '') {
  const row = db.prepare(`SELECT id FROM ${table} WHERE ${field}=? AND tenant_id=? ${extra}`).get(text(value), tenant)
  if (!row) throw Error(`${field} tidak ditemukan`)
  return row.id
}

function validate(db, tenant, sheet, row, number) {
  for (const value of Object.values(row)) if (value && typeof value === 'object' && !(value instanceof Date)) throw Error('Formula/object tidak didukung')
  const id = text(row.id)
  if (!id) throw Error('id wajib')
  const nominal = amount(row.nominal)
  if (!Number.isSafeInteger(nominal) || nominal <= 0) throw Error('nominal wajib integer positif')
  const date = value => {
    const result = value instanceof Date ? value.toISOString().slice(0, 10) : text(value)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(result + 'T00:00:00Z'))) throw Error('tanggal tidak valid')
    return result
  }
  const base = { sheet, row: number, id, nominal }
  if (sheet === 'Tagihan') {
    const bulan = text(row.bulan), tahun = text(row.tahun), status = text(row.status)
    if (!/^(0?[1-9]|1[0-2]|Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)$/.test(bulan)) throw Error('bulan tidak valid')
    if (!/^\d{4}$/.test(tahun)) throw Error('tahun tidak valid')
    if (!['belum_bayar', 'lunas'].includes(status)) throw Error('status tidak valid')
    return { ...base, siswa_id: ref(db, 'siswa', 'nis', row.nis, tenant), jenis_id: ref(db, 'jenis_tagihan', 'nama', row.jenis_tagihan, tenant), bulan, tahun, status, tanggal_bayar: row.tanggal_bayar ? date(row.tanggal_bayar) : null, metode: text(row.metode_bayar), keterangan: text(row.keterangan) }
  }
  if (sheet === 'Tabungan') {
    if (!['setor', 'tarik'].includes(text(row.tipe))) throw Error('tipe tidak valid')
    return { ...base, siswa_id: ref(db, 'siswa', 'nis', row.nis, tenant), tanggal: date(row.tanggal), tipe: text(row.tipe), keterangan: text(row.keterangan) }
  }
  if (sheet === 'Cashless') {
    if (!['credit', 'debit'].includes(text(row.jenis))) throw Error('jenis tidak valid')
    return { ...base, siswa_id: ref(db, 'siswa', 'nis', row.nis, tenant), tanggal: date(row.tanggal), jenis: text(row.jenis), referensi: text(row.referensi) }
  }
  const tipe = text(row.tipe)
  if (!['masuk', 'keluar'].includes(tipe)) throw Error('tipe tidak valid')
  const kategori = db.prepare('SELECT id FROM keuangan_kategori WHERE nama=? AND tenant_id=? AND tipe=?').get(text(row.kategori), tenant, tipe)
  if (!kategori) throw Error('kategori tidak ditemukan')
  return { ...base, tanggal: date(row.tanggal), akun_id: ref(db, 'keuangan_akun', 'nama', row.akun, tenant), kategori_id: kategori.id, tipe, keterangan: text(row.keterangan) }
}

function commitFinance(db, tenant, actor, rows, policy, errors = []) {
  if (errors.length) throw Error('Preview mengandung error')
  if (!['skip', 'reject'].includes(policy)) throw Error('Kebijakan duplikat wajib skip atau reject')
  return db.transaction(() => {
    let inserted = 0, skipped = 0
    for (const row of rows) {
      const table = { Tagihan: 'tagihan', Tabungan: 'tabungan', Cashless: 'cashless_ledger', Keuangan: 'keuangan_transaksi' }[row.sheet]
      if (db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(row.id)) {
        if (policy === 'reject') throw Error(`Duplikat id ${row.id}`)
        skipped++
        continue
      }
      if (row.sheet === 'Tagihan') db.prepare('INSERT INTO tagihan(id,siswa_id,jenis_tagihan_id,bulan,tahun,nominal,status,tanggal_bayar,metode_bayar,keterangan,tenant_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(row.id, row.siswa_id, row.jenis_id, row.bulan, row.tahun, row.nominal, row.status, row.tanggal_bayar, row.metode, row.keterangan, tenant)
      else if (row.sheet === 'Tabungan') {
        const last = db.prepare('SELECT saldo_akhir FROM tabungan WHERE siswa_id=? AND tenant_id=? ORDER BY created_at DESC LIMIT 1').get(row.siswa_id, tenant)?.saldo_akhir || 0
        const next = last + (row.tipe === 'setor' ? row.nominal : -row.nominal)
        if (next < 0) throw Error(`Saldo tidak cukup baris ${row.row}`)
        db.prepare('INSERT INTO tabungan(id,siswa_id,tanggal,tipe,nominal,saldo_akhir,keterangan,tenant_id) VALUES(?,?,?,?,?,?,?,?)').run(row.id, row.siswa_id, row.tanggal, row.tipe, row.nominal, next, row.keterangan, tenant)
      } else if (row.sheet === 'Cashless') db.prepare('INSERT INTO cashless_ledger(id,tenant_id,student_id,amount,kind,idempotency_key,actor_id,reference,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(row.id, tenant, row.siswa_id, row.jenis === 'debit' ? -row.nominal : row.nominal, row.jenis, 'excel:' + row.id, actor, row.referensi, row.tanggal || new Date().toISOString())
      else db.prepare('INSERT INTO keuangan_transaksi(id,tanggal,akun_id,kategori_id,tipe,nominal,keterangan,bukti,tenant_id) VALUES(?,?,?,?,?,?,?,?,?)').run(row.id, row.tanggal, row.akun_id, row.kategori_id, row.tipe, row.nominal, row.keterangan, '', tenant)
      inserted++
    }
    return { inserted, skipped }
  })()
}

function registerFinanceExcelRoutes(app, db, { authorize, upload }) {
  const previews = new Map()
  app.get('/api/finance-excel/export', authorize, async (req, res) => {
    const identity = financeIdentity(db, req.tenantId)
    const buffer = await exportFinance(db, req.tenantId)
    const filename = financeExportFilename(identity.nama_lembaga)
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Filename': filename,
    }).send(buffer)
  })
  app.post('/api/finance-excel/preview', authorize, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'File wajib' })
      const preview = await previewFinance(db, req.tenantId, req.file.buffer)
      const token = preview.committable ? crypto.randomUUID() : null
      if (token) previews.set(token, { tenant: req.tenantId, rows: preview.rows, expires: Date.now() + 600000 })
      res.json({ token, valid: preview.valid, errors: preview.errors, rows: preview.rows.slice(0, 20).map(({ sheet, row, id }) => ({ sheet, row, id })) })
    } catch (error) { res.status(400).json({ error: error.message }) }
  })
  app.post('/api/finance-excel/commit', authorize, (req, res) => {
    try {
      const preview = previews.get(req.body.token)
      if (!preview || preview.tenant !== req.tenantId || preview.expires < Date.now()) return res.status(400).json({ error: 'Preview kedaluwarsa' })
      previews.delete(req.body.token)
      res.json(commitFinance(db, req.tenantId, req.user.id, preview.rows, req.body.duplicate_policy))
    } catch (error) { res.status(400).json({ error: error.message }) }
  })
}

module.exports = { exportFinance, previewFinance, commitFinance, registerFinanceExcelRoutes, financeExportFilename, financeIdentity }
