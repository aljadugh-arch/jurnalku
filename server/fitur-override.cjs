'use strict'

// Rapikan override fitur per-tenant agar TIDAK melampaui paketnya.
//
// Akar keluhan "lembaga paket lite tapi ada fitur pro/premium":
// kolom `tenants.features_json` menyimpan pilihan fitur per lembaga. Nilai itu
// bisa tertinggal dari paket lama (mis. lembaga dulu premium lalu turun ke lite,
// atau paketnya diubah saat fiturnya masih longgar). Server memang TIDAK
// mengeksekusi fitur di luar paket (`allowed.has(key) && choices[key] !== false`),
// tapi baris yang menyesatkan ini membuat UI admin menampilkan centang fitur
// yang sebenarnya tidak aktif — dan sulit diaudit.
//
// Fungsi di sini MEMBERSIHKAN nilai override yang di luar paket (set false),
// tidak pernah menambah hak baru. Aman dijalankan berulang.

/** Fitur yang boleh true untuk sebuah paket, dari peta paket {plan: {fitur:[...]}}. */
function fiturPaket(petaPaket, plan) {
  const def = petaPaket?.[plan]
  if (!def) return null
  return new Set(Array.isArray(def) ? def : (def.fitur || []))
}

/**
 * Hitung override yang perlu dirapikan.
 * Mengembalikan { perlu: [{tenant_id, plan, lama, baru}], total }.
 */
function rencanaRapikanOverride(db, petaPaket) {
  const rows = db.prepare("SELECT id, slug, plan, features_json FROM tenants WHERE COALESCE(features_json,'') <> ''").all()
  const perlu = []
  for (const r of rows) {
    let isi
    try { isi = JSON.parse(r.features_json) } catch { continue }
    if (!isi || typeof isi !== 'object' || Array.isArray(isi)) continue
    const boleh = fiturPaket(petaPaket, r.plan)
    if (!boleh) continue
    const baru = {}
    let berubah = false
    for (const [k, v] of Object.entries(isi)) {
      // Fitur di luar paket dipaksa false; fitur di dalam paket dipertahankan.
      const nilai = boleh.has(k) ? (v !== false) : false
      baru[k] = nilai
      if (nilai !== v) berubah = true
    }
    if (berubah) perlu.push({ tenant_id: r.id, slug: r.slug, plan: r.plan, lama: isi, baru })
  }
  return { perlu, total: rows.length }
}

/** Terapkan pembersihan. `terapkan=false` = periksa saja. */
function rapikanOverride(db, petaPaket, { terapkan = false } = {}) {
  const { perlu, total } = rencanaRapikanOverride(db, petaPaket)
  if (terapkan && perlu.length) {
    const upd = db.prepare("UPDATE tenants SET features_json=? WHERE id=?")
    const jalan = db.transaction(() => { for (const p of perlu) upd.run(JSON.stringify(p.baru), p.tenant_id) })
    jalan()
  }
  return { diperiksa: total, dirapikan: perlu.length, terapkan, perlu }
}

module.exports = { rencanaRapikanOverride, rapikanOverride, fiturPaket }
