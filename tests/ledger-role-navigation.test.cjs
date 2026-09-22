const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
const app = read('src/App.tsx')
const bottom = read('src/components/layout/BottomNavigation.tsx')

test('route ledger wali kelas tidak diwariskan ke kepala yang hanya berkapabilitas mengajar', () => {
  assert.match(app, /function canAccessRole\(user: User, allowedRoles\?: string\[\], exactRoles = false\)/)
  assert.match(app, /if \(exactRoles\) return false/)
  assert.match(app, /allowedRoles=\{\['wali_kelas'\]\} exactRoles/)
})

test('navigasi mobile wali kelas menyediakan ledger', () => {
  assert.match(bottom, /role === 'wali_kelas'[\s\S]*label: 'Ledger'[\s\S]*path: '\/guru\/nilai-ledger'/)
})
