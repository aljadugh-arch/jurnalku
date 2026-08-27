const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const server = fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8')
const gtkPage = fs.readFileSync(path.join(root, 'src/pages/admin/DataGTKPage.tsx'), 'utf8')

test('ceklok handler can replace a missing GTK record without assigning to const', () => {
  const start = server.indexOf("app.post('/api/guru/ceklok'")
  assert.ok(start >= 0, 'ceklok route must exist')
  const end = server.indexOf("\napp.", start + 10)
  assert.ok(end > start, 'ceklok route must have an end')
  const route = server.slice(start, end)
  assert.doesNotMatch(route, /const gtk = resolveGtkForUser[\s\S]*\bgtk\s*=/)
  assert.match(route, /let gtk = resolveGtkForUser/)
})

test('GTK photo renderer URL-encodes upload paths with spaces', () => {
  assert.match(gtkPage, /const gtkPhotoUrl\s*=\s*\(/)
  assert.match(gtkPage, /encodeURI\(/)
  assert.doesNotMatch(gtkPage, /<img src=\{g\.foto\}/)
  assert.doesNotMatch(gtkPage, /<img src=\{selected\.foto\}/)
})
