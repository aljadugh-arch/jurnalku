/**
 * Perawatan tabel `notif_settings` — satu lembaga, satu baris.
 *
 * Kenapa perlu: dulu baris dibuat dengan id `main_<uuid>` (migrasi lama),
 * sementara kode berikutnya memakai `main_<tenantId>`. Karena PRIMARY KEY-nya
 * `id`, `INSERT OR IGNORE` tidak mengenali baris lama sebagai "sudah ada" dan
 * MENAMBAH baris baru setiap kali admin menyimpan. Akibatnya satu lembaga bisa
 * punya beberapa baris dan `SELECT * ... WHERE tenant_id=?` (tanpa ORDER BY)
 * bisa mengembalikan baris basi — setelan yang baru disimpan tampak "tersimpan"
 * tetapi tidak pernah terbaca klien (mis. adzan tetap senyap).
 *
 * Tiga langkah, dalam urutan ini:
 *   1. gabung duplikat  — nilai dari baris terbaru menang; kolom kosong diisi
 *      dari baris lama supaya tidak ada setelan yang hilang
 *   2. pasang indeks unik pada tenant_id — mencegah terulang
 *   3. pastikan setiap lembaga punya baris — tanpa baris, PUT tidak menyimpan
 *      apa pun dan GET mengembalikan {} sehingga fitur mati tanpa jejak
 *
 * URUTAN 2↔3 PENTING dan tidak boleh ditukar: sebuah lembaga yang barisnya
 * masih ber-id lama TIDAK boleh mendapat baris kedua. Kalau penyisipan
 * dijalankan lebih dulu, indeks unik akan gagal dibuat (duplikat sudah ada) dan
 * kegagalannya tertelan oleh penangan galat — persis kondisi yang merusak.
 */

/** Kolom yang digabung saat duplikat dilebur (semua kolom kecuali kunci). */
function kolomNilai (db) {
  return db.prepare('PRAGMA table_info(notif_settings)').all()
    .map(c => c.name)
    .filter(n => n !== 'id' && n !== 'tenant_id')
}

function rapikanNotifSettings (db) {
  const hasil = { digabung: 0, dibuat: 0, indeks: false, dilewati: null }

  // Tabel/kolom bisa belum ada pada basis data yang sangat tua — jangan gagalkan boot.
  const kolomAda = db.prepare('PRAGMA table_info(notif_settings)').all().map(c => c.name)
  if (!kolomAda.includes('tenant_id')) { hasil.dilewati = 'kolom tenant_id belum ada'; return hasil }

  const kolom = kolomNilai(db)

  // (1) Gabung duplikat per lembaga.
  const ganda = db.prepare(
    'SELECT tenant_id FROM notif_settings WHERE tenant_id IS NOT NULL GROUP BY tenant_id HAVING COUNT(*) > 1'
  ).all()

  db.transaction(() => {
    for (const { tenant_id } of ganda) {
      const baris = db.prepare('SELECT rowid, * FROM notif_settings WHERE tenant_id=? ORDER BY rowid DESC').all(tenant_id)
      const utama = { ...baris[0] }              // baris terbaru jadi acuan
      for (const lama of baris.slice(1)) {        // isi kolom yang masih kosong
        for (const k of kolom) {
          const kini = utama[k]
          if ((kini === null || kini === undefined || kini === '') &&
              lama[k] !== null && lama[k] !== undefined && lama[k] !== '') utama[k] = lama[k]
        }
      }
      if (kolom.length) {
        db.prepare(`UPDATE notif_settings SET ${kolom.map(k => `${k}=?`).join(', ')} WHERE rowid=?`)
          .run(...kolom.map(k => utama[k]), utama.rowid)
      }
      db.prepare('DELETE FROM notif_settings WHERE tenant_id=? AND rowid<>?').run(tenant_id, utama.rowid)
      hasil.digabung++
    }
  })()

  // (2) Kunci satu baris per lembaga — SEBELUM penyisipan di langkah (3).
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_settings_tenant ON notif_settings(tenant_id) WHERE tenant_id IS NOT NULL')
  hasil.indeks = true

  // (3) Lengkapi lembaga yang belum punya baris sama sekali.
  const sebelum = db.prepare('SELECT COUNT(*) c FROM notif_settings').get().c
  db.prepare("INSERT OR IGNORE INTO notif_settings (id, tenant_id) SELECT 'main_'||id, id FROM tenants").run()
  hasil.dibuat = db.prepare('SELECT COUNT(*) c FROM notif_settings').get().c - sebelum

  return hasil
}

module.exports = { rapikanNotifSettings }
