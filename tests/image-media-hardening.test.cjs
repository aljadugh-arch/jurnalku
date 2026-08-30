const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const root = path.join(__dirname, '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const server = read('server/index.cjs')
const cashless = read('server/portal-cashless.cjs')
const tenant = read('server/tenant.cjs')
const sw = read('public/sw.js')
const imageMedia = read('server/image-media.cjs')
const { normalizeStoredImageDataUrl } = require('../server/portal-cashless.cjs')

test('server authoritatively decodes, validates, and compresses database image data URLs', async () => {
  const input = await sharp({ create: { width: 2600, height: 2100, channels: 4, background: { r: 20, g: 80, b: 160, alpha: 0.7 } } }).png().toBuffer()
  const dataUrl = `data:image/png;base64,${input.toString('base64')}`
  const output = await normalizeStoredImageDataUrl(dataUrl)
  assert.match(output, /^data:image\/webp;base64,/)
  const buffer = Buffer.from(output.split(',')[1], 'base64')
  const metadata = await sharp(buffer).metadata()
  assert.equal(metadata.format, 'webp')
  assert.ok(metadata.width <= 1920)
  assert.ok(metadata.height <= 1920)
  assert.ok(buffer.length < input.length)
  await assert.rejects(() => normalizeStoredImageDataUrl('data:image/webp;base64,UklGRg=='), /valid|diproses|gambar/i)
})

test('all cashless image paths await authoritative normalization including batch', () => {
  assert.match(cashless, /async function normalizeStoredImageDataUrl/)
  assert.match(cashless, /await normalizeBankTransferConfig\(req\.body\)/)
  assert.match(cashless, /await validateStaticQrisSubmission\(req\.body\)/)
  assert.match(cashless, /fotoValue = await normalizeStoredImageDataUrl\(foto/)
  assert.match(cashless, /foto = await normalizeStoredImageDataUrl\(it\.foto/)
})

test('posting uploads keep image bytes in memory until validation and compression succeed', () => {
  assert.match(server, /postingUpload = multer\(\{[\s\S]*?multer\.memoryStorage\(\)/)
  assert.match(server, /await savePostingUpload\(req\.file/)
  assert.match(server, /writeCompressedImage[\s\S]*?catch \(error\)[\s\S]*?rm\(destination/)
})

test('replacement image routes delete old tenant-owned files after successful writes', () => {
  for (const column of ['avatar', 'logo', 'background', 'foto']) assert.match(server, new RegExp(`removeManagedUpload\\([^)]*${column}`))
})

test('attendance selfie image data is normalized before database persistence', () => {
  assert.match(server, /app\.post\('\/api\/absensi-guru'[\s\S]*?normalizeStoredImageDataUrl\(foto_selfie/)
})

test('posting media are local managed uploads and removed when detached', () => {
  assert.match(server, /const safeMedia = Array\.isArray\(media\)/)
  assert.match(server, /JSON\.parse\(row\.media \|\| '\[\]'\)[\s\S]*?removeManagedUpload/)
})

test('tenant info reuses middleware resolution and service worker cache is invalidated', () => {
  assert.match(tenant, /registered_host: Boolean\(req\.isRegisteredTenantHost\)/)
  assert.doesNotMatch(tenant, /app\.get\('\/api\/tenant\/info'[\s\S]*?domain_custom = \?/)
  assert.doesNotMatch(sw, /jurnalku-v5/)
  assert.doesNotMatch(sw, /cache\.addAll\(\['\/'\]\)/)
  assert.match(tenant, /canonicalHost/)
})

test('image decoding has a hard pixel-resource limit and multi-image failures roll back writes', () => {
  assert.match(imageMedia, /limitInputPixels:/)
  assert.match(server, /Promise\.all\(savedPaths\.map\(file => fs\.promises\.rm/)
})
