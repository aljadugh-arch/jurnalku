const VALID_STATUSES = ['hadir', 'sakit', 'izin', 'alpha']

function isoDate(value) {
  const raw = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const date = new Date(raw + 'T00:00:00Z')
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw ? null : raw
}

function addDays(value, amount) {
  const date = new Date(value + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function daysBetween(from, to) {
  const dates = []
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date)
  return dates
}

function buildRekapRange(query = {}) {
  const modeRaw = String(query.mode || 'monthly').toLowerCase()
  const mode = ({ harian: 'daily', mingguan: 'weekly', bulanan: 'monthly' })[modeRaw] || modeRaw
  if (mode === 'daily') {
    const date = isoDate(query.tanggal || query.mulai || query.tanggal_mulai)
    if (!date) return { error: 'Parameter tanggal (YYYY-MM-DD) wajib untuk mode harian' }
    return { mode, from: date, to: date, label: `Harian ${date}` }
  }
  if (mode === 'weekly') {
    const from = isoDate(query.mulai || query.tanggal_mulai)
    if (!from) return { error: 'Parameter mulai (YYYY-MM-DD) wajib untuk mode mingguan' }
    const explicitTo = query.selesai || query.tanggal_selesai || query.to
    const to = explicitTo ? isoDate(explicitTo) : addDays(from, 6)
    if (!to || to < from) return { error: 'Rentang mingguan tidak valid' }
    return { mode, from, to, label: `Mingguan ${from} s/d ${to}` }
  }
  if (mode === 'monthly') {
    const month = String(query.bulan || '').trim()
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: 'Parameter bulan (YYYY-MM) wajib untuk mode bulanan' }
    const [year, monthNumber] = month.split('-').map(Number)
    const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
    return { mode, from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, label: `Bulanan ${month}` }
  }
  if (mode === 'semester') {
    const academicYear = String(query.tahun_ajaran || '').trim()
    const semester = String(query.semester || '').toLowerCase()
    const match = academicYear.match(/^(\d{4})\/(\d{4})$/)
    if (!match || Number(match[2]) !== Number(match[1]) + 1 || !['ganjil', 'genap'].includes(semester)) {
      return { error: 'tahun_ajaran (YYYY/YYYY) dan semester (ganjil|genap) wajib untuk mode semester' }
    }
    if (semester === 'ganjil') return { mode, from: `${match[1]}-07-01`, to: `${match[1]}-12-31`, label: `Semester Ganjil ${academicYear}` }
    return { mode, from: `${match[2]}-01-01`, to: `${match[2]}-06-30`, label: `Semester Genap ${academicYear}` }
  }
  return { error: 'Mode rekap harus daily, weekly, monthly, atau semester' }
}

function statusKey(status) {
  const value = String(status || '').trim().toLowerCase()
  if (value === 'alpa') return 'alpha'
  if (value === 'terlambat') return 'hadir'
  return VALID_STATUSES.includes(value) ? value : ''
}

function emptySummary() {
  return { hadir: 0, sakit: 0, izin: 0, alpha: 0, total: 0, kosong: 0 }
}

function summarize(rows) {
  const result = emptySummary()
  for (const row of rows) {
    for (const key of VALID_STATUSES) result[key] += Number(row[key] || 0)
    result.total += Number(row.total || 0)
    result.kosong += Number(row.kosong || 0)
  }
  return result
}

function dateSummary(records, from, to) {
  const result = emptySummary()
  for (const record of records) {
    if (record.tanggal < from || record.tanggal > to) continue
    const key = statusKey(record.status)
    if (!key) continue
    result[key]++
    result.total++
  }
  return result
}

function buildBreakdown(mode, from, to, records) {
  if (mode === 'daily') return { granularity: 'record', items: [{ from, to, label: from, summary: dateSummary(records, from, to) }] }
  if (mode === 'weekly') {
    return { granularity: 'daily', items: daysBetween(from, to).map(date => ({ from: date, to: date, label: date, summary: dateSummary(records, date, date) })) }
  }
  if (mode === 'monthly') {
    const items = []
    for (let start = from, index = 1; start <= to; start = addDays(start, 7), index++) {
      const end = addDays(start, 6) > to ? to : addDays(start, 6)
      items.push({ from: start, to: end, label: `Minggu ${index}`, summary: dateSummary(records, start, end) })
    }
    return { granularity: 'weekly', items }
  }
  const items = []
  for (let month = from.slice(0, 7); `${month}-01` <= to;) {
    const [year, number] = month.split('-').map(Number)
    const last = new Date(Date.UTC(year, number, 0)).getUTCDate()
    const start = `${month}-01` < from ? from : `${month}-01`
    const endCandidate = `${month}-${String(last).padStart(2, '0')}`
    const end = endCandidate > to ? to : endCandidate
    items.push({ from: start, to: end, label: month, summary: dateSummary(records, start, end) })
    const next = new Date(Date.UTC(year, number, 1))
    month = next.toISOString().slice(0, 7)
  }
  return { granularity: 'monthly', items }
}

function scheduleForRange(db, tenantId, from, to) {
  const dayNames = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']
  const datesByDay = new Map()
  for (const date of daysBetween(from, to)) {
    const name = dayNames[new Date(date + 'T00:00:00Z').getUTCDay()]
    if (!datesByDay.has(name)) datesByDay.set(name, [])
    datesByDay.get(name).push(date)
  }
  if (!datesByDay.size) return []
  const rows = db.prepare(`SELECT j.id jadwal_id,j.gtk_id,j.rombel_id,j.mapel_id,lower(j.hari) hari,j.jam_mulai,j.jam_selesai,g.nama guru_nama,m.nama mapel_nama,r.nama rombel_nama
    FROM jadwal j LEFT JOIN gtk g ON g.id=j.gtk_id AND g.tenant_id=j.tenant_id
    LEFT JOIN mapel m ON m.id=j.mapel_id AND m.tenant_id=j.tenant_id
    LEFT JOIN rombel r ON r.id=j.rombel_id AND r.tenant_id=j.tenant_id
    WHERE j.tenant_id=? AND j.jenis_kegiatan='mapel' ORDER BY j.hari,j.jam_mulai`).all(tenantId)
  const expanded = []
  for (const row of rows) for (const tanggal of datesByDay.get(row.hari) || []) expanded.push({ ...row, tanggal })
  return expanded
}

function getPeriodicAttendanceRecap(db, tenantId, entityType, range) {
  if (!range || range.error) throw new Error(range?.error || 'Rentang rekap tidak valid')
  if (!['siswa', 'gtk'].includes(entityType)) throw new Error('tipe harus siswa atau gtk')
  const dates = daysBetween(range.from, range.to)
  const schedule = scheduleForRange(db, tenantId, range.from, range.to)
  const isStudent = entityType === 'siswa'
  const entities = isStudent
    ? db.prepare(`SELECT s.id,s.nama,s.nis,s.nisn,s.rombel_id,r.nama rombel_nama FROM siswa s
        LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
        WHERE s.tenant_id=? AND COALESCE(s.status,'aktif')='aktif'
        ORDER BY CASE WHEN r.id IS NULL THEN 1 ELSE 0 END,r.nama,s.nama`).all(tenantId)
    : db.prepare(`SELECT g.id,g.nama,g.nip,g.jabatan FROM gtk g WHERE g.tenant_id=?
        AND COALESCE(g.status_kepegawaian,'')!='Nonaktif' ORDER BY g.nama`).all(tenantId)
  const records = isStudent
    ? db.prepare(`SELECT a.siswa_id entity_id,a.tanggal,a.status FROM absensi_siswa a
        JOIN siswa s ON s.id=a.siswa_id AND s.tenant_id=a.tenant_id
        WHERE a.tenant_id=? AND a.tanggal BETWEEN ? AND ?`).all(tenantId, range.from, range.to)
    : db.prepare(`SELECT a.gtk_id entity_id,a.tanggal,a.status FROM absensi_guru a
        JOIN gtk g ON g.id=a.gtk_id AND g.tenant_id=a.tenant_id
        WHERE a.tenant_id=? AND a.tanggal BETWEEN ? AND ?`).all(tenantId, range.from, range.to)
  const normalizedRecords = records.map(record => ({ ...record, status: statusKey(record.status) }))
  const byEntityDate = new Map()
  for (const record of records) {
    const key = `${record.entity_id}\0${record.tanggal}`
    if (!byEntityDate.has(key)) byEntityDate.set(key, statusKey(record.status))
  }
  const detail = entities.map(entity => {
    const per_tanggal = Object.fromEntries(dates.map(date => [date, '']))
    const totals = emptySummary()
    for (const date of dates) {
      const key = byEntityDate.get(`${entity.id}\0${date}`) || ''
      per_tanggal[date] = key ? key.charAt(0).toUpperCase() : ''
      if (key) { totals[key]++; totals.total++ } else totals.kosong++
    }
    return { ...entity, ...totals, per_tanggal }
  })
  return {
    entity_type: entityType,
    mode: range.mode,
    from: range.from,
    to: range.to,
    label: range.label,
    detail,
    summary: summarize(detail),
    breakdown: buildBreakdown(range.mode, range.from, range.to, normalizedRecords),
    schedule,
  }
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
}

function deduplicateTable(db, table, identityColumn) {
  if (!tableExists(db, table)) return 0
  const duplicateRows = db.prepare(`SELECT tenant_id,${identityColumn} entity_id,tanggal,COUNT(*) count FROM ${table}
    GROUP BY tenant_id,${identityColumn},tanggal HAVING COUNT(*)>1`).all()
  let removed = 0
  for (const duplicate of duplicateRows) {
    const rows = db.prepare(`SELECT rowid,* FROM ${table} WHERE tenant_id=? AND ${identityColumn}=? AND tanggal=?
      ORDER BY (CASE WHEN status IS NULL OR trim(status)='' THEN 0 ELSE 1 END) DESC,
      (CASE WHEN waktu_masuk IS NULL OR trim(waktu_masuk)='' THEN 0 ELSE 1 END) DESC,rowid DESC`).all(duplicate.tenant_id, duplicate.entity_id, duplicate.tanggal)
    const keep = rows[0]
    for (const row of rows.slice(1)) {
      if (table === 'absensi_siswa') {
        db.prepare(`UPDATE absensi_siswa SET
          status=CASE WHEN trim(COALESCE(status,''))='' THEN ? ELSE status END,
          status_pulang=CASE WHEN trim(COALESCE(status_pulang,''))='' THEN ? ELSE status_pulang END,
          waktu_masuk=COALESCE(waktu_masuk,?),waktu_pulang=COALESCE(waktu_pulang,?) WHERE rowid=?`)
          .run(row.status || '', row.status_pulang || '', row.waktu_masuk || null, row.waktu_pulang || null, keep.rowid)
      } else {
        db.prepare('UPDATE absensi_guru SET waktu_masuk=COALESCE(waktu_masuk,?),waktu_pulang=COALESCE(waktu_pulang,?),status=CASE WHEN trim(COALESCE(status,\'\'))=\'\' THEN ? ELSE status END WHERE rowid=?')
          .run(row.waktu_masuk || null, row.waktu_pulang || null, row.status || '', keep.rowid)
      }
      db.prepare(`DELETE FROM ${table} WHERE rowid=?`).run(row.rowid)
      removed++
    }
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_unique ON ${table}(tenant_id,${identityColumn},tanggal)`)
  return removed
}

function deduplicateAttendance(db) {
  const run = db.transaction(() => ({
    absensi_siswa: deduplicateTable(db, 'absensi_siswa', 'siswa_id'),
    absensi_guru: deduplicateTable(db, 'absensi_guru', 'gtk_id'),
  }))
  return run()
}

module.exports = { buildRekapRange, getPeriodicAttendanceRecap, deduplicateAttendance, VALID_STATUSES }
