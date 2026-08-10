// Seed data demo untuk tenant demo-mrbuk7ok di jurnalku.db (live).
// Idempotent: aman dijalankan ulang. Hanya menyentuh tenant_id='demo-mrbuk7ok'.
const Database = require('/www/wwwroot/jurnal.cc.cd/node_modules/better-sqlite3')
const crypto = require('crypto')
const db = new Database('/www/wwwroot/jurnal.cc.cd/server/jurnalku.db')
const T = 'demo-mrbuk7ok'
const uid = () => crypto.randomUUID()

const rombels = db.prepare("SELECT * FROM rombel WHERE tenant_id=?").all(T)
const gtks = db.prepare("SELECT * FROM gtk WHERE tenant_id=?").all(T)
const mapels = db.prepare("SELECT * FROM mapel WHERE tenant_id=?").all(T)
const ta = db.prepare("SELECT * FROM tahun_ajaran WHERE tenant_id=? AND aktif=1").get(T)
const rombelI_A = rombels.find(r => r.nama === 'I-A')
const rombelI_B = rombels.find(r => r.nama === 'I-B')
const rombelII_A = rombels.find(r => r.nama === 'II-A')

let log = []

// 1) Kode guru A,B,C
const kode = ['A','B','C']
gtks.forEach((g,i) => {
  db.prepare("UPDATE gtk SET kode_guru=? WHERE id=? AND tenant_id=?").run(kode[i]||'', g.id, T)
})
log.push('kode_guru set: ' + gtks.map((g,i)=>g.nama+'='+(kode[i]||'')).join(', '))

// 2) Wali kelas: pastikan tiap rombel punya wali
const setWali = db.prepare("UPDATE rombel SET wali_kelas_id=? WHERE id=? AND tenant_id=? AND (wali_kelas_id IS NULL OR wali_kelas_id='')")
setWali.run(gtks[0].id, rombelI_A.id, T)
setWali.run(gtks[1].id, rombelI_B.id, T)
setWali.run(gtks[2].id, rombelII_A.id, T)
log.push('wali kelas assigned')

// 3) Tambah siswa jadi ~7 per rombel (idempotent by nis)
const namaL = ['Abdullah','Umar','Zaid','Yusuf','Hamzah','Bilal','Salman']
const namaP = ['Maryam','Hafsa','Ruqayyah','Sumayyah','Asma','Zainab','Halimah']
const existNis = new Set(db.prepare("SELECT nis FROM siswa WHERE tenant_id=?").all(T).map(s=>s.nis))
let nisCounter = 1006
const insSiswa = db.prepare("INSERT INTO siswa (id,nis,nisn,nama,jenis_kelamin,tempat_lahir,tanggal_lahir,alamat,no_hp,nama_ortu,rombel_id,status,tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
function fillRombel(rb, targetTotal) {
  const cur = db.prepare("SELECT COUNT(*) c FROM siswa WHERE tenant_id=? AND rombel_id=?").get(T, rb.id).c
  let added = 0
  for (let i = cur; i < targetTotal; i++) {
    const isL = i % 2 === 0
    const nm = (isL ? namaL : namaP)[i % 7] + ' ' + rb.nama.replace('-','')
    let nis = 'NIS' + (nisCounter++)
    while (existNis.has(nis)) nis = 'NIS' + (nisCounter++)
    existNis.add(nis)
    insSiswa.run(uid(), nis, '00'+nis.slice(3), nm, isL?'L':'P', 'Jakarta', '2018-0'+((i%9)+1)+'-15', 'Jl. Demo No.'+(i+1), '08123456'+(1000+i), 'Ortu '+nm, rb.id, 'aktif', T)
    added++
  }
  return added
}
let addedTotal = 0
addedTotal += fillRombel(rombelI_A, 7)
addedTotal += fillRombel(rombelI_B, 7)
addedTotal += fillRombel(rombelII_A, 7)
log.push('siswa ditambah: ' + addedTotal)

// 4) Pengajar (penugasan guru x mapel x rombel) - idempotent
const insPengajar = db.prepare("INSERT INTO pengajar (id,gtk_id,mapel_id,rombel_id,jam_per_minggu,tenant_id) VALUES (?,?,?,?,?,?)")
const existPeng = new Set(db.prepare("SELECT gtk_id||'|'||mapel_id||'|'||rombel_id k FROM pengajar WHERE tenant_id=?").all(T).map(x=>x.k))
let pengAdded = 0
// tiap rombel: 4 mapel dibagi ke 3 guru (rotasi)
rombels.forEach(rb => {
  mapels.forEach((mp, mi) => {
    const g = gtks[mi % gtks.length]
    const k = g.id+'|'+mp.id+'|'+rb.id
    if (!existPeng.has(k)) {
      insPengajar.run(uid(), g.id, mp.id, rb.id, mp.jam_per_minggu||2, T)
      existPeng.add(k); pengAdded++
    }
  })
})
log.push('pengajar ditambah: ' + pengAdded)

console.log(JSON.stringify({log, counts:{rombel:rombels.length,gtk:gtks.length,mapel:mapels.length}}, null, 2))
db.close()
