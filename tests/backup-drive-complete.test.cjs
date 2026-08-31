const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { createService } = require('../server/backup-restore.cjs')

test('Drive backup exports tenant data but excludes credentials and backup operational tables', () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, nama TEXT);
    INSERT INTO tenants VALUES ('t1', 'Tenant');
    CREATE TABLE settings (id TEXT PRIMARY KEY, tenant_id TEXT, logo TEXT, theme TEXT, geo_latitude REAL);
    CREATE TABLE siswa (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT);
    CREATE TABLE tagihan (id TEXT PRIMARY KEY, tenant_id TEXT, nominal REAL);
    CREATE TABLE tabungan (id TEXT PRIMARY KEY, tenant_id TEXT, nominal REAL);
    CREATE TABLE absensi_siswa (id TEXT PRIMARY KEY, tenant_id TEXT, siswa_id TEXT);
    CREATE TABLE absensi_guru (id TEXT PRIMARY KEY, tenant_id TEXT, gtk_id TEXT);
    CREATE TABLE kegiatan_khusus (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT);
    CREATE TABLE absensi_kegiatan (id TEXT PRIMARY KEY, tenant_id TEXT, siswa_id TEXT, kegiatan_id TEXT);
    CREATE TABLE jamaah_sesi (id TEXT PRIMARY KEY, tenant_id TEXT, nama TEXT);
    CREATE TABLE jamaah_rekap_manual (id TEXT PRIMARY KEY, tenant_id TEXT, siswa_id TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, tenant_id TEXT, password TEXT);
    CREATE TABLE wa_gateway_config (id TEXT PRIMARY KEY, tenant_id TEXT, api_key TEXT);
    CREATE TABLE backup_log (id TEXT PRIMARY KEY, tenant_id TEXT, status TEXT);
    INSERT INTO settings VALUES ('st','t1','/uploads/logo.webp','dark',-7.1);
    INSERT INTO siswa VALUES ('s','t1','Siswa');
    INSERT INTO tagihan VALUES ('tg','t1',1000);
    INSERT INTO tabungan VALUES ('tb','t1',500);
    INSERT INTO jamaah_sesi VALUES ('js','t1','Subuh');
    INSERT INTO users VALUES ('u','t1','secret');
    INSERT INTO wa_gateway_config VALUES ('w','t1','secret');
    INSERT INTO backup_log VALUES ('b','t1','ok');
  `)
  const artifact = createService(db, { mediaRoot: '/tmp/nonexistent-jurnalku-media' }).exportData('t1')
  const rows = Object.values(artifact.tables).flat()
  for (const table of ['settings','siswa','tabungan','jamaah_sesi']) assert.equal(rows.filter(row => row.__table === table).length, 1)
  for (const table of ['users','wa_gateway_config','backup_log']) assert.equal(rows.some(row => row.__table === table), false)
  db.close()
})
