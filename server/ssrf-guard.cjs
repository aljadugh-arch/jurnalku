'use strict'
// Penjaga permintaan keluar (SSRF guard) untuk URL yang DIATUR ADMIN TENANT.
//
// Latar masalah: beberapa URL disimpan dari input admin tenant lalu dipanggil
// oleh server sendiri, sambil membawa kredensial tersimpan:
//   - ai_config.custom_endpoint   (Bearer <kunci AI tenant>)
//   - wa_gateway_config.baileys_webhook
//   - wa_gateway_config.sidobe_api_url (Bearer <sidobe_api_key>)
// Karena pendaftaran tenant terbuka, "admin tenant" BUKAN batas kepercayaan.
// Tanpa penjaga ini, siapa pun dapat memaksa server memanggil alamat internal
// (loopback, jaringan privat, metadata cloud) dan membaca balik responsnya.
//
// Aturan:
//   - Skema wajib http/https, tanpa kredensial di URL.
//   - Tujuan privat/loopback/link-local/metadata DITOLAK, kecuali host:port
//     tercantum pada allowlist operator (env SSRF_PRIVATE_ALLOWLIST).
//   - Alamat hasil resolusi DNS di-pin ke koneksi (lookup kustom) sehingga
//     DNS rebinding tidak bisa mengalihkan koneksi ke IP privat.
//   - Redirect TIDAK diikuti.
//   - Operator dapat menonaktifkan penjaga seluruhnya dengan SSRF_ALLOW_PRIVATE=1
//     (mis. memakai LLM lokal) — sadar risiko.
const dns = require('node:dns')
const http = require('node:http')
const https = require('node:https')
const net = require('node:net')

const DEFAULT_PRIVATE_ALLOWLIST = 'localhost:8000,127.0.0.1:8000'

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'instance-data',
])

function ipv4ToInt(ip) {
  const parts = String(ip).split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const part of parts) {
    const v = Number(part)
    if (!Number.isInteger(v) || v < 0 || v > 255) return null
    n = (n * 256) + v
  }
  return n >>> 0
}

// Catatan penting: operator bitwise JS mengembalikan integer BERTANDA 32-bit,
// sehingga perbandingan seperti `(n & 0xffff0000) === 0xc0a80000` SELALU gagal
// untuk nilai yang bit tingginya menyala. Wajib `>>> 0` sebelum membandingkan.
function inCidr(n, mask, network) {
  return ((n & mask) >>> 0) === network
}

function isBlockedIPv4(ip) {
  const n = ipv4ToInt(ip)
  if (n === null) return true
  return (
    inCidr(n, 0xff000000, 0x7f000000) || // 127.0.0.0/8 loopback
    inCidr(n, 0xff000000, 0x0a000000) || // 10.0.0.0/8 privat
    inCidr(n, 0xfff00000, 0xac100000) || // 172.16.0.0/12 privat
    inCidr(n, 0xffff0000, 0xc0a80000) || // 192.168.0.0/16 privat
    inCidr(n, 0xffff0000, 0xa9fe0000) || // 169.254.0.0/16 link-local + metadata
    inCidr(n, 0xff000000, 0x00000000) || // 0.0.0.0/8
    inCidr(n, 0xffc00000, 0x64400000) || // 100.64.0.0/10 CGNAT
    inCidr(n, 0xfffe0000, 0xc6120000) || // 198.18.0.0/15 benchmark
    inCidr(n, 0xffff0000, 0xc0000000) || // 192.0.0.0/16
    inCidr(n, 0xffffff00, 0xc0000200) || // 192.0.2.0/24 dokumentasi
    inCidr(n, 0xffffff00, 0xc6336400) || // 198.51.100.0/24 dokumentasi
    inCidr(n, 0xffffff00, 0xcb007100) || // 203.0.113.0/24 dokumentasi
    inCidr(n, 0xf0000000, 0xe0000000) || // 224.0.0.0/4 multicast
    inCidr(n, 0xf0000000, 0xf0000000)    // 240.0.0.0/4 reserved incl. 255.255.255.255
  )
}

function isBlockedIPv6(ip) {
  const addr = String(ip).toLowerCase().split('%')[0]
  if (addr === '::' || addr === '::1') return true
  const mapped = addr.match(/^::ffff:(.+)$/)
  if (mapped) {
    const tail = mapped[1]
    if (tail.includes('.')) return isBlockedIPv4(tail)
    const hex = tail.split(':')
    if (hex.length === 2) {
      const hi = parseInt(hex[0], 16)
      const lo = parseInt(hex[1], 16)
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) return isBlockedIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
    }
    return true
  }
  if (addr.startsWith('64:ff9b:')) return true // NAT64
  if (addr.startsWith('2001:db8')) return true // dokumentasi
  const first = parseInt(addr.split(':')[0] || '0', 16)
  if (Number.isNaN(first)) return true
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true // ff00::/8 multicast
  return false
}

function isBlockedAddress(address) {
  if (!address) return true
  const family = net.isIP(String(address))
  if (family === 4) return isBlockedIPv4(address)
  if (family === 6) return isBlockedIPv6(address)
  return true
}

function allowPrivateDisabled() {
  return String(process.env.SSRF_ALLOW_PRIVATE || '') === '1'
}

function privateAllowlist() {
  const raw = process.env.SSRF_PRIVATE_ALLOWLIST
  const list = (raw === undefined ? DEFAULT_PRIVATE_ALLOWLIST : raw) || ''
  return new Set(
    String(list)
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean)
      .map(item => (item.startsWith('[') ? item : item))
  )
}

function isAllowlistedPrivate(hostname, port) {
  const list = privateAllowlist()
  if (!list.size) return false
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  const candidates = [`${host}:${port}`, host]
  for (const candidate of candidates) if (list.has(candidate)) return true
  return false
}

function parseOutboundUrl(rawUrl, label = 'URL') {
  const text = String(rawUrl == null ? '' : rawUrl).trim()
  if (!text) throw new Error(`${label} wajib diisi`)
  let url
  try {
    url = new URL(text)
  } catch {
    throw new Error(`${label} tidak valid`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} harus memakai http atau https`)
  }
  if (url.username || url.password) {
    throw new Error(`${label} tidak boleh memuat kredensial`)
  }
  if (!url.hostname) throw new Error(`${label} tidak valid`)
  // Karakter kontrol / spasi dapat menyamarkan host — tolak sejak awal.
  if (/[\s\u0000-\u001f\u007f]/.test(url.hostname)) throw new Error(`${label} tidak valid`)
  return url
}

function portOf(url) {
  if (url.port) return Number(url.port)
  return url.protocol === 'https:' ? 443 : 80
}

// Validasi sinkron (tanpa DNS): skema, kredensial URL, IP literal, hostname internal.
function validateOutboundUrl(rawUrl, label = 'URL') {
  const url = parseOutboundUrl(rawUrl, label)
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const port = portOf(url)
  if (allowPrivateDisabled()) return { url, hostname, port, address: null, family: null }
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    if (!isAllowlistedPrivate(hostname, port)) throw new Error(`${label} menunjuk ke host internal yang tidak diizinkan`)
    return { url, hostname, port, address: null, family: null }
  }
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname) && !isAllowlistedPrivate(hostname, port)) {
      throw new Error(`${label} menunjuk ke alamat privat/internal yang tidak diizinkan`)
    }
    return { url, hostname, port, address: hostname, family: net.isIP(hostname) }
  }
  if (!hostname.includes('.')) throw new Error(`${label} harus memakai nama domain yang lengkap`)
  return { url, hostname, port, address: null, family: null }
}

// Validasi + resolusi DNS. Semua alamat hasil resolusi harus publik (kecuali allowlist).
async function resolveSafeAddress(hostname, port, label = 'URL') {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (allowPrivateDisabled()) return { address: host, family: net.isIP(host) || undefined }
  const allowlisted = isAllowlistedPrivate(host, port)
  let records
  try {
    records = await dns.promises.lookup(host, { all: true, verbatim: true })
  } catch {
    throw new Error(`${label} tidak dapat diresolusi (DNS gagal)`)
  }
  if (!records || !records.length) throw new Error(`${label} tidak dapat diresolusi (DNS kosong)`)
  const blocked = records.filter(record => isBlockedAddress(record.address))
  if (blocked.length && !allowlisted) {
    throw new Error(`${label} menunjuk ke jaringan privat/internal yang tidak diizinkan`)
  }
  const chosen = allowlisted ? records[0] : records.find(record => !isBlockedAddress(record.address))
  if (!chosen) throw new Error(`${label} menunjuk ke jaringan privat/internal yang tidak diizinkan`)
  return { address: chosen.address, family: chosen.family }
}

// Validasi lengkap untuk dipakai saat MENYIMPAN konfigurasi (umpan balik cepat).
async function assertSafeOutboundUrl(rawUrl, label = 'URL') {
  const info = validateOutboundUrl(rawUrl, label)
  if (info.address && !allowPrivateDisabled()) {
    if (!isAllowlistedPrivate(info.hostname, info.port) && isBlockedAddress(info.address)) {
      throw new Error(`${label} menunjuk ke alamat privat/internal yang tidak diizinkan`)
    }
    return info
  }
  if (!allowPrivateDisabled()) {
    const resolved = await resolveSafeAddress(info.hostname, info.port, label)
    return { ...info, address: resolved.address, family: resolved.family }
  }
  return info
}

// Permintaan keluar dengan alamat yang sudah divalidasi dan di-pin.
// Tanpa redirect; respons dikembalikan sebagai teks mentah.
function safeFetch(rawUrl, options = {}) {
  const {
    method = 'POST',
    headers = {},
    body,
    timeoutMs = 120000,
    label = 'URL',
  } = options

  return new Promise((resolve, reject) => {
    let info
    try {
      info = validateOutboundUrl(rawUrl, label)
    } catch (error) {
      reject(error)
      return
    }

    const go = (address, family) => {
      const mod = info.url.protocol === 'https:' ? https : http
      const requestOptions = {
        protocol: info.url.protocol,
        hostname: info.url.hostname,
        port: info.port,
        path: `${info.url.pathname}${info.url.search}`,
        method,
        headers,
        // SNI hanya diisi untuk nama domain; alamat IP literal tidak boleh dipakai
        // sebagai servername (Node menolaknya) dan tidak butuh SNI.
        ...(net.isIP(info.hostname) === 0 ? { servername: info.hostname } : {}),
      }
      if (address) {
        requestOptions.lookup = (_host, opts, cb) => {
          if (opts && opts.all) cb(null, [{ address, family: family || net.isIP(address) || 4 }])
          else cb(null, address, family || net.isIP(address) || 4)
        }
      }
      let settled = false
      const finish = (fn, value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fn(value)
      }
      const req = mod.request(requestOptions, res => {
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => finish(resolve, {
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          headers: res.headers,
          text: Buffer.concat(chunks).toString('utf8'),
        }))
        res.on('error', error => finish(reject, error))
      })
      const timer = setTimeout(() => {
        req.destroy(new Error('Waktu permintaan ke layanan tujuan habis'))
      }, timeoutMs)
      req.on('error', error => finish(reject, error))
      if (body !== undefined && body !== null) req.write(body)
      req.end()
    }

    if (info.address) {
      go(info.address, info.family)
      return
    }
    resolveSafeAddress(info.hostname, info.port, label)
      .then(resolved => go(resolved.address, resolved.family))
      .catch(reject)
  })
}

module.exports = {
  isBlockedAddress,
  isBlockedIPv4,
  isBlockedIPv6,
  validateOutboundUrl,
  resolveSafeAddress,
  assertSafeOutboundUrl,
  safeFetch,
  BLOCKED_HOSTNAMES,
}