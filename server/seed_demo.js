const db = require('better-sqlite3')('jurnalku.db');
const { v4: uuid } = require('uuid');

const tid = db.prepare("SELECT id FROM tenants WHERE slug = 'demo'").get().id;
console.log('Tenant ID:', tid);

// Settings
db.prepare("INSERT OR IGNORE INTO settings (id, nama_lembaga, jenjang, tenant_id) VALUES (?,?,?,?)")
  .run(uuid(), 'Demo Jurnalku', 'MI', tid);

// Tahun ajaran
db.prepare("INSERT OR IGNORE INTO tahun_ajaran (id, nama, semester, aktif, tenant_id) VALUES (?,?,?,?,?)")
  .run(uuid(), '2025/2026', 'Ganjil', 1, tid);

// GTK (3 guru)
const guruIds = [];
['Ahmad Fauzi', 'Siti Rahma', 'Budi Santoso'].forEach(nama => {
  const id = uuid(); guruIds.push(id);
  db.prepare("INSERT INTO gtk (id, nama, nip, jenis_kelamin, status, tenant_id) VALUES (?,?,?,?,?,?)")
    .run(id, nama, 'NIP' + Math.floor(Math.random()*999999), nama.includes('Siti') ? 'P' : 'L', 'aktif', tid);
});

// Mapel (4)
const mapelIds = [];
['Matematika', 'Bahasa Indonesia', 'IPA', 'PAI'].forEach(nama => {
  const id = uuid(); mapelIds.push(id);
  db.prepare("INSERT INTO mapel (id, nama, kode, kelompok, tenant_id) VALUES (?,?,?,?,?)")
    .run(id, nama, nama.substring(0,3).toUpperCase(), 'A', tid);
});

// Rombel (3)
const rombelIds = [];
['I-A', 'I-B', 'II-A'].forEach(nama => {
  const id = uuid(); rombelIds.push(id);
  const [tingkat, paralel] = nama.split('-');
  db.prepare("INSERT INTO rombel (id, nama, tingkat, paralel, tahun_ajaran, kapasitas, tenant_id) VALUES (?,?,?,?,?,?,?)")
    .run(id, nama, tingkat, paralel, '2025/2026', 36, tid);
});

// Siswa (6)
const siswaIds = [];
['Ahmad Rizki', 'Fatimah Zahra', 'Muhammad Iqbal', 'Aisyah Putri', 'Ali Hasan', 'Khadijah'].forEach((nama, i) => {
  const id = uuid(); siswaIds.push(id);
  db.prepare("INSERT INTO siswa (id, nama, nis, rombel_id, jenis_kelamin, status, tenant_id) VALUES (?,?,?,?,?,?,?)")
    .run(id, nama, 'NIS' + (1000+i), rombelIds[Math.floor(i/2)], i%2===0?'L':'P', 'aktif', tid);
});

// Jenis tagihan
const jtId = uuid();
db.prepare("INSERT INTO jenis_tagihan (id, nama, nominal, tenant_id) VALUES (?,?,?,?)")
  .run(jtId, 'SPP Juli 2025', 150000, tid);

// Tagihan (3 lunas, 3 belum)
siswaIds.forEach((sid, i) => {
  db.prepare("INSERT INTO tagihan (id, siswa_id, jenis_tagihan_id, bulan, tahun, nominal, status, tanggal_bayar, tenant_id) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(uuid(), sid, jtId, 'Juli', '2025', 150000, i<3?'lunas':'belum_bayar', i<3?'2025-07-01':null, tid);
});

console.log('Done: 3 GTK, 4 mapel, 3 rombel, 6 siswa, 6 tagihan');
db.close();
