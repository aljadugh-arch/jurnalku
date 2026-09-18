// Text-to-speech server-side via Google Gemini TTS API.
//
// Dipakai sebagai pengganti Web Speech API browser (yang di ekosistem
// Chrome/Android hanya punya SATU voice Bahasa Indonesia dan itu female —
// tidak ada voice pria Bahasa Indonesia sama sekali di Web Speech API mana
// pun). Gemini TTS menyediakan voice pria natural yang mendukung Bahasa
// Indonesia, di-generate di server Google (tidak membebani VPS aplikasi).
//
// Reuse infrastruktur ai_config/user_ai_config yang sudah ada (API key
// terenkripsi per tenant/guru) — provider harus 'gemini' dan apiKey terisi.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts'
// "Puck" = voice pria dengan nada upbeat/ramah — cocok untuk pengumuman
// absensi ("Azzam masuk") yang perlu terdengar positif & natural.
const DEFAULT_VOICE = process.env.GEMINI_TTS_VOICE || 'Puck'

class TtsRateLimitError extends Error {
  constructor(message, retryAfterMs = 0) {
    super(message)
    this.name = 'TtsRateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

function retryAfterFromResponse(response, bodyText) {
  const header = Number(response.headers.get('retry-after'))
  if (Number.isFinite(header) && header > 0) return Math.ceil(header * 1000)
  const match = String(bodyText).match(/retry in\s+([\d.]+)s/i)
  return match ? Math.ceil(Number(match[1]) * 1000) : 0
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

function cacheDirFor(uploadDir) {
  const dir = path.join(uploadDir, 'tts_cache')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function cacheKey(tenantId, voiceName, text) {
  return crypto.createHash('sha256').update(`${tenantId}|${voiceName}|${text}`).digest('hex')
}

// Minimal WAV berisi header 44 byte. File yang lebih kecil/kosong dianggap
// korup agar status prewarm tidak terlihat siap ketika audio gagal dibuat.
function isUsableCacheFile(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 44
  } catch {
    return false
  }
}

const ttsJobs = new Map()

function createTtsJob(total) {
  const id = crypto.randomUUID()
  const now = Date.now()
  const job = {
    id,
    status: 'running',
    phase: 'processing',
    total,
    done: 0,
    failed: 0,
    retrying: 0,
    processed: 0,
    retryAt: null,
    startedAt: now,
    updatedAt: now,
  }
  ttsJobs.set(id, job)
  for (const [jobId, value] of ttsJobs) {
    if (now - value.updatedAt > 30 * 60 * 1000) ttsJobs.delete(jobId)
  }
  return job
}

function getTtsJobStatus(id) {
  return ttsJobs.get(id) || null
}

async function runTtsQueue(items, worker, {
  concurrency = 1,
  onProgress,
  onRetry,
  maxRetries = 3,
  rateLimitDelayMs = 7000,
} = {}) {
  let nextIndex = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++
      let attempt = 0
      while (true) {
        try {
          await worker(items[index], index)
          onProgress?.(null)
          break
        } catch (error) {
          if (error instanceof TtsRateLimitError && attempt < maxRetries) {
            attempt++
            const retryAfterMs = error.retryAfterMs
            onRetry?.({ index, attempt, retryAfterMs: retryAfterMs || rateLimitDelayMs })
            await delay(retryAfterMs || rateLimitDelayMs)
            continue
          }
          onProgress?.(error)
          break
        }
      }
      // Free-tier Gemini TTS membatasi request per menit. Jeda antarnama
      // mencegah burst yang membuat semua sisa antrean langsung 429.
      if (nextIndex < items.length) await delay(rateLimitDelayMs)
    }
  })
  await Promise.all(runners)
}

// Gemini TTS mengembalikan PCM 16-bit mono mentah (audio/L16, biasanya 24kHz)
// tanpa header — tidak bisa langsung diputar oleh <audio>/Audio(). Bungkus
// jadi file WAV valid dengan menambahkan header 44-byte standar.
function pcmToWav(pcmBuffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcmBuffer.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcmBuffer.length, 40)
  return Buffer.concat([header, pcmBuffer])
}

// Generate (atau ambil dari cache disk) audio WAV untuk sebuah teks.
// Cache dikunci per tenant+voice+text supaya frasa berulang (mis. nama
// siswa yang sama setiap hari) tidak memanggil API lagi — hemat kuota &
// jauh lebih cepat (langsung dari disk, tanpa network round-trip).
//
// PENTING: Gemini TTS API BUKAN cepat — diukur nyata di production
// (2026-09-14) butuh 3-14 DETIK per generate (jauh dari instan). Fungsi ini
// TIDAK BOLEH dipanggil secara sinkron/menunggu dari jalur scan absensi —
// hanya boleh dipanggil: (a) saat cache belum ada untuk generate DI BACKGROUND
// tanpa menunggu (lihat generateTtsAudioBackground), atau (b) dari endpoint
// prewarm yang sengaja dijalankan lebih dulu (mis. sebelum jam masuk sekolah).
async function generateTtsAudio({ apiKey, text, voiceName, uploadDir, tenantId }) {
  const voice = voiceName || DEFAULT_VOICE
  const dir = cacheDirFor(uploadDir)
  const key = cacheKey(tenantId, voice, text)
  const filePath = path.join(dir, `${key}.wav`)
  const publicUrl = `/uploads/tts_cache/${key}.wav`
  if (isUsableCacheFile(filePath)) return { audioUrl: publicUrl, cached: true }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`
  const body = {
    contents: [{ parts: [{ text: `Ucapkan dengan nada ramah, natural, dan jelas: ${text}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  })
  if (!response.ok) {
    const msg = await response.text().catch(() => '')
    const message = `Gemini TTS gagal (${response.status}): ${msg.slice(0, 300)}`
    if (response.status === 429) {
      throw new TtsRateLimitError(message, retryAfterFromResponse(response, msg))
    }
    throw new Error(message)
  }
  const data = await response.json()
  const part = data?.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data)
  const base64Pcm = part?.inlineData?.data
  if (!base64Pcm) throw new Error('Gemini TTS tidak mengembalikan audio (respons kosong)')
  const mimeType = part.inlineData.mimeType || 'audio/L16;rate=24000'
  const rateMatch = /rate=(\d+)/.exec(mimeType)
  const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000
  const pcmBuffer = Buffer.from(base64Pcm, 'base64')
  const wavBuffer = pcmToWav(pcmBuffer, sampleRate)
  fs.writeFileSync(filePath, wavBuffer)
  return { audioUrl: publicUrl, cached: false }
}

// Cek APAKAH sudah ada di cache TANPA memanggil API sama sekali — dipakai
// oleh endpoint /api/tts/announce agar respons ke browser selalu instan.
function checkTtsCache({ text, voiceName, uploadDir, tenantId }) {
  const voice = voiceName || DEFAULT_VOICE
  const dir = cacheDirFor(uploadDir)
  const key = cacheKey(tenantId, voice, text)
  const filePath = path.join(dir, `${key}.wav`)
  const publicUrl = `/uploads/tts_cache/${key}.wav`
  return isUsableCacheFile(filePath) ? { audioUrl: publicUrl, cached: true } : null
}

// Set in-memory kecil supaya request duplikat (mis. dua scan hampir bersamaan
// utk nama yang sama) tidak memicu 2 panggilan API paralel ke Gemini.
const inFlight = new Set()

// Generate DI BACKGROUND (fire-and-forget) — dipanggil dari endpoint
// /api/tts/announce saat cache belum ada, supaya SCAN SEKARANG tidak
// menunggu, tapi SCAN BERIKUTNYA untuk nama yang sama sudah dapat cache.
function generateTtsAudioBackground({ apiKey, text, voiceName, uploadDir, tenantId }) {
  const voice = voiceName || DEFAULT_VOICE
  const flightKey = `${tenantId}|${voice}|${text}`
  if (inFlight.has(flightKey)) return
  inFlight.add(flightKey)
  generateTtsAudio({ apiKey, text, voiceName: voice, uploadDir, tenantId })
    .catch((err) => console.error('[gemini-tts background]', text, err.message))
    .finally(() => inFlight.delete(flightKey))
}

module.exports = {
  generateTtsAudio,
  generateTtsAudioBackground,
  checkTtsCache,
  createTtsJob,
  getTtsJobStatus,
  runTtsQueue,
  DEFAULT_VOICE,
  GEMINI_TTS_MODEL,
}
