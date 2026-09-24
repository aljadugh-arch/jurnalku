// Text-to-speech lokal menggunakan command-line TTS tools
// 
// Alternatif untuk Gemini TTS quota - process di lokal/command-line
// Support:
// 1. Linux: espeak, festival
// 2. macOS: say command (built-in)
// 3. Windows: PowerShell (built-in)
// Dengan caching untuk menghindari regenerate saat nama sama

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { execSync, spawnSync } = require('node:child_process')
const os = require('node:os')

const DEFAULT_VOICE = 'id'
const CACHE_DIR_NAME = 'tts_local_cache'

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

/**
 * Detect OS dan command TTS yang tersedia
 */
function detectTtsCommand() {
  const platform = os.platform()
  
  if (platform === 'darwin') {
    // macOS: gunakan `say` command (built-in)
    try {
      execSync('which say', { stdio: 'ignore' })
      return 'say'
    } catch { }
  }
  
  if (platform === 'linux') {
    // Linux: cek espeak
    try {
      execSync('which espeak', { stdio: 'ignore' })
      return 'espeak'
    } catch { }
    
    // Fallback ke festival
    try {
      execSync('which festival', { stdio: 'ignore' })
      return 'festival'
    } catch { }
  }
  
  if (platform === 'win32') {
    // Windows: PowerShell SAPI TTS
    return 'powershell'
  }
  
  return null
}

/**
 * Generate audio lokal menggunakan command-line TTS
 */
async function generateTtsAudioLocal(text, uploadDir, tenantId) {
  const cacheDir = cacheDirFor(uploadDir)
  const key = cacheKey(tenantId, text)
  const outputPath = path.join(cacheDir, `${key}.wav`)

  // Cek cache dulu
  if (isUsableCacheFile(outputPath)) {
    return {
      audioUrl: `/uploads/${CACHE_DIR_NAME}/${path.basename(outputPath)}`,
      cached: true,
      filePath: outputPath
    }
  }

  const command = detectTtsCommand()
  if (!command) {
    throw new Error('No TTS command found on system. Install: espeak (Linux), or use built-in (macOS/Windows)')
  }

  try {
    switch (command) {
      case 'say': {
        // macOS: say command
        execSync(`say -v Rishi -o "${outputPath}" "${text}"`, {
          stdio: ['pipe', 'ignore', 'pipe']
        })
        break
      }
      
      case 'espeak': {
        // Linux: espeak command
        execSync(`espeak -l id -w "${outputPath}" "${text}"`, {
          stdio: ['pipe', 'ignore', 'pipe']
        })
        break
      }
      
      case 'festival': {
        // Linux: festival command
        const scm = `(voice_default)(SayText "${text.replace(/"/g, '\\"')}")`
        execSync(`echo '${scm}' | festival --pipe && ffmpeg -f wav -i /tmp/utt.wav -ar 16000 -ac 1 "${outputPath}"`, {
          stdio: ['pipe', 'ignore', 'pipe'],
          shell: true
        })
        break
      }
      
      case 'powershell': {
        // Windows: PowerShell SAPI
        const ps = `Add-Type –AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${text.replace(/'/g, "''")}')`
        execSync(`powershell -Command "${ps}"`, {
          stdio: ['pipe', 'ignore', 'pipe']
        })
        // Note: PowerShell built-in speak tidak output ke file. Perlu alternatif seperti pyttsx3
        throw new Error('PowerShell built-in TTS does not support file output. Install pyttsx3 Python package instead.')
      }
      
      default:
        throw new Error(`Unknown TTS command: ${command}`)
    }

    if (isUsableCacheFile(outputPath)) {
      return {
        audioUrl: `/uploads/${CACHE_DIR_NAME}/${path.basename(outputPath)}`,
        cached: false,
        filePath: outputPath
      }
    } else {
      throw new Error('Generated file is empty or too small')
    }
  } catch (err) {
    // Clean up partial file
    try { fs.unlinkSync(outputPath) } catch { }
    throw new Error(`TTS generation failed: ${err.message}`)
  }
}

/**
 * Check apakah audio sudah ada di cache
 */
function checkTtsCache(text, uploadDir, tenantId) {
  const cacheDir = cacheDirFor(uploadDir)
  const key = cacheKey(tenantId, text)
  const filePath = path.join(cacheDir, `${key}.wav`)
  
  if (isUsableCacheFile(filePath)) {
    return {
      audioUrl: `/uploads/${CACHE_DIR_NAME}/${path.basename(filePath)}`,
      cached: true
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
  checkTtsCache,
  cleanOldCache,
  detectTtsCommand,
  cacheKey,
  cacheDirFor,
  DEFAULT_VOICE,
  CACHE_DIR_NAME
}
