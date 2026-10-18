'use strict'
// Kontrak tiga keluhan produksi yang terbukti dari data, bukan dugaan:
//
//  1. Ceklok: frontend MENGIRIM `accuracy` tapi endpoint ceklok MENGABAIKANNYA.
//     Akibatnya guru yang berdiri di sekolah tetap ditolak saat GPS meleset
//     20-40 m. Toleransi harus dipakai, dan SAMA dengan masuk-kelas.
//  2. Radius kelas 10 m mustahil dipenuhi GPS ponsel; butuh lantai (RADIUS_MIN).
//  3. Adzan WA mati karena adzan_wa=0 — bukan bug kode. Yang perlu dikunci di
//     sini adalah perilaku gate: adzan_wa=0 -> reason 'disabled', bukan kirim.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const geo = require(path.join(AKAR, 'server', 'geo-lock.cjs'))

test('endpoint ceklok memakai accuracy, bukan hanya lat/lng', () => {
  const s = baca('server/index.cjs')
  const i = s.indexOf("app.post('/api/guru/ceklok'")
  assert.ok(i > 0, 'endpoint ceklok harus ada')
  const badan = s.slice(i, i + 6500)
  assert.ok(/const \{ type, latitude, longitude, accuracy \} = req\.body/.test(badan),
    'accuracy harus didestruktur dari req.body — sebelumnya diabaikan')
  assert.ok(/toleransiAkurasi\(accuracy\)/.test(badan),
    'toleransi akurasi harus diterapkan pada pemeriksaan radius')
  assert.ok(/require\('\.\/geo-lock\.cjs'\)/.test(badan),
    'harus memakai helper yang sama dengan masuk-kelas agar jawabannya konsisten')
})

test('toleransi akurasi dibatasi agar tidak bisa dipakai memalsukan posisi', () => {
  // Akurasi 5000 m tidak boleh meloloskan apa pun.
  assert.strictEqual(geo.toleransiAkurasi(5000), geo.AKURASI_MAKS)
  assert.strictEqual(geo.toleransiAkurasi(30), 30)
  assert.strictEqual(geo.toleransiAkurasi(0), 0)
  assert.strictEqual(geo.toleransiAkurasi(null), 0)
})

test('radius kelas punya lantai agar GPS ponsel bisa memenuhinya', () => {
  assert.ok(geo.RADIUS_MIN >= 20, 'RADIUS_MIN harus minimal 20 m')
  assert.ok(geo.RADIUS_MIN <= 50, 'RADIUS_MIN jangan terlalu longgar')
  const s = baca('server/geo-lock.cjs')
  // Dipakai di kedua jalur (rombel dan sekolah)
  const pakai = [...s.matchAll(/Math\.max\(RADIUS_MIN/g)].length
  assert.ok(pakai >= 2, `RADIUS_MIN harus dipakai di jalur rombel dan sekolah, ditemukan ${pakai}`)
})

test('adzan: adzan_wa=0 berarti tidak dikirim (gate, bukan bug)', () => {
  const s = baca('server/wa-queue.cjs')
  const i = s.indexOf('function queueAdzanReminders')
  const badan = s.slice(i, i + 1400)
  assert.ok(/const waAktif = conf\?\.adzan_wa == null \? !!conf\?\.notif_adzan : !!Number\(conf\.adzan_wa\)/.test(badan),
    'gate adzan_wa harus membaca kolom adzan_wa, fallback ke notif_adzan')
  assert.ok(/reason: 'disabled'/.test(badan),
    'saat sakelar mati harus melaporkan disabled, bukan mengirim diam-diam')
})
