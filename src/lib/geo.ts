// Ambil koordinat perangkat (untuk validasi lock geolokasi "Masuk Kelas").
export function getCurrentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Perangkat tidak mendukung geolokasi'))
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => reject(new Error(err.message || 'Gagal mengambil lokasi')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    )
  })
}
