const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const page = fs.readFileSync(path.join(root, 'src', 'pages', 'admin', 'DataGTKPage.tsx'), 'utf8')

// Field GTK yang harus bisa diisi lewat impor (kolom gtk + kolom pendukung).
const GTK_FIELDS = [
  'nik', 'nip', 'nuptk', 'nama', 'jenis_kelamin', 'tempat_lahir', 'tanggal_lahir',
  'no_hp', 'email', 'jabatan', 'status_kepegawaian', 'bidang_studi', 'alamat', 'kode_guru',
]

function extractMap(propName) {
  // Ambil blok `${propName}={{ ... }}` lalu parse pasangan 'k': 'v'.
  const m = page.match(new RegExp(propName + '=\\{\\{([\\s\\S]*?)\\}\\}'))
  assert.ok(m, `${propName} harus ada di DataGTKPage.tsx`)
  const map = {}
  for (const pair of m[1].matchAll(/'([^']+)' *: *'([^']+)'/g)) map[pair[1]] = pair[2]
  return map
}

test('GTK: seluruh field dapat diisi lewat columnMap atau aliases', () => {
  const columnMap = extractMap('columnMap')
  const aliases = extractMap('aliases')
  const mapped = new Set([...Object.values(columnMap), ...Object.values(aliases)])
  for (const field of GTK_FIELDS) {
    assert.ok(mapped.has(field), `field gtk ${field} tidak dapat diisi lewat impor`)
  }
})

test('GTK: header template lama tetap dikenali (alias)', () => {
  const columnMap = extractMap('columnMap')
  const aliases = extractMap('aliases')
  // Header template gtk lama memakai singkatan yang berbeda dari columnMap.
  const legacy = { 'JK': 'jenis_kelamin', 'TGL Lahir': 'tanggal_lahir', 'No. HP': 'no_hp' }
  for (const [h, field] of Object.entries(legacy)) {
    const ok = columnMap[h] === field || aliases[h] === field
    assert.ok(ok, `header legacy "${h}" tidak terpetakan ke ${field}`)
  }
})

test('GTK: payload onImport mengirim kode_guru', () => {
  // kode_guru harus ikut dikirim (bukan dibuang), karena kolom gtk memilikinya.
  assert.match(page, /kode_guru:\s*String\(row\.kode_guru/, 'onImport harus mengirim kode_guru')
})
