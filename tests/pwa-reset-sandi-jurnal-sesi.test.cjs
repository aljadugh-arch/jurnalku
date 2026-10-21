'use strict'
// Kontrak: PWA install, reset sandi superadmin, satu jurnal per sesi.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

// ---------- PWA ----------

test('prompt install PWA tidak bergantung pada pwa_enabled', () => {
  const ui = baca('src/components/PwaInstallPrompt.tsx')
  // Bug: `if (!enabled || ...) return null` membuat prompt TIDAK PERNAH muncul
  // ketika admin belum menyalakan PWA lembaga, padahal manifest statis valid
  // dan browser sudah mengirim beforeinstallprompt.
  assert.ok(!/if \(!enabled \|\| installed/.test(ui), 'enabled tidak boleh menjadi syarat tunggal')
  assert.ok(ui.includes('bolehTampil'), 'harus ada perhitungan tampil terpisah')
  assert.ok(/Boolean\(deferredPrompt\) \|\| isIos/.test(ui), 'tampil bila browser menawarkan atau iOS')
})

test('PWA: service worker didaftarkan dan manifest tersedia', () => {
  const main = baca('src/main.tsx')
  assert.ok(main.includes('daftarkanServiceWorker'), 'service worker harus didaftarkan')
  const sw = baca('public/sw.js')
  assert.ok(sw.includes("addEventListener('install'"), 'sw harus punya handler install')
  assert.ok(sw.includes("addEventListener('fetch'"), 'sw harus punya handler fetch')
  const man = baca('public/manifest.json')
  assert.ok(man.includes('"display": "standalone"'), 'manifest harus standalone')
  assert.ok(man.includes('192x192') && man.includes('512x512'), 'ikon wajib 192 & 512')
})

// ---------- RESET SANDI ----------

test('superadmin bisa mereset sandi pengguna lembaga', () => {
  const t = baca('server/tenant.cjs')
  assert.ok(t.includes("'/api/superadmin/reset-sandi'"), 'endpoint reset harus ada')
  assert.ok(t.includes("'/api/superadmin/pengguna'"), 'endpoint daftar pengguna harus ada')
  assert.ok(/role !== 'super_admin'/.test(t), 'hanya super admin')
  assert.ok(t.includes('must_change_password=1'), 'pengguna wajib ganti sandi setelah reset')
  assert.ok(t.includes('bcrypt.hashSync'), 'sandi harus di-hash')
  assert.ok(/sandiBaru\.length < 6/.test(t), 'sandi minimal 6 karakter')
})

test('forgot-password masih simulasi — karena itu reset superadmin wajib ada', () => {
  const s = baca('server/index.cjs')
  const i = s.indexOf("app.post('/api/auth/forgot-password'")
  const blok = s.slice(i, i + 900)
  assert.ok(/Simulasi/.test(blok), 'kode lama memang simulasi (didokumentasikan)')
  // Karena tidak ada email sungguhan, jalur pemulihan harus lewat superadmin.
  assert.ok(baca('server/tenant.cjs').includes('reset-sandi'), 'harus ada jalur pemulihan nyata')
})

// ---------- SATU JURNAL PER SESI ----------

test('jurnal: satu sesi cukup satu jurnal (2 JTM tidak digandakan)', () => {
  const s = baca('server/index.cjs')
  const i = s.indexOf("app.post('/api/jurnal'")
  const blok = s.slice(i, i + 3000)
  assert.ok(blok.includes('JURNAL_SUDAH_ADA'), 'harus menolak jurnal ganda untuk sesi sama')
  assert.ok(blok.includes('jamDariJadwal'), 'jam_ke harus bisa diisi dari jadwal')
  assert.ok(/SELECT id FROM jurnal_mengajar[\s\S]{0,200}tanggal=\?/.test(blok), 'cek duplikat per tanggal+mapel+rombel')
})

test('jurnal: jam_ke dihitung dari urutan slot nyata sekolah', () => {
  const s = baca('server/index.cjs')
  const i = s.indexOf("app.post('/api/jurnal'")
  const blok = s.slice(i, i + 3000)
  assert.ok(/jadwal[\s\S]{0,300}jam_mulai/.test(blok), 'harus membaca jam_mulai jadwal')
  // Rumus tetap (menit-420)/40 meleset saat ada jam istirahat — urutan slot
  // nyata yang dipakai, bukan aritmetika.
  assert.ok(/SELECT DISTINCT jam_mulai FROM jadwal/.test(blok), 'ambil slot unik hari itu')
  assert.ok(/slot\.indexOf/.test(blok), 'jam ke- = posisi slot + 1')
})
