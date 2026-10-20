import { useEffect, useMemo, useState } from 'react'
import { FileText, User, Award, Files, Printer, BookMarked, Users, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import api from '../../services/api'

// Halaman CETAK & EKSPOR RAPOR.
//
// Kenapa halaman terpisah: sebelumnya tombol cetak tersembunyi di dropdown
// "Cetak" pada halaman Rapor, dan cetak massal hanya muncul bila layout
// "MTs Plus" dipilih. Akibatnya pengguna tidak menemukan tombol cover,
// identitas, atau nilai per bagian. Di sini SEMUA aksi terlihat sebagai
// tombol — tidak ada yang perlu dibuka dulu.

type Bagian = 'cover' | 'identitas' | 'nilai' | 'lengkap'

const BAGIAN: Array<{ id: Bagian; label: string; ket: string; icon: any }> = [
  { id: 'cover', label: 'Cover / Sampul', ket: 'Halaman sampul saja', icon: FileText },
  { id: 'identitas', label: 'Identitas Siswa', ket: 'Biodata peserta didik', icon: User },
  { id: 'nilai', label: 'Nilai / Capaian', ket: 'Capaian hasil belajar', icon: Award },
  { id: 'lengkap', label: 'Lengkap', ket: 'Cover + identitas + nilai', icon: Files },
]

const BUKU_INDUK: Array<{ id: 'lengkap' | 'identitas' | 'nilai'; label: string; ket: string }> = [
  { id: 'lengkap', label: 'Buku Induk Lengkap', ket: 'Biodata + seluruh riwayat nilai + catatan' },
  { id: 'identitas', label: 'Buku Induk — Identitas', ket: 'Biodata siswa + orang tua/wali' },
  { id: 'nilai', label: 'Buku Induk — Nilai', ket: 'Seluruh riwayat nilai per semester' },
]

function unduh(blob: Blob, nama: string) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nama
  document.body.appendChild(a)
  a.click()
  a.parentNode?.removeChild(a)
  window.URL.revokeObjectURL(url)
}

async function bacaError(e: any, bawaan: string) {
  const d = e?.response?.data
  if (d instanceof Blob) { try { return JSON.parse(await d.text())?.error || bawaan } catch { return bawaan } }
  return d?.error || bawaan
}

export default function CetakRaporPage() {
  const [rombelList, setRombelList] = useState<any[]>([])
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [rombelId, setRombelId] = useState('')
  const [siswaId, setSiswaId] = useState('')
  const [tahunAjaran, setTahunAjaran] = useState('')
  const [semester, setSemester] = useState<'ganjil' | 'genap'>('ganjil')
  const [jenis, setJenis] = useState<'rapor_sts' | 'rapor_sas'>('rapor_sts')
  const [sibuk, setSibuk] = useState('')
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'err'; teks: string } | null>(null)

  useEffect(() => {
    api.get('/rombel').then(r => {
      const list = Array.isArray(r.data) ? r.data : []
      setRombelList(list)
      if (list[0]?.tahun_ajaran) setTahunAjaran(list[0].tahun_ajaran)
    }).catch(() => setRombelList([]))
  }, [])

  useEffect(() => {
    if (!rombelId) { setSiswaList([]); setSiswaId(''); return }
    api.get('/siswa', { params: { rombel_id: rombelId } })
      .then(r => setSiswaList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setSiswaList([]))
    setSiswaId('')
  }, [rombelId])

  const rombel = useMemo(() => rombelList.find(r => r.id === rombelId), [rombelList, rombelId])
  const siswa = useMemo(() => siswaList.find(s => s.id === siswaId), [siswaList, siswaId])

  const namaBerkas = (awal: string, bagian: string) => {
    const siapa = siswa?.nama ? `-${String(siswa.nama).replace(/[^\w]+/g, '-')}` : rombel ? `-${String(rombel.nama).replace(/[^\w]+/g, '-')}` : ''
    return `${awal}${siapa}-${bagian}-${semester}-${String(tahunAjaran).replace('/', '-')}.pdf`
  }

  // Cetak SATU siswa, bagian tertentu.
  const cetakSiswa = async (bagian: Bagian) => {
    if (!siswaId) return setPesan({ tipe: 'err', teks: 'Pilih siswa dulu.' })
    setSibuk(`siswa-${bagian}`); setPesan(null)
    try {
      const r = await api.get('/rapor/export/pdf', {
        params: { siswa_id: siswaId, tahun_ajaran: tahunAjaran, semester, jenis, bagian, format: 'mtsplus' },
        responseType: 'blob', timeout: 180000,
      })
      unduh(new Blob([r.data], { type: 'application/pdf' }), namaBerkas('rapor', bagian))
      setPesan({ tipe: 'ok', teks: `PDF ${bagian} untuk ${siswa?.nama} siap diunduh.` })
    } catch (e: any) { setPesan({ tipe: 'err', teks: await bacaError(e, 'Gagal membuat PDF') }) }
    finally { setSibuk('') }
  }

  // Cetak SATU KELAS, bagian tertentu — satu file berisi seluruh siswa.
  const cetakKelas = async (bagian: Bagian) => {
    if (!rombelId) return setPesan({ tipe: 'err', teks: 'Pilih kelas dulu.' })
    setSibuk(`kelas-${bagian}`); setPesan(null)
    try {
      const r = await api.get('/rapor/export/pdf-bulk', {
        params: { rombel_id: rombelId, tahun_ajaran: tahunAjaran, semester, jenis, bagian },
        responseType: 'blob', timeout: 300000,
      })
      unduh(new Blob([r.data], { type: 'application/pdf' }), namaBerkas('rapor-kelas', bagian))
      setPesan({ tipe: 'ok', teks: `PDF ${bagian} satu kelas siap diunduh.` })
    } catch (e: any) { setPesan({ tipe: 'err', teks: await bacaError(e, 'Gagal membuat PDF kelas') }) }
    finally { setSibuk('') }
  }

  // Buku induk: per siswa (jika dipilih) atau per kelas.
  const cetakBukuInduk = async (bagian: 'lengkap' | 'identitas' | 'nilai', perKelas: boolean) => {
    if (perKelas && !rombelId) return setPesan({ tipe: 'err', teks: 'Pilih kelas dulu.' })
    if (!perKelas && !siswaId) return setPesan({ tipe: 'err', teks: 'Pilih siswa dulu.' })
    setSibuk(`bi-${bagian}-${perKelas ? 'kelas' : 'siswa'}`); setPesan(null)
    try {
      const params: any = { bagian }
      if (perKelas) params.rombel_id = rombelId
      else params.siswa_id = siswaId
      const r = await api.get(perKelas ? '/buku-induk/pdf-bulk' : '/buku-induk/pdf', { params, responseType: 'blob', timeout: 300000 })
      unduh(new Blob([r.data], { type: 'application/pdf' }), namaBerkas(perKelas ? 'buku-induk-kelas' : 'buku-induk', bagian))
      const n = r.headers?.['x-buku-induk-dicetak']
      setPesan({ tipe: 'ok', teks: n ? `Buku induk siap (${n} siswa).` : 'Buku induk siap diunduh.' })
    } catch (e: any) { setPesan({ tipe: 'err', teks: await bacaError(e, 'Gagal membuat buku induk') }) }
    finally { setSibuk('') }
  }

  const Tombol = ({ onClick, aktif, icon: Icon, judul, ket }: any) => (
    <button
      onClick={onClick}
      disabled={Boolean(sibuk)}
      className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-primary hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {aktif ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-800">{judul}</span>
        <span className="block text-xs text-gray-500">{ket}</span>
      </span>
    </button>
  )

  return (
    <div className="space-y-6 pb-24 lg:pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Cetak &amp; Ekspor Rapor</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Unduh PDF per bagian: sampul, identitas, nilai, atau lengkap — untuk satu siswa atau satu kelas.
        </p>
      </div>

      {/* Pemilih periode & kelas */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Tahun Ajaran</label>
            <input value={tahunAjaran} onChange={e => setTahunAjaran(e.target.value)} placeholder="2026/2027"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Semester</label>
            <select value={semester} onChange={e => setSemester(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="ganjil">Ganjil</option>
              <option value="genap">Genap</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Jenis Rapor</label>
            <select value={jenis} onChange={e => setJenis(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="rapor_sts">Sumatif Tengah Semester (STS)</option>
              <option value="rapor_sas">Sumatif Akhir Semester (SAS)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Kelas</label>
            <select value={rombelId} onChange={e => setRombelId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">— pilih kelas —</option>
              {rombelList.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
            </select>
          </div>
        </div>

        {rombelId && (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-gray-500">Siswa (untuk cetak per siswa)</label>
            <select value={siswaId} onChange={e => setSiswaId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm sm:max-w-md">
              <option value="">— pilih siswa —</option>
              {siswaList.map(s => <option key={s.id} value={s.id}>{s.nama} ({s.nis})</option>)}
            </select>
          </div>
        )}
      </div>

      {pesan && (
        <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${pesan.tipe === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {pesan.tipe === 'ok' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
          <span>{pesan.teks}</span>
        </div>
      )}

      {/* Per siswa */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-700">
          <User size={16} /> Cetak per Siswa {siswa && <span className="font-normal text-gray-500">— {siswa.nama}</span>}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BAGIAN.map(b => (
            <Tombol key={b.id} onClick={() => void cetakSiswa(b.id)} aktif={sibuk === `siswa-${b.id}`} icon={b.icon} judul={b.label} ket={b.ket} />
          ))}
        </div>
      </section>

      {/* Per kelas */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-700">
          <Users size={16} /> Cetak per Kelas {rombel && <span className="font-normal text-gray-500">— {rombel.nama}</span>}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BAGIAN.map(b => (
            <Tombol key={b.id} onClick={() => void cetakKelas(b.id)} aktif={sibuk === `kelas-${b.id}`} icon={Printer} judul={`Massal — ${b.label}`} ket={`Seluruh siswa, satu PDF`} />
          ))}
        </div>
      </section>

      {/* Buku induk */}
      <section id="buku-induk" className="scroll-mt-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-700">
          <BookMarked size={16} /> Buku Induk (arsip)
        </h2>
        <p className="mb-2 text-xs text-gray-500">Dokumen arsip: seluruh riwayat, bukan satu periode.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BUKU_INDUK.map(b => (
            <Tombol
              key={`s-${b.id}`}
              onClick={() => void cetakBukuInduk(b.id, false)}
              aktif={sibuk === `bi-${b.id}-siswa`}
              icon={BookMarked}
              judul={`${b.label} (siswa)`}
              ket={b.ket}
            />
          ))}
          {BUKU_INDUK.map(b => (
            <Tombol
              key={`k-${b.id}`}
              onClick={() => void cetakBukuInduk(b.id, true)}
              aktif={sibuk === `bi-${b.id}-kelas`}
              icon={Users}
              judul={`${b.label} (kelas)`}
              ket={`Seluruh siswa, satu PDF`}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
