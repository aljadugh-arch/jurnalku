function columnExists(db, table, column) {
  try { return db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column) } catch { return false }
}

function setupMonitoring(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS notification_activity (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor_id TEXT,
    entity_id TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  ); CREATE INDEX IF NOT EXISTS idx_notification_activity_tenant_date ON notification_activity(tenant_id, created_at);`)
}

function logActivity(db, { tenantId, eventType, actorId = null, entityId = null, metadata = {} }) {
  const id = require('crypto').randomUUID()
  db.prepare('INSERT INTO notification_activity(id,tenant_id,event_type,actor_id,entity_id,metadata_json) VALUES(?,?,?,?,?,?)')
    .run(id, tenantId, eventType, actorId, entityId, JSON.stringify(metadata || {}))
  return id
}

function getMonitoring(db, tenantId, date) {
  const assignmentRows = db.prepare(`SELECT t.id,t.guru_id,t.rombel_id,t.judul,t.deadline,t.created_at,
      g.nama AS guru_nama,r.nama AS rombel_nama,
      (SELECT COUNT(*) FROM siswa s WHERE s.rombel_id=t.rombel_id AND s.tenant_id=t.tenant_id) AS students
    FROM tugas_siswa t LEFT JOIN gtk g ON g.id=t.guru_id AND g.tenant_id=t.tenant_id
      LEFT JOIN rombel r ON r.id=t.rombel_id AND r.tenant_id=t.tenant_id
    WHERE t.tenant_id=? ORDER BY t.created_at DESC LIMIT 100`).all(tenantId)
  const classSessions = db.prepare(`SELECT sk.*,g.nama AS guru_nama,r.nama AS rombel_nama
    FROM sesi_kelas_guru sk LEFT JOIN gtk g ON g.id=sk.guru_id AND g.tenant_id=sk.tenant_id
      LEFT JOIN rombel r ON r.id=sk.rombel_id AND r.tenant_id=sk.tenant_id
    WHERE sk.tenant_id=? AND sk.tanggal=? ORDER BY sk.waktu_masuk DESC`).all(tenantId, date)
  const qrRows = db.prepare(`SELECT a.id,a.siswa_id,a.tanggal,a.waktu_masuk,a.waktu_pulang,a.status,a.status_pulang,a.metode,s.nama AS siswa_nama,r.nama AS rombel_nama
    FROM absensi_siswa a LEFT JOIN siswa s ON s.id=a.siswa_id AND s.tenant_id=a.tenant_id
      LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
    WHERE a.tenant_id=? AND a.tanggal=? AND lower(COALESCE(a.metode,''))='qr' ORDER BY a.waktu_masuk DESC`).all(tenantId, date)
  qrRows.forEach(row => { row.sesi = row.waktu_pulang ? 'pulang' : 'masuk' })
  const teacherRows = db.prepare(`SELECT a.*,g.nama AS guru_nama FROM absensi_guru a
    LEFT JOIN gtk g ON g.id=a.gtk_id AND g.tenant_id=a.tenant_id
    WHERE a.tenant_id=? AND a.tanggal=? ORDER BY a.waktu_masuk DESC`).all(tenantId, date)
  const activity = db.prepare(`SELECT * FROM notification_activity WHERE tenant_id=? AND date(created_at)=? ORDER BY created_at DESC LIMIT 100`).all(tenantId, date)
  return {
    date,
    assignments: { total: assignmentRows.length, students: assignmentRows.reduce((n, row) => n + Number(row.students || 0), 0), rows: assignmentRows },
    class_sessions: { total: classSessions.length, active: classSessions.filter(row => row.status === 'aktif').length, rows: classSessions },
    student_qr: { total: qrRows.length, rows: qrRows },
    student_qr_summary: { masuk: qrRows.filter(row => row.sesi !== 'pulang').length, pulang: qrRows.filter(row => row.sesi === 'pulang').length },
    teacher_checkins: { total: teacherRows.length, rows: teacherRows },
    activity: activity.map(row => ({ ...row, metadata: JSON.parse(row.metadata_json || '{}') }))
  }
}

module.exports = { setupMonitoring, logActivity, getMonitoring, columnExists }
