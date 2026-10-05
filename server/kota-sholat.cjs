'use strict'

// Daftar kota untuk jadwal sholat: nama + koordinat + offset zona waktu (jam).
// Dipakai sebagai pilihan cepat di Pengaturan; admin tetap bisa mengisi
// lintang/bujur sendiri bila kotanya tidak ada di daftar. Offset zona waktu
// Indonesia: WIB +7, WITA +8, WIT +9.
const KOTA_SHOLAT = [
  // Jawa (WIB)
  { nama: 'Jakarta', provinsi: 'DKI Jakarta', lat: -6.2088, lng: 106.8456, tz: 7 },
  { nama: 'Surabaya', provinsi: 'Jawa Timur', lat: -7.2575, lng: 112.7521, tz: 7 },
  { nama: 'Bandung', provinsi: 'Jawa Barat', lat: -6.9175, lng: 107.6191, tz: 7 },
  { nama: 'Semarang', provinsi: 'Jawa Tengah', lat: -6.9932, lng: 110.4203, tz: 7 },
  { nama: 'Yogyakarta', provinsi: 'DI Yogyakarta', lat: -7.7956, lng: 110.3695, tz: 7 },
  { nama: 'Malang', provinsi: 'Jawa Timur', lat: -7.9666, lng: 112.6326, tz: 7 },
  { nama: 'Tuban', provinsi: 'Jawa Timur', lat: -6.8976, lng: 112.0648, tz: 7 },
  { nama: 'Bojonegoro', provinsi: 'Jawa Timur', lat: -7.1502, lng: 111.8817, tz: 7 },
  { nama: 'Gresik', provinsi: 'Jawa Timur', lat: -7.1539, lng: 112.6561, tz: 7 },
  { nama: 'Sidoarjo', provinsi: 'Jawa Timur', lat: -7.4478, lng: 112.7183, tz: 7 },
  { nama: 'Mojokerto', provinsi: 'Jawa Timur', lat: -7.4708, lng: 112.4338, tz: 7 },
  { nama: 'Jombang', provinsi: 'Jawa Timur', lat: -7.5463, lng: 112.2262, tz: 7 },
  { nama: 'Lamongan', provinsi: 'Jawa Timur', lat: -7.1183, lng: 112.4167, tz: 7 },
  { nama: 'Madiun', provinsi: 'Jawa Timur', lat: -7.6298, lng: 111.5239, tz: 7 },
  { nama: 'Kediri', provinsi: 'Jawa Timur', lat: -7.8480, lng: 112.0178, tz: 7 },
  { nama: 'Blitar', provinsi: 'Jawa Timur', lat: -8.0955, lng: 112.1609, tz: 7 },
  { nama: 'Pasuruan', provinsi: 'Jawa Timur', lat: -7.6469, lng: 112.9075, tz: 7 },
  { nama: 'Probolinggo', provinsi: 'Jawa Timur', lat: -7.7543, lng: 113.2159, tz: 7 },
  { nama: 'Banyuwangi', provinsi: 'Jawa Timur', lat: -8.2192, lng: 114.3691, tz: 7 },
  { nama: 'Jember', provinsi: 'Jawa Timur', lat: -8.1689, lng: 113.7020, tz: 7 },
  { nama: 'Bondowoso', provinsi: 'Jawa Timur', lat: -7.9135, lng: 113.8213, tz: 7 },
  { nama: 'Situbondo', provinsi: 'Jawa Timur', lat: -7.7061, lng: 114.0092, tz: 7 },
  { nama: 'Lumajang', provinsi: 'Jawa Timur', lat: -8.1335, lng: 113.2247, tz: 7 },
  { nama: 'Magetan', provinsi: 'Jawa Timur', lat: -7.6495, lng: 111.3263, tz: 7 },
  { nama: 'Ngawi', provinsi: 'Jawa Timur', lat: -7.4098, lng: 111.4461, tz: 7 },
  { nama: 'Ponorogo', provinsi: 'Jawa Timur', lat: -7.8656, lng: 111.4667, tz: 7 },
  { nama: 'Pacitan', provinsi: 'Jawa Timur', lat: -8.1945, lng: 111.1004, tz: 7 },
  { nama: 'Trenggalek', provinsi: 'Jawa Timur', lat: -8.0500, lng: 111.7086, tz: 7 },
  { nama: 'Tulungagung', provinsi: 'Jawa Timur', lat: -8.0657, lng: 111.9025, tz: 7 },
  { nama: 'Nganjuk', provinsi: 'Jawa Timur', lat: -7.6051, lng: 111.9018, tz: 7 },
  { nama: 'Sumenep', provinsi: 'Jawa Timur', lat: -7.0062, lng: 113.8565, tz: 7 },
  { nama: 'Pamekasan', provinsi: 'Jawa Timur', lat: -7.1568, lng: 113.4746, tz: 7 },
  { nama: 'Sampang', provinsi: 'Jawa Timur', lat: -7.1893, lng: 113.2413, tz: 7 },
  { nama: 'Bangkalan', provinsi: 'Jawa Timur', lat: -7.0455, lng: 112.7374, tz: 7 },
  { nama: 'Cirebon', provinsi: 'Jawa Barat', lat: -6.7320, lng: 108.5523, tz: 7 },
  { nama: 'Bekasi', provinsi: 'Jawa Barat', lat: -6.2383, lng: 106.9756, tz: 7 },
  { nama: 'Tangerang', provinsi: 'Banten', lat: -6.1783, lng: 106.6319, tz: 7 },
  { nama: 'Serang', provinsi: 'Banten', lat: -6.1104, lng: 106.1503, tz: 7 },
  { nama: 'Solo', provinsi: 'Jawa Tengah', lat: -7.5755, lng: 110.8243, tz: 7 },
  { nama: 'Magelang', provinsi: 'Jawa Tengah', lat: -7.4698, lng: 110.2177, tz: 7 },
  { nama: 'Purwokerto', provinsi: 'Jawa Tengah', lat: -7.4249, lng: 109.2396, tz: 7 },
  { nama: 'Tegal', provinsi: 'Jawa Tengah', lat: -6.8694, lng: 109.1402, tz: 7 },
  { nama: 'Pekalongan', provinsi: 'Jawa Tengah', lat: -6.8886, lng: 109.6753, tz: 7 },
  // Sumatra (WIB)
  { nama: 'Medan', provinsi: 'Sumatera Utara', lat: 3.5952, lng: 98.6722, tz: 7 },
  { nama: 'Pekanbaru', provinsi: 'Riau', lat: 0.5071, lng: 101.4478, tz: 7 },
  { nama: 'Padang', provinsi: 'Sumatera Barat', lat: -0.9471, lng: 100.4172, tz: 7 },
  { nama: 'Palembang', provinsi: 'Sumatera Selatan', lat: -2.9761, lng: 104.7754, tz: 7 },
  { nama: 'Jambi', provinsi: 'Jambi', lat: -1.6101, lng: 103.6131, tz: 7 },
  { nama: 'Bengkulu', provinsi: 'Bengkulu', lat: -3.7928, lng: 102.2608, tz: 7 },
  { nama: 'Bandar Lampung', provinsi: 'Lampung', lat: -5.3971, lng: 105.2668, tz: 7 },
  { nama: 'Banda Aceh', provinsi: 'Aceh', lat: 5.5483, lng: 95.3238, tz: 7 },
  { nama: 'Batam', provinsi: 'Kepulauan Riau', lat: 1.1301, lng: 104.0529, tz: 7 },
  { nama: 'Pangkal Pinang', provinsi: 'Bangka Belitung', lat: -2.1316, lng: 106.1169, tz: 7 },
  // Kalimantan
  { nama: 'Pontianak', provinsi: 'Kalimantan Barat', lat: -0.0263, lng: 109.3425, tz: 7 },
  { nama: 'Banjarmasin', provinsi: 'Kalimantan Selatan', lat: -3.3186, lng: 114.5944, tz: 8 },
  { nama: 'Palangkaraya', provinsi: 'Kalimantan Tengah', lat: -2.2080, lng: 113.9165, tz: 7 },
  { nama: 'Samarinda', provinsi: 'Kalimantan Timur', lat: -0.5022, lng: 117.1536, tz: 8 },
  { nama: 'Balikpapan', provinsi: 'Kalimantan Timur', lat: -1.2379, lng: 116.8529, tz: 8 },
  { nama: 'Tarakan', provinsi: 'Kalimantan Utara', lat: 3.3273, lng: 117.5760, tz: 8 },
  // Bali & Nusa Tenggara (WITA)
  { nama: 'Denpasar', provinsi: 'Bali', lat: -8.6705, lng: 115.2126, tz: 8 },
  { nama: 'Mataram', provinsi: 'Nusa Tenggara Barat', lat: -8.5833, lng: 116.1167, tz: 8 },
  { nama: 'Kupang', provinsi: 'Nusa Tenggara Timur', lat: -10.1772, lng: 123.6070, tz: 8 },
  // Sulawesi (WITA)
  { nama: 'Makassar', provinsi: 'Sulawesi Selatan', lat: -5.1477, lng: 119.4327, tz: 8 },
  { nama: 'Palu', provinsi: 'Sulawesi Tengah', lat: -0.8917, lng: 119.8707, tz: 8 },
  { nama: 'Manado', provinsi: 'Sulawesi Utara', lat: 1.4748, lng: 124.8421, tz: 8 },
  { nama: 'Kendari', provinsi: 'Sulawesi Tenggara', lat: -3.9985, lng: 122.5128, tz: 8 },
  { nama: 'Gorontalo', provinsi: 'Gorontalo', lat: 0.5435, lng: 123.0568, tz: 8 },
  { nama: 'Mamuju', provinsi: 'Sulawesi Barat', lat: -2.6748, lng: 118.8885, tz: 8 },
  // Maluku & Papua (WIT)
  { nama: 'Ambon', provinsi: 'Maluku', lat: -3.6954, lng: 128.1814, tz: 9 },
  { nama: 'Ternate', provinsi: 'Maluku Utara', lat: 0.7900, lng: 127.3800, tz: 9 },
  { nama: 'Jayapura', provinsi: 'Papua', lat: -2.5916, lng: 140.6690, tz: 9 },
  { nama: 'Sorong', provinsi: 'Papua Barat', lat: -0.8762, lng: 131.2555, tz: 9 },
  { nama: 'Manokwari', provinsi: 'Papua Barat', lat: -0.8615, lng: 134.0620, tz: 9 },
]

const DEFAULT_KOTA = 'Surabaya'

function cariKota(nama) {
  if (!nama) return null
  const key = String(nama).trim().toLowerCase()
  return KOTA_SHOLAT.find(k => k.nama.toLowerCase() === key) || null
}

module.exports = { KOTA_SHOLAT, DEFAULT_KOTA, cariKota }
