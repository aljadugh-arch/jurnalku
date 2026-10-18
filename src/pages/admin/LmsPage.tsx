import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  BookOpenCheck, Plus, Trash2, Search, Upload, X, Save, Eye,
  Users, CheckCircle2, FileText, Link2, BarChart3, AlertTriangle,
} from 'lucide-react'
import api from '../../services/api'

// ============================================================================
// LMS — Materi Ajar & Progres Belajar
//
// Sebelumnya `modul_ajar` hanya dokumen RPP hasil AI (bukan bahan bacaan
// siswa), dan `tugas_siswa` kosong tanpa relasi ke materi. Di sini materi
// benar-benar disimpan (berkas/tautan), diterbitkan, dan progres siswa dicatat
// per materi.
// ============================================================================

type Materi = {
  id: string
  judul: string
  deskripsi: string
  mapel_id: string | null
  rombel_id: string | null
  jenis: string
  file_path: string
  file_nama: string
  file_ukuran: number
  tautan: string
  urutan: number
  publikasi: number
  mapel_nama: string | null
  rombel_nama: string | null
  guru_nama: string | null
  jumlah_dibuka: number
  jumlah_selesai: number
}

type Ringkasan = {
  totalMateri: number
  terbit: number
  draf: number
  totalBuka: number
  selesai: number
  perMapel: { mapel: string; n: number }[]
}

type Progres = {
  progres: any[]
  totalSiswa: number
  belumMembuka: { id: string; nama: string; nis: string }[]
  sudahMembuka: number
  materi: any
}

const ukuran = (b: number) => {
  const n = Number(b) || 0
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB'
  if (n >= 1024) return Math.round(n / 1024) + ' KB'
  return n + ' B'
}

export default function LmsPage() {
  const [materi, setMateri] = useState<Materi[]>([])
  const [ringkasan, setRingkasan] = useState<Ringkasan | null>(null)
  const [mapel, setMapel] = useState<any[]>([])
  const [rombel, setRombel] = useState<any[]>([])
  const [memuat, setMemuat] = useState(true)
  const [cari, setCari] = useState('')
  const [buka, setBuka] = useState(false)
  const [progres, setProgres] = useState<Progres | null>(null)
  const [form, setForm] = useState({
    judul: '', deskripsi: '', mapel_id: '', rombel_id: '',
    tautan: '', publikasi: '0',
  })
  const [file, setFile] = useState<File | null>(null)

  const muat = async () => {
    setMemuat(true)
    try {
      const [m, r, mp, rb] = await Promise.all([
        api.get('/lms/materi'),
        api.get('/lms/ringkasan'),
        api.get('/mapel'),
        api.get('/rombel'),
      ])
      setMateri(Array.isArray(m.data) ? m.data : [])
      setRingkasan(r.data || null)
      setMapel(Array.isArray(mp.data) ? mp.data : [])
      setRombel(Array.isArray(rb.data) ? rb.data : [])
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal memuat materi')
    } finally {
      setMemuat(false)
    }
  }

  useEffect(() => { muat() }, [])

  const materiTampil = useMemo(() => {
    const q = cari.trim().toLowerCase()
    if (!q) return materi
    return materi.filter(m =>
      String(m.judul).toLowerCase().includes(q) ||
      String(m.deskripsi || '').toLowerCase().includes(q) ||
      String(m.mapel_nama || '').toLowerCase().includes(q) ||
      String(m.rombel_nama || '').toLowerCase().includes(q),
    )
  }, [materi, cari])

  const simpan = async () => {
    if (!form.judul.trim()) return toast.error('Judul materi wajib diisi')
    if (!file && !form.tautan.trim()) return toast.error('Pilih berkas atau isi tautan')

    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)))
    if (file) fd.append('file', file)

    try {
      await api.post('/lms/materi', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Materi ditambahkan')
      setBuka(false); setFile(null)
      setForm({ judul: '', deskripsi: '', mapel_id: '', rombel_id: '', tautan: '', publikasi: '0' })
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan materi')
    }
  }

  const terbitkan = async (m: Materi) => {
    try {
      await api.put(`/lms/materi/${m.id}`, {
        judul: m.judul, deskripsi: m.deskripsi, mapel_id: m.mapel_id, rombel_id: m.rombel_id,
        tautan: m.tautan, urutan: m.urutan, publikasi: m.publikasi ? 0 : 1,
      })
      toast.success(m.publikasi ? 'Materi ditarik ke draf' : 'Materi diterbitkan')
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal mengubah status')
    }
  }

  const hapus = async (m: Materi) => {
    if (!confirm(`Hapus materi "${m.judul}" beserta berkasnya?`)) return
    try {
      await api.delete(`/lms/materi/${m.id}`)
      toast.success('Materi dihapus')
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menghapus')
    }
  }

  const lihatProgres = async (m: Materi) => {
    try {
      const r = await api.get(`/lms/materi/${m.id}/progres`)
      setProgres(r.data || null)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal memuat progres')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-display font-bold text-gray-800 dark:text-gray-100">
            <BookOpenCheck size={22} className="text-primary" /> Materi Ajar
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Unggah bahan ajar dan pantau siapa yang sudah membuka.
          </p>
        </div>
        <button onClick={() => setBuka(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm text-white">
          <Plus size={15} /> Tambah materi
        </button>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Materi', ringkasan?.totalMateri ?? 0, FileText, ''],
          ['Terbit', ringkasan?.terbit ?? 0, CheckCircle2, 'text-emerald-600'],
          ['Draf', ringkasan?.draf ?? 0, AlertTriangle, (ringkasan?.draf ?? 0) > 0 ? 'text-amber-600' : ''],
          ['Dibuka siswa', ringkasan?.totalBuka ?? 0, Eye, ''],
        ].map(([label, nilai, Ikon, warna]: any) => (
          <div key={label} className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-2 text-xs text-gray-500"><Ikon size={14} /> {label}</div>
            <p className={`mt-1 text-2xl font-bold ${warna || 'text-gray-800 dark:text-gray-100'}`}>{nilai}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
        <Search size={15} className="text-gray-400" />
        <input value={cari} onChange={e => setCari(e.target.value)}
          placeholder="Cari judul, mapel, atau rombel…"
          className="w-full bg-transparent text-sm outline-none dark:text-gray-100" />
        <span className="shrink-0 text-xs text-gray-400">{materiTampil.length} materi</span>
      </div>

      {memuat ? (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">Memuat…</div>
      ) : materiTampil.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">
          <BookOpenCheck size={42} className="mx-auto mb-3 opacity-60" />
          <p>Belum ada materi ajar.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {materiTampil.map(m => (
            <div key={m.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-gray-800 dark:text-gray-100">{m.judul}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    m.publikasi
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                  }`}>{m.publikasi ? 'TERBIT' : 'DRAF'}</span>
                  {m.rombel_nama && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">{m.rombel_nama}</span>}
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  {m.mapel_nama || 'Tanpa mapel'}
                  {m.file_nama ? ` · ${m.file_nama} (${ukuran(m.file_ukuran)})` : m.tautan ? ' · tautan' : ''}
                </p>
                {m.deskripsi && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{m.deskripsi}</p>}
                <p className="mt-1 text-[11px] text-gray-400">
                  dibuka {m.jumlah_dibuka}× · selesai {m.jumlah_selesai}× · oleh {m.guru_nama || '-'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.file_path && (
                  <a href={m.file_path} target="_blank" rel="noreferrer"
                    className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                    Buka
                  </a>
                )}
                {!m.file_path && m.tautan && (
                  <a href={m.tautan} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                    <Link2 size={12} /> Tautan
                  </a>
                )}
                <button onClick={() => lihatProgres(m)}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 dark:border-gray-700">
                  <BarChart3 size={12} /> Progres
                </button>
                <button onClick={() => terbitkan(m)}
                  className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  {m.publikasi ? 'Tarik' : 'Terbitkan'}
                </button>
                <button onClick={() => hapus(m)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal tambah materi */}
      {buka && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setBuka(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 dark:bg-gray-900" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-gray-800 dark:text-gray-100">Tambah materi ajar</p>
              <button onClick={() => setBuka(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs text-gray-500">Judul *
                <input value={form.judul} onChange={e => setForm(f => ({ ...f, judul: e.target.value }))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="block text-xs text-gray-500">Deskripsi
                <textarea value={form.deskripsi} onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))} rows={2}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs text-gray-500">Mata pelajaran
                  <select value={form.mapel_id} onChange={e => setForm(f => ({ ...f, mapel_id: e.target.value }))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                    <option value="">-- semua --</option>
                    {mapel.map((m: any) => <option key={m.id} value={m.id}>{m.nama}</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-500">Rombel sasaran
                  <select value={form.rombel_id} onChange={e => setForm(f => ({ ...f, rombel_id: e.target.value }))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                    <option value="">-- semua rombel --</option>
                    {rombel.map((r: any) => <option key={r.id} value={r.id}>{r.nama}</option>)}
                  </select>
                </label>
              </div>

              <div className="rounded-lg border border-dashed p-3 dark:border-gray-700">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-500">
                  <Upload size={14} />
                  <span>{file ? file.name : 'Pilih berkas (PDF, DOCX, PPTX, gambar, video, audio — maks 50 MB)'}</span>
                  <input type="file" className="hidden"
                    accept=".pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp,.mp4,.mp3,.txt"
                    onChange={e => setFile(e.target.files?.[0] || null)} />
                </label>
                {file && <p className="mt-1 text-[11px] text-gray-400">{ukuran(file.size)}</p>}
              </div>

              <label className="block text-xs text-gray-500">Atau tautan (bila tanpa berkas)
                <input value={form.tautan} onChange={e => setForm(f => ({ ...f, tautan: e.target.value }))}
                  placeholder="https://…"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>

              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                <input type="checkbox" checked={form.publikasi === '1'}
                  onChange={e => setForm(f => ({ ...f, publikasi: e.target.checked ? '1' : '0' }))} />
                Terbitkan sekarang (siswa bisa membuka)
              </label>
            </div>
            <button onClick={simpan} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm text-white">
              <Save size={16} /> Simpan materi
            </button>
          </div>
        </div>
      )}

      {/* Modal progres */}
      {progres && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setProgres(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 dark:bg-gray-900" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">{progres.materi?.judul}</p>
                <p className="text-xs text-gray-500">
                  {progres.sudahMembuka} dari {progres.totalSiswa || '-'} siswa sudah membuka
                </p>
              </div>
              <button onClick={() => setProgres(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
            </div>

            {progres.belumMembuka.length > 0 && (
              <div className="mb-3 rounded-lg bg-amber-50 p-3 dark:bg-amber-950/30">
                <p className="flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
                  <AlertTriangle size={13} /> Belum membuka ({progres.belumMembuka.length})
                </p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  {progres.belumMembuka.map(s => s.nama).join(', ')}
                </p>
              </div>
            )}

            {progres.progres.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Belum ada siswa yang membuka materi ini.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border dark:border-gray-800">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2">Siswa</th>
                      <th className="px-3 py-2 text-center">Buka</th>
                      <th className="px-3 py-2">Pertama</th>
                      <th className="px-3 py-2">Terakhir</th>
                      <th className="px-3 py-2 text-center">Selesai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-800">
                    {progres.progres.map((p: any) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-800 dark:text-gray-100">{p.nama || '-'}</p>
                          <p className="text-[11px] text-gray-400">{p.nis || ''}</p>
                        </td>
                        <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-300">{p.jumlah_buka}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{p.dibuka_pertama}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{p.dibuka_terakhir}</td>
                        <td className="px-3 py-2 text-center">
                          {p.selesai ? <CheckCircle2 size={15} className="mx-auto text-emerald-600" /> : <span className="text-gray-300">—</span>}
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
    </div>
  )
}
