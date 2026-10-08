import { useCallback, useEffect, useRef, useState } from 'react'
import { BellRing, Volume2, VolumeX, X } from 'lucide-react'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'

const WAKTU = ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'] as const
const LABEL: Record<string, string> = {
  subuh: 'Subuh', dzuhur: 'Dzuhur', ashar: 'Ashar', maghrib: 'Maghrib', isya: 'Isya',
}
// Peran yang mendengar adzan: staf sekolah. Siswa & wali murid tidak (bukan
// lingkungan kerja, dan akan mengganggu).
const PERAN_STAF = ['admin', 'super_admin', 'kepala', 'bendahara', 'operator', 'tata_usaha', 'tu', 'guru', 'wali_kelas']

const KUNCI_SIMPAN = 'jurnalku_adzan_dibunyikan'

function tanggalWib(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
}
function jamWib(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
}
function keMenit(jam?: string | null): number {
  if (!/^\d{2}:\d{2}$/.test(String(jam || ''))) return -1
  const [h, m] = String(jam).split(':').map(Number)
  return h * 60 + m
}
// Jendela pengumuman: adzan dibunyikan bila waktu sholat baru saja masuk.
// 10 menit ke depan cukup longgar untuk tab yang sempat di-throttle peramban,
// tapi cukup rapat supaya jadwal yang sudah lewat lama (mis. Subuh saat app
// dibuka siang) TIDAK ikut dibunyikan.
const JENDELA_MENIT = 10

function bacaSudah(): Set<string> {
  try {
    const mentah = JSON.parse(localStorage.getItem(KUNCI_SIMPAN) || '{}')
    return new Set(Array.isArray(mentah?.kunci) ? mentah.kunci : [])
  } catch { return new Set() }
}
function simpanSudah(set: Set<string>) {
  try { localStorage.setItem(KUNCI_SIMPAN, JSON.stringify({ kunci: [...set].slice(-40) })) } catch { /* abaikan */ }
}

/**
 * Membunyikan adzan saat masuk waktu sholat (jadwal dari koordinat lembaga).
 * Hanya untuk peran staf, dan hanya bila admin mengaktifkan
 * Pengaturan > Notifikasi > Adzan (beserta opsi suaranya).
 */
export default function AdzanNotifier() {
  const user = useAuthStore(s => s.user)
  const [jadwal, setJadwal] = useState<any>(null)
  const [conf, setConf] = useState<any>(null)
  const [bunyi, setBunyi] = useState<{ waktu: string; jam: string } | null>(null)
  const [terkunci, setTerkunci] = useState(false)
  const [matikan, setMatikan] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const tanggalRef = useRef<string>(tanggalWib())

  const staf = PERAN_STAF.includes(String(user?.role || ''))

  /* ── muat pengaturan & jadwal ── */
  useEffect(() => {
    if (!staf) return
    const muatConf = () => api.get('/notif-settings').then(r => setConf(r.data || {})).catch(() => {})
    const muatJadwal = () => api.get('/jadwal-sholat').then(r => setJadwal(r.data || null)).catch(() => {})
    muatConf(); muatJadwal()
    const t1 = setInterval(muatConf, 5 * 60 * 1000)
    const t2 = setInterval(muatJadwal, 30 * 60 * 1000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [staf])

  /* ── buka kunci audio pada gestur pertama ──
     Peramban menolak audio yang diputar tanpa interaksi pengguna. Gestur
     pertama (klik/sentuh/tombol) dipakai untuk memanaskan elemen audio dengan
     putaran singkat tanpa suara, sehingga pemutaran otomatis nanti diizinkan. */
  useEffect(() => {
    if (!staf) return
    let lepas = false
    const bersihkan = () => {
      window.removeEventListener('pointerdown', buka)
      window.removeEventListener('keydown', buka)
    }
    // JANGAN pakai { once: true }: gestur pertama sering terjadi sebelum elemen
    // audio terpasang / sebelum pengaturan termuat. Dulu listener terpakai pada
    // panggilan yang gagal itu lalu hilang — sesudahnya peramban memblokir
    // autoplay untuk selamanya dan adzan tidak pernah berbunyi sendiri.
    const buka = () => {
      if (lepas) return
      const a = audioRef.current
      if (!a) return
      try {
        a.muted = true
        const p = a.play()
        if (p && typeof p.then === 'function') {
          p.then(() => {
            a.pause(); a.currentTime = 0; a.muted = false
            lepas = true; setTerkunci(false); bersihkan()
          }).catch(() => { a.muted = false; setTerkunci(true) })
        } else { a.muted = false; lepas = true; setTerkunci(false); bersihkan() }
      } catch { try { a.muted = false } catch { /* abaikan */ } }
    }
    window.addEventListener('pointerdown', buka)
    window.addEventListener('keydown', buka)
    return bersihkan
  }, [staf])

  const bunyikan = useCallback(async (waktu: string, jam: string) => {
    setBunyi({ waktu, jam })
    setMatikan(false)
    const a = audioRef.current
    if (!a) return
    try {
      a.currentTime = 0
      await a.play()
      setTerkunci(false)
    } catch {
      // Autoplay diblokir: tampilkan panel dengan tombol putar manual.
      setTerkunci(true)
    }
  }, [])

  /* ── pemeriksa waktu tiap 20 detik ── */
  useEffect(() => {
    if (!staf || !jadwal || !conf) return
    // Gerbang kanal SUARA saja — terpisah dari notif WA. `adzan_wa` (kanal WA)
    // tidak lagi mengunci suara. Baris lama tanpa `adzan_wa` (belum pernah disimpan
    // sejak kanal dipisah) jatuh kembali ke `notif_adzan` = perilaku lama.
    const suaraAktif = conf.adzan_wa == null ? !!conf.notif_adzan : !!Number(conf.adzan_suara)
    if (!suaraAktif) return

    const dipilih = String(conf.adzan_waktu || '').split(',').map(s => s.trim().toLowerCase()).filter(k => (WAKTU as readonly string[]).includes(k))
    const aktif = dipilih.length ? dipilih : [...WAKTU]

    const periksa = () => {
      const hariIni = tanggalWib()
      // Ganti hari: jadwal perlu dimuat ulang agar waktu hari baru dipakai.
      if (hariIni !== tanggalRef.current) {
        tanggalRef.current = hariIni
        api.get('/jadwal-sholat').then(r => setJadwal(r.data || null)).catch(() => {})
        return
      }
      const sekarang = keMenit(jamWib())
      const sudah = bacaSudah()
      for (const waktu of aktif) {
        const jam = jadwal[waktu]
        const target = keMenit(jam)
        if (target < 0 || sekarang < 0) continue
        const selisih = sekarang - target
        if (selisih < 0 || selisih > JENDELA_MENIT) continue
        const kunci = `${hariIni}|${waktu}`
        if (sudah.has(kunci)) continue
        sudah.add(kunci)
        simpanSudah(sudah)
        void bunyikan(waktu, String(jam))
        return // satu adzan per pemeriksaan
      }
    }

    periksa()
    const t = setInterval(periksa, 20000)
    return () => clearInterval(t)
  }, [staf, jadwal, conf, bunyikan])

  if (!staf) return null

  const sumber = String(conf?.adzan_suara_url || '').trim() || '/adhan.mp3'
  const berbunyi = !!(bunyi && !matikan)

  return (
    <>
      {/* Elemen audio SELALU terpasang untuk staf — termasuk selagi fitur belum
          dinyalakan — supaya bisa "dipanaskan" pada gestur pertama dan siap
          diputar otomatis saat waktunya tiba. */}
      <audio ref={audioRef} src={sumber} preload="auto" data-adzan-audio="true" />

      {berbunyi && (
        <div
          data-adzan-panel="true"
          className="fixed inset-x-3 bottom-20 z-[120] mx-auto max-w-md rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xl dark:border-emerald-800 dark:bg-gray-900 sm:bottom-6"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <BellRing size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-bold text-slate-900 dark:text-white">
                Waktu {LABEL[bunyi.waktu] || bunyi.waktu} telah masuk
              </p>
              <p className="mt-0.5 break-words text-[11px] text-slate-500 dark:text-gray-400">
                {jadwal?.kota ? `${jadwal.kota} · ` : ''}pukul {bunyi.jam} WIB
              </p>
              {terkunci && (
                <p className="mt-1 break-words text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  Peramban memblokir suara otomatis. Tekan tombol untuk memutar adzan.
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-adzan-putar="true"
                  onClick={() => { const a = audioRef.current; if (!a) return; a.currentTime = 0; void a.play().then(() => setTerkunci(false)).catch(() => setTerkunci(true)) }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white ${terkunci ? 'bg-amber-600' : 'bg-emerald-600'}`}
                >
                  {terkunci ? <Volume2 size={13} /> : <Volume2 size={13} />} Putar adzan
                </button>
                <button
                  type="button"
                  data-adzan-hentikan="true"
                  onClick={() => { const a = audioRef.current; if (a) { a.pause(); a.currentTime = 0 } setMatikan(true) }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 dark:bg-gray-700 dark:text-gray-200"
                >
                  <VolumeX size={13} /> Hentikan
                </button>
              </div>
            </div>
            <button
              type="button"
              aria-label="Tutup pemberitahuan adzan"
              onClick={() => { const a = audioRef.current; if (a) { a.pause(); a.currentTime = 0 } setBunyi(null) }}
              className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-800"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
