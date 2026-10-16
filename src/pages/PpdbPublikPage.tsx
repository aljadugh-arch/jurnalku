import { useState, useEffect } from 'react'
import { ClipboardList, CheckCircle2, Loader2, ArrowLeft, UserPlus, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../services/api'

interface Info {
  dibuka: boolean
  gelombang: { id: string; nama: string; tahun_ajaran: string | null; tanggal_buka: string | null; tanggal_tutup: string | null; kuota: number; biaya: number; keterangan: string | null } | null
}

export default function PpdbPublikPage() {
  const [info, setInfo] = useState<Info | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'daftar' | 'daftar-ulang'>('daftar')
  const [kirim, setKirim] = useState(false)
  const [hasil, setHasil] = useState<{ nomor: string; nama: string } | null>(null)
  const [form, setForm] = useState({
    nama: '', jenis_kelamin: '', nisn: '', nik: '', tempat_lahir: '', tanggal_lahir: '',
    alamat: '', no_hp: '', email: '', nama_ortu: '', no_hp_ortu: '', asal_sekolah: '',
  })
  const [du, setDu] = useState({ nomor_daftar: '', nisn: '' })
  const [hasilDu, setHasilDu] = useState<{ nama: string; status: string } | null>(null)

  useEffect(() => {
    api.get('/ppdb/publik/info').then(({ data }) => setInfo(data)).catch(() => setInfo({ dibuka: false, gelombang: null })).finally(() => setLoading(false))
  }, [])

  const kirimPendaftaran = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nama.trim() || !form.jenis_kelamin) { alert('Nama dan jenis kelamin wajib diisi'); return }
    setKirim(true)
    try {
      const { data } = await api.post('/ppdb/publik/daftar', form)
      setHasil({ nomor: data.nomor_daftar, nama: data.nama })
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Pendaftaran gagal. Coba lagi.')
    } finally { setKirim(false) }
  }

  const kirimDaftarUlang = async (e: React.FormEvent) => {
    e.preventDefault()
    setKirim(true)
    try {
      const { data } = await api.post('/ppdb/publik/daftar-ulang', du)
      setHasilDu({ nama: data.nama, status: data.status })
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Daftar ulang gagal.')
    } finally { setKirim(false) }
  }

  const inputKelas = 'w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none'
  const labelKelas = 'block text-xs font-medium text-gray-600 mb-1'

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Memuat…</div>

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-gray-600 hover:text-primary text-sm font-medium"><ArrowLeft size={17} /> Beranda</Link>
          <span className="text-sm font-semibold text-gray-700">PPDB Online</span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-3"><ClipboardList size={28} className="text-primary" /></div>
          <h1 className="text-2xl font-extrabold text-gray-900">Pendaftaran Siswa Baru</h1>
          {info?.gelombang && (
            <p className="text-sm text-gray-500 mt-2">
              {info.gelombang.nama}{info.gelombang.tahun_ajaran ? ` · ${info.gelombang.tahun_ajaran}` : ''}
              {info.gelombang.kuota ? ` · kuota ${info.gelombang.kuota}` : ''}
            </p>
          )}
        </div>

        {!info?.dibuka ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
            <p className="font-semibold text-amber-800">Pendaftaran belum dibuka</p>
            <p className="text-sm text-amber-700 mt-1">Silakan hubungi panitia PPDB lembaga untuk informasi jadwal pendaftaran.</p>
          </div>
        ) : hasil ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
            <CheckCircle2 size={40} className="text-green-600 mx-auto mb-3" />
            <p className="font-bold text-green-800 text-lg">Pendaftaran Berhasil</p>
            <p className="text-sm text-green-700 mt-1">Terima kasih, <b>{hasil.nama}</b>.</p>
            <div className="mt-4 rounded-xl bg-white border border-green-200 py-3">
              <div className="text-xs text-gray-500">Nomor Pendaftaran Anda</div>
              <div className="text-xl font-mono font-bold text-gray-800 tracking-wide">{hasil.nomor}</div>
            </div>
            <p className="text-xs text-green-700 mt-3">Simpan nomor ini. Gunakan untuk cek status dan daftar ulang.</p>
            <button onClick={() => { setHasil(null); setForm({ nama: '', jenis_kelamin: '', nisn: '', nik: '', tempat_lahir: '', tanggal_lahir: '', alamat: '', no_hp: '', email: '', nama_ortu: '', no_hp_ortu: '', asal_sekolah: '' }) }}
              className="mt-4 text-sm text-primary hover:underline">Daftarkan calon lain</button>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setTab('daftar')} className={`flex-1 rounded-lg py-2 text-sm font-medium border ${tab === 'daftar' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600'}`}>Formulir Pendaftaran</button>
              <button onClick={() => setTab('daftar-ulang')} className={`flex-1 rounded-lg py-2 text-sm font-medium border ${tab === 'daftar-ulang' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600'}`}>Daftar Ulang</button>
            </div>

            {info.gelombang?.keterangan && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 mb-4">{info.gelombang.keterangan}</div>
            )}

            {tab === 'daftar' ? (
              <form onSubmit={kirimPendaftaran} className="rounded-2xl border bg-white p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2"><label className={labelKelas}>Nama lengkap *</label><input required value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} className={inputKelas} placeholder="Nama sesuai akta" /></div>
                  <div><label className={labelKelas}>Jenis kelamin *</label><select required value={form.jenis_kelamin} onChange={e => setForm({ ...form, jenis_kelamin: e.target.value })} className={inputKelas}><option value="">— pilih —</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></div>
                  <div><label className={labelKelas}>NISN</label><input value={form.nisn} onChange={e => setForm({ ...form, nisn: e.target.value })} className={inputKelas} placeholder="10 digit" maxLength={10} /></div>
                  <div><label className={labelKelas}>NIK</label><input value={form.nik} onChange={e => setForm({ ...form, nik: e.target.value })} className={inputKelas} placeholder="16 digit" maxLength={16} /></div>
                  <div><label className={labelKelas}>Tempat lahir</label><input value={form.tempat_lahir} onChange={e => setForm({ ...form, tempat_lahir: e.target.value })} className={inputKelas} /></div>
                  <div><label className={labelKelas}>Tanggal lahir</label><input type="date" value={form.tanggal_lahir} onChange={e => setForm({ ...form, tanggal_lahir: e.target.value })} className={inputKelas} /></div>
                  <div><label className={labelKelas}>Asal sekolah</label><input value={form.asal_sekolah} onChange={e => setForm({ ...form, asal_sekolah: e.target.value })} className={inputKelas} /></div>
                  <div className="sm:col-span-2"><label className={labelKelas}>Alamat</label><textarea value={form.alamat} onChange={e => setForm({ ...form, alamat: e.target.value })} rows={2} className={inputKelas} /></div>
                  <div><label className={labelKelas}>Nama orang tua/wali</label><input value={form.nama_ortu} onChange={e => setForm({ ...form, nama_ortu: e.target.value })} className={inputKelas} /></div>
                  <div><label className={labelKelas}>No. HP orang tua/wali</label><input value={form.no_hp_ortu} onChange={e => setForm({ ...form, no_hp_ortu: e.target.value })} className={inputKelas} placeholder="08xx" /></div>
                  <div><label className={labelKelas}>No. HP calon</label><input value={form.no_hp} onChange={e => setForm({ ...form, no_hp: e.target.value })} className={inputKelas} placeholder="08xx" /></div>
                  <div><label className={labelKelas}>Email</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputKelas} /></div>
                </div>
                <button type="submit" disabled={kirim} className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-white disabled:opacity-50">
                  {kirim ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Kirim Pendaftaran
                </button>
                <p className="text-xs text-gray-400 text-center">Nomor pendaftaran akan muncul setelah formulir terkirim.</p>
              </form>
            ) : hasilDu ? (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
                <CheckCircle2 size={40} className="text-green-600 mx-auto mb-3" />
                <p className="font-bold text-green-800">Daftar Ulang Berhasil</p>
                <p className="text-sm text-green-700 mt-1">{hasilDu.nama} — status: <b>Daftar Ulang</b></p>
                <p className="text-xs text-green-700 mt-3">Silakan tunggu informasi selanjutnya dari panitia.</p>
              </div>
            ) : (
              <form onSubmit={kirimDaftarUlang} className="rounded-2xl border bg-white p-5 space-y-4">
                <p className="text-sm text-gray-600">Sudah mendaftar dan berkas sudah diverifikasi? Masukkan nomor pendaftaran untuk daftar ulang.</p>
                <div><label className={labelKelas}>Nomor pendaftaran *</label><input required value={du.nomor_daftar} onChange={e => setDu({ ...du, nomor_daftar: e.target.value.toUpperCase() })} className={inputKelas} placeholder="PPDB-2026-0001" /></div>
                <div><label className={labelKelas}>NISN (untuk verifikasi)</label><input value={du.nisn} onChange={e => setDu({ ...du, nisn: e.target.value })} className={inputKelas} placeholder="10 digit" maxLength={10} /></div>
                <button type="submit" disabled={kirim} className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-white disabled:opacity-50">
                  {kirim ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Daftar Ulang
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
