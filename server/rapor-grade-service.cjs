// Perhitungan nilai rapor dipakai bersama oleh generate (membuat baris baru)
// dan refresh (menghitung ulang baris yang sudah ada) agar keduanya tidak
// pernah menghasilkan angka berbeda untuk data sumber yang sama.
const JENIS_GENERATED = "'rapor_sts','rapor_sas'"

function clampNilai(value) {
  return Math.max(0, Math.min(100, Number(value) || 0))
}

function computeNilai({ daily, sts, sas, jenis }) {
  const pengetahuan = daily?.p == null ? 0 : Math.round(Number(daily.p))
  const keterampilan = daily?.k == null ? 0 : Math.round(Number(daily.k))
  const sikap = daily?.sk == null ? 0 : Math.round(Number(daily.sk))
  const harian = !daily || daily.jumlah === 0 || daily.nilai_harian == null
    ? 0
    : Math.round(Number(daily.nilai_harian))

  const nilaiSTS = sts == null ? 0 : clampNilai(sts)
  const nilaiSAS = jenis === 'rapor_sas' && sas != null ? clampNilai(sas) : 0
  const akhir = jenis === 'rapor_sas'
    ? Math.round(harian * 0.4 + nilaiSTS * 0.2 + nilaiSAS * 0.4)
    : Math.round(harian * 0.6 + nilaiSTS * 0.4)

  return { pengetahuan, keterampilan, sikap, harian, sts: nilaiSTS, sas: nilaiSAS, akhir }
}

// Prepared statement dibuat sekali per periode, bukan per siswa, agar hitung
// ulang massal (satu tanggal, satu rombel) tidak menyiapkan statement berulang.
function makeStatements(db, { tenantId, from, to }) {
  const daily = db.prepare(`
    SELECT
      AVG(pengetahuan) p,
      AVG(keaktifan) k,
      AVG(sikap) sk,
      AVG(pengetahuan*0.5 + keaktifan*0.3 + sikap*0.2) nilai_harian,
      COUNT(*) jumlah
    FROM penilaian_harian
    WHERE siswa_id=? AND mapel_id=? AND tenant_id=? AND tanggal BETWEEN ? AND ?
  `)
  const asesmen = db.prepare(`
    SELECT nilai_sts
    FROM rapor
    WHERE siswa_id=? AND mapel_id=? AND tahun_ajaran=? AND semester=? AND jenis=? AND tenant_id=?
  `)
  return {
    dailyFor: (siswaId, mapelId) => daily.get(siswaId, mapelId, tenantId, from, to),
    asesmenFor: (siswaId, mapelId, tahunAjaran, semester, jenis) =>
      asesmen.get(siswaId, mapelId, tahunAjaran, semester, jenis, tenantId),
  }
}

function generateRaporForRombel(db, options) {
  const {
    tenantId, rombelId, tahunAjaran, semester, jenis, from, to,
    idFactory, predikatFromNilai,
  } = options

  const candidates = db.prepare(`
    WITH target_students AS (
      SELECT s.id
      FROM siswa s
      JOIN rombel rb ON rb.id=s.rombel_id AND rb.tenant_id=s.tenant_id
      WHERE s.rombel_id=? AND s.tenant_id=? AND rb.tahun_ajaran=?
    )
    SELECT ph.siswa_id, ph.mapel_id
      FROM penilaian_harian ph
      JOIN target_students ts ON ts.id=ph.siswa_id
      JOIN mapel m ON m.id=ph.mapel_id AND m.tenant_id=?
     WHERE ph.tenant_id=? AND ph.tanggal BETWEEN ? AND ?
    UNION
    SELECT r.siswa_id, r.mapel_id
      FROM rapor r
      JOIN target_students ts ON ts.id=r.siswa_id
      JOIN mapel m ON m.id=r.mapel_id AND m.tenant_id=?
     WHERE r.tenant_id=? AND r.tahun_ajaran=? AND r.semester=?
       AND ((?='rapor_sts' AND r.jenis='sts')
         OR (?='rapor_sas' AND r.jenis IN ('sts','sas')))
  `).all(
    rombelId, tenantId, tahunAjaran,
    tenantId, tenantId, from, to,
    tenantId, tenantId, tahunAjaran, semester, jenis, jenis,
  )

  const { dailyFor, asesmenFor } = makeStatements(db, { tenantId, from, to })
  const upsert = db.prepare(`
    INSERT INTO rapor (
      id, siswa_id, mapel_id, tahun_ajaran, semester, jenis,
      nilai_pengetahuan, nilai_keterampilan, nilai_sikap, nilai_harian,
      nilai_sts, nilai_sas, nilai_akhir, predikat, deskripsi, tenant_id, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(tenant_id, siswa_id, mapel_id, tahun_ajaran, semester, jenis)
    DO UPDATE SET
      nilai_pengetahuan=excluded.nilai_pengetahuan,
      nilai_keterampilan=excluded.nilai_keterampilan,
      nilai_sikap=excluded.nilai_sikap,
      nilai_harian=excluded.nilai_harian,
      nilai_sts=excluded.nilai_sts,
      nilai_sas=excluded.nilai_sas,
      nilai_akhir=excluded.nilai_akhir,
      predikat=excluded.predikat,
      updated_at=datetime('now')
  `)

  return db.transaction(() => {
    let count = 0
    for (const candidate of candidates) {
      const computed = computeNilai({
        daily: dailyFor(candidate.siswa_id, candidate.mapel_id),
        sts: asesmenFor(candidate.siswa_id, candidate.mapel_id, tahunAjaran, semester, 'sts')?.nilai_sts,
        sas: asesmenFor(candidate.siswa_id, candidate.mapel_id, tahunAjaran, semester, 'sas')?.nilai_sts,
        jenis,
      })
      upsert.run(
        idFactory(), candidate.siswa_id, candidate.mapel_id, tahunAjaran, semester, jenis,
        computed.pengetahuan, computed.keterampilan, computed.sikap, computed.harian,
        computed.sts, computed.sas, computed.akhir,
        predikatFromNilai(computed.akhir), '', tenantId,
      )
      count++
    }
    return count
  })()
}

// Tanggal penilaian harian menentukan periode rapor: semester ganjil berjalan
// Juli-Desember, semester genap Januari-Juni tahun berikutnya.
function periodFromTanggal(tanggal) {
  const match = /^(\d{4})-(\d{2})/.exec(String(tanggal || ''))
  if (!match) return null
  const tahun = Number(match[1])
  const bulan = Number(match[2])
  if (!tahun || bulan < 1 || bulan > 12) return null
  return bulan >= 7
    ? { tahunAjaran: `${tahun}/${tahun + 1}`, semester: 'ganjil' }
    : { tahunAjaran: `${tahun - 1}/${tahun}`, semester: 'genap' }
}

function semesterRange(tahunAjaran, semester) {
  const [thn1, thn2] = String(tahunAjaran || '').split('/')
  const y1 = thn1
  const y2 = thn2 || thn1
  const from = semester === 'ganjil' ? `${y1}-07-01` : `${y2}-01-01`
  const to = semester === 'ganjil' ? `${y1}-12-31` : `${y2}-06-30`
  return { from, to }
}

// Pasangan (siswa, mapel, periode) yang perlu dihitung ulang. Bila tanggal
// diberikan, semua pasangan yang dinilai hari itu ikut (opsional disaring).
// Pasangan eksplisit (siswa+mapel) SELALU ikut walau baris nilainya baru saja
// dihapus: menghapus nilai harian terakhir harus tetap menurunkan rapor ke nol,
// dan baris yang sudah dihapus tidak lagi muncul dari pencarian per tanggal.
function refreshTargets(db, options) {
  const { tenantId, siswaId, mapelId, tahunAjaran, semester, tanggal } = options
  const period = (tahunAjaran && semester)
    ? { tahunAjaran, semester }
    : periodFromTanggal(tanggal)
  if (!period) return []

  const targets = []
  const seen = new Set()
  const push = (sid, mid) => {
    if (!sid || !mid) return
    const key = `${sid}:${mid}`
    if (seen.has(key)) return
    seen.add(key)
    targets.push({ siswaId: sid, mapelId: mid, ...period })
  }

  if (siswaId && mapelId) push(siswaId, mapelId)

  if (tanggal) {
    let sql = `SELECT DISTINCT siswa_id, mapel_id FROM penilaian_harian
      WHERE tenant_id=? AND tanggal=? AND siswa_id IS NOT NULL AND mapel_id IS NOT NULL`
    const params = [tenantId, tanggal]
    if (siswaId) { sql += ' AND siswa_id=?'; params.push(siswaId) }
    if (mapelId) { sql += ' AND mapel_id=?'; params.push(mapelId) }
    for (const row of db.prepare(sql).all(...params)) push(row.siswa_id, row.mapel_id)
  }

  return targets
}

// Hitung ulang HANYA rapor yang sudah pernah digenerate. Nilai yang berubah di
// penilaian_harian maupun asesmen tidak boleh membuat rapor basi, tetapi juga
// tidak boleh memunculkan rapor untuk pasangan yang belum diminta guru.
function refreshGeneratedRapor(db, options) {
  const { tenantId, predikatFromNilai } = options || {}
  if (!tenantId) return { updated: 0 }
  const targets = refreshTargets(db, options)
  if (!targets.length) return { updated: 0 }

  const jenisStatement = db.prepare(`SELECT jenis FROM rapor
    WHERE tenant_id=? AND siswa_id=? AND mapel_id=? AND tahun_ajaran=? AND semester=?
      AND jenis IN (${JENIS_GENERATED})`)
  const update = db.prepare(`UPDATE rapor SET
      nilai_pengetahuan=?, nilai_keterampilan=?, nilai_sikap=?, nilai_harian=?,
      nilai_sts=?, nilai_sas=?, nilai_akhir=?, predikat=?, updated_at=datetime('now')
    WHERE tenant_id=? AND siswa_id=? AND mapel_id=? AND tahun_ajaran=? AND semester=? AND jenis=?`)
  // Tanpa fungsi predikat, predikat lama dipertahankan (tidak dikosongkan).
  const updateKeepPredikat = db.prepare(`UPDATE rapor SET
      nilai_pengetahuan=?, nilai_keterampilan=?, nilai_sikap=?, nilai_harian=?,
      nilai_sts=?, nilai_sas=?, nilai_akhir=?, updated_at=datetime('now')
    WHERE tenant_id=? AND siswa_id=? AND mapel_id=? AND tahun_ajaran=? AND semester=? AND jenis=?`)
  const statements = new Map()

  return db.transaction(() => {
    let updated = 0
    for (const target of targets) {
      const key = `${target.tahunAjaran}|${target.semester}`
      if (!statements.has(key)) {
        statements.set(key, makeStatements(db, {
          tenantId,
          ...semesterRange(target.tahunAjaran, target.semester),
        }))
      }
      const { dailyFor, asesmenFor } = statements.get(key)
      const existing = jenisStatement.all(
        tenantId, target.siswaId, target.mapelId, target.tahunAjaran, target.semester,
      )
      if (!existing.length) continue

      const daily = dailyFor(target.siswaId, target.mapelId)
      const sts = asesmenFor(target.siswaId, target.mapelId, target.tahunAjaran, target.semester, 'sts')?.nilai_sts
      const sas = asesmenFor(target.siswaId, target.mapelId, target.tahunAjaran, target.semester, 'sas')?.nilai_sts

      for (const row of existing) {
        const computed = computeNilai({ daily, sts, sas, jenis: row.jenis })
        if (predikatFromNilai) {
          update.run(
            computed.pengetahuan, computed.keterampilan, computed.sikap, computed.harian,
            computed.sts, computed.sas, computed.akhir, predikatFromNilai(computed.akhir),
            tenantId, target.siswaId, target.mapelId, target.tahunAjaran, target.semester, row.jenis,
          )
        } else {
          updateKeepPredikat.run(
            computed.pengetahuan, computed.keterampilan, computed.sikap, computed.harian,
            computed.sts, computed.sas, computed.akhir,
            tenantId, target.siswaId, target.mapelId, target.tahunAjaran, target.semester, row.jenis,
          )
        }
        updated++
      }
    }
    return { updated }
  })()
}

module.exports = { generateRaporForRombel, refreshGeneratedRapor, periodFromTanggal }
