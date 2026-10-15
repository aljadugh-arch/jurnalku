'use strict'
/**
 * Web Push tanpa dependensi eksternal.
 *
 * Mengapa ditulis sendiri: server produksi hanya menerima berkas `server/*.cjs`
 * (lihat scripts/deploy-staging.sh), jadi menambah paket npm (web-push) berarti
 * npm install manual di VPS yang tidak pernah ikut ter-deploy. Modul ini memakai
 * `node:crypto` saja: ECDH P-256, HKDF-SHA256, AES-128-GCM, ES256 (RFC 7515).
 *
 * Standar yang diikuti:
 *  - RFC 8291: Message Encryption for Web Push (isi `aes128gcm`)
 *  - RFC 8188: Encrypted Content-Encoding for HTTP
 *  - RFC 8292: VAPID (JWT ES256 + header Authorization)
 *  - RFC 8030: Web Push Protocol (kirim POST ke endpoint langganan)
 *
 * Kebenaran enkripsi dibuktikan byte-per-byte terhadap vektor uji RFC 8291 §5
 * dan Appendix A di tests/web-push-rfc8291.test.cjs.
 */
const crypto = require('node:crypto')

const TEKS_KEY_INFO = 'WebPush: info\0'
const TEKS_CEK_INFO = 'Content-Encoding: aes128gcm\0'
const TEKS_NONCE_INFO = 'Content-Encoding: nonce\0'
const UKURAN_SALT = 16
const RECORD_SIZE = 4096

const keB64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const dariB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')

/** HKDF-Extract (RFC 5869): PRK = HMAC-SHA256(salt, IKM). */
function hkdfExtract(salt, ikm) {
  return crypto.createHmac('sha256', salt).update(ikm).digest()
}

/** HKDF-Expand (RFC 5869): T(n) = HMAC(PRK, T(n-1) | info | n). */
function hkdfExpand(prk, info, panjang) {
  let t = Buffer.alloc(0)
  let keluar = Buffer.alloc(0)
  for (let i = 1; keluar.length < panjang; i++) {
    if (i > 255) throw new Error('HKDF-Expand melebihi 255 blok')
    t = crypto.createHmac('sha256', prk).update(Buffer.concat([t, info, Buffer.from([i])])).digest()
    keluar = Buffer.concat([keluar, t])
  }
  return keluar.subarray(0, panjang)
}

/** Kunci VAPID baru (P-256), dikembalikan sebagai base64url sesuai RFC 8292. */
function buatKunciVapid() {
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()
  return { publicKey: keB64u(ecdh.getPublicKey()), privateKey: keB64u(ecdh.getPrivateKey()) }
}

/**
 * Enkripsi satu pesan push (RFC 8291 §3.4). Semua argumen Buffer kecuali yang
 * bertipe string base64url. Mengembalikan badan permintaan HTTP yang siap kirim:
 * header 86 oktet (salt | rs | idlen | keyid) diikuti ciphertext+tag GCM.
 *
 * `denganAntara` mengembalikan juga nilai antara supaya bisa dibandingkan dengan
 * Appendix A RFC 8291 (cek_im, prk, cek, nonce) — dipakai tes, bukan produksi.
 */
function enkripsiPush({ plaintext, uaPublic, authSecret, asPrivate, asPublic, salt, denganAntara = false, recordSize = RECORD_SIZE }) {
  const pt = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(String(plaintext), 'utf8')
  const uaPub = Buffer.isBuffer(uaPublic) ? uaPublic : dariB64u(uaPublic)
  const auth = Buffer.isBuffer(authSecret) ? authSecret : dariB64u(authSecret)
  const asPriv = Buffer.isBuffer(asPrivate) ? asPrivate : dariB64u(asPrivate)
  const asPub = Buffer.isBuffer(asPublic) ? asPublic : dariB64u(asPublic)
  const ambilSalt = () => {
    if (salt == null || salt === '') return crypto.randomBytes(UKURAN_SALT)
    const s = Buffer.isBuffer(salt) ? salt : dariB64u(salt)
    if (s.length !== UKURAN_SALT) throw new Error('salt harus tepat 16 oktet')
    return s
  }
  const garam = ambilSalt()
  if (uaPub.length !== 65 || uaPub[0] !== 0x04) throw new Error('kunci publik penerima bukan titik P-256 tak-terkompresi (65 oktet)')
  if (asPub.length !== 65 || asPub[0] !== 0x04) throw new Error('kunci publik pengirim bukan titik P-256 tak-terkompresi (65 oktet)')
  if (asPriv.length !== 32) throw new Error('kunci privat pengirim harus 32 oktet')

  // 1) Rahasia ECDH bersama.
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.setPrivateKey(asPriv)
  const ecdhSecret = ecdh.computeSecret(uaPub)

  // 2) IKM = HKDF(salt=auth_secret, IKM=ecdh_secret) lalu Expand(key_info).
  const prkKey = hkdfExtract(auth, ecdhSecret)
  const keyInfo = Buffer.concat([Buffer.from(TEKS_KEY_INFO, 'utf8'), uaPub, asPub])
  const ikm = hkdfExpand(prkKey, keyInfo, 32)

  // 3) Kunci & nonce konten.
  const prk = hkdfExtract(garam, ikm)
  const cek = hkdfExpand(prk, Buffer.from(TEKS_CEK_INFO, 'utf8'), 16)
  const nonce = hkdfExpand(prk, Buffer.from(TEKS_NONCE_INFO, 'utf8'), 12)

  // 4) Catatan RFC 8188: delimiter padding 0x02 menutup catatan terakhir.
  const catatan = Buffer.concat([pt, Buffer.from([0x02])])
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce)
  const ciphertext = Buffer.concat([cipher.update(catatan), cipher.final(), cipher.getAuthTag()])

  const rs = Buffer.alloc(4)
  rs.writeUInt32BE(recordSize >>> 0, 0)
  const header = Buffer.concat([garam, rs, Buffer.from([asPub.length]), asPub])
  const badan = Buffer.concat([header, ciphertext])

  if (!denganAntara) return badan
  return { badan, header, ciphertext, garam, ecdhSecret, prkKey, keyInfo, ikm, prk, cek, nonce }
}

/** Objek kunci privat Node dari bahan JWK mentah (dipakai untuk tanda tangan ES256). */
function kunciPrivatP256({ privateKey, publicKey }) {
  const pub = dariB64u(publicKey)
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error('kunci publik VAPID tidak valid')
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: keB64u(dariB64u(privateKey)), x: keB64u(pub.subarray(1, 33)), y: keB64u(pub.subarray(33, 65)) },
    format: 'jwk',
  })
}

/** JWT VAPID (RFC 8292 §2) untuk satu endpoint; `aud` wajib origin endpoint. */
function buatVapidJwt({ endpoint, publicKey, privateKey, sub = 'mailto:admin@jurnal.cc.cd', nowSec = Math.floor(Date.now() / 1000), kedaluwarsaDetik = 12 * 3600 }) {
  const aud = new URL(endpoint).origin
  const header = keB64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = keB64u(Buffer.from(JSON.stringify({ aud, exp: nowSec + kedaluwarsaDetik, sub })))
  const signingInput = `${header}.${payload}`
  const sig = crypto.sign('sha256', Buffer.from(signingInput), { key: kunciPrivatP256({ privateKey, publicKey }), dsaEncoding: 'ieee-p1363' })
  return `${signingInput}.${keB64u(sig)}`
}

/**
 * Kirim satu pesan push ke endpoint langganan. Payload dienkripsi dengan kunci
 * langganan (p256dh + auth). Mengembalikan { ok, status, alasan }.
 * Status 404/410 berarti langganan mati dan harus dihapus pemanggil.
 */
async function kirimPush(subscription, payload, vapid, { ttl = 900, urgency = 'high', topic = '', timeoutMs = 10000, fetchImpl = globalThis.fetch } = {}) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) throw new Error('langganan tidak lengkap')
  if (typeof fetchImpl !== 'function') throw new Error('fetch tidak tersedia di runtime ini')
  const terenkripsi = enkripsiPush({
    plaintext: Buffer.from(JSON.stringify(payload), 'utf8'),
    uaPublic: subscription.keys.p256dh,
    authSecret: subscription.keys.auth,
    asPrivate: vapid.privateKey,
    asPublic: vapid.publicKey,
  })
  const jwt = buatVapidJwt({ endpoint: subscription.endpoint, ...vapid, sub: vapid.sub })
  const headers = {
    TTL: String(ttl),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    Urgency: urgency,
  }
  if (topic) headers.Topic = String(topic).slice(0, 32)
  const kontrol = new AbortController()
  const jam = setTimeout(() => kontrol.abort(), timeoutMs)
  try {
    const res = await fetchImpl(subscription.endpoint, { method: 'POST', headers, body: terenkripsi, signal: kontrol.signal })
    const teks = await res.text().catch(() => '')
    return { ok: res.ok, status: res.status, alasan: res.ok ? '' : (teks || res.statusText || 'gagal').slice(0, 300) }
  } catch (e) {
    return { ok: false, status: 0, alasan: e?.name === 'AbortError' ? 'timeout' : (e?.message || 'error jaringan') }
  } finally {
    clearTimeout(jam)
  }
}

module.exports = {
  buatKunciVapid, enkripsiPush, buatVapidJwt, kirimPush,
  keB64u, dariB64u, hkdfExtract, hkdfExpand,
  TEKS_KEY_INFO, TEKS_CEK_INFO, TEKS_NONCE_INFO,
}
