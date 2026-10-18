import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Calculator, Plus, Trash2, Save, X, ChevronDown, ChevronRight,
  AlertTriangle, Wallet, PieChart, Target,
} from 'lucide-react'
import api from '../../services/api'

// ============================================================================
// RKAS / BOS
//
// Sebelumnya hanya ada keuangan_transaksi (realisasi). Tidak ada rencana
// anggaran, sehingga tidak mungkin menjawab "dari pagu Rp X, berapa terserap?"
//
// PAGU disimpan (itu rencana). REALISASI dihitung dari keuangan_transaksi
// (itu fakta) — kalau realisasi disimpan, ia akan berbeda dari buku kas begitu
// ada transaksi yang dikoreksi.
// ============================================================================

type Program = {
  id: string
  kode: string
  nama: string
  keterangan: string
  urutan: number
  jumlah_kegiatan: number
  total_pagu: number
}

type Kegiatan = {
  id: string
  program_id: string
  kode: string
  nama: string
  sumber_dana: string
  tahun_ajaran: string
  pagu: number
  keterangan: string
  program_nama: string
  realisasi: number
  sisa: number
  serapan: number
}

type Ringkasan = {
  totalPagu: number
  totalRealisasi: number
  totalSisa: number
  serapan: number
  jumlahKegiatan: number
  perSumber: { sumber: string; pagu: number; realisasi: number; jumlah: number; serapan: number }[]
  sumberDana: string[]
}

const rupiah = (n: number) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID')
const LABEL_SUMBER: Record<string, string> = {
  bos: 'BOS', komite: 'Komite', apbd: 'APBD', yayasan: 'Yayasan', lain: 'Lain-lain',
}
const tahunAjaranIni = () => {
  const d = new Date()
  const y = d.getFullYear()
  return d.getMonth() >= 6 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}

export default function RkasPage() {
  const [program, setProgram] = useState<Program[]>([])
  const [kegiatan, setKegiatan] = useState<Kegiatan[]>([])
  const [ringkasan, setRingkasan] = useState<Ringkasan | null>(null)
  const [tahun, setTahun] = useState(tahunAjaranIni())
  const [memuat, setMemuat] = useState(true)
  const [buka, setBuka] = useState<Record<string, boolean>>({})
  const [editProgram, setEditProgram] = useState<any>(null)
  const [editKegiatan, setEditKegiatan] = useState<any>(null)

  const muat = async () => {
    setMemuat(true)
    try {
      const [p, k, r] = await Promise.all([
        api.get('/rkas/program'),
        api.get(`/rkas/kegiatan?tahun_ajaran=${encodeURIComponent(tahun)}`),
        api.get(`/rkas/ringkasan?tahun_ajaran=${encodeURIComponent(tahun)}`),
      ])
      setProgram(Array.isArray(p.data) ? p.data : [])
      setKegiatan(Array.isArray(k.data) ? k.data : [])
      setRingkasan(r.data || null)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal memuat data RKAS')
    } finally {
      setMemuat(false)
    }
  }

  useEffect(() => { muat() }, [tahun])

  // Kegiatan dikelompokkan per program — pengawas menanyakan per program,
  // bukan daftar datar.
  const perProgram = useMemo(() => {
    const map: Record<string, Kegiatan[]> = {}
    for (const k of kegiatan) {
      const key = k.program_id || 'lain'
      ;(map[key] = map[key] || []).push(k)
    }
    return map
  }, [kegiatan])

  const simpanProgram = async () => {
    if (!editProgram?.nama?.trim()) return toast.error('Nama program wajib diisi')
    try {
      if (editProgram.id) await api.put(`/rkas/program/${editProgram.id}`, editProgram)
      else await api.post('/rkas/program', editProgram)
      toast.success('Program disimpan')
      setEditProgram(null)
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan program')
    }
  }

  const hapusProgram = async (p: Program) => {
    if (p.jumlah_kegiatan > 0) return toast.error(`Program masih punya ${p.jumlah_kegiatan} kegiatan`)
    if (!confirm(`Hapus program "${p.nama}"?`)) return
    try {
      await api.delete(`/rkas/program/${p.id}`)
      toast.success('Program dihapus')
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menghapus')
    }
  }

  const simpanKegiatan = async () => {
    if (!editKegiatan?.nama?.trim()) return toast.error('Nama kegiatan wajib diisi')
    if (!editKegiatan.program_id) return toast.error('Pilih program dulu')
    try {
      if (editKegiatan.id) await api.put(`/rkas/kegiatan/${editKegiatan.id}`, editKegiatan)
      else await api.post('/rkas/kegiatan', { ...editKegiatan, tahun_ajaran: editKegiatan.tahun_ajaran || tahun })
      toast.success('Kegiatan disimpan')
      setEditKegiatan(null)
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan kegiatan')
    }
  }

  const hapusKegiatan = async (k: Kegiatan) => {
    if (!confirm(`Hapus kegiatan "${k.nama}"?`)) return
    try {
      await api.delete(`/rkas/kegiatan/${k.id}`)
      toast.success('Kegiatan dihapus')
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menghapus')
    }
  }

  const warnaSerapan = (s: number) =>
    s >= 90 ? 'text-red-600' : s >= 60 ? 'text-amber-600' : 'text-emerald-600'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-display font-bold text-gray-800 dark:text-gray-100">
            <Calculator size={22} className="text-primary" /> RKAS & BOS
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Rencana anggaran per program dan serapan realisasinya.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={tahun} onChange={e => setTahun(e.target.value)} placeholder="2026/2027"
            className="w-28 rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
          <button onClick={() => setEditProgram({ kode: '', nama: '', keterangan: '' })}
            className="inline-flex items-center gap-2 rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5">
            <Plus size={15} /> Program
          </button>
          <button onClick={() => setEditKegiatan({ program_id: program[0]?.id || '', kode: '', nama: '', sumber_dana: 'bos', pagu: 0, tahun_ajaran: tahun, keterangan: '' })}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-white">
            <Plus size={15} /> Kegiatan
          </button>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-xs text-gray-500"><Target size={14} /> Total pagu</div>
          <p className="mt-1 text-lg font-bold text-gray-800 dark:text-gray-100">{rupiah(ringkasan?.totalPagu ?? 0)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-xs text-gray-500"><Wallet size={14} /> Realisasi</div>
          <p className="mt-1 text-lg font-bold text-gray-800 dark:text-gray-100">{rupiah(ringkasan?.totalRealisasi ?? 0)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-xs text-gray-500"><PieChart size={14} /> Sisa</div>
          <p className="mt-1 text-lg font-bold text-gray-800 dark:text-gray-100">{rupiah(ringkasan?.totalSisa ?? 0)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-xs text-gray-500"><Calculator size={14} /> Serapan</div>
          <p className={`mt-1 text-lg font-bold ${warnaSerapan(ringkasan?.serapan ?? 0)}`}>{ringkasan?.serapan ?? 0}%</p>
        </div>
      </div>

      {/* Per sumber dana */}
      {ringkasan && ringkasan.perSumber.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-white dark:border-gray-800 dark:bg-gray-900">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2.5">Sumber dana</th>
                <th className="px-4 py-2.5 text-right">Pagu</th>
                <th className="px-4 py-2.5 text-right">Realisasi</th>
                <th className="px-4 py-2.5 text-right">Serapan</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-800">
              {ringkasan.perSumber.map(s => (
                <tr key={s.sumber}>
                  <td className="px-4 py-2.5 font-semibold text-gray-800 dark:text-gray-100">{LABEL_SUMBER[s.sumber] || s.sumber}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-200">{rupiah(s.pagu)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-200">{rupiah(s.realisasi)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${warnaSerapan(s.serapan)}`}>{s.serapan}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Program + kegiatan */}
      {memuat ? (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">Memuat…</div>
      ) : program.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">
          <Calculator size={42} className="mx-auto mb-3 opacity-60" />
          <p>Belum ada program anggaran. Mulai dengan menambah program.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {program.map(p => {
            const anak = perProgram[p.id] || []
            const terbuka = buka[p.id] !== false
            const paguProgram = anak.reduce((a, k) => a + k.pagu, 0)
            const realProgram = anak.reduce((a, k) => a + k.realisasi, 0)
            const serapanProgram = paguProgram > 0 ? Math.round((realProgram / paguProgram) * 1000) / 10 : 0

            return (
              <div key={p.id} className="rounded-xl border bg-white dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <button onClick={() => setBuka(b => ({ ...b, [p.id]: !terbuka }))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {terbuka ? <ChevronDown size={16} className="shrink-0 text-gray-400" /> : <ChevronRight size={16} className="shrink-0 text-gray-400" />}
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-800 dark:text-gray-100">
                        {p.kode && <span className="mr-1.5 text-xs text-gray-400">{p.kode}</span>}{p.nama}
                      </p>
                      <p className="text-xs text-gray-500">
                        {anak.length} kegiatan · pagu {rupiah(paguProgram)} · serapan <span className={warnaSerapan(serapanProgram)}>{serapanProgram}%</span>
                      </p>
                    </div>
                  </button>
                  <div className="flex gap-1">
                    <button onClick={() => setEditProgram({ ...p })} className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5">Ubah</button>
                    <button onClick={() => hapusProgram(p)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 size={14} /></button>
                  </div>
                </div>

                {terbuka && (
                  anak.length === 0 ? (
                    <p className="border-t px-4 py-3 text-xs text-gray-400 dark:border-gray-800">
                      Belum ada kegiatan di program ini.
                    </p>
                  ) : (
                    <div className="overflow-x-auto border-t dark:border-gray-800">
                      <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          <tr>
                            <th className="px-4 py-2">Kegiatan</th>
                            <th className="px-4 py-2">Sumber</th>
                            <th className="px-4 py-2 text-right">Pagu</th>
                            <th className="px-4 py-2 text-right">Realisasi</th>
                            <th className="px-4 py-2 text-right">Sisa</th>
                            <th className="px-4 py-2 text-right">Serapan</th>
                            <th className="px-4 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-gray-800">
                          {anak.map(k => (
                            <tr key={k.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                              <td className="px-4 py-2.5">
                                <p className="font-medium text-gray-800 dark:text-gray-100">
                                  {k.kode && <span className="mr-1.5 text-xs text-gray-400">{k.kode}</span>}{k.nama}
                                </p>
                              </td>
                              <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{LABEL_SUMBER[k.sumber_dana] || k.sumber_dana}</td>
                              <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-200">{rupiah(k.pagu)}</td>
                              <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-200">{rupiah(k.realisasi)}</td>
                              <td className={`px-4 py-2.5 text-right ${k.sisa < 0 ? 'font-semibold text-red-600' : 'text-gray-700 dark:text-gray-200'}`}>
                                {rupiah(k.sisa)}
                              </td>
                              <td className={`px-4 py-2.5 text-right font-semibold ${warnaSerapan(k.serapan)}`}>{k.serapan}%</td>
                              <td className="px-4 py-2.5 text-right">
                                <div className="flex justify-end gap-1">
                                  <button onClick={() => setEditKegiatan({ ...k })} className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5">Ubah</button>
                                  <button onClick={() => hapusKegiatan(k)} className="rounded-lg p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 size={13} /></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}

      {ringkasan && ringkasan.jumlahKegiatan > 0 && (
        <p className="rounded-xl border bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <span className="flex items-center gap-1 font-semibold"><AlertTriangle size={13} /> Cara realisasi dihitung</span>
          Realisasi dicocokkan dari transaksi keluar yang keterangannya memuat <strong>kode kegiatan</strong>.
          Isi kode kegiatan (mis. <code>BOS-01</code>) di setiap transaksi agar serapan terhitung otomatis.
        </p>
      )}

      {/* Modal program */}
      {editProgram && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditProgram(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-gray-900" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-gray-800 dark:text-gray-100">{editProgram.id ? 'Ubah program' : 'Program baru'}</p>
              <button onClick={() => setEditProgram(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs text-gray-500">Kode
                <input value={editProgram.kode || ''} onChange={e => setEditProgram({ ...editProgram, kode: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="block text-xs text-gray-500">Nama program *
                <input value={editProgram.nama || ''} onChange={e => setEditProgram({ ...editProgram, nama: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="block text-xs text-gray-500">Keterangan
                <input value={editProgram.keterangan || ''} onChange={e => setEditProgram({ ...editProgram, keterangan: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
            </div>
            <button onClick={simpanProgram} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm text-white">
              <Save size={16} /> Simpan
            </button>
          </div>
        </div>
      )}

      {/* Modal kegiatan */}
      {editKegiatan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditKegiatan(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 dark:bg-gray-900" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-gray-800 dark:text-gray-100">{editKegiatan.id ? 'Ubah kegiatan' : 'Kegiatan baru'}</p>
              <button onClick={() => setEditKegiatan(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs text-gray-500 sm:col-span-2">Program *
                <select value={editKegiatan.program_id || ''} onChange={e => setEditKegiatan({ ...editKegiatan, program_id: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                  <option value="">-- pilih program --</option>
                  {program.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">Kode
                <input value={editKegiatan.kode || ''} onChange={e => setEditKegiatan({ ...editKegiatan, kode: e.target.value })}
                  placeholder="BOS-01"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="text-xs text-gray-500">Sumber dana
                <select value={editKegiatan.sumber_dana || 'bos'} onChange={e => setEditKegiatan({ ...editKegiatan, sumber_dana: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                  {(ringkasan?.sumberDana || ['bos', 'komite', 'apbd', 'yayasan', 'lain']).map(s => (
                    <option key={s} value={s}>{LABEL_SUMBER[s] || s}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-500 sm:col-span-2">Nama kegiatan *
                <input value={editKegiatan.nama || ''} onChange={e => setEditKegiatan({ ...editKegiatan, nama: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="text-xs text-gray-500">Pagu (Rp)
                <input type="number" min={0} value={Number(editKegiatan.pagu) || 0} onChange={e => setEditKegiatan({ ...editKegiatan, pagu: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="text-xs text-gray-500">Tahun ajaran
                <input value={editKegiatan.tahun_ajaran || tahun} onChange={e => setEditKegiatan({ ...editKegiatan, tahun_ajaran: e.target.value })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
            </div>
            <button onClick={simpanKegiatan} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm text-white">
              <Save size={16} /> Simpan
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
