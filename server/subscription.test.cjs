const test = require('node:test')
const assert = require('node:assert/strict')
const { addMonthsIso, accessForTenant, featureForPath, normalizeFeatureSelection, hashUnlockCode } = require('./subscription.cjs')

test('trial lasts one calendar month', () => {
  assert.equal(addMonthsIso('2026-01-31T00:00:00.000Z', 1), '2026-02-28T00:00:00.000Z')
  assert.equal(addMonthsIso('2026-08-21T00:00:00.000Z', 1), '2026-09-21T00:00:00.000Z')
})

test('multiple subscription months preserve calendar semantics', () => {
  assert.equal(addMonthsIso('2026-01-31T00:00:00.000Z', 2), '2026-03-31T00:00:00.000Z')
})

test('all representative business API paths are classified', () => {
  const cases = {
    '/api/users': 'master_data', '/api/template-jadwal': 'jadwal', '/api/guru/jadwal': 'jadwal',
    '/api/absensi-siswa/rekap': 'absensi', '/api/penilaian-harian': 'penilaian',
    '/api/jenis-tagihan': 'keuangan', '/api/backup/download': 'backup_drive',
    '/api/tenant/verify-domain': 'website',
  }
  for (const [path, feature] of Object.entries(cases)) assert.equal(featureForPath(path), feature, path)
})

test('unknown API paths are not accidentally classified', () => {
  assert.equal(featureForPath('/api/auth/me'), null)
  assert.equal(featureForPath('/api/settings'), null)
})

test('expired tenant locks while default platform never locks', () => {
  const now = new Date('2026-08-21T12:00:00Z')
  assert.equal(accessForTenant({ id: 'school', plan: 'trial', trial_ends_at: '2026-08-20T00:00:00Z' }, now).locked, true)
  assert.equal(accessForTenant({ id: 'default', plan: 'trial', trial_ends_at: '2020-01-01T00:00:00Z' }, now).locked, false)
})

test('lite cannot enable drive backup or institution website', () => {
  const selected = normalizeFeatureSelection({ backup_drive: true, website: true, absensi: true }, 'lite')
  assert.equal(selected.absensi, true)
  assert.equal(selected.backup_drive, false)
  assert.equal(selected.website, false)
})

test('tenant can disable otherwise allowed modules', () => {
  const access = accessForTenant({ id: 'school', plan: 'pro', subscription_ends_at: '2026-09-21T00:00:00Z', features_json: JSON.stringify({ jurnal: false }) }, new Date('2026-08-21T00:00:00Z'))
  assert.equal(access.features.jurnal, false)
  assert.equal(access.features.absensi, true)
})

test('API path maps to protected feature', () => {
  assert.equal(featureForPath('/api/absensi-siswa/rekap'), 'absensi')
  assert.equal(featureForPath('/api/tagihan'), 'keuangan')
  assert.equal(featureForPath('/api/auth/me'), null)
})

test('unlock code hashing is case and whitespace insensitive', () => {
  assert.equal(hashUnlockCode(' jurnal-abcd '), hashUnlockCode('JURNAL-ABCD'))
})
