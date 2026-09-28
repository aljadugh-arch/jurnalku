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

test('provision-domain.sh memakai Caddy port 3002, bukan nginx port 3001 yang sudah mati', () => {
  const script = read('server/scripts/provision-domain.sh')
  assert.match(script, /\/etc\/caddy\/Caddyfile/)
  assert.match(script, /127\.0\.0\.1:3002/)
  // Sisa artefak nginx/panel lama akan membuat custom domain tidak pernah dilayani.
  assert.doesNotMatch(script, /127\.0\.0\.1:3001/)
  assert.doesNotMatch(script, /proxy_pass/)
  assert.doesNotMatch(script, /nginx -s reload/)
  assert.doesNotMatch(script, /\/www\/server\/panel\/vhost/)
})

test('provision-domain.sh memvalidasi Caddyfile sebelum reload dan membalikkan perubahan bila gagal', () => {
  const script = read('server/scripts/provision-domain.sh')
  assert.match(script, /caddy validate --adapter caddyfile --config/)
  assert.match(script, /cp -a "\$BACKUP" "\$CADDYFILE"/)
  assert.match(script, /restore_and_exit/)
  assert.match(script, /systemctl reload caddy/)
  // Harus bisa diarahkan ke Caddyfile lain supaya perubahan bisa diuji tanpa menyentuh produksi.
  assert.match(script, /CADDYFILE="\$\{CADDYFILE:-/)
  assert.match(script, /DRY_RUN/)
})

test('rollback-live.sh memulihkan seluruh modul server/*.cjs, bukan hanya index dan tenant', () => {
  const script = read('scripts/rollback-live.sh')
  assert.match(script, /"\$BACKUP"\/server\/\*\.cjs/)
  assert.match(script, /install -m 0644 "\$f" "\$LIVE\/server\/\$\(basename "\$f"\)"/)
  assert.match(script, /-d "\$BACKUP\/server"/)
  assert.doesNotMatch(script, /\$BACKUP\/index\.cjs/)
  assert.doesNotMatch(script, /\$BACKUP\/tenant\.cjs/)
})
