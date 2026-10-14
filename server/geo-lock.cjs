// Lock geolokasi "Masuk Kelas" — logika murni, dapat diuji tanpa HTTP.
// Prioritas: lock geolokasi rombel (bila geo_lock=1 dan koordinat kelas diisi),
// fallback ke geofence sekolah (settings.geo_latitude/longitude/radius).
const { getTenantSettings } = require('./tenant-settings.cjs')

// Jarak meter antara dua koordinat (haversine).
function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = v => v * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Mengembalikan {ok:true, scope, distance?, radius?} atau {ok:false, status, error, distance?, radius?}.
// Penting: bila rombel TIDAK mengaktifkan geo_lock, tidak ada penegakan sama
// sekali (perilaku lama) — supaya guru tidak terkunci karena GPS belum diizinkan.
function validateClassGeo(db, tenantId, rombelId, latitude, longitude) {
  const rombel = db.prepare('SELECT geo_latitude, geo_longitude, geo_radius, geo_lock FROM rombel WHERE id=? AND tenant_id=?').get(rombelId, tenantId)
  const lockOn = rombel && Number(rombel.geo_lock) === 1
  if (!lockOn) return { ok: true, scope: 'none' }
  // Lock aktif: titik kelas diisi -> pakai radius kelas.
  if (rombel.geo_latitude != null && rombel.geo_longitude != null) {
    const lat = Number(latitude), lng = Number(longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, status: 400, error: 'Lokasi tidak terbaca — izinkan akses lokasi lalu coba lagi.' }
    const d = haversineMeters(lat, lng, Number(rombel.geo_latitude), Number(rombel.geo_longitude))
    const radius = Number(rombel.geo_radius || 50)
    if (d > radius) return { ok: false, status: 400, error: `Anda di luar area kelas ini (${Math.round(d)}m dari titik kelas, maksimal ${radius}m). Mendekatlah ke ruang kelas.`, distance: Math.round(d), radius }
    return { ok: true, scope: 'rombel', distance: Math.round(d), radius }
  }
  // Lock aktif tapi koordinat kelas belum diisi -> jatuh ke geofence sekolah.
  const geo = getTenantSettings(db, tenantId, 'geo_latitude, geo_longitude, geo_radius')
  if (geo && geo.geo_latitude != null && geo.geo_longitude != null) {
    const lat = Number(latitude), lng = Number(longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, status: 400, error: 'Lokasi tidak terbaca — izinkan akses lokasi lalu coba lagi.' }
    const d = haversineMeters(lat, lng, Number(geo.geo_latitude), Number(geo.geo_longitude))
    const radius = Number(geo.geo_radius || 200)
    if (d > radius) return { ok: false, status: 400, error: `Di luar radius sekolah (${Math.round(d)}m)`, distance: Math.round(d), radius }
    return { ok: true, scope: 'sekolah', distance: Math.round(d), radius }
  }
  // Lock aktif tapi tak ada koordinat kelas maupun sekolah -> tak bisa menolak.
  return { ok: true, scope: 'none' }
}

module.exports = { haversineMeters, validateClassGeo }
