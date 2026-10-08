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
  // gerbang kanal SUARA saja — terpisah dari notif WA (adzan_wa):
  assert.match(notifier, /const suaraAktif = conf\.adzan_wa == null \? !!conf\.notif_adzan : !!Number\(conf\.adzan_suara\)/)
  assert.match(notifier, /if \(!suaraAktif\) return/)
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
  for (const k of ['adzan_wa', 'adzan_waktu', 'adzan_menit_awal', 'adzan_target', 'template_adzan', 'adzan_suara', 'adzan_suara_url']) {
    assert.match(page, new RegExp(k), `field ${k} harus ada di halaman pengaturan`)
  }
  // uji kirim per waktu
  assert.match(page, /api\.post\('\/notif\/adzan', \{ waktu \}\)/)
})

test('server: kanal WA adzan terpisah dari suara aplikasi (adzan_wa)', () => {
  const server = baca('server/index.cjs')
  const queue = baca('server/wa-queue.cjs')
  const page = baca('src/pages/admin/NotifSettingsPage.tsx')
  // kolom kanal WA berdiri sendiri, plus backfill sekali dari perilaku lama
  assert.match(server, /\['adzan_wa', 'INTEGER'\]/)
  assert.match(server, /SET adzan_wa = CASE WHEN COALESCE\(notif_adzan,0\)=1 THEN 1 ELSE 0 END[\s\S]{0,160}WHERE adzan_wa IS NULL/)
  // gerbang WA memakai adzan_wa; baris lama (adzan_wa NULL) jatuh ke notif_adzan
  const gate = /const waAktif = conf\?\.adzan_wa == null \? !!conf\?\.notif_adzan : !!Number\(conf\.adzan_wa\)/
  assert.match(queue, gate, 'antrean WA harus digerbangi adzan_wa')
  assert.match(server, gate, 'uji kirim WA harus digerbangi adzan_wa')
  // PUT menyimpan kanal WA eksplisit + menurunkan notif_adzan (klien lama tetap aman)
  assert.match(server, /const notifAdzanTurunan = \(adzanWaBaru \|\| adzanSuaraBaru\) \? 1 : 0/)
  assert.match(server, /UPDATE notif_settings SET[\s\S]*?adzan_wa=\?/)
  // UI: dua toggle yang berdiri sendiri
  assert.match(page, /checked=\{settings\.adzan_wa\}/)
  assert.match(page, /checked=\{settings\.adzan_suara\}/)
  assert.doesNotMatch(page, /checked=\{settings\.notif_adzan\}/)
})
