const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const zlib = require('node:zlib')
const Database = require('better-sqlite3')

class ValidationError extends Error {}
const S = (label, tables, optional = []) => ({ label, tables, optional })
const SECTIONS = Object.freeze({
  settings: S('Pengaturan Lembaga', ['settings']),
  notif: S('Pengaturan Notifikasi', ['notif_settings']),
  gtk: S('Data GTK', ['gtk']), mapel: S('Mata Pelajaran', ['mapel']),
  tahun_ajaran: S('Tahun Ajaran', ['tahun_ajaran']), rombel: S('Rombongan Belajar', ['rombel']),
  siswa: S('Data Siswa', ['siswa']),
  jadwal: S('Jadwal & Pengajar', ['template_jadwal', 'pengajar', 'jadwal', 'sesi_kelas_guru']),
  jurnal: S('Jurnal & Nilai', ['jurnal_mengajar', 'penilaian_harian', 'rapor', 'catatan_kepribadian', 'rapor_sync_log'], ['rapor_sync_log']),
  absensi: S('Absensi', ['absensi_siswa', 'absensi_guru', 'kegiatan_khusus', 'absensi_kegiatan']),
  jamaah: S('Absensi Jamaah', ['jamaah_sesi', 'jamaah_rekap_manual', 'absensi_kegiatan']),
  ekskul: S('Ekstrakurikuler', ['ekskul', 'ekskul_anggota', 'absensi_ekskul']),
  tagihan: S('Tagihan & Pembayaran', ['jenis_tagihan', 'tagihan']),
  tabungan: S('Tabungan', ['tabungan']),
  cashless: S('Cashless', ['cashless_accounts', 'cashless_transactions', 'cashless_ledger', 'cashless_invoices', 'cashless_cards', 'cashless_provider_config', 'cashless_topup_manual']),
  kalender: S('Kalender KBM', ['kalender_kbm']), modul: S('Modul Ajar', ['modul_ajar']),
  keuangan: S('Laporan Keuangan', ['keuangan_akun', 'keuangan_kategori', 'keuangan_transaksi']),
  tahfidz: S('Tahfidz', ['tahfidz_kelompok', 'tahfidz_peserta', 'tahfidz_pertemuan', 'tahfidz_absensi']),
  pesantren: S('Pesantren', ['rombel_jam_pulang']), perpustakaan: S('Perpustakaan', ['library_config']),
  kantin: S('Kantin', ['kantin_menu', 'kantin_orders']), beasiswa: S('Beasiswa', ['beasiswa']),
  dokumen: S('Dokumen & Tugas', ['tugas_siswa', 'ai_documents']), peminatan: S('Peminatan', ['peminatan_jenis']),
  asrama: S('Pesantren & Asrama', ['asrama', 'kamar', 'penempatan_kamar', 'perizinan_santri']),
})
const EXCLUDED = Object.freeze({
  users: 'password dan akun', wa_gateway_config: 'token, API key, dan sesi WhatsApp',
  broadcast_log: 'log operasional', broadcast_detail: 'nomor penerima dan log operasional',
})
const MAX_ROWS = 100000
// Budget media dinaikkan: tenant produksi nyata sudah melewati 57 MB, sehingga
// batas 30 MB lama membuat backup gagal total ("Total media backup melewati batas").
// MAX_BYTES harus >= media base64 (rasio 4/3) + baris tabel, kalau tidak artefak
// hasil ekspor sendiri akan ditolak saat di-restore.
const MAX_MEDIA_FILES = 20000
const MAX_MEDIA_FILE_BYTES = 25 * 1024 * 1024
const MAX_MEDIA_TOTAL_BYTES = 200 * 1024 * 1024
const MAX_BYTES = 320 * 1024 * 1024
const LIMITS = Object.freeze({ MAX_ROWS, MAX_BYTES, MAX_MEDIA_FILES, MAX_MEDIA_FILE_BYTES, MAX_MEDIA_TOTAL_BYTES })
const OMIT_REASONS = Object.freeze(['file_count_budget', 'file_too_large', 'total_budget'])
const DENY = /(password|passwd|secret|token|api[_-]?key|session|credential|private[_-]?key)/i
const LEGACY_SLUG_TARGETS = Object.freeze({
  'mts-plus-sunan-drajat-7-palang': 'mtsplussd7',
  'mi-miftahul-huda-ngimbang': 'mimifdangimbang',
})
const canonical = value => value === null || typeof value !== 'object'
  ? JSON.stringify(value)
  : Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
const checksum = value => crypto.createHash('sha256').update(canonical(value)).digest('hex')
const q = value => `"${String(value).replaceAll('"', '""')}"`
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex')

function createService(db, options = {}) {
  const backupDir = options.backupDir || process.env.JURNALKU_BACKUP_DIR || path.resolve(__dirname, '../var/backups')
  const mediaRoot = path.resolve(options.mediaRoot || process.env.MEDIA_ROOT || path.join(__dirname, 'uploads'))
  // Budget ekspor dapat diturunkan lewat options (dipakai pengujian). Validasi
  // artefak yang masuk tetap memakai batas keras global agar tidak bisa dilonggarkan
  // oleh pengunggah.
  const positive = (value, fallback) => Number.isInteger(value) && value > 0 ? value : fallback
  const exportMediaFiles = positive(options.maxMediaFiles, MAX_MEDIA_FILES)
  const exportMediaFileBytes = positive(options.maxMediaFileBytes, MAX_MEDIA_FILE_BYTES)
  const exportMediaTotalBytes = positive(options.maxMediaTotalBytes, MAX_MEDIA_TOTAL_BYTES)
  // `maxBytes` hanya boleh MENURUNKAN batas keras, tidak menaikkannya.
  const maxBytes = Math.min(positive(options.maxBytes, MAX_BYTES), MAX_BYTES)
  const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name))
  const info = table => db.pragma(`table_info(${JSON.stringify(table)})`)
  const cols = table => info(table).map(row => row.name)
  const tenantTable = table => names.has(table) && cols(table).includes('tenant_id')
  const available = key => {
    const section = SECTIONS[key]
    return Boolean(section) && section.tables.filter(table => !section.optional.includes(table)).every(tenantTable) && section.tables.some(tenantTable)
  }
  const selectedKeys = input => {
    const list = input === undefined ? Object.keys(SECTIONS).filter(available) : input
    if (!Array.isArray(list) || !list.length || list.some(key => typeof key !== 'string' || !available(key)) || new Set(list).size !== list.length) {
      throw new ValidationError('Bagian backup kosong, duplikat, atau tidak didukung')
    }
    return list
  }
  const safeCols = table => cols(table).filter(column => column === 'tenant_id' || !DENY.test(column))
  const rowsFor = (key, tenantId) => SECTIONS[key].tables.filter(tenantTable).flatMap(table =>
    db.prepare(`SELECT ${safeCols(table).map(q)} FROM ${q(table)} WHERE tenant_id=?`).all(tenantId).map(row => ({ __table: table, ...row })))

  function mediaRelative(value) {
    if (typeof value !== 'string' || !value.startsWith('/uploads/')) return null
    let relative
    try { relative = decodeURIComponent(value.slice('/uploads/'.length).split(/[?#]/)[0]) } catch { return null }
    const normalized = path.posix.normalize(relative).replace(/^\/+/, '')
    if (!normalized || normalized === '.' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return null
    const target = path.resolve(mediaRoot, normalized)
    const inside = path.relative(mediaRoot, target)
    return inside.startsWith('..') || path.isAbsolute(inside) ? null : normalized
  }

  function collectMedia(tables) {
    const references = new Set()
    for (const rows of Object.values(tables)) for (const row of rows) {
      for (const value of Object.values(row)) {
        if (typeof value !== 'string') continue
        const direct = mediaRelative(value)
        if (direct) references.add(direct)
        if (value.includes('/uploads/') && /^[\[{]/.test(value.trim())) {
          try {
            const walk = item => {
              if (typeof item === 'string') { const rel = mediaRelative(item); if (rel) references.add(rel) }
              else if (Array.isArray(item)) item.forEach(walk)
              else if (item && typeof item === 'object') Object.values(item).forEach(walk)
            }
            walk(JSON.parse(value))
          } catch {}
        }
      }
    }
    // Media yang tidak tertampung dilewati dan dicatat, bukan menggagalkan backup:
    // satu foto besar tidak boleh membuat seluruh data tenant gagal dibackup.
    const media = []
    const omitted = []
    let total = 0
    const sorted = [...references].sort()
    for (const relative of sorted.slice(exportMediaFiles)) omitted.push({ path: relative, size: 0, reason: 'file_count_budget' })
    for (const relative of sorted.slice(0, exportMediaFiles)) {
      const source = path.resolve(mediaRoot, relative)
      if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue
      const size = fs.statSync(source).size
      if (size > exportMediaFileBytes) { omitted.push({ path: relative, size, reason: 'file_too_large' }); continue }
      if (total + size > exportMediaTotalBytes) { omitted.push({ path: relative, size, reason: 'total_budget' }); continue }
      const buffer = fs.readFileSync(source)
      total += buffer.length
      media.push({ path: relative, size: buffer.length, checksum: sha256(buffer), data: buffer.toString('base64') })
    }
    return { media, omitted }
  }

  function exportData(tenantId, selected) {
    if (!tenantId) throw new ValidationError('Tenant wajib')
    const tenant = db.prepare('SELECT id,nama FROM tenants WHERE id=?').get(tenantId)
    if (!tenant) throw new ValidationError('Tenant tidak ditemukan')
    const tables = {}, sections = []
    for (const key of selectedKeys(selected)) {
      tables[key] = rowsFor(key, tenantId)
      sections.push({ key, count: tables[key].length, checksum: checksum(tables[key]) })
    }
    const { media, omitted } = collectMedia(tables)
    return {
      manifest: {
        format: 'jurnalku-tenant-backup', schema_version: 2, created_at: new Date().toISOString(), tenant,
        users_excluded: true, excluded: EXCLUDED, sections,
        media: {
          count: media.length, bytes: media.reduce((sum, item) => sum + item.size, 0), checksum: checksum(media),
          omitted, omitted_bytes: omitted.reduce((sum, item) => sum + item.size, 0),
        },
      },
      tables, media,
    }
  }

  function legacyArtifact(tenantId, legacy) {
    if (!legacy || typeof legacy !== 'object' || !legacy.data || typeof legacy.data !== 'object' || Array.isArray(legacy.data)) {
      throw new ValidationError('Format backup Google Drive tidak valid')
    }
    const expectedTarget = LEGACY_SLUG_TARGETS[String(legacy.slug || '').toLowerCase()]
    if (!expectedTarget || expectedTarget !== tenantId) throw new ValidationError('Backup Google Drive bukan milik tenant tujuan')
    const tenant = db.prepare('SELECT id,nama FROM tenants WHERE id=?').get(tenantId)
    if (!tenant) throw new ValidationError('Tenant tidak ditemukan')
    const tables = {}, sections = [], includedTables = []
    for (const [key, section] of Object.entries(SECTIONS)) {
      if (!available(key)) continue
      const rows = []
      let included = false
      for (const table of section.tables) {
        if (!tenantTable(table) || !Array.isArray(legacy.data[table])) continue
        included = true
        includedTables.push(table)
        const allowed = safeCols(table)
        for (const source of legacy.data[table]) {
          if (!source || typeof source !== 'object' || Array.isArray(source)) throw new ValidationError(`Bentuk baris lama tidak valid pada ${table}`)
          const row = { __table: table, tenant_id: tenantId }
          for (const column of allowed) if (column !== 'tenant_id' && Object.hasOwn(source, column)) row[column] = source[column]
          rows.push(row)
        }
      }
      if (included) {
        tables[key] = rows
        sections.push({ key, count: rows.length, checksum: checksum(rows) })
      }
    }
    if (!sections.length) throw new ValidationError('Backup Google Drive tidak memiliki bagian data yang didukung')
    return {
      manifest: {
        format: 'jurnalku-tenant-backup', schema_version: 1, created_at: legacy.exported_at || new Date().toISOString(), tenant,
        users_excluded: true, excluded: EXCLUDED, legacy_source: { tenant_id: legacy.tenant_id || null, slug: legacy.slug || null },
        sections, legacy_tables: includedTables,
      },
      tables,
    }
  }

  function parseArtifact(tenantId, buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new ValidationError('File backup wajib')
    let raw = buffer
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
      try { raw = zlib.gunzipSync(buffer, { maxOutputLength: maxBytes + 1 }) }
      catch (error) {
        if (error?.code === 'ERR_BUFFER_TOO_LARGE') throw new ValidationError('File backup terlalu besar setelah diekstrak')
        throw new ValidationError('File GZIP rusak atau tidak valid')
      }
    }
    if (raw.length > maxBytes) throw new ValidationError('File backup terlalu besar setelah diekstrak')
    let artifact
    try { artifact = JSON.parse(raw.toString('utf8')) } catch { throw new ValidationError('JSON backup tidak valid') }
    return artifact?.manifest?.format === 'jurnalku-tenant-backup' ? artifact : legacyArtifact(tenantId, artifact)
  }

  function validateOmitted(declared) {
    // Field baru; artefak lama tanpa `omitted` tetap diterima.
    if (declared.omitted === undefined && declared.omitted_bytes === undefined) return []
    if (!Array.isArray(declared.omitted)) throw new ValidationError('Daftar media omitted tidak valid')
    let bytes = 0
    const seen = new Set()
    for (const item of declared.omitted) {
      if (!item || typeof item.path !== 'string' || seen.has(item.path) || path.posix.normalize(item.path) !== item.path
        || item.path.startsWith('../') || path.posix.isAbsolute(item.path)
        || !Number.isInteger(item.size) || item.size < 0 || !OMIT_REASONS.includes(item.reason)) {
        throw new ValidationError('Entri media omitted tidak valid')
      }
      seen.add(item.path)
      bytes += item.size
    }
    if (declared.omitted_bytes !== undefined && declared.omitted_bytes !== bytes) throw new ValidationError('Ukuran media omitted tidak cocok')
    return declared.omitted
  }

  function validateMedia(artifact) {
    const version = artifact.manifest.schema_version
    if (version === 1) return { media: [], omitted: [] }
    const media = artifact.media
    const declared = artifact.manifest.media
    if (!Array.isArray(media) || !declared || declared.count !== media.length || declared.checksum !== checksum(media)) {
      throw new ValidationError('Manifest media tidak cocok')
    }
    const omitted = validateOmitted(declared)
    if (media.length > MAX_MEDIA_FILES) throw new ValidationError('Jumlah media backup melewati batas')
    let total = 0
    const seen = new Set()
    for (const item of media) {
      if (!item || typeof item.path !== 'string' || seen.has(item.path) || path.posix.normalize(item.path) !== item.path || item.path.startsWith('../') || path.posix.isAbsolute(item.path)) {
        throw new ValidationError('Path media tidak valid')
      }
      seen.add(item.path)
      if (typeof item.data !== 'string' || typeof item.checksum !== 'string' || !Number.isInteger(item.size) || item.size < 0 || item.size > MAX_MEDIA_FILE_BYTES) {
        throw new ValidationError('Bentuk media tidak valid')
      }
      const buffer = Buffer.from(item.data, 'base64')
      if (buffer.length !== item.size || sha256(buffer) !== item.checksum) throw new ValidationError('Checksum media tidak cocok')
      total += buffer.length
      if (total > MAX_MEDIA_TOTAL_BYTES) throw new ValidationError('Total media backup melewati batas')
    }
    if (declared.bytes !== total) throw new ValidationError('Ukuran media tidak cocok')
    return { media, omitted }
  }

  function normalized(tenantId, artifact) {
    if (!artifact || Buffer.byteLength(JSON.stringify(artifact)) > maxBytes || artifact.manifest?.format !== 'jurnalku-tenant-backup' || ![1, 2].includes(artifact.manifest.schema_version)) {
      throw new ValidationError('Format atau versi backup tidak valid')
    }
    if (artifact.manifest.tenant?.id !== tenantId) throw new ValidationError('Backup lintas tenant ditolak')
    const sections = artifact.manifest.sections
    if (!Array.isArray(sections) || !sections.length || new Set(sections.map(section => section.key)).size !== sections.length || Object.keys(artifact.tables || {}).sort().join() !== sections.map(section => section.key).sort().join()) {
      throw new ValidationError('Bagian backup kosong, duplikat, atau tidak cocok')
    }
    let total = 0
    const rows = []
    for (const section of sections) {
      if (!available(section.key) || Object.keys(section).filter(key => key !== 'label').sort().join() !== 'checksum,count,key' || !Array.isArray(artifact.tables[section.key]) || section.count !== artifact.tables[section.key].length || checksum(artifact.tables[section.key]) !== section.checksum) {
        throw new ValidationError('Manifest, jumlah, atau checksum tidak cocok')
      }
      for (const row of artifact.tables[section.key]) {
        const table = row?.__table
        if (!table || !SECTIONS[section.key].tables.includes(table) || !tenantTable(table)) throw new ValidationError('Tabel tidak diizinkan')
        const expected = new Set(['__table', ...safeCols(table)])
        if (Object.keys(row).some(column => !expected.has(column)) || (!artifact.manifest.legacy_source && safeCols(table).some(column => !(column in row)))) {
          throw new ValidationError('Bentuk baris tidak valid')
        }
        rows.push({ ...row, tenant_id: tenantId })
      }
      total += artifact.tables[section.key].length
    }
    if (total > MAX_ROWS) throw new ValidationError('Jumlah baris melewati batas')
    const mediaResult = validateMedia(artifact)
    return {
      sections, rows, total, media: mediaResult.media, mediaOmitted: mediaResult.omitted,
      tables: artifact.manifest.legacy_tables || [...new Set(rows.map(row => row.__table))],
    }
  }

  function graph(rows) {
    const tables = [...new Set(rows.map(row => row.__table))], set = new Set(tables), edges = []
    for (const child of tables) for (const fk of db.pragma(`foreign_key_list(${JSON.stringify(child)})`)) if (set.has(fk.table)) edges.push([fk.table, child])
    const out = [], left = new Set(tables)
    while (left.size) {
      const table = [...left].find(item => !edges.some(([parent, child]) => child === item && left.has(parent)))
      if (!table) throw new ValidationError('Siklus dependency tidak didukung')
      out.push(table); left.delete(table)
    }
    return out
  }

  function validateRefs(tenantId, rows) {
    const incoming = new Map()
    for (const row of rows) {
      if (!incoming.has(row.__table)) incoming.set(row.__table, [])
      incoming.get(row.__table).push(row)
    }
    for (const row of rows) for (const fk of db.pragma(`foreign_key_list(${JSON.stringify(row.__table)})`)) {
      const value = row[fk.from]
      if (value == null) continue
      if (!tenantTable(fk.table)) throw new ValidationError(`FK ${row.__table}.${fk.from} menuju tabel global tidak didukung`)
      const inFile = (incoming.get(fk.table) || []).some(candidate => candidate[fk.to] === value && candidate.tenant_id === tenantId)
      const inDb = db.prepare(`SELECT 1 FROM ${q(fk.table)} WHERE ${q(fk.to)}=? AND tenant_id=?`).get(value, tenantId)
      if (!inFile && !inDb) throw new ValidationError(`FK lintas tenant atau hilang: ${row.__table}.${fk.from}`)
    }
  }

  function snapshot(tenantId) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 }); fs.chmodSync(backupDir, 0o700)
    const target = path.join(backupDir, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${String(tenantId).replace(/[^a-z0-9_-]/gi, '_')}.sqlite`)
    db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`); fs.chmodSync(target, 0o600)
    const check = new Database(target, { readonly: true, fileMustExist: true })
    try { if (check.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Snapshot SQLite rusak') } finally { check.close() }
    for (const file of fs.readdirSync(backupDir).filter(name => name.endsWith('.sqlite')).sort((a, b) => fs.statSync(path.join(backupDir, a)).mtimeMs - fs.statSync(path.join(backupDir, b)).mtimeMs).slice(0, -20)) fs.unlinkSync(path.join(backupDir, file))
    return target
  }

  function restoreMedia(media) {
    const created = []
    let restored = 0, skipped = 0
    fs.mkdirSync(mediaRoot, { recursive: true, mode: 0o750 })
    try {
      for (const item of media) {
        const target = path.resolve(mediaRoot, item.path)
        const inside = path.relative(mediaRoot, target)
        if (inside.startsWith('..') || path.isAbsolute(inside)) throw new ValidationError('Path media tidak valid')
        if (fs.existsSync(target)) {
          if (sha256(fs.readFileSync(target)) !== item.checksum) throw new ValidationError(`Media sudah ada tetapi checksum berbeda: ${item.path}`)
          skipped++; continue
        }
        fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o750 })
        fs.writeFileSync(target, Buffer.from(item.data, 'base64'), { flag: 'wx', mode: 0o640 })
        created.push(target); restored++
      }
      return { media_restored: restored, media_skipped: skipped }
    } catch (error) {
      for (const target of created.reverse()) fs.rmSync(target, { force: true })
      throw error
    }
  }

  function restore(tenantId, artifact, mode = 'merge', confirmation, replaceConfirmation) {
    const data = normalized(tenantId, artifact)
    if (confirmation !== 'RESTORE' || !['merge', 'replace'].includes(mode) || (mode === 'replace' && replaceConfirmation !== 'REPLACE DATA')) throw new ValidationError('Konfirmasi restore tidak valid')
    validateRefs(tenantId, data.rows)
    const order = graph((data.tables || [...new Set(data.rows.map(row => row.__table))]).map(__table => ({ __table })))
    const byTable = Object.groupBy(data.rows, row => row.__table)
    const snapshotPath = snapshot(tenantId)
    const counts = { inserted: 0, skipped: 0 }
    db.transaction(() => {
      if (mode === 'replace') {
        const chosen = new Set(data.tables || order)
        for (const parent of order) for (const fkRow of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
          if (!tenantTable(fkRow.name) || chosen.has(fkRow.name)) continue
          for (const fk of db.pragma(`foreign_key_list(${JSON.stringify(fkRow.name)})`)) {
            if (fk.table === parent && db.prepare(`SELECT 1 FROM ${q(fkRow.name)} WHERE tenant_id=? LIMIT 1`).get(tenantId)) throw new ValidationError(`Replace ditolak: dependency ${fkRow.name} tidak dipilih`)
          }
        }
        for (const table of [...order].reverse()) db.prepare(`DELETE FROM ${q(table)} WHERE tenant_id=?`).run(tenantId)
      }
      for (const table of order) for (const row of byTable[table] || []) {
        const pk = info(table).filter(column => column.pk).sort((a, b) => a.pk - b.pk)
        if (mode === 'merge' && pk.length) {
          const where = pk.map(column => `${q(column.name)}=?`).join(' AND ')
          const hit = db.prepare(`SELECT tenant_id FROM ${q(table)} WHERE ${where}`).get(...pk.map(column => row[column.name]))
          if (hit) {
            if (hit.tenant_id !== tenantId) throw new ValidationError(`Konflik ID lintas tenant pada ${table}`)
            counts.skipped++; continue
          }
        }
        const columns = safeCols(table).filter(column => column in row)
        if (!columns.length) throw new ValidationError(`Baris kosong tidak valid pada ${table}`)
        db.prepare(`INSERT INTO ${q(table)} (${columns.map(q)}) VALUES (${columns.map(column => `@${column}`)})`).run(row)
        counts.inserted++
      }
      if (db.pragma('foreign_key_check').length) throw new ValidationError('foreign_key_check gagal')
    })()
    let mediaResult
    try {
      mediaResult = restoreMedia(data.media)
    } catch (error) {
      throw new ValidationError(`${error.message} (data database sudah di-rollback oleh transaksi; snapshot ${path.basename(snapshotPath)} tersedia)`)
    }
    return { success: true, ...counts, ...mediaResult, media_omitted: data.mediaOmitted.length, snapshot: path.basename(snapshotPath) }
  }

  function preview(tenantId, artifact) {
    const data = normalized(tenantId, artifact); validateRefs(tenantId, data.rows)
    return { valid: true, total: data.total, media_count: data.media.length, media_bytes: data.media.reduce((sum, item) => sum + item.size, 0), media_omitted: data.mediaOmitted.length, sections: data.sections.map(section => ({ key: section.key, label: SECTIONS[section.key].label, count: section.count })) }
  }

  return {
    exportData, parseArtifact, preview, restore, checksum,
    sections: tenantId => Object.entries(SECTIONS).filter(([key]) => available(key)).map(([key, value]) => ({ key, label: value.label, count: rowsFor(key, tenantId).length })),
    excluded: EXCLUDED,
  }
}

function registerRoutes(app, db, { ADMIN, upload, dbPath, mediaRoot }) {
  const service = createService(db, { dbPath, mediaRoot })
  const wrap = fn => (req, res, next) => { Promise.resolve().then(() => fn(req, res)).catch(next) }
  const up = (req, res, next) => upload.single('backup')(req, res, error => error ? next(new ValidationError(error.code === 'LIMIT_FILE_SIZE' ? 'File terlalu besar' : error.message)) : next())
  const parse = req => { if (!req.file) throw new ValidationError('File backup wajib'); return service.parseArtifact(req.tenantId, req.file.buffer) }
  app.get('/api/backup-restore/sections', ADMIN, wrap((req, res) => res.json(service.sections(req.tenantId))))
  app.post('/api/backup-restore/export', ADMIN, wrap((req, res) => res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="jurnalku-${Date.now()}.json"` }).send(JSON.stringify(service.exportData(req.tenantId, req.body.sections)))))
  app.post('/api/backup-restore/preview', ADMIN, up, wrap((req, res) => res.json(service.preview(req.tenantId, parse(req)))))
  app.post('/api/backup-restore/restore', ADMIN, up, wrap((req, res) => res.json(service.restore(req.tenantId, parse(req), req.body.mode, req.body.confirmation, req.body.replace_confirmation))))
  app.use('/api/backup-restore', (error, req, res, next) => res.status(error instanceof ValidationError ? 400 : 500).json({ error: error.message || 'Backup/restore gagal' }))
}

module.exports = { createService, registerRoutes, SECTIONS, EXCLUDED, ValidationError, LIMITS }
