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

  const dailyStatement = db.prepare(`
    SELECT
      AVG(pengetahuan) p,
      AVG(keaktifan) k,
      AVG(sikap) sk,
      AVG(pengetahuan*0.5 + keaktifan*0.3 + sikap*0.2) nilai_harian,
      COUNT(*) jumlah
    FROM penilaian_harian
    WHERE siswa_id=? AND mapel_id=? AND tenant_id=? AND tanggal BETWEEN ? AND ?
  `)
  const assessmentStatement = db.prepare(`
    SELECT nilai_sts
    FROM rapor
    WHERE siswa_id=? AND mapel_id=? AND tahun_ajaran=? AND semester=? AND jenis=? AND tenant_id=?
  `)
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
      const daily = dailyStatement.get(candidate.siswa_id, candidate.mapel_id, tenantId, from, to)
      const peng = daily.p == null ? 0 : Math.round(Number(daily.p))
      const ket = daily.k == null ? 0 : Math.round(Number(daily.k))
      const sik = daily.sk == null ? 0 : Math.round(Number(daily.sk))
      const nilaiHarian = daily.jumlah === 0 || daily.nilai_harian == null
        ? 0
        : Math.round(Number(daily.nilai_harian))

      const stsRow = assessmentStatement.get(
        candidate.siswa_id, candidate.mapel_id, tahunAjaran, semester, 'sts', tenantId,
      )
      const sasRow = jenis === 'rapor_sas'
        ? assessmentStatement.get(
          candidate.siswa_id, candidate.mapel_id, tahunAjaran, semester, 'sas', tenantId,
        )
        : null
      const nilaiSTS = stsRow == null ? 0 : Math.max(0, Math.min(100, Number(stsRow.nilai_sts)))
      const nilaiSAS = sasRow == null ? 0 : Math.max(0, Math.min(100, Number(sasRow.nilai_sts)))
      const akhir = jenis === 'rapor_sas'
        ? Math.round(nilaiHarian * 0.4 + nilaiSTS * 0.2 + nilaiSAS * 0.4)
        : Math.round(nilaiHarian * 0.6 + nilaiSTS * 0.4)

      upsert.run(
        idFactory(), candidate.siswa_id, candidate.mapel_id, tahunAjaran, semester, jenis,
        peng, ket, sik, nilaiHarian, nilaiSTS, nilaiSAS, akhir,
        predikatFromNilai(akhir), '', tenantId,
      )
      count++
    }
    return count
  })()
}

module.exports = { generateRaporForRombel }
