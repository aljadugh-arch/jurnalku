'use strict'

/**
 * KKM (Kriteria Ketuntasan Minimal) per mapel + tingkat.
 *
 * Granularitas dua lapis pada tabel `kkm_mapel`:
 *   - tingkat '' = nilai UMUM untuk mapel itu (berlaku ke semua tingkat)
 *   - tingkat 'VII' (dst) = override khusus untuk tingkat tersebut
 *
 * Resolusi (paling spesifik menang):
 *   (mapel + tingkat spesifik) > (mapel + tingkat '') > fallback bawaan
 *
 * Murni dari `db` + argumen supaya bisa diuji runtime dengan DB in-memory.
 */

// Bawaan bila tidak ada baris kkm_mapel (Kurikulum Merdeka). K-13 sudah dihapus.
const KKM_DEFAULT = { merdeka: 70 }

/** Muat seluruh baris KKM satu tenant (kosong bila tabel belum ada). */
function loadKkm(db, tenantId) {
  try {
    return db.prepare('SELECT mapel_id, tingkat, kkm FROM kkm_mapel WHERE tenant_id=?').all(tenantId)
  } catch {
    return []
  }
}

/**
 * Pilih KKM untuk satu mapel pada tingkat tertentu.
 * Urutan: (mapel+tingkat) > (mapel+'') > fallback.
 */
function pickKkm(rows, { mapelId, tingkat }, fallback) {
  const mid = String(mapelId || '')
  const t = String(tingkat || '')
  const find = (m, lv) => rows.find(r => String(r.mapel_id || '') === m && String(r.tingkat || '') === lv)
  const row = find(mid, t) || find(mid, '')
  if (!row) return fallback
  const n = Number(row.kkm)
  return Number.isFinite(n) && n > 0 ? Math.max(0, Math.min(100, Math.round(n))) : fallback
}

/**
 * Daftar KKM efektif per mapel untuk ditampilkan di halaman admin:
 * satu baris per (mapel, tingkat) yang SUDAH di-override, plus satu baris
 * "umum" per mapel (tingkat '') yang belum diisi = null (pakai fallback).
 */
function kkmOverview(db, tenantId, { mapelRows, tingkatList }) {
  const rows = loadKkm(db, tenantId)
  return mapelRows.map(m => {
    const umum = rows.find(r => String(r.mapel_id) === String(m.id) && String(r.tingkat || '') === '')
    const perTingkat = tingkatList.map(lv => {
      const r = rows.find(x => String(x.mapel_id) === String(m.id) && String(x.tingkat || '') === String(lv))
      return { tingkat: lv, kkm: r ? Number(r.kkm) : null }
    })
    return {
      mapel_id: m.id,
      mapel_nama: m.nama,
      mapel_kelompok: m.kelompok,
      kkm_umum: umum ? Number(umum.kkm) : null,
      per_tingkat: perTingkat,
    }
  })
}

/** Daftar tingkat (jenjang) yang ada di rombel tenant — untuk pilihan override. */
function tingkatListTenant(db, tenantId) {
  try {
    return db.prepare(
      "SELECT DISTINCT tingkat FROM rombel WHERE tenant_id=? AND TRIM(COALESCE(tingkat,'')) != '' ORDER BY tingkat"
    ).all(tenantId).map(r => r.tingkat)
  } catch {
    return []
  }
}

module.exports = {
  KKM_DEFAULT,
  loadKkm,
  pickKkm,
  kkmOverview,
  tingkatListTenant,
}
