const STATUS_KEYS = ['hadir', 'sakit', 'izin', 'alpha', 'lain']
const EMPTY = () => ({ total: 0, hadir: 0, sakit: 0, izin: 0, alpha: 0, lain: 0 })

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
}

function statusCase(column = 'status', presence = null) {
  const guard = presence ? `${presence} IS NOT NULL AND ` : ''
  return `SUM(CASE WHEN ${guard}lower(COALESCE(${column},'')) IN ('hadir','present') THEN 1 ELSE 0 END) hadir,
    SUM(CASE WHEN ${guard}lower(COALESCE(${column},'')) IN ('sakit','sick') THEN 1 ELSE 0 END) sakit,
    SUM(CASE WHEN ${guard}lower(COALESCE(${column},'')) IN ('izin','ijin','permitted') THEN 1 ELSE 0 END) izin,
    SUM(CASE WHEN ${guard}lower(COALESCE(${column},'')) IN ('alpha','alpa','absent') THEN 1 ELSE 0 END) alpha,
    SUM(CASE WHEN ${guard}lower(COALESCE(${column},'')) NOT IN ('hadir','present','sakit','sick','izin','ijin','permitted','alpha','alpa','absent') THEN 1 ELSE 0 END) lain`
}

function aggregate(rows) {
  const result = EMPTY()
  for (const row of rows) {
    result.total += Number(row.total || 0)
    for (const key of STATUS_KEYS) result[key] += Number(row[key] || 0)
  }
  return result
}

function getCategoryRecap(db, tenantId, category, from, to) {
  const categories = {
    mapel: {
      available: () => tableExists(db, 'absensi_mapel'),
      detail: `SELECT s.id,s.nama,s.nis,s.nisn,r.nama rombel_nama,m.nama kegiatan_nama,
        COUNT(am.id) total,${statusCase('am.status', 'am.id')}
        FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
        LEFT JOIN absensi_mapel am ON am.siswa_id=s.id AND am.tenant_id=s.tenant_id AND am.tanggal BETWEEN ? AND ?
        LEFT JOIN mapel m ON m.id=am.mapel_id AND m.tenant_id=am.tenant_id
        WHERE s.tenant_id=? AND COALESCE(s.status,'aktif')='aktif' GROUP BY s.id,m.id ORDER BY r.nama,s.nama,m.nama`,
    },
    ekskul: {
      available: () => tableExists(db, 'absensi_ekskul'),
      detail: `SELECT s.id,s.nama,s.nis,s.nisn,r.nama rombel_nama,e.nama kegiatan_nama,
        COUNT(ae.id) total,${statusCase('ae.status', 'ae.id')}
        FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
        LEFT JOIN absensi_ekskul ae ON ae.siswa_id=s.id AND ae.tenant_id=s.tenant_id AND ae.tanggal BETWEEN ? AND ?
        LEFT JOIN ekskul e ON e.id=ae.ekskul_id AND e.tenant_id=ae.tenant_id
        WHERE s.tenant_id=? AND COALESCE(s.status,'aktif')='aktif' GROUP BY s.id,e.id ORDER BY r.nama,s.nama,e.nama`,
    },
    jamaah: {
      available: () => tableExists(db, 'absensi_kegiatan') && tableExists(db, 'jamaah_sesi'),
      detail: `SELECT s.id,s.nama,s.nis,s.nisn,r.nama rombel_nama,j.nama kegiatan_nama,
        COUNT(a.id) total,${statusCase('a.status', 'a.id')}
        FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
        LEFT JOIN absensi_kegiatan a ON a.siswa_id=s.id AND a.tenant_id=s.tenant_id AND a.tanggal BETWEEN ? AND ?
        LEFT JOIN jamaah_sesi j ON j.id=a.kegiatan_id AND j.tenant_id=a.tenant_id
        WHERE s.tenant_id=? AND j.id IS NOT NULL GROUP BY s.id,j.id ORDER BY r.nama,s.nama,j.nama`,
    },
    kokurikuler: {
      available: () => tableExists(db, 'absensi_kegiatan') && tableExists(db, 'kegiatan_khusus'),
      detail: `SELECT s.id,s.nama,s.nis,s.nisn,r.nama rombel_nama,k.nama kegiatan_nama,
        COUNT(a.id) total,${statusCase('a.status', 'a.id')}
        FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
        LEFT JOIN absensi_kegiatan a ON a.siswa_id=s.id AND a.tenant_id=s.tenant_id AND a.tanggal BETWEEN ? AND ?
        LEFT JOIN kegiatan_khusus k ON k.id=a.kegiatan_id AND k.tenant_id=a.tenant_id AND lower(k.jenis)='kokurikuler'
        WHERE s.tenant_id=? AND k.id IS NOT NULL GROUP BY s.id,k.id ORDER BY r.nama,s.nama,k.nama`,
    },
    kegiatan_lain: {
      available: () => tableExists(db, 'absensi_kegiatan') && tableExists(db, 'kegiatan_khusus'),
      detail: `SELECT s.id,s.nama,s.nis,s.nisn,r.nama rombel_nama,k.nama kegiatan_nama,
        COUNT(a.id) total,${statusCase('a.status', 'a.id')}
        FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
        LEFT JOIN absensi_kegiatan a ON a.siswa_id=s.id AND a.tenant_id=s.tenant_id AND a.tanggal BETWEEN ? AND ?
        LEFT JOIN kegiatan_khusus k ON k.id=a.kegiatan_id AND k.tenant_id=a.tenant_id AND lower(k.jenis)<>'kokurikuler'
        WHERE s.tenant_id=? AND k.id IS NOT NULL GROUP BY s.id,k.id ORDER BY r.nama,s.nama,k.nama`,
    },
  }
  const config = categories[category]
  if (!config) throw new Error('Kategori absensi tidak valid')
  if (!config.available()) return { category, from, to, summary: EMPTY(), detail: [] }
  const detail = db.prepare(config.detail).all(from, to, tenantId).map(row => {
    const normalized = { ...row }
    for (const key of ['total', ...STATUS_KEYS]) normalized[key] = Number(row[key] || 0)
    return normalized
  })
  if (category === 'ekskul' && tableExists(db, 'tahfidz_absensi') && tableExists(db, 'tahfidz_pertemuan')) {
    const tahfidzRows = db.prepare(`SELECT s.id,s.nama,s.nis,s.nisn,r.nama rombel_nama,tk.nama kegiatan_nama,
      COUNT(tp.id) total,${statusCase('ta.status', 'tp.id')}
      FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
      LEFT JOIN tahfidz_absensi ta ON ta.siswa_id=s.id AND ta.tenant_id=s.tenant_id
      LEFT JOIN tahfidz_pertemuan tp ON tp.id=ta.pertemuan_id AND tp.tenant_id=ta.tenant_id AND tp.tanggal BETWEEN ? AND ?
      LEFT JOIN tahfidz_kelompok tk ON tk.id=tp.kelompok_id AND tk.tenant_id=tp.tenant_id
      WHERE s.tenant_id=? AND COALESCE(s.status,'aktif')='aktif' GROUP BY s.id,tk.id ORDER BY r.nama,s.nama,tk.nama`).all(from, to, tenantId).map(row => {
        const normalized = { ...row }
        for (const key of ['total', ...STATUS_KEYS]) normalized[key] = Number(row[key] || 0)
        return normalized
      })
    detail.push(...tahfidzRows.filter(row => row.total > 0))
  }
  return { category, from, to, summary: aggregate(detail), detail }
}

module.exports = { getCategoryRecap, EMPTY }
