// Tipe institusi + terminologi (sebutan) per tipe — supaya "siswa" jadi
// "mahasiswa"/"santri"/"karyawan", "guru" jadi "dosen"/"ustadz"/"trainer", dst.
// Dipakai di seluruh UI (menu, header halaman, tombol) lewat useTerminologi().
import { canonicalJenjang } from './jenjang'

export type TipeInstitusi =
  | 'madrasah'
  | 'sekolah'
  | 'pesantren'
  | 'perguruan_tinggi'
  | 'diklat'
  | 'kursus'
  | 'bimbel'
  | 'perusahaan'
  | 'swasta'
  | 'umum'

export const TIPE_INSTITUSI_OPTIONS: Array<{ value: TipeInstitusi; label: string }> = [
  { value: 'madrasah', label: 'Madrasah (RA/MI/MTs/MA/MAK)' },
  { value: 'sekolah', label: 'Sekolah (TK/SD/SMP/SMA/SMK)' },
  { value: 'pesantren', label: 'Pesantren / Pondok' },
  { value: 'perguruan_tinggi', label: 'Perguruan Tinggi' },
  { value: 'diklat', label: 'Diklat / Pelatihan' },
  { value: 'kursus', label: 'Kursus Keterampilan' },
  { value: 'bimbel', label: 'Bimbingan Belajar (Bimbel)' },
  { value: 'perusahaan', label: 'Perusahaan / Korporat' },
  { value: 'swasta', label: 'Sekolah Swasta' },
  { value: 'umum', label: 'Umum / Lainnya' },
]

export interface Terminologi {
  siswa: string
  guru: string
  mapel: string
  rombel: string
  kelas: string
  waliKelas: string
  kepala: string
  nis: string
  gtData: string // judul halaman "Data Siswa/Guru"
  dataSiswa: string // label menu "Data Siswa"
  dataGuru: string // label menu "Data GTK"
}

const T: Record<TipeInstitusi, Terminologi> = {
  madrasah: {
    siswa: 'Siswa', guru: 'Guru', mapel: 'Mata Pelajaran', rombel: 'Rombongan Belajar',
    kelas: 'Kelas', waliKelas: 'Wali Kelas', kepala: 'Kepala Madrasah', nis: 'NIS',
    gtData: 'Siswa', dataSiswa: 'Data Siswa', dataGuru: 'Data GTK',
  },
  sekolah: {
    siswa: 'Siswa', guru: 'Guru', mapel: 'Mata Pelajaran', rombel: 'Rombongan Belajar',
    kelas: 'Kelas', waliKelas: 'Wali Kelas', kepala: 'Kepala Sekolah', nis: 'NIS',
    gtData: 'Siswa', dataSiswa: 'Data Siswa', dataGuru: 'Data GTK',
  },
  pesantren: {
    siswa: 'Santri', guru: 'Ustadz/Ustadzah', mapel: 'Kitab & Materi', rombel: 'Halaqah',
    kelas: 'Kelas', waliKelas: 'Wali Asuh', kepala: 'Pengasuh', nis: 'NIS',
    gtData: 'Santri', dataSiswa: 'Data Santri', dataGuru: 'Data Ustadz/Ustadzah',
  },
  perguruan_tinggi: {
    siswa: 'Mahasiswa', guru: 'Dosen', mapel: 'Mata Kuliah', rombel: 'Kelas',
    kelas: 'Kelas', waliKelas: 'Dosen Wali', kepala: 'Rektor', nis: 'NIM',
    gtData: 'Mahasiswa', dataSiswa: 'Data Mahasiswa', dataGuru: 'Data Dosen',
  },
  diklat: {
    siswa: 'Peserta', guru: 'Instruktur', mapel: 'Materi Pelatihan', rombel: 'Angkatan',
    kelas: 'Angkatan', waliKelas: 'Mentor', kepala: 'Kepala Diklat', nis: 'ID Peserta',
    gtData: 'Peserta', dataSiswa: 'Data Peserta', dataGuru: 'Data Instruktur',
  },
  kursus: {
    siswa: 'Peserta', guru: 'Instruktur', mapel: 'Materi', rombel: 'Kelas',
    kelas: 'Kelas', waliKelas: 'Mentor', kepala: 'Kepala Lembaga', nis: 'ID Peserta',
    gtData: 'Peserta', dataSiswa: 'Data Peserta', dataGuru: 'Data Instruktur',
  },
  bimbel: {
    siswa: 'Siswa', guru: 'Tentor', mapel: 'Materi', rombel: 'Kelas',
    kelas: 'Kelas', waliKelas: 'Mentor', kepala: 'Kepala Lembaga', nis: 'ID Siswa',
    gtData: 'Siswa', dataSiswa: 'Data Siswa', dataGuru: 'Data Tentor',
  },
  perusahaan: {
    siswa: 'Karyawan', guru: 'Trainer', mapel: 'Modul Pelatihan', rombel: 'Divisi',
    kelas: 'Batch', waliKelas: 'Mentor', kepala: 'Direktur', nis: 'NIP',
    gtData: 'Karyawan', dataSiswa: 'Data Karyawan', dataGuru: 'Data Trainer',
  },
  swasta: {
    siswa: 'Siswa', guru: 'Guru', mapel: 'Mata Pelajaran', rombel: 'Rombongan Belajar',
    kelas: 'Kelas', waliKelas: 'Wali Kelas', kepala: 'Kepala Sekolah', nis: 'NIS',
    gtData: 'Siswa', dataSiswa: 'Data Siswa', dataGuru: 'Data GTK',
  },
  umum: {
    siswa: 'Peserta Didik', guru: 'Pengajar', mapel: 'Materi', rombel: 'Kelompok',
    kelas: 'Kelas', waliKelas: 'Pembimbing', kepala: 'Pimpinan', nis: 'ID',
    gtData: 'Peserta Didik', dataSiswa: 'Data Peserta', dataGuru: 'Data Pengajar',
  },
}

/** Turunkan tipe institusi dari jenjang bila pengguna belum memilih eksplisit. */
export function deriveTipeInstitusi(jenjang?: string): TipeInstitusi {
  const raw = String(jenjang || '').toLowerCase()
  if (/pesantren|pondok/.test(raw)) return 'pesantren'
  const j = canonicalJenjang(jenjang).toUpperCase()
  if (j === 'PT' || /perguruan|universitas|kampus|politeknik|akademi|sekolah tinggi|institut/.test(raw)) return 'perguruan_tinggi'
  if (['RA', 'MI', 'MTS', 'MA', 'MAK'].includes(j) || /madrasah|ibtidaiyah|tsanawiyah|aliyah|diniyah/.test(raw)) return 'madrasah'
  if (['TK', 'SD', 'SMP', 'SMA', 'SMK'].includes(j) || /sekolah|paud|taman kanak/.test(raw)) return 'sekolah'
  if (['NF'].includes(j) || /diklat|pelatihan/.test(raw)) return 'diklat'
  if (/kursus/.test(raw)) return 'kursus'
  if (/bimbel|bimbingan belajar/.test(raw)) return 'bimbel'
  if (/perusahaan|korporat|kantor/.test(raw)) return 'perusahaan'
  return 'umum'
}

export function terminologiUntuk(tipe?: string): Terminologi {
  return T[(tipe || 'umum') as TipeInstitusi] || T.umum
}

/** Ganti token umum pada string (label menu/header) dengan sebutan tipe institusi. */
export function terapkanTerminologi(teks: string, t: Terminologi): string {
  return teks
    .replace(/Rombongan Belajar/g, t.rombel)
    .replace(/Mata Pelajaran/g, t.mapel)
    .replace(/Wali Kelas/g, t.waliKelas)
    .replace(/Kepala Madrasah|Kepala Sekolah/g, t.kepala)
    .replace(/Data GTK/g, t.dataGuru)
    .replace(/Data Siswa/g, t.dataSiswa)
    .replace(/\bSiswa\b/g, t.siswa)
    .replace(/\bGuru\b/g, t.guru)
}

