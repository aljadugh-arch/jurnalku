import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Plus, Trash2,
  Clock3, Flag, X, Loader2, Building2, User,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { todayWib } from '../lib/dateFormat'

type Agenda = {
  id: string
  tanggal: string
  jam: string | null
  judul: string
  catatan: string
  prioritas: 'rendah' | 'normal' | 'tinggi'
  selesai: boolean
  bersama: boolean
}

type Respons = {
  dari: string
  sampai: string
  hari_ini: string
  jumlah: number
  belum_selesai: number
  lewat: number
  agenda: Agenda[]
}

const WARNA_PRIORITAS: Record<string, string> = {
  tinggi: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  normal: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  rendah: 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300',
}

const LABEL_PRIORITAS: Record<string, string> = { tinggi: 'Penting', normal: 'Normal', rendah: 'Rendah' }

const tanggalIndo = (tgl: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl || '')) return tgl || '—'
  return new Date(`${tgl}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })
}

const geser = (tgl: string, hari: number) => {
  const d = new Date(`${tgl}T12:00:00`)
  d.setDate(d.getDate() + hari)
  return d.toLocaleDateString('en-CA')
}

/**
 * Kartu agenda/pengingat pribadi. Dipasang di dasbor setiap peran, sehingga
 * guru, siswa, wali murid, bendahara, kepala, proktor, dan admin punya tempat
 * yang sama untuk mencatat hal yang harus diingat.
 */
export default function AgendaHarian({ ringkas = false }: { ringkas?: boolean }) {
  const peran = useAuthStore(s => s.user?.role)
  const bolehBersama = ['admin', 'super_admin', 'operator', 'tata_usaha', 'tu'].includes(String(peran))
  const [tgl, setTgl] = useState(todayWib())
  const [data, setData] = useState<Respons | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [buka, setBuka] = useState(false)
  const [simpan, setSimpan] = useState(false)
  const [form, setForm] = useState({ judul: '', catatan: '', jam: '', prioritas: 'normal', bersama: false, ingatkan: '0' })

  const muat = async (target = tgl) => {
    setMemuat(true)
    try {
      const r = await api.get('/agenda', { params: { dari: target, sampai: target } })
      setData(r.data)
    } catch {
      setData(null)
    } finally { setMemuat(false) }
  }

  useEffect(() => { void muat(tgl) }, [tgl]) // eslint-disable-line react-hooks/exhaustive-deps

  const agenda = data?.agenda || []
  const belum = agenda.filter(a => !a.selesai)
  const tampil = ringkas ? agenda.slice(0, 4) : agenda

  const tambah = async () => {
    if (!form.judul.trim()) { toast.error('Judul agenda wajib diisi'); return }
    setSimpan(true)
    try {
      if (form.bersama && bolehBersama) {
        await api.post('/agenda-lembaga', {
          tanggal: tgl, jam: form.jam || null, judul: form.judul.trim(),
          catatan: form.catatan.trim(), prioritas: form.prioritas,
        })
      } else {
        await api.post('/agenda', {
          tanggal: tgl, jam: form.jam || null, judul: form.judul.trim(),
          catatan: form.catatan.trim(), prioritas: form.prioritas,
          pengingat_menit: Number(form.ingatkan) || 0,
        })
      }
      setForm({ judul: '', catatan: '', jam: '', prioritas: 'normal', bersama: false, ingatkan: '0' })
      setBuka(false)
      toast.success('Agenda ditambahkan')
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan agenda')
    } finally { setSimpan(false) }
  }

  const gantiStatus = async (a: Agenda) => {
    const baru = !a.selesai
    setData(d => d ? { ...d, agenda: d.agenda.map(x => x.id === a.id ? { ...x, selesai: baru } : x) } : d)
    try {
      if (a.bersama) await api.post(`/agenda-lembaga/${a.id}/selesai`, { selesai: baru })
      else await api.patch(`/agenda/${a.id}`, { selesai: baru })
    } catch {
      toast.error('Gagal mengubah status agenda')
      setData(d => d ? { ...d, agenda: d.agenda.map(x => x.id === a.id ? { ...x, selesai: a.selesai } : x) } : d)
    }
  }

  const hapus = async (a: Agenda) => {
    if (!window.confirm(`Hapus agenda "${a.judul}"?`)) return
    try {
      if (a.bersama) await api.delete(`/agenda-lembaga/${a.id}`)
      else await api.delete(`/agenda/${a.id}`)
      toast.success('Agenda dihapus')
      await muat()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menghapus agenda')
    }
  }

  const jumlahLewat = useMemo(() => agenda.filter(a => !a.selesai && a.tanggal < todayWib()).length, [agenda])

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarDays size={18} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Agenda &amp; Pengingat</h3>
          <p className="text-[11px] text-slate-500">
            {memuat ? 'Memuat…' : `${belum.length} belum selesai${jumlahLewat ? ` · ${jumlahLewat} terlewat` : ''}`}
          </p>
        </div>
        <button type="button" onClick={() => setBuka(v => !v)}
          className="inline-flex items-center gap-1 rounded-xl bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-white hover:opacity-90">
          {buka ? <X size={13} /> : <Plus size={13} />} {buka ? 'Tutup' : 'Tambah'}
        </button>
      </div>

      <div className="mb-3 flex items-center gap-1.5">
        <button type="button" onClick={() => setTgl(t => geser(t, -1))} aria-label="Hari sebelumnya"
          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800"><ChevronLeft size={14} /></button>
        <div className="flex-1 text-center">
          <p className="text-xs font-semibold text-slate-800 dark:text-gray-100">{tanggalIndo(tgl)}</p>
          {tgl !== todayWib() && (
            <button type="button" onClick={() => setTgl(todayWib())} className="text-[10px] font-semibold text-primary hover:underline">kembali ke hari ini</button>
          )}
        </div>
        <button type="button" onClick={() => setTgl(t => geser(t, 1))} aria-label="Hari berikutnya"
          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800"><ChevronRight size={14} /></button>
      </div>

      {buka && (
        <div className="mb-3 space-y-2 rounded-2xl bg-slate-50 p-3 dark:bg-gray-800/60">
          <input value={form.judul} onChange={e => setForm({ ...form, judul: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') void tambah() }}
            placeholder="Apa yang harus diingat? (mis. kumpulkan tugas VII-A)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
          <textarea value={form.catatan} onChange={e => setForm({ ...form, catatan: e.target.value })} rows={2}
            placeholder="Catatan (opsional)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-semibold text-slate-500">
              Jam
              <input type="time" value={form.jam} onChange={e => setForm({ ...form, jam: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
            </label>
            <label className="text-[10px] font-semibold text-slate-500">
              Prioritas
              <select value={form.prioritas} onChange={e => setForm({ ...form, prioritas: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                <option value="rendah">Rendah</option>
                <option value="normal">Normal</option>
                <option value="tinggi">Penting</option>
              </select>
            </label>
          </div>
          {form.jam && (
            <label className="block text-[10px] font-semibold text-slate-500">
              Ingatkan lewat WhatsApp
              <select value={form.ingatkan} onChange={e => setForm({ ...form, ingatkan: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                <option value="0">Tepat pada jam agenda</option>
                <option value="5">5 menit sebelumnya</option>
                <option value="15">15 menit sebelumnya</option>
                <option value="30">30 menit sebelumnya</option>
                <option value="60">1 jam sebelumnya</option>
              </select>
            </label>
          )}
          {bolehBersama && (
            <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-gray-300">
              <input type="checkbox" checked={form.bersama} onChange={e => setForm({ ...form, bersama: e.target.checked })} />
              Bagikan ke seluruh lembaga (semua pengguna melihat)
            </label>
          )}
          <button type="button" onClick={() => void tambah()} disabled={simpan}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
            {simpan ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Simpan agenda
          </button>
        </div>
      )}

      {memuat && agenda.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-slate-400">Memuat agenda…</p>
      ) : agenda.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 py-6 text-center text-[11px] text-slate-400 dark:border-gray-700">
          Belum ada agenda untuk tanggal ini.
        </p>
      ) : (
        <ul className="space-y-2">
          {tampil.map(a => (
            <li key={`${a.bersama ? 'l' : 'p'}-${a.id}`}
              className={`flex items-start gap-2 rounded-2xl border p-2.5 ${a.selesai ? 'border-slate-100 bg-slate-50/60 dark:border-gray-800 dark:bg-gray-800/40' : 'border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}>
              <button type="button" onClick={() => void gantiStatus(a)} aria-label={a.selesai ? 'Tandai belum selesai' : 'Tandai selesai'}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${a.selesai ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 dark:border-gray-600'}`}>
                {a.selesai && <Check size={12} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-semibold leading-5 ${a.selesai ? 'text-slate-400 line-through dark:text-gray-500' : 'text-slate-800 dark:text-gray-100'}`}>{a.judul}</p>
                {a.catatan && <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-4 text-slate-500">{a.catatan}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                  {a.jam && <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600 dark:bg-gray-800 dark:text-gray-300"><Clock3 size={9} /> {a.jam}</span>}
                  <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${WARNA_PRIORITAS[a.prioritas] || WARNA_PRIORITAS.normal}`}>
                    <Flag size={9} /> {LABEL_PRIORITAS[a.prioritas] || 'Normal'}
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-500 dark:bg-gray-800 dark:text-gray-400">
                    {a.bersama ? <><Building2 size={9} /> Lembaga</> : <><User size={9} /> Pribadi</>}
                  </span>
                </div>
              </div>
              <button type="button" onClick={() => void hapus(a)} aria-label="Hapus agenda"
                className="rounded-lg p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10">
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {ringkas && agenda.length > 4 && (
        <p className="mt-2 text-center text-[10px] text-slate-400">+{agenda.length - 4} agenda lain hari ini</p>
      )}
    </section>
  )
}
