// Landing pintu segmen: konten landing (hero, jenjang, fitur) menyesuaikan
// domain yang dikunjungi — kemenag / dikdasmen / umum — selaras SEGMENT_DOOR
// di server. Diuji lewat sumber karena konten render memakai window.hostname.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const lp = fs.readFileSync(path.join(__dirname, '../src/pages/LandingPage.tsx'), 'utf8')

test('peta segmen + deteksi host ada', () => {
  assert.match(lp, /function segmenDariHost\(\)/, 'deteksi segmen dari host')
  assert.match(lp, /'jurnalmadrasah\.web\.id'\) return 'kemenag'/, 'kemenag -> jurnalmadrasah.web.id')
  assert.match(lp, /idjurnal\.web\.id' \|\| h === 'idjurnal\.biz\.id' \|\| h === 'idjurnal\.my\.id'\) return 'dikdasmen'/, 'dikdasmen -> idjurnal.*')
})

test('tiga segmen punya konten lengkap', () => {
  for (const s of ['kemenag', 'dikdasmen', 'umum']) {
    assert.match(lp, new RegExp(`${s}: \\{`), `segmen ${s}`)
  }
  assert.match(lp, /Asrama & Perizinan Santri/, 'fitur pesantren di pintu kemenag')
  assert.match(lp, /SIAKAD KRS & IPK/, 'fitur siakad di pintu dikdasmen')
  assert.match(lp, /Peserta & E-Sertifikat/, 'fitur sertifikat di pintu umum')
})

test('komponen memakai konten segmen (bukan statis)', () => {
  assert.match(lp, /const segmen = segmenDariHost\(\)/, 'baca segmen')
  assert.match(lp, /const copy = SEGMEN\[segmen\]/, 'pilih konten segmen')
  assert.match(lp, /\{copy\.badge\}/, 'badge hero dari segmen')
  assert.match(lp, /\{copy\.fitur\.map/, 'grid fitur dari segmen')
  assert.match(lp, /\{copy\.jenjang\.map/, 'strip jenjang dari segmen')
})
