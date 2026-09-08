const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const trackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: root })
  .toString()
  .split('\0')
  .filter(Boolean)

function trackedText() {
  return trackedFiles
    .map(file => {
      const buffer = fs.readFileSync(path.join(root, file))
      if (buffer.includes(0)) return ''
      return `\n--- ${file} ---\n${buffer.toString('utf8')}`
    })
    .join('')
}

test('tracked files contain no retired VPS address or exposed deployment password', () => {
  const source = trackedText()
  const retiredAddress = ['129', '226', '82', '94'].join('\\.')
  const exposedPassword = ['Sekolah', '0838', '#'].join('')
  assert.doesNotMatch(source, new RegExp(retiredAddress))
  assert.equal(source.includes(exposedPassword), false)
  const retiredCredentialNames = ['KREDENSIAL', 'VPS'].join('-')
  assert.equal(source.toUpperCase().includes(retiredCredentialNames), false)
})

test('JWT signing secret is mandatory and has no literal fallback', () => {
  const server = read('server/index.cjs')
  assert.match(server, /const JWT_SECRET = process\.env\.JWT_SECRET/)
  assert.match(server, /if \(IS_PROD && !JWT_SECRET\)/)
  assert.equal(server.includes(['jurnalku', 'secret', 'key', '2024'].join('-')), false)
})

test('domain verification passes tenant-controlled domains without shell interpolation', () => {
  const server = read('server/index.cjs')
  assert.match(server, /execFileSync\('dig', \['\+short', domain, 'A', '@8\.8\.8\.8'\]/)
  assert.match(server, /execFileSync\('bash', \[script, domain\]/)
  assert.doesNotMatch(server, /execSync\(`dig[^`]*\$\{domain\}/)
  assert.doesNotMatch(server, /execSync\(`bash[^`]*\$\{domain\}/)
})

test('primary deployment uses strict host verification, unique staging, rollback, and health checks', () => {
  const script = read('deploy-to-vps.sh')
  assert.match(script, /set -euo pipefail/)
  assert.match(script, /sshpass -e/)
  assert.doesNotMatch(script, /sshpass -p/)
  assert.match(script, /StrictHostKeyChecking=yes/)
  assert.doesNotMatch(script, /StrictHostKeyChecking=no/)
  assert.match(script, /mktemp/)
  assert.match(script, /dist\.staging-/)
  assert.match(script, /trap .*rollback/i)
  assert.match(script, /DEPLOY_HEALTH_URL=.*\/api\/health/)
  assert.match(script, /curl .*HEALTH_URL/)
})

test('environment scripts do not load credentials from workstation-specific files', () => {
  for (const file of [
    'scripts/deploy-staging.sh',
    'scripts/promote-live.sh',
    'scripts/rollback-live.sh',
    'scripts/sync-db-to-staging.sh'
  ]) {
    const script = read(file)
    assert.match(script, /VPS_IP="\$\{VPS_IP:\?/)
    assert.match(script, /VPS_PASS="\$\{VPS_PASS:\?/)
    assert.match(script, /sshpass -e/)
    assert.match(script, /StrictHostKeyChecking=yes/)
    assert.doesNotMatch(script, /\/home\/[A-Za-z0-9._/-]*KREDENSIAL/i)
    const retiredAddress = ['129', '226', '82', '94'].join('.')
    assert.equal(script.includes(retiredAddress), false)
  }
})
