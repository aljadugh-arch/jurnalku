// Perhitungan nilai rapor dipakai bersama oleh generate (membuat baris baru)
// dan refresh (menghitung ulang baris yang sudah ada) agar keduanya tidak
// pernah menghasilkan angka berbeda untuk data sumber yang sama.
const JENIS_GENERATED = "'rapor_sts','rapor_sas'"

// Bobot bawaan = rumus yang sudah dipakai produksi:
//   rapor_sts = harian*0.6 + sts*0.4
//   rapor_sas = harian*0.4 + sts*0.2 + sas*0.4
// Nilai ini bisa ditimpa per tenant/rombel/mapel lewat tabel `rapor_bobot`
// (padanan "bobot Sumatif / SAS" pada RDM). Selama tidak ada baris di tabel
// itu, hasil hitung identik dengan rumus lama.
const BOBOT_DEFAULT = {
  sts: { harian: 0.6, sts: 0.4, sas: 0 },
  sas: { harian: 0.4, sts: 0.2, sas: 0.4 },
}

function clampNilai(value) {
  return Math.max(0, Math.min(100, Number(value) || 0))
}

// Kolom tabel: sts_harian, sts_sts, sts_sas, sas_harian, sas_sts, sas_sas.
function normalizeBobot(row, jenis) {
  if (!row) return null
  const base = BOBOT_DEFAULT[jenis] || BOBOT_DEFAULT.sts
  const pick = (value, fallback) => {
    const n = Number(value)
    return Number.isFinite(n) && n >= 0 ? n : fallback
  }
  return {
    harian: pick(row[`${jenis}_harian`], base.harian),
    sts: pick(row[`${jenis}_sts`], base.sts),
    sas: pick(row[`${jenis}_sas`], base.sas),
  }
}

function computeNilai({ daily, sts, sas, jenis, bobot }) {
  const pengetahuan = daily?.p == null ? 0 : Math.round(Number(daily.p))
  const keterampilan = daily?.k == null ? 0 : Math.round(Number(daily.k))
  const sikap = daily?.sk == null ? 0 : Math.round(Number(daily.sk))
  const harian = !daily || daily.jumlah === 0 || daily.nilai_harian == null
    ? 0
    : Math.round(Number(daily.nilai_harian))

  const nilaiSTS = sts == null ? 0 : clampNilai(sts)
  const nilaiSAS = jenis === 'rapor_sas' && sas != null ? clampNilai(sas) : 0
  const w = bobot || BOBOT_DEFAULT[jenis === 'rapor_sas' ? 'sas' : 'sts']
  const akhir = jenis === 'rapor_sas'
    ? Math.round(harian * w.harian + nilaiSTS * w.sts + nilaiSAS * w.sas)
    : Math.round(harian * w.harian + nilaiSTS * w.sts)

  return { pengetahuan, keterampilan, sikap, harian, sts: nilaiSTS, sas: nilaiSAS, akhir }
}

// Bobot tersimpan untuk satu tenant. Tabel dibuat saat startup; bila DB lama
// belum memilikinya, perhitungan jatuh ke BOBOT_DEFAULT (perilaku lama).
function loadBobot(db, tenantId) {
  try {
    return db.prepare('SELECT * FROM rapor_bobot WHERE tenant_id=?').all(tenantId)
  } catch {
    return []
  }
}

// Baris paling spesifik menang: (mapel+rombel) > mapel > rombel > default tenant.
function pickBobot(rows, { rombelId, mapelId }, jenis) {
  if (!rows?.length) return null
  const rid = rombelId || ''
  const mid = mapelId || ''
  const find = (r, m) => rows.find(row => (row.rombel_id || '') === r && (row.mapel_id || '') === m)
  const row = find(rid, mid) || find('', mid) || find(rid, '') || find('', '')
  return row ? normalizeBobot(row, jenis) : null
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
    SELECT nilai_sts, nilai_sas
    FROM rapor
    WHERE siswa_id=? AND mapel_id=? AND tahun_ajaran=? AND semester=? AND jenis=? AND tenant_id=?
  `)
  return {
    dailyFor: (siswaId, mapelId) => daily.get(siswaId, mapelId, tenantId, from, to),
    asesmenFor: (siswaId, mapelId, tahunAjaran, semester, jenis) => {
      const row = asesmen.get(siswaId, mapelId, tahunAjaran, semester, jenis, tenantId)
      return row ? { ...row, nilai: jenis === 'sas' ? (row.nilai_sas || row.nilai_sts) : row.nilai_sts } : row
    },
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
  const bobotRows = loadBobot(db, tenantId)
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
        sts: asesmenFor(candidate.siswa_id, candidate.mapel_id, tahunAjaran, semester, 'sts')?.nilai,
        sas: asesmenFor(candidate.siswa_id, candidate.mapel_id, tahunAjaran, semester, 'sas')?.nilai,
        jenis,
        bobot: pickBobot(bobotRows, { rombelId, mapelId: candidate.mapel_id }, jenis === 'rapor_sas' ? 'sas' : 'sts'),
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
  const rombelStatement = db.prepare('SELECT rombel_id FROM siswa WHERE id=? AND tenant_id=?')
  const bobotRows = loadBobot(db, tenantId)
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
      const rombelId = rombelStatement.get(target.siswaId, tenantId)?.rombel_id

      for (const row of existing) {
        const computed = computeNilai({
          daily,
          sts,
          sas,
          jenis: row.jenis,
          bobot: pickBobot(
            bobotRows,
            { rombelId, mapelId: target.mapelId },
            row.jenis === 'rapor_sas' ? 'sas' : 'sts',
          ),
        })
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

// Hitung rapor SATU siswa SECARA LANGSUNG dari penilaian_harian + asesmen
// (nilai_sts/sas di tabel rapor) TANPA baris rapor ter-materialisasi. Dipakai
// layanan cetak supaya rapor bisa dicetak tanpa langkah "generate" manual —
// hasil identik dengan generateRaporForRombel untuk sumber data yang sama.
function computeRaporLive(db, { tenantId, siswaId, rombelId, tahunAjaran, semester, jenis }) {
  const { from, to } = semesterRange(tahunAjaran, semester)
  const { dailyFor, asesmenFor } = makeStatements(db, { tenantId, from, to })
  const bobotRows = loadBobot(db, tenantId)

  const mapelIds = db.prepare(`
    SELECT DISTINCT mapel_id FROM penilaian_harian
      WHERE siswa_id=? AND tenant_id=? AND tanggal BETWEEN ? AND ?
    UNION
    SELECT DISTINCT mapel_id FROM rapor
      WHERE siswa_id=? AND tenant_id=? AND tahun_ajaran=? AND semester=?
  `).all(siswaId, tenantId, from, to, siswaId, tenantId, tahunAjaran, semester).map(r => r.mapel_id)

  const rows = []
  for (const mapelId of mapelIds) {
    const m = db.prepare('SELECT nama, kelompok FROM mapel WHERE id=? AND tenant_id=?').get(mapelId, tenantId)
    if (!m) continue
    const computed = computeNilai({
      daily: dailyFor(siswaId, mapelId),
      sts: asesmenFor(siswaId, mapelId, tahunAjaran, semester, 'sts')?.nilai,
      sas: asesmenFor(siswaId, mapelId, tahunAjaran, semester, 'sas')?.nilai,
      jenis,
      bobot: pickBobot(bobotRows, { rombelId, mapelId }, jenis === 'rapor_sas' ? 'sas' : 'sts'),
    })
    rows.push({
      mapel_id: mapelId, mapel_nama: m.nama, mapel_kelompok: m.kelompok,
      nilai_akhir: computed.akhir, nilai_sts: computed.sts, nilai_sas: computed.sas, kkm: 70,
    })
  }
  rows.sort((a, b) =>
    String(a.mapel_kelompok || 'wajib').localeCompare(String(b.mapel_kelompok || 'wajib')) ||
    String(a.mapel_nama).localeCompare(String(b.mapel_nama))
  )
  const jumlah = rows.reduce((s, r) => s + r.nilai_akhir, 0)
  const rata = rows.length ? jumlah / rows.length : 0
  return { rows, jumlah, rata }
}

// Peringkat seluruh siswa aktif satu rombel berdasarkan rata-rata nilai akhir
// yang dihitung langsung (bukan dari tabel rapor). Return array terurut
// [{siswa_id, rata}], index 0 = nilai tertinggi.
function computeRombelRanking(db, { tenantId, rombelId, tahunAjaran, semester, jenis }) {
  const siswaRows = db.prepare(`SELECT id FROM siswa WHERE tenant_id=? AND rombel_id=? AND COALESCE(status,'aktif')='aktif'`)
    .all(tenantId, rombelId)
  const ranked = []
  for (const s of siswaRows) {
    const live = computeRaporLive(db, { tenantId, siswaId: s.id, rombelId, tahunAjaran, semester, jenis })
    ranked.push({ siswa_id: s.id, rata: live.rata })
  }
  ranked.sort((a, b) => b.rata - a.rata)
  return ranked
}

module.exports = {
  generateRaporForRombel,
  refreshGeneratedRapor,
  periodFromTanggal,
  computeNilai,
  normalizeBobot,
  pickBobot,
  loadBobot,
  makeStatements,
  BOBOT_DEFAULT,
  computeRaporLive,
  computeRombelRanking,
}
