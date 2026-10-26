// Domain custom lembaga: deteksi IP server + penerapan blok Caddy.
//
// Dipakai oleh:
//   - POST /api/tenant/verify-domain   (self-service lembaga, setelah DNS benar)
//   - PUT  /api/tenants/:id/domain     (superadmin, panel)
//   - PUT  /api/tenants/:id            (superadmin, saat field domain_custom diisi)
//   - POST /api/auth/register          (pendaftaran langsung dengan domain sendiri)
//
// Kenapa tidak boleh hanya menulis domain_status='active':
// status 'active' membuat tenantMiddleware mengalihkan seluruh trafik subdomain
// platform ke domain custom (redirect 301) — kalau blok Caddy-nya belum ada,
// lembaga kehilangan akses di DUA alamat sekaligus. Jadi status hanya di-set
// 'active' setelah skrip penerapan benar-benar berhasil.

const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

/**
 * IP publik server ini. Prioritas: env PUBLIC_IP (bila benar-benar ada di
 * interface, supaya env basi dari mesin lama tidak dipakai), lalu IPv4
 * non-internal pertama dari interface jaringan.
 */
function publicIp() {
  const kandidat = []
  const envIp = String(process.env.PUBLIC_IP || '').trim()
  if (envIp) kandidat.push(envIp)
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) kandidat.push(ni.address)
    }
  }
  const lokal = new Set(
    Object.values(os.networkInterfaces()).flat().filter(Boolean).map(n => n.address)
  )
  // Env hanya dipercaya kalau alamatnya memang ada di mesin ini; kalau tidak
  // (env warisan VPS lama) pakai interface — bukan menolak verifikasi DNS.
  return kandidat.find(ip => lokal.has(ip) && ip === envIp) || kandidat.find(ip => lokal.has(ip)) || envIp || null
}

function normalisasiDomain(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .replace(/\.$/, '')
}

/** Resolve A record sebuah host via resolver sistem (fallback bila dig absen). */
function resolveA(host) {
  const dns = require('node:dns')
  return new Promise((resolve) => {
    dns.resolve4(host, (err, addrs) => resolve(err ? [] : addrs || []))
  })
}

/** Resolve A record via resolver sistem, fallback ke dig @8.8.8.8 bila kosong. */
async function cekDnsA(domain) {
  let ips = []
  try { ips = await resolveA(domain) } catch { ips = [] }
  if (!ips.length) {
    try {
      const out = execFileSync('dig', ['+short', domain, 'A', '@8.8.8.8'], { timeout: 10000 }).toString().trim()
      ips = out.split('\n').map(s => s.trim()).filter(Boolean)
    } catch { /* resolver sistem cukup */ }
  }
  return ips
}

/**
 * Jalankan skrip penerapan blok Caddy untuk satu domain.
 * Mengembalikan { ok, already, message } — tidak pernah throw supaya pemanggil
 * bisa menampilkan pesan yang bisa ditindaklanjuti ke operator.
 */
function terapkanDomain(domain, { liveDir, scriptDir, timeout = 120000 } = {}) {
  const d = normalisasiDomain(domain)
  if (!d) return { ok: false, message: 'Domain kosong' }
  const script = path.join(scriptDir || path.join(__dirname, 'scripts'), 'provision-domain.sh')
  try {
    const out = execFileSync('bash', [script, d], {
      timeout,
      stdio: 'pipe',
      env: { ...process.env, LIVE_DIR: liveDir || '/www/wwwroot/jurnal.cc.cd' },
    }).toString()
    return { ok: true, already: /sudah terdaftar/.test(out), message: out.trim().split('\n').slice(-1)[0] || 'OK' }
  } catch (e) {
    const msg = (e.stderr ? e.stderr.toString() : e.message || '').trim().slice(-400)
    return { ok: false, message: msg || 'Penerapan domain gagal' }
  }
}

module.exports = { publicIp, normalisasiDomain, resolveA, cekDnsA, terapkanDomain }
