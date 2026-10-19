'use strict'
// Kontrak: "connect device hanya connecting saja" tidak boleh terjadi lagi.
//
// AKAR YANG TERBUKTI (19 Okt 2026):
//   connect() diawali `if(sockets.has(tenantId) || ...) return`
//   Socket yang ada tetapi BELUM PERNAH login (handshake gagal / macet)
//   tetap tinggal di map. Setiap tick 2 detik memanggil connect(), yang
//   langsung return. Akibatnya:
//     - status tertahan di 'connecting' selamanya
//     - tombol Connect Device tidak berpengaruh apa pun
//     - Refresh Status juga tidak menolong (statusnya memang 'connecting')
//   Satu-satunya jalan keluar adalah restart worker — dan itu tidak terlihat
//   oleh pengguna.
//
// Perbaikan: socket yang melewati batas handshake dianggap zombie, dibuang,
// lalu disambung ulang. Ditambah hitungan detik di UI supaya pengguna tahu
// proses masih hidup atau sudah mati.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

test('worker membuang socket zombie, bukan menyerah diam-diam', () => {
  const s = baca('server/wa-worker.mjs')
  assert.ok(/const socketSejak=new Map\(\)/.test(s), 'harus mencatat kapan socket dibuat')
  assert.ok(/BATAS_HANDSHAKE_MS/.test(s), 'harus ada batas handshake')
  assert.ok(/socket zombie — dibuang lalu disambung ulang/.test(s),
    'socket yang melewati batas harus dibuang dan disambung ulang')
  assert.ok(/lamaSock\.end\(undefined\)/.test(s), 'socket lama harus ditutup')
})

test('socket yang sudah login tidak diganggu', () => {
  const s = baca('server/wa-worker.mjs')
  assert.ok(/if\(lamaSock\?\.user\) return/.test(s),
    'socket yang sudah punya user (login) harus dibiarkan')
})

test('batas handshake masuk akal dan bisa dikonfigurasi', () => {
  const s = baca('server/wa-worker.mjs')
  assert.ok(/WA_HANDSHAKE_TIMEOUT_MS/.test(s), 'harus bisa diatur lewat env')
  const m = s.match(/BATAS_HANDSHAKE_MS=Number\(process\.env\.WA_HANDSHAKE_TIMEOUT_MS\|\|(\d+)\)/)
  assert.ok(m, 'harus punya nilai default')
  const detik = Number(m[1]) / 1000
  assert.ok(detik >= 20 && detik <= 120, `default harus 20-120 detik, dapat ${detik}`)
})

test('penanda socket dibersihkan saat koneksi tertutup', () => {
  const s = baca('server/wa-worker.mjs')
  assert.ok(/sockets\.delete\(tenantId\); socketSejak\.delete\(tenantId\); const code=lastDisconnect/.test(s),
    'socketSejak harus ikut dibersihkan, kalau tidak umur socket salah hitung')
})

test('UI menghitung detik dan berhenti menunggu saat QR atau connected', () => {
  const s = baca('src/pages/admin/WAGatewayPage.tsx')
  assert.ok(/tungguDetik/.test(s), 'UI harus menampilkan hitungan detik')
  assert.ok(/waStatus\?\.status === 'qr'/.test(s),
    'harus berhenti menunggu begitu QR muncul — bukan menunggu connected')
  assert.ok(/Belum ada QR setelah 90 detik/.test(s),
    'harus memberi tahu pengguna apa yang harus dilakukan saat gagal')
})

test('UI memberi panduan langkah scan QR', () => {
  const s = baca('src/pages/admin/WAGatewayPage.tsx')
  assert.ok(/Perangkat tertaut/.test(s))
  assert.ok(/QR kedaluwarsa/.test(s), 'harus menyebut QR punya masa berlaku')
})

test('status qr tidak diturunkan ke connecting (mencegah layar berkedip)', () => {
  const s = baca('server/wa-worker.mjs')
  assert.ok(/const QR_SEGAR_MS/.test(s), 'harus ada masa berlaku QR')
  assert.ok(/if\(status==='connecting'\)/.test(s))
  assert.ok(/QR masih berlaku — pertahankan/.test(s),
    'connecting tidak boleh menimpa qr yang masih segar')
})
