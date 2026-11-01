'use strict'
// Seed data demo lengkap (idempotent) untuk tenant demo.
// Pakai: DB_PATH=/path/jurnalku.db node scripts/seed-demo-lengkap.cjs [--tenant=demo-kampus] [--dry-run]
// Aman diulang: semua INSERT OR IGNORE dengan id turunan (uuid deterministik).

const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const path = require('path')

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'server', 'jurnalku.db')
const ARGS = process.argv.slice(2)
const DRY = ARGS.includes('--dry-run')
const ONLY = (ARGS.find(a => a.startsWith('--tenant=')) || '').split('=')[1] || ''
const db = new Database(DB_PATH)

const uid = (...parts) => {
  const h = crypto.createHash('sha1').update(parts.join('|')).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}
const todayWib = () => new Date(Date.now() + 7 * 3600 * 1000)
const iso = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x }
const isWeekend = (d) => [0, 6].includes(d.getUTCDay())

function hasCol(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)
}
function insert(table, row) {
  const cols = Object.keys(row)
  const sql = `INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
  if (DRY) return
  db.prepare(sql).run(...cols.map(c => row[c]))
}
function insertR(table, row) {
  const cols = Object.keys(row)
  const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
  if (DRY) return
  db.prepare(sql).run(...cols.map(c => row[c]))
}
function ensureGtk(tenant, nama, jabatan, jk, nip) {
  const ada = db.prepare('SELECT id FROM gtk WHERE tenant_id=? AND lower(nama)=lower(?)').get(tenant, nama)
  if (ada) return ada.id
  const id = uid(tenant, 'gtk', nama)
  insert('gtk', { id, nip: nip || '', nama, jenis_kelamin: jk, jabatan, status_kepegawaian: 'Tetap', status: 'aktif', tenant_id: tenant })
  return id
}
function ensureUser(tenant, domain, role, nama, extra = {}) {
  const email = `demo-${role}@${domain}`
  const ada = db.prepare('SELECT id FROM users WHERE email=?').get(email)
  if (ada) {
    const sets = Object.keys(extra).filter(k => hasCol('users', k))
    if (sets.length && !DRY) db.prepare(`UPDATE users SET ${sets.map(k => `${k}=?`).join(',')} WHERE id=?`).run(...sets.map(k => extra[k]), ada.id)
    return ada.id
  }
  const id = uid(tenant, 'user', email)
  const row = { id, nama, email, password: bcrypt.hashSync(crypto.randomUUID(), 10), role, tenant_id: tenant, ...extra }
  for (const k of Object.keys(row)) if (!hasCol('users', k)) delete row[k]
  insert('users', row)
  return id
}
function ensureRombel(tenant, nama, tingkat, waliId) {
  const ada = db.prepare('SELECT id FROM rombel WHERE tenant_id=? AND nama=?').get(tenant, nama)
  if (ada) return ada.id
  const id = uid(tenant, 'rombel', nama)
  insert('rombel', { id, nama, tingkat, tahun_ajaran: '2026/2027', wali_kelas_id: waliId || null, kapasitas: 32, tenant_id: tenant })
  return id
}
function ensureMapel(tenant, nama, kode, kelompok = 'wajib') {
  const ada = db.prepare('SELECT id FROM mapel WHERE tenant_id=? AND lower(nama)=lower(?)').get(tenant, nama)
  if (ada) return ada.id
  const id = uid(tenant, 'mapel', nama)
  insert('mapel', { id, kode: kode, nama, kelompok, jam_per_minggu: 3, tenant_id: tenant })
  return id
}
function ensureSiswa(tenant, nis, nama, jk, rombelId, ortu) {
  const ada = db.prepare('SELECT id FROM siswa WHERE tenant_id=? AND nis=?').get(tenant, nis)
  if (ada) return ada.id
  const id = uid(tenant, 'siswa', nis)
  insert('siswa', {
    id, nis, nisn: nis, nama, jenis_kelamin: jk, rombel_id: rombelId, status: 'aktif',
    nama_ortu: ortu, nama_ayah: ortu, nama_ibu: ortu, no_hp: '0812' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'),
    alamat: 'Jl. Pendidikan No. 1, Bondowoso', tempat_lahir: 'Bondowoso', tanggal_lahir: '2008-05-12', tenant_id: tenant,
  })
  return id
}
function ensureJenisTagihan(tenant, nama, nominal) {
  const ada = db.prepare('SELECT id FROM jenis_tagihan WHERE tenant_id=? AND lower(nama)=lower(?)').get(tenant, nama)
  if (ada) return ada.id
  const id = uid(tenant, 'jenis-tagihan', nama)
  insert('jenis_tagihan', { id, nama, nominal, deskripsi: '', tipe: 'bulanan', aktif: 1, tenant_id: tenant })
  return id
}
function ensureAkun(tenant, nama, saldoAwal) {
  const ada = db.prepare('SELECT id FROM keuangan_akun WHERE tenant_id=? AND lower(nama)=lower(?)').get(tenant, nama)
  if (ada) return ada.id
  const id = uid(tenant, 'akun', nama)
  insert('keuangan_akun', { id, nama, saldo_awal: saldoAwal, tenant_id: tenant })
  return id
}
function ensureKategori(tenant, nama, tipe) {
  const ada = db.prepare('SELECT id FROM keuangan_kategori WHERE tenant_id=? AND lower(nama)=lower(?)').get(tenant, nama)
  if (ada) return ada.id
  const id = uid(tenant, 'kategori', nama, tipe)
  insert('keuangan_kategori', { id, nama, tipe, tenant_id: tenant })
  return id
}

// ---------------------------------------------------------------- konfigurasi
const KAMPUS = {
  tenant: 'demo-kampus', domain: 'idjurnal.web.id', jenjang: 'PT', tipe: 'perguruan_tinggi',
  rombel: [['TI-1A', 'I'], ['TI-2A', 'II']],
  mapel: [['Algoritma dan Struktur Data', 'MK-01'], ['Basis Data', 'MK-02'], ['Pemrograman Web', 'MK-03'],
    ['Jaringan Komputer', 'MK-04'], ['Sistem Operasi', 'MK-05'], ['Matematika Diskrit', 'MK-06'], ['Kewirausahaan', 'MK-07']],
  gtk: [['Dr. Ahmad Surya, M.Kom', 'kepala', 'L'], ['Rina Wati, S.Kom', 'bendahara', 'P'],
    ['Budi Hartono, M.Kom', 'guru', 'L'], ['Siti Aminah, M.Kom', 'guru', 'P'],
    ['Agus Prakoso, S.Kom', 'guru', 'L'], ['Dedi Kurniawan, S.Kom', 'proktor', 'L']],
  siswa: [['Ahmad Fauzi', 'L'], ['Siti Nurhaliza', 'P'], ['Budi Santoso', 'L'], ['Dewi Lestari', 'P'],
    ['Rizki Pratama', 'L'], ['Nur Aisyah', 'P'], ['Fajar Nugroho', 'L'], ['Intan Permata', 'P'],
    ['Yoga Saputra', 'L'], ['Maya Anggraini', 'P'], ['Hendra Wijaya', 'L'], ['Lia Kartika', 'P']],
  spp: 750000, tahun: '2026/2027', semester: 'Ganjil',
}
const KEMENAG = {
  tenant: 'demo-kemenag', domain: 'jurnalmadrasah.web.id', jenjang: 'MTs', tipe: 'madrasah',
  rombel: [['VII-A', 'VII'], ['VIII-A', 'VIII']],
  mapel: [['Matematika', 'MTK'], ['Bahasa Indonesia', 'BIN'], ['Bahasa Inggris', 'BIG'],
    ['Ilmu Pengetahuan Alam', 'IPA'], ['Ilmu Pengetahuan Sosial', 'IPS'], ['Al-Qur\'an Hadis', 'QH']],
  gtk: [['Drs. H. Abdul Rahman', 'kepala', 'L'], ['Hj. Siti Maryam, S.Pd', 'bendahara', 'P'],
    ['Ahmad Fauzi, S.Pd', 'guru', 'L'], ['Nur Hidayah, S.Pd', 'guru', 'P'],
    ['Muhammad Ridwan, S.Pd.I', 'guru', 'L'], ['Zainal Abidin', 'proktor', 'L']],
  siswa: [['Muhammad Iqbal', 'L'], ['Fatimah Az-Zahra', 'P'], ['Ahmad Fadhil', 'L'], ['Khadijah Aulia', 'P'],
    ['Zaid bin Tsabit', 'L'], ['Aisyah Putri', 'P'], ['Umar Hakim', 'L'], ['Maryam Salma', 'P'],
    ['Ali Mustofa', 'L'], ['Zahra Nabila', 'P'], ['Hasan Basri', 'L'], ['Husna Kamila', 'P']],
  spp: 250000, tahun: '2026/2027', semester: 'Ganjil',
}
const UMUM = {
  tenant: 'demo-umum', domain: 'jurnalku.biz.id', jenjang: 'NF', tipe: 'kursus',
  rombel: [['Desain Grafis A', 'A'], ['Bahasa Inggris A', 'A']],
  mapel: [['Desain Grafis Dasar', 'DG-01'], ['Adobe Photoshop', 'DG-02'], ['English Conversation', 'ENG-01']],
  gtk: [['Rudi Hartanto', 'kepala', 'L'], ['Sari Puspita', 'bendahara', 'P'],
    ['Andi Setiawan', 'guru', 'L'], ['Maya Sari', 'guru', 'P'], ['Teguh Prasetyo', 'proktor', 'L']],
  siswa: [['Rani Oktaviani', 'P'], ['Dimas Aditya', 'L'], ['Putri Ayu', 'P'], ['Bayu Firmansyah', 'L'],
    ['Nadia Ramadhani', 'P'], ['Arif Hidayat', 'L'], ['Salsa Billa', 'P'], ['Yusuf Maulana', 'L']],
  spp: 350000, tahun: '2026/2027', semester: 'Ganjil',
}

function seed(cfg) {
  const { tenant, domain } = cfg
  console.log(`\n=== ${tenant} (${domain}) ===`)
  const now = todayWib()

  // 1. GTK + users per peran
  const gtkId = {}
  cfg.gtk.forEach(([nama, jabatan, jk], i) => {
    gtkId[nama] = ensureGtk(tenant, nama, jabatan, jk, `DEMO-${tenant}-${i + 1}`)
  })
  const kepala = cfg.gtk.find(g => g[1] === 'kepala')?.[0]
  const bendahara = cfg.gtk.find(g => g[1] === 'bendahara')?.[0]
  const guruList = cfg.gtk.filter(g => g[1] === 'guru').map(g => g[0])
  const proktorNama = cfg.gtk.find(g => g[1] === 'proktor')?.[0]

  ensureUser(tenant, domain, 'kepala', kepala, { gtk_id: gtkId[kepala] })
  ensureUser(tenant, domain, 'bendahara', bendahara, { gtk_id: gtkId[bendahara] })
  ensureUser(tenant, domain, 'guru', guruList[0], { gtk_id: gtkId[guruList[0]] })
  const proktorUser = ensureUser(tenant, domain, 'proktor', proktorNama, { gtk_id: gtkId[proktorNama] })

  // 2. Rombel
  const rombelIds = cfg.rombel.map(([nama, tingkat], i) => ensureRombel(tenant, nama, tingkat, gtkId[guruList[i % guruList.length]]))

  // 3. Mapel
  const mapelIds = cfg.mapel.map(([nama, kode]) => ensureMapel(tenant, nama, kode))

  // 4. Siswa (dibagi rata ke rombel)
  const siswaIds = []
  cfg.siswa.forEach(([nama, jk], i) => {
    const nis = `${tenant === 'demo-kampus' ? 'DEMOPT' : tenant === 'demo-kemenag' ? 'DEMOMT' : 'DEMONF'}${String(2026001 + i)}`
    const sid = ensureSiswa(tenant, nis, nama, jk, rombelIds[i % rombelIds.length], `Orang Tua ${nama.split(' ')[0]}`)
    siswaIds.push(sid)
  })
  const siswaUser = ensureUser(tenant, domain, 'siswa', cfg.siswa[0][0], { siswa_id: siswaIds[0], nis: `${tenant === 'demo-kampus' ? 'DEMOPT' : tenant === 'demo-kemenag' ? 'DEMOMT' : 'DEMONF'}2026001` })
  ensureUser(tenant, domain, 'wali_murid', `Wali ${cfg.siswa[0][0]}`, { siswa_id: siswaIds[0] })

  // 5. Jadwal: tiap mapel 1 slot, Senin-Jumat
  const hari = ['senin', 'selasa', 'rabu', 'kamis', 'jumat']
  const jam = [['07:30', '09:00'], ['09:15', '10:45'], ['11:00', '12:30'], ['13:00', '14:30'], ['14:45', '16:15']]
  const jadwalIds = []
  rombelIds.forEach((rid, ri) => {
    mapelIds.forEach((mid, mi) => {
      const id = uid(tenant, 'jadwal', rid, mid)
      const gid = gtkId[guruList[(mi + ri) % guruList.length]]
      insert('jadwal', {
        id, mapel_id: mid, rombel_id: rid, gtk_id: gid, hari: hari[(mi + ri) % hari.length],
        jam_mulai: jam[mi % jam.length][0], jam_selesai: jam[mi % jam.length][1], ruangan: `R-${ri + 1}0${mi + 1}`,
        jenis_kegiatan: 'mapel', tenant_id: tenant,
      })
      jadwalIds.push({ id, rid, mid, gid, hari: hari[(mi + ri) % hari.length] })
    })
  })

  // 6. Jurnal 10 hari kerja terakhir (2 per rombel per hari) + penilaian harian
  let dayCursor = new Date(now)
  const hariKerja = []
  while (hariKerja.length < 10) {
    if (!isWeekend(dayCursor)) hariKerja.push(new Date(dayCursor))
    dayCursor = addDays(dayCursor, -1)
  }
  hariKerja.reverse()
  hariKerja.forEach((d, di) => {
    const tgl = iso(d)
    rombelIds.forEach((rid, ri) => {
      const kelasJadwal = jadwalIds.filter(j => j.rid === rid).slice(0, 2)
      kelasJadwal.forEach((j, ji) => {
        const jid = uid(tenant, 'jurnal', rid, tgl, String(ji))
        insert('jurnal_mengajar', {
          id: jid, guru_id: j.gid, mapel_id: j.mid, rombel_id: rid, tanggal: tgl, jam_ke: ji + 1,
          materi: `Materi pertemuan ${di + 1}: ${cfg.mapel[mapelIds.indexOf(j.mid)][0]}`,
          kegiatan: ji === 0 ? 'Diskusi & latihan' : 'Praktik terbimbing',
          status: di % 7 === 6 ? 'draft' : 'submitted', tenant_id: tenant,
        })
        // penilaian harian untuk 4 siswa pertama di rombel itu
        const anggota = siswaIds.filter((_, idx) => idx % rombelIds.length === ri).slice(0, 4)
        anggota.forEach((sid, si) => {
          insert('penilaian_harian', {
            id: uid(tenant, 'nilai-harian', jid, sid), jurnal_id: jid, siswa_id: sid, mapel_id: j.mid,
            tanggal: tgl, sikap: 80 + ((si + di) % 15), keaktifan: 75 + ((si * 3 + di) % 20),
            pengetahuan: 70 + ((si * 5 + di * 2) % 25), catatan: '', tenant_id: tenant,
          })
        })
      })
    })
  })

  // 7. Rapor per siswa per mapel
  siswaIds.forEach((sid, si) => {
    mapelIds.forEach((mid, mi) => {
      const nilai = 72 + ((si * 3 + mi * 5) % 24)
      insert('rapor', {
        id: uid(tenant, 'rapor', sid, mid, cfg.tahun, cfg.semester), siswa_id: sid, mapel_id: mid,
        tahun_ajaran: cfg.tahun, semester: cfg.semester, jenis: 'akhir',
        nilai_pengetahuan: nilai, nilai_keterampilan: Math.min(100, nilai + 2), nilai_sikap: 82 + (si % 10),
        nilai_akhir: nilai, nilai_harian: nilai - 2, nilai_sts: nilai, nilai_sas: nilai,
        predikat: nilai >= 90 ? 'A' : nilai >= 80 ? 'B' : 'C', deskripsi: 'Menunjukkan penguasaan yang baik.',
        kkm: 70, tenant_id: tenant,
      })
    })
  })

  // 8. Keuangan: tagihan SPP 3 bulan (sebagian lunas) + tabungan
  const jtId = ensureJenisTagihan(tenant, 'SPP Bulanan', cfg.spp)
  const bulanNama = ['Juli', 'Agustus', 'September', 'Oktober', 'November']
  siswaIds.forEach((sid, si) => {
    for (let b = 0; b < 3; b++) {
      const lunas = (si + b) % 3 !== 0
      insert('tagihan', {
        id: uid(tenant, 'tagihan', sid, String(b)), siswa_id: sid, jenis_tagihan_id: jtId,
        bulan: bulanNama[b], tahun: '2026', nominal: cfg.spp,
        status: lunas ? 'lunas' : 'belum_bayar',
        tanggal_bayar: lunas ? iso(addDays(now, -60 + b * 30)) : null,
        metode_bayar: lunas ? 'transfer' : null, keterangan: '', tenant_id: tenant,
      })
    }
    // tabungan: setor lalu tarik
    const setor = 150000 + (si % 5) * 25000
    const tarik = 50000
    insertR('tabungan', { id: uid(tenant, 'tabungan', sid, 'setor'), siswa_id: sid, tanggal: iso(now), tipe: 'setor', nominal: setor, saldo_akhir: setor, keterangan: 'Setoran tabungan', tenant_id: tenant })
    insertR('tabungan', { id: uid(tenant, 'tabungan', sid, 'tarik'), siswa_id: sid, tanggal: iso(now), tipe: 'tarik', nominal: tarik, saldo_akhir: setor - tarik, keterangan: 'Penarikan tabungan', tenant_id: tenant })
  })

  // 9. Buku kas: akun, kategori, transaksi
  const akun = ensureAkun(tenant, 'Kas Utama', 5000000)
  const katSpp = ensureKategori(tenant, 'Penerimaan SPP', 'masuk')
  const katAtk = ensureKategori(tenant, 'Belanja ATK', 'keluar')
  const katGaji = ensureKategori(tenant, 'Honor Guru', 'keluar')
  const trx = [
    ['masuk', katSpp, 4500000, 'Penerimaan SPP', 0],
    ['masuk', katSpp, 3750000, 'Penerimaan SPP susulan', -6],
    ['keluar', katAtk, 650000, 'Pembelian ATK dan kertas', 0],
    ['keluar', katGaji, 2400000, 'Honor guru honorer', -1],
  ]
  trx.forEach(([tipe, kat, nominal, ket, delta], i) => {
    insertR('keuangan_transaksi', {
      id: uid(tenant, 'trx', String(i)), tanggal: iso(addDays(now, delta)), akun_id: akun, kategori_id: kat,
      tipe, nominal, keterangan: ket, tenant_id: tenant,
    })
  })

  // 10. RKAS: 3 program, 2 kegiatan masing-masing
  const programs = [
    ['P01', 'Peningkatan Mutu Pembelajaran'],
    ['P02', 'Sarana dan Prasarana'],
    ['P03', 'Kegiatan Kesiswaan'],
  ]
  const keg = [
    ['P01', 'K01', 'Pelatihan Guru', 'bos', 5000000],
    ['P01', 'K02', 'Pengadaan Buku Referensi', 'bos', 3500000],
    ['P02', 'K03', 'Perbaikan Ruang Kelas', 'bos', 12000000],
    ['P02', 'K04', 'Pengadaan Komputer', 'komite', 15000000],
    ['P03', 'K05', 'Peringatan Hari Besar', 'bos', 2500000],
    ['P03', 'K06', 'Lomba Antar Kelas', 'komite', 1800000],
  ]
  programs.forEach(([kode, nama], i) => {
    const pid = uid(tenant, 'rkas-program', kode)
    insert('rkas_program', { id: pid, kode, nama, keterangan: '', urutan: i, tenant_id: tenant })
    keg.filter(k => k[0] === kode).forEach(([_, kk, kn, sumber, pagu], j) => {
      insert('rkas_kegiatan', {
        id: uid(tenant, 'rkas-kegiatan', kk), program_id: pid, kode: kk, nama: kn,
        sumber_dana: sumber, tahun_ajaran: cfg.tahun, pagu, keterangan: '', urutan: j, tenant_id: tenant,
      })
    })
  })

  // 11. Ekskul + anggota
  const ekskulId = uid(tenant, 'ekskul', 'Pramuka')
  insert('ekskul', {
    id: ekskulId, nama: 'Pramuka', pembina_id: gtkId[guruList[0]], hari: 'sabtu',
    jam_mulai: '08:00', jam_selesai: '10:00', deskripsi: 'Kegiatan kepramukaan mingguan',
    tenant_id: tenant, jenis_kegiatan: 'pilihan',
  })
  siswaIds.slice(0, 6).forEach((sid, i) => {
    insert('ekskul_anggota', { id: uid(tenant, 'ekskul-anggota', ekskulId, sid), ekskul_id: ekskulId, siswa_id: sid, tenant_id: tenant })
  })

  // 12. Ujian + sesi + penugasan proktor
  const paketId = uid(tenant, 'paket-ujian', 'STS')
  insert('paket_ujian', {
    id: paketId, nama: `STS ${cfg.mapel[0][0]}`, mapel_id: mapelIds[0], jenis: 'sts', model: 'online',
    tingkat: cfg.rombel[0][1], tahun_ajaran: cfg.tahun, semester: cfg.semester, durasi_menit: 90,
    soal_ids: '[]', rombel_ids: JSON.stringify(rombelIds), status: 'aktif',
    mulai: iso(addDays(now, -3)), selesai: iso(addDays(now, 3)), tenant_id: tenant, created_by: '',
  })
  siswaIds.slice(0, 6).forEach((sid, i) => {
    insert('sesi_ujian', {
      id: uid(tenant, 'sesi-ujian', paketId, sid), paket_id: paketId, siswa_id: sid,
      mulai: iso(addDays(now, -1)), selesai: iso(addDays(now, -1)), status: 'selesai',
      skor_total: 70 + (i * 4) % 30, skor_max: 100, tenant_id: tenant,
    })
  })
  rombelIds.forEach((rid) => {
    insert('ujian_proktor_assignments', {
      id: uid(tenant, 'proktor', paketId, proktorUser, rid), tenant_id: tenant,
      paket_id: paketId, user_id: proktorUser, rombel_id: rid,
    })
  })

  // 13. Absensi siswa 5 hari kerja terakhir
  hariKerja.slice(-5).forEach((d) => {
    const tgl = iso(d)
    siswaIds.forEach((sid, si) => {
      const status = (si + d.getUTCDate()) % 11 === 0 ? 'sakit' : (si + d.getUTCDate()) % 17 === 0 ? 'izin' : 'hadir'
      insert('absensi_siswa', {
        id: uid(tenant, 'absensi', sid, tgl), siswa_id: sid,
        rombel_id: rombelIds[siswaIds.indexOf(sid) % rombelIds.length], tanggal: tgl, jam_ke: 1,
        status, metode: 'manual', tenant_id: tenant,
      })
    })
  })

  console.log(`  gtk=${cfg.gtk.length} rombel=${rombelIds.length} mapel=${mapelIds.length} siswa=${siswaIds.length} jadwal=${jadwalIds.length}`)
  console.log(`  jurnal=${hariKerja.length * rombelIds.length * 2} tagihan=${siswaIds.length * 3} rkas=${programs.length} program`)
}

const daftar = [KAMPUS, KEMENAG, UMUM].filter(c => !ONLY || c.tenant === ONLY)
if (!daftar.length) { console.error('Tenant tidak dikenal. Pilihan: demo-kampus, demo-kemenag, demo-umum'); process.exit(1) }
db.transaction(() => daftar.forEach(seed))()
if (DRY) console.log('\n(dry-run: tidak ada yang ditulis)')
else console.log('\nSelesai.')
