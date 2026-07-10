// Jenjang -> tingkat mapping + paralel helpers (#3)
// tingkat = ROMAN numeral (I,II,III...XII) atau huruf (A,B untuk RA/TK)
// paralel = alfabet (A,B,C,D...) atau numerik (1,2,3,4...)
export const JENJANG_OPTIONS = [
  { value: 'RA', label: 'RA / TK (PAUD)' },
  { value: 'MI', label: 'MI / SD' },
  { value: 'MTs', label: 'MTs / SMP' },
  { value: 'MA', label: 'MA / SMA / SMK' },
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
