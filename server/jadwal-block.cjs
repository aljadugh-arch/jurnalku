'use strict'
// Blok jam mengajar: satu mapel di rombel yang sama yang berurutan tanpa jeda.
//
// Sekolah menyimpan tiap jam pelajaran sebagai baris `jadwal` sendiri, sehingga
// mapel dengan JTM 2 tampil sebagai dua baris (mis. 07:30-08:10 dan 08:10-08:50).
// Guru tidak boleh dipaksa memindai QR, mengisi jurnal, dan mengabsen dua kali
// untuk satu sesi mengajar yang sama.

function menit(hm) {
  const [h, m] = String(hm || '00:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function samaBaris(a, b) {
  return a.tenant_id === b.tenant_id && a.gtk_id === b.gtk_id && a.mapel_id === b.mapel_id &&
    String(a.rombel_id) === String(b.rombel_id) && String(a.hari).toLowerCase() === String(b.hari).toLowerCase()
}

// Perluas satu baris jadwal menjadi seluruh rantai jam yang bersambung.
function blokDariJadwal(db, jadwal) {
  if (!jadwal) return []
  const kandidat = db.prepare(`SELECT * FROM jadwal
    WHERE tenant_id=? AND gtk_id=? AND mapel_id=? AND rombel_id=? AND lower(hari)=?
      AND COALESCE(jenis_kegiatan,'mapel')='mapel'
    ORDER BY jam_mulai`).all(jadwal.tenant_id, jadwal.gtk_id, jadwal.mapel_id, jadwal.rombel_id, String(jadwal.hari).toLowerCase())
    .filter(r => samaBaris(r, jadwal))
  const urut = kandidat.sort((a, b) => menit(a.jam_mulai) - menit(b.jam_mulai))
  const posisi = urut.findIndex(r => r.id === jadwal.id)
  if (posisi < 0) return [jadwal]
  let awal = posisi
  let akhir = posisi
  // Sambung ke belakang: jam_mulai baris sebelumnya harus sama dengan jam_selesai-nya.
  while (awal > 0 && String(urut[awal - 1].jam_selesai) === String(urut[awal].jam_mulai)) awal--
  while (akhir < urut.length - 1 && String(urut[akhir].jam_selesai) === String(urut[akhir + 1].jam_mulai)) akhir++
  return urut.slice(awal, akhir + 1)
}

function blokDariId(db, tenantId, jadwalId) {
  const jadwal = db.prepare('SELECT * FROM jadwal WHERE id=? AND tenant_id=?').get(jadwalId, tenantId)
  if (!jadwal) return { jadwal: null, blok: [] }
  return { jadwal, blok: blokDariJadwal(db, jadwal) }
}

module.exports = { blokDariJadwal, blokDariId, menit }
