const CACHE = 'jurnalku-v6'

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
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && response.type !== 'opaque') {
      const copy = response.clone()
      void caches.open(CACHE).then(cache => cache.put(event.request, copy))
    }
    return response
  }).catch(() => caches.match(event.request).then(response => response || caches.match('/'))))
})
