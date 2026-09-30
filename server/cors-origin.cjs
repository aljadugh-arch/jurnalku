// Pemeriksa origin CORS.
//
// Dipisah dari index.cjs supaya bisa diuji tanpa memboot server, dan supaya
// penolakan origin selalu menjadi 403 — bukan 500 lewat error handler global.
// Perilaku izin dipertahankan persis seperti sebelumnya:
//   1. tanpa header Origin  -> izin (curl, same-origin, klien mobile)
//   2. bukan production     -> izin (dev)
//   3. origin ada di daftar -> izin
//   4. subdomain jurnal.cc.cd / jurnalmadrasah.web.id / cc.cd / web.id -> izin
//   5. host adalah domain kustom tenant aktif -> izin
//   6. selain itu           -> tolak dengan status 403
function buatPemeriksaOrigin({ allowedOrigins = [], isProd = true, cariTenantDomain = () => null } = {}) {
  const daftar = (Array.isArray(allowedOrigins) ? allowedOrigins : [])
    .map(s => String(s).trim()).filter(Boolean)
  const polaSubdomain = /^https:\/\/[a-z0-9][a-z0-9.-]+\.(jurnal\.cc\.cd|jurnalmadrasah\.web\.id|cc\.cd|web\.id)$/i

  return function periksaOrigin(origin, cb) {
    if (!origin) return cb(null, true) // curl / same-origin / mobile
    if (!isProd) return cb(null, true)
    if (daftar.includes(origin)) return cb(null, true)
    // termasuk multi-level: jurnal.mtsplussd7.cc.cd → ends with .cc.cd
    if (polaSubdomain.test(origin)) return cb(null, true)
    try {
      const host = String(origin).replace(/^https?:\/\//, '').split(':')[0].toLowerCase().replace(/\.$/, '')
      if (host && cariTenantDomain(host)) return cb(null, true)
    } catch {}
    const err = new Error('Origin tidak diizinkan oleh CORS: ' + origin)
    err.status = 403
    err.code = 'CORS_ORIGIN_DENIED'
    err.origin = origin
    return cb(err)
  }
}

module.exports = { buatPemeriksaOrigin }
