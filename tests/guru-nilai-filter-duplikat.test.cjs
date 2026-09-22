const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

test('GuruNilaiSTSPage: filter siswa dengan nilai > 0 sebelum POST', async (t) => {
  const filepath = path.join(__dirname, '..', 'src', 'pages', 'guru', 'GuruNilaiSTSPage.tsx')
  const content = fs.readFileSync(filepath, 'utf-8')
  
  // Check if filter is present
  assert(content.includes('.filter(s =>'), 'Must filter siswaList before mapping items')
  assert(content.includes('numVal > 0'), 'Filter must check nilai > 0')
  assert(content.includes('if (items.length === 0)'), 'Must validate items not empty before POST')
  
  // Verify POST includes filtered items
  const postMatch = content.match(/api\.post\([^)]*rapor\/asesmen[^)]*items[^)]*\)/)
  assert(postMatch, 'POST call should use filtered items')
})

test('GuruNilaiSASPage: filter siswa dengan nilai > 0 sebelum POST', async (t) => {
  const filepath = path.join(__dirname, '..', 'src', 'pages', 'guru', 'GuruNilaiSASPage.tsx')
  const content = fs.readFileSync(filepath, 'utf-8')
  
  // Check if filter is present
  assert(content.includes('.filter(s =>'), 'Must filter siswaList before mapping items')
  assert(content.includes('numVal > 0'), 'Filter must check nilai > 0')
  assert(content.includes('if (items.length === 0)'), 'Must validate items not empty before POST')
  
  // Verify POST includes filtered items
  const postMatch = content.match(/api\.post\([^)]*rapor\/asesmen[^)]*items[^)]*\)/)
  assert(postMatch, 'POST call should use filtered items')
})
