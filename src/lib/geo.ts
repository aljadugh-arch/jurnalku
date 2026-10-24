// Ambil koordinat perangkat untuk validasi geolokasi (ceklok & "Masuk Kelas").
//
// Keluhan yang diperbaiki: "timeout" dan "jarak terlalu jauh padahal sudah di
// lokasi". Akar masalahnya:
//   1. `enableHighAccuracy: true` memaksa browser pakai GPS satelit. Di dalam
//      gedung GPS tidak bisa lock, sehingga `getCurrentPosition` timeout
//      (15-20 detik) lalu gagal. Guru tidak bisa ceklok sama sekali.
//   2. Tidak ada fallback ke posisi jaringan (WiFi/seluler), yang justru
//      bekerja di dalam gedung, walau akurasinya lebih kasar (20-200 m).
//
// Solusi: dua tahap —
//   1. Coba GPS presisi tinggi dulu (paling akurat di luar ruangan), beri waktu
//      singkat 8 detik sebelum menyerah.
//   2. Bila timeout/gagal, fallback ke posisi jaringan (bekerja di dalam
//      gedung).
// Akurasi tetap dikirim ke server; server yang memutuskan lolos/tidak dengan
// toleransi radius + akurasi (lihat server/geo-lock.cjs).
export interface PosisiPresisi {
  latitude: number
  longitude: number
  accuracy: number
}

function mintaPosisi(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(Object.assign(new Error('Perangkat tidak mendukung geolokasi'), { code: 0 }))
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  })
}

function kePosisi(pos: GeolocationPosition): PosisiPresisi {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : 0,
  }
}

function pesanGalat(err: any): string {
  if (err?.code === 1) return 'Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini lalu coba lagi.'
  if (err?.code === 2) return 'Lokasi tidak tersedia. Pastikan GPS/lokasi aktif dan Anda berada di area terbuka.'
  return 'Gagal membaca lokasi. Coba lagi di dekat jendela/area terbuka.'
}

export async function getCurrentPosition(): Promise<PosisiPresisi> {
  // Tahap 1: GPS presisi tinggi — akurat di luar ruangan, tapi sering timeout
  // di dalam gedung. Waktu singkat (8 detik) supaya guru tidak menunggu lama.
  try {
    return kePosisi(await mintaPosisi({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }))
  } catch (err) {
    // Izin ditolak (code 1): tidak ada gunanya fallback — langsung tolak.
    if ((err as any)?.code === 1) throw new Error(pesanGalat(err))
    // Timeout (code 3) / lokasi tak tersedia (code 2) → lanjut ke jaringan.
  }

  // Tahap 2: posisi jaringan (WiFi/seluler) — bekerja di dalam gedung, akurasi
  // 20-200 m. `maximumAge` kecil supaya tidak memakai cache yang terlalu lama.
  try {
    return kePosisi(await mintaPosisi({ enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 }))
  } catch (err) {
    throw new Error(pesanGalat(err))
  }
}
