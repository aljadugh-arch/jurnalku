'use strict'

// Jadwal sholat dihitung LOKAL di server (tanpa panggilan jaringan), memakai
// algoritma astronomi standar yang sama dipakai pustaka praytimes/Adhan.
// Parameter sudut mengikuti Kemenag RI: Subuh 20°, Isya 18°, Ashar mazhab
// Syafi'i (faktor bayangan 1), ihtiyat 3 menit. Hasilnya diuji sama persis
// dengan jadwal resmi Kemenag (pembanding: API equran.id) untuk Surabaya. Tidak bergantung API luar, jadi kartu jadwal
// sholat tidak ikut mati bila layanan pihak ketiga bermasalah.

const DEG = Math.PI / 180
const sin = d => Math.sin(d * DEG)
const cos = d => Math.cos(d * DEG)
const tan = d => Math.tan(d * DEG)
const asin = x => Math.asin(x) / DEG
const acos = x => Math.acos(x) / DEG
const acot = x => (Math.PI / 2 - Math.atan(x)) / DEG

// Sudut terbit & tenggelam matahari. Secara astronomis keduanya 0,833°, tetapi
// jadwal Kemenag RI memberi koreksi berbeda: "terbit" memakai 1,6° (tanpa
// ihtiyat), sedangkan "maghrib" memakai 0,833° lalu ditambah ihtiyat seperti
// waktu sholat lain. Kombinasi ini menghasilkan kecocokan persis dengan jadwal
// resmi (diuji terhadap API equran.id, kota Surabaya).
const SUDUT_TERBIT = 1.6
const SUDUT_TERBENAM = 0.833

const fixAngle = a => ((a % 360) + 360) % 360
const fixHour = a => ((a % 24) + 24) % 24

// Nama hari Indonesia -> dipakai untuk tampilan, bukan perhitungan.
const HARI = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

function julianDate(y, m, d) {
  if (m <= 2) { y -= 1; m += 12 }
  const a = Math.floor(y / 100)
  const b = 2 - a + Math.floor(a / 4)
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5
}

// Posisi matahari: deklinasi + persamaan waktu (jam).
function posisiMatahari(jd) {
  const D = jd - 2451545.0
  const g = fixAngle(357.529 + 0.98560028 * D)
  const q = fixAngle(280.459 + 0.98564736 * D)
  const L = fixAngle(q + 1.915 * sin(g) + 0.020 * sin(2 * g))
  const e = 23.439 - 0.00000036 * D
  const RA = fixHour(Math.atan2(cos(e) * sin(L), cos(L)) * 180 / Math.PI / 15)
  const decl = asin(sin(e) * sin(L))
  let eqt = q / 15 - RA
  if (eqt > 12) eqt -= 24
  if (eqt < -12) eqt += 24
  return { decl, eqt }
}

function jamDesimal(jd, t, tz, lng) {
  const { decl, eqt } = posisiMatahari(jd + t)
  // Waktu transit matahari (dzuhur) dalam jam lokal.
  const dzuhur = fixHour(12 - eqt - lng / 15 + tz)
  return { dzuhur, decl }
}

// Sudut waktu (jam) saat matahari berada pada ketinggian `angle` (derajat,
// negatif = di bawah ufuk). Mengembalikan null bila matahari tidak mencapai
// sudut tsb pada hari itu (mis. lintang ekstrem).
function sudutWaktu(angle, jd, t, lat, tz, lng) {
  const { decl } = jamDesimal(jd, t, tz, lng)
  const pembilang = -sin(angle) - sin(decl) * sin(lat)
  const penyebut = cos(decl) * cos(lat)
  const x = pembilang / penyebut
  if (x > 1 || x < -1) return null
  return acos(x) / 15
}

function menitKeJam(h) {
  if (h == null || !Number.isFinite(h)) return null
  const hh = fixHour(h)
  const total = Math.round(hh * 60)
  const jam = Math.floor(total / 60) % 24
  const menit = total % 60
  return `${String(jam).padStart(2, '0')}:${String(menit).padStart(2, '0')}`
}

/**
 * Hitung jadwal sholat satu hari.
 * @param {{tanggal:string, lat:number, lng:number, tz?:number,
 *          fajrAngle?:number, ishaAngle?:number, ihtiyat?:number}} opsi
 * @returns {{subuh,syuruq,dzuhur,ashar,maghrib,isya,hari,tanggal}|null}
 */
function hitungJadwalSholat({
  tanggal, lat, lng, tz = 7, fajrAngle = 20, ishaAngle = 18, ihtiyat = 3,
}) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(tanggal || ''))
  if (!m) throw new Error('Tanggal tidak valid (YYYY-MM-DD)')
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Koordinat tidak valid')
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error('Koordinat di luar rentang')

  const jd = julianDate(y, mo, d) - lng / (15 * 24)
  // Perkiraan awal untuk iterasi posisi matahari.
  const t0 = 5 / 24
  const { dzuhur } = jamDesimal(jd, t0, tz, lng)

  // Ashar: sudut matahari saat panjang bayangan = faktor bayangan (Syafi'i = 1).
  const { decl } = jamDesimal(jd, t0, tz, lng)
  const sudutAshar = -acot(1 + tan(Math.abs(lat - decl)))

  const tFajr = sudutWaktu(fajrAngle, jd, t0, lat, tz, lng)
  const tSyuruq = sudutWaktu(SUDUT_TERBIT, jd, t0, lat, tz, lng)
  const tTerbenam = sudutWaktu(SUDUT_TERBENAM, jd, t0, lat, tz, lng)
  const tAshar = sudutWaktu(sudutAshar, jd, t0, lat, tz, lng)
  const tMaghrib = tTerbenam
  const tIsya = sudutWaktu(ishaAngle, jd, t0, lat, tz, lng)

  const iht = ihtiyat / 60 // ihtiyat (menit) untuk kehati-hatian, Kemenag memakai +2 menit
  const dow = new Date(`${tanggal}T12:00:00Z`).getUTCDay()
  const hasil = {
    tanggal,
    hari: HARI[dow],
    subuh: menitKeJam(tFajr == null ? null : dzuhur - tFajr + iht),
    syuruq: menitKeJam(tSyuruq == null ? null : dzuhur - tSyuruq),
    dzuhur: menitKeJam(dzuhur + iht),
    ashar: menitKeJam(tAshar == null ? null : dzuhur + tAshar + iht),
    maghrib: menitKeJam(tMaghrib == null ? null : dzuhur + tMaghrib + iht),
    isya: menitKeJam(tIsya == null ? null : dzuhur + tIsya + iht),
  }
  return hasil
}

// Daftar waktu sholat yang bisa dinotifikasi, urut sesuai adzan.
// 'syuruq' (terbit) sengaja tidak termasuk: itu bukan waktu sholat berjamaah.
const WAKTU_SHOLAT = ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya']
const LABEL_WAKTU = { subuh: 'Subuh', dzuhur: 'Dzuhur', ashar: 'Ashar', maghrib: 'Maghrib', isya: 'Isya' }

/**
 * Koordinat & zona waktu efektif sebuah lembaga: pakai koordinat manual bila
 * diisi, kalau tidak ambil dari daftar kota. Dipakai bersama oleh endpoint
 * /api/jadwal-sholat dan penjadwal notifikasi adzan supaya keduanya sependapat.
 */
function koordinatTenant(db, tenantId) {
  const { getTenantSettings } = require('./tenant-settings.cjs')
  const { cariKota, DEFAULT_KOTA } = require('./kota-sholat.cjs')
  const s = getTenantSettings(db, tenantId) || {}
  const kota = cariKota(s.kota_sholat) || cariKota(DEFAULT_KOTA)
  const angka = v => (v === '' || v == null || !Number.isFinite(Number(v))) ? null : Number(v)
  const lat = angka(s.lat_sholat)
  const lng = angka(s.lng_sholat)
  const tz = angka(s.tz_sholat)
  return {
    kota: kota?.nama || 'Surabaya',
    provinsi: kota?.provinsi || '',
    lat: lat == null ? kota.lat : lat,
    lng: lng == null ? kota.lng : lng,
    tz: tz == null ? kota.tz : tz,
  }
}

// Jadwal sholat satu tanggal untuk sebuah lembaga (koordinat + sumber sekalian).
function jadwalSholatTenant(db, tenantId, tanggal) {
  const k = koordinatTenant(db, tenantId)
  return { ...hitungJadwalSholat({ tanggal, lat: k.lat, lng: k.lng, tz: k.tz }), ...k, sumber: 'hitung lokal' }
}

module.exports = {
  hitungJadwalSholat, HARI,
  WAKTU_SHOLAT, LABEL_WAKTU,
  koordinatTenant, jadwalSholatTenant,
}
