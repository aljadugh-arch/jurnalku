const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

/*
 * Kelengkapan PWA (PWABuilder → APK Play Store) + SEO. Tes ini mengunci syarat
 * yang paling sering membuat audit PWABuilder GAGAL:
 *   1) manifest ditautkan di HTML mentah (bukan hanya disuntik JS),
 *   2) ada ikon 192 & 512 (plus versi maskable) yang benar-benar ada di disk,
 *   3) tujuan ikon dipisah 'any' / 'maskable' (entri gabungan dianggap tidak valid),
 *   4) ada screenshots dengan form_factor narrow & wide,
 *   5) service worker punya penangan push (notifikasi adzan saat app tertutup),
 *   6) server menyajikan robots.txt, sitemap.xml, dan mengganti blok SEO per-lembaga.
 */
const root = path.join(__dirname, '..')
const baca = (f) => fs.readFileSync(path.join(root, f), 'utf8')
const ada = (f) => fs.existsSync(path.join(root, f))

test('index.html: manifest ditautkan STATIS + penanda SEO + meta Apple', () => {
  const html = baca('index.html')
  assert.match(html, /<link id="pwa-manifest" rel="manifest" href="\/manifest\.json" \/>/)
  assert.match(html, /<!--SEO:START-->/)
  assert.match(html, /<!--SEO:END-->/)
  assert.match(html, /apple-touch-icon" sizes="180x180"/)
  assert.match(html, /apple-mobile-web-app-title/)
  assert.match(html, /og:image:width/)
  assert.match(html, /og:locale/)
  assert.match(html, /icon-512\.png/)
})

test('manifest statis: field wajib PWABuilder + tujuan ikon terpisah', () => {
  const m = JSON.parse(baca('public/manifest.webmanifest'))
  for (const k of ['name', 'short_name', 'description', 'start_url', 'scope', 'display', 'theme_color', 'background_color', 'lang', 'dir', 'icons', 'screenshots']) {
    assert.ok(m[k], `manifest harus punya ${k}`)
  }
  assert.equal(m.prefer_related_applications, false)
  assert.ok(Array.isArray(m.categories) && m.categories.length > 0)
  assert.ok(m.description.length > 20)
  // 512 wajib; tujuan tidak boleh digabung dalam satu entri.
  const ikon512 = m.icons.filter((i) => i.sizes === '512x512')
  assert.ok(ikon512.some((i) => i.purpose === 'any') && ikon512.some((i) => i.purpose === 'maskable'), 'butuh ikon 512 any & maskable')
  assert.ok(m.icons.every((i) => i.purpose === 'any' || i.purpose === 'maskable'), "purpose tidak boleh 'any maskable'")
  const faktor = m.screenshots.map((s) => s.form_factor).sort()
  assert.deepEqual(faktor, ['narrow', 'wide'])
})

test('ikon & screenshot benar-benar ada di disk dengan ukuran yang dijanjikan', async () => {
  const m = JSON.parse(baca('public/manifest.webmanifest'))
  const janji = [...m.icons, ...m.screenshots]
  for (const aset of janji) {
    const disk = path.join(root, 'public', aset.src.replace(/^\//, ''))
    assert.ok(fs.existsSync(disk), `${aset.src} harus ada di public/`)
    const meta = await sharp(disk).metadata()
    const [w, h] = aset.sizes.split('x').map(Number)
    assert.equal(meta.width, w, `${aset.src} lebar`)
    assert.equal(meta.height, h, `${aset.src} tinggi`)
  }
})

test('service worker: menangani push + klik notifikasi + pesan dari halaman', () => {
  const sw = baca('public/sw.js')
  assert.match(sw, /addEventListener\('push'/)
  assert.match(sw, /showNotification/)
  assert.match(sw, /addEventListener\('notificationclick'/)
  assert.match(sw, /addEventListener\('message'/)
  assert.match(sw, /jurnalku-v\d+/)
})

test('main.tsx: service worker selalu didaftarkan + manifest statis dipertahankan bila PWA lembaga mati', () => {
  const main = baca('src/main.tsx')
  assert.match(main, /daftarkanServiceWorker\(\)/)
  assert.doesNotMatch(main, /linkEl\?\.remove\(\)/, 'manifest statis tidak boleh dihapus')
  assert.doesNotMatch(main, /serviceWorker\.getRegistrations\(\)/, 'SW tidak boleh di-unregister')
})

test('robots.txt & sitemap.xml: berkas statis ada DAN route dinamis didaftarkan sebelum express.static', () => {
  // Dua lapis: berkas statis (dilayani Caddy langsung dari dist/) + route dinamis
  // per-domain di Node yang harus MENANG bila permintaan sampai ke Node.
  assert.ok(ada('public/robots.txt'), 'public/robots.txt harus ada')
  assert.ok(ada('public/sitemap.xml'), 'public/sitemap.xml harus ada')
  assert.ok(ada('public/manifest.json'), 'public/manifest.json harus ada')
  assert.match(baca('public/robots.txt'), /User-agent: \*/)
  assert.match(baca('public/sitemap.xml'), /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
  const s = baca('server/index.cjs')
  const iSitemap = s.indexOf("app.get('/sitemap.xml'")
  const iStatic = s.indexOf("app.use(express.static(path.join(__dirname, '..', 'dist')")
  assert.ok(iSitemap > 0 && iStatic > 0 && iSitemap < iStatic, 'route sitemap harus SEBELUM express.static')
})

test('server: robots.txt, sitemap.xml, dan injeksi SEO per-lembaga', () => {
  const s = baca('server/index.cjs')
  assert.match(s, /app\.get\('\/robots\.txt'/)
  assert.match(s, /app\.get\('\/sitemap\.xml'/)
  assert.match(s, /function renderIndexSeo/)
  assert.match(s, /<!--SEO:START-->\[\\s\\S\]\*\?<!--SEO:END-->/, 'server harus mengganti blok SEO')
  assert.match(s, /x-forwarded-proto/,'skema mengikuti proxy')
  assert.match(s, /Sitemap: \$\{base\}\/sitemap\.xml/)
})

test('server: route push (public-key/subscribe/unsubscribe/status/test) + hook penjadwal', () => {
  const s = baca('server/index.cjs')
  for (const r of ["'/api/push/public-key'", "'/api/push/subscribe'", "'/api/push/unsubscribe'", "'/api/push/status'", "'/api/push/test'"]) {
    assert.ok(s.includes(`app.${r.startsWith("'/api/push/status'") || r.startsWith("'/api/push/public-key'") ? 'get' : 'post'}(${r}`), `route ${r}`)
  }
  assert.match(s, /queueAdzanPush\(db, \{ tenantId, date, time \}\)/)
  assert.match(s, /adzanPush\.tenantBerlangganan\(db\)/)
  assert.match(s, /CREATE TABLE IF NOT EXISTS push_subscriptions/)
  assert.match(s, /CREATE TABLE IF NOT EXISTS app_config/)
  assert.match(s, /CREATE TABLE IF NOT EXISTS adzan_push_log/)
})

test('server: manifest dinamis diperkaya + ikon maskable', () => {
  const s = baca('server/index.cjs')
  assert.match(s, /purpose: 'maskable'/)
  assert.match(s, /maskable=1/)
  assert.ok(s.includes("form_factor: 'narrow'"), "screenshot narrow")
  assert.ok(s.includes("form_factor: 'wide'"), 'screenshot wide')
  assert.match(s, /lang: 'id', dir: 'ltr'/)
  assert.match(s, /prefer_related_applications: false/)
  assert.match(s, /const maskable = String\(req\.query\.maskable/)
})

test('klien: halaman Pengaturan punya kartu notifikasi perangkat (aktif/uji/mati)', () => {
  const p = baca('src/pages/admin/NotifSettingsPage.tsx')
  assert.match(p, /data-adzan-push-aktifkan="true"/)
  assert.match(p, /data-adzan-push-uji="true"/)
  assert.match(p, /data-adzan-push-matikan="true"/)
  assert.match(p, /data-adzan-push-badge="true"/)
  assert.match(p, /aktifkanPush|aktifkanNotifPerangkat/)
})

test('klien: AdzanNotifier memunculkan notifikasi sistem + periksa ulang saat app kembali ke depan', () => {
  const n = baca('src/components/AdzanNotifier.tsx')
  assert.match(n, /tampilkanNotifikasiLokal/)
  assert.match(n, /visibilitychange/)
  assert.match(n, /addEventListener\('focus', saatKembali\)/)
  assert.match(n, /addEventListener\('pageshow', saatKembali\)/)
})

test('klien: helper push memakai kunci publik server + endpoint yang benar', () => {
  const h = baca('src/lib/pushNotif.ts')
  assert.match(h, /api\.get\('\/push\/public-key'\)/)
  assert.match(h, /api\.post\('\/push\/subscribe'/)
  assert.match(h, /api\.post\('\/push\/unsubscribe'/)
  assert.match(h, /api\.post\('\/push\/test'/)
  assert.match(h, /pushManager\.subscribe/)
  assert.match(h, /urlBase64KeUint8/)
})

test('dua manifest statis (manifest.json + manifest.webmanifest) sinkron', () => {
  // index.html menautkan /manifest.json (agar Caddy kirim Content-Type application/json),
  // sementara tes & beberapa klien lama memakai /manifest.webmanifest. Keduanya harus
  // identik supaya audit PWABuilder tidak melihat dua bentuk berbeda.
  assert.ok(ada('public/manifest.json'), 'public/manifest.json harus ada')
  assert.ok(ada('public/manifest.webmanifest'), 'public/manifest.webmanifest harus ada')
  assert.equal(baca('public/manifest.json'), baca('public/manifest.webmanifest'))
})

test('server: Digital Asset Links (/.well-known/assetlinks.json) tidak pernah jadi HTML SPA', () => {
  const s = baca('server/index.cjs')
  // Route khusus: balas berkas JSON bila ada, kalau belum → 404 JSON (bukan index.html),
  // supaya verifikasi Google Play "Digital Asset Links" gagal dengan jelas.
  assert.match(s, /app\.get\('\/\.well-known\/assetlinks\.json'/)
  assert.match(s, /assetlinks\.json belum tersedia/)
  // Fallback SPA harus melewati /.well-known/*.
  assert.match(s, /req\.path\.startsWith\('\/\.well-known\/'\)/)
})

test('server: manifest dinamis (GET + regenerate) memakai satu pembangun', () => {
  const s = baca('server/index.cjs')
  assert.match(s, /function bangunManifestPwa\(req\)/)
  assert.match(s, /app\.get\('\/api\/pwa\/manifest',[\s\S]{0,120}bangunManifestPwa\(req\)/)
  assert.match(s, /app\.post\('\/api\/settings\/pwa-manifest', ADMIN,[\s\S]{0,120}bangunManifestPwa\(req\)/)
  assert.doesNotMatch(s, /purpose: 'any maskable'/, "manifest dinamis tidak boleh memakai 'any maskable'")
})
