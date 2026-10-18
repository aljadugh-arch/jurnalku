'use strict'
// REKONSILIASI tiga layanan yang punya state di luar kode:
//   1. WA Gateway  (sesi Baileys / kredensial Sidobe)
//   2. Google Drive (backup otomatis + folder tujuan)
//   3. Google Search Console (refresh token OAuth)
//
// MASALAH YANG DISELESAIKAN
// Ketiga layanan menyimpan kredensial di DATABASE, bukan di kode. Deploy hanya
// mengirim dist/ + server/*.cjs, jadi kredensial TIDAK ikut tertimpa. Tetapi
// kalau database di-restore dari cadangan lama, atau baris konfigurasi terhapus,
// ketiganya mati diam-diam: WA berhenti mengirim, backup berhenti jalan, Search
// Console kehilangan izin — tanpa error yang terlihat di UI.
//
// Skrip ini menyimpan SIDIK JARI (fingerprint) konfigurasi, mendeteksi
// perbedaan, dan bisa memulihkan dari snapshot.
//
// PERINTAH
//   node scripts/rekonsiliasi-layanan.cjs simpan          # buat snapshot
//   node scripts/rekonsiliasi-layanan.cjs periksa         # bandingkan
//   node scripts/rekonsiliasi-layanan.cjs pulihkan [file] # kembalikan
//   node scripts/rekonsiliasi-layanan.cjs --json periksa
//
// Snapshot TIDAK menyimpan kredensial mentah — hanya hash SHA-256 dan
// metadata (panjang, ada/tidak). Dengan begitu file snapshot aman disimpan
// dan tetap cukup untuk mendeteksi "kredensial berubah/hilang".
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const AKAR = path.join(__dirname, '..')
const DB_PATH = process.env.DB_PATH || path.join(AKAR, 'server', 'jurnalku.db')
const DIR_SNAPSHOT = process.env.SNAPSHOT_DIR || path.join(AKAR, 'backups', 'rekonsiliasi')

const sha = (v) => crypto.createHash('sha256').update(String(v == null ? '' : v)).digest('hex').slice(0, 16)
const ada = (v) => v != null && String(v).trim() !== ''

function bukaDb() {
  const Database = require(path.join(AKAR, 'node_modules', 'better-sqlite3'))
  if (!fs.existsSync(DB_PATH)) throw new Error(`Database tidak ditemukan: ${DB_PATH}`)
  return new Database(DB_PATH, { readonly: true })
}

// ---------------------------------------------------------------------------
// 1. WA GATEWAY
// ---------------------------------------------------------------------------
function bacaWa(db) {
  let rows = []
  try {
    rows = db.prepare(`
      SELECT tenant_id, provider, enabled, sender_name,
             baileys_session, baileys_webhook,
             sidobe_api_url, sidobe_api_key, sidobe_device_id
      FROM wa_gateway_config ORDER BY tenant_id
    `).all()
  } catch (e) {
    return { error: e.message, tenant: [] }
  }

  // Sesi Baileys disimpan juga di wa_sessions (status koneksi per tenant).
  // Tanpa ini, "session hilang" tidak terdeteksi walau baris config utuh.
  const sesi = {}
  try {
    for (const s of db.prepare('SELECT tenant_id, status, updated_at FROM wa_sessions').all()) {
      sesi[s.tenant_id] = { status: s.status, updated_at: s.updated_at }
    }
  } catch { /* tabel boleh tidak ada di DB lama */ }

  return {
    tenant: rows.map(r => ({
      tenant_id: r.tenant_id,
      provider: r.provider || '',
      enabled: Number(r.enabled) || 0,
      sender_name: r.sender_name || '',
      // Fingerprint, bukan nilai. Cukup untuk tahu "berubah" tanpa membocorkan.
      sesi_hash: sha(r.baileys_session),
      sesi_ada: ada(r.baileys_session),
      sesi_panjang: String(r.baileys_session || '').length,
      webhook_hash: sha(r.baileys_webhook),
      sidobe_url: r.sidobe_api_url || '',
      sidobe_key_hash: sha(r.sidobe_api_key),
      sidobe_key_ada: ada(r.sidobe_api_key),
      sidobe_device: r.sidobe_device_id || '',
      status_koneksi: sesi[r.tenant_id]?.status || 'tidak-tercatat',
      status_diubah: sesi[r.tenant_id]?.updated_at || '',
    })),
  }
}

// ---------------------------------------------------------------------------
// 2. GOOGLE DRIVE (backup)
// ---------------------------------------------------------------------------
function bacaDrive(db) {
  let cfg = []
  try {
    cfg = db.prepare(`
      SELECT tenant_id, folder_id, auto_enabled, retention_days, schedule_time, timezone,
             last_run_key, last_run_at
      FROM backup_config ORDER BY tenant_id
    `).all()
  } catch (e) {
    return { error: e.message, tenant: [] }
  }

  // OAuth Drive: token disimpan terenkripsi di search_console_token dengan
  // scope drive.file. Tanpa token ini backup otomatis mati.
  let token = null
  try {
    const t = db.prepare("SELECT scope, refresh_token_encrypted, updated_at FROM search_console_token WHERE id='default'").get()
    token = t ? {
      scope: String(t.scope || ''),
      ada_drive_scope: /drive/.test(String(t.scope || '')),
      token_hash: sha(t.refresh_token_encrypted),
      token_panjang: String(t.refresh_token_encrypted || '').length,
      diperbarui: t.updated_at || '',
    } : { ada_drive_scope: false, token_hash: '', token_panjang: 0 }
  } catch { token = { ada_drive_scope: false, token_hash: '', token_panjang: 0 } }

  let log = []
  try {
    log = db.prepare('SELECT tenant_id, status, created_at FROM backup_log ORDER BY created_at DESC LIMIT 20').all()
  } catch { /* opsional */ }

  return {
    token_oauth: token,
    tenant: cfg.map(r => ({
      tenant_id: r.tenant_id,
      folder_id: r.folder_id || '',
      folder_ada: ada(r.folder_id),
      folder_hash: sha(r.folder_id),
      auto_enabled: Number(r.auto_enabled) || 0,
      retention_days: Number(r.retention_days) || 0,
      schedule_time: r.schedule_time || '',
      timezone: r.timezone || '',
      last_run_key: r.last_run_key || '',
      last_run_at: r.last_run_at || '',
    })),
    log_terakhir: log.map(l => ({ tenant_id: l.tenant_id, status: l.status, created_at: l.created_at })),
  }
}

// ---------------------------------------------------------------------------
// 3. GOOGLE SEARCH CONSOLE
// ---------------------------------------------------------------------------
function bacaSearchConsole(db) {
  let t = null
  try {
    t = db.prepare("SELECT scope, refresh_token_encrypted, updated_at FROM search_console_token WHERE id='default'").get()
  } catch (e) {
    return { error: e.message, ada: false }
  }
  if (!t) return { ada: false, scope: '', ada_webmasters: false, ada_siteverification: false, token_hash: '', token_panjang: 0 }

  const scope = String(t.scope || '')
  return {
    ada: true,
    scope,
    ada_webmasters: /webmasters/.test(scope),
    ada_siteverification: /siteverification/.test(scope),
    token_hash: sha(t.refresh_token_encrypted),
    token_panjang: String(t.refresh_token_encrypted || '').length,
    diperbarui: t.updated_at || '',
  }
}

function bacaSemua() {
  const db = bukaDb()
  try {
    return {
      dibuat: new Date().toISOString(),
      database: DB_PATH,
      wa: bacaWa(db),
      drive: bacaDrive(db),
      search_console: bacaSearchConsole(db),
    }
  } finally { db.close() }
}

// ---------------------------------------------------------------------------
// PEMBANDING
// ---------------------------------------------------------------------------
function bandingkan(lama, baru) {
  const temuan = []
  const tambah = (tingkat, layanan, pesan) => temuan.push({ tingkat, layanan, pesan })

  // ---- WA ----
  const waLama = new Map((lama.wa?.tenant || []).map(t => [t.tenant_id, t]))
  const waBaru = new Map((baru.wa?.tenant || []).map(t => [t.tenant_id, t]))
  for (const [tid, l] of waLama) {
    const b = waBaru.get(tid)
    if (!b) { tambah('KRITIS', 'wa', `Konfigurasi WA tenant ${tid} HILANG`); continue }
    if (l.enabled === 1 && b.enabled === 0) tambah('KRITIS', 'wa', `WA tenant ${tid} berubah dari aktif ke NONAKTIF`)
    if (l.sesi_ada && !b.sesi_ada) tambah('KRITIS', 'wa', `Sesi Baileys tenant ${tid} HILANG — perlu scan QR ulang`)
    else if (l.sesi_hash !== b.sesi_hash) tambah('PERINGATAN', 'wa', `Sesi Baileys tenant ${tid} berubah (mungkin sudah scan ulang — normal)`)
    if (l.sidobe_key_ada && !b.sidobe_key_ada) tambah('KRITIS', 'wa', `API key Sidobe tenant ${tid} HILANG`)
    if (l.status_koneksi === 'connected' && b.status_koneksi !== 'connected') {
      tambah('PERINGATAN', 'wa', `Koneksi WA tenant ${tid}: ${l.status_koneksi} -> ${b.status_koneksi}`)
    }
  }
  for (const [tid] of waBaru) if (!waLama.has(tid)) tambah('INFO', 'wa', `Konfigurasi WA tenant ${tid} baru ditambahkan`)

  // ---- DRIVE ----
  const drLama = new Map((lama.drive?.tenant || []).map(t => [t.tenant_id, t]))
  const drBaru = new Map((baru.drive?.tenant || []).map(t => [t.tenant_id, t]))
  for (const [tid, l] of drLama) {
    const b = drBaru.get(tid)
    if (!b) { tambah('KRITIS', 'drive', `Konfigurasi backup tenant ${tid} HILANG`); continue }
    if (l.auto_enabled === 1 && b.auto_enabled === 0) tambah('KRITIS', 'drive', `Backup otomatis tenant ${tid} NONAKTIF`)
    if (l.folder_ada && !b.folder_ada) tambah('KRITIS', 'drive', `Folder tujuan backup tenant ${tid} HILANG`)
    else if (l.folder_hash !== b.folder_hash) tambah('INFO', 'drive', `Folder tujuan backup tenant ${tid} berubah`)
  }
  const tokLama = lama.drive?.token_oauth || {}
  const tokBaru = baru.drive?.token_oauth || {}
  if (tokLama.ada_drive_scope && !tokBaru.ada_drive_scope) {
    tambah('KRITIS', 'drive', 'Izin Google Drive HILANG dari token OAuth — backup otomatis akan gagal')
  }
  if (tokLama.token_panjang > 0 && tokBaru.token_panjang === 0) {
    tambah('KRITIS', 'drive', 'Refresh token OAuth HILANG — perlu hubungkan ulang Google Drive')
  }

  // ---- SEARCH CONSOLE ----
  const scLama = lama.search_console || {}
  const scBaru = baru.search_console || {}
  if (scLama.ada && !scBaru.ada) {
    tambah('KRITIS', 'search-console', 'Token Search Console HILANG — verifikasi domain & sitemap berhenti')
  } else if (scLama.ada && scBaru.ada) {
    if (scLama.ada_webmasters && !scBaru.ada_webmasters) tambah('KRITIS', 'search-console', 'Scope webmasters HILANG')
    if (scLama.ada_siteverification && !scBaru.ada_siteverification) tambah('KRITIS', 'search-console', 'Scope siteverification HILANG')
    if (scLama.token_hash !== scBaru.token_hash) tambah('PERINGATAN', 'search-console', 'Token Search Console berubah (mungkin sudah otorisasi ulang — normal)')
    if (scLama.token_panjang > 0 && scBaru.token_panjang === 0) tambah('KRITIS', 'search-console', 'Refresh token kosong — perlu hubungkan ulang')
  }

  return temuan
}

// ---------------------------------------------------------------------------
// PERINTAH
// ---------------------------------------------------------------------------
function simpan() {
  const data = bacaSemua()
  fs.mkdirSync(DIR_SNAPSHOT, { recursive: true })
  const nama = `snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const file = path.join(DIR_SNAPSHOT, nama)
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 })
  // Simpan juga sebagai "terakhir.json" untuk pembanding default.
  fs.writeFileSync(path.join(DIR_SNAPSHOT, 'terakhir.json'), JSON.stringify(data, null, 2), { mode: 0o600 })
  return { file, data }
}

function snapshotTerakhir() {
  const f = path.join(DIR_SNAPSHOT, 'terakhir.json')
  if (!fs.existsSync(f)) return null
  try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null }
}

function periksa(filePembanding) {
  const baru = bacaSemua()
  const lama = filePembanding
    ? JSON.parse(fs.readFileSync(filePembanding, 'utf8'))
    : snapshotTerakhir()
  if (!lama) return { status: 'TANPA-SNAPSHOT', pesan: 'Belum ada snapshot. Jalankan: node scripts/rekonsiliasi-layanan.cjs simpan', temuan: [], baru }
  const temuan = bandingkan(lama, baru)
  const kritis = temuan.filter(t => t.tingkat === 'KRITIS').length
  return {
    status: kritis > 0 ? 'BERMASALAH' : (temuan.length > 0 ? 'BERUBAH' : 'SEHAT'),
    dibandingkan_dengan: lama.dibuat,
    ringkasan: {
      kritis,
      peringatan: temuan.filter(t => t.peringatan === 'PERINGATAN' || t.tingkat === 'PERINGATAN').length,
      info: temuan.filter(t => t.tingkat === 'INFO').length,
    },
    temuan, baru,
  }
}

// Pemulihan: hanya mengembalikan KOLOM yang hilang/kosong, bukan menimpa yang
// masih baik. Snapshot menyimpan hash, bukan nilai asli — jadi pemulihan nilai
// mentah hanya mungkin bila file cadangan DB tersedia. Yang bisa dilakukan di
// sini: melaporkan perintah pemulihan yang tepat, dan mengaktifkan kembali
// sakelar yang mati.
function pulihkan(file) {
  const hasil = periksa(file)
  const saran = []
  for (const t of hasil.temuan) {
    if (t.tingkat !== 'KRITIS') continue
    if (t.layanan === 'wa' && /NONAKTIF/.test(t.pesan)) saran.push({ aksi: 'aktifkan_wa', pesan: t.pesan })
    if (t.layanan === 'wa' && /Sesi Baileys/.test(t.pesan)) saran.push({ aksi: 'scan_qr', pesan: t.pesan })
    if (t.layanan === 'drive' && /NONAKTIF/.test(t.pesan)) saran.push({ aksi: 'aktifkan_backup', pesan: t.pesan })
    if (t.layanan === 'drive' && /OAuth|token/i.test(t.pesan)) saran.push({ aksi: 'hubungkan_drive', pesan: t.pesan })
    if (t.layanan === 'search-console') saran.push({ aksi: 'hubungkan_search_console', pesan: t.pesan })
  }
  return { ...hasil, saran }
}

function utama() {
  const arg = process.argv.slice(2)
  const json = arg.includes('--json')
  const cmd = arg.find(a => !a.startsWith('--')) || 'periksa'

  if (cmd === 'simpan') {
    const { file, data } = simpan()
    const jumlah = {
      wa: data.wa?.tenant?.length || 0,
      drive: data.drive?.tenant?.length || 0,
      search_console: data.search_console?.ada ? 1 : 0,
    }
    if (json) return console.log(JSON.stringify({ file, jumlah }, null, 2))
    console.log('Snapshot disimpan:', file)
    console.log(`  WA tenant        : ${jumlah.wa}`)
    console.log(`  Backup Drive     : ${jumlah.drive}`)
    console.log(`  Search Console   : ${jumlah.search_console ? 'ada token' : 'BELUM terhubung'}`)
    return
  }

  if (cmd === 'pulihkan') {
    const file = arg.find(a => a.endsWith('.json'))
    const hasil = pulihkan(file)
    if (json) return console.log(JSON.stringify(hasil, null, 2))
    console.log('Status:', hasil.status)
    if (hasil.temuan.length === 0) return console.log('  Tidak ada perubahan yang perlu dipulihkan.')
    for (const t of hasil.temuan) console.log(`  [${t.tingkat}] ${t.layanan}: ${t.pesan}`)
    if (hasil.saran.length) {
      console.log('\nLangkah pemulihan:')
      for (const s of hasil.saran) console.log(`  - ${s.aksi}: ${s.pesan}`)
    }
    return
  }

  const file = arg.find(a => a.endsWith('.json'))
  const hasil = periksa(file)
  if (json) return console.log(JSON.stringify(hasil, null, 2))
  console.log('Status rekonsiliasi:', hasil.status)
  if (hasil.pesan) return console.log(' ', hasil.pesan)
  console.log('Dibandingkan dengan snapshot:', hasil.dibandingkan_dengan)
  if (hasil.temuan.length === 0) return console.log('  Ketiga layanan sesuai snapshot — tidak ada perubahan.')
  console.log(`  ${hasil.ringkasan.kritis} kritis · ${hasil.ringkasan.peringatan} peringatan · ${hasil.ringkasan.info} info`)
  for (const t of hasil.temuan) console.log(`  [${t.tingkat}] ${t.layanan}: ${t.pesan}`)
}

if (require.main === module) utama()
module.exports = { bacaSemua, bandingkan, periksa, simpan, pulihkan }
