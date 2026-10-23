'use strict'

// Helper format nilai yang dipakai BERSAMA oleh jalur Kurikulum Merdeka
// (buku induk, rapor mtsplus). Dipisah dari rapor-k13-service.cjs setelah
// K-13 dihapus — fungsi-fungsi ini TIDAK spesifik K-13 dan tetap dibutuhkan.

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
  if (n > 999) return String(n)
  return terbilangTiga(Math.round(n)).replace(/^./, c => c.toUpperCase())
}

// Nilai sikap (huruf) pada skala A-E. Input bisa huruf atau angka kasar.
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

// Rentang tanggal semester dari tahun_ajaran "YYYY/YYYY" + semester ganjil|genap.
// NOTE signature: (semester, tahunAjaran) — beda dari rapor-grade-service.cjs
// yang memakai (tahunAjaran, semester). Pemakai lama memanggil semester dulu.
function semesterRange(semester, tahunAjaran) {
  const m = String(tahunAjaran || '').match(/^(\d{4})\/(\d{4})$/)
  if (!m) return null
  const y1 = Number(m[1]); const y2 = Number(m[2])
  if (String(semester).toLowerCase() === 'ganjil') return { from: `${y1}-07-01`, to: `${y1}-12-31` }
  return { from: `${y2}-01-01`, to: `${y2}-06-30` }
}

module.exports = { terbilang, nilaiKeAbjad, semesterRange }
