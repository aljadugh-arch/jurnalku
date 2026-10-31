// Modul SIAKAD PT: KRS (Kartu Rencana Studi), nilai per mata kuliah, dan
// KHS/IPK (indeks prestasi). Hanya untuk lembaga jenjang PT (perguruan tinggi).
//
// Digerbang: (1) jenjang PT via middleware `hanyaPT`, (2) fitur `penilaian`
// via FEATURE_PREFIXES (route /api/krs* digerbang paket seperti nilai/rapor).

const crypto = require('node:crypto')

function setupSiakadPtTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS krs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      siswa_id TEXT NOT NULL,
      semester TEXT NOT NULL,
      tahun_ajaran TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_krs_tenant ON krs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_krs_siswa ON krs(siswa_id);

    CREATE TABLE IF NOT EXISTS krs_item (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      krs_id TEXT NOT NULL,
      mapel_id TEXT NOT NULL,
      sks INTEGER NOT NULL DEFAULT 2
    );
    CREATE INDEX IF NOT EXISTS idx_krs_item_krs ON krs_item(krs_id);

    CREATE TABLE IF NOT EXISTS krs_nilai (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      siswa_id TEXT NOT NULL,
      mapel_id TEXT NOT NULL,
      semester TEXT NOT NULL,
      sks INTEGER NOT NULL DEFAULT 2,
      nilai_angka REAL,
      nilai_huruf TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, siswa_id, mapel_id, semester)
    );
    CREATE INDEX IF NOT EXISTS idx_krs_nilai_siswa ON krs_nilai(siswa_id);
    CREATE INDEX IF NOT EXISTS idx_krs_nilai_tenant ON krs_nilai(tenant_id);
  `)
}

/** Bobot nilai 0-4 dari nilai_angka atau nilai_huruf (A=4..E=0). null bila tak bisa dipetakan. */
function bobotNilai(nilai) {
  const a = Number(nilai)
  if (nilai !== null && nilai !== undefined && nilai !== '' && Number.isFinite(a)) {
    return Math.min(4, Math.max(0, a))
  }
  const huruf = String(nilai || '').trim().toUpperCase()
  return { A: 4, B: 3, C: 2, D: 1, E: 0 }[huruf] ?? null
}

/** Hitung KHS (IP per semester) + IPK (kumulatif) dari baris nilai. */
function hitungIpk(rows) {
  // rows: [{ semester, sks, nilai_angka, nilai_huruf }]
  const perSemester = {}
  let totalBobot = 0, totalSks = 0
  for (const r of rows) {
    const bobot = bobotNilai(r.nilai_angka ?? r.nilai_huruf)
    const sks = Number(r.sks) || 0
    if (bobot === null || sks <= 0) continue
    totalBobot += bobot * sks
    totalSks += sks
    const sem = String(r.semester || '')
    if (!perSemester[sem]) perSemester[sem] = { bobot: 0, sks: 0 }
    perSemester[sem].bobot += bobot * sks
    perSemester[sem].sks += sks
  }
  const khs = Object.entries(perSemester).map(([semester, v]) => ({
    semester,
    sks: v.sks,
    ip: v.sks ? +(v.bobot / v.sks).toFixed(2) : null,
  })).sort((a, b) => a.semester.localeCompare(b.semester))
  const ipk = totalSks ? +(totalBobot / totalSks).toFixed(2) : null
  return { khs, ipk, total_sks: totalSks }
}

function registerSiakadPtRoutes(app, { db, requireRole, getTenantSettings }) {
  const KELOLA = requireRole('admin', 'super_admin')
  const LIHAT = requireRole('admin', 'super_admin', 'kepala', 'operator', 'tata_usaha')
  const buatId = () => crypto.randomUUID()
  const aman = (res, fn) => { try { fn() } catch (e) { res.status(400).json({ error: e.message }) } }

  function jenjangPT(tenantId) {
    try {
      const j = String(getTenantSettings(db, tenantId, 'jenjang')?.jenjang || '').trim().toUpperCase()
      return j === 'PT' || j.includes('PERGURUAN') || j.includes('UNIVERSITAS') || j.includes('KAMPUS') || j.includes('POLITEKNIK') || j.includes('AKADEMI')
    } catch { return false }
  }
  function hanyaPT(req, res, next) {
    if (!jenjangPT(req.tenantId)) return res.status(403).json({ error: 'SIAKAD (KRS & IPK) hanya tersedia untuk lembaga perguruan tinggi.', code: 'PT_ONLY' })
    next()
  }

  // ---- KRS ----------------------------------------------------------------

  app.get('/api/krs', LIHAT, hanyaPT, (req, res) => {
    aman(res, () => {
      const { siswa_id, semester } = req.query
      let sql = `SELECT k.*, s.nama AS nama_mahasiswa, s.nis AS nim FROM krs k JOIN siswa s ON s.id = k.siswa_id WHERE k.tenant_id=?`
      const args = [req.tenantId]
      if (siswa_id) { sql += ' AND k.siswa_id=?'; args.push(siswa_id) }
      if (semester) { sql += ' AND k.semester=?'; args.push(semester) }
      sql += ' ORDER BY k.created_at DESC'
      const krs = db.prepare(sql).all(...args)
      const itemOf = db.prepare(`
        SELECT i.*, m.nama AS nama_mapel FROM krs_item i
        LEFT JOIN mapel m ON m.id = i.mapel_id WHERE i.krs_id=? ORDER BY m.nama`)
      const hasil = krs.map(k => ({ ...k, items: itemOf.all(k.id) }))
      res.json({ success: true, krs: hasil })
    })
  })

  app.post('/api/krs', KELOLA, hanyaPT, (req, res) => {
    aman(res, () => {
      const { siswa_id, semester, tahun_ajaran, items } = req.body || {}
      if (!siswa_id || !semester) throw new Error('Mahasiswa dan semester wajib diisi')
      if (!db.prepare('SELECT id FROM siswa WHERE id=? AND tenant_id=?').get(siswa_id, req.tenantId)) throw new Error('Mahasiswa tidak ditemukan')
      const id = buatId()
      const jalankan = db.transaction(() => {
        db.prepare('INSERT INTO krs (id, tenant_id, siswa_id, semester, tahun_ajaran) VALUES (?,?,?,?,?)')
          .run(id, req.tenantId, siswa_id, semester, tahun_ajaran || null)
        if (Array.isArray(items)) {
          const ins = db.prepare('INSERT INTO krs_item (id, tenant_id, krs_id, mapel_id, sks) VALUES (?,?,?,?,?)')
          for (const it of items) {
            if (it?.mapel_id) ins.run(buatId(), req.tenantId, id, it.mapel_id, Math.max(0, Math.round(Number(it.sks) || 0)))
          }
        }
      })
      jalankan()
      res.json({ success: true, id })
    })
  })

  app.delete('/api/krs/:id', KELOLA, hanyaPT, (req, res) => {
    aman(res, () => {
      const info = db.prepare('DELETE FROM krs WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
      if (!info.changes) throw new Error('KRS tidak ditemukan')
      db.prepare('DELETE FROM krs_item WHERE krs_id=?').run(req.params.id)
      res.json({ success: true })
    })
  })

  // ---- Nilai & KHS/IPK ----------------------------------------------------

  app.get('/api/krs-nilai', LIHAT, hanyaPT, (req, res) => {
    aman(res, () => {
      const { siswa_id } = req.query
      const sql = `SELECT n.*, m.nama AS nama_mapel FROM krs_nilai n LEFT JOIN mapel m ON m.id = n.mapel_id WHERE n.tenant_id=?`
      const rows = siswa_id
        ? db.prepare(sql + ' AND n.siswa_id=? ORDER BY n.semester, m.nama').all(req.tenantId, siswa_id)
        : db.prepare(sql + ' ORDER BY n.semester, m.nama').all(req.tenantId)
      res.json({ success: true, nilai: rows })
    })
  })

  app.post('/api/krs-nilai', KELOLA, hanyaPT, (req, res) => {
    aman(res, () => {
      const { siswa_id, mapel_id, semester, sks, nilai_angka, nilai_huruf } = req.body || {}
      if (!siswa_id || !mapel_id || !semester) throw new Error('Mahasiswa, mata kuliah, dan semester wajib diisi')
      if (!db.prepare('SELECT id FROM siswa WHERE id=? AND tenant_id=?').get(siswa_id, req.tenantId)) throw new Error('Mahasiswa tidak ditemukan')
      const id = buatId()
      db.prepare(`INSERT INTO krs_nilai (id, tenant_id, siswa_id, mapel_id, semester, sks, nilai_angka, nilai_huruf)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(tenant_id, siswa_id, mapel_id, semester) DO UPDATE SET
          sks=excluded.sks, nilai_angka=excluded.nilai_angka, nilai_huruf=excluded.nilai_huruf`)
        .run(id, req.tenantId, siswa_id, mapel_id, semester,
          Math.max(0, Math.round(Number(sks) || 0)),
          nilai_angka === '' || nilai_angka === undefined || nilai_angka === null ? null : Number(nilai_angka),
          String(nilai_huruf || '').trim().toUpperCase() || null)
      res.json({ success: true })
    })
  })

  app.get('/api/krs-khs', LIHAT, hanyaPT, (req, res) => {
    aman(res, () => {
      const siswaId = req.query.siswa_id
      if (!siswaId) throw new Error('Parameter siswa_id wajib')
      const rows = db.prepare('SELECT semester, sks, nilai_angka, nilai_huruf FROM krs_nilai WHERE tenant_id=? AND siswa_id=?').all(req.tenantId, siswaId)
      res.json({ success: true, ...hitungIpk(rows) })
    })
  })
}

module.exports = { setupSiakadPtTables, registerSiakadPtRoutes, bobotNilai, hitungIpk }
