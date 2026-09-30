// Regresi: migrasi UNIQUE global -> komposit per-tenant dulu menulis ulang tabel
// siswa dengan daftar kolom hardcoded, sehingga kolom yang ditambahkan migrasi
// lain (biodata ayah/ibu/wali) hilang dan impor siswa gagal di DB baru.
const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Database = require('better-sqlite3')

const root = path.join(__dirname, '..')
const KOLOM_BIODATA = ['nik', 'nama_panggilan', 'agama', 'status_keluarga', 'anak_ke', 'asal_sekolah',
  'nama_ayah', 'nama_ibu', 'alamat_ortu', 'kerja_ayah', 'kerja_ibu', 'nama_wali', 'kerja_wali']

function buatDbLama(file) {
  const db = new Database(file)
  db.exec(`
    CREATE TABLE siswa (
      id TEXT PRIMARY KEY, nik TEXT, nis TEXT UNIQUE NOT NULL, nisn TEXT, nama TEXT NOT NULL,
      jenis_kelamin TEXT NOT NULL, tempat_lahir TEXT, tanggal_lahir TEXT, alamat TEXT, no_hp TEXT,
      nama_ortu TEXT, rombel_id TEXT, foto TEXT, status TEXT DEFAULT 'aktif',
      created_at TEXT DEFAULT (datetime('now')), tenant_id TEXT DEFAULT 'default'
    );
    INSERT INTO siswa (id, nis, nama, jenis_kelamin, tenant_id) VALUES ('s1', '1001', 'Ahmad Fauzi', 'L', 'default');
  `)
  db.close()
}

test('migrasi UNIQUE per-tenant mempertahankan kolom biodata dan data siswa', async () => {
  const file = path.join(os.tmpdir(), `jurnalku-migrasi-${process.pid}-${Date.now()}.db`)
  buatDbLama(file)
  const port = 39000 + Math.floor(Math.random() * 900)
  const proc = spawn(process.execPath, ['server/index.cjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DB_PATH: file, JWT_SECRET: 'x'.repeat(40), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  proc.stdout.on('data', d => { out += d.toString() })
  proc.stderr.on('data', d => { out += d.toString() })
  try {
    const batas = Date.now() + 30000
    while (Date.now() < batas && !out.includes('JURNALKU API Server running')) {
      await new Promise(r => setTimeout(r, 200))
    }
    assert.ok(out.includes('JURNALKU API Server running'), 'server harus start:\n' + out.slice(-800))
    assert.ok(!/migrate (siswa|gtk|mapel) unique failed/.test(out), 'migrasi UNIQUE tidak boleh gagal:\n' + out.slice(-800))

    const db = new Database(file, { readonly: true })
    const cols = db.prepare('PRAGMA table_info(siswa)').all().map(c => c.name)
    const idx = db.prepare('PRAGMA index_list(siswa)').all()
    const row = db.prepare("SELECT nis, nama, agama, nama_ayah FROM siswa WHERE id='s1'").get()
    db.close()

    for (const c of KOLOM_BIODATA) assert.ok(cols.includes(c), `kolom ${c} harus bertahan setelah recreate`)
    assert.ok(cols.includes('created_at'), 'kolom created_at harus bertahan')
    assert.equal(row.nama, 'Ahmad Fauzi', 'data siswa tidak boleh hilang')
    assert.equal(row.nis, '1001')
    assert.ok(idx.some(i => i.name === 'idx_siswa_nis_tenant'), 'index komposit per-tenant harus dibuat')
    assert.ok(!idx.some(i => i.unique && i.origin === 'u'), 'UNIQUE global pada nis harus hilang')
  } finally {
    proc.kill('SIGKILL')
    for (const f of [file, `${file}-wal`, `${file}-shm`]) { try { fs.unlinkSync(f) } catch { /* sudah bersih */ } }
  }
})
