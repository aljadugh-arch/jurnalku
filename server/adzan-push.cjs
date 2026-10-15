'use strict'
/**
 * Notifikasi adzan ke perangkat (HP/tablet) lewat Web Push.
 *
 * Kenapa perlu: pemeriksa waktu di browser (src/components/AdzanNotifier.tsx)
 * hanya berjalan saat aplikasi TERBUKA dan tab-nya aktif. Di HP/tablet, tab
 * hampir selalu di-latar atau layar mati saat masuk waktu sholat — Chrome/Safari
 * menangguhkan timer, jadi adzan tidak pernah berbunyi. Satu-satunya jalur yang
 * tetap berfungsi saat aplikasi tertutup adalah Web Push dari server.
 *
 * Semantik waktu di sini SENGAJA disamakan dengan queueAdzanReminders (WA):
 * waktu dipilih `adzan_waktu`, maju `adzan_menit_awal` menit, toleransi ±5 menit,
 * dan tetap terkirim pada hari libur. Kanal perangkat memakai penanda `adzan_suara`
 * (baris lama tanpa kolom itu jatuh kembali ke `notif_adzan`) — jadi satu sakelar
 * yang sama mengendalikan suara di browser DAN notifikasi di HP, terpisah dari WA.
 */
const { WAKTU_SHOLAT, LABEL_WAKTU, jadwalSholatTenant } = require('./jadwal-sholat.cjs')
const { getTenantSettings } = require('./tenant-settings.cjs')
const { buatKunciVapid, kirimPush } = require('./web-push.cjs')

const VAPID_SUB = 'mailto:admin@jurnal.cc.cd'
const JENDELA_MENIT = 5
const MAKS_GAGAL = 10

/** Kunci VAPID persisten di app_config — DB ikut backup, tidak ikut ter-timpa deploy. */
function ambilVapid(db) {
  const baca = db.prepare('SELECT value FROM app_config WHERE key=?')
  const tulis = db.prepare('INSERT INTO app_config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
  let pub = baca.get('vapid_public')?.value
  let priv = baca.get('vapid_private')?.value
  if (!pub || !priv) {
    const k = buatKunciVapid()
    pub = k.publicKey; priv = k.privateKey
    const tx = db.transaction(() => { tulis.run('vapid_public', pub); tulis.run('vapid_private', priv) })
    tx()
  }
  return { publicKey: pub, privateKey: priv, sub: VAPID_SUB }
}

function langgananTenant(db, tenantId) {
  return db.prepare('SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE tenant_id=?').all(tenantId)
}

function hapusLangganan(db, endpoint) {
  try { db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(endpoint) } catch { /* diabaikan */ }
}

function catatGagal(db, id, pesan) {
  try {
    db.prepare('UPDATE push_subscriptions SET fail_count=COALESCE(fail_count,0)+1, last_err=? WHERE id=?')
      .run(String(pesan || '').slice(0, 200), id)
  } catch { /* diabaikan */ }
}

/** Kirim satu payload ke semua langganan sebuah tenant; bersihkan yang mati. */
async function sebarKeTenant(db, tenantId, payload, vapid, { kirimPushImpl = kirimPush } = {}) {
  const out = { dikirim: 0, gagal: 0, dibersihkan: 0 }
  const daftar = langgananTenant(db, tenantId)
  for (const s of daftar) {
    const r = await kirimPushImpl({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, vapid)
    if (r.ok) {
      out.dikirim++
      try { db.prepare('UPDATE push_subscriptions SET last_ok_at=datetime(\'now\'), fail_count=0, last_err=NULL WHERE id=?').run(s.id) } catch { /* diabaikan */ }
    } else if (r.status === 404 || r.status === 410) {
      hapusLangganan(db, s.endpoint); out.dibersihkan++
    } else {
      out.gagal++
      catatGagal(db, s.id, r.alasan)
      const pasca = db.prepare('SELECT fail_count FROM push_subscriptions WHERE id=?').get(s.id)
      if (pasca && pasca.fail_count >= MAKS_GAGAL) { hapusLangganan(db, s.endpoint); out.dibersihkan++ }
    }
  }
  return out
}

/** Payload notifikasi adzan yang seragam untuk klien. */
function payloadAdzan({ lembaga, kota, label, jam, tanggal, waktu, tenantId }) {
  return {
    type: 'adzan',
    title: `Waktu ${label} telah masuk`,
    body: `${kota || 'lokasi lembaga'} • ${jam}${lembaga ? ` — ${lembaga}` : ''}`,
    tag: `adzan-${tenantId}-${tanggal}-${waktu}`,
    url: '/',
    waktu, jam, tanggal, tenantId,
  }
}

/**
 * Dipanggil tiap menit oleh penjadwal. Mengembalikan ringkasan; `reason` menjelaskan
 * kenapa tidak ada yang dikirim, sama polanya seperti queueAdzanReminders.
 */
async function queueAdzanPush(db, { tenantId, date, time, force = false, paksaWaktu = '', kirimPushImpl = kirimPush } = {}) {
  const out = { dikirim: 0, gagal: 0, waktu: [] }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return { ...out, reason: 'invalid_date' }
  if (!time || !/^\d{2}:\d{2}$/.test(String(time))) return { ...out, reason: 'invalid_time' }
  const conf = db.prepare('SELECT * FROM notif_settings WHERE tenant_id=?').get(tenantId)
  // Kanal perangkat sahaja — cermin dari gerbang suara di klien.
  const perangkatAktif = conf?.adzan_wa == null ? !!conf?.notif_adzan : !!Number(conf?.adzan_suara)
  if (!force && !perangkatAktif) return { ...out, reason: 'disabled' }

  let jadwal
  try { jadwal = jadwalSholatTenant(db, tenantId, date) } catch { return { ...out, reason: 'invalid_coordinates' } }

  const dipilih = String(conf?.adzan_waktu || '').split(',').map(s => s.trim().toLowerCase()).filter(k => WAKTU_SHOLAT.includes(k))
  const paksa = String(paksaWaktu || '').trim().toLowerCase()
  const aktif = WAKTU_SHOLAT.includes(paksa) ? [paksa] : (dipilih.length ? dipilih : WAKTU_SHOLAT)
  const menitAwal = Math.max(0, Math.min(120, Number(conf?.adzan_menit_awal) || 0))

  const daftar = langgananTenant(db, tenantId)
  if (!daftar.length) return { ...out, reason: 'no_subscribers' }

  const vapid = ambilVapid(db)
  const lembaga = getTenantSettings(db, tenantId, 'nama_lembaga')?.nama_lembaga || 'Sekolah'
  const tickMenit = Number(String(time).slice(0, 2)) * 60 + Number(String(time).slice(3, 5))

  for (const waktu of aktif) {
    const jam = jadwal[waktu]
    if (!/^\d{2}:\d{2}$/.test(String(jam || ''))) continue
    const targetMenit = Number(String(jam).slice(0, 2)) * 60 + Number(String(jam).slice(3, 5)) - menitAwal
    if (!paksa && (tickMenit < targetMenit - JENDELA_MENIT || tickMenit > targetMenit + JENDELA_MENIT)) continue

    // Idempoten: satu kiriman per (tenant, tanggal, waktu) walau tick berulang.
    if (!paksa) {
      const ada = db.prepare('SELECT 1 FROM adzan_push_log WHERE tenant_id=? AND tanggal=? AND waktu=?').get(tenantId, date, waktu)
      if (ada) continue
      try { db.prepare('INSERT OR IGNORE INTO adzan_push_log(tenant_id,tanggal,waktu) VALUES(?,?,?)').run(tenantId, date, waktu) } catch { /* diabaikan */ }
    }

    const payload = payloadAdzan({
      lembaga, kota: jadwal.kota, label: LABEL_WAKTU[waktu] || waktu, jam, tanggal: date, waktu, tenantId,
    })
    const r = await sebarKeTenant(db, tenantId, payload, vapid, { kirimPushImpl })
    out.dikirim += r.dikirim; out.gagal += r.gagal
    out.waktu.push({ waktu, jam, ...r })
  }
  if (!out.waktu.length) out.reason = 'diluar_jendela'
  return out
}

/** Kirim-uji dari UI Pengaturan: ke perangkat satu pengguna, atau seluruh tenant. */
async function kirimUjiPush(db, { tenantId, userId = '', kirimPushImpl = kirimPush } = {}) {
  const vapid = ambilVapid(db)
  const rows = userId
    ? db.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE tenant_id=? AND user_id=?').all(tenantId, userId)
    : langgananTenant(db, tenantId)
  if (!rows.length) return { dikirim: 0, gagal: 0, reason: 'no_subscribers' }
  const lembaga = getTenantSettings(db, tenantId, 'nama_lembaga')?.nama_lembaga || 'Sekolah'
  const payload = {
    type: 'adzan-uji',
    title: 'Uji notifikasi JURNALKU',
    body: `Notifikasi perangkat aktif untuk ${lembaga}. Adzan akan muncul di sini.`,
    tag: `adzan-uji-${tenantId}`,
    url: '/',
  }
  let dikirim = 0, gagal = 0
  for (const s of rows) {
    const r = await kirimPushImpl({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, vapid)
    if (r.ok) dikirim++; else { gagal++; if (r.status === 404 || r.status === 410) hapusLangganan(db, s.endpoint) }
  }
  return { dikirim, gagal }
}

/** Daftar tenant yang punya pelanggan push — dipakai penjadwal supaya tidak menyisir semua. */
function tenantBerlangganan(db) {
  try { return db.prepare('SELECT DISTINCT tenant_id FROM push_subscriptions').all().map(r => r.tenant_id) } catch { return [] }
}

module.exports = { ambilVapid, queueAdzanPush, kirimUjiPush, payloadAdzan, sebarKeTenant, langgananTenant, tenantBerlangganan, JENDELA_MENIT }
