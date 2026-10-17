// Ambil koordinat perangkat (untuk validasi lock geolokasi "Masuk Kelas").
//
// Perbaikan presisi (keluhan: "di tempat yang sama dengan penanda rombel tapi
// tetap terdeteksi di luar radius"):
//  1. `maximumAge: 0` — JANGAN pakai koordinat cache. Dulu 30000 ms, sehingga
//     guru yang berjalan dari kantor ke kelas masih mengirim posisi LAMA (kantor)
//     dan ditolak server. Posisi harus dibaca segar setiap kali.
//  2. `accuracy` ikut dikirim ke server. GPS HP wajar meleset 10-30 m, jadi
//     server harus memakai toleransi (jarak <= radius + akurasi). Tanpa ini,
//     radius 10 m mustahil dipenuhi di dalam ruangan.
//  3. `timeout` diperpanjang: pembacaan presisi (GPS, bukan jaringan) butuh
//     waktu lebih lama; timeout pendek memaksa browser jatuh ke lokasi kasar.
export interface PosisiPresisi {
  latitude: number
  longitude: number
  accuracy: number
}

export function getCurrentPosition(): Promise<PosisiPresisi> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Perangkat tidak mendukung geolokasi'))
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : 0,
      }),
      err => {
        const pesan = err.code === 1
          ? 'Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini lalu coba lagi.'
          : err.code === 2
            ? 'Lokasi tidak tersedia. Pastikan GPS aktif dan Anda berada di area terbuka.'
            : 'Gagal membaca lokasi (timeout). Coba lagi di dekat jendela/area terbuka.'
        reject(new Error(pesan))
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  })
}
