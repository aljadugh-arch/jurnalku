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

function normalizeRow(row) {
  const normalized = { ...row }
  for (const key of ['total', ...STATUS_KEYS]) normalized[key] = Number(row[key] || 0)
  return normalized
}

// Rekap absensi mapel dikelompokkan per GURU. Diperlukan karena satu guru bisa
// mengampu lebih dari satu mata pelajaran; angka per mapel saja tidak cukup untuk
// menilai keterisian absensi tiap pengajar. Kolom mapel_list menjelaskan mapel yang
// tercatat pada guru tsb, sehingga total guru = jumlah semua mapel yang diampu.
function getMapelGuruRecap(db, tenantId, from, to, rombelId = '', mapelId = '') {
  if (!tableExists(db, 'absensi_mapel') || !tableExists(db, 'gtk')) {
    return { category: 'mapel', group_by: 'guru', from, to, summary: EMPTY(), detail: [] }
  }
  const rombelFilter = ` AND (?= '' OR am.rombel_id = ?)`
  const mapelFilter = ` AND (?= '' OR am.mapel_id = ?)`
  const rows = db.prepare(`SELECT g.id,g.nama,g.nip,g.jabatan,m.nama mapel_nama,
    COUNT(am.id) total,${statusCase('am.status', 'am.id')}
    FROM gtk g
    LEFT JOIN absensi_mapel am ON am.guru_id=g.id AND am.tenant_id=g.tenant_id AND am.tanggal BETWEEN ? AND ?${rombelFilter}${mapelFilter}
    LEFT JOIN mapel m ON m.id=am.mapel_id AND m.tenant_id=am.tenant_id
    WHERE g.tenant_id=? AND COALESCE(g.status_kepegawaian,'')!='Nonaktif'
    GROUP BY g.id,m.id ORDER BY g.nama,m.nama`).all(from, to, rombelId, rombelId, mapelId, mapelId, tenantId)
  const byGuru = new Map()
  for (const row of rows) {
    let acc = byGuru.get(row.id)
    if (!acc) {
      acc = { id: row.id, nama: row.nama, nip: row.nip, jabatan: row.jabatan, mapel_list: [], total: 0, hadir: 0, sakit: 0, izin: 0, alpha: 0, lain: 0 }
      byGuru.set(row.id, acc)
    }
    if (row.mapel_nama && !acc.mapel_list.includes(row.mapel_nama)) acc.mapel_list.push(row.mapel_nama)
    for (const key of ['total', ...STATUS_KEYS]) acc[key] += Number(row[key] || 0)
  }
  const detail = Array.from(byGuru.values())
  return { category: 'mapel', group_by: 'guru', from, to, summary: aggregate(detail), detail }
}

// Absensi ekskul tercatat di DUA jalur: `absensi_ekskul` (ekskul bernama TAHFIDZ dsb.)
// dan `tahfidz_absensi` (modul tahfidz berbasis pertemuan). Keduanya menuju kategori
// "Ekstrakurikuler", sehingga baris digabung lalu di-dedupe per (siswa, tanggal, nama
// kegiatan): satu kejadian yang muncul di dua jalur hanya dihitung sekali, sementara
// siswa yang benar-benar ikut dua ekskul berbeda di hari sama tetap dihitung dua.
function ekskulDetailQuery(db, tenantId, from, to, rombelId) {
  const rombelFilter = ` AND (?= '' OR s.rombel_id = ?)`
  const parts = []
  const params = []
  if (tableExists(db, 'absensi_ekskul')) {
    const join = tableExists(db, 'ekskul') ? `LEFT JOIN ekskul e ON e.id=ae.ekskul_id AND e.tenant_id=ae.tenant_id` : ''
    const name = tableExists(db, 'ekskul') ? "COALESCE(e.nama,'')" : "''"
    parts.push(`SELECT s.id siswa_id,ae.tanggal,${name} nama,ae.status,1 src
      FROM absensi_ekskul ae JOIN siswa s ON s.id=ae.siswa_id AND s.tenant_id=ae.tenant_id
      ${join}
      WHERE ae.tenant_id=? AND ae.tanggal BETWEEN ? AND ? AND COALESCE(s.status,'aktif')='aktif'${rombelFilter}`)
    params.push(tenantId, from, to, rombelId, rombelId)
  }
  if (tableExists(db, 'tahfidz_absensi') && tableExists(db, 'tahfidz_pertemuan')) {
    parts.push(`SELECT s.id siswa_id,tp.tanggal,COALESCE(tk.nama,'') nama,ta.status,2 src
      FROM tahfidz_absensi ta
      JOIN tahfidz_pertemuan tp ON tp.id=ta.pertemuan_id AND tp.tenant_id=ta.tenant_id
      JOIN siswa s ON s.id=ta.siswa_id AND s.tenant_id=ta.tenant_id
      LEFT JOIN tahfidz_kelompok tk ON tk.id=tp.kelompok_id AND tk.tenant_id=tp.tenant_id
      WHERE ta.tenant_id=? AND tp.tanggal BETWEEN ? AND ? AND COALESCE(s.status,'aktif')='aktif'${rombelFilter}`)
    params.push(tenantId, from, to, rombelId, rombelId)
  }
  if (!parts.length) return null
  const sql = `SELECT s.id,s.nama,s.nis,s.nisn,r.nama rombel_nama,d.nama kegiatan_nama,
    COUNT(d.status) total,${statusCase('d.status', 'd.status')}
    FROM siswa s
    LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
    LEFT JOIN (SELECT siswa_id,tanggal,nama,status, ROW_NUMBER() OVER (PARTITION BY siswa_id,tanggal,nama ORDER BY src) rn
      FROM (${parts.join('\n      UNION ALL\n      ')})) d ON d.siswa_id=s.id AND d.rn=1
    WHERE s.tenant_id=?${rombelFilter} AND COALESCE(s.status,'aktif')='aktif'
    GROUP BY s.id,d.nama ORDER BY r.nama,s.nama,d.nama`
  params.push(tenantId, rombelId, rombelId)
  return { sql, params }
}

function getEkskulRecap(db, tenantId, from, to, rombelId = '') {
  const query = ekskulDetailQuery(db, tenantId, from, to, rombelId)
  if (!query) return { category: 'ekskul', from, to, summary: EMPTY(), detail: [] }
  const detail = db.prepare(query.sql).all(...query.params).map(normalizeRow)
  return { category: 'ekskul', from, to, summary: aggregate(detail), detail }
}

function getCategoryRecap(db, tenantId, category, from, to, rombelId = '', mapelId = '', groupBy = '') {
  if (String(category) === 'mapel' && String(groupBy) === 'guru') return getMapelGuruRecap(db, tenantId, from, to, rombelId, mapelId)
  if (String(category) === 'ekskul') return getEkskulRecap(db, tenantId, from, to, rombelId)
  const rombelFilter = ` AND (?= '' OR s.rombel_id = ?)`
  const rombelParams = [rombelId, rombelId]
  const mapelIdTrim = String(mapelId || '').trim()
  const categories = {
    mapel: {
      available: () => tableExists(db, 'absensi_mapel'),
      // Tanpa filter: satu baris per (siswa, mapel) — semua mapel tercampur.
      // Dengan mapel_id: satu baris per siswa pada mapel terpilih (termasuk siswa tanpa
      // catatan, total 0) sehingga rekap bisa dibaca per mata pelajaran.
      detail: mapelIdTrim
        ? `SELECT s.id,s.nama,s.nis,s.nisn,r.nama rombel_nama,COALESCE(m.nama,'') kegiatan_nama,
          COUNT(am.id) total,${statusCase('am.status', 'am.id')}
          FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
          LEFT JOIN absensi_mapel am ON am.siswa_id=s.id AND am.tenant_id=s.tenant_id AND am.mapel_id=? AND am.tanggal BETWEEN ? AND ?
          LEFT JOIN mapel m ON m.id=? AND m.tenant_id=s.tenant_id
          WHERE s.tenant_id=?${rombelFilter} AND COALESCE(s.status,'aktif')='aktif' GROUP BY s.id ORDER BY r.nama,s.nama`
        : `SELECT s.id,s.nama,s.nis,s.nisn,r.nama rombel_nama,m.nama kegiatan_nama,
          COUNT(am.id) total,${statusCase('am.status', 'am.id')}
          FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
          LEFT JOIN absensi_mapel am ON am.siswa_id=s.id AND am.tenant_id=s.tenant_id AND am.tanggal BETWEEN ? AND ?
          LEFT JOIN mapel m ON m.id=am.mapel_id AND m.tenant_id=am.tenant_id
          WHERE s.tenant_id=?${rombelFilter} AND COALESCE(s.status,'aktif')='aktif' GROUP BY s.id,m.id ORDER BY r.nama,s.nama,m.nama`,
      params: () => (mapelIdTrim ? [mapelIdTrim, from, to, mapelIdTrim, tenantId, ...rombelParams] : [from, to, tenantId, ...rombelParams]),
    },
    jamaah: {
      available: () => tableExists(db, 'absensi_kegiatan') && tableExists(db, 'jamaah_sesi'),
      detail: `SELECT s.id,s.nama,s.nis,s.nisn,r.nama rombel_nama,j.nama kegiatan_nama,
        COUNT(a.id) total,${statusCase('a.status', 'a.id')}
        FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
        LEFT JOIN absensi_kegiatan a ON a.siswa_id=s.id AND a.tenant_id=s.tenant_id AND a.tanggal BETWEEN ? AND ?
        LEFT JOIN jamaah_sesi j ON j.id=a.kegiatan_id AND j.tenant_id=a.tenant_id
        WHERE s.tenant_id=?${rombelFilter} AND j.id IS NOT NULL GROUP BY s.id,j.id ORDER BY r.nama,s.nama,j.nama`,
    },
    kokurikuler: {
      available: () => tableExists(db, 'absensi_kegiatan') && tableExists(db, 'kegiatan_khusus'),
      detail: `SELECT s.id,s.nama,s.nis,s.nisn,r.nama rombel_nama,k.nama kegiatan_nama,
        COUNT(a.id) total,${statusCase('a.status', 'a.id')}
        FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
        LEFT JOIN absensi_kegiatan a ON a.siswa_id=s.id AND a.tenant_id=s.tenant_id AND a.tanggal BETWEEN ? AND ?
        LEFT JOIN kegiatan_khusus k ON k.id=a.kegiatan_id AND k.tenant_id=a.tenant_id AND lower(k.jenis)='kokurikuler'
        WHERE s.tenant_id=?${rombelFilter} AND k.id IS NOT NULL GROUP BY s.id,k.id ORDER BY r.nama,s.nama,k.nama`,
    },
    kegiatan_lain: {
      available: () => tableExists(db, 'absensi_kegiatan') && tableExists(db, 'kegiatan_khusus'),
      detail: `SELECT s.id,s.nama,s.nis,s.nisn,r.nama rombel_nama,k.nama kegiatan_nama,
        COUNT(a.id) total,${statusCase('a.status', 'a.id')}
        FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
        LEFT JOIN absensi_kegiatan a ON a.siswa_id=s.id AND a.tenant_id=s.tenant_id AND a.tanggal BETWEEN ? AND ?
        LEFT JOIN kegiatan_khusus k ON k.id=a.kegiatan_id AND k.tenant_id=a.tenant_id AND lower(k.jenis)<>'kokurikuler'
        WHERE s.tenant_id=?${rombelFilter} AND k.id IS NOT NULL GROUP BY s.id,k.id ORDER BY r.nama,s.nama,k.nama`,
    },
  }
  const config = categories[category]
  if (!config) throw new Error('Kategori absensi tidak valid')
  if (!config.available()) return { category, from, to, summary: EMPTY(), detail: [] }
  const detail = db.prepare(config.detail).all(...(config.params ? config.params() : [from, to, tenantId, ...rombelParams])).map(normalizeRow)
  return { category, from, to, summary: aggregate(detail), detail }
}

module.exports = { getCategoryRecap, EMPTY }
