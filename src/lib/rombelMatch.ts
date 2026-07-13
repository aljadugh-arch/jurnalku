// Cocokkan kode rombel dari template Excel ke rombel di DB.
// "7A" / "7-A" / "VII A" / "vii-a" → rombel "VII-A". Angka Arab dinormalisasi ke Romawi.

const ARAB_TO_ROMAWI: Record<string, string> = {
  '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V', '6': 'VI',
  '7': 'VII', '8': 'VIII', '9': 'IX', '10': 'X', '11': 'XI', '12': 'XII',
}

// Bentuk kanonik: buang non-alfanumerik, angka→romawi, uppercase.
// "7A" → "VIIA", "VII-A" → "VIIA", "vii a" → "VIIA".
export function canonRombel(raw: any): string {
  let s = String(raw ?? '').trim().toUpperCase()
  if (!s) return ''
  // Ganti angka di depan (tingkat) ke romawi. Cari angka pertama sebagai tingkat.
  s = s.replace(/(\d+)/g, (m) => ARAB_TO_ROMAWI[m] || m)
  // Buang semua selain huruf & angka.
  return s.replace(/[^A-Z0-9]/g, '')
}

export function matchRombel(raw: any, rombels: any[]): any | null {
  const key = canonRombel(raw)
  if (!key) return null
  return rombels.find(r => canonRombel(r.nama) === key) || null
}
