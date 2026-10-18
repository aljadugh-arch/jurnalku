import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  BookOpen, Plus, Search, Trash2, Undo2, Users, AlertTriangle,
  CalendarClock, Library, Save, X, ArrowLeftRight, Upload, ScanLine,
} from 'lucide-react'
import api from '../../services/api'
import ImportExcel from '../../components/ImportExcel'
import SearchInput from '../../components/SearchInput'

// ============================================================================
// Sirkulasi Perpustakaan
//
// Sebelumnya modul perpustakaan hanya menyimpan satu link Google Drive: tidak
// ada katalog, tidak ada catatan pinjam, tidak ada jatuh tempo. Halaman ini
// mengisi kekosongan itu dengan katalog buku + sirkulasi nyata.
//
// Stok TIDAK disimpan sebagai angka. Server menghitungnya dari jumlah salinan
// dikurangi peminjaman aktif, jadi angka tidak bisa melenceng.
// ============================================================================

type Tab = 'katalog' | 'pinjam'

type Buku = {
  id: string
  judul: string
  pengarang: string
  penerbit: string
  tahun: number | null
  isbn: string
  kategori: string
  rak: string
  jumlah_salinan: number
  dipinjam: number
  tersedia: number
  aktif: number
}

type Pinjam = {
  id: string
  buku_id: string
  judul: string | null
  peminjam_nama: string
  peminjam_kelas: string
  tanggal_pinjam: string
  jatuh_tempo: string
  tanggal_kembali: string | null
  denda: number
  denda_berjalan: number
  terlambat: number
}

type Stat = {
  totalJudul: number
  totalSalinan: number
  dipinjam: number
  tersedia: number
  terlambat: number
  dendaBelumBayar: number
  tarifDenda: number
  lamaPinjam: number
}

const KOSONG = {
  judul: '', pengarang: '', penerbit: '', tahun: '', isbn: '',
  kategori: '', rak: '', jumlah_salinan: 1, keterangan: '',
}

const rupiah = (n: number) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID')

export default function PustakaPage() {
  const [tab, setTab] = useState<Tab>('katalog')
  const [buku, setBuku] = useState<Buku[]>([])
  const [pinjam, setPinjam] = useState<Pinjam[]>([])
  const [stat, setStat] = useState<Stat | null>(null)
  const [siswa, setSiswa] = useState<any[]>([])
  const [memuat, setMemuat] = useState(true)
  const [cari, setCari] = useState('')
  const [formBuka, setFormBuka] = useState(false)
  const [form, setForm] = useState<any>(KOSONG)
  const [pinjamBuka, setPinjamBuka] = useState(false)
  const [formPinjam, setFormPinjam] = useState({ buku_id: '', siswa_id: '', catatan: '' })
  const [imporBuka, setImporBuka] = useState(false)
  const [isbn, setIsbn] = useState('')
  const [hasilIsbn, setHasilIsbn] = useState<any[] | null>(null)

  const muat = async () => {
    setMemuat(true)
    try {
      const [b, p, s, sw] = await Promise.all([
        api.get('/pustaka/buku'),
        api.get('/pustaka/pinjam?status=aktif'),
        api.get('/pustaka/statistik'),
        api.get('/siswa?status=aktif'),
      ])
      setBuku(Array.isArray(b.data) ? b.data : [])
      setPinjam(Array.isArray(p.data) ? p.data : [])
      setStat(s.data || null)
      setSiswa(Array.isArray(sw.data) ? sw.data : [])
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal memuat data perpustakaan')
    } finally {
      setMemuat(false)
    }
  }

  useEffect(() => { muat() }, [])

  const bukuTampil = useMemo(() => {
    const q = cari.trim().toLowerCase()
    if (!q) return buku
    return buku.filter(b =>
      String(b.judul).toLowerCase().includes(q) ||
      String(b.pengarang).toLowerCase().includes(q) ||
      String(b.isbn).includes(q) ||
      String(b.kategori).toLowerCase().includes(q),
    )
  }, [buku, cari])

  const siswaUrut = useMemo(
    () => [...siswa].sort((a, b) => String(a.nama).localeCompare(String(b.nama))),
    [siswa],
  )

  const simpanBuku = async () => {
    if (!String(form.judul).trim()) return toast.error('Judul buku wajib diisi')
    try {
      await api.post('/pustaka/buku', form)
      toast.success('Buku ditambahkan')
      setForm(KOSONG); setFormBuka(false)
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan buku')
    }
  }

  const hapusBuku = async (b: Buku) => {
    if (b.dipinjam > 0) return toast.error(`Masih dipinjam ${b.dipinjam} eksemplar`)
    if (!confirm(`Hapus "${b.judul}" dari katalog?`)) return
    try {
      await api.delete(`/pustaka/buku/${b.id}`)
      toast.success('Buku dihapus')
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menghapus')
    }
  }

  const simpanPinjam = async () => {
    if (!formPinjam.buku_id) return toast.error('Pilih buku dulu')
    if (!formPinjam.siswa_id) return toast.error('Pilih siswa peminjam')
    try {
      const r = await api.post('/pustaka/pinjam', formPinjam)
      toast.success(`Dipinjam sampai ${r.data?.jatuh_tempo || '-'}`)
      setFormPinjam({ buku_id: '', siswa_id: '', catatan: '' }); setPinjamBuka(false)
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal mencatat peminjaman')
    }
  }

  const kembalikan = async (p: Pinjam) => {
    const telat = p.terlambat === 1
    if (!confirm(
      `Kembalikan "${p.judul || 'buku'}" dari ${p.peminjam_nama}?` +
      (telat ? `\n\nTERLAMBAT. Denda berjalan ${rupiah(p.denda_berjalan)} akan dicatat.` : '')
    )) return
    try {
      const r = await api.post(`/pustaka/pinjam/${p.id}/kembali`, {})
      const d = r.data?.denda || 0
      toast.success(d > 0 ? `Dikembalikan · denda ${rupiah(d)}` : 'Dikembalikan, tanpa denda')
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal mengembalikan')
    }
  }

  const perpanjang = async (p: Pinjam) => {
    try {
      const r = await api.post(`/pustaka/pinjam/${p.id}/perpanjang`, {})
      toast.success(`Diperpanjang sampai ${r.data?.jatuh_tempo || '-'}`)
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal memperpanjang')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-display font-bold text-gray-800 dark:text-gray-100">
            <Library size={22} className="text-primary" /> Perpustakaan
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Katalog koleksi, peminjaman, jatuh tempo, dan denda.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setForm(KOSONG); setFormBuka(true) }} className="inline-flex items-center gap-2 rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5">
            <Plus size={15} /> Buku
          </button>
          <button onClick={() => setImporBuka(true)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
            <Upload size={15} /> Impor Excel
          </button>
          <button onClick={() => setPinjamBuka(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-white">
            <ArrowLeftRight size={15} /> Pinjamkan
          </button>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Judul', stat?.totalJudul ?? 0, BookOpen, ''],
          ['Salinan', stat?.totalSalinan ?? 0, Library, ''],
          ['Dipinjam', stat?.dipinjam ?? 0, Users, ''],
          ['Terlambat', stat?.terlambat ?? 0, AlertTriangle, (stat?.terlambat ?? 0) > 0 ? 'text-red-600' : ''],
          ['Denda', rupiah(stat?.dendaBelumBayar ?? 0), CalendarClock, (stat?.dendaBelumBayar ?? 0) > 0 ? 'text-amber-600' : ''],
        ].map(([label, nilai, Ikon, warna]: any) => (
          <div key={label} className="rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-2 text-xs text-gray-500"><Ikon size={14} /> {label}</div>
            <p className={`mt-1 text-xl font-bold ${warna || 'text-gray-800 dark:text-gray-100'}`}>{nilai}</p>
          </div>
        ))}
      </div>

      {stat && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Lama pinjam {stat.lamaPinjam} hari · denda {rupiah(stat.tarifDenda)}/hari keterlambatan.
        </p>
      )}

      {/* Tab */}
      <div className="flex gap-1 rounded-xl border bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
        {([['katalog', 'Katalog Buku'], ['pinjam', `Sedang Dipinjam${pinjam.length ? ` (${pinjam.length})` : ''}`]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              tab === k ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}>{label}</button>
        ))}
      </div>

      {memuat ? (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">Memuat…</div>
      ) : tab === 'katalog' ? (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <SearchInput value={cari} onChange={setCari}
              placeholder="Cari judul, pengarang, ISBN, atau kategori…" jumlah={bukuTampil.length} />
            {/* Cek ISBN: untuk scanner barcode. Tempel/scan ISBN di sini untuk
                tahu apakah buku sudah terdaftar sebelum menambah baru. */}
            <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
              <ScanLine size={15} className="shrink-0 text-gray-400" />
              <input value={isbn} onChange={e => setIsbn(e.target.value)}
                onKeyDown={async e => {
                  if (e.key !== 'Enter' || !isbn.trim()) return
                  try {
                    const r = await api.get(`/pustaka/buku/cari-isbn?isbn=${encodeURIComponent(isbn)}`)
                    setHasilIsbn(Array.isArray(r.data?.ditemukan) ? r.data.ditemukan : [])
                  } catch { toast.error('Gagal mencari ISBN') }
                }}
                placeholder="Scan / tempel ISBN lalu Enter…"
                className="w-full min-w-0 bg-transparent text-sm outline-none dark:text-gray-100" />
              {hasilIsbn && (
                <button onClick={() => { setHasilIsbn(null); setIsbn('') }} className="shrink-0 text-xs text-gray-400">
                  {hasilIsbn.length} hasil
                </button>
              )}
            </div>
          </div>

          {hasilIsbn && (
            <div className="rounded-xl border bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
              {hasilIsbn.length === 0
                ? <>ISBN <strong>{isbn}</strong> belum terdaftar — aman ditambahkan sebagai buku baru.</>
                : <>Sudah terdaftar: {hasilIsbn.map(b => `${b.judul} (${b.tersedia} tersedia)`).join(' · ')}</>}
            </div>
          )}

          {bukuTampil.length === 0 ? (
            <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">
              <BookOpen size={42} className="mx-auto mb-3 opacity-60" />
              <p>Belum ada buku di katalog.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white dark:border-gray-800 dark:bg-gray-900">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Judul</th>
                    <th className="px-4 py-3">Pengarang</th>
                    <th className="px-4 py-3">Kategori</th>
                    <th className="px-4 py-3">Rak</th>
                    <th className="px-4 py-3 text-center">Salinan</th>
                    <th className="px-4 py-3 text-center">Tersedia</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-800">
                  {bukuTampil.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800 dark:text-gray-100">{b.judul}</p>
                        <p className="text-xs text-gray-500">{b.penerbit}{b.tahun ? ` · ${b.tahun}` : ''}{b.isbn ? ` · ${b.isbn}` : ''}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{b.pengarang || '-'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{b.kategori || '-'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{b.rak || '-'}</td>
                      <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{b.jumlah_salinan}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          b.tersedia > 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                         : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                        }`}>{b.tersedia}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => hapusBuku(b)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" title="Hapus buku">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : pinjam.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">
          <ArrowLeftRight size={42} className="mx-auto mb-3 opacity-60" />
          <p>Tidak ada buku yang sedang dipinjam.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pinjam.map(p => (
            <div key={p.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <div className="min-w-0">
                <p className="font-semibold text-gray-800 dark:text-gray-100">{p.judul || '(buku dihapus)'}</p>
                <p className="text-xs text-gray-500">{p.peminjam_nama}{p.peminjam_kelas ? ` · ${p.peminjam_kelas}` : ''}</p>
                <p className="mt-1 text-xs text-gray-500">
                  Pinjam {p.tanggal_pinjam} · jatuh tempo {p.jatuh_tempo}
                </p>
                {p.terlambat === 1 && (
                  <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-400">
                    <AlertTriangle size={11} /> Terlambat · denda {rupiah(p.denda_berjalan)}
                  </p>
                )}
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => perpanjang(p)} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:hover:bg-blue-950/30">
                  Perpanjang
                </button>
                <button onClick={() => kembalikan(p)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white">
                  <Undo2 size={13} /> Kembali
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Impor Excel */}
      {imporBuka && (
        <ImportExcel
          title="Impor Buku dari Excel"
          templateName="template-buku.xlsx"
          headerRow={0}
          columnMap={{
            'Judul': 'judul', 'Pengarang': 'pengarang', 'Penerbit': 'penerbit',
            'Tahun': 'tahun', 'ISBN': 'isbn', 'Kategori': 'kategori',
            'Rak': 'rak', 'Jumlah Salinan': 'jumlah_salinan', 'Keterangan': 'keterangan',
          }}
          aliases={{ 'Jumlah': 'jumlah_salinan', 'Stock': 'jumlah_salinan', 'Penulis': 'pengarang' }}
          sampleRows={[{
            judul: 'Matematika Kelas VIII', pengarang: 'Kemendikbud', penerbit: 'Pusat Kurikulum',
            tahun: '2021', isbn: '978-602-1234-56-7', kategori: 'Pelajaran', rak: 'R1',
            jumlah_salinan: '3', keterangan: '',
          }]}
          onImport={async (rows) => {
            const r = await api.post('/pustaka/buku/impor', { baris: rows })
            const d = r.data || {}
            if (d.gagal > 0) {
              throw new Error(`${d.berhasil} berhasil, ${d.gagal} gagal: ` +
                (d.detail || []).slice(0, 5).map((x: any) => `baris ${x.baris} (${x.error})`).join('; '))
            }
            await muat()
          }}
          onClose={() => setImporBuka(false)}
        />
      )}

      {/* Modal tambah buku */}
      {formBuka && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setFormBuka(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 dark:bg-gray-900" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-gray-800 dark:text-gray-100">Tambah buku</p>
              <button onClick={() => setFormBuka(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                ['judul', 'Judul *'], ['pengarang', 'Pengarang'], ['penerbit', 'Penerbit'],
                ['tahun', 'Tahun'], ['isbn', 'ISBN'], ['kategori', 'Kategori'], ['rak', 'Rak'],
              ] as [string, string][]).map(([k, label]) => (
                <label key={k} className="text-xs text-gray-500">{label}
                  <input value={form[k] ?? ''} onChange={e => setForm((f: any) => ({ ...f, [k]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
                </label>
              ))}
              <label className="text-xs text-gray-500">Jumlah salinan
                <input type="number" min={1} value={form.jumlah_salinan} onChange={e => setForm((f: any) => ({ ...f, jumlah_salinan: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
            </div>
            <button onClick={simpanBuku} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm text-white">
              <Save size={16} /> Simpan buku
            </button>
          </div>
        </div>
      )}

      {/* Modal pinjamkan */}
      {pinjamBuka && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPinjamBuka(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-gray-900" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-gray-800 dark:text-gray-100">Pinjamkan buku</p>
              <button onClick={() => setPinjamBuka(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs text-gray-500">Buku
                <select value={formPinjam.buku_id} onChange={e => setFormPinjam(f => ({ ...f, buku_id: e.target.value }))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                  <option value="">-- pilih buku yang tersedia --</option>
                  {buku.filter(b => b.tersedia > 0).map(b => (
                    <option key={b.id} value={b.id}>{b.judul} ({b.tersedia} tersedia)</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-gray-500">Peminjam
                <select value={formPinjam.siswa_id} onChange={e => setFormPinjam(f => ({ ...f, siswa_id: e.target.value }))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                  <option value="">-- pilih siswa --</option>
                  {siswaUrut.map(s => <option key={s.id} value={s.id}>{s.nama} {s.nis ? `(${s.nis})` : ''}</option>)}
                </select>
              </label>
              <label className="block text-xs text-gray-500">Catatan
                <input value={formPinjam.catatan} onChange={e => setFormPinjam(f => ({ ...f, catatan: e.target.value }))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              </label>
            </div>
            <button onClick={simpanPinjam} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm text-white">
              <ArrowLeftRight size={16} /> Catat peminjaman
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
