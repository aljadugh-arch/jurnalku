const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const baca = f => fs.readFileSync(path.join(root, f), 'utf8')

test('klien: pemutar adzan terpasang di layout dashboard', () => {
  const notifier = baca('src/components/AdzanNotifier.tsx')
  const layout = baca('src/components/layout/DashboardLayout.tsx')
  assert.match(layout, /<AdzanNotifier \/>/)
  // suara bawaan ikut dibundel
  assert.ok(fs.existsSync(path.join(root, 'public', 'adhan.mp3')), 'public/adhan.mp3 harus ada')
  assert.match(notifier, /'\/adhan\.mp3'/)
  // kepatuhan lisensi aset
  assert.ok(fs.existsSync(path.join(root, 'public', 'adhan-LISENSI.txt')), 'keterangan lisensi adhan wajib ada')
})

test('klien: hanya peran staf yang mendengar adzan', () => {
  const notifier = baca('src/components/AdzanNotifier.tsx')
  assert.match(notifier, /PERAN_STAF/)
  for (const peran of ['guru', 'admin', 'kepala', 'bendahara']) assert.match(notifier, new RegExp(`'${peran}'`))
  // siswa & wali murid tidak termasuk
  assert.doesNotMatch(notifier, /PERAN_STAF = \[[^\]]*'siswa'/)
  assert.doesNotMatch(notifier, /PERAN_STAF = \[[^\]]*'wali_murid'/)
})

test('klien: hanya berbunyi di jendela sempit dan tidak mengulang', () => {
  const notifier = baca('src/components/AdzanNotifier.tsx')
  assert.match(notifier, /JENDELA_MENIT/)
  assert.match(notifier, /KUNCI_SIMPAN/)
  assert.match(notifier, /localStorage/)
  // gerbang fitur berada di efek pemeriksa waktu (bukan lagi di dalam render):
  // komponen HARUS tetap ter-render untuk staf supaya elemen audio terpasang dan
  // bisa "dipanaskan" pada gestur pertama, walau admin belum menyalakan fitur.
  assert.match(notifier, /if \(!staf \|\| !jadwal \|\| !conf\) return/)
  assert.match(notifier, /if \(!conf\.notif_adzan \|\| !conf\.adzan_suara\) return/)
  assert.match(notifier, /if \(!staf\) return null/)
  assert.match(notifier, /data-adzan-putar="true"/)
  assert.match(notifier, /data-adzan-hentikan="true"/)
})

test('klien: elemen audio terpasang walau fitur belum dinyalakan + gestur pertama tidak sekalian terbuang', () => {
  const notifier = baca('src/components/AdzanNotifier.tsx')
  // Elemen audio TIDAK boleh berada di dalam blok kondisional yang menunggu
  // notif_adzan/adzan_suara — kalau ya, gestur pertama hanya menemukan
  // audioRef.current === null, pemanasan gagal, dan autoplay terkunci permanen.
  const setelahGuard = notifier.slice(notifier.indexOf('if (!staf) return null'))
  assert.match(setelahGuard, /<audio ref=\{audioRef\}/, 'elemen audio harus ada setelah guard staf saja')
  // listener gestur tidak boleh pakai { once: true }
  assert.doesNotMatch(notifier, /addEventListener\('pointerdown', buka, \{ once: true \}\)/)
  assert.doesNotMatch(notifier, /addEventListener\('keydown', buka, \{ once: true \}\)/)
})

test('UI: kartu adzan menyediakan uji suara langsung + info adzan berikutnya', () => {
  const page = baca('src/pages/admin/NotifSettingsPage.tsx')
  assert.match(page, /data-adzan-uji-suara="true"/)
  assert.match(page, /data-adzan-contoh="true"/)
  assert.match(page, /putarContohSuara/)
  assert.match(page, /Adzan berikutnya/)
  assert.match(page, /api\.get\('\/jadwal-sholat'\)/)
})

test('server: adzan memakai sumber waktu yang sama dengan kartu jadwal sholat', () => {
  const server = baca('server/index.cjs')
  const queue = baca('server/wa-queue.cjs')
  assert.match(server, /jadwalSholatTenant\(db, req\.tenantId, tanggal\)/)
  assert.match(queue, /jadwalSholatTenant\(db, tenantId, date\)/)
  // penjadwal ganda: proses API dan worker WA
  assert.match(server, /waQueue\.queueAdzanReminders\(db, \{ tenantId: t\.id, date, time \}\)/)
  assert.match(baca('server/wa-worker.mjs'), /queue\.queueAdzanReminders\(db,\{tenantId:c\.tenant_id/)
})

test('server: PUT notif-settings membuat baris bila tenant belum punya', () => {
  const server = baca('server/index.cjs')
  const blok = server.slice(server.indexOf("app.put('/api/notif-settings'"))
  assert.match(blok.slice(0, 400), /INSERT OR IGNORE INTO notif_settings/)
})

test('UI: kartu pengaturan adzan lengkap', () => {
  const page = baca('src/pages/admin/NotifSettingsPage.tsx')
  assert.match(page, /Notifikasi Adzan/)
  assert.match(page, /Suara adzan di aplikasi/)
  for (const k of ['notif_adzan', 'adzan_waktu', 'adzan_menit_awal', 'adzan_target', 'template_adzan', 'adzan_suara', 'adzan_suara_url']) {
    assert.match(page, new RegExp(k), `field ${k} harus ada di halaman pengaturan`)
  }
  // uji kirim per waktu
  assert.match(page, /api\.post\('\/notif\/adzan', \{ waktu \}\)/)
})
