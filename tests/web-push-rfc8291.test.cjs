const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { enkripsiPush, buatVapidJwt, buatKunciVapid, hkdfExtract, hkdfExpand, keB64u, dariB64u } = require('../server/web-push.cjs')

/*
 * Vektor uji resmi RFC 8291 §5 + Appendix A. Kalau enkripsi kita menyimpang satu
 * bit pun dari spesifikasi, hasil di bawah tidak akan cocok — inilah bukti bahwa
 * pengiriman push benar-benar dapat dibaca oleh browser, bukan sekadar "terkirim".
 */
const PT = 'When I grow up, I want to be a watermelon'
const UA_PRIV = 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94'
const UA_PUB = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'
const AS_PRIV = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'
const AS_PUB = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'
const SALT = 'DGv6ra1nlYgDCS1FRnbzlw'
const AUTH = 'BTBZMqHH6r4Tts7J_aSIgg'
const BADAN_RFC = ('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml'
  + 'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT'
  + 'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN')

const basis = () => enkripsiPush({
  plaintext: PT, uaPublic: UA_PUB, authSecret: AUTH, asPrivate: AS_PRIV, asPublic: AS_PUB, salt: SALT, denganAntara: true,
})

test('vektor RFC 8291: kunci privat & publik penerima memang berpasangan', () => {
  // Menjaga agar UA_PRIV (diberikan RFC, dipakai browser untuk membuka pesan)
  // benar-benar pasangan UA_PUB yang kita pakai saat mengenkripsi.
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.setPrivateKey(dariB64u(UA_PRIV))
  assert.equal(keB64u(ecdh.getPublicKey()), UA_PUB)
})

test('RFC 8291: nilai antara Appendix A cocok', () => {
  const r = basis()
  assert.equal(keB64u(r.ecdhSecret), 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs')
  assert.equal(keB64u(r.prkKey), 'Snr3JMxaHVDXHWJn5wdC52WjpCtd2EIEGBykDcZW32k')
  assert.equal(keB64u(r.ikm), 'S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg')
  assert.equal(keB64u(r.prk), '09_eUZGrsvxChDCGRCdkLiDXrReGOEVeSCdCcPBSJSc')
  assert.equal(keB64u(r.cek), 'oIhVW04MRdy2XN9CiKLxTg')
  assert.equal(keB64u(r.nonce), '4h_95klXJ5E_qnoN')
})

test('RFC 8291 §5: badan permintaan byte-per-byte sama dengan contoh', () => {
  const r = basis()
  assert.equal(keB64u(r.badan), BADAN_RFC)
  assert.equal(r.badan.length, 86 + r.ciphertext.length)  // header 86 oktet + ciphertext
  assert.equal(r.header.length, 86)                       // "86-octet header"
  assert.equal(r.header.subarray(0, 16).toString('base64url'), SALT)
  assert.equal(r.header.readUInt32BE(16), 4096)         // rs
  assert.equal(r.header[20], 65)                        // idlen = panjang kunci
  assert.equal(r.header.subarray(21).toString('base64url'), AS_PUB)
  assert.equal(r.ciphertext.length, Buffer.byteLength(PT) + 1 + 16) // plaintext + 0x02 + tag GCM
})

test('RFC 8291: ciphertext Appendix A cocok', () => {
  const r = basis()
  assert.equal(keB64u(r.ciphertext), '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ')
})

test('RFC 8291: salt acak bila tidak diberikan + panjang tetap benar', () => {
  const a = enkripsiPush({ plaintext: 'halo', uaPublic: UA_PUB, authSecret: AUTH, asPrivate: AS_PRIV, asPublic: AS_PUB })
  const b = enkripsiPush({ plaintext: 'halo', uaPublic: UA_PUB, authSecret: AUTH, asPrivate: AS_PRIV, asPublic: AS_PUB })
  assert.equal(a.length, 86 + Buffer.byteLength('halo') + 1 + 16)
  assert.notEqual(keB64u(a.subarray(0, 16)), keB64u(b.subarray(0, 16)), 'salt harus acak per pesan')
})

test('RFC 8291: kunci publik salah bentuk ditolak', () => {
  assert.throws(() => enkripsiPush({ plaintext: 'x', uaPublic: Buffer.alloc(64), authSecret: AUTH, asPrivate: AS_PRIV, asPublic: AS_PUB }), /P-256/)
})

test('VAPID: JWT ES256 terbentuk, audio = origin endpoint, tanda tangan terverifikasi', () => {
  const pasangan = buatKunciVapid()
  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123'
  const jwt = buatVapidJwt({ endpoint, ...pasangan, sub: 'mailto:admin@jurnal.cc.cd', nowSec: 1700000000 })
  const [h, p, s] = jwt.split('.')
  assert.equal(h, keB64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))))
  const payload = JSON.parse(dariB64u(p).toString('utf8'))
  assert.equal(payload.aud, 'https://fcm.googleapis.com')
  assert.equal(payload.exp, 1700000000 + 12 * 3600)
  assert.equal(payload.sub, 'mailto:admin@jurnal.cc.cd')
  // Tanda tangan harus lolos verifikasi dengan kunci publik yang sama (raw R||S 64 oktet).
  const pub = dariB64u(pasangan.publicKey)
  const keyObj = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: keB64u(pub.subarray(1, 33)), y: keB64u(pub.subarray(33, 65)) }, format: 'jwk' })
  const sig = dariB64u(s)
  assert.equal(sig.length, 64, 'ES256 = R||S 64 oktet')
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: keyObj, dsaEncoding: 'ieee-p1363' }, sig))
})

test('HKDF-Expand sesuai RFC 5869 Test Case 1', () => {
  // Appendix A.1 RFC 5869 — memastikan implementasi HKDF tidak salah arah.
  const ikm = Buffer.alloc(22, 0x0b)
  const salt = Buffer.from('000102030405060708090a0b0c', 'hex')
  const info = Buffer.from('f0f1f2f3f4f5f6f7f8f9', 'hex')
  const prk = hkdfExtract(salt, ikm)
  assert.equal(prk.toString('hex'), '077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5')
  assert.equal(hkdfExpand(prk, info, 42).toString('hex'), '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865')
})
