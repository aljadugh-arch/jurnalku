import { useEffect, useMemo, useState } from 'react'
import {
  ClipboardCheck, Plus, Trash2, Upload, X, Save, Users, FileText,
  CheckCircle2, Clock, AlertTriangle, Link2, Eye, ChevronDown,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

// ============================================================================
// Penugasan Digital (LMS) — sisi guru.
//
// Guru membuat tugas (judul, deskripsi, deadline, lampiran, bobot nilai),
// lalu melihat rekap pengumpulan per siswa dan memberi nilai + feedback.
// Deadline lewat ditandai "terlambat" tapi tetap diterima.
// ============================================================================

type Tugas = {
  id: string
  judul: string
  deskripsi: string
  mapel_id: string | null
  rombel_id: string
  deadline: string | null
  file_path: string
  file_nama: string
  file_ukuran: number
  bobot: number
  mapel_nama: string | null
  rombel_nama: string | null
  jumlah_kumpul: number
  jumlah_siswa: number
  created_at: string
}

type Pengumpulan = {
  tugas: Tugas
  siswa: Array<{
    siswa_id: string
    nama: string
    nis: string
    status: 'dikumpulkan' | 'belum'
    terlambat: boolean
    submitted_at: string | null
    nilai: number | null
    catatan_guru: string
    dinilai_at: string | null
    pengumpulan_id: string | null
    file_nama: string
    file_path: string
    teks: string
  }>
  jumlah_kumpul: number
  jumlah_siswa: number
  jumlah_belum: number
  jumlah_terlambat: number
}

const fmtWaktu = (s?: string | null) => {
  if (!s) return '-'
  const d = new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function GuruTugasPage() {
  const [tugas, setTugas] = useState<Tugas[]>([])
  const [scope, setScope] = useState<{ mapel: any[]; rombel: any[] }>({ mapel: [], rombel: [] })
  const [memuat, setMemuat] = useState(true)
  const [buka, setBuka] = useState(false)
  const [rekap, setRekap] = useState<Pengumpulan | null>(null)
  const [nilaiModal, setNilaiModal] = useState<{ siswa_id: string; nama: string; pengumpulan_id: string; nilai: string; catatan_guru: string } | null>(null)
  const [form, setForm] = useState({ judul: '', deskripsi: '', rombel_id: '', mapel_id: '', deadline: '', bobot: '100' })
  const [file, setFile] = useState<File | null>(null)

  const muat = async () => {
    setMemuat(true)
    try {
      const [t, s] = await Promise.all([api.get('/guru/tugas'), api.get('/guru/tugas-scope')])
      setTugas(Array.isArray(t.data) ? t.data : [])
      setScope({ mapel: Array.isArray(s.data?.mapel) ? s.data.mapel : [], rombel: Array.isArray(s.data?.rombel) ? s.data.rombel : [] })
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal memuat tugas')
    } finally {
      setMemuat(false)
    }
  }

  useEffect(() => { muat() }, [])

  const bukaRekap = async (t: Tugas) => {
    try {
      const r = await api.get(`/guru/tugas/${t.id}/pengumpulan`)
      setRekap(r.data || null)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal memuat rekap')
    }
  }

  const simpan = async () => {
    if (!form.judul.trim()) return toast.error('Judul tugas wajib diisi')
    if (!form.rombel_id) return toast.error('Pilih rombel dulu')
    const fd = new FormData()
    fd.append('judul', form.judul.trim())
    fd.append('deskripsi', form.deskripsi || '')
    fd.append('rombel_id', form.rombel_id)
    fd.append('mapel_id', form.mapel_id || '')
    fd.append('deadline', form.deadline || '')
    fd.append('bobot', String(Number(form.bobot) || 100))
    if (file) fd.append('file', file)
    try {
      await api.post('/guru/tugas', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Tugas dibuat')
      setBuka(false); setFile(null)
      setForm({ judul: '', deskripsi: '', rombel_id: '', mapel_id: '', deadline: '', bobot: '100' })
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal membuat tugas')
    }
  }

  const hapus = async (t: Tugas) => {
    if (!confirm(`Hapus tugas "${t.judul}" beserta semua pengumpulan siswa?`)) return
    try {
      await api.delete(`/guru/tugas/${t.id}`)
      toast.success('Tugas dihapus')
      setRekap(null)
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menghapus')
    }
  }

  const simpanNilai = async () => {
    if (!nilaiModal) return
    const nilai = nilaiModal.nilai === '' ? null : Number(nilaiModal.nilai)
    try {
      await api.put(`/guru/pengumpulan/${nilaiModal.pengumpulan_id}/nilai`, { nilai, catatan_guru: nilaiModal.catatan_guru })
      toast.success('Nilai tersimpan')
      setNilaiModal(null)
      if (rekap) await bukaRekap(rekap.tugas)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan nilai')
    }
  }

  const rombelOptions = useMemo(() => scope.rombel, [scope])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-display font-bold text-gray-800 dark:text-gray-100">
            <ClipboardCheck size={22} className="text-primary" /> Penugasan
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Buat tugas, pantau pengumpulan, dan beri nilai.
          </p>
        </div>
        <button onClick={() => setBuka(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm text-white hover:bg-primary-dark">
          <Plus size={15} /> Buat tugas
        </button>
      </div>

      {memuat ? (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">Memuat…</div>
      ) : tugas.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">
          <ClipboardCheck size={42} className="mx-auto mb-3 opacity-60" />
          <p>Belum ada tugas. Buat tugas pertama untuk rombel yang Anda ampu.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tugas.map(t => (
            <div key={t.id} className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">{t.judul}</p>
                    {t.deadline && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                        <Clock size={11} /> {fmtWaktu(t.deadline)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t.mapel_nama || 'Tanpa mapel'} · {t.rombel_nama} · bobot {t.bobot}
                  </p>
                  {t.deskripsi && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{t.deskripsi}</p>}
                  <p className="mt-1 text-[11px] text-gray-400">
                    <Users size={11} className="inline" /> {t.jumlah_kumpul}/{t.jumlah_siswa} siswa mengumpulkan
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {t.file_path && (
                    <a href={t.file_path} target="_blank" rel="noreferrer" title={t.file_nama}
                      className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                      <FileText size={12} /> Lampiran
                    </a>
                  )}
                  <button onClick={() => bukaRekap(t)}
                    className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 dark:border-gray-700">
                    <Eye size={12} /> Rekap
                  </button>
                  <button onClick={() => hapus(t)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" title="Hapus">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal buat tugas */}
      {buka && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setBuka(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 dark:bg-gray-900" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-gray-800 dark:text-gray-100">Buat tugas</p>
              <button onClick={() => setBuka(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs text-gray-500">Judul *
                <input value={form.judul} onChange={e => setForm(f => ({ ...f, judul: e.target.value }))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" placeholder="Contoh: Latihan soal bab 3" />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs text-gray-500">Rombel *
                  <select value={form.rombel_id} onChange={e => setForm(f => ({ ...f, rombel_id: e.target.value }))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                    <option value="">-- Pilih --</option>
                    {rombelOptions.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-500">Mata pelajaran
                  <select value={form.mapel_id} onChange={e => setForm(f => ({ ...f, mapel_id: e.target.value }))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                    <option value="">-- Semua --</option>
                    {scope.mapel.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-500">Deadline
                  <input type="datetime-local" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
                </label>
                <label className="text-xs text-gray-500">Bobot nilai (maks)
                  <input type="number" min={1} max={1000} value={form.bobot} onChange={e => setForm(f => ({ ...f, bobot: e.target.value }))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
                </label>
              </div>
              <label className="block text-xs text-gray-500">Instruksi
                <textarea value={form.deskripsi} onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))} rows={3}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <div className="rounded-lg border border-dashed p-3 dark:border-gray-700">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-500">
                  <Upload size={14} />
                  <span>{file ? file.name : 'Lampiran (PDF, DOCX, PPTX, gambar, audio — maks 20 MB)'}</span>
                  <input type="file" className="hidden" accept=".pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp,.mp3,.txt"
                    onChange={e => setFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
            <button onClick={simpan} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm text-white">
              <Save size={16} /> Simpan tugas
            </button>
          </div>
        </div>
      )}

      {/* Modal rekap pengumpulan */}
      {rekap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRekap(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 dark:bg-gray-900" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">{rekap.tugas.judul}</p>
                <p className="text-xs text-gray-500">
                  {rekap.jumlah_kumpul} dari {rekap.jumlah_siswa} siswa mengumpulkan
                  {rekap.jumlah_terlambat > 0 && ` · ${rekap.jumlah_terlambat} terlambat`}
                </p>
              </div>
              <button onClick={() => setRekap(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
            </div>

            {rekap.siswa.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Belum ada siswa di rombel ini.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border dark:border-gray-800">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2">Siswa</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Waktu</th>
                      <th className="px-3 py-2 text-center">Nilai</th>
                      <th className="px-3 py-2 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-800">
                    {rekap.siswa.map(s => (
                      <tr key={s.siswa_id}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-800 dark:text-gray-100">{s.nama}</p>
                          <p className="text-[11px] text-gray-400">{s.nis || ''}</p>
                        </td>
                        <td className="px-3 py-2">
                          {s.status === 'belum' ? (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">Belum</span>
                          ) : s.terlambat ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:bg-orange-950/40 dark:text-orange-400">
                              <AlertTriangle size={11} /> Terlambat
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                              <CheckCircle2 size={11} /> Dikumpulkan
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">{fmtWaktu(s.submitted_at)}</td>
                        <td className="px-3 py-2 text-center">
                          {s.nilai != null ? (
                            <span className="font-bold text-gray-800 dark:text-gray-100">{s.nilai}<span className="text-xs text-gray-400">/{rekap.tugas.bobot}</span></span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {s.pengumpulan_id && (
                            <div className="flex items-center justify-end gap-1.5">
                              {(s.file_path || s.teks) && (
                                <button onClick={() => {
                                  if (s.teks) toast(s.teks, { icon: '📝', duration: 8000 })
                                  if (s.file_path) window.open(s.file_path, '_blank')
                                }} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" title="Lihat jawaban">
                                  <Eye size={11} /> Lihat
                                </button>
                              )}
                              <button onClick={() => setNilaiModal({ siswa_id: s.siswa_id, nama: s.nama, pengumpulan_id: s.pengumpulan_id!, nilai: s.nilai != null ? String(s.nilai) : '', catatan_guru: s.catatan_guru })}
                                className="rounded-lg border px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5 dark:border-gray-700">
                                Nilai
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal penilaian */}
      {nilaiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setNilaiModal(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-gray-900" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-gray-800 dark:text-gray-100">Nilai {nilaiModal.nama}</p>
              <button onClick={() => setNilaiModal(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs text-gray-500">Nilai (0–{rekap?.tugas.bobot || 100})
                <input type="number" min={0} max={rekap?.tugas.bobot || 100} value={nilaiModal.nilai} onChange={e => setNilaiModal(n => ({ ...n!, nilai: e.target.value }))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="block text-xs text-gray-500">Feedback
                <textarea value={nilaiModal.catatan_guru} onChange={e => setNilaiModal(n => ({ ...n!, catatan_guru: e.target.value }))} rows={3}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" placeholder="Catatan untuk siswa" />
              </label>
            </div>
            <button onClick={simpanNilai} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm text-white">
              <Save size={16} /> Simpan nilai
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
