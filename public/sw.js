const CACHE = 'jurnalku-v10'

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(() => self.skipWaiting())
))

self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE && key.startsWith('jurnalku-')).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
))

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  const pathname = url.pathname
  if (pathname.startsWith('/api/') || pathname === '/sw.js' || pathname.includes('/manifest')) return
  const cacheable = event.request.mode === 'navigate' || event.request.destination === 'script' || event.request.destination === 'style' || event.request.destination === 'image' || event.request.destination === 'font'
  if (!cacheable) return
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && response.type !== 'opaque') {
      const copy = response.clone()
      void caches.open(CACHE).then(cache => cache.put(event.request, copy))
    }
    return response
  }).catch(() => caches.match(event.request).then(response => response || caches.match('/'))))
})

// ==================== NOTIFIKASI (Web Push) ====================
// Notifikasi adzan dikirim server (server/adzan-push.cjs) supaya tetap sampai saat
// aplikasi tertutup — di HP/tablet timer di halaman ditangguhkan begitu tab
// di-latar atau layar mati, jadi jalur push inilah yang benar-benar berfungsi.
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'JURNALKU', body: event.data ? event.data.text() : '' } }
  const adzan = data.type === 'adzan'
  const title = data.title || (adzan ? 'Waktu sholat telah masuk' : 'JURNALKU')
  const options = {
    body: data.body || '',
    tag: data.tag || 'jurnalku',
    renotify: true,
    requireInteraction: adzan,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: adzan ? [200, 100, 200, 100, 400] : [120],
    silent: false,
    data: { url: data.url || '/', type: data.type || '', waktu: data.waktu || '' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Tampilkan notifikasi dari halaman (dipakai saat aplikasi terbuka & timer
// halaman sempat berjalan) agar pesan yang sama juga muncul di baki sistem.
self.addEventListener('message', event => {
  const d = event.data || {}
  if (d.type !== 'adzan-show' && d.type !== 'notif-show') return
  const adzan = d.type === 'adzan-show'
  event.waitUntil(self.registration.showNotification(d.title || 'JURNALKU', {
    body: d.body || '',
    tag: d.tag || 'jurnalku-lokal',
    renotify: true,
    requireInteraction: adzan,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: d.url || '/' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const daftar = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of daftar) {
      if ('focus' in c) {
        await c.focus()
        if ('navigate' in c) { try { await c.navigate(target) } catch { /* lintas-origin diabaikan */ } }
        return
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target)
  })())
})
