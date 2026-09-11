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

function writeDailyAttendanceSession(db, {
  id, tenantId, siswaId, rombelId = null, tanggal, status, waktu = null,
  metode = 'manual', keterangan = '', jenis = 'masuk',
}) {
  const isPulang = jenis === 'pulang'
  const sessionField = isPulang ? 'status_pulang' : 'status'
  const existing = db.prepare('SELECT id, status, status_pulang FROM absensi_siswa WHERE siswa_id=? AND tanggal=? AND tenant_id=?')
    .get(siswaId, tanggal, tenantId)
  if (existing?.[sessionField]) return { id: existing.id, already: true, status: existing[sessionField], jenis: isPulang ? 'pulang' : 'masuk' }

  if (existing) {
    const result = isPulang
      ? db.prepare("UPDATE absensi_siswa SET status_pulang=?, waktu_pulang=?, keterangan_pulang=?, metode=COALESCE(NULLIF(?,''),metode) WHERE id=? AND tenant_id=? AND trim(COALESCE(status_pulang,''))='' ")
          .run(status, waktu, keterangan, metode, existing.id, tenantId)
      : db.prepare("UPDATE absensi_siswa SET status=?, waktu_absen=?, waktu_masuk=?, metode=?, keterangan=? WHERE id=? AND tenant_id=? AND trim(COALESCE(status,''))='' ")
          .run(status, waktu, waktu, metode, keterangan, existing.id, tenantId)
    const saved = db.prepare('SELECT id, status, status_pulang FROM absensi_siswa WHERE id=? AND tenant_id=?').get(existing.id, tenantId)
    return { id: saved.id, already: !result.changes, status: saved[sessionField], jenis: isPulang ? 'pulang' : 'masuk' }
  }

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
  return writeDailyAttendanceSession(db, { id, tenantId, siswaId, rombelId, tanggal, status, waktu, metode, keterangan, jenis })
}

module.exports = { HARI, hariJakarta, sesiAbsensiSiswa, dateRange, writeDailyAttendanceSession }
