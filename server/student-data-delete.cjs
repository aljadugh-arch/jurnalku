'use strict'

// Relasi eksplisit dipakai sebagai fallback untuk tabel tanpa foreign key.
const STUDENT_REFERENCE_COLUMNS = Object.freeze({
  user_students: 'student_id',
  cashless_ledger: 'student_id',
  cashless_invoices: 'student_id',
  cashless_cards: 'student_id',
  penempatan_kamar: 'student_id',
  perizinan_santri: 'student_id',
  kantin_orders: 'student_id',
  cashless_topup_manual: 'student_id',
  users: 'siswa_id',
  penilaian_harian: 'siswa_id',
  rapor: 'siswa_id',
  catatan_kepribadian: 'siswa_id',
  absensi_siswa: 'siswa_id',
  absensi_mapel: 'siswa_id',
  absensi_ekskul: 'siswa_id',
  ekskul_anggota: 'siswa_id',
  tagihan: 'siswa_id',
  tabungan: 'siswa_id',
  beasiswa: 'siswa_id',
  tahfidz_peserta: 'siswa_id',
  tahfidz_absensi: 'siswa_id',
  absensi_kegiatan: 'siswa_id',
  jamaah_rekap_manual: 'siswa_id',
  qr_siswa_identifiers: 'siswa_id'
})

const DELETE_PRIORITY = Object.freeze([
  'cashless_topup_manual', 'kantin_orders', 'perizinan_santri', 'penempatan_kamar',
  'cashless_invoices', 'cashless_ledger', 'cashless_cards', 'user_students',
  'absensi_kegiatan', 'tahfidz_absensi', 'tahfidz_peserta', 'beasiswa', 'tabungan',
  'tagihan', 'ekskul_anggota', 'absensi_ekskul', 'absensi_mapel', 'absensi_siswa',
  'catatan_kepribadian', 'rapor', 'penilaian_harian', 'qr_siswa_identifiers', 'users'
])
const PRIORITY = new Map(DELETE_PRIORITY.map((table, index) => [table, index]))

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function tableColumns(db, table) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)
  if (!exists) return null
  return new Set(db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map(column => column.name))
}

function studentReferences(db) {
  const references = new Map(Object.entries(STUDENT_REFERENCE_COLUMNS))
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
    const columns = tableColumns(db, name)
    if (columns?.has('siswa_id')) references.set(name, 'siswa_id')
    else if (columns?.has('student_id')) references.set(name, 'student_id')
  }
  return [...references.entries()].sort(([a], [b]) => (PRIORITY.get(a) ?? 999) - (PRIORITY.get(b) ?? 999))
}

function studentScope(db, { tenantId, rombelId } = {}) {
  if (!tenantId) throw new Error('tenantId wajib diisi')
  if (rombelId) {
    const rombelColumns = tableColumns(db, 'rombel')
    if (rombelColumns) {
      const rombel = db.prepare('SELECT 1 FROM rombel WHERE id=? AND tenant_id=?').get(rombelId, tenantId)
      if (!rombel) return { where: 'tenant_id=? AND 0=1', params: [tenantId] }
    }
    return { where: 'tenant_id=? AND rombel_id=?', params: [tenantId, rombelId] }
  }
  return { where: 'tenant_id=?', params: [tenantId] }
}

function countStudents(db, options) {
  const scope = studentScope(db, options)
  return db.prepare(`SELECT COUNT(*) total FROM siswa WHERE ${scope.where}`).get(...scope.params).total
}

function deleteStudents(db, options) {
  const { tenantId } = options || {}
  const scope = studentScope(db, options)
  const ids = db.prepare(`SELECT id FROM siswa WHERE ${scope.where}`).all(...scope.params).map(row => row.id)
  if (!ids.length) return { students: 0, related: {} }

  return db.transaction(() => {
    db.exec('CREATE TEMP TABLE IF NOT EXISTS target_student_delete (id TEXT PRIMARY KEY)')
    db.exec('DELETE FROM target_student_delete')
    const addTarget = db.prepare('INSERT INTO target_student_delete(id) VALUES (?)')
    for (const id of ids) addTarget.run(id)

    const related = {}
    for (const [table, studentColumn] of studentReferences(db)) {
      if (table === 'siswa') continue
      const columns = tableColumns(db, table)
      if (!columns?.has(studentColumn)) continue
      const tenantSql = columns.has('tenant_id') ? ' AND tenant_id=?' : ''
      const params = columns.has('tenant_id') ? [tenantId] : []
      const tableSql = quoteIdentifier(table)
      const columnSql = quoteIdentifier(studentColumn)
      related[table] = db.prepare(`DELETE FROM ${tableSql} WHERE ${columnSql} IN (SELECT id FROM target_student_delete)${tenantSql}`).run(...params).changes
    }

    const result = db.prepare('DELETE FROM siswa WHERE id IN (SELECT id FROM target_student_delete) AND tenant_id=?').run(tenantId)
    db.exec('DELETE FROM target_student_delete')
    return { students: result.changes, related }
  })()
}

module.exports = { STUDENT_REFERENCE_COLUMNS, countStudents, deleteStudents }
