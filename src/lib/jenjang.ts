// Jenjang -> tingkat mapping + paralel helpers (#3)
// tingkat = ROMAN numeral (I,II,III...XII) atau huruf (A,B untuk RA/TK)
// paralel = alfabet (A,B,C,D...) atau numerik (1,2,3,4...)
export const JENJANG_OPTIONS = [
  { value: 'RA', label: 'RA' },
  { value: 'TK', label: 'TK / PAUD' },
  { value: 'MI', label: 'MI' },
  { value: 'SD', label: 'SD' },
  { value: 'MTs', label: 'MTs' },
  { value: 'SMP', label: 'SMP' },
  { value: 'MA', label: 'MA' },
  { value: 'SMA', label: 'SMA' },
  { value: 'SMK', label: 'SMK' },
  { value: 'MAK', label: 'MAK' },
  { value: 'PT', label: 'Perguruan Tinggi' },
  { value: 'NF', label: 'Lembaga Nonformal' },
]

// Roman numeral conversion (small range, no lib needed)
const NUM_TO_ROMAN: Record<string, string> = {
  '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V', '6': 'VI',
  '7': 'VII', '8': 'VIII', '9': 'IX', '10': 'X', '11': 'XI', '12': 'XII'
}

// Normalisasi tingkat ke ROMAN (dipakai di composeNama & display)
export function toRoman(tingkat: string): string {
  return NUM_TO_ROMAN[tingkat] || tingkat  // kalau sudah romawi/huruf, pass-through
}

// Daftar tingkat per jenjang (value = ROMAN)
export function tingkatOptions(jenjang: string): string[] {
  switch (jenjang) {
    case 'RA': return ['A', 'B']
    case 'MI': return ['I', 'II', 'III', 'IV', 'V', 'VI']
    case 'MTs': return ['VII', 'VIII', 'IX']
    case 'MA': return ['X', 'XI', 'XII']
    default: return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
  }
}

// Opsi paralel: alfabet A-J atau numerik 1-10
export const PARALEL_ALFABET = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
export const PARALEL_NUMERIK = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

// Susun nama rombel dari tingkat + paralel
// RA: "A", "A-B"  |  lainnya: "I-A", "VII-1"
export function composeNama(jenjang: string, tingkat: string, paralel: string): string {
  const t = toRoman(tingkat) // normalisasi kalau masih numerik
  if (jenjang === 'RA') return paralel ? `${t}-${paralel}` : t
  return paralel ? `${t}-${paralel}` : t
}

// Durasi 1 Jam Tatap Muka (JTM) per jenjang — KMA 736/2026.
// RA:30, MI:35, MTs:40, MA/MAK:45 menit.
export const JTM_MENIT: Record<string, number> = { RA: 30, MI: 35, MTs: 40, MA: 45 }

// Normalisasi nilai `settings.jenjang` ke kode kanonik. Nilai bisa berupa kode
// ('MI', 'MTs') ATAU label panjang ('Madrasah Tsanawiyah', 'Sekolah Dasar').
const JENJANG_ALIAS: Array<[RegExp, string]> = [
  [/madrasah\s+ibtidaiyah|ibtidaiyah/i, 'MI'],
  [/madrasah\s+tsanawiyah|tsanawiyah/i, 'MTs'],
  [/madrasah\s+aliyah|aliyah/i, 'MA'],
  [/sekolah\s+dasar/i, 'SD'],
  [/sekolah\s+menengah\s+pertama/i, 'SMP'],
  [/sekolah\s+menengah\s+atas/i, 'SMA'],
  [/sekolah\s+menengah\s+kejuruan/i, 'SMK'],
  [/raudhatul\s+athfal/i, 'RA'],
  [/taman\s+kanak/i, 'TK'],
]
export function canonicalJenjang(jenjang?: string): string {
  const raw = String(jenjang || '').trim()
  if (!raw) return ''
  for (const [re, code] of JENJANG_ALIAS) if (re.test(raw)) return code
  const upper = raw.toUpperCase()
  if (['RA', 'TK', 'MI', 'SD', 'MTS', 'SMP', 'MA', 'SMA', 'SMK', 'MAK', 'PT', 'NF'].includes(upper)) {
    return upper === 'MTS' ? 'MTs' : upper
  }
  return raw
}

/** RA/TK dan MI/SD: absensi siswa via guru kelas/wali kelas (bukan admin). */
export function isGuruKelasJenjang(jenjang?: string): boolean {
  return ['RA', 'TK', 'MI', 'SD'].includes(canonicalJenjang(jenjang))
}

export function jtmMenit(jenjang: string): number {
  return JTM_MENIT[canonicalJenjang(jenjang)] || 45 // fallback MA/umum
}

// Generate slot jam pelajaran dari durasi JTM jenjang.
// mulai 07:00, istirahat 15 menit setelah slot ke-4 dan ke-6.
export function generateJamPelajaran(
  jenjang: string,
  jumlah = 10,
  mulaiJam = '07:00',
  istirahatSetelah: number[] = [4, 6],
  durasiMenit = jtmMenit(jenjang),
): { ke: number; mulai: string; selesai: string }[] {
  const durasi = durasiMenit
  const pad = (n: number) => n.toString().padStart(2, '0')
  const toStr = (mnt: number) => `${pad(Math.floor(mnt / 60) % 24)}:${pad(mnt % 60)}`
  const [h, m] = mulaiJam.split(':').map(Number)
  let cursor = h * 60 + m
  const out: { ke: number; mulai: string; selesai: string }[] = []
  for (let ke = 1; ke <= jumlah; ke++) {
    const mulai = cursor
    const selesai = cursor + durasi
    out.push({ ke, mulai: toStr(mulai), selesai: toStr(selesai) })
    cursor = selesai
    if (istirahatSetelah.includes(ke)) cursor += 15 // istirahat 15 menit
  }
  return out
}
