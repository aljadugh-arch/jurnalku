import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Clock, BookOpen, Play, Lock, Monitor, ChevronLeft, ChevronRight,
  CheckCircle, AlertTriangle, Eye, EyeOff, Send, Shield, Grid3X3,
  List, Trophy, FileText
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import Modal from '../../components/ui/Modal'

/* ─── Types ─── */
interface UjianAktif {
  id: string; nama: string; mapel: string; jenis: string; model: string
  durasi_menit: number; status: 'belum' | 'mengerjakan' | 'selesai'
  mulai: string; selesai: string; jumlah_soal: number; password_required: boolean
  tampil_nilai: boolean; tampil_pembahasan: boolean
}

interface Soal {
  id: string; no: number; tipe: 'pg' | 'pg_kompleks' | 'isian' | 'uraian'
  soal: string; opsi: string[]
  skor: number
}

interface UjianSession {
  id: string; nama: string; mapel: string; model: string
  durasi_menit: number; sisa_detik: number
  soal: Soal[]; jawaban: Record<string, string | string[]>
  tampil_nilai: boolean; tampil_pembahasan: boolean
}

interface HasilUjian {
  nilai: number; benar: number; salah: number; kosong: number; total_soal: number
  tampil_nilai: boolean; tampil_pembahasan: boolean
  review?: { no: number; soal: string; tipe: string; opsi: string[]; jawaban: string | string[]; kunci: string | string[]; benar: boolean; pembahasan: string }[]
}

const OPSI_LABELS = ['A', 'B', 'C', 'D', 'E']

const statusBadge = (s: string) => {
  switch (s) {
    case 'belum': return 'bg-gray-100 text-gray-600'
    case 'mengerjakan': return 'bg-yellow-100 text-yellow-700'
    case 'selesai': return 'bg-green-100 text-green-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

const statusLabel = (s: string) => {
  switch (s) {
    case 'belum': return 'Belum Dikerjakan'
    case 'mengerjakan': return 'Sedang Mengerjakan'
    case 'selesai': return 'Selesai'
    default: return s
  }
}

const modelBadge = (m: string) => {
  switch (m) {
    case 'cetak': return 'bg-yellow-100 text-yellow-700'
    case 'online': return 'bg-purple-100 text-purple-700'
    case 'cbt': return 'bg-red-100 text-red-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

type ViewMode = 'list' | 'ujian' | 'hasil'

export default function SiswaUjianPage() {
  const [ujianList, setUjianList] = useState<UjianAktif[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  // Password modal
  const [showPassword, setShowPassword] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [startingId, setStartingId] = useState<string | null>(null)

  // Ujian state
  const [session, setSession] = useState<UjianSession | null>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [timeLeft, setTimeLeft] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Confirm submit
  const [showConfirm, setShowConfirm] = useState(false)

  // Hasil
  const [hasil, setHasil] = useState<HasilUjian | null>(null)
  const [currentUjianId, setCurrentUjianId] = useState<string | null>(null)

  // CBT mode
  const [tabWarning, setTabWarning] = useState(0)

  const fetchUjian = useCallback(async () => {
    try {
      const res = await api.get('/ujian/aktif')
      setUjianList(Array.isArray(res.data) ? res.data : res.data.data || [])
    } catch { toast.error('Gagal memuat daftar ujian') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchUjian() }, [fetchUjian])

  // Timer
  useEffect(() => {
    if (viewMode !== 'ujian' || !session) return
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          handleSubmit(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [viewMode, session])

  // CBT mode effects
  useEffect(() => {
    if (viewMode !== 'ujian' || session?.model !== 'cbt') return

    const handleVisibility = () => {
      if (document.hidden) {
        setTabWarning(prev => {
          const next = prev + 1
          toast.error(`Peringatan! Anda meninggalkan halaman ujian (${next}x)`, { icon: '⚠️' })
          return next
        })
      }
    }

    const handleContextMenu = (e: MouseEvent) => { e.preventDefault() }

    const requestFullscreen = () => {
      const el = document.documentElement
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {})
    }

    document.addEventListener('visibilitychange', handleVisibility)
    document.addEventListener('contextmenu', handleContextMenu)
    requestFullscreen()

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      document.removeEventListener('contextmenu', handleContextMenu)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [viewMode, session?.model])

  const startUjian = async (id: string, password?: string) => {
    try {
      const res = await api.post(`/ujian/${id}/mulai`, password ? { password } : {})
      const data = res.data
      setSession(data)
      setAnswers(data.jawaban || {})
      setTimeLeft(data.sisa_detik || data.durasi_menit * 60)
      setCurrentIdx(0)
      setShowAll(false)
      setTabWarning(0)
      setCurrentUjianId(id)
      setViewMode('ujian')
      setShowPassword(false)
      setPasswordInput('')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memulai ujian')
    }
  }

  const handleStartClick = (ujian: UjianAktif) => {
    if (ujian.status === 'selesai') {
      openHasil(ujian.id)
      return
    }
    if (ujian.password_required && ujian.status === 'belum') {
      setStartingId(ujian.id)
      setPasswordInput('')
      setShowPassword(true)
    } else {
      startUjian(ujian.id)
    }
  }

  const handlePasswordSubmit = () => {
    if (!startingId) return
    startUjian(startingId, passwordInput)
  }

  // Answer handlers with debounced save
  const saveAnswer = useCallback((soalId: string, jawaban: string | string[]) => {
    if (!currentUjianId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        await api.post(`/ujian/${currentUjianId}/jawab`, { soal_id: soalId, jawaban })
      } catch { /* silent - will retry on next change */ }
    }, 800)
  }, [currentUjianId])

  const setAnswer = (soalId: string, value: string | string[]) => {
    setAnswers(prev => ({ ...prev, [soalId]: value }))
    saveAnswer(soalId, value)
  }

  const handleSubmit = async (auto = false) => {
    if (!currentUjianId) return
    if (!auto) setShowConfirm(false)
    try {
      await api.post(`/ujian/${currentUjianId}/selesai`)
      if (timerRef.current) clearInterval(timerRef.current)
      toast.success(auto ? 'Waktu habis! Ujian otomatis diselesaikan' : 'Ujian berhasil diselesaikan')
      openHasil(currentUjianId)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyelesaikan ujian')
    }
  }

  const openHasil = async (id: string) => {
    try {
      const res = await api.get(`/ujian/${id}/hasil`)
      setHasil(res.data)
      setCurrentUjianId(id)
      setSession(null)
      setViewMode('hasil')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memuat hasil')
    }
  }

  const backToList = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setViewMode('list')
    setSession(null)
    setHasil(null)
    setCurrentUjianId(null)
    fetchUjian()
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const answeredCount = session ? session.soal.filter(s => {
    const a = answers[s.id]
    return a && (Array.isArray(a) ? a.length > 0 : a.trim() !== '')
  }).length : 0

  /* ─── Ujian View ─── */
  if (viewMode === 'ujian' && session) {
    const soal = session.soal[currentIdx]

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm px-4 py-3">
          <div className="flex items-center justify-between max-w-5xl mx-auto">
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-gray-800 text-sm truncate">{session.nama}</h2>
              <p className="text-xs text-gray-400">{session.mapel}</p>
            </div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-mono text-sm font-bold ${timeLeft <= 300 ? 'bg-red-100 text-red-600 animate-pulse' : timeLeft <= 600 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>
              <Clock size={16} /> {formatTime(timeLeft)}
            </div>
            <div className="flex items-center gap-2 ml-3">
              <button onClick={() => setShowAll(!showAll)} className="p-2 hover:bg-gray-100 rounded-lg" title={showAll ? 'Satu per satu' : 'Tampilkan semua'}>
                {showAll ? <List size={18} /> : <Grid3X3 size={18} />}
              </button>
              <button onClick={() => setShowConfirm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
                <Send size={14} /> Selesai
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto flex gap-4 p-4">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {showAll ? (
              /* All questions view */
              <div className="space-y-4">
                {session.soal.map((s, i) => (
                  <div key={s.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                    <SoalRenderer soal={s} no={i + 1} answer={answers[s.id]} onAnswer={(v) => setAnswer(s.id, v)} />
                  </div>
                ))}
              </div>
            ) : (
              /* Single question view */
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                {soal && <SoalRenderer soal={soal} no={currentIdx + 1} answer={answers[soal.id]} onAnswer={(v) => setAnswer(soal.id, v)} />}
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                    disabled={currentIdx === 0}
                    className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm disabled:opacity-30 hover:bg-gray-50"
                  >
                    <ChevronLeft size={16} /> Sebelumnya
                  </button>
                  <span className="text-sm text-gray-400">{currentIdx + 1} / {session.soal.length}</span>
                  <button
                    onClick={() => setCurrentIdx(i => Math.min(session.soal.length - 1, i + 1))}
                    disabled={currentIdx === session.soal.length - 1}
                    className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm disabled:opacity-30 hover:bg-gray-50"
                  >
                    Selanjutnya <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Navigation panel */}
          <div className="w-56 shrink-0 hidden md:block">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sticky top-20">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-gray-500 uppercase">Navigasi</h3>
                <span className="text-xs text-gray-400">{answeredCount}/{session.soal.length}</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {session.soal.map((s, i) => {
                  const a = answers[s.id]
                  const answered = a && (Array.isArray(a) ? a.length > 0 : a.trim() !== '')
                  return (
                    <button
                      key={s.id}
                      onClick={() => { setCurrentIdx(i); setShowAll(false) }}
                      className={`w-8 h-8 rounded-lg text-xs font-medium flex items-center justify-center transition-colors ${
                        currentIdx === i && !showAll
                          ? 'bg-primary text-white ring-2 ring-primary/30'
                          : answered
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {i + 1}
                    </button>
                  )
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100 space-y-1.5 text-xs text-gray-500">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-green-100" /> Sudah dijawab</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-gray-100" /> Belum dijawab</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-primary" /> Sedang dilihat</div>
              </div>
              {session.model === 'cbt' && tabWarning > 0 && (
                <div className="mt-3 p-2 bg-red-50 rounded-lg text-xs text-red-600 flex items-center gap-1.5">
                  <AlertTriangle size={12} /> {tabWarning}x peringatan tab
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Confirm submit modal */}
        <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Selesaikan Ujian?" maxWidth="md:max-w-sm"
          footer={
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Kembali</button>
              <button onClick={() => handleSubmit(false)} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">Ya, Selesaikan</button>
            </div>
          }
        >
          <div className="text-center py-2">
            <div className="w-16 h-16 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} className="text-yellow-500" />
            </div>
            <p className="text-sm text-gray-600 mb-2">Anda yakin ingin menyelesaikan ujian ini?</p>
            <p className="text-sm">
              <span className="font-medium text-green-600">{answeredCount} dijawab</span>
              {' · '}
              <span className="font-medium text-gray-400">{session.soal.length - answeredCount} belum dijawab</span>
            </p>
            <p className="text-xs text-gray-400 mt-2">Jawaban yang sudah dikumpulkan tidak dapat diubah.</p>
          </div>
        </Modal>
      </div>
    )
  }

  /* ─── Hasil View ─── */
  if (viewMode === 'hasil' && hasil) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={backToList} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
          <h1 className="text-xl font-bold text-gray-800 flex-1">Hasil Ujian</h1>
        </div>

        {hasil.tampil_nilai ? (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trophy size={40} className="text-primary" />
              </div>
              <p className="text-5xl font-bold text-gray-800 mb-2">{hasil.nilai}</p>
              <p className="text-sm text-gray-500 mb-4">Nilai Anda</p>
              <div className="flex justify-center gap-6 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{hasil.benar}</p>
                  <p className="text-xs text-gray-400">Benar</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-500">{hasil.salah}</p>
                  <p className="text-xs text-gray-400">Salah</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-400">{hasil.kosong}</p>
                  <p className="text-xs text-gray-400">Kosong</p>
                </div>
              </div>
            </div>

            {/* Review */}
            {hasil.tampil_pembahasan && hasil.review && hasil.review.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-gray-800">Pembahasan</h2>
                {hasil.review.map((r, i) => (
                  <div key={i} className={`bg-white rounded-xl shadow-sm border p-5 ${r.benar ? 'border-green-200' : 'border-red-200'}`}>
                    <div className="flex items-start gap-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${r.benar ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {r.no || i + 1}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm text-gray-800 mb-2">{r.soal}</p>
                        {(r.tipe === 'pg' || r.tipe === 'pg_kompleks') && r.opsi?.map((o, j) => {
                          const label = OPSI_LABELS[j]
                          const isKunci = Array.isArray(r.kunci) ? r.kunci.includes(label) : r.kunci === label
                          const isJawaban = Array.isArray(r.jawaban) ? r.jawaban.includes(label) : r.jawaban === label
                          return (
                            <div key={j} className={`flex gap-2 text-sm mb-1 px-2 py-1 rounded ${isKunci ? 'bg-green-50 text-green-700 font-medium' : ''} ${isJawaban && !isKunci ? 'bg-red-50 text-red-600 line-through' : ''}`}>
                              <span className="w-5 font-medium">{label}.</span>
                              <span>{o}</span>
                              {isKunci && <CheckCircle size={14} className="text-green-500 ml-auto" />}
                            </div>
                          )
                        })}
                        {(r.tipe === 'isian' || r.tipe === 'uraian') && (
                          <div className="mt-2 space-y-2">
                            <div className="bg-blue-50 rounded-lg p-3 text-sm">
                              <span className="text-xs text-blue-500 font-medium">Jawaban Anda:</span>
                              <p className="text-blue-800 mt-1">{(r.jawaban as string) || <em className="text-gray-400">Tidak dijawab</em>}</p>
                            </div>
                            <div className="bg-green-50 rounded-lg p-3 text-sm">
                              <span className="text-xs text-green-500 font-medium">Kunci Jawaban:</span>
                              <p className="text-green-800 mt-1">{r.kunci as string}</p>
                            </div>
                          </div>
                        )}
                        {r.pembahasan && (
                          <div className="mt-2 bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                            <span className="text-xs text-gray-400 font-medium">Pembahasan:</span>
                            <p className="mt-1">{r.pembahasan}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-500" />
            </div>
            <p className="text-lg font-bold text-gray-800 mb-2">Ujian Selesai</p>
            <p className="text-sm text-gray-500">Jawaban Anda telah dikumpulkan. Nilai akan diumumkan oleh guru.</p>
          </div>
        )}
      </div>
    )
  }

  /* ─── List View ─── */
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Ujian</h1>
        <p className="text-gray-500 text-sm mt-1">Daftar ujian aktif</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? (
          <p className="text-gray-400 col-span-3 text-center py-8">Memuat...</p>
        ) : ujianList.length === 0 ? (
          <div className="col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText size={32} className="text-blue-400" />
            </div>
            <p className="text-gray-500 text-sm">Tidak ada ujian aktif saat ini</p>
          </div>
        ) : ujianList.map(u => (
          <div key={u.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(u.status)}`}>
                  {statusLabel(u.status)}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${modelBadge(u.model)}`}>
                  {u.model?.toUpperCase()}
                </span>
              </div>
              {u.password_required && u.status === 'belum' && <Lock size={14} className="text-gray-400" />}
            </div>
            <h3 className="font-bold text-gray-800 mb-1">{u.nama}</h3>
            <div className="space-y-1 text-xs text-gray-400 mb-4">
              <div className="flex items-center gap-1.5"><BookOpen size={12} /> {u.mapel}</div>
              <div className="flex items-center gap-1.5"><Clock size={12} /> {u.durasi_menit} menit · {u.jumlah_soal} soal</div>
              {u.mulai && (
                <div className="flex items-center gap-1.5">
                  <Play size={12} />
                  {new Date(u.mulai).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
            <button
              onClick={() => handleStartClick(u)}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                u.status === 'selesai'
                  ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                  : u.status === 'mengerjakan'
                    ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                    : 'bg-primary text-white hover:bg-primary-dark'
              }`}
            >
              {u.status === 'selesai' ? (
                <><Eye size={16} /> Lihat Hasil</>
              ) : u.status === 'mengerjakan' ? (
                <><Play size={16} /> Lanjutkan</>
              ) : (
                <><Play size={16} /> Mulai Ujian</>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Password Modal */}
      <Modal open={showPassword} onClose={() => setShowPassword(false)} title="Masukkan Password Ujian" maxWidth="md:max-w-sm"
        footer={
          <div className="flex gap-3">
            <button onClick={() => setShowPassword(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
            <button onClick={handlePasswordSubmit} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">Mulai</button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
            <Shield size={24} className="text-primary" />
          </div>
          <p className="text-sm text-gray-500 text-center mb-3">Ujian ini memerlukan password dari guru</p>
          <div className="relative">
            <input
              type={passwordVisible ? 'text' : 'password'}
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
              placeholder="Password ujian"
              className="w-full px-3 py-2 border rounded-lg text-sm pr-10"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setPasswordVisible(!passwordVisible)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/* ─── SoalRenderer component ─── */
function SoalRenderer({ soal, no, answer, onAnswer }: { soal: Soal; no: number; answer?: string | string[]; onAnswer: (v: string | string[]) => void }) {
  return (
    <div>
      <div className="flex items-start gap-3 mb-4">
        <span className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-bold text-primary shrink-0">{no}</span>
        <p className="text-sm text-gray-800 pt-1">{soal.soal}</p>
      </div>

      {soal.tipe === 'pg' && (
        <div className="space-y-2 ml-11">
          {soal.opsi?.map((o, i) => {
            const label = OPSI_LABELS[i]
            const selected = answer === label
            return (
              <label
                key={i}
                className={`flex items-center gap-3 px-4 py-3 border rounded-xl cursor-pointer transition-all ${selected ? 'border-primary bg-primary/5 shadow-sm' : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${selected ? 'border-primary' : 'border-gray-300'}`}>
                  {selected && <div className="w-3 h-3 rounded-full bg-primary" />}
                </div>
                <span className="font-medium text-gray-600 w-5">{label}.</span>
                <span className="text-sm text-gray-700">{o}</span>
              </label>
            )
          })}
        </div>
      )}

      {soal.tipe === 'pg_kompleks' && (
        <div className="space-y-2 ml-11">
          <p className="text-xs text-gray-400 mb-1 italic">Pilih lebih dari satu jawaban yang benar</p>
          {soal.opsi?.map((o, i) => {
            const label = OPSI_LABELS[i]
            const arr = Array.isArray(answer) ? answer : []
            const checked = arr.includes(label)
            return (
              <label
                key={i}
                className={`flex items-center gap-3 px-4 py-3 border rounded-xl cursor-pointer transition-all ${checked ? 'border-primary bg-primary/5 shadow-sm' : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const newArr = checked ? arr.filter(a => a !== label) : [...arr, label]
                    onAnswer(newArr)
                  }}
                  className="accent-primary"
                />
                <span className="font-medium text-gray-600 w-5">{label}.</span>
                <span className="text-sm text-gray-700">{o}</span>
              </label>
            )
          })}
        </div>
      )}

      {soal.tipe === 'isian' && (
        <div className="ml-11">
          <input
            value={(answer as string) || ''}
            onChange={e => onAnswer(e.target.value)}
            placeholder="Ketik jawaban singkat..."
            className="w-full px-4 py-3 border rounded-xl text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none"
          />
        </div>
      )}

      {soal.tipe === 'uraian' && (
        <div className="ml-11">
          <textarea
            value={(answer as string) || ''}
            onChange={e => onAnswer(e.target.value)}
            rows={5}
            placeholder="Tulis jawaban uraian..."
            className="w-full px-4 py-3 border rounded-xl text-sm resize-y focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none"
          />
        </div>
      )}
    </div>
  )
}
