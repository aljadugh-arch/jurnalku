'use strict'

/**
 * Monitoring pengisian nilai per guru/GTK.
 *
 * Matriks: tiap guru × tiap (mapel + rombel) yang diampu, dengan status
 * keterisian tiga jenis nilai:
 *   - harian : dari penilaian_harian (baris dengan minimal satu angka > 0)
 *   - sts    : dari rapor jenis='sts' (nilai_sts > 0)
 *   - sas    : dari rapor jenis='sas' (nilai_sas > 0)
 *
 * Total = jumlah siswa aktif dalam rombel. Setiap sel menyimpan `filled`
 * (jumlah siswa sudah dinilai) dan `total`, sehingga UI bisa menampilkan
 * "STS 28/32" sekaligus status hijau/merah per sel.
 *
 * Murni dari `db` + argumen supaya bisa diuji runtime dengan DB in-memory.
 */

const {
  getGuruWithAssignments,
  getTeacherMapelRombelContext,
} = require('./nilai-rekap-service.cjs')

function semesterRange(tahunAjaran, semester) {
  const [thn1, thn2] = String(tahunAjaran || '').split('/')
  const y1 = thn1
  const y2 = thn2 || thn1
  const from = semester === 'ganjil' ? `${y1}-07-01` : `${y2}-01-01`
  const to = semester === 'ganjil' ? `${y1}-12-31` : `${y2}-06-30`
  return { from, to }
}

// Baris nilai harian dianggap "terisi" bila minimal satu komponen > 0 — sama
// dengan konvensi dashboard-kelengkapan.cjs. Baris semua-nol tidak dihitung.
const HARIAN_TERISI = '(COALESCE(pengetahuan,0) > 0 OR COALESCE(keaktifan,0) > 0 OR COALESCE(sikap,0) > 0)'

function hitungMonitoringNilai(db, { tenantId, tahunAjaran, semester }) {
  const tid = String(tenantId || '').trim()
  if (!tid) throw new Error('Tenant wajib untuk monitoring nilai')
  if (!['ganjil', 'genap'].includes(semester)) throw new Error('semester harus ganjil|genap')
  if (!String(tahunAjaran || '').match(/^\d{4}\/\d{4}$/)) throw new Error('tahun_ajaran harus YYYY/YYYY')

  const { from, to } = semesterRange(tahunAjaran, semester)

  const guruList = getGuruWithAssignments(db, tid)

  const totalSiswaStmt = db.prepare(
    "SELECT COUNT(*) c FROM siswa WHERE rombel_id=? AND tenant_id=? AND COALESCE(status,'aktif')='aktif'"
  )
  const harianStmt = db.prepare(
    `SELECT COUNT(DISTINCT siswa_id) c FROM penilaian_harian
      WHERE mapel_id=? AND tenant_id=? AND tanggal BETWEEN ? AND ? AND ${HARIAN_TERISI}
        AND siswa_id IN (SELECT id FROM siswa WHERE rombel_id=? AND tenant_id=? AND COALESCE(status,'aktif')='aktif')`
  )
  const stsStmt = db.prepare(
    `SELECT COUNT(DISTINCT siswa_id) c FROM rapor
      WHERE mapel_id=? AND tenant_id=? AND tahun_ajaran=? AND semester=? AND jenis='sts' AND COALESCE(nilai_sts,0) > 0
        AND siswa_id IN (SELECT id FROM siswa WHERE rombel_id=? AND tenant_id=? AND COALESCE(status,'aktif')='aktif')`
  )
  const sasStmt = db.prepare(
    `SELECT COUNT(DISTINCT siswa_id) c FROM rapor
      WHERE mapel_id=? AND tenant_id=? AND tahun_ajaran=? AND semester=? AND jenis='sas' AND COALESCE(nilai_sas,0) > 0
        AND siswa_id IN (SELECT id FROM siswa WHERE rombel_id=? AND tenant_id=? AND COALESCE(status,'aktif')='aktif')`
  )

  const daftar = guruList.map(guru => {
    const konteks = getTeacherMapelRombelContext(db, { tenantId: tid, gtkId: guru.id })
    const tugas = konteks.map(k => {
      const total = totalSiswaStmt.get(k.rombel_id, tid).c
      const harian = harianStmt.get(k.mapel_id, tid, from, to, k.rombel_id, tid).c
      const sts = stsStmt.get(k.mapel_id, tid, tahunAjaran, semester, k.rombel_id, tid).c
      const sas = sasStmt.get(k.mapel_id, tid, tahunAjaran, semester, k.rombel_id, tid).c
      return {
        mapel_id: k.mapel_id,
        mapel_nama: k.mapel_nama,
        rombel_id: k.rombel_id,
        rombel_nama: k.rombel_nama,
        tahun_ajaran: k.tahun_ajaran,
        total,
        harian,
        sts,
        sas,
      }
    })
    return { guru_id: guru.id, guru_nama: guru.nama, kode_guru: guru.kode_guru, tugas }
  })

  // Ringkasan lintas-guru: berapa sel jenis nilai yang sudah penuh/total.
  let selHarian = 0, selHarianPenuh = 0
  let selSts = 0, selStsPenuh = 0
  let selSas = 0, selSasPenuh = 0
  for (const g of daftar) {
    for (const t of g.tugas) {
      if (t.total > 0) {
        selHarian++; if (t.harian >= t.total) selHarianPenuh++
        selSts++; if (t.sts >= t.total) selStsPenuh++
        selSas++; if (t.sas >= t.total) selSasPenuh++
      }
    }
  }

  return {
    tahun_ajaran: tahunAjaran,
    semester,
    periode: { from, to },
    jumlah_guru: daftar.length,
    jumlah_tugas: daftar.reduce((s, g) => s + g.tugas.length, 0),
    ringkasan: {
      harian: { sel: selHarian, penuh: selHarianPenuh },
      sts: { sel: selSts, penuh: selStsPenuh },
      sas: { sel: selSas, penuh: selSasPenuh },
    },
    daftar,
  }
}

module.exports = { hitungMonitoringNilai }
