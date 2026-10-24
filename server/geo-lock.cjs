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

// Batas akurasi GPS yang masih dianggap masuk akal (meter).
//
// 200 m: di atas ini posisi dianggap tidak layak untuk penegakan radius. Batas
// ini SENGAJA terbatas — toleransi besar (mis. 500 m) membuka celah: siapa pun
// bisa mengirim `accuracy: 5000` dan lolos dari jarak ratusan meter. Akurasi
// hanya dipakai sebagai koreksi kecil atas keterbatasan alat, bukan sebagai izin.
//
// Kenapa 200 (naik dari 60): posisi dalam gedung — satu-satunya yang didapat
// lewat fallback jaringan (WiFi/seluler) — wajar melaporkan akurasi 100-200 m.
// Membatasi ke 60 m membuat guru yang SUDAH berdiri di lokasinya tetap ditolak
// karena toleransinya dipotong lebih kecil dari ketidakpastian alatnya sendiri.
// 200 m masih jauh di bawah "bisa memalsukan posisi" (accuracy: 5000 tidak
// meloloskan apa pun), jadi keamanan penegakan radius tetap terjaga.
const AKURASI_MAKS = 200

// Toleransi akurasi: GPS perangkat melaporkan sendiri tingkat ketelitiannya
// (coords.accuracy). Jarak ukur tidak pernah lebih tepat dari itu. Tanpa
// toleransi, radius 10 m mustahil dipenuhi karena HP biasa meleset 10-30 m
// bahkan ketika berdiri tepat di titik kelas — inilah keluhan "sudah di tempat
// yang sama tapi tetap di luar radius".
//
// Aturan: lolos bila `jarak <= radius + akurasi`. Akurasi dibatasi agar tidak
// bisa dipakai memalsukan posisi (akurasi 5000 m tidak boleh meloloskan apa pun).
function toleransiAkurasi(accuracy) {
  const a = Number(accuracy)
  if (!Number.isFinite(a) || a <= 0) return 0
  return Math.min(a, AKURASI_MAKS)
}

// Membulatkan pesan agar mudah dibaca guru.
// Frasa "di luar area kelas" / "Di luar radius sekolah" dipertahankan karena
// sudah dipakai di UI & tes; detail jarak/akurasi ditambahkan setelahnya.
function pesanLuar(scope, d, radius, akurasi) {
  const tol = toleransiAkurasi(akurasi)
  const total = Math.round(radius + tol)
  const ketAkurasi = tol > 0 ? `, akurasi GPS ±${Math.round(tol)}m` : ''
  const ketScope = scope === 'rombel' ? 'titik kelas' : 'titik sekolah'
  const awalan = scope === 'rombel' ? 'Anda di luar area kelas ini' : 'Di luar radius sekolah'
  // Saran yang bisa ditindaklanjuti: akurasi buruk BUKAN salah guru, jadi jangan
  // hanya menyuruh "mendekat" kalau masalahnya sinyal.
  const saran = Number(akurasi) > AKURASI_MAKS
    ? ' Sinyal GPS lemah — coba di dekat jendela atau ruang terbuka.'
    : ' Mendekatlah ke lokasi tersebut.'
  return `${awalan} (${Math.round(d)}m dari ${ketScope}${ketAkurasi}; batas ${Math.round(radius)}m + toleransi = ${total}m).${saran}`
}

// Radius kelas di bawah nilai ini tidak bisa dipenuhi GPS ponsel biasa.
//
// Browser melaporkan coords.accuracy 10-40 m bahkan saat berdiri diam di ruang
// terbuka; di dalam gedung bisa 50-100 m. Radius 10 m karena itu membuat guru
// yang SUDAH berada di kelasnya tetap ditolak — bukan karena salah posisi,
// tetapi karena alatnya tidak mampu sepresisi itu. Nilai ini adalah lantai
// (floor), bukan pengganti radius admin: kalau admin mengisi 10 m, sistem
// memakai 25 m agar penegakan tetap masuk akal.
const RADIUS_MIN = 25

// Mengembalikan {ok:true, scope, distance?, radius?, accuracy?, toleransi?} atau
// {ok:false, status, error, distance?, radius?}.
// Penting: bila rombel TIDAK mengaktifkan geo_lock, tidak ada penegakan sama
// sekali (perilaku lama) — supaya guru tidak terkunci karena GPS belum diizinkan.
function validateClassGeo(db, tenantId, rombelId, latitude, longitude, accuracy) {
  const rombel = db.prepare('SELECT geo_latitude, geo_longitude, geo_radius, geo_lock FROM rombel WHERE id=? AND tenant_id=?').get(rombelId, tenantId)
  const lockOn = rombel && Number(rombel.geo_lock) === 1
  if (!lockOn) return { ok: true, scope: 'none' }

  const lat = Number(latitude), lng = Number(longitude)
  const adaKoordinat = Number.isFinite(lat) && Number.isFinite(lng)

  // Lock aktif: titik kelas diisi -> pakai radius kelas.
  if (rombel.geo_latitude != null && rombel.geo_longitude != null) {
    if (!adaKoordinat) return { ok: false, status: 400, error: 'Lokasi tidak terbaca — izinkan akses lokasi lalu coba lagi.' }
    const d = haversineMeters(lat, lng, Number(rombel.geo_latitude), Number(rombel.geo_longitude))
    const radius = Math.max(RADIUS_MIN, Number(rombel.geo_radius || 50))
    const tol = toleransiAkurasi(accuracy)
    if (d > radius + tol) {
      return {
        ok: false, status: 400,
        error: pesanLuar('rombel', d, radius, accuracy),
        distance: Math.round(d), radius, accuracy: Math.round(tol) || undefined,
      }
    }
    return { ok: true, scope: 'rombel', distance: Math.round(d), radius, accuracy: Math.round(tol) || undefined, toleransi: Math.round(tol) }
  }

  // Lock aktif tapi koordinat kelas belum diisi -> jatuh ke geofence sekolah.
  const geo = getTenantSettings(db, tenantId, 'geo_latitude, geo_longitude, geo_radius')
  if (geo && geo.geo_latitude != null && geo.geo_longitude != null) {
    if (!adaKoordinat) return { ok: false, status: 400, error: 'Lokasi tidak terbaca — izinkan akses lokasi lalu coba lagi.' }
    const d = haversineMeters(lat, lng, Number(geo.geo_latitude), Number(geo.geo_longitude))
    const radius = Math.max(RADIUS_MIN, Number(geo.geo_radius || 200))
    const tol = toleransiAkurasi(accuracy)
    if (d > radius + tol) {
      return {
        ok: false, status: 400,
        error: pesanLuar('sekolah', d, radius, accuracy),
        distance: Math.round(d), radius, accuracy: Math.round(tol) || undefined,
      }
    }
    return { ok: true, scope: 'sekolah', distance: Math.round(d), radius, accuracy: Math.round(tol) || undefined, toleransi: Math.round(tol) }
  }

  // Lock aktif tapi tak ada koordinat kelas maupun sekolah -> tak bisa menolak.
  return { ok: true, scope: 'none' }
}

module.exports = { haversineMeters, validateClassGeo, toleransiAkurasi, AKURASI_MAKS, RADIUS_MIN }
