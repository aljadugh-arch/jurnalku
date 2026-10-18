import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Wallet, Plus, Trash2, Search, CalendarDays, Users, Lock,
  ChevronRight, X, Save, AlertTriangle, Coins, Clock,
} from 'lucide-react'
import api from '../../services/api'

// ============================================================================
// Payroll & JTM
//
// Tiga tab:
//   1. Komponen — gaji pokok, tunjangan, tarif JTM per guru
//   2. JTM      — pratinjau jam tatap muka dari jurnal + substitusi
//   3. Periode  — kunci slip bulanan (snapshot)
//
// JTM dihitung dari JURNAL MENGAJAR (bukti guru masuk kelas), bukan dari
// jadwal. Membayar dari jadwal = membayar pertemuan yang tak pernah terjadi.
// ============================================================================

type Tab = 'komponen' | 'jtm' | 'periode'

type Komponen = {
  gtk_id: string
  nama: string
  jabatan: string
  status_kepegawaian: string
  nip: string
  gaji_pokok: number
  tunjangan_jabatan: number
  tunjangan_kehadiran: number
  tunjangan_lain: number
  tarif_jtm: number
  potongan_tetap: number
  aktif: number
}

type Jtm = {
  id: string
  nama: string
  jabatan: string
  status_kepegawaian: string
  jurnal: number
  substitusi: number
  total: number
  tarif_jtm: number
  honor_jtm: number
}

type Periode = {
  id: string
  bulan: string
  status: string
  jumlah_slip: number
  total_bersih: number
  dibuat_nama: string
}

const rupiah = (n: number) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID')
const bulanIni = () => new Date().toISOString().slice(0, 7)

const FIELD: [keyof Komponen, string][] = [
  ['gaji_pokok', 'Gaji pokok'],
  ['tunjangan_jabatan', 'Tunjangan jabatan'],
  ['tunjangan_kehadiran', 'Tunjangan kehadiran'],
  ['tunjangan_lain', 'Tunjangan lain'],
  ['tarif_jtm', 'Tarif per JP'],
  ['potongan_tetap', 'Potongan tetap'],
]

export default function PayrollPage() {
  const [tab, setTab] = useState<Tab>('komponen')
  const [komponen, setKomponen] = useState<Komponen[]>([])
  const [jtm, setJtm] = useState<Jtm[]>([])
  const [periode, setPeriode] = useState<Periode[]>([])
  const [bulan, setBulan] = useState(bulanIni())
  const [memuat, setMemuat] = useState(true)
  const [cari, setCari] = useState('')
  const [edit, setEdit] = useState<Komponen | null>(null)
  const [detail, setDetail] = useState<{ periode: any; slip: any[] } | null>(null)

  const muat = async () => {
    setMemuat(true)
    try {
      const [k, j, p] = await Promise.all([
        api.get('/payroll/komponen'),
        api.get(`/payroll/jtm?bulan=${bulan}`),
        api.get('/payroll/periode'),
      ])
      setKomponen(Array.isArray(k.data) ? k.data : [])
      setJtm(Array.isArray(j.data?.guru) ? j.data.guru : [])
      setPeriode(Array.isArray(p.data) ? p.data : [])
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal memuat data payroll')
    } finally {
      setMemuat(false)
    }
  }

  useEffect(() => { muat() }, [bulan])

  const komponenTampil = useMemo(() => {
    const q = cari.trim().toLowerCase()
    if (!q) return komponen
    return komponen.filter(k =>
      String(k.nama).toLowerCase().includes(q) ||
      String(k.jabatan || '').toLowerCase().includes(q) ||
      String(k.status_kepegawaian || '').toLowerCase().includes(q),
    )
  }, [komponen, cari])

  const simpanKomponen = async () => {
    if (!edit) return
    try {
      await api.put(`/payroll/komponen/${edit.gtk_id}`, edit)
      toast.success('Komponen gaji disimpan')
      setEdit(null)
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan')
    }
  }

  const buatPeriode = async () => {
    if (!confirm(
      `Buat slip gaji untuk ${bulan}?\n\n` +
      `JTM dihitung dari jurnal mengajar + substitusi bulan itu, lalu DIKUNCI sebagai snapshot. ` +
      `Periode yang sudah dibuat tidak bisa dihitung ulang — hapus dulu bila ingin mengulang.`
    )) return
    try {
      const r = await api.post('/payroll/periode', { bulan })
      toast.success(`${r.data?.jumlah_slip || 0} slip dibuat untuk ${bulan}`)
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal membuat periode')
    }
  }

  const finalkan = async (p: Periode) => {
    if (!confirm(`Finalkan periode ${p.bulan}?\n\nSetelah final, slip tidak bisa dihapus — ini menjadi bukti pembayaran.`)) return
    try {
      await api.post(`/payroll/periode/${p.id}/final`, {})
      toast.success('Periode difinalkan')
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal finalisasi')
    }
  }

  const hapusPeriode = async (p: Periode) => {
    if (p.status === 'final') return toast.error('Periode final tidak bisa dihapus')
    if (!confirm(`Hapus periode ${p.bulan} beserta ${p.jumlah_slip} slip?`)) return
    try {
      await api.delete(`/payroll/periode/${p.id}`)
      toast.success('Periode dihapus')
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menghapus')
    }
  }

  const lihatSlip = async (p: Periode) => {
    try {
      const r = await api.get(`/payroll/periode/${p.id}/slip`)
      setDetail({ periode: r.data?.periode, slip: Array.isArray(r.data?.slip) ? r.data.slip : [] })
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal memuat slip')
    }
  }

  const totalBersih = useMemo(() => (detail?.slip || []).reduce((a, s) => a + (Number(s.total_bersih) || 0), 0), [detail])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-display font-bold text-gray-800 dark:text-gray-100">
            <Wallet size={22} className="text-primary" /> Payroll & JTM
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Gaji, tunjangan, dan jam tatap muka yang dihitung dari jurnal mengajar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={bulan} onChange={e => setBulan(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
          <button onClick={buatPeriode} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm text-white">
            <Plus size={15} /> Buat slip
          </button>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
        {([
          ['komponen', 'Komponen Gaji'], ['jtm', 'Jam Tatap Muka'], ['periode', 'Periode & Slip'],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
              tab === k ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}>{label}</button>
        ))}
      </div>

      {memuat ? (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">Memuat…</div>
      ) : tab === 'komponen' ? (
        <>
          <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
            <Search size={15} className="text-gray-400" />
            <input value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari nama, jabatan, status…"
              className="w-full bg-transparent text-sm outline-none dark:text-gray-100" />
            <span className="shrink-0 text-xs text-gray-400">{komponenTampil.length} guru</span>
          </div>

          {komponenTampil.length === 0 ? (
            <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">
              <Wallet size={42} className="mx-auto mb-3 opacity-60" />
              <p>Belum ada komponen gaji. Klik nama guru untuk mengisi.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white dark:border-gray-800 dark:bg-gray-900">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Nama</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Gaji pokok</th>
                    <th className="px-4 py-3 text-right">Tarif JP</th>
                    <th className="px-4 py-3 text-right">Potongan</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-800">
                  {komponenTampil.map(k => (
                    <tr key={k.gtk_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800 dark:text-gray-100">{k.nama}</p>
                        <p className="text-xs text-gray-500">{k.jabatan || '-'}{k.nip ? ` · ${k.nip}` : ''}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{k.status_kepegawaian || '-'}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{rupiah(k.gaji_pokok)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{rupiah(k.tarif_jtm)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{rupiah(k.potongan_tetap)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setEdit({ ...k })} className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5">
                          Atur
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : tab === 'jtm' ? (
        <>
          <p className="rounded-xl border bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
            JTM = jumlah pertemuan di jurnal mengajar + jam menggantikan guru lain (substitusi) pada bulan {bulan}.
            Bukan dari jadwal — jadwal hanya rencana.
          </p>
          <div className="overflow-x-auto rounded-xl border bg-white dark:border-gray-800 dark:bg-gray-900">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3 text-center">Jurnal</th>
                  <th className="px-4 py-3 text-center">Substitusi</th>
                  <th className="px-4 py-3 text-center">Total JP</th>
                  <th className="px-4 py-3 text-right">Honor JTM</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-800">
                {jtm.map(j => (
                  <tr key={j.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800 dark:text-gray-100">{j.nama}</p>
                      <p className="text-xs text-gray-500">{j.jabatan || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{j.jurnal}</td>
                    <td className="px-4 py-3 text-center">
                      {j.substitusi > 0
                        ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">{j.substitusi}</span>
                        : <span className="text-gray-400">0</span>}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-gray-800 dark:text-gray-100">{j.total}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{rupiah(j.honor_jtm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {periode.length === 0 ? (
            <div className="rounded-xl border bg-white p-10 text-center text-gray-400 dark:border-gray-800 dark:bg-gray-900">
              <CalendarDays size={42} className="mx-auto mb-3 opacity-60" />
              <p>Belum ada periode gaji. Klik "Buat slip" untuk memulai.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {periode.map(p => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-800 dark:text-gray-100">{p.bulan}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        p.status === 'final'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                      }`}>{p.status === 'final' ? 'FINAL' : 'DRAFT'}</span>
                    </div>
                    <p className="text-xs text-gray-500">{p.jumlah_slip} slip · total {rupiah(p.total_bersih)}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => lihatSlip(p)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                      <ChevronRight size={13} /> Slip
                    </button>
                    {p.status !== 'final' && (
                      <>
                        <button onClick={() => finalkan(p)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white">
                          <Lock size={13} /> Finalkan
                        </button>
                        <button onClick={() => hapusPeriode(p)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal komponen */}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEdit(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 dark:bg-gray-900" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">{edit.nama}</p>
                <p className="text-xs text-gray-500">{edit.jabatan || '-'} · {edit.status_kepegawaian || '-'}</p>
              </div>
              <button onClick={() => setEdit(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FIELD.map(([k, label]) => (
                <label key={String(k)} className="text-xs text-gray-500">{label}
                  <input type="number" min={0} value={Number((edit as any)[k]) || 0}
                    onChange={e => setEdit({ ...edit, [k]: Number(e.target.value) } as Komponen)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
                </label>
              ))}
            </div>
            <button onClick={simpanKomponen} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm text-white">
              <Save size={16} /> Simpan komponen
            </button>
          </div>
        </div>
      )}

      {/* Modal slip */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 dark:bg-gray-900" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">Slip {detail.periode?.bulan}</p>
                <p className="text-xs text-gray-500">{detail.slip.length} guru · total {rupiah(totalBersih)}</p>
              </div>
              <button onClick={() => setDetail(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
            </div>
            <div className="overflow-x-auto rounded-xl border dark:border-gray-800">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  <tr>
                    <th className="px-3 py-2">Nama</th>
                    <th className="px-3 py-2 text-center">JP</th>
                    <th className="px-3 py-2 text-right">Bruto</th>
                    <th className="px-3 py-2 text-right">Potongan</th>
                    <th className="px-3 py-2 text-right">Bersih</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-800">
                  {detail.slip.map(s => (
                    <tr key={s.id}>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-gray-800 dark:text-gray-100">{s.nama}</p>
                        {s.hari_tanpa_masuk > 0 && (
                          <p className="text-[11px] text-amber-600">tanpa masuk {s.hari_tanpa_masuk} hari</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-300">{s.jtm}</td>
                      <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-200">{rupiah(s.total_bruto)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{rupiah(s.total_potongan)}</td>
                      <td className="px-3 py-2 text-right font-bold text-gray-800 dark:text-gray-100">{rupiah(s.total_bersih)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
