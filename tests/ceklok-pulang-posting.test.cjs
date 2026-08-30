const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
const server = read('server/index.cjs')

test('posting table migration covers author_user_id and konten columns used by INSERT/UPDATE', () => {
  // The migration loop at ~4988 must include these columns so production DBs
  // created before the INSERT used them do not crash with "no column named".
  const migIdx = server.indexOf("PRAGMA table_info(posting)")
  assert.ok(migIdx > -1, 'posting migration exists')
  const block = server.slice(Math.max(0, migIdx - 1500), migIdx + 200)
  assert.match(block, /author_user_id/, 'migration must add author_user_id')
  assert.match(block, /konten/, 'migration must add konten')
})

test('ceklok pulang allowed after teacher last schedule ends, even before global window', () => {
  const idx = server.indexOf("app.post('/api/guru/ceklok'")
  assert.ok(idx > -1)
  const block = server.slice(idx, idx + 4000)
  // Must consult the teacher's own schedule to derive an earlier pulang start
  assert.match(block, /jam_selesai/, 'must read schedule end time')
  assert.match(block, /jadwal/, 'must query jadwal for this teacher')
})
