const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
const theme = read('src/lib/applyTheme.ts')
const css = read('src/index.css')
const journal = read('src/pages/admin/JurnalPage.tsx')
const teacherEkskul = read('src/pages/guru/GuruAbsensiEkskulPage.tsx')
const server = read('server/index.cjs')

test('accent preset updates the real accent token and compatibility aliases', () => {
  assert.match(theme, /setProperty\('--color-accent', s\.accent_color\)/)
  assert.match(theme, /setProperty\('--color-accent-dark'/)
  assert.match(theme, /setProperty\('--color-secondary', s\.accent_color\)/)
  assert.match(css, /--color-accent-dark:/)
})

test('journal supports tenant-filtered reviewer-only bulk approve and reject', () => {
  assert.match(server, /app\.post\('\/api\/jurnal\/bulk-status', JOURNAL_REVIEWER/)
  assert.match(server, /WHERE tenant_id=\? AND status='submitted'/)
  assert.match(server, /confirmation !== expectedConfirmation/)
  assert.match(journal, /bulkUpdateStatus\('approved'\)/)
  assert.match(journal, /bulkUpdateStatus\('rejected'\)/)
  assert.match(journal, /Setujui Semua/)
  assert.match(journal, /Tolak Semua/)
  assert.match(journal, /canReview && <div/)
  assert.match(server, /const reviewer = \['admin','super_admin','kepala','operator'\]/)
})

test('teacher ekskul page loads only assigned activities and their configured members', () => {
  assert.doesNotMatch(teacherEkskul, /Segera Hadir|sedang dalam pengembangan/)
  assert.match(server, /app\.get\('\/api\/guru\/ekskul', STAFF/)
  assert.match(server, /WHERE e\.pembina_id=\? AND e\.tenant_id=\?/)
  assert.match(teacherEkskul, /api\.get\('\/guru\/ekskul'\)/)
  assert.match(teacherEkskul, /api\.get\('\/ekskul\/' \+ selectedEkskul \+ '\/anggota'\)/)
  assert.match(teacherEkskul, /api\.post\('\/absensi-ekskul\/bulk'/)
  assert.match(server, /app\.get\('\/api\/guru\/peminatan', STAFF/)
  assert.match(teacherEkskul, /api\.get\('\/guru\/peminatan'\)/)
  assert.match(teacherEkskul, /api\.post\('\/tahfidz\/pertemuan'/)
})

test('teacher student lookup fails closed when GTK linkage is missing', () => {
  assert.match(server, /A teacher without a linked GTK must never receive the tenant-wide list/)
  assert.match(server, /if \(!gtk\) return res\.json\(\[\]\)/)
})
