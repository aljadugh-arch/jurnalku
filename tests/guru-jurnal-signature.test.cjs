const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const jurnal = fs.readFileSync(path.join(root, 'src/pages/guru/GuruJurnalPage.tsx'), 'utf8')
const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')

const routeBlock = (signature) => {
  const start = server.indexOf(signature)
  assert.ok(start >= 0, `route ${signature} must exist`)
  const end = server.indexOf('\napp.', start + signature.length)
  return server.slice(start, end > start ? end : server.length)
}

test('journal schema and migration persist a tenant-scoped signature path and method', () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS jurnal_mengajar[\s\S]*signature_type TEXT/)
  assert.match(server, /CREATE TABLE IF NOT EXISTS jurnal_mengajar[\s\S]*signature_path TEXT/)
  assert.match(server, /\['jurnal_mengajar', 'signature_type'/)
  assert.match(server, /\['jurnal_mengajar', 'signature_path'/)
})

test('journal create validates and stores a drawn or uploaded image signature', () => {
  const block = routeBlock("app.post('/api/jurnal', STAFF")
  assert.match(block, /signature_type/)
  assert.match(block, /signature_data/)
  assert.match(block, /signature_type && !\['drawn', 'upload'\]\.includes\(signature_type\)/)
  assert.match(server, /signatureUpload/)
  assert.match(block, /signature_path/)
  assert.match(block, /req\.tenantId/)
  assert.match(server, /crypto\.randomBytes/)
  assert.match(server, /isValidSignatureImage/)
  assert.match(server, /fileSize: 5 \* 1024 \* 1024/)
  assert.match(server, /SIGNATURE_DIR/)
  assert.match(block, /INSERT INTO jurnal_mengajar \(id, guru_id, mapel_id, rombel_id, tanggal, jam_ke, materi, kegiatan, catatan, status, signature_type, signature_path, tenant_id\)/)
})

test('teacher journal UI offers explicit drawing and photo upload choices', () => {
  assert.match(jurnal, /Tanda Tangan Guru/)
  assert.match(jurnal, /Gambar di layar/)
  assert.match(jurnal, /Upload foto/)
  assert.match(jurnal, /canvas/)
  assert.match(jurnal, /accept="image\/png,image\/jpeg,image\/webp"/)
  assert.match(jurnal, /setSignatureType\('drawn'\)/)
  assert.match(jurnal, /setSignatureType\('upload'\)/)
  assert.match(jurnal, /signature_data: signatureType === 'drawn' \? signatureData : ''/)
})

test('teacher journal UI validates file type and size before reading the signature image', () => {
  assert.match(jurnal, /5 \* 1024 \* 1024/)
  assert.match(jurnal, /image\/(png|jpeg|webp)/)
  assert.match(jurnal, /setSignatureFile\(file\)/)
  assert.match(jurnal, /Ukuran file maksimal 5 MB/)
})

test('journal list exposes signature metadata for later detail and print views', () => {
  const block = routeBlock("app.get('/api/jurnal/me'")
  assert.match(block, /SELECT j\.\*/)
  assert.match(server, /signature_type TEXT/)
  assert.match(server, /signature_path TEXT/)
})
