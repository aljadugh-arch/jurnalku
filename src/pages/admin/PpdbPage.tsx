import { useState, useEffect, useCallback } from 'react'
import { ClipboardList, Plus, RefreshCw, CheckCircle2, XCircle, UserPlus, Loader2, Settings2, Trash2, Users, Search, Link2, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface Gelombang {
  id: string; nama: string; tahun_ajaran: string | null; tanggal_buka: string | null
  tanggal_tutup: string | null; kuota: number; biaya: number; dibuka: number; keterangan: string | null
}
interface Pendaftar {
  id: string; nomor_daftar: string; nama: string; jenis_kelamin: string; nisn: string | null
  no_hp: string | null; nama_ortu: string | null; asal_sekolah: string | null
  status: string; catatan: string | null; gelombang_id: string | null
  daftar_ulang_at: string | null; diterima_at: string | null; created_at: string
}
interface Ringkas { total: number; baru: number; terverifikasi: number; ditolak: number; daftar_ulang: number; diterima: number; mengundurkan: number; antrian_siswa: number }

const STATUS_LABEL: Record<string, string> = {
  baru: 'Baru', terverifikasi: 'Terverifikasi', ditolak: 'Ditolak',
  daftar_ulang: 'Daftar Ulang', diterima: 'Diterima', mengundurkan: 'Mengundurkan',
}
const STATUS_WARNA: Record<string, string> = {
  baru: 'bg-gray-100 text-gray-700', terverifikasi: 'bg-blue-100 text-blue-700',
  ditolak: 'bg-red-100 text-red-700', daftar_ulang: 'bg-amber-100 text-amber-700',
  diterima: 'bg-green-100 text-green-700', mengundurkan: 'bg-gray-200 text-gray-500',
}

const gelombangKosong = { id: '', nama: '', tahun_ajaran: '', tanggal_buka: '', tanggal_tutup: '', kuota: 0, biaya: 0, dibuka: false, keterangan: '' }

export default function PpdbPage() {
  const [tab, setTab] = useState<'pendaftar' | 'antrian' | 'gelombang' | 'pengaturan'>('pendaftar')
  const [ringkas, setRingkas] = useState<Ringkas | null>(null)
  const [pendaftar, setPendaftar] = useState<Pendaftar[]>([])
  const [antrian, setAntrian] = useState<Pendaftar[]>([])
  const [gelombang, setGelombang] = useState<Gelombang[]>([])
  const [loading, setLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [cari, setCari] = useState('')
  const [formGel, setFormGel] = useState<typeof gelombangKosong>(gelombangKosong)
  const [pilih, setPilih] = useState<string[]>([])
  const [proses, setProses] = useState(false)
  // Pengaturan kustom PPDB (nama sebutan + judul + link publik).
  const [pengaturan, setPengaturan] = useState<{ nama: string; judul: string; url_publik: string | null }>({ nama: 'PPDB', judul: 'Pendaftaran Siswa Baru', url_publik: null })
  const [formPengaturan, setFormPengaturan] = useState({ nama: 'PPDB', judul: 'Pendaftaran Siswa Baru' })
  const [tersalin, setTersalin] = useState(false)
  const [simpanPengaturanBusy, setSimpanPengaturanBusy] = useState(false)

  const muat = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get('/ppdb/ringkasan').then(({ data }) => setRingkas(data)).catch(() => {}),
      api.get('/ppdb/pendaftar', { params: { status: filterStatus || undefined, cari: cari || undefined } }).then(({ data }) => setPendaftar(data)).catch(() => {}),
      api.get('/ppdb/antrian').then(({ data }) => setAntrian(data)).catch(() => {}),
      api.get('/ppdb/gelombang').then(({ data }) => setGelombang(data)).catch(() => {}),
      api.get('/ppdb/pengaturan').then(({ data }) => {
        setPengaturan(data || { nama: 'PPDB', judul: 'Pendaftaran Siswa Baru', url_publik: null })
        setFormPengaturan({ nama: data?.nama || 'PPDB', judul: data?.judul || 'Pendaftaran Siswa Baru' })
      }).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [filterStatus, cari])

  useEffect(() => { muat() }, [muat])

  const ubahStatus = async (id: string, status: string) => {
    try { await api.put(`/ppdb/pendaftar/${id}/status`, { status }); toast.success('Status diperbarui'); muat() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal mengubah status') }
  }
  const tandaiDaftarUlang = async (id: string) => {
    try { await api.post(`/ppdb/pendaftar/${id}/daftar-ulang`, {}); toast.success('Ditandai daftar ulang'); muat() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal') }
  }
  const terima = async (id: string, nis?: string) => {
    try {
      const { data } = await api.post(`/ppdb/antrian/${id}/terima`, { nis: nis || undefined })
      toast.success(`Diterima sebagai siswa — NIS ${data.nis}`); muat()
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal menerima') }
  }
  const terimaTerpilih = async () => {
    if (!pilih.length) { toast.error('Pilih pendaftar dulu'); return }
    setProses(true)
    try {
      const { data } = await api.post('/ppdb/antrian/terima-banyak', { ids: pilih })
      toast.success(`${data.berhasil} dari ${data.total} berhasil diterima`)
      setPilih([]); muat()
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal') }
    finally { setProses(false) }
  }
  const simpanGelombang = async () => {
    if (!formGel.nama.trim()) { toast.error('Nama gelombang wajib diisi'); return }
    try {
      if (formGel.id) await api.put(`/ppdb/gelombang/${formGel.id}`, formGel)
      else await api.post('/ppdb/gelombang', formGel)
      toast.success('Gelombang disimpan'); setFormGel(gelombangKosong); muat()
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal menyimpan') }
  }
  const hapusGelombang = async (id: string) => {
    try { await api.delete(`/ppdb/gelombang/${id}`); toast.success('Gelombang dihapus'); muat() }
    catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal menghapus') }
  }
  const togglePilih = (id: string) => setPilih(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const simpanPengaturan = async () => {
    if (!formPengaturan.nama.trim()) { toast.error('Nama sebutan wajib diisi'); return }
    setSimpanPengaturanBusy(true)
    try {
      await api.put('/ppdb/pengaturan', formPengaturan)
      toast.success('Pengaturan PPDB disimpan')
      muat()
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal menyimpan pengaturan') }
    finally { setSimpanPengaturanBusy(false) }
  }
  const salinLink = async () => {
    const url = pengaturan.url_publik || `${window.location.origin}/ppdb`
    try {
      await navigator.clipboard.writeText(url)
      setTersalin(true); setTimeout(() => setTersalin(false), 2000)
      toast.success('Tautan PPDB disalin')
    } catch {
      // Fallback bila clipboard ditolak (HTTP/perizinan).
      const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); toast.success('Tautan PPDB disalin') } catch { toast.error('Gagal menyalin — salin manual: ' + url) }
      document.body.removeChild(ta)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2"><ClipboardList size={22} /> {pengaturan.nama} — {pengaturan.judul}</h1>
          <p className="text-sm text-gray-500 mt-1">Kelola pendaftaran, verifikasi berkas, daftar ulang, dan antrian masuk siswa aktif.</p>
        </div>
        <button onClick={muat} disabled={loading} className="flex items-center gap-1 text-sm text-primary hover:underline disabled:opacity-50">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Muat ulang
        </button>
      </div>

      {ringkas && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          {[
            { label: 'Total', nilai: ringkas.total, warna: 'text-gray-800' },
            { label: 'Baru', nilai: ringkas.baru, warna: 'text-gray-700' },
            { label: 'Terverifikasi', nilai: ringkas.terverifikasi, warna: 'text-blue-700' },
            { label: 'Daftar Ulang', nilai: ringkas.daftar_ulang, warna: 'text-amber-700' },
            { label: 'Diterima', nilai: ringkas.diterima, warna: 'text-green-700' },
            { label: 'Ditolak', nilai: ringkas.ditolak, warna: 'text-red-700' },
          ].map(k => (
            <div key={k.label} className="rounded-xl border bg-white p-3">
              <div className="text-xs text-gray-500">{k.label}</div>
              <div className={`text-xl font-bold tabular-nums ${k.warna}`}>{k.nilai}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-4 border-b">
        {([['pendaftar', 'Pendaftar'], ['antrian', `Antrian Siswa${antrian.length ? ` (${antrian.length})` : ''}`], ['gelombang', 'Gelombang'], ['pengaturan', 'Pengaturan']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>

      {tab === 'pendaftar' && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-gray-50">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm">
              <option value="">Semua status</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari nama / nomor / NISN…" className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-sm" />
            </div>
          </div>
          <div className="divide-y">
            {pendaftar.map(p => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-[220px]">
                  <div className="text-sm font-medium text-gray-800">{p.nama}</div>
                  <div className="text-xs text-gray-400">
                    {p.nomor_daftar} · {p.jenis_kelamin} {p.nisn ? `· NISN ${p.nisn}` : ''} {p.asal_sekolah ? `· ${p.asal_sekolah}` : ''}
                  </div>
                  {p.catatan && <div className="text-xs text-amber-600 mt-0.5">{p.catatan}</div>}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_WARNA[p.status] || 'bg-gray-100'}`}>{STATUS_LABEL[p.status] || p.status}</span>
                <div className="flex items-center gap-1.5">
                  {p.status === 'baru' && <>
                    <button onClick={() => ubahStatus(p.id, 'terverifikasi')} title="Verifikasi" className="p-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50"><CheckCircle2 size={15} /></button>
                    <button onClick={() => ubahStatus(p.id, 'ditolak')} title="Tolak" className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><XCircle size={15} /></button>
                  </>}
                  {p.status === 'terverifikasi' && <button onClick={() => tandaiDaftarUlang(p.id)} className="flex items-center gap-1 rounded-lg border border-amber-300 px-2.5 py-1 text-xs text-amber-700 hover:bg-amber-50"><CheckCircle2 size={13} /> Daftar ulang</button>}
                  {p.status === 'daftar_ulang' && <button onClick={() => terima(p.id)} className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs text-white hover:bg-green-700"><UserPlus size={13} /> Terima jadi siswa</button>}
                </div>
              </div>
            ))}
            {!pendaftar.length && <div className="px-4 py-8 text-center text-sm text-gray-400">{loading ? 'Memuat…' : 'Belum ada pendaftar'}</div>}
          </div>
        </div>
      )}

      {tab === 'antrian' && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b bg-gray-50">
            <div className="text-sm text-gray-600 flex items-center gap-2"><Users size={15} /> Pendaftar yang sudah daftar ulang — siap dimasukkan sebagai siswa aktif.</div>
            <button onClick={terimaTerpilih} disabled={proses || !pilih.length} className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
              {proses ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Terima terpilih ({pilih.length})
            </button>
          </div>
          <div className="divide-y">
            {antrian.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <input type="checkbox" checked={pilih.includes(p.id)} onChange={() => togglePilih(p.id)} className="w-4 h-4" />
                <div className="flex-1 min-w-[200px]">
                  <div className="text-sm font-medium text-gray-800">{p.nama}</div>
                  <div className="text-xs text-gray-400">{p.nomor_daftar} · {p.jenis_kelamin} {p.nisn ? `· NISN ${p.nisn}` : ''} · daftar ulang {p.daftar_ulang_at || '-'}</div>
                </div>
                <button onClick={() => terima(p.id)} className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700"><UserPlus size={13} /> Terima</button>
              </div>
            ))}
            {!antrian.length && <div className="px-4 py-8 text-center text-sm text-gray-400">Antrian kosong — belum ada pendaftar yang daftar ulang.</div>}
          </div>
        </div>
      )}

      {tab === 'gelombang' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3"><Settings2 size={15} /> {formGel.id ? 'Ubah Gelombang' : 'Tambah Gelombang'}</h3>
            <div className="space-y-3">
              <div><label className="block text-xs text-gray-600 mb-1">Nama gelombang *</label><input value={formGel.nama} onChange={e => setFormGel({ ...formGel, nama: e.target.value })} placeholder="Gelombang 1" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="block text-xs text-gray-600 mb-1">Tahun ajaran</label><input value={formGel.tahun_ajaran} onChange={e => setFormGel({ ...formGel, tahun_ajaran: e.target.value })} placeholder="2026/2027" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-600 mb-1">Tanggal buka</label><input type="date" value={formGel.tanggal_buka || ''} onChange={e => setFormGel({ ...formGel, tanggal_buka: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs text-gray-600 mb-1">Tanggal tutup</label><input type="date" value={formGel.tanggal_tutup || ''} onChange={e => setFormGel({ ...formGel, tanggal_tutup: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-600 mb-1">Kuota</label><input type="number" value={formGel.kuota} onChange={e => setFormGel({ ...formGel, kuota: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs text-gray-600 mb-1">Biaya pendaftaran</label><input type="number" value={formGel.biaya} onChange={e => setFormGel({ ...formGel, biaya: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <div><label className="block text-xs text-gray-600 mb-1">Keterangan</label><textarea value={formGel.keterangan || ''} onChange={e => setFormGel({ ...formGel, keterangan: e.target.value })} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!formGel.dibuka} onChange={e => setFormGel({ ...formGel, dibuka: e.target.checked })} className="w-4 h-4" /><span className="text-sm text-gray-700">Buka pendaftaran (formulir publik aktif)</span></label>
              <div className="flex gap-2">
                <button onClick={simpanGelombang} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white"><Plus size={15} /> Simpan</button>
                {formGel.id && <button onClick={() => setFormGel(gelombangKosong)} className="rounded-lg border px-4 py-2 text-sm text-gray-600">Batal</button>}
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-white overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">Daftar Gelombang</div>
            <div className="divide-y">
              {gelombang.map(g => (
                <div key={g.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-800">{g.nama} {g.dibuka ? <span className="text-xs text-green-600">· DIBUKA</span> : <span className="text-xs text-gray-400">· ditutup</span>}</div>
                    <div className="text-xs text-gray-400">{g.tahun_ajaran || '-'} · kuota {g.kuota || '∞'} {g.biaya ? `· Rp ${g.biaya.toLocaleString('id-ID')}` : ''}</div>
                  </div>
                  <button onClick={() => setFormGel({ ...g, dibuka: !!g.dibuka, tanggal_buka: g.tanggal_buka || '', tanggal_tutup: g.tanggal_tutup || '', tahun_ajaran: g.tahun_ajaran || '', keterangan: g.keterangan || '' })} className="p-1.5 rounded-lg border text-gray-600 hover:bg-gray-50"><Settings2 size={15} /></button>
                  <button onClick={() => hapusGelombang(g.id)} className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
                </div>
              ))}
              {!gelombang.length && <div className="px-4 py-8 text-center text-sm text-gray-400">Belum ada gelombang</div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'pengaturan' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3"><Settings2 size={15} /> Sebutan & Judul</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Nama sebutan *</label>
                <input value={formPengaturan.nama} onChange={e => setFormPengaturan({ ...formPengaturan, nama: e.target.value })}
                  placeholder="PPDB / SPMB / PSB / Penerimaan Santri Baru" className="w-full px-3 py-2 border rounded-lg text-sm" />
                <p className="text-xs text-gray-400 mt-1">Dipakai di judul halaman, formulir publik, dan nomor pendaftaran (mis. SPMB-2026-0001).</p>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Judul halaman publik</label>
                <input value={formPengaturan.judul} onChange={e => setFormPengaturan({ ...formPengaturan, judul: e.target.value })}
                  placeholder="Pendaftaran Siswa Baru" className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <button onClick={simpanPengaturan} disabled={simpanPengaturanBusy}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-50">
                {simpanPengaturanBusy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Simpan pengaturan
              </button>
            </div>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3"><Link2 size={15} /> Tautan Formulir Publik</h3>
            <p className="text-xs text-gray-500 mb-3">Bagikan tautan ini agar calon siswa/wali bisa mendaftar mandiri tanpa akun.</p>
            {pengaturan.url_publik ? (
              <div className="flex items-center gap-2 rounded-lg border bg-gray-50 px-3 py-2">
                <input readOnly value={pengaturan.url_publik} className="flex-1 bg-transparent text-sm font-mono text-gray-700 outline-none" />
                <button onClick={salinLink} className="flex items-center gap-1.5 shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">
                  {tersalin ? <Check size={13} /> : <Copy size={13} />} {tersalin ? 'Tersalin' : 'Salin'}
                </button>
              </div>
            ) : (
              <div className="rounded-lg border bg-amber-50 px-3 py-2 text-xs text-amber-700">Tautan publik belum tersedia — pastikan lembaga punya domain aktif.</div>
            )}
            <button onClick={() => window.open(pengaturan.url_publik || `${window.location.origin}/ppdb`, '_blank')} className="mt-3 text-sm text-primary hover:underline">Buka formulir publik ↗</button>
          </div>
        </div>
      )}
    </div>
  )
}
