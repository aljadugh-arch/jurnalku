// Umpan balik suara untuk aksi absensi (ceklok GTK dan scan QR siswa).
//
// Memakai WebAudio oscillator, bukan file audio: bundle tidak bertambah, tetap
// berbunyi saat PWA offline, dan tidak perlu aset tambahan di dist/.
// Semua kegagalan (browser lama, autoplay diblokir, izin audio) ditelan diam-diam
// karena suara hanyalah pelengkap; alur absensi tidak boleh ikut gagal.

type Tone = 'masuk' | 'pulang' | 'duplicate' | 'error'
type AttendanceSession = 'masuk' | 'pulang'

type ToneSpec = { freq: number[]; step: number; duration: number; gain: number; type: OscillatorType }

// Nada masuk naik (konfirmasi), pulang turun (penutup) supaya operator bisa
// membedakan sesi tanpa melihat layar.
const TONES: Record<Tone, ToneSpec> = {
  masuk: { freq: [880, 1320], step: 0.09, duration: 0.16, gain: 0.28, type: 'sine' },
  pulang: { freq: [1320, 880], step: 0.09, duration: 0.16, gain: 0.28, type: 'sine' },
  duplicate: { freq: [740, 740], step: 0.11, duration: 0.1, gain: 0.2, type: 'triangle' },
  error: { freq: [320, 220], step: 0.12, duration: 0.2, gain: 0.25, type: 'square' },
}

let ctx: AudioContext | null = null
let speechPrimed = false

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || (window as any).webkitAudioContext
  if (!Ctor) return null
  try {
    if (!ctx) ctx = new Ctor()
    return ctx
  } catch {
    return null
  }
}

/**
 * Dipanggil dari handler gestur pengguna (klik tombol ceklok / buka kamera QR).
 * Browser mobile memblokir AudioContext yang dibuat di luar gestur, jadi konteks
 * harus dibuat dan di-resume lebih dulu agar bunyi hasil scan benar-benar keluar.
 */
export function primeFeedbackSound() {
  const audio = getContext()
  try {
    if (audio?.state === 'suspended') void audio.resume()
  } catch {
    // Diamkan: gagal resume hanya berarti tidak ada suara.
  }
  // Prime TTS juga harus terjadi di gesture pengguna. Beberapa browser/mobile
  // mengizinkan beep WebAudio tapi menolak speechSynthesis bila baru dipanggil
  // setelah respons async scan/ceklok.
  primeSpeechSynthesis()
}

export function playFeedbackSound(tone: Tone = 'masuk') {
  const audio = getContext()
  if (!audio) return
  const spec = TONES[tone] || TONES.masuk
  try {
    if (audio.state === 'suspended') void audio.resume()
    const start = audio.currentTime
    spec.freq.forEach((freq, index) => {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      const at = start + index * spec.step
      osc.type = spec.type
      osc.frequency.setValueAtTime(freq, at)
      // Envelope pendek supaya tidak terdengar seperti "klik" dan tidak menumpuk.
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(spec.gain, at + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + spec.duration)
      osc.connect(gain)
      gain.connect(audio.destination)
      osc.start(at)
      osc.stop(at + spec.duration + 0.02)
    })
    // Getar singkat membantu di HP dalam mode senyap; diabaikan bila tak didukung.
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(tone === 'error' ? [90, 60, 90] : 45)
    }
  } catch {
    // Diamkan: absensi tetap tersimpan walau suara gagal diputar.
  }
}

function toNaturalCase(word: string) {
  const clean = String(word || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return clean.split(' ').filter(Boolean).map(part => {
    // TTS sering mengeja ALL CAPS seperti “A-Z-Z-A-M-I”. Ubah menjadi kata biasa.
    const lower = part.toLocaleLowerCase('id-ID')
    return lower.charAt(0).toLocaleUpperCase('id-ID') + lower.slice(1)
  }).join(' ')
}

function firstName(name?: string | null) {
  const clean = toNaturalCase(String(name || ''))
  if (!clean) return ''
  return clean.split(' ')[0]
}

function getSpeechSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  const synth = window.speechSynthesis
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return null
  return synth
}

function pickBestVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices?.() || []
  // Prioritas: voice Indonesia male > Indonesia female > voice Indonesia apapun > fallback pertama
  const idVoices = voices.filter(v => /^id[-_]/i.test(v.lang) || /indonesia/i.test(v.name))
  if (!idVoices.length) return null
  // Cari male terlebih dahulu
  const male = idVoices.find(v => /male|pria|laki|man/i.test(v.name))
  if (male) return male
  // Cari female (backup)
  const female = idVoices.find(v => /female|wanita|perempuan|woman/i.test(v.name))
  if (female) return female
  // Ambil voice Indonesia pertama saja
  return idVoices[0] || null
}

function primeSpeechSynthesis() {
  const synth = getSpeechSynth()
  if (!synth || speechPrimed) return
  try {
    const utterance = new SpeechSynthesisUtterance(' ')
    utterance.lang = 'id-ID'
    utterance.volume = 0.01
    utterance.rate = 1
    utterance.pitch = 1
    const idVoice = pickBestVoice(synth)
    if (idVoice) utterance.voice = idVoice
    synth.speak(utterance)
    speechPrimed = true
  } catch {
    // TTS prime gagal: abaikan, akan dicoba lagi saat notifikasi sukses.
  }
}

function speakClear(text: string) {
  const synth = getSpeechSynth()
  if (!synth) return
  try {
    // Langsung bicara tanpa delay dan tanpa menunggu beep. Cancel hanya untuk
    // menghentikan prime/ucapan sebelumnya agar scan beruntun tidak antre panjang.
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'id-ID'
    utterance.volume = 1
    utterance.rate = 0.86
    utterance.pitch = 0.92
    const idVoice = pickBestVoice(synth)
    if (idVoice) utterance.voice = idVoice
    synth.speak(utterance)
  } catch {
    // TTS tidak didukung / diblokir: absensi tetap tersimpan.
  }
}

export function announceAttendanceSuccess(name: string | undefined | null, session: AttendanceSession) {
  const nickname = firstName(name) || 'Berhasil'
  speakClear(`${nickname} ${session}`)
}

export function announceStudentScanSuccess(name: string | undefined | null, session: AttendanceSession, already?: boolean) {
  if (already) return playFeedbackSound('duplicate')
  announceAttendanceSuccess(name, session)
}
