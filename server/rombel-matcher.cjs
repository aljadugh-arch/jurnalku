const romanMap = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
  6: 'VI',
  7: 'VII',
  8: 'VIII',
  9: 'IX',
  10: 'X',
  11: 'XI',
  12: 'XII',
}

const romanToNumber = new Map(Object.entries(romanMap).map(([number, roman]) => [roman, Number(number)]))

function normalize(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ')
}

function canonicalRombel(value) {
  const name = normalize(value)
  if (!name) return null

  const numeric = name.match(/^(\d+)\s*-?\s*([A-Z]?)$/)
  if (numeric) {
    const number = Number(numeric[1])
    const letter = numeric[2]
    if (romanMap[number]) return letter ? `${romanMap[number]}-${letter}` : romanMap[number]
  }

  return name
}

function gradeNumber(value) {
  const name = normalize(value)
  if (!name) return null

  const classPrefix = name.match(/^KELAS\s+(\d+)(?:\b|[-\s])/)
  if (classPrefix) return Number(classPrefix[1])

  const numericPrefix = name.match(/^(\d+)(?:\b|[-\s])/)
  if (numericPrefix) return Number(numericPrefix[1])

  const romanPrefix = name.match(/^([IVX]+)(?:\b|[-\s])/)
  if (romanPrefix && romanToNumber.has(romanPrefix[1])) return romanToNumber.get(romanPrefix[1])

  return null
}

function availableNames(rombels) {
  return rombels.map((rombel) => String(rombel.nama).trim()).sort((a, b) => a.localeCompare(b, 'id'))
}

function resolveRombel(input, rombels) {
  const raw = String(input || '').trim()
  const normalizedInput = normalize(raw)

  const exact = rombels.find((rombel) => normalize(rombel.nama) === normalizedInput)
  if (exact) return { id: exact.id, nama: exact.nama }

  const canonical = canonicalRombel(raw)
  const canonicalMatch = rombels.find((rombel) => canonicalRombel(rombel.nama) === canonical)
  if (canonicalMatch) return { id: canonicalMatch.id, nama: canonicalMatch.nama }

  if (/^\d+$/.test(raw)) {
    const grade = Number(raw)
    const candidates = rombels.filter((rombel) => gradeNumber(rombel.nama) === grade)
    if (candidates.length === 1) return { id: candidates[0].id, nama: candidates[0].nama }
    if (candidates.length > 1) {
      return {
        error: `Rombel "${raw}" ambigu. Gunakan nama lengkap: ${availableNames(candidates).join(', ')}`,
      }
    }
  }

  const names = availableNames(rombels)
  return {
    error: `Rombel "${raw}" tidak ditemukan${names.length ? `. Rombel tersedia: ${names.join(', ')}` : '. Belum ada rombel yang dibuat'}`,
  }
}

module.exports = { canonicalRombel, gradeNumber, resolveRombel }
