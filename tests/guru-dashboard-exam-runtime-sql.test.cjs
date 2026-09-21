const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const server = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')

function extractTeacherExamQuery() {
  const helperStart = server.indexOf('function teacherScheduleForDay')
  const helperEnd = server.indexOf('function jadwalUntukRombelHari', helperStart)
  const helper = server.slice(helperStart, helperEnd)
  const match = helper.match(/const exam = db\.prepare\(`([\s\S]*?)`\)/)
  assert.ok(match, 'query ujian teacherScheduleForDay ditemukan')
  return match[1]
}

test('query runtime dashboard guru dapat membaca jadwal_ujian tanpa kolom yang tidak ada', () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE jadwal_ujian (
      id TEXT PRIMARY KEY, template_id TEXT NOT NULL, mapel_id TEXT,
      rombel_id TEXT NOT NULL, gtk_id TEXT, hari TEXT NOT NULL,
      jam_mulai TEXT NOT NULL, jam_selesai TEXT NOT NULL,
      ruangan TEXT, tenant_id TEXT NOT NULL, created_at TEXT
    );
    CREATE TABLE mapel (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE rombel (id TEXT, tenant_id TEXT, nama TEXT);
    CREATE TABLE sesi_kelas_guru (
      jadwal_id TEXT, guru_id TEXT, tanggal TEXT, tenant_id TEXT,
      status TEXT, waktu_masuk TEXT, waktu_selesai TEXT
    );
  `)
  db.prepare(`INSERT INTO jadwal_ujian
    (id,template_id,mapel_id,rombel_id,gtk_id,hari,jam_mulai,jam_selesai,ruangan,tenant_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run('j1', 'tpl1', 'm1', 'r1', 'g1', 'senin', '07:30', '08:15', 'Ruang I', 'tenant1')
  db.prepare('INSERT INTO mapel VALUES (?,?,?)').run('m1', 'tenant1', 'Bahasa Inggris')
  db.prepare('INSERT INTO rombel VALUES (?,?,?)').run('r1', 'tenant1', 'VII-A')

  const rows = db.prepare(extractTeacherExamQuery())
    .all('g1', '2026-09-21', 'g1', 'senin', 'tenant1', 'tpl1')

  assert.equal(rows.length, 1)
  assert.equal(rows[0].mapel_nama, 'Bahasa Inggris')
  assert.equal(rows[0].rombel_nama, 'VII-A')
})
