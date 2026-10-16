// Menu Administrasi (surat-menyurat) — uji inti tanpa HTTP.
// Fokus: seed jenis bawaan idempoten, penomoran surat berurutan + format,
// render template dengan placeholder + escape HTML (data klien tidak dipercaya).

const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const crypto = require('node:crypto')

const {
  setupAdministrasiTables, seedJenisBawaan, JENIS_BAWAAN, daftarJenis, barisJenis,
  nomorSuratBaru, renderTemplate, buildSuratHtml,
} = require('../server/administrasi.cjs')

const TENANT = 'tenant-uji'
const makeId = () => crypto.randomUUID()

function makeDb() {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE tenants (id TEXT PRIMARY KEY, nama TEXT)')
  db.exec('CREATE TABLE settings (id TEXT PRIMARY KEY, tenant_id TEXT, nama_lembaga TEXT, alamat TEXT, kepala_sekolah TEXT, kota_cetak TEXT, nip_kepala TEXT)')
  db.prepare('INSERT INTO tenants (id, nama) VALUES (?,?)').run(TENANT, 'MI Uji')
  db.prepare('INSERT INTO settings (id, tenant_id, nama_lembaga, alamat, kepala_sekolah, kota_cetak, nip_kepala) VALUES (?,?,?,?,?,?,?)')
    .run(`main_${TENANT}`, TENANT, 'MI Miftahul Uji', 'Jl. Uji No. 1', 'H. Ahmad Fauzi', 'Bondowoso', '19700101')
  setupAdministrasiTables(db)
  return db
}

test('seed jenis bawaan lengkap 5 jenis surat dan idempoten', () => {
  const db = makeDb()
  seedJenisBawaan(db, TENANT, makeId)
  const pertama = daftarJenis(db, TENANT)
  assert.equal(pertama.length, 5)
  assert.deepEqual(pertama.map(j => j.kode), ['SK-SISWA', 'SK-GURU', 'ST', 'SU', 'SPPD'])

  seedJenisBawaan(db, TENANT, makeId) // panggilan kedua tidak menggandakan
  assert.equal(daftarJenis(db, TENANT).length, 5)
  assert.equal(JENIS_BAWAAN.length, 5)
})

test('fields jenis tersimpan sebagai JSON dan dibaca sebagai array', () => {
  const db = makeDb()
  seedJenisBawaan(db, TENANT, makeId)
  const jenis = daftarJenis(db, TENANT).find(j => j.kode === 'SK-SISWA')
  assert.ok(Array.isArray(jenis.fields))
  assert.ok(jenis.fields.some(f => f.key === 'nisn'))
  assert.match(jenis.template, /\{\{nama\}\}/)
})

test('nomor surat berurutan per jenis & tahun dengan format 001/KODE/BULAN_ROMAWI/TAHUN', () => {
  const db = makeDb()
  const a = nomorSuratBaru(db, TENANT, 'SK-SISWA', '2026-10-16')
  const b = nomorSuratBaru(db, TENANT, 'SK-SISWA', '2026-10-20')
  const c = nomorSuratBaru(db, TENANT, 'SK-GURU', '2026-10-20')
  assert.equal(a, '001/SK-SISWA/X/2026')
  assert.equal(b, '002/SK-SISWA/X/2026')
  assert.equal(c, '001/SK-GURU/X/2026')
  // tahun baru -> counter reset
  assert.equal(nomorSuratBaru(db, TENANT, 'SK-SISWA', '2027-01-05'), '001/SK-SISWA/I/2027')
})

test('render template mengisi placeholder dan meng-escape HTML dari data klien', () => {
  const out = renderTemplate('Halo {{nama}} [{{x}}]', { nama: 'Budi', x: '<b>' })
  assert.equal(out, 'Halo Budi [&lt;b&gt;]')
  // placeholder tak dikenal jadi kosong, bukan "undefined"
  assert.equal(renderTemplate('NIP: {{nip}}', {}), 'NIP: ')
})

test('buildSuratHtml memuat kop, nomor, data field, dan blok tanda tangan', () => {
  const db = makeDb()
  seedJenisBawaan(db, TENANT, makeId)
  const jenis = barisJenis(db.prepare('SELECT * FROM surat_jenis WHERE tenant_id=? AND kode=?').get(TENANT, 'SK-SISWA'))
  const surat = {
    nomor: '001/SK-SISWA/X/2026',
    tanggal: '2026-10-16',
    data: JSON.stringify({ nama: 'Siti Aminah', nisn: '007123', ttl: 'Bondowoso, 1 Januari 2012', kelas: 'VI', alamat: 'Jl. Mawar 3', keperluan: 'melanjutkan sekolah' }),
  }
  const html = buildSuratHtml({ jenis, surat, settings: db.prepare('SELECT * FROM settings WHERE tenant_id=?').get(TENANT) })
  assert.match(html, /^<!doctype html>/i)
  assert.match(html, /MI Miftahul Uji/)
  assert.match(html, /Nomor: 001\/SK-SISWA\/X\/2026/)
  assert.match(html, /Siti Aminah/)
  assert.match(html, /H\. Ahmad Fauzi/)
  assert.match(html, /16 Oktober 2026/)
})

test('nama siswa berisi tag HTML tidak dieksekusi (escaped) — tidak ada tag mentah', () => {
  const db = makeDb()
  seedJenisBawaan(db, TENANT, makeId)
  const jenis = barisJenis(db.prepare('SELECT * FROM surat_jenis WHERE tenant_id=? AND kode=?').get(TENANT, 'SK-SISWA'))
  const html = buildSuratHtml({
    jenis,
    surat: { nomor: '001/SK-SISWA/X/2026', tanggal: '2026-10-16', data: JSON.stringify({ nama: '<script>alert(1)</script>' }) },
    settings: { nama_lembaga: 'MI Uji' },
  })
  assert.ok(!/<script>alert/.test(html), 'tag <script> tidak boleh mentah di HTML')
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
})