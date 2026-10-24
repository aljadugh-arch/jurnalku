import { useState, useEffect, useRef } from 'react'
import {
  ClipboardList, CheckCircle2, Loader2, ArrowLeft, UserPlus, Search,
  Upload, X, FileText, Users, GraduationCap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../services/api'

interface Info {
  dibuka: boolean
  gelombang: { id: string; nama: string; tahun_ajaran: string | null; tanggal_buka: string | null; tanggal_tutup: string | null; kuota: number; biaya: number; keterangan: string | null } | null
  rombel?: { id: string; nama: string; tingkat: string }[]
  lembaga?: { nama: string; slug: string; jenjang?: string } | null
  nama?: string
  judul?: string
}

interface Berkas { url: string; nama: string; tipe: string; ukuran: number }

const KOSONG = {
  nama: '', nama_panggilan: '', jenis_kelamin: '', nisn: '', nik: '',
  tempat_lahir: '', tanggal_lahir: '', agama: '', status_keluarga: '', anak_ke: '',
  alamat: '', alamat_ortu: '', no_hp: '', email: '',
  nama_ortu: '', no_hp_ortu: '', asal_sekolah: '', pilihan_rombel_id: '',
  nama_ayah: '', kerja_ayah: '', nama_ibu: '', kerja_ibu: '', nama_wali: '', kerja_wali: '',
}

const AGAMA = ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu', 'Lainnya']
const STATUS_KELUARGA = ['Anak Kandung', 'Anak Angkat', 'Anak Tiri', 'Yatim', 'Piatu', 'Yatim Piatu']

export default function PpdbPublikPage() {
  const [info, setInfo] = useState<Info | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'daftar' | 'daftar-ulang' | 'cek'>('daftar')
  const [kirim, setKirim] = useState(false)
  const [hasil, setHasil] = useState<{ nomor: string; nama: string } | null>(null)
  const [form, setForm] = useState({ ...KOSONG })
  const [berkas, setBerkas] = useState<Berkas[]>([])
  const [mengunggah, setMengunggah] = useState(false)
  const [galatBerkas, setGalatBerkas] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [du, setDu] = useState({ nomor_daftar: '', nisn: '' })
  const [hasilDu, setHasilDu] = useState<{ nama: string; status: string } | null>(null)

  // Cek status
  const [cek, setCek] = useState({ nomor_daftar: '', nisn: '' })
  const [statusCek, setStatusCek] = useState<{ nomor_daftar: string; nama: string; status: string; catatan: string | null; dokumen: Berkas[] } | null>(null)

  useEffect(() => {
    api.get('/ppdb/publik/info')
      .then(({ data }) => setInfo(data))
      .catch(() => setInfo({ dibuka: false, gelombang: null }))
      .finally(() => setLoading(false))
  }, [])

  const unggahBerkas = async (files: FileList | null) => {
    if (!files || !files.length) return
    setGalatBerkas(null)
    setMengunggah(true)
    try {
      const fd = new FormData()
      Array.from(files).forEach(f => fd.append('berkas', f))
      const { data } = await api.post('/ppdb/publik/unggah', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setBerkas(b => [...b, ...(data.berkas || [])].slice(0, 5))
    } catch (err: any) {
      setGalatBerkas(err?.response?.data?.error || 'Gagal mengunggah berkas.')
    } finally {
      setMengunggah(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const hapusBerkas = async (url: string) => {
    try { await api.delete('/ppdb/publik/unggah', { data: { url } }) } catch { /* tetap hapus dari daftar */ }
    setBerkas(b => b.filter(x => x.url !== url))
  }

  const kirimPendaftaran = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nama.trim() || !form.jenis_kelamin) { alert('Nama dan jenis kelamin wajib diisi'); return }
    setKirim(true)
    try {
      const { data } = await api.post('/ppdb/publik/daftar', {
        ...form,
        anak_ke: form.anak_ke === '' ? null : Number(form.anak_ke),
        dokumen_json: berkas,
      })
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

  const cekStatus = async (e: React.FormEvent) => {
    e.preventDefault()
    setKirim(true)
    try {
      const { data } = await api.post('/ppdb/publik/status', cek)
      setStatusCek(data)
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Data tidak ditemukan.')
    } finally { setKirim(false) }
  }

  const inputKelas = 'w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-[#f47b20]/30 focus:border-[#f47b20] outline-none sk-form-input'
  const labelKelas = 'sk-form-label'
  const judulSeksi = 'flex items-center gap-2 text-sm font-bold sk-txt pt-2 pb-1 border-b sk-border-soft'

  if (loading) return <div className="sk-root flex items-center justify-center sk-txt-muted">Memuat…</div>

  return (
    <div className="sk-root">
      <header className="sk-nav">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 text-sm font-medium sk-txt-muted hover:sk-txt-accent"><ArrowLeft size={17} /> Beranda</Link>
          <span className="text-sm font-semibold sk-txt">{info?.nama || 'PPDB'} Online</span>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl sk-bg-soft mb-3"><ClipboardList size={28} className="sk-txt-accent" /></div>
          <h1 className="text-2xl font-extrabold sk-txt">{info?.judul || 'Pendaftaran Siswa Baru'}</h1>
          {info?.lembaga?.nama && <p className="text-sm font-medium sk-txt mt-1">{info.lembaga.nama}</p>}
          {info?.gelombang && (
            <p className="text-sm sk-txt-muted mt-1">
              {info.gelombang.nama}{info.gelombang.tahun_ajaran ? ` · ${info.gelombang.tahun_ajaran}` : ''}
              {info.gelombang.kuota ? ` · kuota ${info.gelombang.kuota}` : ''}
            </p>
          )}
        </div>

        {!info?.dibuka ? (
          <div className="rounded-2xl border sk-border-accent sk-bg-soft p-6 text-center">
            <p className="font-semibold sk-txt">Pendaftaran belum dibuka</p>
            <p className="text-sm sk-txt-muted mt-1">Silakan hubungi panitia {info?.nama || 'PPDB'} lembaga untuk informasi jadwal pendaftaran.</p>
          </div>
        ) : hasil ? (
          <div className="rounded-2xl border sk-border-soft sk-card p-6 text-center">
            <CheckCircle2 size={40} className="sk-txt-accent mx-auto mb-3" />
            <p className="font-bold sk-txt text-lg">Pendaftaran Berhasil</p>
            <p className="text-sm sk-txt-muted mt-1">Terima kasih, <b className="sk-txt">{hasil.nama}</b>.</p>
            <div className="mt-4 rounded-xl sk-card sk-bg-subtle py-3">
              <div className="text-xs sk-txt-muted">Nomor Pendaftaran Anda</div>
              <div className="text-xl font-mono font-bold sk-txt tracking-wide">{hasil.nomor}</div>
            </div>
            <p className="text-xs sk-txt-muted mt-3">Simpan nomor ini. Gunakan tab "Cek Status" untuk melihat perkembangan.</p>
            <button onClick={() => { setHasil(null); setForm({ ...KOSONG }); setBerkas([]) }}
              className="mt-4 text-sm sk-txt-accent hover:underline">Daftarkan calon lain</button>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setTab('daftar')} className={`flex-1 rounded-lg py-2 text-xs sm:text-sm font-medium border ${tab === 'daftar' ? 'bg-primary text-white border-primary' : 'bg-white sk-txt-muted'}`}>Pendaftaran</button>
              <button onClick={() => setTab('daftar-ulang')} className={`flex-1 rounded-lg py-2 text-xs sm:text-sm font-medium border ${tab === 'daftar-ulang' ? 'bg-primary text-white border-primary' : 'bg-white sk-txt-muted'}`}>Daftar Ulang</button>
              <button onClick={() => setTab('cek')} className={`flex-1 rounded-lg py-2 text-xs sm:text-sm font-medium border ${tab === 'cek' ? 'bg-primary text-white border-primary' : 'bg-white sk-txt-muted'}`}>Cek Status</button>
            </div>

            {info.gelombang?.keterangan && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 mb-4">{info.gelombang.keterangan}</div>
            )}

            {tab === 'daftar' ? (
              <form onSubmit={kirimPendaftaran} className="rounded-2xl border sk-card p-5 space-y-3">
                <div className={judulSeksi}><GraduationCap size={16} className="sk-txt-accent" /> Data Calon Siswa</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2"><label className={labelKelas}>Nama lengkap *</label><input required value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} className={inputKelas} placeholder="Nama sesuai akta" /></div>
                  <div><label className={labelKelas}>Nama panggilan</label><input value={form.nama_panggilan} onChange={e => setForm({ ...form, nama_panggilan: e.target.value })} className={inputKelas} /></div>
                  <div><label className={labelKelas}>Jenis kelamin *</label><select required value={form.jenis_kelamin} onChange={e => setForm({ ...form, jenis_kelamin: e.target.value })} className={inputKelas}><option value="">— pilih —</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></div>
                  <div><label className={labelKelas}>NISN</label><input value={form.nisn} onChange={e => setForm({ ...form, nisn: e.target.value })} className={inputKelas} placeholder="10 digit" maxLength={10} /></div>
                  <div><label className={labelKelas}>NIK</label><input value={form.nik} onChange={e => setForm({ ...form, nik: e.target.value })} className={inputKelas} placeholder="16 digit" maxLength={16} /></div>
                  <div><label className={labelKelas}>Tempat lahir</label><input value={form.tempat_lahir} onChange={e => setForm({ ...form, tempat_lahir: e.target.value })} className={inputKelas} /></div>
                  <div><label className={labelKelas}>Tanggal lahir</label><input type="date" value={form.tanggal_lahir} onChange={e => setForm({ ...form, tanggal_lahir: e.target.value })} className={inputKelas} /></div>
                  <div><label className={labelKelas}>Agama</label><select value={form.agama} onChange={e => setForm({ ...form, agama: e.target.value })} className={inputKelas}><option value="">— pilih —</option>{AGAMA.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
                  <div><label className={labelKelas}>Status dalam keluarga</label><select value={form.status_keluarga} onChange={e => setForm({ ...form, status_keluarga: e.target.value })} className={inputKelas}><option value="">— pilih —</option>{STATUS_KELUARGA.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                  <div><label className={labelKelas}>Anak ke</label><input type="number" min={1} max={20} value={form.anak_ke} onChange={e => setForm({ ...form, anak_ke: e.target.value })} className={inputKelas} placeholder="mis. 2" /></div>
                  <div><label className={labelKelas}>Asal sekolah</label><input value={form.asal_sekolah} onChange={e => setForm({ ...form, asal_sekolah: e.target.value })} className={inputKelas} /></div>
                  {!!info.rombel?.length && (
                    <div className="sm:col-span-2"><label className={labelKelas}>Kelas tujuan (opsional)</label>
                      <select value={form.pilihan_rombel_id} onChange={e => setForm({ ...form, pilihan_rombel_id: e.target.value })} className={inputKelas}>
                        <option value="">— belum menentukan —</option>
                        {info.rombel.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="sm:col-span-2"><label className={labelKelas}>Alamat</label><textarea value={form.alamat} onChange={e => setForm({ ...form, alamat: e.target.value })} rows={2} className={inputKelas} /></div>
                  <div><label className={labelKelas}>No. HP calon</label><input value={form.no_hp} onChange={e => setForm({ ...form, no_hp: e.target.value })} className={inputKelas} placeholder="08xx" /></div>
                  <div><label className={labelKelas}>Email</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputKelas} /></div>
                </div>

                <div className={judulSeksi}><Users size={16} className="sk-txt-accent" /> Data Orang Tua / Wali</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className={labelKelas}>Nama ayah</label><input value={form.nama_ayah} onChange={e => setForm({ ...form, nama_ayah: e.target.value })} className={inputKelas} /></div>
                  <div><label className={labelKelas}>Pekerjaan ayah</label><input value={form.kerja_ayah} onChange={e => setForm({ ...form, kerja_ayah: e.target.value })} className={inputKelas} /></div>
                  <div><label className={labelKelas}>Nama ibu</label><input value={form.nama_ibu} onChange={e => setForm({ ...form, nama_ibu: e.target.value })} className={inputKelas} /></div>
                  <div><label className={labelKelas}>Pekerjaan ibu</label><input value={form.kerja_ibu} onChange={e => setForm({ ...form, kerja_ibu: e.target.value })} className={inputKelas} /></div>
                  <div><label className={labelKelas}>Nama wali</label><input value={form.nama_wali} onChange={e => setForm({ ...form, nama_wali: e.target.value })} className={inputKelas} placeholder="kosongkan bila tidak ada" /></div>
                  <div><label className={labelKelas}>Pekerjaan wali</label><input value={form.kerja_wali} onChange={e => setForm({ ...form, kerja_wali: e.target.value })} className={inputKelas} /></div>
                  <div><label className={labelKelas}>Nama orang tua/wali (ringkas)</label><input value={form.nama_ortu} onChange={e => setForm({ ...form, nama_ortu: e.target.value })} className={inputKelas} /></div>
                  <div><label className={labelKelas}>No. HP orang tua/wali</label><input value={form.no_hp_ortu} onChange={e => setForm({ ...form, no_hp_ortu: e.target.value })} className={inputKelas} placeholder="08xx" /></div>
                  <div className="sm:col-span-2"><label className={labelKelas}>Alamat orang tua/wali</label><textarea value={form.alamat_ortu} onChange={e => setForm({ ...form, alamat_ortu: e.target.value })} rows={2} className={inputKelas} placeholder="kosongkan bila sama dengan alamat calon" /></div>
                </div>

                {/* Unggah berkas — OPSIONAL */}
                <div className={judulSeksi}><Upload size={16} className="sk-txt-accent" /> Berkas Pendukung <span className="text-xs font-normal text-gray-400">(opsional)</span></div>
                <p className="text-[11px] text-gray-500">KK, akta kelahiran, ijazah/SKL, atau foto. Format JPG/PNG/WEBP/PDF, maksimal 5 MB per berkas, maksimal 5 berkas.</p>
                <div>
                  <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={e => unggahBerkas(e.target.files)}
                    className="block w-full text-xs sk-txt-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:sk-txt-accent hover:file:bg-primary/20" />
                  {mengunggah && <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Mengunggah…</p>}
                  {galatBerkas && <p className="text-xs text-red-600 mt-1">{galatBerkas}</p>}
                </div>
                {!!berkas.length && (
                  <ul className="space-y-1.5">
                    {berkas.map(b => (
                      <li key={b.url} className="flex items-center gap-2 rounded-lg border bg-gray-50 px-2.5 py-1.5 text-xs">
                        <FileText size={14} className="text-gray-400 shrink-0" />
                        <a href={b.url} target="_blank" rel="noreferrer" className="truncate flex-1 sk-txt-accent hover:underline">{b.nama}</a>
                        <span className="text-gray-400 shrink-0">{Math.round(b.ukuran / 1024)} KB</span>
                        <button type="button" onClick={() => hapusBerkas(b.url)} className="text-red-500 hover:text-red-700 shrink-0" title="Hapus"><X size={14} /></button>
                      </li>
                    ))}
                  </ul>
                )}

                <button type="submit" disabled={kirim || mengunggah} className="sk-btn w-full">
                  {kirim ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Kirim Pendaftaran
                </button>
                <p className="text-xs text-gray-400 text-center">Nomor pendaftaran akan muncul setelah formulir terkirim.</p>
              </form>
            ) : tab === 'daftar-ulang' ? (
              hasilDu ? (
                <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
                  <CheckCircle2 size={40} className="text-green-600 mx-auto mb-3" />
                  <p className="font-bold text-green-800">Daftar Ulang Berhasil</p>
                  <p className="text-sm text-green-700 mt-1">{hasilDu.nama} — status: <b>Daftar Ulang</b></p>
                  <p className="text-xs text-green-700 mt-3">Silakan tunggu informasi selanjutnya dari panitia.</p>
                </div>
              ) : (
                <form onSubmit={kirimDaftarUlang} className="rounded-2xl border sk-card p-5 space-y-4">
                  <p className="text-sm sk-txt-muted">Sudah mendaftar dan berkas sudah diverifikasi? Masukkan nomor pendaftaran untuk daftar ulang.</p>
                  <div><label className={labelKelas}>Nomor pendaftaran *</label><input required value={du.nomor_daftar} onChange={e => setDu({ ...du, nomor_daftar: e.target.value.toUpperCase() })} className={inputKelas} placeholder={`${info?.nama || 'PPDB'}-${new Date().getFullYear()}-0001`} /></div>
                  <div><label className={labelKelas}>NISN (untuk verifikasi)</label><input value={du.nisn} onChange={e => setDu({ ...du, nisn: e.target.value })} className={inputKelas} placeholder="10 digit" maxLength={10} /></div>
                  <button type="submit" disabled={kirim} className="sk-btn w-full">
                    {kirim ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Daftar Ulang
                  </button>
                </form>
              )
            ) : statusCek ? (
              <div className="rounded-2xl border sk-card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="sk-txt-accent" />
                  <span className="font-bold text-gray-800">Status Pendaftaran</span>
                </div>
                <div className="text-sm space-y-1.5">
                  <p><span className="text-gray-500">Nomor:</span> <b className="font-mono">{statusCek.nomor_daftar}</b></p>
                  <p><span className="text-gray-500">Nama:</span> <b>{statusCek.nama}</b></p>
                  <p><span className="text-gray-500">Status:</span> <b className="capitalize">{statusCek.status.replace('_', ' ')}</b></p>
                  {statusCek.catatan && <p><span className="text-gray-500">Catatan:</span> {statusCek.catatan}</p>}
                </div>
                {!!statusCek.dokumen?.length && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-gray-500 mb-1.5">Berkas terkirim:</p>
                    <ul className="space-y-1">
                      {statusCek.dokumen.map(d => (
                        <li key={d.url} className="text-xs"><a href={d.url} target="_blank" rel="noreferrer" className="sk-txt-accent hover:underline">{d.nama}</a></li>
                      ))}
                    </ul>
                  </div>
                )}
                <button onClick={() => setStatusCek(null)} className="text-sm sk-txt-accent hover:underline">Cek nomor lain</button>
              </div>
            ) : (
              <form onSubmit={cekStatus} className="rounded-2xl border sk-card p-5 space-y-4">
                <p className="text-sm sk-txt-muted">Masukkan nomor pendaftaran dan NISN untuk melihat status.</p>
                <div><label className={labelKelas}>Nomor pendaftaran *</label><input required value={cek.nomor_daftar} onChange={e => setCek({ ...cek, nomor_daftar: e.target.value.toUpperCase() })} className={inputKelas} placeholder={`${info?.nama || 'PPDB'}-${new Date().getFullYear()}-0001`} /></div>
                <div><label className={labelKelas}>NISN</label><input value={cek.nisn} onChange={e => setCek({ ...cek, nisn: e.target.value })} className={inputKelas} placeholder="10 digit" maxLength={10} /></div>
                <button type="submit" disabled={kirim} className="sk-btn w-full">
                  {kirim ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Cek Status
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
