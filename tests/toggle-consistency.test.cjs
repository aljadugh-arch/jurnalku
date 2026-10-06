const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')

const TOGGLE = 'src/components/ui/Toggle.tsx'
const SETTINGS = 'src/pages/admin/SettingsPage.tsx'
const NOTIF = 'src/pages/admin/NotifSettingsPage.tsx'

test('Toggle bersama memakai ukuran yang seragam', () => {
  const src = read(TOGGLE)
  // jalur 44x24, kenop 20px, sisipan 2px di kedua sisi
  assert.match(src, /inline-flex h-6 w-11 shrink-0/)
  assert.match(src, /inline-block h-5 w-5 rounded-full bg-white/)
  assert.match(src, /translate-x-\[22px\]/)
  assert.match(src, /translate-x-0\.5/)
  assert.match(src, /role="switch"/)
  assert.match(src, /aria-checked=\{checked\}/)
})

test('toggle PWA dan Perpustakaan Digital memakai komponen bersama', () => {
  const src = read(SETTINGS)
  assert.match(src, /import Toggle from '\.\.\/\.\.\/components\/ui\/Toggle'/)
  // toggle inline lama (kenop 16px) sudah tidak boleh ada
  assert.doesNotMatch(src, /h-4 w-4 transform rounded-full bg-white/)
  assert.doesNotMatch(src, /role="switch"/)
  // dua pemakaian: PWA + Perpustakaan Digital
  assert.equal((src.match(/<Toggle/g) || []).length, 2)
  assert.match(src, /label="Aktifkan PWA"/)
  assert.match(src, /label="Aktifkan Perpustakaan Digital"/)
})

test('toggle notifikasi memakai komponen bersama dan tetap berwarna per bagian', () => {
  const src = read(NOTIF)
  assert.match(src, /import Toggle from '\.\.\/\.\.\/components\/ui\/Toggle'/)
  assert.doesNotMatch(src, /sr-only peer/, 'toggle inline lama masih tertinggal')
  assert.doesNotMatch(src, /role="switch"/)
  // Lima toggle notifikasi + toggle adzan & suara adzan; semuanya komponen bersama.
  assert.ok((src.match(/<Toggle/g) || []).length >= 5, 'toggle notifikasi harus memakai komponen bersama')
  // warna bagian dipertahankan (hijau / violet)
  assert.match(src, /toneClassName="bg-green-600"/)
})

test('tidak ada lagi gaya toggle inline di halaman pengaturan mana pun', () => {
  for (const f of [SETTINGS, NOTIF]) {
    const src = read(f)
    assert.doesNotMatch(src, /peer-checked:after:translate-x-full/, `${f} masih memakai toggle lama`)
    assert.doesNotMatch(src, /inline-block h-4 w-4 transform rounded-full/, `${f} masih memakai kenop lama`)
  }
})
