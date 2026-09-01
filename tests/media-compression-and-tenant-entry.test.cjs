const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const root = path.join(__dirname, '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

const server = read('server/index.cjs')
const tenant = read('server/tenant.cjs')
const app = read('src/App.tsx')
const pwaTests = read('tests/pwa-install-lifecycle.test.cjs')
const clientImage = read('src/lib/image.ts')
const kantinPage = read('src/pages/admin/KantinMenuPage.tsx')
const qrisAdmin = read('src/pages/admin/CashlessBankConfigPage.tsx')
const qrisStudent = read('src/pages/siswa/SiswaQrisTopupPage.tsx')

const { compressImageBuffer } = require('../server/image-media.cjs')
const { normalizeStoredImageDataUrl } = require('../server/portal-cashless.cjs')

test('image compressor rotates, bounds dimensions, strips metadata, and emits webp', async () => {
  const input = await sharp({
    create: { width: 3200, height: 2400, channels: 4, background: { r: 20, g: 80, b: 160, alpha: 0.8 } }
  }).png({ compressionLevel: 0 }).withMetadata({ orientation: 6 }).toBuffer()
  const output = await compressImageBuffer(input)
  const info = await sharp(output).metadata()
  assert.equal(info.format, 'webp')
  assert.ok(info.width <= 1920)
  assert.ok(info.height <= 1920)
  assert.equal(info.orientation, undefined)
  assert.ok(output.length < input.length)
})

test('every server-side raster upload path passes through compression', () => {
  assert.match(server, /const \{ compressImageBuffer/)
  assert.match(server, /const imageUpload = multer\(\{\s*storage: multer\.memoryStorage\(\)/)
  for (const route of [
    '/api/auth/avatar', '/api/settings/logo', '/api/settings/background',
    '/api/siswa/:id/foto', '/api/gtk/:id/foto'
  ]) {
    assert.match(server, new RegExp(`app\\.post\\('${route.replaceAll('/', '\\/')}'.*compressUploadedImages`))
  }
  assert.match(server, /app\.post\('\/api\/settings\/kts-template'[\s\S]*?compressUploadedImages\(\['depan', 'belakang'\], 'kts'\)/)
  assert.match(server, /for \(const file of files\)[\s\S]*?await savePostingUpload\(file/)
  assert.match(server, /await saveDrawnSignature/)
  assert.match(server, /await saveUploadedSignature/)
})

test('database-backed image data URLs are compressed and bounded before submission', async () => {
  assert.match(clientImage, /export function imageFileToDataUrl/)
  for (const source of [kantinPage, qrisAdmin, qrisStudent]) assert.match(source, /imageFileToDataUrl\(/)
  assert.doesNotMatch(kantinPage, /readAsDataURL\(file\)/)
  assert.doesNotMatch(qrisAdmin, /readAsDataURL\(file\)/)
  assert.doesNotMatch(qrisStudent, /readAsDataURL\(file\)/)
  const input = await sharp({ create: { width: 12, height: 12, channels: 4, background: { r: 20, g: 80, b: 160, alpha: 1 } } }).png().toBuffer()
  const normalized = await normalizeStoredImageDataUrl(`data:image/png;base64,${input.toString('base64')}`)
  assert.match(normalized, /^data:image\/webp;base64,/)
  await assert.rejects(() => normalizeStoredImageDataUrl('https://example.test/image.jpg'), /gambar/i)
  await assert.rejects(() => normalizeStoredImageDataUrl('data:image/webp;base64,UklGRg=='), /valid|diproses/i)
  await assert.rejects(() => normalizeStoredImageDataUrl('data:image/webp;base64,' + 'A'.repeat(7_100_000)), /maksimal/i)
})

test('registered tenant hosts resolve explicitly and SPA/PWA open login', () => {
  assert.match(tenant, /req\.isRegisteredTenantHost = Boolean\(tenant\)/)
  assert.match(server, /start_url: req\.isRegisteredTenantHost \? '\/login' : '\/'/)

  assert.match(app, /<Route path="\/" element=\{<RootRoute \/>\}/)
  assert.match(app, /api\.get\('\/tenant\/info'\)/)
  assert.match(app, /if \(!registeredHost\) return <LandingPage \/>/)
  assert.match(tenant, /registered_host: Boolean\(req\.isRegisteredTenantHost\)/)
  assert.match(pwaTests, /start_url: req\\\.isRegisteredTenantHost/)
})

test('unknown and main hosts retain the public landing-page fallback', () => {
  assert.match(tenant, /req\.isRegisteredTenantHost = false/)
  assert.match(tenant, /Fallback to default tenant/)
  assert.match(app, /if \(!registeredHost\) return <LandingPage \/>/)
})
