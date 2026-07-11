// Seed part 2: jadwal, jurnal_mengajar, absensi_siswa, penilaian_harian, rapor, kalender_kbm
// Idempotent-ish: cek count sebelum insert per tabel (skip kalau sudah ada data > 0).
const Database = require('/www/wwwroot/jurnal.cc.cd/node_modules/better-sqlite3')
const crypto = require('crypto')
const db = new Database('/www/wwwroot/jurnal.cc.cd/server/jurnalku.db')
const T = 'demo-mrbuk7ok'
const uid = () => crypto.randomUUID()
const log = []

const rombels = db.prepare("SELECT * FROM rombel WHERE tenant_id=?").all(T)
const gtks = db.prepare("SELECT * FROM gtk WHERE tenant_id=?").all(T)
const mapels = db.prepare("SELECT * FROM mapel WHERE tenant_id=?").all(T)
const pengajar = db.prepare("SELECT * FROM pengajar WHERE tenant_id=?").all(T)
const siswa = db.prepare("SELECT * FROM siswa WHERE tenant_id=?").all(T)
const ta = db.prepare("SELECT * FROM tahun_ajaran WHERE tenant_id=? AND aktif=1").get(T)

const hari = ['senin','selasa','rabu','kamis','jumat']
const jamSlots = [
  {ke:1, mulai:'07:00', selesai:'07:35'},
  {ke:2, mulai:'07:35', selesai:'08:10'},
  {ke:3, mulai:'08:10', selesai:'08:45'},
  {ke:4, mulai:'08:45', selesai:'09:20'},
]

// 1) JADWAL: tiap rombel, tiap hari, isi 4 slot dari daftar pengajar rombel itu (round robin)
const cJadwal = db.prepare("SELECT COUNT(*) c FROM jadwal WHERE tenant_id=?").get(T).c
const insJadwal = db.prepare("INSERT INTO jadwal (id,mapel_id,rombel_id,gtk_id,hari,jam_mulai,jam_selesai,ruangan,tenant_id) VALUES (?,?,?,?,?,?,?,?,?)")
let jadwalAdded = 0
const jadwalRows = []
if (cJadwal === 0) {
  rombels.forEach(rb => {
    const peng = pengajar.filter(p => p.rombel_id === rb.id)
    hari.forEach(h => {
      jamSlots.forEach((slot, si) => {
        const p = peng[si % peng.length]
        if (!p) return
        const id = uid()
        insJadwal.run(id, p.mapel_id, rb.id, p.gtk_id, h, slot.mulai, slot.selesai, 'Ruang ' + rb.nama, T)
        jadwalRows.push({ id, mapel_id: p.mapel_id, rombel_id: rb.id, gtk_id: p.gtk_id, hari: h, jam_ke: slot.ke })
        jadwalAdded++
      })
    })
  })
}
log.push('jadwal ditambah: ' + jadwalAdded)

// tanggal 7 hari kerja terakhir (mundur dari hari ini, skip weekend)
function lastWorkdays(n) {
  const days = []
  let d = new Date()
  while (days.length < n) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) days.push(new Date(d))
    d.setDate(d.getDate() - 1)
  }
  return days.reverse()
}
const tanggalList = lastWorkdays(5).map(d => d.toISOString().slice(0, 10))

// 2) JURNAL_MENGAJAR: per rombel per mapel per tanggal (pakai jadwal yg ada)
const cJurnal = db.prepare("SELECT COUNT(*) c FROM jurnal_mengajar WHERE tenant_id=?").get(T).c
const insJurnal = db.prepare("INSERT INTO jurnal_mengajar (id,guru_id,mapel_id,rombel_id,tanggal,jam_ke,materi,kegiatan,catatan,status,tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
let jurnalAdded = 0
const materiSample = ['Pengenalan konsep dasar', 'Latihan soal bersama', 'Diskusi kelompok', 'Evaluasi harian', 'Praktik dan penerapan']
if (cJurnal === 0) {
  const jadwalAll = jadwalRows.length ? jadwalRows : db.prepare("SELECT * FROM jadwal WHERE tenant_id=?").all(T)
  tanggalList.forEach((tgl, di) => {
    const h = hari[di % hari.length]
    jadwalAll.filter(j => j.hari === h).forEach(j => {
      insJurnal.run(uid(), j.gtk_id, j.mapel_id, j.rombel_id, tgl, j.jam_ke, materiSample[di % materiSample.length], 'Tatap muka', '', 'selesai', T)
      jurnalAdded++
    })
  })
}
log.push('jurnal_mengajar ditambah: ' + jurnalAdded)

// 3) ABSENSI_SISWA: tiap siswa, tiap tanggal, status hadir (mayoritas) / izin/sakit sesekali
const cAbsen = db.prepare("SELECT COUNT(*) c FROM absensi_siswa WHERE tenant_id=?").get(T).c
const insAbsen = db.prepare("INSERT INTO absensi_siswa (id,siswa_id,rombel_id,tanggal,jam_ke,status,metode,keterangan,tenant_id) VALUES (?,?,?,?,?,?,?,?,?)")
let absenAdded = 0
if (cAbsen === 0) {
  siswa.forEach((s, si) => {
    tanggalList.forEach((tgl, di) => {
      let status = 'hadir'
      if ((si + di) % 11 === 0) status = 'sakit'
      else if ((si + di) % 13 === 0) status = 'izin'
      insAbsen.run(uid(), s.id, s.rombel_id, tgl, 1, status, 'manual', '', T)
      absenAdded++
    })
  })
}
log.push('absensi_siswa ditambah: ' + absenAdded)

// 4) PENILAIAN_HARIAN: tiap siswa x mapel x 1 tanggal terbaru
const cNilaiH = db.prepare("SELECT COUNT(*) c FROM penilaian_harian WHERE tenant_id=?").get(T).c
const insNilaiH = db.prepare("INSERT INTO penilaian_harian (id,siswa_id,mapel_id,tanggal,sikap,keaktifan,pengetahuan,catatan,tenant_id) VALUES (?,?,?,?,?,?,?,?,?)")
let nilaiHAdded = 0
if (cNilaiH === 0) {
  const tglTerbaru = tanggalList[tanggalList.length - 1]
  siswa.forEach((s, si) => {
    const rb = rombels.find(r => r.id === s.rombel_id)
    const peng = pengajar.filter(p => p.rombel_id === rb.id)
    peng.forEach((p, pi) => {
      const base = 75 + ((si + pi) % 20)
      insNilaiH.run(uid(), s.id, p.mapel_id, tglTerbaru, Math.min(100, base + 5), Math.min(100, base), Math.min(100, base + 3), '', T)
      nilaiHAdded++
    })
  })
}
log.push('penilaian_harian ditambah: ' + nilaiHAdded)

// 5) RAPOR: tengah semester, tiap siswa x mapel
const cRapor = db.prepare("SELECT COUNT(*) c FROM rapor WHERE tenant_id=?").get(T).c
const insRapor = db.prepare("INSERT INTO rapor (id,siswa_id,mapel_id,tahun_ajaran,semester,jenis,nilai_pengetahuan,nilai_keterampilan,nilai_sikap,nilai_akhir,predikat,kkm,tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
let raporAdded = 0
if (cRapor === 0 && ta) {
  siswa.forEach((s, si) => {
    const rb = rombels.find(r => r.id === s.rombel_id)
    const peng = pengajar.filter(p => p.rombel_id === rb.id)
    peng.forEach((p, pi) => {
      const base = 78 + ((si + pi) % 15)
      const predikat = base >= 90 ? 'A' : base >= 80 ? 'B' : 'C'
      insRapor.run(uid(), s.id, p.mapel_id, ta.nama, ta.semester, 'tengah', base, base + 2, 85, base + 1, predikat, 70, T)
      raporAdded++
    })
  })
}
log.push('rapor ditambah: ' + raporAdded)

// 6) KALENDER_KBM: beberapa event
const cKal = db.prepare("SELECT COUNT(*) c FROM kalender_kbm WHERE tenant_id=?").get(T).c
const insKal = db.prepare("INSERT INTO kalender_kbm (id,tanggal,judul,jenis,keterangan,warna,tenant_id) VALUES (?,?,?,?,?,?,?)")
let kalAdded = 0
if (cKal === 0) {
  const today = new Date()
  const fmt = (d) => d.toISOString().slice(0, 10)
  const ev = [
    [0, 'Hari ini - KBM Aktif', 'kbm_aktif', '', '#3b82f6'],
    [7, 'Ulangan Tengah Semester', 'ujian', 'UTS Ganjil 2025/2026', '#ef4444'],
    [14, 'Libur Semester', 'libur', '', '#f59e0b'],
  ]
  ev.forEach(([offset, judul, jenis, ket, warna]) => {
    const d = new Date(today); d.setDate(d.getDate() + offset)
    insKal.run(uid(), fmt(d), judul, jenis, ket, warna, T)
    kalAdded++
  })
}
log.push('kalender_kbm ditambah: ' + kalAdded)

console.log(JSON.stringify({ log }, null, 2))
db.close()
