// Domain custom lembaga: deteksi IP server + penerapan vhost Caddy.
//
// Regresi yang dijaga berkas ini:
//   - status 'active' TIDAK boleh di-set sebelum blok Caddy benar-benar ada,
//     karena 'active' membuat tenantMiddleware mengalihkan (301) seluruh
//     trafik subdomain platform ke domain custom — kalau vhost-nya belum ada,
//     lembaga kehilangan akses di dua alamat sekaligus (kasus nyata:
//     jurnal.sb1official.web.id terdaftar 'active' tapi TLS-nya tidak pernah
//     terbit karena blok Caddy tidak pernah ditulis).
//   - `systemctl reload caddy` selalu gagal di produksi (`admin off`), jadi
//     skrip penerapan WAJIB memakai caddy-apply.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'kunci-uji-jurnalku-domain-0123456789'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { publicIp, normalisasiDomain, terapkanDomain } = require('../server/custom-domain.cjs')

const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('publicIp mengembalikan IPv4 non-internal yang benar-benar ada di mesin ini', () => {
  const ip = publicIp()
  assert.ok(ip, 'IP server harus terdeteksi')
  assert.match(ip, /^\d{1,3}(\.\d{1,3}){3}$/)
  const semua = Object.values(os.networkInterfaces()).flat().filter(Boolean).map(n => n.address)
  assert.ok(semua.includes(ip), `IP ${ip} harus ada di interface mesin`)
})

test('normalisasiDomain membersihkan skema, slash, dan kapital', () => {
  assert.equal(normalisasiDomain('  HTTPS://Jurnal.SB1Official.Web.ID/  '), 'jurnal.sb1official.web.id')
  assert.equal(normalisasiDomain('jurnal.sekolah.sch.id'), 'jurnal.sekolah.sch.id')
  assert.equal(normalisasiDomain('contoh.id.'), 'contoh.id')
  assert.equal(normalisasiDomain(''), '')
})

test('terapkanDomain menolak domain kosong tanpa menjalankan skrip', () => {
  const hasil = terapkanDomain('')
  assert.equal(hasil.ok, false)
  assert.match(hasil.message, /kosong/i)
})

test('terapkanDomain melaporkan kegagalan sebagai nilai, bukan throw', () => {
  // Skrip yang tidak ada -> gagal, tapi pemanggil tetap dapat pesan (bukan crash).
  const hasil = terapkanDomain('jurnal.contoh-uji.web.id', { scriptDir: '/tmp/tidak-ada-dir-uji' })
  assert.equal(hasil.ok, false)
  assert.ok(hasil.message.length > 0)
})

test('provision-domain.sh idempoten, memvalidasi, dan memakai caddy-apply (bukan reload)', () => {
  const script = read('server/scripts/provision-domain.sh')
  assert.match(script, /caddy validate --adapter caddyfile --config/)
  assert.match(script, /restore_and_exit/)
  assert.match(script, /CADDY_APPLY/)
  assert.match(script, /caddy-apply/)
  assert.match(script, /DRY_RUN/)
  assert.match(script, /LIVE_IP/)
  assert.match(script, /import jurnalku_secure/)
  assert.match(script, /127\.0\.0\.1:3002/)
  // Varian www hanya ditambahkan bila DNS-nya benar-benar mengarah ke server.
  assert.match(script, /www\.\$DOMAIN|www\.\$\{DOMAIN\}/)
})

test('provision-domain.sh benar-benar bisa dijalankan (DRY_RUN) dan bloknya valid', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jurnalku-domain-'))
  try {
    const caddyfile = path.join(tmp, 'Caddyfile')
    const live = path.join(tmp, 'live')
    const binDir = path.join(tmp, 'bin')
    fs.mkdirSync(path.join(live, 'dist'), { recursive: true })
    fs.mkdirSync(binDir, { recursive: true })
    fs.writeFileSync(caddyfile, '# salinan uji\n')
    // `caddy validate` di-stub: uji ini menguji LOGIKA skrip (blok, idempotensi,
    // urutan validasi->terap), bukan biner Caddy. Validasi Caddyfile asli sudah
    // diuji di VPS terhadap Caddyfile produksi.
    fs.writeFileSync(path.join(binDir, 'caddy'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    const env = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      CADDYFILE: caddyfile,
      LIVE_DIR: live,
      DRY_RUN: '1',
      SKIP_WWW: '1',
    }
    const out = execFileSync('bash', ['server/scripts/provision-domain.sh', 'jurnal.uji-domain.web.id'], { cwd: root, env }).toString()
    assert.match(out, /DRY_RUN=1/)
    const isi = fs.readFileSync(caddyfile, 'utf8')
    assert.match(isi, /jurnal\.uji-domain\.web\.id \{/)
    assert.match(isi, /import jurnalku_secure/)
    assert.match(isi, /reverse_proxy 127\.0\.0\.1:3002/)
    // Idempoten: menjalankan lagi tidak menggandakan blok.
    execFileSync('bash', ['server/scripts/provision-domain.sh', 'jurnal.uji-domain.web.id'], { cwd: root, env })
    const ulang = fs.readFileSync(caddyfile, 'utf8')
    assert.equal((ulang.match(/jurnal\.uji-domain\.web\.id \{/g) || []).length, 1)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('provision-domain.sh membatalkan perubahan bila Caddyfile tidak valid', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jurnalku-domain-'))
  try {
    const caddyfile = path.join(tmp, 'Caddyfile')
    const live = path.join(tmp, 'live')
    const binDir = path.join(tmp, 'bin')
    fs.mkdirSync(path.join(live, 'dist'), { recursive: true })
    fs.mkdirSync(binDir, { recursive: true })
    const asli = '# Caddyfile bersih\n'
    fs.writeFileSync(caddyfile, asli)
    // caddy validate gagal -> skrip harus mengembalikan Caddyfile apa adanya.
    fs.writeFileSync(path.join(binDir, 'caddy'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
    const env = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      CADDYFILE: caddyfile,
      LIVE_DIR: live,
      DRY_RUN: '1',
      SKIP_WWW: '1',
    }
    assert.throws(() => execFileSync('bash', ['server/scripts/provision-domain.sh', 'jurnal.uji-gagal.web.id'], { cwd: root, env, stdio: 'pipe' }))
    assert.equal(fs.readFileSync(caddyfile, 'utf8'), asli, 'Caddyfile harus dikembalikan ke kondisi semula')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('registrasi & panel tidak menandai domain active sebelum vhost terpasang', () => {
  const idx = read('server/index.cjs')
  const tenant = read('server/tenant.cjs')
  // Registrasi: status 'active' hanya setelah Caddy terpasang (hasil.ok) DAN
  // A record domain terverifikasi mengarah ke IP server (cekDnsA + includes).
  assert.match(idx, /if \(hasil\.ok\) \{[\s\S]{0,600}domain_status = \?[\s\S]{0,120}'active'/)
  assert.match(idx, /cekDnsA\(domainVal\)/)
  assert.match(idx, /ips\.includes\(ipServer\)/)
  // Panel superadmin (PUT /api/tenants/:id/domain) memakai terapkanDomain.
  assert.match(tenant, /customDomain\.terapkanDomain\(d\)/)
  assert.match(tenant, /const status = hasil\.ok \? 'active' : 'pending'/)
  // Route verify-domain memakai modul yang sama, bukan execFileSync langsung.
  assert.match(idx, /customDomain\.terapkanDomain\(domain\)/)
})

test('verify-domain menolak aktivasi saat DNS belum mengarah ke server', () => {
  const idx = read('server/index.cjs')
  const blok = idx.slice(idx.indexOf("app.post('/api/tenant/verify-domain'"), idx.indexOf("app.get('/api/tenant/domain-status'"))
  assert.match(blok, /if \(!ips\.includes\(publicIp\)\)/)
  assert.match(blok, /status: 'dns_pending'/)
  assert.match(blok, /expected_ip: publicIp/)
  // Status 'active' hanya ditulis setelah penerapan berhasil.
  const posisiGagal = blok.indexOf("status: 'error'")
  const posisiSukses = blok.lastIndexOf("'active'")
  assert.ok(posisiGagal > 0 && posisiSukses > posisiGagal, "'active' harus ditulis setelah cabang gagal")
})

test('domain-status memberi IP target DNS ke UI', () => {
  const idx = read('server/index.cjs')
  const blok = idx.slice(idx.indexOf("app.get('/api/tenant/domain-status'"))
  assert.match(blok.slice(0, 500), /dns_target_ip/)
})
