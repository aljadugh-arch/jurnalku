const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

test('GuruNilaiSTSPage.tsx: payload harus include rombel_id', async (t) => {
  const filepath = path.join(__dirname, '..', 'src', 'pages', 'guru', 'GuruNilaiSTSPage.tsx')
  const content = fs.readFileSync(filepath, 'utf-8')
  
  // Check if rombel_id is included in POST payload
  const match = content.match(/api\.post\(['"]\/rapor\/asesmen['"],\s*{[^}]*jenis:\s*'sts'[^}]*}\)/)
  assert(match, 'Could not find api.post call for STS')
  
  const payload = match[0]
  assert(payload.includes('rombel_id'), 'Payload must include rombel_id field')
  assert(payload.includes('selectedRombel'), 'rombel_id must be bound to selectedRombel')
})

test('GuruNilaiSASPage.tsx: payload harus include rombel_id', async (t) => {
  const filepath = path.join(__dirname, '..', 'src', 'pages', 'guru', 'GuruNilaiSASPage.tsx')
  const content = fs.readFileSync(filepath, 'utf-8')
  
  // Check if rombel_id is included in POST payload
  const match = content.match(/api\.post\(['"]\/rapor\/asesmen['"],\s*{[^}]*jenis:\s*'sas'[^}]*}\)/)
  assert(match, 'Could not find api.post call for SAS')
  
  const payload = match[0]
  assert(payload.includes('rombel_id'), 'Payload must include rombel_id field')
  assert(payload.includes('selectedRombel'), 'rombel_id must be bound to selectedRombel')
})
