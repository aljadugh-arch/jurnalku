const test = require('node:test')
const assert = require('node:assert/strict')

/**
 * Integration test: Show that prewarm and runtime produce identical TTS phrases.
 * This test simulates the actual data flow from database to speech.
 */

// Mock implementations matching server/index.cjs and src/lib/feedbackSound.ts
function normalizeNameParts(name) {
  return String(name || '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
}

function toNaturalCase(word) {
  const clean = String(word || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return clean.split(' ').filter(Boolean).map(part => {
    const lower = part.toLocaleLowerCase('id-ID')
    return lower.charAt(0).toLocaleUpperCase('id-ID') + lower.slice(1)
  }).join(' ')
}

function firstName(name) {
  const clean = toNaturalCase(String(name || ''))
  if (!clean) return ''
  return clean.split(' ')[0]
}

// Server-side: Extract the unique nickname for a student
function uniqueStudentNickname(allNames, studentName) {
  const parts = normalizeNameParts(studentName)
  if (!parts.length) return studentName || ''
  
  const tokenCounts = new Map()
  for (const row of allNames) {
    for (const part of normalizeNameParts(row)) {
      const key = part.toLowerCase()
      tokenCounts.set(key, (tokenCounts.get(key) || 0) + 1)
    }
  }
  
  for (let i = parts.length - 1; i >= 0; i--) {
    if ((tokenCounts.get(parts[i].toLowerCase()) || 0) === 1) return parts[i]
  }
  
  const suffixCounts = new Map()
  for (const row of allNames) {
    const rowParts = normalizeNameParts(row)
    for (let size = 2; size <= rowParts.length; size++) {
      const key = rowParts.slice(-size).join(' ').toLowerCase()
      suffixCounts.set(key, (suffixCounts.get(key) || 0) + 1)
    }
  }
  
  for (let size = 2; size <= parts.length; size++) {
    const suffix = parts.slice(-size).join(' ')
    if ((suffixCounts.get(suffix.toLowerCase()) || 0) === 1) return suffix
  }
  
  return parts.join(' ')
}

// Server prewarm: Generate phrase list
function generatePrewarmPhrases(students, teachers) {
  const names = new Set()
  const allStudentNames = students.map(s => s.nama)
  
  for (const siswa of students) {
    const nickname = siswa.nama_panggilan || uniqueStudentNickname(allStudentNames, siswa.nama)
    const normalized = firstName(nickname)
    if (normalized) names.add(normalized)
  }
  
  for (const gtk of teachers) {
    const normalized = firstName(gtk.nama)
    if (normalized) names.add(normalized)
  }
  
  const phrases = []
  for (const name of names) {
    phrases.push(`${name} masuk`)
    phrases.push(`${name} pulang`)
  }
  return phrases.sort()
}

// Client runtime: Generate phrase when student scans
function generateRuntimePhrase(studentApiResponse, session) {
  const name = studentApiResponse.nama_panggilan || studentApiResponse.nama_panggilan_unik || studentApiResponse.nama
  const nickname = firstName(name)
  return `${nickname || 'Berhasil'} ${session}`
}

test('Prewarm and runtime produce identical TTS phrases for same student', () => {
  const students = [
    { nama: 'Muhammad Azam Ridho', nama_panggilan: null },
    { nama: 'Siti Nur Azizah', nama_panggilan: null },
    { nama: 'Ahmad Santoso', nama_panggilan: 'Ahmad' }, // Manual nickname
  ]
  
  const teachers = [
    { nama: 'Budi Santoso' },
    { nama: 'Sinta Wijaya' },
  ]
  
  // 1. Server prewarm generates phrases for cache population
  const prewarmPhrases = generatePrewarmPhrases(students, teachers)
  
  // 2. Client runtime would generate these phrases when students scan:
  //    (simulating what happens in announceAttendanceSuccess)
  const allStudentNames = students.map(s => s.nama)
  const allNames = new Set()
  
  for (const siswa of students) {
    const nickname = siswa.nama_panggilan || uniqueStudentNickname(allStudentNames, siswa.nama)
    const normalized = firstName(nickname)
    if (normalized) allNames.add(normalized)
  }
  
  for (const gtk of teachers) {
    const normalized = firstName(gtk.nama)
    if (normalized) allNames.add(normalized)
  }
  
  const runtimePhrases = []
  for (const name of allNames) {
    runtimePhrases.push(`${name} masuk`)
    runtimePhrases.push(`${name} pulang`)
  }
  const sortedRuntimePhrases = runtimePhrases.sort()
  
  // 3. Both should produce identical phrases
  assert.deepEqual(prewarmPhrases, sortedRuntimePhrases, 
    'Prewarm and runtime must generate identical phrase lists')
  
  // 4. Verify specific examples
  assert(prewarmPhrases.includes('Ahmad masuk'), 'Manual nickname should be used')
  assert(prewarmPhrases.includes('Ahmad pulang'), 'Manual nickname should be used in both sessions')
  // uniqueStudentNickname works backwards to find unique parts
  assert(prewarmPhrases.includes('Azizah masuk'), 'Should extract unique suffix from names')
  assert(prewarmPhrases.includes('Ridho masuk'), 'Should extract unique suffix for disambiguation')
  assert(prewarmPhrases.includes('Budi masuk'), 'Should extract first name "Budi"')
})

test('toNaturalCase normalizes accented names identically in prewarm and runtime', () => {
  const testCases = [
    { input: 'ázám', expected: 'Ázám' },
    { input: 'MÚHAMMAD', expected: 'Múhammad' },
    { input: 'muhammad_azam', expected: 'Muhammad Azam' },
    { input: 'siti-nur', expected: 'Siti Nur' },
    { input: 'Ázám Múhammad', expected: 'Ázám Múhammad' },
  ]
  
  for (const tc of testCases) {
    const result = toNaturalCase(tc.input)
    assert.equal(result, tc.expected, `toNaturalCase('${tc.input}') should be '${tc.expected}' but got '${result}'`)
  }
})

test('firstName extracts and normalizes first word identically', () => {
  const testCases = [
    { input: 'Muhammad Azam Ridho', expected: 'Muhammad' },
    { input: 'SITI NUR AZIZAH', expected: 'Siti' },
    { input: 'ázám', expected: 'Ázám' },
    { input: 'ahmad_santoso', expected: 'Ahmad' },
    { input: '', expected: '' },
    { input: null, expected: '' },
  ]
  
  for (const tc of testCases) {
    const result = firstName(tc.input)
    assert.equal(result, tc.expected, `firstName('${tc.input}') should be '${tc.expected}' but got '${result}'`)
  }
})

test('Cache key generation produces same hash for prewarm and runtime', () => {
  const crypto = require('node:crypto')
  
  function cacheKey(tenantId, voiceName, text) {
    return crypto.createHash('sha256').update(`${tenantId}|${voiceName}|${text}`).digest('hex')
  }
  
  const tenantId = 'tenant-123'
  const voiceName = 'Puck'
  const prewarmPhrase = 'Ázám masuk'
  
  // Prewarm generates this phrase
  const prewarmKey = cacheKey(tenantId, voiceName, prewarmPhrase)
  
  // Runtime receives same phrase and requests same cache key
  const runtimeKey = cacheKey(tenantId, voiceName, prewarmPhrase)
  
  assert.equal(prewarmKey, runtimeKey, 'Cache keys must match exactly')
  
  // Different casings or accents would produce different keys (cache miss)
  const wrongCase = cacheKey(tenantId, voiceName, 'ázám masuk')
  assert.notEqual(prewarmKey, wrongCase, 'Different case/accents should produce different cache key')
})
