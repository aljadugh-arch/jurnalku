function requiredTenantId(tenantId) {
  const value = String(tenantId || '').trim()
  if (!value) throw new Error('Tenant wajib untuk membaca pengaturan')
  return value
}

function canonicalSettingsId(tenantId) {
  return `main_${requiredTenantId(tenantId)}`
}

function getTenantSettings(db, tenantId, columns = '*') {
  const tid = requiredTenantId(tenantId)
  // `columns` is supplied only by server code, never request input.
  const tableColumns = new Set(db.prepare('PRAGMA table_info(settings)').all().map(column => column.name))
  if (tableColumns.has('id')) {
    return db.prepare(`SELECT ${columns} FROM settings WHERE id=? AND tenant_id=?`)
      .get(canonicalSettingsId(tid), tid)
  }
  // Compatibility for minimal/legacy fixtures. Production settings always has id.
  return db.prepare(`SELECT ${columns} FROM settings WHERE tenant_id=? LIMIT 1`).get(tid)
}

function ensureTenantSettings(db, tenantId, defaults = {}) {
  const tid = requiredTenantId(tenantId)
  const id = canonicalSettingsId(tid)
  const allowed = new Set(db.prepare('PRAGMA table_info(settings)').all().map(column => column.name))
  const entries = Object.entries(defaults).filter(([column]) => !['id', 'tenant_id'].includes(column) && allowed.has(column))
  const columns = ['id', 'tenant_id', ...entries.map(([column]) => column)]
  const placeholders = columns.map(() => '?').join(',')
  db.prepare(`INSERT OR IGNORE INTO settings (${columns.join(',')}) VALUES (${placeholders})`)
    .run(id, tid, ...entries.map(([, value]) => value))
  return getTenantSettings(db, tid)
}

function migrateTenantSettings(db) {
  const tenants = db.prepare('SELECT id,nama FROM tenants').all()
  return db.transaction(() => {
    let created = 0
    for (const tenant of tenants) {
      if (getTenantSettings(db, tenant.id)) continue
      const legacy = db.prepare('SELECT * FROM settings WHERE tenant_id=? ORDER BY datetime(updated_at) DESC, id DESC LIMIT 1').get(tenant.id)
      ensureTenantSettings(db, tenant.id, legacy || { nama_lembaga: tenant.nama || '' })
      created++
    }
    return created
  })()
}

module.exports = { canonicalSettingsId, getTenantSettings, ensureTenantSettings, migrateTenantSettings }
