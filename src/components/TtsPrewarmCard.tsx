import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Volume2, RefreshCw } from 'lucide-react'
import api from '../services/api'

// Kartu Pengaturan: pre-warm cache TTS Gemini (voice pria natural) untuk
// semua nama panggilan siswa + GTK aktif di lembaga ini.
//
// KENAPA INI PERLU ADA: Gemini TTS API diukur nyata butuh 3-14 detik per
// generate — terlalu lambat untuk dipanggil langsung saat scan absensi.
// Sistem generate audio DI BACKGROUND saat nama belum ada di cache (scan
// pertama tetap dapat suara lama/female sebagai fallback instan), lalu scan
// BERIKUTNYA untuk nama yang sama baru dapat suara pria dari cache.
//
// Supaya tidak ada delay/fallback sama sekali SAAT jam absensi berlangsung,
// jalankan pre-warm ini SEBELUM jam masuk sekolah (mis. malam sebelumnya
// atau pagi sebelum siswa datang) — sistem akan generate cache utk semua
// nama sekaligus di background server, tidak memblokir apa pun.
export default function TtsPrewarmCard() {
  const [status, setStatus] = useState<{ total: number; cached: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [available, setAvailable] = useState(true)
  const [jobId, setJobId] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      if (jobId) {
        const res = await api.get('/tts/prewarm/status', { params: { jobId } })
        const job = res.data as { status: string; total: number; done: number; failed: number; processed?: number; retrying?: number }
        // Progress adalah jumlah item yang sudah diproses, bukan hanya sukses.
        // Dengan begitu UI tidak macet ketika sebagian nama gagal permanen.
        setStatus({ total: job.total, cached: job.processed ?? (job.done + job.failed) })
        if (job.status !== 'running') {
          setRunning(false)
          setJobId(null)
          if (job.failed > 0) toast.error(`${job.failed} audio gagal dibuat. Silakan coba lagi.`)
          else toast.success('Semua audio TTS pria selesai dibuat')
        }
      } else {
        const res = await api.get('/tts/prewarm/status')
        setStatus(res.data)
      }
      setAvailable(true)
    } catch (err: any) {
      if (err?.response?.status === 404) setAvailable(false)
      if (jobId) {
        setRunning(false)
        setJobId(null)
        toast.error('Status proses TTS tidak tersedia. Silakan mulai ulang.')
      }
    }
  }, [jobId])

  useEffect(() => { loadStatus() }, [loadStatus])

  const handlePrewarm = async () => {
    setLoading(true)
    try {
      const res = await api.post('/tts/prewarm')
      const { total, alreadyCached, queued, jobId: newJobId } = res.data
      if (queued === 0) {
        toast.success(`Semua ${total} nama sudah tersimpan di cache suara pria`)
      } else {
        setStatus({ total: queued, cached: 0 })
        setJobId(newJobId || null)
        setRunning(true)
        toast.success(`Memproses ${queued} audio bertahap sesuai batas Google (${alreadyCached} sudah ada)`)
      }
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setAvailable(false)
        toast.error('Isi API key Gemini di Konfigurasi AI dulu sebelum pre-warm')
      } else {
        toast.error('Gagal memulai pre-warm TTS')
      }
    } finally {
      setLoading(false)
    }
  }

  // Poll job nyata; status failed/completed selalu menghentikan loading.
  useEffect(() => {
    if (!running || !jobId) return
    const interval = setInterval(loadStatus, 2000)
    return () => clearInterval(interval)
  }, [running, jobId, loadStatus])

  if (!available) return null

  const pct = status && status.total > 0 ? Math.round((status.cached / status.total) * 100) : 0

  return (
    <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-2">
        <Volume2 size={18} className="text-indigo-600" />
        <h3 className="font-semibold text-gray-800">Siapkan Suara TTS Absensi (Pria, Natural)</h3>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Gemini butuh beberapa detik untuk membuat suara tiap nama pertama kali dipakai — kalau belum siap, sistem otomatis pakai suara lama supaya absensi tidak tertunda.
        Tekan tombol ini SEBELUM jam masuk sekolah untuk menyiapkan suara pria semua siswa &amp; guru sekaligus di latar belakang, supaya saat jam absensi tiba semua nama sudah langsung terdengar suara pria.
      </p>
      {status && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{status.cached} dari {status.total} nama siap</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      <button
        onClick={handlePrewarm}
        disabled={loading || running}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
      >
        {(loading || running) && <RefreshCw size={14} className="animate-spin" />}
        {running ? 'Sedang menyiapkan...' : 'Siapkan Sekarang'}
      </button>
    </div>
  )
}
