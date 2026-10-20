import { useEffect, useMemo, useState } from 'react'
import { BookMarked, Users, Loader2, CheckCircle2, AlertCircle, User } from 'lucide-react'
import api from '../../services/api'

// Halaman BUKU INDUK — dokumen arsip, terpisah dari cetak rapor.
//
// Kenapa dipisah: sebelumnya menu "Buku Induk" hanya menautkan ke
// /admin/cetak-rapor#buku-induk, jadi terlihat identik dengan "Cetak & Ekspor
// Rapor" (halaman yang sama, hanya beda posisi scroll). Dua menu yang membuka
// halaman sama membingungkan. Sekarang keduanya halaman sungguhan yang berbeda:
//   /admin/cetak-rapor  -> rapor satu periode (STS/SAS)
//   /admin/buku-induk   -> arsip seluruh riwayat siswa

type Bagian = 'lengkap' | 'identitas' | 'nilai'

const BAGIAN: Array<{ id: Bagian; label: string; ket: string }> = [
  { id: 'lengkap', label: 'Lengkap', ket: 'Biodata + seluruh riwayat nilai + catatan' },
  { id: 'identitas', label: 'Identitas', ket: 'Biodata siswa + orang tua/wali' },
  { id: 'nilai', label: 'Nilai', ket: 'Seluruh riwayat nilai per semester' },
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

export default function BukuIndukPage() {
  const [rombelList, setRombelList] = useState<any[]>([])
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [rombelId, setRombelId] = useState('')
  const [siswaId, setSiswaId] = useState('')
  const [sibuk, setSibuk] = useState('')
  const [pesan, setPesan] = useState<{ tipe: 'ok' | 'err'; teks: string } | null>(null)

  useEffect(() => {
    api.get('/rombel').then(r => setRombelList(Array.isArray(r.data) ? r.data : [])).catch(() => setRombelList([]))
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
    return `${awal}${siapa}-${bagian}.pdf`
  }

  const cetak = async (bagian: Bagian, perKelas: boolean) => {
    if (perKelas && !rombelId) return setPesan({ tipe: 'err', teks: 'Pilih kelas dulu.' })
    if (!perKelas && !siswaId) return setPesan({ tipe: 'err', teks: 'Pilih siswa dulu.' })
    setSibuk(`${bagian}-${perKelas ? 'kelas' : 'siswa'}`); setPesan(null)
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

  return (
    <div className="space-y-6 pb-24 lg:pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Buku Induk Siswa</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Dokumen arsip: biodata lengkap, seluruh riwayat nilai, kehadiran, ekskul, dan catatan — bukan satu periode.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Kelas</label>
            <select value={rombelId} onChange={e => setRombelId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">— pilih kelas —</option>
              {rombelList.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Siswa (untuk cetak per siswa)</label>
            <select value={siswaId} onChange={e => setSiswaId(e.target.value)} disabled={!rombelId} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50">
              <option value="">— pilih siswa —</option>
              {siswaList.map(s => <option key={s.id} value={s.id}>{s.nama} ({s.nis})</option>)}
            </select>
          </div>
        </div>
      </div>

      {pesan && (
        <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${pesan.tipe === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {pesan.tipe === 'ok' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
          <span>{pesan.teks}</span>
        </div>
      )}

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300">
          <User size={16} /> Per Siswa {siswa && <span className="font-normal text-gray-500">— {siswa.nama}</span>}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {BAGIAN.map(b => (
            <button key={b.id} onClick={() => void cetak(b.id, false)} disabled={Boolean(sibuk)}
              className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-primary hover:shadow-md disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {sibuk === `${b.id}-siswa` ? <Loader2 size={18} className="animate-spin" /> : <BookMarked size={18} />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-800 dark:text-gray-200">{b.label}</span>
                <span className="block text-xs text-gray-500">{b.ket}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300">
          <Users size={16} /> Per Kelas {rombel && <span className="font-normal text-gray-500">— {rombel.nama}</span>}
        </h2>
        <p className="mb-2 text-xs text-gray-500">Seluruh siswa dalam satu PDF.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {BAGIAN.map(b => (
            <button key={b.id} onClick={() => void cetak(b.id, true)} disabled={Boolean(sibuk)}
              className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-primary hover:shadow-md disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {sibuk === `${b.id}-kelas` ? <Loader2 size={18} className="animate-spin" /> : <Users size={18} />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-800 dark:text-gray-200">{b.label}</span>
                <span className="block text-xs text-gray-500">Satu PDF seluruh kelas</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
