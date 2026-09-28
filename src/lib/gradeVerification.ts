export function verifySavedCount(count: unknown, expected: number) {
  if (count !== expected) {
    throw new Error(`Verifikasi gagal: server mengonfirmasi ${String(count ?? 'tanpa jumlah')} dari ${expected} siswa. Muat ulang nilai sebelum mencoba lagi.`)
  }
}

// Missing/null/blank is not numeric zero. Require exactly one persisted match.
export function verifyGradeRows(
  expected: Record<string, unknown>[],
  actual: Record<string, unknown>[],
  keys: string[],
  fields: string[],
) {
  const verified = expected.filter(item => {
    const matches = actual.filter(row => keys.every(key => row[key] === item[key]))
    return matches.length === 1 && fields.every(field => {
      if (item[field] === undefined) return true
      const value = matches[0][field]
      return value !== null && value !== undefined && value !== '' && Number(value) === Number(item[field])
    })
  }).length
  if (verified !== expected.length) {
    throw new Error(`Verifikasi gagal: ${verified} dari ${expected.length} nilai cocok saat dibaca ulang. Muat ulang sebelum menyimpan lagi.`)
  }
}
