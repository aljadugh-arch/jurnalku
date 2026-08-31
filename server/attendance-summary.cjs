const PRESENT = new Set(['hadir', 'present'])
const SICK = new Set(['sakit', 'sick'])
const PERMITTED = new Set(['izin', 'ijin', 'permitted'])
const ABSENT = new Set(['alpha', 'alpa', 'absent'])

function statusKey(value) {
  const status = String(value || '').trim().toLowerCase()
  if (PRESENT.has(status)) return 'hadir'
  if (SICK.has(status)) return 'sakit'
  if (PERMITTED.has(status)) return 'izin'
  if (ABSENT.has(status)) return 'alpha'
  return 'lain'
}

function summary(rows) {
  const result = { total: rows.length, hadir: 0, sakit: 0, izin: 0, alpha: 0, lain: 0 }
  for (const row of rows) result[statusKey(row.status)]++
  return result
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
}

function studentAttendance(db, tenantId, studentId, limit = 100) {
  const qr = db.prepare(`SELECT id,tanggal,status,status_pulang,waktu_masuk,waktu_pulang,waktu_absen,metode,keterangan,keterangan_pulang
    FROM absensi_siswa WHERE tenant_id=? AND siswa_id=? ORDER BY tanggal DESC LIMIT ?`).all(tenantId, studentId, limit)
  const mapel = tableExists(db, 'absensi_mapel') ? db.prepare(`SELECT am.id,am.tanggal,am.status,am.keterangan,am.jadwal_id,am.mapel_id,m.nama AS mapel_nama,g.nama AS guru_nama,j.jam_mulai,j.jam_selesai
    FROM absensi_mapel am
    LEFT JOIN mapel m ON m.id=am.mapel_id AND m.tenant_id=am.tenant_id
    LEFT JOIN jadwal j ON j.id=am.jadwal_id AND j.tenant_id=am.tenant_id
    LEFT JOIN gtk g ON g.id=am.guru_id AND g.tenant_id=am.tenant_id
    WHERE am.tenant_id=? AND am.siswa_id=? ORDER BY am.tanggal DESC,j.jam_mulai DESC LIMIT ?`).all(tenantId, studentId, limit) : []
  const jamaah = db.prepare(`SELECT a.id,a.tanggal,a.status,a.keterangan,j.nama AS sesi_nama
    FROM absensi_kegiatan a JOIN jamaah_sesi j ON j.id=a.kegiatan_id AND j.tenant_id=a.tenant_id
    WHERE a.tenant_id=? AND a.siswa_id=? ORDER BY a.tanggal DESC LIMIT ?`).all(tenantId, studentId, limit)
  const activities = db.prepare(`SELECT a.id,a.tanggal,a.status,a.keterangan,k.nama AS kegiatan_nama,k.jenis
    FROM absensi_kegiatan a JOIN kegiatan_khusus k ON k.id=a.kegiatan_id AND k.tenant_id=a.tenant_id
    WHERE a.tenant_id=? AND a.siswa_id=? ORDER BY a.tanggal DESC LIMIT ?`).all(tenantId, studentId, limit)
  const extracurricular = db.prepare(`SELECT a.id,a.tanggal,a.status,a.keterangan,e.nama AS ekskul_nama
    FROM absensi_ekskul a JOIN ekskul e ON e.id=a.ekskul_id AND e.tenant_id=a.tenant_id
    WHERE a.tenant_id=? AND a.siswa_id=? ORDER BY a.tanggal DESC LIMIT ?`).all(tenantId, studentId, limit)
  const tahfidz = tableExists(db, 'tahfidz_absensi') ? db.prepare(`SELECT ta.pertemuan_id AS id,tp.tanggal,ta.status,ta.catatan AS keterangan,tk.nama AS ekskul_nama,'tahfidz' AS sumber
    FROM tahfidz_absensi ta
    JOIN tahfidz_pertemuan tp ON tp.id=ta.pertemuan_id AND tp.tenant_id=ta.tenant_id
    LEFT JOIN tahfidz_kelompok tk ON tk.id=tp.kelompok_id AND tk.tenant_id=tp.tenant_id
    WHERE ta.tenant_id=? AND ta.siswa_id=? ORDER BY tp.tanggal DESC LIMIT ?`).all(tenantId, studentId, limit) : []
  const kokurikuler = activities.filter(row => String(row.jenis || '').toLowerCase() === 'kokurikuler')
  const kegiatanLain = activities.filter(row => String(row.jenis || '').toLowerCase() !== 'kokurikuler')
  const ekskul = [...extracurricular, ...tahfidz]
  const qrStatuses = qr.flatMap(row => [row.status ? { status: row.status } : null, row.status_pulang ? { status: row.status_pulang } : null].filter(Boolean))
  return {
    rekap_kehadiran: {
      qr_masuk_pulang: summary(qrStatuses), mapel: summary(mapel), jamaah: summary(jamaah),
      kokurikuler: summary(kokurikuler), ekskul: summary(ekskul), kegiatan_lain: summary(kegiatanLain),
    },
    qr_masuk_pulang_detail: qr, mapel_detail: mapel, jamaah_detail: jamaah,
    kokurikuler_detail: kokurikuler, ekskul_detail: ekskul, kegiatan_lain_detail: kegiatanLain,
  }
}

function aggregate(db, sql, args) {
  if (!sql) return { total: 0, hadir: 0, sakit: 0, izin: 0, alpha: 0, lain: 0 }
  const row = db.prepare(sql).get(...args) || {}
  return {
    total: Number(row.total || 0), hadir: Number(row.hadir || 0), sakit: Number(row.sakit || 0),
    izin: Number(row.izin || 0), alpha: Number(row.alpha || 0), lain: Number(row.lain || 0),
  }
}

const aggregateSql = (from, where = '') => `SELECT COUNT(*) total,
  SUM(CASE WHEN lower(COALESCE(status,'')) IN ('hadir','present') THEN 1 ELSE 0 END) hadir,
  SUM(CASE WHEN lower(COALESCE(status,'')) IN ('sakit','sick') THEN 1 ELSE 0 END) sakit,
  SUM(CASE WHEN lower(COALESCE(status,'')) IN ('izin','ijin','permitted') THEN 1 ELSE 0 END) izin,
  SUM(CASE WHEN lower(COALESCE(status,'')) IN ('alpha','alpa','absent') THEN 1 ELSE 0 END) alpha,
  SUM(CASE WHEN lower(COALESCE(status,'')) NOT IN ('hadir','present','sakit','sick','izin','ijin','permitted','alpha','alpa','absent') THEN 1 ELSE 0 END) lain
  FROM ${from} WHERE tenant_id=? AND tanggal=? ${where}`

function getAttendanceOverview(db, tenantId, date) {
  const qrIn = aggregate(db, aggregateSql('absensi_siswa'), [tenantId, date])
  const qrOut = aggregate(db, `SELECT COUNT(*) total,
    SUM(CASE WHEN lower(COALESCE(status_pulang,'')) IN ('hadir','present') THEN 1 ELSE 0 END) hadir,
    SUM(CASE WHEN lower(COALESCE(status_pulang,'')) IN ('sakit','sick') THEN 1 ELSE 0 END) sakit,
    SUM(CASE WHEN lower(COALESCE(status_pulang,'')) IN ('izin','ijin','permitted') THEN 1 ELSE 0 END) izin,
    SUM(CASE WHEN lower(COALESCE(status_pulang,'')) IN ('alpha','alpa','absent') THEN 1 ELSE 0 END) alpha,
    SUM(CASE WHEN lower(COALESCE(status_pulang,'')) NOT IN ('hadir','present','sakit','sick','izin','ijin','permitted','alpha','alpa','absent') THEN 1 ELSE 0 END) lain
    FROM absensi_siswa WHERE tenant_id=? AND tanggal=? AND COALESCE(status_pulang,'')<>''`, [tenantId, date])
  const add = (a, b) => Object.fromEntries(Object.keys(a).map(key => [key, Number(a[key] || 0) + Number(b[key] || 0)]))
  const mapel = tableExists(db, 'absensi_mapel') ? aggregate(db, aggregateSql('absensi_mapel'), [tenantId, date]) : summary([])
  const jamaah = aggregate(db, aggregateSql('absensi_kegiatan', "AND kegiatan_id IN (SELECT id FROM jamaah_sesi WHERE tenant_id=?)"), [tenantId, date, tenantId])
  const kokurikuler = aggregate(db, aggregateSql('absensi_kegiatan', "AND kegiatan_id IN (SELECT id FROM kegiatan_khusus WHERE tenant_id=? AND lower(COALESCE(jenis,''))='kokurikuler')"), [tenantId, date, tenantId])
  const kegiatanLain = aggregate(db, aggregateSql('absensi_kegiatan', "AND kegiatan_id IN (SELECT id FROM kegiatan_khusus WHERE tenant_id=? AND lower(COALESCE(jenis,''))<>'kokurikuler')"), [tenantId, date, tenantId])
  const ekskul = aggregate(db, aggregateSql('absensi_ekskul'), [tenantId, date])
  const tahfidz = tableExists(db, 'tahfidz_absensi') ? aggregate(db, `SELECT COUNT(*) total,
    SUM(CASE WHEN lower(COALESCE(ta.status,'')) IN ('hadir','present') THEN 1 ELSE 0 END) hadir,
    SUM(CASE WHEN lower(COALESCE(ta.status,'')) IN ('sakit','sick') THEN 1 ELSE 0 END) sakit,
    SUM(CASE WHEN lower(COALESCE(ta.status,'')) IN ('izin','ijin','permitted') THEN 1 ELSE 0 END) izin,
    SUM(CASE WHEN lower(COALESCE(ta.status,'')) IN ('alpha','alpa','absent') THEN 1 ELSE 0 END) alpha,
    SUM(CASE WHEN lower(COALESCE(ta.status,'')) NOT IN ('hadir','present','sakit','sick','izin','ijin','permitted','alpha','alpa','absent') THEN 1 ELSE 0 END) lain
    FROM tahfidz_absensi ta JOIN tahfidz_pertemuan tp ON tp.id=ta.pertemuan_id AND tp.tenant_id=ta.tenant_id WHERE ta.tenant_id=? AND tp.tanggal=?`, [tenantId, date]) : summary([])
  return { tanggal: date, qr_masuk_pulang: add(qrIn, qrOut), mapel, jamaah, kokurikuler, ekskul: add(ekskul, tahfidz), kegiatan_lain: kegiatanLain }
}

module.exports = { getAttendanceOverview, studentAttendance, statusKey, summary }
