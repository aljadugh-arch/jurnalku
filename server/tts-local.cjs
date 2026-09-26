// Text-to-speech lokal untuk pengumuman absensi ("Azzam masuk").
//
// Engine utama: Microsoft Edge TTS (voice neural online, gratis, tanpa API
// key) — jauh lebih natural dibanding espeak (formant synthesis lama yang
// terdengar robotic/kurang jelas, keluhan user 2026-09-26). Voice default
// FEMALE Bahasa Indonesia (id-ID-GadisNeural) sesuai permintaan user.
//
// PENTING (arsitektur): Edge TTS butuh network round-trip (~1-3 detik),
// BUKAN instan seperti espeak (~5ms). Panggilan HARUS async (execFile, bukan
// execSync) dan proses generate TIDAK BOLEH menunggu di jalur request utama
// (lihat generateTtsAudioLocalBackground) — kalau tidak, satu nama baru bisa
// membekukan event loop Node.js untuk SEMUA tenant selama beberapa detik.
//
// Fallback berlapis kalau Edge TTS gagal (mis. VPS tanpa akses internet ke
// speech.platform.bing.com, atau paket edge-tts/ffmpeg belum terpasang):
// turun ke espeak lokal (robotic tapi selalu tersedia offline) supaya fitur
// pengumuman suara tidak pernah mati total.
//
// Caching berbasis hash tenant+text seperti sebelumnya, supaya nama yang
// sama tidak digenerate ulang setiap scan.

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { execFile, execSync } = require('node:child_process')
const util = require('node:util')

const execFileAsync = util.promisify(execFile)

// Override via env kalau path instalasi berbeda di server lain.
const EDGE_TTS_BIN = process.env.EDGE_TTS_BIN || '/opt/jurnalku-edge-tts/venv/bin/edge-tts'
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg'
// Voice FEMALE Bahasa Indonesia (Microsoft Edge neural). Ganti ke
// id-ID-ArdiNeural (male) via env EDGE_TTS_VOICE bila suatu saat dibutuhkan lagi.
const DEFAULT_VOICE = process.env.EDGE_TTS_VOICE || 'id-ID-GadisNeural'
const CACHE_DIR_NAME = 'tts_local_cache'
const GEN_TIMEOUT_MS = 8000

function cacheDirFor(uploadDir) {
  const dir = path.join(uploadDir, CACHE_DIR_NAME)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function cacheKey(tenantId, text) {
  return crypto.createHash('sha256').update(`${tenantId}|${text}`).digest('hex')
}

function isUsableCacheFile(filePath) {
  try {
    // File WAV minimal 44 bytes (header). File kosong/kecil = gagal generate
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 44
  } catch {
    return false
  }
}

function edgeTtsAvailable() {
  try {
    fs.accessSync(EDGE_TTS_BIN, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function espeakAvailable() {
  try {
    execSync('which espeak', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Generate via Edge TTS (async, network) -> mp3 sementara -> convert ke WAV
 * PCM 16-bit mono 24kHz via ffmpeg (format standar yang sudah divalidasi
 * skill jurnalku-tts-cache).
 */
async function generateViaEdgeTts(text, outputPath) {
  const tmpMp3 = path.join(os.tmpdir(), `tts_edge_${crypto.randomBytes(8).toString('hex')}.mp3`)
  try {
    await execFileAsync(EDGE_TTS_BIN, ['--voice', DEFAULT_VOICE, '--text', text, '--write-media', tmpMp3], {
      timeout: GEN_TIMEOUT_MS,
    })
    if (!fs.existsSync(tmpMp3) || fs.statSync(tmpMp3).size === 0) {
      throw new Error('Edge TTS menghasilkan file kosong')
    }
    await execFileAsync(FFMPEG_BIN, [
      '-y', '-i', tmpMp3,
      '-ar', '24000', '-ac', '1', '-sample_fmt', 's16',
      '-f', 'wav', outputPath,
    ], { timeout: GEN_TIMEOUT_MS })
  } finally {
    try { fs.unlinkSync(tmpMp3) } catch { }
  }
}

/**
 * Fallback offline: espeak (robotic tapi selalu tersedia tanpa internet).
 */
async function generateViaEspeak(text, outputPath) {
  await execFileAsync('espeak', ['-l', 'id', '-w', outputPath, text], { timeout: GEN_TIMEOUT_MS })
}

/**
 * Generate audio (async). Dipakai oleh prewarm (boleh menunggu) dan oleh
 * generateTtsAudioLocalBackground (fire-and-forget, lihat di bawah).
 */
async function generateTtsAudioLocal(text, uploadDir, tenantId) {
  const cacheDir = cacheDirFor(uploadDir)
  const key = cacheKey(tenantId, text)
  const outputPath = path.join(cacheDir, `${key}.wav`)

  if (isUsableCacheFile(outputPath)) {
    return {
      audioUrl: `/uploads/${CACHE_DIR_NAME}/${path.basename(outputPath)}`,
      cached: true,
      filePath: outputPath,
    }
  }

  let lastErr = null
  if (edgeTtsAvailable()) {
    try {
      await generateViaEdgeTts(text, outputPath)
    } catch (err) {
      lastErr = err
      try { fs.unlinkSync(outputPath) } catch { }
    }
  }

  if (!isUsableCacheFile(outputPath)) {
    if (!espeakAvailable()) {
      throw new Error(`TTS generation failed: ${lastErr?.message || 'Edge TTS tidak tersedia dan espeak tidak terpasang'}`)
    }
    try {
      await generateViaEspeak(text, outputPath)
    } catch (err) {
      try { fs.unlinkSync(outputPath) } catch { }
      throw new Error(`TTS generation failed (Edge TTS & espeak gagal): ${err.message}`)
    }
  }

  if (!isUsableCacheFile(outputPath)) {
    throw new Error('Generated file is empty or too small')
  }

  return {
    audioUrl: `/uploads/${CACHE_DIR_NAME}/${path.basename(outputPath)}`,
    cached: false,
    filePath: outputPath,
  }
}

// Cegah request duplikat (dua scan hampir bersamaan utk nama yang sama)
// memicu generate paralel yang sia-sia.
const inFlight = new Set()

/**
 * Generate DI BACKGROUND (fire-and-forget) — dipanggil dari endpoint
 * /api/tts/announce saat cache belum ada, supaya SCAN SEKARANG tidak
 * menunggu network Edge TTS (~1-3 detik), tapi SCAN BERIKUTNYA untuk nama
 * yang sama sudah dapat audio dari cache. Sama persis polanya dengan
 * generateTtsAudioBackground di gemini-tts.cjs.
 */
function generateTtsAudioLocalBackground(text, uploadDir, tenantId) {
  const flightKey = `${tenantId}|${text}`
  if (inFlight.has(flightKey)) return
  inFlight.add(flightKey)
  generateTtsAudioLocal(text, uploadDir, tenantId)
    .catch((err) => console.error('[tts-local background]', text, err.message))
    .finally(() => inFlight.delete(flightKey))
}

/**
 * Check apakah audio sudah ada di cache (sync, tanpa memanggil TTS apapun).
 */
function checkTtsCache(text, uploadDir, tenantId) {
  const cacheDir = cacheDirFor(uploadDir)
  const key = cacheKey(tenantId, text)
  const filePath = path.join(cacheDir, `${key}.wav`)

  if (isUsableCacheFile(filePath)) {
    return {
      audioUrl: `/uploads/${CACHE_DIR_NAME}/${path.basename(filePath)}`,
      cached: true,
    }
  }
  return null
}

/**
 * Clean cache lama (lebih dari 7 hari)
 */
function cleanOldCache(uploadDir, maxAgeDays = 7) {
  const cacheDir = cacheDirFor(uploadDir)
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
  const now = Date.now()

  try {
    const files = fs.readdirSync(cacheDir)
    for (const file of files) {
      const filePath = path.join(cacheDir, file)
      const stat = fs.statSync(filePath)
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath)
      }
    }
  } catch (err) {
    console.log('[TTS Local] cache cleanup error:', err.message)
  }
}

module.exports = {
  generateTtsAudioLocal,
  generateTtsAudioLocalBackground,
  checkTtsCache,
  cleanOldCache,
  edgeTtsAvailable,
  espeakAvailable,
  cacheKey,
  cacheDirFor,
  DEFAULT_VOICE,
  CACHE_DIR_NAME,
}
