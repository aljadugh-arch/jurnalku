'use strict'

// Perbaikan nilai rusak akibat bug lama input nilai harian.
//
// AKAR MASALAH (terbukti dari data produksi):
//   Versi lama GuruPenilaianHarianPage mengirim nilai dengan `parseInt(p.sikap)`.
//   Saat nilai diketik dengan pemisah desimal gaya Indonesia ("79,0") atau titik
//   ("90.9"), parseInt berhenti di karakter non-digit dan TIDAK menghapus titik —
//   tapi kombinasi sanitizer input + parseInt pernah menyimpan digit tanpa titik:
//       79.0  -> 790      (dikali 10)
//       90.9  -> 909
//       100.1 -> 1001
//   Pola ini adalah sidik jari yang jelas: nilai tersimpan = nilai asli x 10
//   dengan titik desimal dihapus. Nilai seperti itu lolos karena endpoint lama
//   TIDAK memvalidasi rentang 0-100 (sekarang sudah dibulatkan via clampNilai).
//
// Perbaikan aman: bagi 10 bila hasilnya kembali masuk akal (0-100).
//   - Hanya menyentuh baris di luar 0-100, jadi nilai yang sudah benar tak tersentuh.
//   - Tidak pernah menghasilkan nilai di luar 0-100.
//   - Idempoten: setelah dibagi 10, baris keluar dari filter dan tak disentuh lagi.

/** Nilai perbaikan dari satu nilai tersimpan, atau null bila tidak perlu diubah. */
function nilaiPerbaikan(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  if (n >= 0 && n <= 100) return null // sudah benar
  // Tanda tangan bug: nilai = asli x 10. Cek dulu apakah /10 masuk rentang.
  const dibagi = n / 10
  if (dibagi >= 0 && dibagi <= 100) {
    return Math.round(Math.min(100, Math.max(0, dibagi)))
  }
  // Nilai rusak lain (mis. 1500 = asli 150 yang mustahil): jepit ke 100.
  return Math.min(100, Math.max(0, Math.round(n)))
}

/** Ubah satu baris penilaian_harian, mengembalikan { lama, baru, berubah }. */
function perbaikiBaris(row) {
  const kolom = ['pengetahuan', 'keaktifan', 'sikap']
  const lama = Object.fromEntries(kolom.map(k => [k, Number(row[k]) || 0]))
  const baru = { ...lama }
  let berubah = false
  for (const k of kolom) {
    const fixed = nilaiPerbaikan(row[k])
    if (fixed !== null && fixed !== lama[k]) { baru[k] = fixed; berubah = true }
  }
  return { lama, baru, berubah }
}

/**
 * Perbaiki seluruh baris nilai harian yang di luar 0-100 untuk satu tenant
 * (atau semua tenant bila tenantId null). `terapkan=false` = mode periksa saja.
 */
function perbaikiNilaiHarian(db, { tenantId = null, terapkan = false } = {}) {
  const args = []
  let sql = `SELECT id, tenant_id, siswa_id, tanggal, pengetahuan, keaktifan, sikap FROM penilaian_harian
    WHERE (pengetahuan < 0 OR pengetahuan > 100 OR keaktifan < 0 OR keaktifan > 100 OR sikap < 0 OR sikap > 100)`
  if (tenantId) { sql += ' AND tenant_id=?'; args.push(tenantId) }
  sql += ' ORDER BY tenant_id, tanggal'
  const rows = db.prepare(sql).all(...args)

  const rencana = []
  for (const row of rows) {
    const hasil = perbaikiBaris(row)
    if (hasil.berubah) rencana.push({ id: row.id, tenant_id: row.tenant_id, tanggal: row.tanggal, ...hasil })
  }

  if (terapkan && rencana.length) {
    const upd = db.prepare('UPDATE penilaian_harian SET pengetahuan=?, keaktifan=?, sikap=? WHERE id=?')
    const jalankan = db.transaction(() => {
      for (const r of rencana) upd.run(r.baru.pengetahuan, r.baru.keaktifan, r.baru.sikap, r.id)
    })
    jalankan()
  }
  return { ditemukan: rows.length, diperbaiki: rencana.length, terapkan, rencana }
}

module.exports = { nilaiPerbaikan, perbaikiBaris, perbaikiNilaiHarian }
