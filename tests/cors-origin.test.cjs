const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { buatPemeriksaOrigin } = require('../server/cors-origin.cjs')

const ALLOWED = ['https://jurnal.cc.cd', 'https://jurnalmadrasah.web.id']

// Jalankan pemeriksa dengan cara yang sama seperti middleware cors: hasilnya
// cb(null, true) untuk izin, atau cb(err) untuk tolak.
const periksa = (periksaFn, origin) => {
  let hasil = null
  periksaFn(origin, (err, izin) => { hasil = err ? { tolak: true, err } : { tolak: false, izin } })
  return hasil
}

test('mode dev mengizinkan semua origin', () => {
  const periksaDev = buatPemeriksaOrigin({ allowedOrigins: ALLOWED, isProd: false })
  assert.deepEqual(periksa(periksaDev, 'https://situs-asing.example'), { tolak: false, izin: true })
})

test('permintaan tanpa header Origin tetap diizinkan', () => {
  const periksaProd = buatPemeriksaOrigin({ allowedOrigins: ALLOWED, isProd: true })
  for (const kosong of [undefined, null, '']) {
    assert.deepEqual(periksa(periksaProd, kosong), { tolak: false, izin: true })
  }
})

test('origin produksi yang sah diizinkan', () => {
  const periksaProd = buatPemeriksaOrigin({ allowedOrigins: ALLOWED, isProd: true, cariTenantDomain: () => null })
  for (const asal of ['https://jurnal.cc.cd', 'https://jurnalmadrasah.web.id', 'https://mtsplussd7.jurnal.cc.cd', 'https://a.b.cc.cd']) {
    assert.deepEqual(periksa(periksaProd, asal), { tolak: false, izin: true }, asal + ' harus diizinkan')
  }
})

test('domain kustom tenant aktif diizinkan, domain asing ditolak', () => {
  const periksaProd = buatPemeriksaOrigin({
    allowedOrigins: ALLOWED,
    isProd: true,
    cariTenantDomain: (host) => (host === 'sekolahku.sch.id' ? { id: 't1' } : null),
  })
  assert.deepEqual(periksa(periksaProd, 'https://sekolahku.sch.id'), { tolak: false, izin: true })
  const ditolak = periksa(periksaProd, 'https://evil.example')
  assert.equal(ditolak.tolak, true)
  assert.equal(ditolak.err.code, 'CORS_ORIGIN_DENIED')
  assert.equal(ditolak.err.status, 403)
})

test('penolakan CORS memakai status 403, bukan 500', () => {
  const periksaProd = buatPemeriksaOrigin({ allowedOrigins: ALLOWED, isProd: true })
  for (const asal of ['https://evil.example', 'null', 'http://jurnal.cc.cd.evil.example', 'https://jurnal.cc.cd.evil.example']) {
    const hasil = periksa(periksaProd, asal)
    assert.equal(hasil.tolak, true, asal + ' harus ditolak')
    assert.equal(hasil.err.status, 403, asal + ' harus memakai status 403')
    assert.equal(hasil.err.statusCode, undefined, 'jangan set statusCode agar tidak tumpang tindih')
    assert.equal(hasil.err.code, 'CORS_ORIGIN_DENIED')
    assert.equal(hasil.err.origin, asal)
  }
})

test('kegagalan pencarian domain tenant tidak mengizinkan origin asing', () => {
  const periksaProd = buatPemeriksaOrigin({
    allowedOrigins: ALLOWED,
    isProd: true,
    cariTenantDomain: () => { throw new Error('db sedang sibuk') },
  })
  const hasil = periksa(periksaProd, 'https://evil.example')
  assert.equal(hasil.tolak, true)
  assert.equal(hasil.err.status, 403)
})

test('index.cjs memakai modul gerbang CORS dan memetakan penolakan ke 403', () => {
  const sumber = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8')
  assert.match(sumber, /const \{ buatPemeriksaOrigin \} = require\('\.\/cors-origin\.cjs'\)/)
  assert.match(sumber, /origin: buatPemeriksaOrigin\(\{ allowedOrigins: ALLOWED_ORIGINS, isProd: IS_PROD/)
  // Jalur lama yang menghasilkan 500 lewat error handler global sudah hilang.
  assert.doesNotMatch(sumber, /new Error\('Not allowed by CORS'\)/)
  const blokHandler = sumber.slice(sumber.indexOf('app.use((err, req, res, next)'))
  assert.match(blokHandler, /err\.code === 'CORS_ORIGIN_DENIED'/)
  assert.match(blokHandler, /res\.status\(403\)\.json\(\{ error: 'Origin tidak diizinkan' \}\)/)
})
