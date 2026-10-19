const HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']

function hariJakarta(date = new Date()) {
  const nama = new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' }).format(date)
  return nama.toLocaleLowerCase('id-ID')
}

function sesiAbsensiSiswa({ waktu, jamPulang, fallbackPulang, explicit, aktif }) {
  if (aktif === false || aktif === 0) throw new Error('Hari libur untuk rombel ini')
  if (explicit != null && !['masuk', 'pulang'].includes(explicit)) throw new Error('Sesi tidak valid')
  if (explicit) return explicit
  const batas = jamPulang || fallbackPulang
  return batas && waktu >= batas ? 'pulang' : 'masuk'
}

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date
}

function formatDateOnly(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function dateRange(start, end) {
  const out = []
  const from = parseDateOnly(start)
  const to = parseDateOnly(end)
  if (!from || !to || from > to) return out
  for (const current = new Date(from); current <= to && out.length < 370; current.setUTCDate(current.getUTCDate() + 1)) {
    out.push(formatDateOnly(current))
  }
  return out
}

// Status yang berarti siswa TIDAK hadir. Edit manual ke salah satu status ini
// selalu menang — inilah pengecualian yang diminta: petugas boleh mengoreksi
// anak yang terlanjur tercatat 'hadir' oleh scan menjadi sakit/izin/alpha.
const STATUS_NON_HADIR = new Set(['sakit', 'izin', 'alpha'])
// Metode yang menandakan baris lahir dari SCAN (QR / kartu RFID / alat mandiri).
const METODE_SCAN = new Set(['qr', 'rfid', 'device'])

// Menulis satu sesi absensi (masuk atau pulang). Aturan prioritas:
//   1. Hasil scan QR/RFID/alat adalah acuan ('hadir').
//   2. Edit manual ke sakit/izin/alpha SELALU menimpa, termasuk hasil scan.
//   3. Edit manual ke 'hadir' tidak menimpa catatan hasil scan (hanya boleh
//      mengoreksi catatan yang lahir dari input manual).
//   4. Tulis hasil scan tidak pernah menimpa apa pun yang sudah terisi.
// Nilai sama dengan yang tersimpan = tidak menulis ulang (hemat + tidak
// memicu notifikasi WA ganda).
//
// `sumber`: 'scan' | 'manual'. Parameter lama `overwrite=true` tetap didukung
// dan dipetakan ke sumber 'manual'.
function writeDailyAttendanceSession(db, {
  id, tenantId, siswaId, rombelId = null, tanggal, status, waktu = null,
  metode = 'manual', keterangan = '', jenis = 'masuk', sumber = null, overwrite,
}) {
  const isPulang = jenis === 'pulang'
  const sessionField = isPulang ? 'status_pulang' : 'status'
  const asal = sumber || (overwrite === true ? 'manual' : 'scan')
  const existing = db.prepare('SELECT id, status, status_pulang, metode FROM absensi_siswa WHERE siswa_id=? AND tanggal=? AND tenant_id=?')
    .get(siswaId, tanggal, tenantId)

  if (existing?.[sessionField]) {
    const lama = String(existing[sessionField])
    const bolehMenimpa = STATUS_NON_HADIR.has(status)
      || (asal === 'manual' && !METODE_SCAN.has(String(existing.metode || '')))
    if (!bolehMenimpa || lama === status) {
      return { id: existing.id, already: true, status: lama, jenis: isPulang ? 'pulang' : 'masuk' }
    }
  }

  if (existing) {
    const sql = isPulang
      ? "UPDATE absensi_siswa SET status_pulang=?, waktu_pulang=?, keterangan_pulang=?, metode=COALESCE(NULLIF(?,''),metode) WHERE id=? AND tenant_id=?"
      : "UPDATE absensi_siswa SET status=?, waktu_absen=?, waktu_masuk=?, metode=?, keterangan=? WHERE id=? AND tenant_id=?"
    const result = isPulang
      ? db.prepare(sql).run(status, waktu, keterangan, metode, existing.id, tenantId)
      : db.prepare(sql).run(status, waktu, waktu, metode, keterangan, existing.id, tenantId)
    const saved = db.prepare('SELECT id, status, status_pulang FROM absensi_siswa WHERE id=? AND tenant_id=?').get(existing.id, tenantId)
    return { id: saved.id, already: !result.changes, status: saved[sessionField], jenis: isPulang ? 'pulang' : 'masuk' }
  }

  // PENTING: saat hanya sesi PULANG yang tercatat, kolom `status` (masuk) harus
  // tetap KOSONG — itu memang benar, karena siswa belum pernah scan masuk.
  // Yang salah adalah UI yang menampilkannya seolah "sudah hadir".
  //
  // Jangan mengisi `status` dengan 'hadir' di sini: memalsukan kehadiran masuk
  // akan membuat rekap, notifikasi wali, dan laporan JTM salah.
  const insert = isPulang
    ? {
        sql: `INSERT INTO absensi_siswa (id,siswa_id,rombel_id,tanggal,status,status_pulang,waktu_pulang,metode,keterangan_pulang,tenant_id)
              VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,siswa_id,tanggal) DO NOTHING`,
        params: [id, siswaId, rombelId, tanggal, '', status, waktu, metode, keterangan, tenantId],
      }
    : {
        sql: `INSERT INTO absensi_siswa (id,siswa_id,rombel_id,tanggal,status,waktu_absen,waktu_masuk,metode,keterangan,tenant_id)
              VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,siswa_id,tanggal) DO NOTHING`,
        params: [id, siswaId, rombelId, tanggal, status, waktu, waktu, metode, keterangan, tenantId],
      }
  const result = db.prepare(insert.sql).run(...insert.params)
  if (result.changes) return { id, already: false, status, jenis: isPulang ? 'pulang' : 'masuk' }

  // A concurrent writer won the unique-key race. Re-enter through the update/skip path.
  return writeDailyAttendanceSession(db, { id, tenantId, siswaId, rombelId, tanggal, status, waktu, metode, keterangan, jenis, sumber: asal })
}

module.exports = { HARI, hariJakarta, sesiAbsensiSiswa, dateRange, writeDailyAttendanceSession }