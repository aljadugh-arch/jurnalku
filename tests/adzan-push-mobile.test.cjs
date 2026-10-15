const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { queueAdzanPush, kirimUjiPush, ambilVapid, tenantBerlangganan } = require('../server/adzan-push.cjs')
const { hitungJadwalSholat } = require('../server/jadwal-sholat.cjs')

/*
 * Inti perbaikan "notif adzan tidak muncul di HP/tablet": jalur push server.
 * Timer di halaman ditangguhkan peramban saat tab masuk latar/layar mati, jadi
 * satu-satunya jalur yang tetap sampai adalah Web Push dari server. Tes ini
 * mengunci semantik waktu (sama dengan kanal WA), idempotensi, dan pembersihan
 * langganan mati — semuanya tanpa jaringan (pengirim disuntik).
 */
const LAT = -7.2575, LNG = 112.7521, TZ = 7
const TANGGAL = '2026-10-06'
const WAKTU = hitungJadwalSholat({ tanggal: TANGGAL, lat: LAT, lng: LNG, tz: TZ })

function fixture({ adzanSuara = 1, adzanWa = 0, notifAdzan = 1, dipilih = 'subuh,dzuhur,ashar,maghrib,isya', menitAwal = 0, langganan = 2, kolomAdzanWa = true } = {}) {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE settings (id TEXT, tenant_id TEXT, nama_lembaga TEXT, hari_libur TEXT,
      kota_sholat TEXT, lat_sholat REAL, lng_sholat REAL, tz_sholat INTEGER);
    CREATE TABLE notif_settings (tenant_id TEXT PRIMARY KEY, notif_adzan INTEGER, adzan_wa INTEGER,
      adzan_waktu TEXT, adzan_menit_awal INTEGER, adzan_target TEXT, template_adzan TEXT,
      adzan_suara INTEGER, adzan_suara_url TEXT);
    CREATE TABLE app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);
    CREATE TABLE push_subscriptions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT,
      endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, ua TEXT,
      created_at TEXT, last_ok_at TEXT, last_err TEXT, fail_count INTEGER DEFAULT 0);
    CREATE TABLE adzan_push_log (tenant_id TEXT NOT NULL, tanggal TEXT NOT NULL, waktu TEXT NOT NULL,
      sent_at TEXT, PRIMARY KEY (tenant_id, tanggal, waktu));
  `)
  db.prepare('INSERT INTO settings VALUES (?,?,?,?,?,?,?,?)').run('main_t1', 't1', 'MTs Uji', '[]', 'Surabaya', LAT, LNG, TZ)
  db.prepare('INSERT INTO notif_settings VALUES (?,?,?,?,?,?,?,?,?)')
    .run('t1', notifAdzan, kolomAdzanWa ? adzanWa : null, dipilih, menitAwal, 'gtk', '', adzanSuara, '')
  db.prepare('INSERT INTO settings VALUES (?,?,?,?,?,?,?,?)').run('main_t2', 't2', 'Lembaga Lain', '[]', 'Surabaya', LAT, LNG, TZ)
  for (let i = 1; i <= langganan; i++) {
    db.prepare('INSERT INTO push_subscriptions (id,tenant_id,user_id,endpoint,p256dh,auth,fail_count) VALUES (?,?,?,?,?,?,0)')
      .run(`s${i}`, 't1', `u${i}`, `https://push.example/${i}`, 'p'.repeat(20) + i, 'a'.repeat(20) + i)
  }
  return db
}

const pengirim = (hasil = { ok: true, status: 201 }) => {
  const kiriman = []
  const fn = async (sub, payload) => { kiriman.push({ sub, payload }); return typeof hasil === 'function' ? hasil(sub) : hasil }
  fn.kiriman = kiriman
  return fn
}

test('push adzan: sakelar perangkat mati → tidak mengirim', async () => {
  const db = fixture({ adzanSuara: 0, adzanWa: 0 })
  const kirim = pengirim()
  const r = await queueAdzanPush(db, { tenantId: 't1', date: TANGGAL, time: WAKTU.dzuhur, kirimPushImpl: kirim })
  assert.equal(r.reason, 'disabled')
  assert.equal(r.dikirim, 0)
  assert.equal(kirim.kiriman.length, 0)
})

test('push adzan: baris lama tanpa kolom adzan_wa jatuh ke notif_adzan', async () => {
  const db = fixture({ kolomAdzanWa: false, notifAdzan: 0 })
  const r = await queueAdzanPush(db, { tenantId: 't1', date: TANGGAL, time: WAKTU.dzuhur, kirimPushImpl: pengirim() })
  assert.equal(r.reason, 'disabled')
})

test('push adzan: tanpa pelanggan perangkat → no_subscribers', async () => {
  const db = fixture({ langganan: 0 })
  const r = await queueAdzanPush(db, { tenantId: 't1', date: TANGGAL, time: WAKTU.maghrib, kirimPushImpl: pengirim() })
  assert.equal(r.reason, 'no_subscribers')
})

test('push adzan: tepat waktu → kirim ke SEMUA perangkat tenant dengan payload benar', async () => {
  const db = fixture({ langganan: 3 })
  const kirim = pengirim()
  const r = await queueAdzanPush(db, { tenantId: 't1', date: TANGGAL, time: WAKTU.ashar, kirimPushImpl: kirim })
  assert.equal(r.dikirim, 3)
  assert.equal(kirim.kiriman.length, 3)
  const p = kirim.kiriman[0].payload
  assert.equal(p.type, 'adzan')
  assert.equal(p.title, 'Waktu Ashar telah masuk')
  assert.match(p.body, /Surabaya/)
  assert.match(p.body, new RegExp(WAKTU.ashar))
  assert.match(p.body, /MTs Uji/)
  assert.equal(p.tag, `adzan-t1-${TANGGAL}-ashar`)
  assert.equal(p.url, '/')
  // hanya perangkat tenant t1 (t2 tidak punya langganan di fixture ini)
  assert.ok(kirim.kiriman.every(k => String(k.sub.endpoint).includes('push.example')))
})

test('push adzan: idempoten — tick berikutnya tidak menggandakan', async () => {
  const db = fixture()
  const kirim = pengirim()
  assert.equal((await queueAdzanPush(db, { tenantId: 't1', date: TANGGAL, time: WAKTU.isya, kirimPushImpl: kirim })).dikirim, 2)
  assert.equal((await queueAdzanPush(db, { tenantId: 't1', date: TANGGAL, time: WAKTU.isya, kirimPushImpl: kirim })).dikirim, 0)
  assert.equal(kirim.kiriman.length, 2)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM adzan_push_log').get().c, 1)
})

test('push adzan: di luar jendela ±5 menit tidak mengirim', async () => {
  const db = fixture()
  const geser = (jam, detik) => {
    const [h, m] = jam.split(':').map(Number)
    const t = h * 60 + m + detik
    return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
  }
  const kirim = pengirim()
  assert.equal((await queueAdzanPush(db, { tenantId: 't1', date: TANGGAL, time: geser(WAKTU.subuh, -30), kirimPushImpl: kirim })).dikirim, 0)
  assert.equal((await queueAdzanPush(db, { tenantId: 't1', date: TANGGAL, time: geser(WAKTU.subuh, 30), kirimPushImpl: kirim })).dikirim, 0)
  assert.equal(kirim.kiriman.length, 0)
})

test('push adzan: adzan_menit_awal memajukan jadwal', async () => {
  const db = fixture({ menitAwal: 10 })
  const kirim = pengirim()
  const [h, m] = WAKTU.dzuhur.split(':').map(Number)
  const t = h * 60 + m - 10
  const maju = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
  assert.equal((await queueAdzanPush(db, { tenantId: 't1', date: TANGGAL, time: maju, kirimPushImpl: kirim })).dikirim, 2)
  // jam adzan asli (tanpa maju) sudah di luar jendela karena tertutup log
  assert.equal(kirim.kiriman.length, 2)
})

test('push adzan: langganan mati (410) dibersihkan, bukan dihitung gagal', async () => {
  const db = fixture({ langganan: 2 })
  const kirim = pengirim(sub => (sub.endpoint.endsWith('/1') ? { ok: false, status: 410, alasan: 'gone' } : { ok: true, status: 201 }))
  const r = await queueAdzanPush(db, { tenantId: 't1', date: TANGGAL, time: WAKTU.subuh, kirimPushImpl: kirim })
  assert.equal(r.dikirim, 1)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM push_subscriptions').get().c, 1)
})

test('push adzan: paksaWaktu mengabaikan jam & idempotensi (untuk uji kirim)', async () => {
  const db = fixture()
  const kirim = pengirim()
  const r = await queueAdzanPush(db, { tenantId: 't1', date: TANGGAL, time: '03:00', paksaWaktu: 'isya', kirimPushImpl: kirim })
  assert.equal(r.dikirim, 2)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM adzan_push_log').get().c, 0)
})

test('VAPID: kunci dibuat sekali lalu dipakai ulang (persisten di app_config)', () => {
  const db = fixture()
  const a = ambilVapid(db)
  const b = ambilVapid(db)
  assert.equal(a.publicKey, b.publicKey)
  assert.equal(a.privateKey, b.privateKey)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM app_config').get().c, 2)
  assert.ok(a.publicKey.length >= 80 && a.privateKey.length >= 40)
  assert.match(a.sub, /^mailto:/)
})

test('kirim uji: no_subscribers bila belum ada perangkat, sukses setelah ada', async () => {
  const db = fixture({ langganan: 0 })
  assert.equal((await kirimUjiPush(db, { tenantId: 't1', userId: 'u1' })).reason, 'no_subscribers')
  db.prepare('INSERT INTO push_subscriptions (id,tenant_id,user_id,endpoint,p256dh,auth,fail_count) VALUES (?,?,?,?,?,?,0)')
    .run('s9', 't1', 'u1', 'https://push.example/9', 'x'.repeat(20), 'y'.repeat(20))
  const r = await kirimUjiPush(db, { tenantId: 't1', userId: 'u1', kirimPushImpl: pengirim() })
  assert.deepEqual({ dikirim: r.dikirim, gagal: r.gagal }, { dikirim: 1, gagal: 0 })
})

test('tenantBerlangganan: hanya tenant yang punya perangkat', () => {
  const db = fixture()
  assert.deepEqual(tenantBerlangganan(db), ['t1'])
})
