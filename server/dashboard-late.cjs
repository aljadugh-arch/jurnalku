function delayMinutes(waktu, batas) {
  if (!waktu || !batas) return 0
  const minutes = value => value.slice(0, 5).split(':').reduce((h, m) => Number(h) * 60 + Number(m))
  return Math.max(0, minutes(waktu) - minutes(batas))
}

function getLateDashboard(db, tenantId, date) {
  const cfg = db.prepare(`SELECT ceklok_masuk_selesai, sesi_masuk_selesai FROM settings
    WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 1`).get(tenantId) || {}
  const guru = cfg.ceklok_masuk_selesai ? db.prepare(`SELECT g.nama, a.waktu_masuk AS waktu
    FROM absensi_guru a JOIN gtk g ON g.id=a.gtk_id AND g.tenant_id=a.tenant_id
    WHERE a.tenant_id=? AND a.tanggal=? AND a.waktu_masuk>? ORDER BY a.waktu_masuk, g.nama`)
    .all(tenantId, date, cfg.ceklok_masuk_selesai) : []
  const siswa = cfg.sesi_masuk_selesai ? db.prepare(`SELECT s.nama, r.nama AS rombel, MIN(COALESCE(a.waktu_masuk,a.waktu_absen)) AS waktu
    FROM absensi_siswa a JOIN siswa s ON s.id=a.siswa_id AND s.tenant_id=a.tenant_id
    LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
    WHERE a.tenant_id=? AND a.tanggal=? AND a.metode='qr'
    GROUP BY a.siswa_id, s.nama, r.nama HAVING waktu>? ORDER BY waktu, s.nama`)
    .all(tenantId, date, cfg.sesi_masuk_selesai) : []
  const result = (rows, batas) => ({ count: rows.length, items: rows.map(x => ({ ...x, terlambat_menit: delayMinutes(x.waktu, batas), status: 'terlambat' })) })
  return { guru: result(guru, cfg.ceklok_masuk_selesai), siswa_qr: result(siswa, cfg.sesi_masuk_selesai) }
}

module.exports = { delayMinutes, getLateDashboard }
