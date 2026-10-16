'use strict'

// Kategori GTK: status kepegawaian, jabatan, dan sertifikasi.
//
// Satu sumber untuk backend + frontend (FE memakai daftar yang sama lewat
// endpoint `/api/gtk/kategori`) supaya label dan nilai tidak pernah berbeda.
//
// Catatan data lama: kolom `status_kepegawaian` sudah berisi campuran
// ('Honorer', 'honorer', 'Tetap', 'PNS'). `normalisasiStatus` memetakan ke
// nilai kanonik huruf kecil tanpa mengubah arti; 'Tetap' dipertahankan karena
// tidak bisa dipastikan apakah PNS atau GTY.

const STATUS_KEPEGAWAIAN = [
  { value: 'pns', label: 'PNS / ASN', ket: 'Pegawai Negeri Sipil / ASN' },
  { value: 'pppk', label: 'PPPK', ket: 'Pegawai Pemerintah dengan Perjanjian Kerja' },
  { value: 'gty', label: 'GTY', ket: 'Guru Tetap Yayasan' },
  { value: 'gtt', label: 'GTT', ket: 'Guru Tidak Tetap' },
  { value: 'honorer', label: 'Honorer', ket: 'Tenaga honorer' },
  { value: 'tetap', label: 'Tetap', ket: 'Status lama (belum dirinci PNS/GTY)' },
]

const JABATAN = [
  { value: 'guru', label: 'Guru' },
  { value: 'guru_bk', label: 'Guru BK', ket: 'Bimbingan Konseling' },
  { value: 'kepala', label: 'Kepala Lembaga' },
  { value: 'wakil_kepala', label: 'Wakil Kepala' },
  { value: 'operator', label: 'Operator' },
  { value: 'tata_usaha', label: 'Tata Usaha' },
  { value: 'bendahara', label: 'Bendahara' },
  { value: 'pustakawan', label: 'Pustakawan' },
  { value: 'tenaga_kependidikan', label: 'Tenaga Kependidikan' },
]

const SERTIFIKASI = [
  { value: 'sudah', label: 'Sudah Sertifikasi' },
  { value: 'belum', label: 'Belum Sertifikasi' },
]

const NILAI_STATUS = new Set(STATUS_KEPEGAWAIAN.map(s => s.value))
const NILAI_JABATAN = new Set(JABATAN.map(j => j.value))
const NILAI_SERTIFIKASI = new Set(SERTIFIKASI.map(s => s.value))

/** Peta alias lama → nilai kanonik (huruf kecil, tanpa spasi/garis). */
const ALIAS_STATUS = {
  pns: 'pns', asn: 'pns', 'pns/asn': 'pns', 'pns-asn': 'pns', pnsasn: 'pns',
  pppk: 'pppk', pppkparuhwaktu: 'pppk',
  gty: 'gty', gurutetapyayasan: 'gty',
  gtt: 'gtt', gurutidaktetap: 'gtt',
  honorer: 'honorer', honor: 'honorer', honorerdaerah: 'honorer',
  tetap: 'tetap', gurutetap: 'tetap',
}

function kunci(v) {
  return String(v ?? '').toLowerCase().replace(/[\s_-]+/g, '')
}

/** Nilai kanonik status kepegawaian; kosong/tak dikenal → 'honorer' (default kolom). */
function normalisasiStatus(v) {
  const k = kunci(v)
  if (!k) return 'honorer'
  return ALIAS_STATUS[k] || (NILAI_STATUS.has(String(v).toLowerCase()) ? String(v).toLowerCase() : 'honorer')
}

const ALIAS_JABATAN = {
  guru: 'guru', gurumapel: 'guru', gurubk: 'guru_bk', gurubimbingankonseling: 'guru_bk', bimbingankonseling: 'guru_bk', bk: 'guru_bk',
  kepala: 'kepala', kepalasekolah: 'kepala', kepalamadrasah: 'kepala', kepalalembaga: 'kepala',
  wakilkepala: 'wakil_kepala', wakasek: 'wakil_kepala',
  operator: 'operator', admin: 'operator', adminoperator: 'operator',
  tatausaha: 'tata_usaha', tu: 'tata_usaha', stafftu: 'tata_usaha', staf_tu: 'tata_usaha',
  bendahara: 'bendahara', pustakawan: 'pustakawan',
  tenagakependidikan: 'tenaga_kependidikan', tendik: 'tenaga_kependidikan',
}

/** Nilai kanonik jabatan; kosong → 'guru'. */
function normalisasiJabatan(v) {
  const k = kunci(v)
  if (!k) return 'guru'
  return ALIAS_JABATAN[k] || (NILAI_JABATAN.has(String(v).toLowerCase()) ? String(v).toLowerCase() : 'guru')
}

/** Nilai kanonik sertifikasi; kosong → 'belum'. */
function normalisasiSertifikasi(v) {
  const k = kunci(v)
  if (['sudah', 'ya', 'yes', '1', 'true', 'sertifikasi', 'bersertifikat'].includes(k)) return 'sudah'
  return 'belum'
}

function labelStatus(v) {
  return STATUS_KEPEGAWAIAN.find(s => s.value === normalisasiStatus(v))?.label || 'Honorer'
}
function labelJabatan(v) {
  return JABATAN.find(j => j.value === normalisasiJabatan(v))?.label || 'Guru'
}

module.exports = {
  STATUS_KEPEGAWAIAN, JABATAN, SERTIFIKASI,
  normalisasiStatus, normalisasiJabatan, normalisasiSertifikasi,
  labelStatus, labelJabatan,
}
