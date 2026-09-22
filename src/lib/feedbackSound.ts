// Umpan balik suara untuk aksi absensi (ceklok GTK dan scan QR siswa).
//
// Memakai WebAudio oscillator untuk beep, bukan file audio: bundle tidak
// bertambah, tetap berbunyi saat PWA offline, dan tidak perlu aset tambahan
// di dist/. Semua kegagalan (browser lama, autoplay diblokir, izin audio)
// ditelan diam-diam karena suara hanyalah pelengkap; alur absensi tidak
// boleh ikut gagal.
import api from '../services/api'

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
  const name = (v: SpeechSynthesisVoice) => v.name.toLowerCase()
  const isId = (v: SpeechSynthesisVoice) => /^id[-_]/i.test(v.lang) || /indonesia/i.test(v.name)
  // Voice "Natural"/"Online"/"Neural" (mis. Microsoft Edge neural voices) memakai
  // model neural TTS modern — jauh lebih manusiawi dibanding voice legacy berbasis
  // formant synthesis (espeak/SAPI4/robotic). Diprioritaskan bila tersedia.
  const isNatural = (v: SpeechSynthesisVoice) => /natural|online|neural/i.test(name(v))
  // Nama voice pria yang benar-benar terverifikasi male di browser umum. HATI-HATI:
  // "Google US English" BUKAN voice pria (itu voice wanita default Chrome) — jangan
  // dijadikan fallback male seperti sebelumnya, itu salah dan bikin suara wanita
  // terdengar dipakaikan label "male-first".
  const isVerifiedMale = (v: SpeechSynthesisVoice) =>
    /\bmale\b|\bpria\b|laki[- ]?laki|\bman\b|\bpria\b/i.test(name(v)) ||
    /google uk english male|microsoft david|microsoft andika|microsoft ardi|microsoft rizwan|microsoft farrell|microsoft ryan|microsoft guy|microsoft brian|microsoft christopher|microsoft eric/i.test(name(v))

  const idVoices = voices.filter(isId)

  // Prioritas MALE-first + neural-first (suara lebih manusiawi/enak didengar):
  // 1) male Indonesia natural/neural
  // 2) male Indonesia (non-neural)
  // 3) male natural/neural bahasa lain (Inggris dsb, tetap jelas & manusiawi)
  // 4) male verified lain
  // 5) female Indonesia (fallback terakhir bila memang tak ada voice pria sama sekali)

  const maleIdNatural = idVoices.find(v => isVerifiedMale(v) && isNatural(v))
  if (maleIdNatural) return maleIdNatural

  const maleId = idVoices.find(isVerifiedMale)
  if (maleId) return maleId

  const maleNaturalAny = voices.find(v => isVerifiedMale(v) && isNatural(v))
  if (maleNaturalAny) return maleNaturalAny

  const maleAny = voices.find(isVerifiedMale)
  if (maleAny) return maleAny

  // (d) voice Indonesia apa pun (natural/neural diprioritaskan bila ada beberapa), fallback bisa female
  const idNatural = idVoices.find(isNatural)
  if (idNatural) return idNatural
  if (idVoices[0]) return idVoices[0]

  // (e) Google Bahasa Indonesia kalau ada (voice id paling natural)
  const googleId = idVoices.find(v => /google/i.test(name(v)) && /bahasa|indonesia/i.test(name(v)))
  if (googleId) return googleId

  return null
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

// Cache in-memory audio Gemini TTS yang sudah pernah diputar di sesi ini,
// supaya nama yang sama berulang (scan pagi lalu pulang) tidak perlu
// request ulang ke server dalam sesi browser yang sama.
const geminiAudioCache = new Map<string, HTMLAudioElement>()
// Kalau server pernah menjawab tenant belum konfigurasi API key Gemini sama
// sekali (bukan sekadar cache-miss), jangan coba lagi di sesi ini.
let geminiTtsUnavailable = false

/**
 * Coba TTS server-side (Gemini, voice pria natural, id-ID) lebih dulu.
 * Endpoint server HANYA mengecek cache (instan, tidak pernah menunggu
 * Gemini generate — diukur nyata Gemini butuh 3-14 detik, jauh terlalu
 * lambat untuk jalur scan langsung). Kalau cache belum ada, server balas
 * 404 SEKARANG JUGA dan mulai generate di background untuk scan berikutnya
 * dengan nama yang sama — jadi fallback ke Web Speech API di sini SELALU
 * instan, tidak ada delay tunggu network Gemini.
 */
async function speakViaGeminiOrFallback(text: string) {
  if (geminiTtsUnavailable) return speakClear(text)
  const cached = geminiAudioCache.get(text)
  if (cached) {
    try {
      cached.currentTime = 0
      await cached.play()
      return
    } catch {
      // lanjut ke fallback di bawah
    }
  }
  try {
    // Jalur scan harus terasa instan. Server hanya cek cache di disk; jika
    // network lambat, fallback browser langsung mengambil alih tanpa jeda lama.
    const res = await api.post('/tts/announce', { text }, { timeout: 800 })
    const audioUrl = res.data?.audioUrl
    if (!audioUrl) throw new Error('no audio url')
    const audio = new Audio(audioUrl)
    geminiAudioCache.set(text, audio)
    await audio.play()
  } catch (err: any) {
    // Cache miss berarti audio pria sedang dibuat di server. Jangan menggantinya
    // dengan Web Speech Bahasa Indonesia yang pada Chrome/Android umumnya female;
    // beep sukses tetap sudah dimainkan oleh alur scan dan scan berikutnya akan
    // memakai cache pria yang selesai dibuat.
    if (err?.response?.status === 404 && err.response?.data?.generating) return

    // Untuk tenant tanpa konfigurasi Gemini atau kegagalan jaringan/audio lain,
    // pertahankan fallback best-effort agar notifikasi tetap terdengar.
    if (err?.response?.status === 404) geminiTtsUnavailable = true
    speakClear(text)
  }
}

export function announceAttendanceSuccess(name: string | undefined | null, session: AttendanceSession) {
  const nickname = firstName(name) || 'Berhasil'
  void speakViaGeminiOrFallback(`${nickname} ${session}`)

}

export function announceStudentScanSuccess(name: string | undefined | null, session: AttendanceSession, already?: boolean) {
  if (already) return playFeedbackSound('duplicate')
  announceAttendanceSuccess(name, session)
}
