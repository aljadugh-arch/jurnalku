'use strict'

// Program belajar + grade/level untuk lembaga NONFORMAL (kursus, bimbel, sanggar).
//
// Sekolah formal memakai `mapel` + `rombel` (tingkat I-XII). Lembaga kursus tidak
// punya keduanya: yang mereka jual adalah PROGRAM (mis. "Bahasa Inggris",
// "Komputer & Desain") dengan TINGKAT/LEVEL bertahap (mis. Basic -> Intermediate
// -> Advanced, atau Grade 1-6). Modul ini menyediakan dua tabel itu supaya admin
// lembaga bisa menambah/mengubah/menghapus sendiri dari UI, tanpa deploy.
//
// Aturan:
//   - Tenant-scoped: semua query wajib menyertakan tenant_id.
//   - Nama program unik per lembaga; nama level unik per program.
//   - Hapus program = hapus levelnya juga (level tidak bermakna tanpa program).
//   - Urutan level dipakai untuk menampilkan tangga belajar (Basic -> Advanced).

const crypto = require('node:crypto')

function setupProgramBelajarTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS program_belajar (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      nama TEXT NOT NULL,
      deskripsi TEXT NOT NULL DEFAULT '',
      kategori TEXT NOT NULL DEFAULT '',
      durasi_pertemuan INTEGER NOT NULL DEFAULT 0,
      aktif INTEGER NOT NULL DEFAULT 1,
      urutan INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_program_belajar_tenant ON program_belajar(tenant_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_program_belajar_nama ON program_belajar(tenant_id, nama);

    CREATE TABLE IF NOT EXISTS program_level (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      nama TEXT NOT NULL,
      grade TEXT NOT NULL DEFAULT '',
      deskripsi TEXT NOT NULL DEFAULT '',
      urutan INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (program_id) REFERENCES program_belajar(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_program_level_tenant ON program_level(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_program_level_program ON program_level(program_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_program_level_nama ON program_level(program_id, nama);

    -- Penanda "paket bawaan sudah pernah ditanam" per lembaga. Tanpa ini, seed
    -- yang dijalankan setiap boot akan MENGHIDUPKAN KEMBALI program yang sengaja
    -- dihapus admin — penghapusan jadi tidak pernah permanen.
    CREATE TABLE IF NOT EXISTS program_belajar_seed (
      tenant_id TEXT PRIMARY KEY,
      seeded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Peserta (enrollment) siswa -> program/level, dengan kuota pertemuan.
    -- kuota_pertemuan 0 = tanpa batas. terpakai bertambah tiap absensi hadir.
    CREATE TABLE IF NOT EXISTS program_peserta (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      siswa_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      level_id TEXT,
      kuota_pertemuan INTEGER NOT NULL DEFAULT 0,
      terpakai INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'aktif',
      tanggal_mulai TEXT,
      tanggal_selesai TEXT,
      nomor_sertifikat TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_program_peserta_tenant ON program_peserta(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_program_peserta_siswa ON program_peserta(siswa_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_program_peserta_unik ON program_peserta(tenant_id, siswa_id, program_id);

    -- Absensi pertemuan nonformal. Status 'hadir' memotong kuota peserta.
    CREATE TABLE IF NOT EXISTS program_absensi (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      peserta_id TEXT NOT NULL,
      tanggal TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'hadir',
      catatan TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_program_absensi_peserta ON program_absensi(peserta_id);
    CREATE INDEX IF NOT EXISTS idx_program_absensi_tenant ON program_absensi(tenant_id);
  `)
}

// ---------------------------------------------------------------------------
// Paket bawaan untuk lembaga nonformal (kursus/bimbel/sanggar).
// Idempoten: program yang namanya sudah ada TIDAK ditimpa, supaya perubahan
// yang dilakukan admin lembaga tidak pernah hilang saat server restart.
// ---------------------------------------------------------------------------
const PROGRAM_BAWAAN = [
  {
    nama: 'Bahasa Inggris',
    kategori: 'Bahasa',
    deskripsi: 'Kelas bahasa Inggris percakapan dan tata bahasa bertahap.',
    durasi_pertemuan: 90,
    levels: [
      { nama: 'Basic', grade: 'Grade 1', deskripsi: 'Alfabet, angka, sapaan, dan kalimat sederhana.' },
      { nama: 'Elementary', grade: 'Grade 2', deskripsi: 'Tenses dasar dan percakapan harian.' },
      { nama: 'Intermediate', grade: 'Grade 3', deskripsi: 'Percakapan lancar, membaca, dan menulis paragraf.' },
      { nama: 'Advanced', grade: 'Grade 4', deskripsi: 'Diskusi, presentasi, dan penulisan esai.' },
    ],
  },
  {
    nama: 'Komputer & Desain',
    kategori: 'Teknologi',
    deskripsi: 'Literasi komputer, aplikasi perkantoran, dan desain grafis dasar.',
    durasi_pertemuan: 120,
    levels: [
      { nama: 'Dasar Komputer', grade: 'Level 1', deskripsi: 'Pengenalan perangkat, file, dan internet sehat.' },
      { nama: 'Office', grade: 'Level 2', deskripsi: 'Word, Excel, dan PowerPoint untuk tugas sehari-hari.' },
      { nama: 'Desain Grafis', grade: 'Level 3', deskripsi: 'Dasar desain, tipografi, dan layout.' },
    ],
  },
  {
    nama: 'Menjahit & Tata Busana',
    kategori: 'Keterampilan',
    deskripsi: 'Keterampilan menjahit dari pola dasar sampai penyelesaian busana.',
    durasi_pertemuan: 150,
    levels: [
      { nama: 'Pola Dasar', grade: 'Tingkat 1', deskripsi: 'Mengukur badan dan membuat pola dasar.' },
      { nama: 'Menjahit Dasar', grade: 'Tingkat 2', deskripsi: 'Teknik jahit, kampuh, dan penyelesaian tepi.' },
      { nama: 'Busana Siap Pakai', grade: 'Tingkat 3', deskripsi: 'Menyelesaikan busana utuh siap pakai.' },
    ],
  },
  {
    nama: 'Bimbingan Belajar',
    kategori: 'Akademik',
    deskripsi: 'Pendampingan belajar mata pelajaran sekolah.',
    durasi_pertemuan: 90,
    levels: [
      { nama: 'Calistung', grade: 'Tingkat Awal', deskripsi: 'Membaca, menulis, dan berhitung dasar.' },
      { nama: 'Persiapan Ujian', grade: 'Tingkat Menengah', deskripsi: 'Pemantapan materi dan latihan soal.' },
    ],
  },
]

function seedProgramBawaan(db, tenantId, makeId = () => crypto.randomUUID()) {
  // Sekali saja per lembaga. Kalau seed dijalankan setiap boot, program yang
  // sengaja dihapus admin akan hidup kembali dan penghapusan tak pernah permanen.
  const sudah = db.prepare('SELECT tenant_id FROM program_belajar_seed WHERE tenant_id=?').get(tenantId)
  if (sudah) return
  const ada = new Set(
    db.prepare('SELECT nama FROM program_belajar WHERE tenant_id=?').all(tenantId).map(r => String(r.nama).toLowerCase())
  )
  const insProgram = db.prepare(`INSERT INTO program_belajar
    (id, tenant_id, nama, deskripsi, kategori, durasi_pertemuan, aktif, urutan) VALUES (?,?,?,?,?,?,1,?)`)
  const insLevel = db.prepare(`INSERT INTO program_level
    (id, tenant_id, program_id, nama, grade, deskripsi, urutan) VALUES (?,?,?,?,?,?,?)`)
  const jalankan = db.transaction(() => {
    PROGRAM_BAWAAN.forEach((p, idx) => {
      if (ada.has(p.nama.toLowerCase())) return
      const pid = makeId()
      insProgram.run(pid, tenantId, p.nama, p.deskripsi, p.kategori, p.durasi_pertemuan, idx + 1)
      p.levels.forEach((lv, li) => insLevel.run(makeId(), tenantId, pid, lv.nama, lv.grade, lv.deskripsi, li + 1))
    })
    db.prepare('INSERT OR REPLACE INTO program_belajar_seed (tenant_id) VALUES (?)').run(tenantId)
  })
  jalankan()
}

// ---------------------------------------------------------------------------
// Helper murni (bisa diuji tanpa HTTP)
// ---------------------------------------------------------------------------

function normalizeProgramInput(body = {}) {
  const nama = String(body.nama || '').trim()
  if (!nama) throw new Error('Nama program wajib diisi')
  if (nama.length > 80) throw new Error('Nama program maksimal 80 karakter')
  const durasi = body.durasi_pertemuan === undefined || body.durasi_pertemuan === ''
    ? 0 : Math.max(0, Math.round(Number(body.durasi_pertemuan) || 0))
  return {
    nama,
    deskripsi: String(body.deskripsi || '').trim().slice(0, 500),
    kategori: String(body.kategori || '').trim().slice(0, 60),
    durasi_pertemuan: durasi,
    aktif: body.aktif === undefined ? 1 : (body.aktif ? 1 : 0),
    urutan: Number.isFinite(Number(body.urutan)) ? Math.round(Number(body.urutan)) : 0,
  }
}

function normalizeLevelInput(body = {}) {
  const nama = String(body.nama || '').trim()
  if (!nama) throw new Error('Nama level/grade wajib diisi')
  if (nama.length > 80) throw new Error('Nama level maksimal 80 karakter')
  return {
    nama,
    grade: String(body.grade || '').trim().slice(0, 40),
    deskripsi: String(body.deskripsi || '').trim().slice(0, 500),
    urutan: Number.isFinite(Number(body.urutan)) ? Math.round(Number(body.urutan)) : 0,
  }
}

/** Susun daftar program beserta levelnya, terurut. */
function daftarProgram(db, tenantId) {
  const programs = db.prepare('SELECT * FROM program_belajar WHERE tenant_id=? ORDER BY urutan, nama').all(tenantId)
  const levelOf = db.prepare('SELECT * FROM program_level WHERE tenant_id=? AND program_id=? ORDER BY urutan, nama')
  return programs.map(p => ({ ...p, aktif: p.aktif ? 1 : 0, levels: levelOf.all(tenantId, p.id) }))
}

module.exports = {
  setupProgramBelajarTables,
  seedProgramBawaan,
  normalizeProgramInput,
  normalizeLevelInput,
  daftarProgram,
  PROGRAM_BAWAAN,
}
