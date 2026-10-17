// Format tanggal lahir untuk TAMPILAN: DD-MMMM-YYYY (contoh 28-Juli-2018).
//
// Database menyimpan ISO (YYYY-MM-DD) karena <input type="date">, impor Excel,
// sorting, dan perbandingan SQL membutuhkannya. Fungsi ini hanya untuk yang
// DILIHAT pengguna — jangan dipakai untuk nilai yang dikirim balik ke server.

const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

const NAMA_BULAN: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, agu: 8, agt: 8, ags: 8,
  sep: 9, sept: 9, okt: 10, nov: 11, des: 12,
  january: 1, february: 2, march: 3, may: 5, june: 6, july: 7,
  august: 8, october: 10, december: 12, aug: 8, oct: 10, dec: 12,
}

function keBulan(kata: string): number {
  let k = String(kata || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\d+$/, '')
  if (!k) return 0
  k = k.replace(/0/g, 'o').replace(/1/g, 'i').replace(/5/g, 's').replace(/3/g, 'e')
  if (NAMA_BULAN[k]) return NAMA_BULAN[k]
  for (const [nama, no] of Object.entries(NAMA_BULAN)) {
    if (nama.length >= 3 && k.startsWith(nama.slice(0, 3))) return no
  }
  return 0
}

function tahunLengkap(y: string): number {
  if (y.length === 4) return Number(y)
  if (y.length === 2) return Number(y) > 30 ? 1900 + Number(y) : 2000 + Number(y)
  return Number(y)
}

/** Kembalikan { d, m, y } atau null. Menerima ISO maupun format lama. */
export function uraiTanggalLahir(nilai: any): { d: number; m: number; y: number } | null {
  if (nilai === null || nilai === undefined) return null
  const s = String(nilai).trim()
  if (!s) return null

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return { d: +m[3], m: +m[2], y: +m[1] }

  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (m) {
    const a = +m[1], b = +m[2]
    return b > 12 && a <= 12
      ? { d: b, m: a, y: tahunLengkap(m[3]) }
      : { d: a, m: b, y: tahunLengkap(m[3]) }
  }

  const angka = (s.match(/\d+/g) || []).map(Number)
  const kata = s.match(/[A-Za-z][A-Za-z0-9]*/g) || []
  const bulanKata = kata.find(k => keBulan(k) > 0)
  if (bulanKata && angka.length >= 2) {
    const mo = keBulan(bulanKata)
    let y: number | undefined = angka.find(n => String(n).length === 4)
    let d: number | undefined = angka.find(n => n !== y && n >= 1 && n <= 31)
    if (y === undefined) {
      const dua = angka.filter(n => String(n).length === 2)
      if (dua.length >= 2) { y = tahunLengkap(String(dua[dua.length - 1])); d = dua[0] }
      else if (dua.length === 1) { y = tahunLengkap(String(dua[0])); d = angka.find(n => n !== dua[0]) }
    }
    if (y !== undefined && d !== undefined) return { d, m: mo, y: Number(y) }
  }
  return null
}

/**
 * '2018-07-28' -> '28-Juli-2018'
 * Nilai kosong / tidak terbaca -> '-'
 */
export function formatTanggalLahir(nilai: any): string {
  const p = uraiTanggalLahir(nilai)
  if (!p || !p.d || !p.m || !p.y || p.m < 1 || p.m > 12) return '-'
  return `${String(p.d).padStart(2, '0')}-${BULAN_ID[p.m - 1]}-${p.y}`
}
