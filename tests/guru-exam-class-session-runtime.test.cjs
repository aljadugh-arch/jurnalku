const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')

function functionSource(name) {
  const marker = `function ${name}(`
  const start = server.indexOf(marker)
  assert.notEqual(start, -1, `${name} harus ada`)
  let depth = 0
  let opened = false
  for (let i = start; i < server.length; i++) {
    if (server[i] === '{') { depth++; opened = true }
    if (server[i] === '}') {
      depth--
      if (opened && depth === 0) return server.slice(start, i + 1)
    }
  }
  throw new Error(`Sumber ${name} tidak lengkap`)
}

function extractEnterScheduleLookup() {
  const routeStart = server.indexOf("app.post('/api/guru/sesi-kelas/masuk'")
  assert.notEqual(routeStart, -1)
  const selectStart = server.indexOf('const jadwal = db.prepare(`', routeStart)
  const sqlStart = server.indexOf('`', selectStart) + 1
  const sqlEnd = server.indexOf('`)', sqlStart)
  return server.slice(sqlStart, sqlEnd)
}

function fixture() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE mapel (id TEXT PRIMARY KEY, nama TEXT, tenant_id TEXT);
    CREATE TABLE rombel (id TEXT PRIMARY KEY, nama TEXT, tenant_id TEXT);
    CREATE TABLE gtk (id TEXT PRIMARY KEY, nama TEXT, tenant_id TEXT);
    CREATE TABLE jadwal (
      id TEXT PRIMARY KEY, mapel_id TEXT, rombel_id TEXT, gtk_id TEXT,
      hari TEXT, jam_mulai TEXT, jam_selesai TEXT, ruangan TEXT,
      jenis_kegiatan TEXT, tenant_id TEXT
    );
    CREATE TABLE jadwal_ujian (
      id TEXT PRIMARY KEY, template_id TEXT, mapel_id TEXT, rombel_id TEXT,
      gtk_id TEXT, hari TEXT, jam_mulai TEXT, jam_selesai TEXT,
      ruangan TEXT, tenant_id TEXT
    );
    CREATE TABLE sesi_kelas_guru (
      id TEXT PRIMARY KEY, jadwal_id TEXT NOT NULL, jadwal_source TEXT DEFAULT 'reguler',
      guru_id TEXT NOT NULL, mapel_id TEXT NOT NULL, rombel_id TEXT NOT NULL,
      tanggal TEXT NOT NULL, waktu_masuk TEXT NOT NULL, waktu_selesai TEXT,
      status TEXT DEFAULT 'aktif', menit_terlambat INTEGER DEFAULT 0,
      tenant_id TEXT NOT NULL, updated_at TEXT
    );
  `)
  db.prepare('INSERT INTO mapel VALUES (?,?,?)').run('m1', 'Bahasa Arab', 't1')
  db.prepare('INSERT INTO rombel VALUES (?,?,?)').run('r1', 'VII-A', 't1')
  db.prepare('INSERT INTO gtk VALUES (?,?,?)').run('g1', 'Guru Satu', 't1')
  db.prepare('INSERT INTO jadwal_ujian VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('exam-1', 'tpl-1', 'm1', 'r1', 'g1', 'selasa', '07:30', '08:15', 'R1', 't1')
  return db
}

test('Masuk kelas menerima ID jadwal ujian aktif, bukan hanya jadwal reguler', () => {
  const db = fixture()
  try {
    const sql = extractEnterScheduleLookup()
    const expectedBindCount = (sql.match(/\?/g) || []).length
    assert.equal(expectedBindCount, 12, 'lookup harus bind regular + ujian + sesi secara tenant-scoped')
    const row = db.prepare(sql).get(
      'exam-1', 'g1', 't1', 'selasa',
      'exam-1', 'g1', 't1', 'selasa', 'tpl-1',
      'g1', '2026-09-22', 't1'
    )
    assert.equal(row.id, 'exam-1')
    assert.equal(row.jadwal_source, 'ujian')
    assert.equal(row.mapel_id, 'm1')
  } finally { db.close() }
})

test('sesi jadwal ujian dibaca tanpa inner join ke tabel jadwal reguler', () => {
  const db = fixture()
  try {
    db.prepare(`INSERT INTO sesi_kelas_guru
      (id,jadwal_id,jadwal_source,guru_id,mapel_id,rombel_id,tanggal,waktu_masuk,status,tenant_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run('s1', 'exam-1', 'ujian', 'g1', 'm1', 'r1', '2026-09-22', '07:25', 'aktif', 't1')
    const factory = new Function('db', `${functionSource('currentTeacherClassSession').replace('function currentTeacherClassSession', 'return function')}`)
    const currentTeacherClassSession = factory(db)
    const row = currentTeacherClassSession('t1', 'g1', '2026-09-22')
    assert.equal(row.jadwal_id, 'exam-1')
    assert.equal(row.jadwal_source, 'ujian')
    assert.equal(row.jam_selesai, '08:15')
    assert.equal(row.mapel_nama, 'Bahasa Arab')
  } finally { db.close() }
})
