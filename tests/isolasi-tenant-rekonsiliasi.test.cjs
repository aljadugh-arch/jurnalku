'use strict'
// Kontrak dua perbaikan:
//
//  1. ISOLASI AKUN ANTAR TENANT. Login sebelumnya punya fallback
//     `SELECT * FROM users WHERE lower(email) = ?` TANPA filter tenant. Terbukti
//     lewat uji: akun yang dibuat di tenant mtsplussd7 berhasil login dari
//     domain mimifdangimbang. Akibatnya akun demo (admin/kepala/guru/bendahara/
//     siswa) bisa dipakai di domain lembaga mana pun.
//
//  2. REKONSILIASI WA GATEWAY / GOOGLE DRIVE / SEARCH CONSOLE. Ketiganya
//     menyimpan kredensial di DB, bukan di kode. Deploy tidak menimpanya, tapi
//     restore DB lama atau baris terhapus mematikannya diam-diam.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')
const server = baca('server/index.cjs')

// ---------------- (1) isolasi tenant ----------------
test('login tidak lagi mencari email lintas tenant', () => {
  assert.ok(!/if \(!user\) user = db\.prepare\('SELECT \* FROM users WHERE lower\(email\) = \?'\)\.get\(identLower\)/.test(server),
    'fallback email global tanpa filter tenant HARUS dihapus — itu kebocoran lintas lembaga')
})

test('login tidak lagi mencari NIS lintas tenant', () => {
  assert.ok(!/WHERE status = 'aktif' AND \(nis = \? OR nisn = \?\) ORDER BY tenant_id LIMIT 1/.test(server),
    'NIS bisa sama di dua lembaga — mencari lintas tenant membuat login masuk ke lembaga salah')
})

test('super_admin hanya boleh login dari host platform', () => {
  assert.ok(/hostPlatform\(req\)/.test(server), 'login super_admin harus dibatasi host platform')
  assert.ok(/function hostPlatform/.test(server))
  assert.ok(/HOST_PLATFORM/.test(server))
})

test('domain lembaga tidak termasuk host platform', () => {
  const s = baca('server/index.cjs')
  const i = s.indexOf('const HOST_PLATFORM')
  const blok = s.slice(i, i + 600)
  // Domain lembaga (subdomain lembaga) TIDAK boleh terdaftar.
  assert.ok(!/jurnal\.mtsplussd7\.cc\.cd/.test(blok), 'domain lembaga tidak boleh jadi host platform')
  assert.ok(!/mimifdangimbang/.test(blok), 'domain lembaga tidak boleh jadi host platform')
})

test('akun demo hanya hidup di tenant demo', () => {
  // Endpoint demo harus mencari user di DEMO_TENANT_ID saja.
  assert.ok(/DEMO_TENANT_ID/.test(server))
  const i = server.indexOf("app.post('/api/auth/demo'")
  const blok = server.slice(i, i + 3000)
  assert.ok(/tenant_id=\? AND role=\?/.test(blok), 'pencarian akun demo harus dibatasi tenant')
})

// ---------------- (2) rekonsiliasi ----------------
test('skrip rekonsiliasi memeriksa tiga layanan', () => {
  const s = baca('scripts/rekonsiliasi-layanan.cjs')
  assert.ok(/function bacaWa/.test(s), 'harus memeriksa WA gateway')
  assert.ok(/function bacaDrive/.test(s), 'harus memeriksa Google Drive')
  assert.ok(/function bacaSearchConsole/.test(s), 'harus memeriksa Search Console')
})

test('snapshot tidak menyimpan kredensial mentah', () => {
  const s = baca('scripts/rekonsiliasi-layanan.cjs')
  // Harus memakai hash, bukan menyimpan nilai sesi/api key apa adanya.
  assert.ok(/sesi_hash: sha\(/.test(s), 'sesi Baileys harus disimpan sebagai hash')
  assert.ok(/sidobe_key_hash: sha\(/.test(s), 'API key harus disimpan sebagai hash')
  assert.ok(/token_hash: sha\(/.test(s), 'refresh token harus disimpan sebagai hash')
  assert.ok(!/baileys_session: r\.baileys_session/.test(s), 'nilai sesi mentah tidak boleh masuk snapshot')
  assert.ok(!/refresh_token_encrypted: t\.refresh_token_encrypted/.test(s), 'token mentah tidak boleh masuk snapshot')
})

test('rekonsiliasi mendeteksi konfigurasi hilang sebagai KRITIS', () => {
  const s = baca('scripts/rekonsiliasi-layanan.cjs')
  assert.ok(/Sesi Baileys tenant \$\{tid\} HILANG/.test(s))
  assert.ok(/Folder tujuan backup tenant \$\{tid\} HILANG/.test(s))
  assert.ok(/Token Search Console HILANG/.test(s))
  assert.ok(/KRITIS/.test(s))
})

test('rekonsiliasi punya perintah simpan, periksa, pulihkan', () => {
  const s = baca('scripts/rekonsiliasi-layanan.cjs')
  for (const c of ["cmd === 'simpan'", "cmd === 'pulihkan'", "'periksa'"]) {
    assert.ok(s.includes(c), `perintah ${c} harus ada`)
  }
})

test('rekonsiliasi tersambung ke gate deploy dan cron', () => {
  const gate = baca('scripts/gate-lalu-deploy.sh')
  assert.ok(/rekonsiliasi-pasca-deploy\.sh/.test(gate),
    'gate harus memanggil rekonsiliasi setelah promote, supaya ketahuan pada deploy yang sama')
  const sh = baca('scripts/rekonsiliasi-pasca-deploy.sh')
  assert.ok(/terakhir\.json/.test(sh), 'harus membuat snapshot awal bila belum ada')
  assert.ok(/exit 2/.test(sh), 'harus keluar non-zero saat ada KRITIS')
})

test('wrapper rekonsiliasi membuat snapshot awal otomatis', () => {
  const sh = baca('scripts/rekonsiliasi-pasca-deploy.sh')
  assert.ok(/Belum ada snapshot/.test(sh))
  assert.ok(/simpan/.test(sh))
})

test('bandingkan() menandai layanan yang berubah jadi nonaktif', () => {
  const { bandingkan } = require(path.join(AKAR, 'scripts', 'rekonsiliasi-layanan.cjs'))
  const lama = {
    wa: { tenant: [{ tenant_id: 't1', enabled: 1, sesi_ada: true, sesi_hash: 'aaa', sidobe_key_ada: true, status_koneksi: 'connected' }] },
    drive: { tenant: [{ tenant_id: 't1', auto_enabled: 1, folder_ada: true, folder_hash: 'bbb' }], token_oauth: { ada_drive_scope: true, token_panjang: 100 } },
    search_console: { ada: true, ada_webmasters: true, ada_siteverification: true, token_hash: 'ccc', token_panjang: 100 },
  }
  const baru = {
    wa: { tenant: [{ tenant_id: 't1', enabled: 0, sesi_ada: false, sesi_hash: '', sidobe_key_ada: false, status_koneksi: 'disconnected' }] },
    drive: { tenant: [{ tenant_id: 't1', auto_enabled: 0, folder_ada: false, folder_hash: '' }], token_oauth: { ada_drive_scope: false, token_panjang: 0 } },
    search_console: { ada: false, ada_webmasters: false, ada_siteverification: false, token_hash: '', token_panjang: 0 },
  }
  const temuan = bandingkan(lama, baru)
  const kritis = temuan.filter(t => t.tingkat === 'KRITIS')
  assert.ok(kritis.length >= 6, `harus menangkap banyak masalah, dapat ${kritis.length}`)
  assert.ok(temuan.some(t => /WA tenant t1 berubah dari aktif ke NONAKTIF/.test(t.pesan)))
  assert.ok(temuan.some(t => /Sesi Baileys tenant t1 HILANG/.test(t.pesan)))
  assert.ok(temuan.some(t => /Backup otomatis tenant t1 NONAKTIF/.test(t.pesan)))
  assert.ok(temuan.some(t => /Izin Google Drive HILANG/.test(t.pesan)))
  assert.ok(temuan.some(t => /Token Search Console HILANG/.test(t.pesan)))
})

test('bandingkan() tidak berisik saat tidak ada perubahan', () => {
  const { bandingkan } = require(path.join(AKAR, 'scripts', 'rekonsiliasi-layanan.cjs'))
  const sama = {
    wa: { tenant: [{ tenant_id: 't1', enabled: 1, sesi_ada: true, sesi_hash: 'aaa', sidobe_key_ada: true, status_koneksi: 'connected' }] },
    drive: { tenant: [{ tenant_id: 't1', auto_enabled: 1, folder_ada: true, folder_hash: 'bbb' }], token_oauth: { ada_drive_scope: true, token_panjang: 100 } },
    search_console: { ada: true, ada_webmasters: true, ada_siteverification: true, token_hash: 'ccc', token_panjang: 100 },
  }
  assert.deepStrictEqual(bandingkan(sama, JSON.parse(JSON.stringify(sama))), [])
})

test('gate mengirim SSHPASS ke sshpass (bukan hanya VPS_PASS)', () => {
  // sshpass -e membaca variabel bernama SSHPASS. Gate punya VPS_PASS, jadi
  // harus dipetakan; kalau tidak, rekonsiliasi selalu gagal dengan
  // "SSHPASS environment variable not set" walau deploy sendiri sukses.
  const gate = baca('scripts/gate-lalu-deploy.sh')
  assert.ok(/SSHPASS="\$VPS_PASS"\s+sshpass -e ssh/.test(gate),
    'gate harus memetakan VPS_PASS -> SSHPASS saat memanggil sshpass')
})

test('log rekonsiliasi masuk ke arsip run, bukan folder induk', () => {
  const gate = baca('scripts/gate-lalu-deploy.sh')
  assert.ok(/REKON_LOG="\$DIR_LOG\/rekonsiliasi\.log"/.test(gate),
    'memakai $ARSIP membuat log tidak masuk arsip run dan sulit dilacak')
})

test('dependensi uji frontend disiapkan persisten, bukan di /tmp', () => {
  // /tmp hilang setiap reboot -> gate merah palsu tanpa perubahan kode.
  const t = baca('tests/frontend-grade-flows.test.cjs')
  assert.ok(/\.test-deps/.test(t), 'dependensi harus di .test-deps proyek, bukan /tmp')
  assert.ok(!/deps = process\.env\.FRONTEND_TEST_DEPS \|\| '\/tmp\//.test(t),
    'default tidak boleh menunjuk /tmp lagi')
  const skrip = baca('scripts/siapkan-dependensi-uji.sh')
  assert.ok(/npm install --prefix/.test(skrip), 'harus ada skrip penyiapan dependensi')
})
