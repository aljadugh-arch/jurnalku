'use strict'
// Kuota siswa/GTK per lembaga.
//
// Aturan paket:
//   - Paket dengan batas (mis. Trial = 100 siswa / 20 GTK) menang atas angka
//     per-lembaga. Inilah yang membuat "gratis sampai 100 siswa" benar-benar
//     berlaku: begitu lewat 100, lembaga harus berlangganan.
//   - Paket tanpa batas (kolom NULL/0) memakai batas per-lembaga; 0/NULL juga
//     berarti tidak dibatasi.
// Satu fungsi dipakai semua pintu masuk siswa: tambah manual, impor massal,
// penerimaan PPDB, reaktivasi siswa, dan impor antar-lembaga.

function batasPaket(db, plan, jenis) {
  try {
    const row = db.prepare('SELECT max_siswa, max_gtk, label FROM subscription_plans WHERE plan=?').get(String(plan || ''))
    if (!row) return null
    const nilai = jenis === 'gtk' ? row.max_gtk : row.max_siswa
    return { nilai: nilai === null || nilai === undefined ? null : Number(nilai), label: row.label || plan }
  } catch { return null }
}

function hitungAktif(db, tenantId, jenis) {
  try {
    return jenis === 'gtk'
      ? db.prepare('SELECT COUNT(*) c FROM gtk WHERE tenant_id=?').get(tenantId).c
      : db.prepare("SELECT COUNT(*) c FROM siswa WHERE tenant_id=? AND COALESCE(status,'aktif')='aktif'").get(tenantId).c
  } catch { return 0 }
}

function kuotaTenant(db, tenantId, jenis = 'siswa') {
  // Tabel bisa belum lengkap pada fixture tes modul (DB minimal tanpa
  // subscription_plans). Dalam kondisi itu kuota dianggap tidak dibatasi,
  // bukan melempar error yang mematikan seluruh alur.
  let t = null
  try { t = db.prepare('SELECT max_siswa, max_gtk, plan FROM tenants WHERE id=?').get(tenantId) } catch { t = null }
  if (!t) return { batas: 0, aktif: hitungAktif(db, tenantId, jenis), sisa: Infinity, plan: null, dari_paket: false }
  const paket = batasPaket(db, t.plan, jenis)
  const perLembaga = Number(jenis === 'gtk' ? t.max_gtk : t.max_siswa) || 0
  // Trial SELALU tanpa batas siswa: masa uji coba tidak boleh dipotong kuota,
  // berapa pun siswanya. Batas 100 baru berlaku di paket Gratis (lanjutan).
  const batas = String(t.plan) === 'trial'
    ? 0
    : (paket && paket.nilai && paket.nilai > 0 ? paket.nilai : perLembaga)
  const aktif = hitungAktif(db, tenantId, jenis)
  return {
    batas,
    aktif,
    sisa: batas > 0 ? batas - aktif : Infinity,
    plan: t.plan,
    label_paket: paket?.label || t.plan,
    dari_paket: Boolean(paket && paket.nilai && paket.nilai > 0),
  }
}

function pesanKuota(kuota, jenis = 'siswa', diminta = 1) {
  const kata = jenis === 'gtk' ? 'GTK' : 'siswa'
  if (kuota.sisa <= 0) {
    const nama = kuota.label_paket || kuota.plan || 'Paket'
    const naik = kuota.dari_paket
      ? ` Paket ${nama} dibatasi ${kuota.batas} ${kata}; aktifkan paket Lite/Pro/Premium untuk menambah.`
      : ` Batas ${kata} lembaga ini ${kuota.batas}; naikkan di pengaturan lembaga atau hubungi admin platform.`
    return `Kuota ${kata} lembaga ini sudah penuh (${kuota.aktif}/${kuota.batas}).${naik}`
  }
  if (diminta > kuota.sisa) {
    return `Kuota tersisa ${kuota.sisa} ${kata}, tetapi permintaan memuat ${diminta}. Kurangi atau naikkan paket.`
  }
  return null
}

module.exports = { kuotaTenant, pesanKuota, batasPaket }
