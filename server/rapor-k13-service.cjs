'use strict'

// Helper murni untuk rapor K-13 (klasik): terbilang, nilai->abjad (sikap), peringkat,
// dan pembacaan data per siswa. Semua fungsi menerima `db` sebagai argumen pertama
// agar bisa diuji dengan better-sqlite3 :memory: tanpa HTTP.

const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas']
const BELASAN = ['sepuluh', 'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas', 'enam belas', 'tujuh belas', 'delapan belas', 'sembilan belas']

function terbilangDua(n) {
  if (n < 12) return SATUAN[n]
  if (n < 20) return BELASAN[n - 10]
  const puluh = Math.floor(n / 10)
  const sisa = n % 10
  return `${SATUAN[puluh]} puluh${sisa ? ' ' + SATUAN[sisa] : ''}`
}

function terbilangTiga(n) {
  const ratus = Math.floor(n / 100)
  const sisa = n % 100
  const ratusText = ratus ? (ratus === 1 ? 'seratus' : `${SATUAN[ratus]} ratus`) : ''
  return `${ratusText}${ratusText && sisa ? ' ' : ''}${sisa ? terbilangDua(sisa) : ''}`.trim()
}

// Angka (0-999) menjadi terbilang bahasa Indonesia (capitalized).
function terbilang(num) {
  const n = Number(num)
  if (!Number.isFinite(n)) return '-'
  if (n === 0) return 'Nol'
  if (n < 0) return `Minus ${terbilang(-n)}`
  if (n > 999) return String(n) // di luar rentang cukup angka
  return terbilangTiga(Math.round(n)).replace(/^./, c => c.toUpperCase())
}

// Nilai sikap (huruf) pada skala. Input bisa berupa huruf atau angka kasar.
function nilaiKeAbjad(value) {
  if (value == null || value === '') return '-'
  const v = String(value).trim().toUpperCase()
  if (/^[A-E]$/.test(v)) return v
  const n = Number(value)
  if (Number.isFinite(n)) {
    if (n >= 90) return 'A'
    if (n >= 80) return 'B'
    if (n >= 70) return 'C'
    if (n >= 60) return 'D'
    return 'E'
  }
  return '-'
}

// Peringkat per rombel (1 = nilai tertinggi). `rows` = [{id, rata2, rombel_id}].
function hitungPeringkat(rows, rombelId) {
  const skor = (rows || [])
    .filter(r => r && r.rombel_id === rombelId && Number.isFinite(Number(r.rata2)))
    .map(r => ({ id: r.id, rata2: Number(r.rata2) }))
    .sort((a, b) => b.rata2 - a.rata2)
  const total = skor.length
  const rankBy = new Map()
  let prev = null
  let prevRank = 0
  skor.forEach((s, idx) => {
    const rank = s.rata2 === prev ? prevRank : idx + 1
    rankBy.set(s.id, rank)
    prev = s.rata2
    prevRank = rank
  })
  return { rankBy, total }
}

function emptyK13() {
  return { siswa: null, rombel: null, mapel: [], sikap: null, ketidakhadiran: { sakit: 0, izin: 0, alpa: 0 }, waliKelas: null }
}

// Predikat K-13 dari nilai (skala A-E).
function predikatK13(nilai) {
  const n = Number(nilai) || 0
  if (n >= 90) return 'A'
  if (n >= 80) return 'B'
  if (n >= 70) return 'C'
  if (n >= 60) return 'D'
  return 'E'
}

// Normalisasi masukan nilai K-13: clamp 0-100, kkm default 75, predikat otomatis.
function normalizeK13Nilai(raw) {
  const nilai = Math.max(0, Math.min(100, Math.round(Number(raw?.nilai) || 0)))
  const kkm = Math.max(0, Math.min(100, Math.round(Number(raw?.kkm) || 75)))
  return { nilai, kkm, predikat: raw?.predikat || predikatK13(nilai), deskripsi: raw?.deskripsi || '' }
}

// Rentang tanggal semester dari tahun_ajaran "YYYY/YYYY" + semester ganjil|genap.
function semesterRange(semester, tahunAjaran) {
  const m = String(tahunAjaran || '').match(/^(\d{4})\/(\d{4})$/)
  if (!m) return null
  const y1 = Number(m[1]); const y2 = Number(m[2])
  if (String(semester).toLowerCase() === 'ganjil') return { from: `${y1}-07-01`, to: `${y1}-12-31` }
  return { from: `${y2}-01-01`, to: `${y2}-06-30` }
}

// Baca seluruh data satu siswa untuk cetak rapor K-13.
function getK13RaporData(db, tenantId, { siswaId, semester, tahunAjaran }) {
  const siswa = db.prepare(`SELECT s.*, r.nama rombel_nama, r.tingkat rombel_tingkat, r.wali_kelas_id
    FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id
    WHERE s.id=? AND s.tenant_id=? AND COALESCE(s.status,'aktif')='aktif'`).get(siswaId, tenantId)
  if (!siswa) return emptyK13()

  const mapel = db.prepare(`SELECT m.id, m.nama, m.kelompok, COALESCE(rk.nilai, 0) nilai, COALESCE(rk.kkm, 75) kkm, rk.predikat, rk.deskripsi
    FROM rapor_k13 rk JOIN mapel m ON m.id=rk.mapel_id
    WHERE rk.siswa_id=? AND rk.tenant_id=? AND rk.tahun_ajaran=? AND rk.semester=? ORDER BY m.nama`)
    .all(siswaId, tenantId, tahunAjaran, semester)

  let sikap = db.prepare('SELECT * FROM sikap_k13 WHERE siswa_id=? AND tenant_id=? AND tahun_ajaran=? AND semester=?').get(siswaId, tenantId, tahunAjaran, semester) || null

  let ketidakhadiran = { sakit: 0, izin: 0, alpa: 0 }
  const range = semesterRange(semester, tahunAjaran)
  if (range) {
    const row = db.prepare(`SELECT
      SUM(CASE WHEN lower(status) IN ('sakit','sick') THEN 1 ELSE 0 END) sakit,
      SUM(CASE WHEN lower(status) IN ('izin','ijin','permitted') THEN 1 ELSE 0 END) izin,
      SUM(CASE WHEN lower(status) IN ('alpha','alpa','absent') THEN 1 ELSE 0 END) alpa
      FROM absensi_siswa WHERE siswa_id=? AND tenant_id=? AND tanggal>=? AND tanggal<=?`)
      .get(siswaId, tenantId, range.from, range.to)
    if (row) ketidakhadiran = { sakit: Number(row.sakit || 0), izin: Number(row.izin || 0), alpa: Number(row.alpa || 0) }
  }

  let waliKelas = null
  if (siswa.wali_kelas_id) {
    waliKelas = db.prepare('SELECT nama FROM gtk WHERE id=? AND tenant_id=?').get(siswa.wali_kelas_id, tenantId) || null
  }
  return { siswa, mapel, sikap, ketidakhadiran, waliKelas, semester, tahunAjaran }
}

// Peringkat + rata-rata seluruh siswa satu rombel pada semester tertentu.
function getPeringkatK13(db, tenantId, { rombelId, semester, tahunAjaran }) {
  const rows = db.prepare(`SELECT s.id, s.rombel_id, AVG(rk.nilai) rata2, COUNT(rk.id) jml
    FROM siswa s JOIN rapor_k13 rk ON rk.siswa_id=s.id
    WHERE s.rombel_id=? AND s.tenant_id=? AND rk.tahun_ajaran=? AND rk.semester=? AND COALESCE(s.status,'aktif')='aktif'
    GROUP BY s.id`).all(rombelId, tenantId, tahunAjaran, semester)
  const { rankBy, total } = hitungPeringkat(rows, rombelId)
  return { rows: rows.map(r => ({ ...r, rank: rankBy.get(r.id) || 0 })), total }
}

module.exports = { terbilang, nilaiKeAbjad, hitungPeringkat, getK13RaporData, getPeringkatK13, semesterRange, predikatK13, normalizeK13Nilai, emptyK13 }