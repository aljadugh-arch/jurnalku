// Types for SIMS/M (Sistem Informasi Managemen Sekolah/Madrasah)

export type UserRole = 'super_admin' | 'admin' | 'kepala' | 'guru' | 'siswa' | 'wali_kelas'

export interface User {
  id: string
  nama: string
  email: string
  role: UserRole
  avatar?: string
  nip?: string
  nis?: string
}

export interface Siswa {
  id: string
  nis: string
  nisn: string
  nama: string
  jenis_kelamin: 'L' | 'P'
  tempat_lahir: string
  tanggal_lahir: string
  alamat: string
  no_hp: string
  nama_ortu: string
  rombel_id: string
  foto?: string
  status: 'aktif' | 'nonaktif' | 'lulus' | 'pindah'
}

export interface GTK {
  id: string
  nip: string
  nuptk: string
  nama: string
  jenis_kelamin: 'L' | 'P'
  tempat_lahir: string
  tanggal_lahir: string
  alamat: string
  no_hp: string
  email: string
  jabatan: 'guru' | 'kepala_sekolah' | 'wakil_kepala' | 'staff_tu' | 'guru_bk'
  status_kepegawaian: 'pns' | 'pppk' | 'honorer' | 'gtk'
  bidang_studi?: string
  foto?: string
  status: 'aktif' | 'nonaktif'
}

export interface Mapel {
  id: string
  kode: string
  nama: string
  kelompok: 'wajib' | 'peminatan' | 'muatan_lokal'
  tingkat: string[]
  jam_per_minggu: number
}

export interface Rombel {
  id: string
  nama: string
  tingkat: string
  tahun_ajaran: string
  wali_kelas_id: string
  kapasitas: number
  jumlah_siswa: number
}

export interface JadwalMapel {
  id: string
  mapel_id: string
  rombel_id: string
  gtk_id: string
  hari: 'senin' | 'selasa' | 'rabu' | 'kamis' | 'jumat' | 'sabtu'
  jam_mulai: string
  jam_selesai: string
  ruangan: string
}

export interface JurnalMengajar {
  id: string
  gtk_id: string
  mapel_id: string
  rombel_id: string
  tanggal: string
  jam_ke: number
  materi: string
  kegiatan: string
  catatan?: string
  status: 'draft' | 'submitted' | 'approved'
}

export interface AbsensiSiswa {
  id: string
  siswa_id: string
  rombel_id: string
  tanggal: string
  jam_ke?: number
  status: 'hadir' | 'sakit' | 'izin' | 'alpha'
  metode: 'qrcode' | 'manual'
  keterangan?: string
  waktu_absen?: string
}

export interface AbsensiEkskul {
  id: string
  siswa_id: string
  ekskul_id: string
  tanggal: string
  status: 'hadir' | 'sakit' | 'izin' | 'alpha'
  keterangan?: string
}

export interface AbsensiKokurikuler {
  id: string
  siswa_id: string
  kegiatan_id: string
  tanggal: string
  status: 'hadir' | 'sakit' | 'izin' | 'alpha'
  keterangan?: string
}

export interface AbsensiKegiatan {
  id: string
  siswa_id: string
  kegiatan_nama: string
  tanggal: string
  status: 'hadir' | 'sakit' | 'izin' | 'alpha'
  keterangan?: string
}

export interface AbsensiGuru {
  id: string
  gtk_id: string
  tanggal: string
  waktu_masuk?: string
  waktu_pulang?: string
  latitude?: number
  longitude?: number
  status: 'hadir' | 'sakit' | 'izin' | 'dinas_luar' | 'alpha'
  foto_selfie?: string
  jarak_dari_sekolah?: number
}

export interface Ekskul {
  id: string
  nama: string
  pembina_id: string
  hari: string
  jam_mulai: string
  jam_selesai: string
  deskripsi?: string
}

export interface ModulAjar {
  id: string
  gtk_id: string
  mapel_id: string
  tingkat: string
  judul: string
  tujuan_pembelajaran: string
  kegiatan_pembelajaran: string
  asesmen: string
  sumber_belajar: string
  status: 'draft' | 'generated' | 'final'
  created_at: string
}

export interface TahunAjaran {
  id: string
  nama: string
  semester: '1' | '2'
  aktif: boolean
  tanggal_mulai: string
  tanggal_selesai: string
}

export interface DashboardStats {
  total_siswa: number
  total_gtk: number
  total_rombel: number
  total_mapel: number
  kehadiran_hari_ini: number
  jurnal_hari_ini: number
}
