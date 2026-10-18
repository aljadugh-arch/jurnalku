import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  HeartHandshake, Plus, Trash2, Save, AlertTriangle, ShieldAlert,
  Users, CalendarDays, Lock, Eye, ChevronDown, X,
} from 'lucide-react'
import api from '../../services/api'

// ============================================================================
// Bimbingan Konseling (BK)
//
// Tiga tab, sesuai alur kerja guru BK yang sebenarnya:
//   1. Peringatan Dini — siapa yang perlu perhatian SEKARANG (akumulasi poin)
//   2. Pelanggaran     — catat kejadian, poin terhitung otomatis
//   3. Konseling       — sesi privat: ringkasan, tindak lanjut, status
//
// Sengaja dipisah dari menu "Catatan Kepribadian": yang itu masuk rapor dan
// dibaca wali murid. Isi konseling TIDAK boleh bocor ke rapor.
// ============================================================================

type Tab = 'peringatan' | 'pelanggaran' | 'konseling'

type Ringkasan = {
  siswa_id: string
  nama: string
  nis: string
  rombel_nama: string | null
  total_poin: number
  jumlah_pelanggaran: number
  terakhir: string | null
  sesi_terakhir: string | null
  status: { level: string; label: string; warna: string }
}

type Pelanggaran = {
  id: string
  siswa_id: string
  tanggal: string
  jenis: string
  tingkat: string
  poin: number
  keterangan: string
  tindakan: string
  pencatat_nama: string
}

type Sesi = {
  id: string
  siswa_id: string
  tanggal: string
  jenis_kasus: string
  judul: string
  ringkasan: string
  tindak_lanjut: string
  status: string
  konselor_nama: string
  rahasia: number
}

const WARNA_STATUS: Record<string, string> = {
  hijau: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900',
  biru: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900',
  kuning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900',
  oranye: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-900',
  merah: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900',
}

const LABEL_KASUS: Record<string, string> = {
  akademik: 'Akademik', kehadiran: 'Kehadiran', perilaku: 'Perilaku',
  keluarga: 'Keluarga', kesehatan: 'Kesehatan', karir: 'Karir', lainnya: 'Lainnya',
}

const hariIni = () => new Date().toISOString().slice(0, 10)

export default function BkPage() {
  const [tab, setTab] = useState<Tab>('peringatan')
  const [ringkasan, setRingkasan] = useState<Ringkasan[]>([])
  const [ambang, setAmbang] = useState<any>({})
  const [pelanggaran, setPelanggaran] = useState<Pelanggaran[]>([])
  const [sesi, setSesi] = useState<Sesi[]>([])
  const [siswa, setSiswa] = useState<any[]>([])
  const [memuat, setMemuat] = useState(true)
  const [formPelanggaran, setFormPelanggaran] = useState({ siswa_id: '', tanggal: hariIni(), jenis: '', tingkat: 'ringan', poin: '', keterangan: '', tindakan: '' })
  const [formSesi, setFormSesi] = useState({ siswa_id: '', tanggal: hariIni(), jenis_kasus: 'perilaku', judul: '', ringkasan: '', tindak_lanjut: '', status: 'terbuka', rahasia: true })
  const [filterSiswa, setFilterSiswa] = useState('')

  const muat = async () => {
    setMemuat(true)
    try {
      const [r, p, s, sw] = await Promise.all([
        api.get('/bk/ringkasan'),
        api.get('/bk/pelanggaran'),
        api.get('/bk/sesi'),
        api.get('/siswa'),
      ])
      setRingkasan(Array.isArray(r.data?.siswa) ? r.data.siswa : [])
      setAmbang(r.data?.ambang || {})
      setPelanggaran(Array.isArray(p.data) ? p.data : [])
      setSesi(Array.isArray(s.data) ? s.data : [])
      setSiswa(Array.isArray(sw.data) ? sw.data : [])
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal memuat data BK')
    } finally {
      setMemuat(false)
    }
  }

  useEffect(() => { muat() }, [])

  const namaSiswa = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of siswa) m.set(s.id, s.nama)
    return m
  }, [siswa])

  const siswaUrut = useMemo(
    () => [...siswa].sort((a, b) => String(a.nama).localeCompare(String(b.nama))),
    [siswa],
  )

  const simpanPelanggaran = async () => {
    if (!formPelanggaran.siswa_id) return toast.error('Pilih siswa dulu')
    if (!formPelanggaran.jenis.trim()) return toast.error('Jenis pelanggaran wajib diisi')
    try {
      await api.post('/bk/pelanggaran', { ...formPelanggaran, poin: formPelanggaran.poin === '' ? undefined : Number(formPelanggaran.poin) })
      toast.success('Pelanggaran tercatat')
      setFormPelanggaran({ siswa_id: '', tanggal: hariIni(), jenis: '', tingkat: 'ringan', poin: '', keterangan: '', tindakan: '' })
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan pelanggaran')
    }
  }

  const simpanSesi = async () => {
    if (!formSesi.siswa_id) return toast.error('Pilih siswa dulu')
    if (!formSesi.judul.trim()) return toast.error('Judul sesi wajib diisi')
    try {
      await api.post('/bk/sesi', formSesi)
      toast.success('Sesi konseling tersimpan')
      setFormSesi({ siswa_id: '', tanggal: hariIni(), jenis_kasus: 'perilaku', judul: '', ringkasan: '', tindak_lanjut: '', status: 'terbuka', rahasia: true })
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan sesi')
    }
  }

  const hapus = async (jenis: 'pelanggaran' | 'sesi', id: string) => {
    if (!confirm('Hapus catatan ini? Tindakan tidak bisa dibatalkan.')) return
    try {
      await api.delete(`/bk/${jenis}/${id}`)
      toast.success('Dihapus')
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menghapus')
    }
  }

  const peringatan = ringkasan.filter(r => r.status.level !== 'aman')
  const sesiTampil = filterSiswa ? sesi.filter(s => s.siswa_id === filterSiswa) : sesi

  return (
    <div className="space-y-4">
      {/* Kepala halaman */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <HeartHandshake size={22} className="text-primary" /> Bimbingan Konseling
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Peringatan dini, pencatatan pelanggaran, dan sesi konseling. Isi konseling bersifat privat — tidak masuk rapor.
          </p>
        </div>
      </div>

      {/* Ringkasan angka */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-xs text-gray-500"><ShieldAlert size={14} /> Perlu perhatian</div>
          <p className="mt-1 text-2xl font-bold text-gray-800 dark:text-gray-100">{peringatan.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-xs text-gray-500"><AlertTriangle size={14} /> Total pelanggaran</div>
          <p className="mt-1 text-2xl font-bold text-gray-800 dark:text-gray-100">{pelanggaran.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-xs text-gray-500"><CalendarDays size={14} /> Sesi konseling</div>
          <p className="mt-1 text-2xl font-bold text-gray-800 dark:text-gray-100">{sesi.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 text-xs text-gray-500"><Users size={14} /> Siswa terdata</div>
          <p className="mt-1 text-2xl font-bold text-gray-800 dark:text-gray-100">{siswa.length}</p>
        </div>
      </div>

      {/* Tab */}
      <div className="flex gap-1 rounded-xl border bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
        {([
          ['peringatan', 'Peringatan Dini'],
          ['pelanggaran', 'Pelanggaran'],
          ['konseling', 'Konseling'],
        ] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              tab === k ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {memuat ? (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">Memuat…</div>
      ) : tab === 'peringatan' ? (
        /* ================= PERINGATAN DINI ================= */
        <div className="space-y-3">
          <div className="rounded-xl border bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
            Ambang poin: waspada <strong>{ambang.waspada ?? 25}</strong> ·
            panggilan 1 <strong>{ambang.panggilan1 ?? 50}</strong> ·
            panggilan 2 <strong>{ambang.panggilan2 ?? 75}</strong> ·
            skorsing <strong>{ambang.skorsing ?? 100}</strong>.
            Angka ini bisa diubah admin, tidak perlu deploy.
          </div>

          {peringatan.length === 0 ? (
            <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">
              <ShieldAlert size={42} className="mx-auto mb-3 opacity-60" />
              <p>Belum ada siswa yang melewati ambang peringatan.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white dark:border-gray-800 dark:bg-gray-900">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Siswa</th>
                    <th className="px-4 py-3">Rombel</th>
                    <th className="px-4 py-3 text-right">Poin</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Sesi terakhir</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-800">
                  {peringatan.map(r => (
                    <tr key={r.siswa_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800 dark:text-gray-100">{r.nama}</p>
                        <p className="text-xs text-gray-500">{r.nis || '-'}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.rombel_nama || '-'}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-800 dark:text-gray-100">{r.total_poin}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${WARNA_STATUS[r.status.warna] || WARNA_STATUS.hijau}`}>
                          {r.status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{r.sesi_terakhir || 'belum ada'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : tab === 'pelanggaran' ? (
        /* ================= PELANGGARAN ================= */
        <div className="space-y-3">
          <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <p className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-100">Catat pelanggaran</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs text-gray-500">Siswa
                <select value={formPelanggaran.siswa_id} onChange={e => setFormPelanggaran(f => ({ ...f, siswa_id: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                  <option value="">-- Pilih --</option>
                  {siswaUrut.map(s => <option key={s.id} value={s.id}>{s.nama} {s.nis ? `(${s.nis})` : ''}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">Tanggal
                <input type="date" value={formPelanggaran.tanggal} onChange={e => setFormPelanggaran(f => ({ ...f, tanggal: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="text-xs text-gray-500">Jenis pelanggaran
                <input value={formPelanggaran.jenis} onChange={e => setFormPelanggaran(f => ({ ...f, jenis: e.target.value }))} placeholder="Contoh: Terlambat masuk" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="text-xs text-gray-500">Tingkat
                <select value={formPelanggaran.tingkat} onChange={e => setFormPelanggaran(f => ({ ...f, tingkat: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                  <option value="ringan">Ringan (5 poin)</option>
                  <option value="sedang">Sedang (15 poin)</option>
                  <option value="berat">Berat (40 poin)</option>
                </select>
              </label>
              <label className="text-xs text-gray-500">Poin (kosongkan = otomatis)
                <input type="number" min={0} value={formPelanggaran.poin} onChange={e => setFormPelanggaran(f => ({ ...f, poin: e.target.value }))} placeholder="Otomatis" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="text-xs text-gray-500 md:col-span-2">Keterangan
                <input value={formPelanggaran.keterangan} onChange={e => setFormPelanggaran(f => ({ ...f, keterangan: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <div className="flex items-end">
                <button onClick={simpanPelanggaran} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white">
                  <Plus size={16} /> Tambah
                </button>
              </div>
            </div>
          </div>

          {pelanggaran.length === 0 ? (
            <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">
              <AlertTriangle size={42} className="mx-auto mb-3 opacity-60" />
              <p>Belum ada pelanggaran tercatat.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pelanggaran.map(p => (
                <div key={p.id} className="flex items-start justify-between gap-3 rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">{namaSiswa.get(p.siswa_id) || '(siswa dihapus)'}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{p.jenis} · <span className="capitalize">{p.tingkat}</span> · {p.poin} poin</p>
                    <p className="mt-0.5 text-xs text-gray-500">{p.tanggal} · dicatat {p.pencatat_nama || '-'}</p>
                    {p.keterangan && <p className="mt-1 text-xs text-gray-500">{p.keterangan}</p>}
                  </div>
                  <button onClick={() => hapus('pelanggaran', p.id)} className="shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" title="Hapus">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ================= KONSELING ================= */
        <div className="space-y-3">
          <div className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
              <Lock size={15} className="text-primary" /> Sesi konseling baru
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-xs text-gray-500">Siswa
                <select value={formSesi.siswa_id} onChange={e => setFormSesi(f => ({ ...f, siswa_id: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                  <option value="">-- Pilih --</option>
                  {siswaUrut.map(s => <option key={s.id} value={s.id}>{s.nama} {s.nis ? `(${s.nis})` : ''}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">Tanggal
                <input type="date" value={formSesi.tanggal} onChange={e => setFormSesi(f => ({ ...f, tanggal: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="text-xs text-gray-500">Jenis kasus
                <select value={formSesi.jenis_kasus} onChange={e => setFormSesi(f => ({ ...f, jenis_kasus: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                  {Object.entries(LABEL_KASUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">Judul sesi
                <input value={formSesi.judul} onChange={e => setFormSesi(f => ({ ...f, judul: e.target.value }))} placeholder="Contoh: Pendampingan belajar" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="text-xs text-gray-500 md:col-span-2">Ringkasan (privat)
                <textarea rows={3} value={formSesi.ringkasan} onChange={e => setFormSesi(f => ({ ...f, ringkasan: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="text-xs text-gray-500 md:col-span-2">Tindak lanjut
                <textarea rows={2} value={formSesi.tindak_lanjut} onChange={e => setFormSesi(f => ({ ...f, tindak_lanjut: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <input type="checkbox" checked={formSesi.rahasia} onChange={e => setFormSesi(f => ({ ...f, rahasia: e.target.checked }))} />
                Tandai privat (isi hanya terlihat admin/kepala)
              </label>
              <div className="flex items-end justify-end">
                <button onClick={simpanSesi} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white">
                  <Save size={16} /> Simpan sesi
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Eye size={15} className="text-gray-400" />
            <select value={filterSiswa} onChange={e => setFilterSiswa(e.target.value)} className="rounded-lg border px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800">
              <option value="">Semua siswa</option>
              {siswaUrut.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
            </select>
          </div>

          {sesiTampil.length === 0 ? (
            <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">
              <HeartHandshake size={42} className="mx-auto mb-3 opacity-60" />
              <p>Belum ada sesi konseling.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sesiTampil.map(s => (
                <div key={s.id} className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 dark:text-gray-100">
                        {s.judul || '(tanpa judul)'}
                        {Number(s.rahasia) === 1 && <span className="ml-1.5 inline-flex items-center gap-1 align-middle text-[11px] font-semibold text-amber-600"><Lock size={11} /> privat</span>}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {namaSiswa.get(s.siswa_id) || '(siswa dihapus)'} · {LABEL_KASUS[s.jenis_kasus] || s.jenis_kasus}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">{s.tanggal} · {s.konselor_nama || '-'} · status {s.status}</p>
                    </div>
                    <button onClick={() => hapus('sesi', s.id)} className="shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" title="Hapus">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {s.ringkasan && <p className="mt-2 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">{s.ringkasan}</p>}
                  {s.tindak_lanjut && <p className="mt-1.5 text-xs text-gray-500"><strong>Tindak lanjut:</strong> {s.tindak_lanjut}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
