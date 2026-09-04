const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')
const serverSource = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')
const waSource = fs.readFileSync(path.join(root, 'server/wa-queue.cjs'), 'utf8')
const dashboardSource = fs.readFileSync(path.join(root, 'server/dashboard-late.cjs'), 'utf8')
const financeSource = fs.readFileSync(path.join(root, 'server/finance-excel.cjs'), 'utf8')
const helperSource = fs.readFileSync(path.join(root, 'server/tenant-settings.cjs'), 'utf8')
const { canonicalSettingsId, getTenantSettings, ensureTenantSettings, migrateTenantSettings } = require('../server/tenant-settings.cjs')
const { isHoliday } = require('../server/holiday-rules.cjs')

function fixture() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE settings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    nama_lembaga TEXT DEFAULT '',
    hari_libur TEXT DEFAULT '["jumat"]',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`)
  db.prepare('INSERT INTO settings (id,tenant_id,nama_lembaga,hari_libur,updated_at) VALUES (?,?,?,?,?)')
    .run('main_mimifdangimbang', 'mimifdangimbang', 'MI Mifda Ngimbang', '["minggu"]', '2026-09-01 00:00:00')
  db.prepare('INSERT INTO settings (id,tenant_id,nama_lembaga,hari_libur,updated_at) VALUES (?,?,?,?,?)')
    .run('legacy-mifda', 'mimifdangimbang', 'Data lama salah', '["jumat"]', '2026-09-03 00:00:00')
  db.prepare('INSERT INTO settings (id,tenant_id,nama_lembaga,hari_libur,updated_at) VALUES (?,?,?,?,?)')
    .run('main_mtsplussd7', 'mtsplussd7', 'MTs Plus SD 7', '["jumat"]', '2026-09-02 00:00:00')
  db.prepare('INSERT INTO settings (id,tenant_id,nama_lembaga,hari_libur,updated_at) VALUES (?,?,?,?,?)')
    .run('main', 'default', 'Global lama', '["jumat","minggu"]', '2026-09-04 00:00:00')
  return db
}

test('settings canonical selalu memakai id tenant dan tidak memilih row legacy terbaru', () => {
  const db = fixture()
  assert.equal(canonicalSettingsId('mimifdangimbang'), 'main_mimifdangimbang')
  assert.equal(getTenantSettings(db, 'mimifdangimbang').nama_lembaga, 'MI Mifda Ngimbang')
  assert.equal(getTenantSettings(db, 'mimifdangimbang').hari_libur, '["minggu"]')
  assert.equal(getTenantSettings(db, 'mtsplussd7').hari_libur, '["jumat"]')
  assert.equal(getTenantSettings(db, 'tenant-baru'), undefined)
})

test('ensureTenantSettings membuat satu row canonical tanpa menyalin global atau tenant lain', () => {
  const db = fixture()
  const row = ensureTenantSettings(db, 'tenant-baru', { nama_lembaga: 'Tenant Baru' })
  assert.equal(row.id, 'main_tenant-baru')
  assert.equal(row.tenant_id, 'tenant-baru')
  assert.equal(row.nama_lembaga, 'Tenant Baru')
  assert.equal(row.hari_libur, '["jumat"]')
})

test('migrasi membuat canonical tenant lama dari row tenant itu sendiri, bukan row global', () => {
  const db = fixture()
  db.exec('CREATE TABLE tenants(id TEXT PRIMARY KEY,nama TEXT)')
  db.prepare('INSERT INTO tenants VALUES (?,?)').run('tenant-lama', 'Tenant Lama')
  db.prepare('INSERT INTO settings (id,tenant_id,nama_lembaga,hari_libur) VALUES (?,?,?,?)')
    .run('legacy-tenant-lama', 'tenant-lama', 'Identitas Tenant Lama', '["minggu"]')
  assert.equal(migrateTenantSettings(db), 1)
  assert.deepEqual(getTenantSettings(db, 'tenant-lama', 'id,tenant_id,nama_lembaga,hari_libur'), {
    id: 'main_tenant-lama', tenant_id: 'tenant-lama', nama_lembaga: 'Identitas Tenant Lama', hari_libur: '["minggu"]',
  })
})

test('aturan libur Mifda dan MTs tetap eksklusif walau ada settings legacy yang konflik', () => {
  const db = fixture()
  const mifda = getTenantSettings(db, 'mimifdangimbang')
  const mts = getTenantSettings(db, 'mtsplussd7')
  assert.equal(isHoliday({ date: '2026-09-04', holidayDays: mifda.hari_libur }), false)
  assert.equal(isHoliday({ date: '2026-09-06', holidayDays: mifda.hari_libur }), true)
  assert.equal(isHoliday({ date: '2026-09-04', holidayDays: mts.hari_libur }), true)
  assert.equal(isHoliday({ date: '2026-09-06', holidayDays: mts.hari_libur }), false)
})

test('semua pembaca settings fitur memakai helper canonical tenant, bukan SELECT arbitrer', () => {
  for (const [name, source] of Object.entries({ index: serverSource, wa: waSource, dashboard: dashboardSource, finance: financeSource })) {
    assert.doesNotMatch(source, /FROM settings WHERE tenant_id\s*=\s*\?/, `${name} masih memilih settings tenant tanpa row canonical`)
  }
  assert.match(helperSource, /WHERE id=\? AND tenant_id=\?/)
  assert.doesNotMatch(serverSource, /FROM settings WHERE id\s*=\s*\?[^\n]*\.get\(id\)(?![^\n]*tenant)/)
  assert.match(serverSource, /getTenantSettings\(db, req\.tenantId/)
  assert.match(waSource, /getTenantSettings\(db, tenantId/)
  assert.match(dashboardSource, /getTenantSettings\(db, tenantId/)
  assert.match(financeSource, /getTenantSettings\(db, tenant/)
})

test('settings tenant tidak pernah fallback ke row main global', () => {
  assert.doesNotMatch(serverSource, /get\(['"]main['"]\)/)
  assert.doesNotMatch(serverSource, /SELECT \* FROM settings WHERE id = \?['"]\)\.get\(['"]main['"]\)/)
})
