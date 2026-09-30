'use strict'

const { getTenantSettings } = require('./tenant-settings.cjs')

/**
 * Monitoring kelengkapan data lembaga.
 *
 * Dihitung murni dari `db` + `tenantId` supaya bisa diuji runtime dengan
 * database in-memory (tanpa HTTP/login), dan dipakai oleh
 * GET /api/dashboard/kelengkapan di server/index.cjs.
 *
 * Setiap item selalu punya bentuk { key, label, filled, total, persen, status }
 * dengan persen 0..100 dan status salah satu dari:
 *   lengkap (100) | hampir (>=75) | belum_lengkap (>=25) | kosong (<25)
 */

const STATUS_THRESHOLDS = { lengkap: 100, hampir: 75, belum_lengkap: 25 }

function statusUntuk(persen) {
  if (persen >= STATUS_THRESHOLDS.lengkap) return 'lengkap'
  if (persen >= STATUS_THRESHOLDS.hampir) return 'hampir'
  if (persen >= STATUS_THRESHOLDS.belum_lengkap) return 'belum_lengkap'
  return 'kosong'
}

function persenDari(filled, total) {
  if (!total || total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((filled / total) * 100)))
}

function hitungKelengkapan(db, tenantId, options = {}) {
  const tid = String(tenantId || '').trim()
  if (!tid) throw new Error('Tenant wajib untuk menghitung kelengkapan data')
  const today = options.today || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

  const count = (sql, ...params) => db.prepare(sql).get(...params).c

  const items = []

  // 1. Profil Lembaga — 4 field identitas wajib.
  const PROFILE_FIELDS = [
    ['nama_lembaga', 'nama lembaga'],
    ['alamat', 'alamat'],
    ['kepala_sekolah', 'kepala sekolah'],
    ['npsn', 'NPSN']
  ]
  const settings = getTenantSettings(db, tid, 'nama_lembaga, alamat, kepala_sekolah, npsn') || {}
  const profilKosong = PROFILE_FIELDS
    .filter(([kolom]) => String(settings[kolom] == null ? '' : settings[kolom]).trim() === '')
    .map(([, label]) => label)
  const profilFilled = PROFILE_FIELDS.length - profilKosong.length
  const profilPersen = persenDari(profilFilled, PROFILE_FIELDS.length)
  items.push({
    key: 'profil_lembaga',
    label: 'Profil Lembaga',
    filled: profilFilled,
    total: PROFILE_FIELDS.length,
    persen: profilPersen,
    status: statusUntuk(profilPersen),
    ...(profilKosong.length ? { detail: `Belum diisi: ${profilKosong.join(', ')}` } : {})
  })

  // 2. Data Siswa — identitas inti lengkap (nama, NIS, rombel, jenis kelamin).
  const totalSiswa = count('SELECT COUNT(*) as c FROM siswa WHERE tenant_id=?', tid)
  const siswaLengkap = count(
    `SELECT COUNT(*) as c FROM siswa WHERE tenant_id=?
       AND TRIM(COALESCE(nama,'')) != ''
       AND TRIM(COALESCE(nis,'')) != ''
       AND COALESCE(rombel_id,'') != '' AND COALESCE(rombel_id,'0') != '0'
       AND TRIM(COALESCE(jenis_kelamin,'')) != ''`,
    tid
  )
  const siswaPersen = persenDari(siswaLengkap, totalSiswa)
  const siswaKurang = totalSiswa - siswaLengkap
  items.push({
    key: 'data_siswa',
    label: 'Data Siswa',
    filled: siswaLengkap,
    total: totalSiswa,
    persen: siswaPersen,
    status: statusUntuk(siswaPersen),
    ...(totalSiswa === 0
      ? { detail: 'Belum ada data siswa' }
      : siswaKurang > 0
        ? { detail: `${siswaKurang} siswa belum lengkap (NIS/rombel/jenis kelamin kosong)` }
        : {})
  })

  // 3. Data GTK — identitas lengkap + sudah punya penugasan mengajar.
  // Identitas dianggap lengkap bila nama terisi DAN punya minimal satu nomor
  // identitas (NIP untuk PNS, NUPTK/NIK untuk GTK non-PNS). Menuntut NIP saja
  // membuat hampir semua GTK swasta selalu tampak "belum lengkap".
  const totalGTK = count('SELECT COUNT(*) as c FROM gtk WHERE tenant_id=?', tid)
  const gtkLengkap = count(
    `SELECT COUNT(*) as c FROM gtk WHERE tenant_id=?
       AND TRIM(COALESCE(nama,'')) != ''
       AND (TRIM(COALESCE(nip,'')) != '' OR TRIM(COALESCE(nuptk,'')) != '' OR TRIM(COALESCE(nik,'')) != '')`,
    tid
  )
  const gtkAdaMapel = count('SELECT COUNT(DISTINCT gtk_id) as c FROM pengajar WHERE tenant_id=?', tid)
  const gtkPersen = persenDari(gtkLengkap, totalGTK)
  const gtkKurang = totalGTK - gtkLengkap
  const gtkTanpaMapel = Math.max(0, totalGTK - gtkAdaMapel)
  const gtkDetail = []
  if (totalGTK === 0) gtkDetail.push('Belum ada data GTK')
  else {
    if (gtkKurang > 0) gtkDetail.push(`${gtkKurang} GTK belum lengkap (NIP/NUPTK/NIK kosong)`)
    if (gtkTanpaMapel > 0) gtkDetail.push(`${gtkTanpaMapel} GTK belum punya penugasan mapel`)
  }
  items.push({
    key: 'data_gtk',
    label: 'Data Guru / GTK',
    filled: gtkLengkap,
    total: totalGTK,
    persen: gtkPersen,
    status: statusUntuk(gtkPersen),
    punya_mapel: gtkAdaMapel,
    ...(gtkDetail.length ? { detail: gtkDetail.join('; ') } : {})
  })

  // 4. Mata Pelajaran — kehadiran data (ada = lengkap).
  const totalMapel = count('SELECT COUNT(*) as c FROM mapel WHERE tenant_id=?', tid)
  items.push({
    key: 'data_mapel',
    label: 'Mata Pelajaran',
    filled: totalMapel,
    total: totalMapel,
    persen: totalMapel > 0 ? 100 : 0,
    status: totalMapel > 0 ? 'lengkap' : 'kosong',
    ...(totalMapel === 0 ? { detail: 'Belum ada mata pelajaran' } : {})
  })

  // 5. Rombel — setiap rombel idealnya punya wali kelas.
  const totalRombel = count('SELECT COUNT(*) as c FROM rombel WHERE tenant_id=?', tid)
  const rombelAdaWali = count(
    `SELECT COUNT(*) as c FROM rombel WHERE tenant_id=?
       AND COALESCE(wali_kelas_id,'') != '' AND COALESCE(wali_kelas_id,'0') != '0'`,
    tid
  )
  const rombelPersen = persenDari(rombelAdaWali, totalRombel)
  const rombelTanpaWali = totalRombel - rombelAdaWali
  items.push({
    key: 'data_rombel',
    label: 'Rombongan Belajar',
    filled: rombelAdaWali,
    total: totalRombel,
    persen: rombelPersen,
    status: statusUntuk(rombelPersen),
    ...(totalRombel === 0
      ? { detail: 'Belum ada rombel' }
      : rombelTanpaWali > 0
        ? { detail: `${rombelTanpaWali} rombel belum punya wali kelas` }
        : {})
  })

  // 6. Kalender KBM — target 12 bulan tercover.
  const entriKalender = count('SELECT COUNT(*) as c FROM kalender_kbm WHERE tenant_id=?', tid)
  const bulanTercover = count(
    "SELECT COUNT(DISTINCT substr(tanggal,1,7)) as c FROM kalender_kbm WHERE tenant_id=? AND TRIM(COALESCE(tanggal,'')) != ''",
    tid
  )
  const kalenderPersen = persenDari(bulanTercover, 12)
  items.push({
    key: 'kalender_kbm',
    label: 'Kalender KBM',
    filled: bulanTercover,
    total: 12,
    persen: kalenderPersen,
    status: statusUntuk(kalenderPersen),
    entri: entriKalender,
    ...(entriKalender === 0
      ? { detail: 'Belum ada agenda kalender KBM' }
      : bulanTercover < 12
        ? { detail: `${bulanTercover} dari 12 bulan sudah terisi (${entriKalender} agenda)` }
        : {})
  })

  // 7. Jadwal Pelajaran — setiap rombel idealnya punya jadwal.
  const entriJadwal = count('SELECT COUNT(*) as c FROM jadwal WHERE tenant_id=?', tid)
  const rombelAdaJadwal = count('SELECT COUNT(DISTINCT rombel_id) as c FROM jadwal WHERE tenant_id=?', tid)
  const jadwalPersen = persenDari(rombelAdaJadwal, totalRombel)
  const rombelTanpaJadwal = Math.max(0, totalRombel - rombelAdaJadwal)
  items.push({
    key: 'jadwal_pelajaran',
    label: 'Jadwal Pelajaran',
    filled: rombelAdaJadwal,
    total: totalRombel,
    persen: jadwalPersen,
    status: statusUntuk(jadwalPersen),
    entri: entriJadwal,
    ...(totalRombel === 0
      ? { detail: 'Belum ada rombel untuk dijadwalkan' }
      : entriJadwal === 0
        ? { detail: 'Belum ada jadwal pelajaran' }
        : rombelTanpaJadwal > 0
          ? { detail: `${rombelTanpaJadwal} rombel belum punya jadwal` }
          : {})
  })

  // 8. Penilaian Harian — siswa yang sudah punya nilai yang benar-benar terisi.
  // Baris nilai dengan seluruh angka 0 diperlakukan sebagai belum terisi: guru
  // pernah menekan simpan tanpa mengisi angkanya. Kasus inilah yang membuat
  // nilai harian "terlihat ada tapi hilang" di rapor.
  const NILAI_TERISI = "(COALESCE(pengetahuan,0) > 0 OR COALESCE(keaktifan,0) > 0 OR COALESCE(sikap,0) > 0)"
  const entriPenilaian = count(`SELECT COUNT(*) as c FROM penilaian_harian WHERE tenant_id=? AND ${NILAI_TERISI}`, tid)
  const entriPenilaianKosong = count(`SELECT COUNT(*) as c FROM penilaian_harian WHERE tenant_id=? AND NOT ${NILAI_TERISI}`, tid)
  const siswaAdaNilai = count(`SELECT COUNT(DISTINCT siswa_id) as c FROM penilaian_harian WHERE tenant_id=? AND ${NILAI_TERISI}`, tid)
  const penilaianPersen = persenDari(siswaAdaNilai, totalSiswa)
  const siswaTanpaNilai = Math.max(0, totalSiswa - siswaAdaNilai)
  const penilaianDetail = []
  if (totalSiswa === 0) penilaianDetail.push('Belum ada siswa untuk dinilai')
  else {
    if (siswaTanpaNilai > 0) penilaianDetail.push(`${siswaTanpaNilai} siswa belum punya nilai`)
    if (entriPenilaianKosong > 0) penilaianDetail.push(`${entriPenilaianKosong} baris nilai tersimpan tanpa angka (0)`)
  }
  items.push({
    key: 'penilaian_harian',
    label: 'Penilaian Harian',
    filled: siswaAdaNilai,
    total: totalSiswa,
    persen: penilaianPersen,
    status: statusUntuk(penilaianPersen),
    entri: entriPenilaian,
    entri_kosong: entriPenilaianKosong,
    ...(penilaianDetail.length ? { detail: penilaianDetail.join('; ') } : {})
  })

  // 9. Rapor — siswa yang sudah punya rapor tergenerate.
  const entriRapor = count('SELECT COUNT(*) as c FROM rapor WHERE tenant_id=?', tid)
  const siswaAdaRapor = count('SELECT COUNT(DISTINCT siswa_id) as c FROM rapor WHERE tenant_id=?', tid)
  const raporPersen = persenDari(siswaAdaRapor, totalSiswa)
  const siswaTanpaRapor = Math.max(0, totalSiswa - siswaAdaRapor)
  items.push({
    key: 'rapor',
    label: 'Rapor',
    filled: siswaAdaRapor,
    total: totalSiswa,
    persen: raporPersen,
    status: statusUntuk(raporPersen),
    entri: entriRapor,
    ...(totalSiswa === 0
      ? { detail: 'Belum ada siswa' }
      : entriRapor === 0
        ? { detail: 'Rapor belum digenerate' }
        : siswaTanpaRapor > 0
          ? { detail: `${siswaTanpaRapor} siswa belum punya rapor` }
          : {})
  })

  // 10. Absensi hari ini — keterisian absensi siswa & guru.
  const siswaAbsenHariIni = count(
    'SELECT COUNT(DISTINCT siswa_id) as c FROM absensi_siswa WHERE tanggal=? AND tenant_id=?',
    today, tid
  )
  const guruAbsenHariIni = count(
    'SELECT COUNT(DISTINCT gtk_id) as c FROM absensi_guru WHERE tanggal=? AND tenant_id=?',
    today, tid
  )
  const absensiPersenSiswa = persenDari(siswaAbsenHariIni, totalSiswa)
  const absensiPersenGuru = persenDari(guruAbsenHariIni, totalGTK)
  const absensiPersen = totalSiswa + totalGTK > 0
    ? Math.round((absensiPersenSiswa + absensiPersenGuru) / 2)
    : 0
  items.push({
    key: 'absensi_hari_ini',
    label: 'Absensi Hari Ini',
    filled: siswaAbsenHariIni + guruAbsenHariIni,
    total: totalSiswa + totalGTK,
    persen: absensiPersen,
    status: statusUntuk(absensiPersen),
    detail: `Siswa: ${siswaAbsenHariIni}/${totalSiswa} · Guru: ${guruAbsenHariIni}/${totalGTK} (${today})`
  })

  const skorKeseluruhan = items.length
    ? Math.round(items.reduce((sum, item) => sum + item.persen, 0) / items.length)
    : 0

  const belumLengkap = items.filter(item => item.persen < 100).map(item => item.key)

  return {
    items,
    skor_keseluruhan: skorKeseluruhan,
    status_keseluruhan: statusUntuk(skorKeseluruhan),
    jumlah_lengkap: items.length - belumLengkap.length,
    jumlah_item: items.length,
    belum_lengkap: belumLengkap,
    dihitung_pada: new Date().toISOString()
  }
}

module.exports = { hitungKelengkapan, statusUntuk, persenDari, STATUS_THRESHOLDS }
