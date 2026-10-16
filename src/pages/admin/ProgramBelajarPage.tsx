import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Plus, Pencil, Trash2, Loader2, X, Layers, Clock, Tag } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useSettingsStore } from '../../stores/settingsStore'

interface Level {
  id: string
  program_id: string
  nama: string
  grade: string
  deskripsi: string
  urutan: number
}

interface Program {
  id: string
  nama: string
  deskripsi: string
  kategori: string
  durasi_pertemuan: number
  aktif: number
  urutan: number
  levels: Level[]
}

const kosongProgram = { nama: '', deskripsi: '', kategori: '', durasi_pertemuan: 90, aktif: 1 }
const kosongLevel = { nama: '', grade: '', deskripsi: '' }

export default function ProgramBelajarPage() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalProgram, setModalProgram] = useState<null | { id?: string; form: typeof kosongProgram }>(null)
  const [modalLevel, setModalLevel] = useState<null | { programId: string; programNama: string; id?: string; form: typeof kosongLevel }>(null)
  const settings = useSettingsStore(s => s.settings)
  const jenjang = String((settings as any)?.jenjang || '').toUpperCase()
  const nonformal = jenjang === 'NF' || jenjang.includes('NONFORMAL') || jenjang.includes('NON-FORMAL') || jenjang.includes('KURSUS')

  const muat = useCallback(async () => {
    try {
      const { data } = await api.get('/program-belajar')
      setPrograms(data.program || [])
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal memuat program belajar') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { muat() }, [muat])

  const simpanProgram = async () => {
    if (!modalProgram) return
    if (!modalProgram.form.nama.trim()) return toast.error('Nama program wajib diisi')
    setSaving(true)
    try {
      if (modalProgram.id) await api.put(`/program-belajar/${modalProgram.id}`, modalProgram.form)
      else await api.post('/program-belajar', modalProgram.form)
      toast.success(modalProgram.id ? 'Program diperbarui' : 'Program ditambahkan')
      setModalProgram(null); muat()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menyimpan program') }
    finally { setSaving(false) }
  }

  const hapusProgram = async (p: Program) => {
    if (!confirm(`Hapus program "${p.nama}" beserta ${p.levels.length} levelnya?`)) return
    try { await api.delete(`/program-belajar/${p.id}`); toast.success('Program dihapus'); muat() }
    catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menghapus') }
  }

  const simpanLevel = async () => {
    if (!modalLevel) return
    if (!modalLevel.form.nama.trim()) return toast.error('Nama level/grade wajib diisi')
    setSaving(true)
    try {
      if (modalLevel.id) await api.put(`/program-level/${modalLevel.id}`, modalLevel.form)
      else await api.post(`/program-belajar/${modalLevel.programId}/level`, modalLevel.form)
      toast.success(modalLevel.id ? 'Level diperbarui' : 'Level ditambahkan')
      setModalLevel(null); muat()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menyimpan level') }
    finally { setSaving(false) }
  }

  const hapusLevel = async (lv: Level) => {
    if (!confirm(`Hapus level "${lv.nama}"?`)) return
    try { await api.delete(`/program-level/${lv.id}`); toast.success('Level dihapus'); muat() }
    catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menghapus level') }
  }

  if (loading) return <div className="py-16 text-center text-gray-400"><Loader2 className="animate-spin mx-auto" /></div>

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Program Belajar</h1>
          <p className="text-gray-500 text-sm mt-1">
            Program kursus/pelatihan beserta tangga level (grade) untuk lembaga nonformal.
          </p>
        </div>
        <button
          onClick={() => setModalProgram({ form: { ...kosongProgram } })}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm inline-flex items-center gap-2"
        >
          <Plus size={16} /> Tambah Program
        </button>
      </div>

      {!nonformal && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          Jenjang lembaga ini belum diset <b>Lembaga Nonformal (NF)</b> di Pengaturan. Program belajar tetap bisa
          dikelola, tetapi paket bawaan hanya diisi otomatis untuk lembaga nonformal.
        </div>
      )}

      {programs.length === 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-10 text-center">
          <BookOpen className="mx-auto text-gray-300 mb-3" size={40} />
          <p className="text-sm text-gray-500">Belum ada program belajar.</p>
          <p className="text-xs text-gray-400 mt-1">Klik "Tambah Program" untuk membuat program pertama.</p>
        </div>
      )}

      <div className="space-y-4">
        {programs.map(p => (
          <div key={p.id} className="rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-50 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold text-gray-800">{p.nama}</h2>
                  {!p.aktif && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Nonaktif</span>}
                  {p.kategori && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
                      <Tag size={10} /> {p.kategori}
                    </span>
                  )}
                  {p.durasi_pertemuan > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                      <Clock size={10} /> {p.durasi_pertemuan} menit/pertemuan
                    </span>
                  )}
                </div>
                {p.deskripsi && <p className="mt-1 text-sm text-gray-500">{p.deskripsi}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => setModalLevel({ programId: p.id, programNama: p.nama, form: { ...kosongLevel } })}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
                >
                  <Plus size={12} /> Level
                </button>
                <button
                  onClick={() => setModalProgram({ id: p.id, form: { nama: p.nama, deskripsi: p.deskripsi, kategori: p.kategori, durasi_pertemuan: p.durasi_pertemuan, aktif: p.aktif } })}
                  className="rounded-lg bg-gray-50 p-1.5 text-gray-500 hover:bg-gray-100" title="Ubah program"
                >
                  <Pencil size={14} />
                </button>
                <button onClick={() => hapusProgram(p)} className="rounded-lg bg-red-50 p-1.5 text-red-500 hover:bg-red-100" title="Hapus program">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="p-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                <Layers size={13} /> Level / Grade ({p.levels.length})
              </p>
              {p.levels.length === 0 ? (
                <p className="text-xs text-gray-400">Belum ada level. Klik "Level" untuk menambah.</p>
              ) : (
                <div className="space-y-2">
                  {p.levels.map((lv, idx) => (
                    <div key={lv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-800">
                            {lv.nama}
                            {lv.grade && <span className="ml-2 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{lv.grade}</span>}
                          </p>
                          {lv.deskripsi && <p className="truncate text-xs text-gray-500">{lv.deskripsi}</p>}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          onClick={() => setModalLevel({ programId: p.id, programNama: p.nama, id: lv.id, form: { nama: lv.nama, grade: lv.grade, deskripsi: lv.deskripsi } })}
                          className="rounded-lg bg-white p-1.5 text-gray-500 hover:bg-gray-100" title="Ubah level"
                        >
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => hapusLevel(lv)} className="rounded-lg bg-white p-1.5 text-red-500 hover:bg-red-50" title="Hapus level">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal program */}
      {modalProgram && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={() => setModalProgram(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">{modalProgram.id ? 'Ubah Program' : 'Tambah Program'}</h2>
              <button onClick={() => setModalProgram(null)} className="rounded-lg p-1 hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Nama program *</label>
                <input value={modalProgram.form.nama} onChange={e => setModalProgram(m => m && ({ ...m, form: { ...m.form, nama: e.target.value } }))} placeholder="mis. Bahasa Inggris" className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Kategori</label>
                  <input value={modalProgram.form.kategori} onChange={e => setModalProgram(m => m && ({ ...m, form: { ...m.form, kategori: e.target.value } }))} placeholder="mis. Bahasa" className="w-full rounded-lg border px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Menit / pertemuan</label>
                  <input type="number" min={0} value={modalProgram.form.durasi_pertemuan} onChange={e => setModalProgram(m => m && ({ ...m, form: { ...m.form, durasi_pertemuan: Number(e.target.value) || 0 } }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Deskripsi</label>
                <textarea value={modalProgram.form.deskripsi} onChange={e => setModalProgram(m => m && ({ ...m, form: { ...m.form, deskripsi: e.target.value } }))} rows={3} className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={!!modalProgram.form.aktif} onChange={e => setModalProgram(m => m && ({ ...m, form: { ...m.form, aktif: e.target.checked ? 1 : 0 } }))} />
                Program aktif
              </label>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setModalProgram(null)} className="flex-1 rounded-lg border px-4 py-2 text-sm">Batal</button>
              <button onClick={simpanProgram} disabled={saving} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60">
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal level */}
      {modalLevel && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={() => setModalLevel(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{modalLevel.id ? 'Ubah Level' : 'Tambah Level'}</h2>
                <p className="text-xs text-gray-500">{modalLevel.programNama}</p>
              </div>
              <button onClick={() => setModalLevel(null)} className="rounded-lg p-1 hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Nama level *</label>
                <input value={modalLevel.form.nama} onChange={e => setModalLevel(m => m && ({ ...m, form: { ...m.form, nama: e.target.value } }))} placeholder="mis. Basic" className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Grade / label tingkat</label>
                <input value={modalLevel.form.grade} onChange={e => setModalLevel(m => m && ({ ...m, form: { ...m.form, grade: e.target.value } }))} placeholder="mis. Grade 1" className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Deskripsi</label>
                <textarea value={modalLevel.form.deskripsi} onChange={e => setModalLevel(m => m && ({ ...m, form: { ...m.form, deskripsi: e.target.value } }))} rows={3} className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setModalLevel(null)} className="flex-1 rounded-lg border px-4 py-2 text-sm">Batal</button>
              <button onClick={simpanLevel} disabled={saving} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-60">
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
