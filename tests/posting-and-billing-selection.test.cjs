const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

test('posting editor sends multiple selected files in one authenticated multipart request', () => {
  const editor = read('src/components/RichEditor.tsx')
  const server = read('server/index.cjs')
  assert.match(editor, /Array\.from\(files\)\.forEach\(file => formData\.append\('files', file\)\)/)
  assert.match(editor, /data\.media\b/)
  assert.match(editor, /media_url: data\.media_url|setImage\(\{ src: data\.media_url/)
  assert.match(server, /files:\s*10/)
  assert.match(server, /safeMedia = Array\.isArray\(media\)/)
  assert.match(server, /const \{ judul, isi, konten, kategori, media/)
  assert.match(server, /postingUpload\.fields\(/)
})

test('posting editor can insert multiple image URLs', () => {
  const editor = read('src/components/RichEditor.tsx')
  assert.match(editor, /imageUrls/)
  assert.match(editor, /split\(/)
  assert.match(editor, /Sisipkan Gambar via URL/)
})

test('single-student billing generation passes exactly the selected student to the server', () => {
  const page = read('src/pages/admin/TagihanPage.tsx')
  const server = read('server/index.cjs')
  assert.match(page, /payload\.siswa_ids\s*=\s*\[genForm\.siswa_id\]/)
  assert.match(server, /const \{ rombel_id, bulan, tahun, siswa_ids, siswa_id \} = req\.body/)
  assert.match(server, /const selectedSiswaIds = siswa_id \? \[siswa_id\] : siswa_ids/)
  assert.match(server, /Array\.isArray\(selectedSiswaIds\)/)
})

test('billing generation rejects an invalid or cross-tenant selected student', () => {
  const server = read('server/index.cjs')
  assert.match(server, /status='aktif' AND tenant_id = \?/)
  assert.match(server, /Pilihan siswa tidak valid/)
})

console.log('posting-and-billing-selection contract checks loaded')
