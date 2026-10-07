/**
 * Kontrak perawatan tabel `notif_settings`.
 *
 * Bug yang dijaga di sini nyata dan pernah lolos ke produksi: satu lembaga
 * punya dua baris `notif_settings` (id lama `main_<uuid>` + id baru
 * `main_<tenantId>`), sehingga setelan yang disimpan admin bisa tidak terbaca.
 * Gejala di lapangan: fitur adzan "tidak muncul" padahal setelannya menyala.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { rapikanNotifSettings } = require('../server/notif-settings.cjs')

/** Skema setia pada produksi: id adalah PRIMARY KEY, tenant_id hanya kolom biasa. */
function fixture (tenants = [], baris = []) {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, nama TEXT);
    CREATE TABLE notif_settings (
      id TEXT PRIMARY KEY DEFAULT 'main',
      tenant_id TEXT,
      notif_adzan INTEGER DEFAULT 0,
      adzan_suara INTEGER DEFAULT 0,
      adzan_suara_url TEXT DEFAULT '',
      template_adzan TEXT DEFAULT ''
    );
  `)
  for (const t of tenants) db.prepare('INSERT INTO tenants VALUES (?,?)').run(t, 'Lembaga ' + t)
  for (const b of baris) {
    db.prepare('INSERT INTO notif_settings (id, tenant_id, notif_adzan, adzan_suara, adzan_suara_url, template_adzan) VALUES (?,?,?,?,?,?)')
      .run(...b)
  }
  return db
}

const barisTenant = (db, t) => db.prepare('SELECT * FROM notif_settings WHERE tenant_id=?').all(t)

test('duplikat digabung: satu lembaga satu baris, nilai terbaru menang', () => {
  const db = fixture(['t1'], [
    ['main_8f2c-uid-lama', 't1', 1, 0, '', ''],       // baris lama (rowid kecil)
    ['main_t1', 't1', 0, 1, '', ''],                  // baris baru   (rowid besar)
  ])
  const r = rapikanNotifSettings(db)
  const sisa = barisTenant(db, 't1')
  assert.equal(sisa.length, 1, 'harus tersisa tepat satu baris')
  assert.equal(r.digabung, 1)
  // Baris terbaru menang untuk kolom yang keduanya terisi...
  assert.equal(sisa[0].notif_adzan, 0)
  assert.equal(sisa[0].adzan_suara, 1)
})

test('gabung duplikat: kolom kosong di baris baru diisi dari baris lama', () => {
  const db = fixture(['t1'], [
    ['main_uid-lama', 't1', 1, 1, '/adzan-ku.mp3', 'Assalamualaikum {waktu}'],  // lama, lengkap
    ['main_t1', 't1', 1, 1, '', ''],                                            // baru, dua kolom kosong
  ])
  rapikanNotifSettings(db)
  const sisa = barisTenant(db, 't1')
  assert.equal(sisa.length, 1)
  // Setelan yang hanya ada di baris lama TIDAK boleh hilang.
  assert.equal(sisa[0].adzan_suara_url, '/adzan-ku.mp3')
  assert.equal(sisa[0].template_adzan, 'Assalamualaikum {waktu}')
})

test('lembaga yang barisnya masih ber-id lama TIDAK mendapat baris kedua', () => {
  // Inilah cacat yang dijaga: bila penyisipan dijalankan sebelum indeks unik,
  // lembaga ini mendapat baris kedua dan pembuatan indeks gagal tanpa jejak.
  const db = fixture(['mimif'], [['main_228f8aa8-uid-lama', 'mimif', 1, 1, '', '']])
  const r = rapikanNotifSettings(db)
  const sisa = barisTenant(db, 'mimif')
  assert.equal(sisa.length, 1, 'tidak boleh ada baris kedua')
  assert.equal(r.dibuat, 0, 'tidak ada baris baru yang perlu dibuat')
  // Indeks unik harus benar-benar terpasang (bukti langkah 2 tidak tertelan galat).
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_notif_settings_tenant'").get()
  assert.ok(idx, 'indeks unik wajib ada')
})

test('lembaga tanpa baris sama sekali dibuatkan baris', () => {
  const db = fixture(['a', 'b'], [])          // dua lembaga, nol baris setelan
  const r = rapikanNotifSettings(db)
  assert.equal(r.dibuat, 2)
  assert.equal(barisTenant(db, 'a').length, 1)
  assert.equal(barisTenant(db, 'b').length, 1)
})

test('baris global (tenant_id NULL) tidak diganggu dan tidak dihitung sebagai lembaga', () => {
  const db = fixture(['t1'], [['main', null, 1, 0, '', '']])   // baris platform
  rapikanNotifSettings(db)
  const global = db.prepare('SELECT * FROM notif_settings WHERE tenant_id IS NULL').all()
  assert.equal(global.length, 1, 'baris global tetap ada')
  assert.equal(global[0].id, 'main')
  assert.equal(barisTenant(db, 't1').length, 1)
})

test('aman dijalankan berulang kali (idempoten)', () => {
  const db = fixture(['t1', 't2'], [
    ['main_uid', 't1', 1, 1, '', ''],
    ['main_t1', 't1', 1, 1, '', ''],
  ])
  rapikanNotifSettings(db)
  const setelahPertama = JSON.stringify(db.prepare('SELECT * FROM notif_settings ORDER BY id').all())
  const r2 = rapikanNotifSettings(db)
  const setelahKedua = JSON.stringify(db.prepare('SELECT * FROM notif_settings ORDER BY id').all())
  assert.equal(setelahKedua, setelahPertama, 'hasil kedua harus sama persis')
  assert.equal(r2.digabung, 0)
  assert.equal(r2.dibuat, 0)
})

test('PUT berturut-turut tidak menambah baris (gejala asli di produksi)', () => {
  // Menirukan dua kali simpan dari halaman Pengaturan.
  const db = fixture(['t1'], [])
  rapikanNotifSettings(db)
  const simpan = (adzan) => {
    db.prepare('INSERT OR IGNORE INTO notif_settings (id, tenant_id) VALUES (?,?)').run('main_t1', 't1')
    db.prepare('UPDATE notif_settings SET notif_adzan=? WHERE tenant_id=?').run(adzan, 't1')
  }
  simpan(1); simpan(1); simpan(1)
  assert.equal(barisTenant(db, 't1').length, 1, 'tiga kali simpan tetap satu baris')
  assert.equal(db.prepare('SELECT COUNT(*) c FROM notif_settings').get().c, 1)
})

test('tabel tanpa kolom tenant_id dilewati tanpa melempar galat', () => {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE notif_settings (id TEXT PRIMARY KEY, catatan TEXT)')
  const r = rapikanNotifSettings(db)
  assert.equal(r.dilewati, 'kolom tenant_id belum ada')
})
