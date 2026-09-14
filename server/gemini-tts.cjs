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

function cacheDirFor(uploadDir) {
  const dir = path.join(uploadDir, 'tts_cache')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function cacheKey(tenantId, voiceName, text) {
  return crypto.createHash('sha256').update(`${tenantId}|${voiceName}|${text}`).digest('hex')
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
async function generateTtsAudio({ apiKey, text, voiceName, uploadDir, tenantId }) {
  const voice = voiceName || DEFAULT_VOICE
  const dir = cacheDirFor(uploadDir)
  const key = cacheKey(tenantId, voice, text)
  const filePath = path.join(dir, `${key}.wav`)
  const publicUrl = `/uploads/tts_cache/${key}.wav`
  if (fs.existsSync(filePath)) return { audioUrl: publicUrl, cached: true }

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
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Gemini TTS gagal (${response.status}): ${errText.slice(0, 200)}`)
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

module.exports = { generateTtsAudio, DEFAULT_VOICE, GEMINI_TTS_MODEL }
