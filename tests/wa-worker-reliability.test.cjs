const test = require('node:test')
const assert = require('node:assert/strict')
const { createVersionResolver, forEachTenantSettled } = require('../server/wa-worker-utils.cjs')

test('Baileys version resolver falls back to cached version during transient upstream failure', async () => {
  let calls = 0
  const resolve = createVersionResolver(async () => {
    calls++
    if (calls === 1) return { version: [2, 3000, 1015901307] }
    throw new Error('network down')
  }, { ttlMs: 0 })
  assert.deepEqual(await resolve(), [2, 3000, 1015901307])
  assert.deepEqual(await resolve(), [2, 3000, 1015901307])
})

test('tenant loop continues after one tenant connection fails', async () => {
  const processed = []
  const errors = []
  await forEachTenantSettled([{ tenant_id: 'bad' }, { tenant_id: 'good' }], async row => {
    if (row.tenant_id === 'bad') throw new Error('network down')
    processed.push(row.tenant_id)
  }, (error, row) => errors.push([row.tenant_id, error.message]))
  assert.deepEqual(processed, ['good'])
  assert.deepEqual(errors, [['bad', 'network down']])
})
