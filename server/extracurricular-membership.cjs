function uniqueIndexColumns(db, table) {
  return db.prepare(`PRAGMA index_list(${table})`).all()
    .filter(index => index.unique)
    .map(index => db.prepare(`PRAGMA index_info(${index.name})`).all().map(column => column.name))
}

function createMembershipTable(db, table = 'ekskul_anggota') {
  db.exec(`CREATE TABLE ${table} (
    id TEXT PRIMARY KEY,
    ekskul_id TEXT NOT NULL,
    siswa_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    UNIQUE(tenant_id, ekskul_id, siswa_id),
    FOREIGN KEY (ekskul_id) REFERENCES ekskul(id),
    FOREIGN KEY (siswa_id) REFERENCES siswa(id)
  )`)
}

function setupEkskulMembership(db) {
  const columns = db.prepare('PRAGMA table_info(ekskul_anggota)').all()
  if (!columns.length) createMembershipTable(db)

  const currentColumns = db.prepare('PRAGMA table_info(ekskul_anggota)').all()
  const tenantColumn = currentColumns.find(column => column.name === 'tenant_id')
  const uniqueIndexes = uniqueIndexColumns(db, 'ekskul_anggota')
  const hasTenantUnique = uniqueIndexes.some(columns => columns.join(',') === 'tenant_id,ekskul_id,siswa_id')
  const hasLegacyUnique = uniqueIndexes.some(columns => columns.join(',') === 'ekskul_id,siswa_id')

  if (!tenantColumn?.notnull || !hasTenantUnique || hasLegacyUnique) {
    db.transaction(() => {
      db.exec('DROP TABLE IF EXISTS ekskul_anggota_new')
      createMembershipTable(db, 'ekskul_anggota_new')
      db.exec(`INSERT OR IGNORE INTO ekskul_anggota_new (id, ekskul_id, siswa_id, tenant_id)
        SELECT ea.id, ea.ekskul_id, ea.siswa_id, e.tenant_id
        FROM ekskul_anggota ea
        JOIN ekskul e ON e.id=ea.ekskul_id
        JOIN siswa s ON s.id=ea.siswa_id AND s.tenant_id=e.tenant_id
        WHERE e.tenant_id IS NOT NULL AND trim(e.tenant_id)!=''`)
      db.exec('DROP TABLE ekskul_anggota')
      db.exec('ALTER TABLE ekskul_anggota_new RENAME TO ekskul_anggota')
    })()
  }

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_ekskul_anggota_tenant_unique ON ekskul_anggota(tenant_id, ekskul_id, siswa_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_ekskul_anggota_tenant ON ekskul_anggota(tenant_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_ekskul_anggota_activity ON ekskul_anggota(tenant_id, ekskul_id)')
}

module.exports = { setupEkskulMembership }
