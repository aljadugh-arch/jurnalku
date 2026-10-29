'use strict'

// Pengaturan platform (global, bukan per-tenant) — disimpan sebagai pasangan
// key/value supaya admin super bisa mengubahnya lewat dashboard tanpa deploy.
//
// Saat ini hanya dipakai untuk `reminder_days` (berapa hari sebelum masa aktif
// berakhir pengingat WA/email dikirim). Struktur key/value memudahkan menambah
// pengaturan platform lain di masa depan.

function setupPlatformSettings(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)
  db.prepare("INSERT OR IGNORE INTO platform_settings (key, value) VALUES ('reminder_days', '3')").run()
}

function getPlatformSettings(db) {
  const out = {}
  try {
    for (const r of db.prepare('SELECT key, value FROM platform_settings').all()) out[r.key] = r.value
  } catch { /* tabel belum ada */ }
  return out
}

function setPlatformSetting(db, key, value) {
  db.prepare(`INSERT INTO platform_settings (key, value, updated_at)
    VALUES (?,?,datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`)
    .run(String(key), String(value))
}

/** Hari pengingat masa aktif: dari DB, fallback ke nilai yang diberikan. */
function getReminderDays(db, fallback = 3) {
  const v = Number(getPlatformSettings(db).reminder_days)
  return Number.isFinite(v) && v > 0 ? Math.round(v) : fallback
}

module.exports = { setupPlatformSettings, getPlatformSettings, setPlatformSetting, getReminderDays }
