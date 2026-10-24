import { useEffect, useState } from 'react'
import { Plus, Trash2, Pencil, CheckCheck, Mail, Inbox, HelpCircle } from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'

// Halaman "Website" admin: kelola konten halaman publik situs lembaga —
// FAQ, pesan Kontak, dan tiket Helpdesk. Pengumuman dikelola lewat menu
// Posting (sudah ada), jadi tidak diduplikasi di sini.

type FaqItem = { id: string; pertanyaan: string; jawaban: string; urutan: number }
type KontakItem = { id: string; nama: string; email: string; phone: string; subjek: string; pesan: string; dibaca: number; created_at: string }
type TiketItem = { id: string; nama: string; username_nim: string; email: string; phone: string; kategori: string; subjek: string; pesan: string; status: string; created_at: string }

const tgl = (s: string) => {
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function WebsitePage() {
  const [tab, setTab] = useState<'faq' | 'kontak' | 'helpdesk'>('faq')

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-800">Website Lembaga</h1>
        <p className="text-sm text-gray-500">Kelola konten halaman publik: FAQ, pesan kontak, dan tiket helpdesk.</p>
      </div>

      <div className="mb-4 flex gap-2 border-b">
        {([['faq', 'FAQ'], ['kontak', `Pesan Kontak`], ['helpdesk', 'Tiket Helpdesk']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-semibold ${tab === id ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'faq' && <FaqTab />}
      {tab === 'kontak' && <KontakTab />}
      {tab === 'helpdesk' && <HelpdeskTab />}
    </div>
  )
}

function FaqTab() {
  const [faq, setFaq] = useState<FaqItem[]>([])
  const [form, setForm] = useState<{ id?: string; pertanyaan: string; jawaban: string; urutan: number }>({ pertanyaan: '', jawaban: '', urutan: 0 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const muat = () => {
    setLoading(true)
    api.get('/faq').then(({ data }) => setFaq(Array.isArray(data?.faq) ? data.faq : [])).catch(() => toast.error('Gagal memuat FAQ')).finally(() => setLoading(false))
  }
  useEffect(muat, [])

  const simpan = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (form.id) await api.put(`/faq/${form.id}`, form)
      else await api.post('/faq', form)
      toast.success(form.id ? 'FAQ diperbarui' : 'FAQ ditambahkan')
      setForm({ pertanyaan: '', jawaban: '', urutan: 0 })
      muat()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan FAQ')
    } finally { setSaving(false) }
  }

  const hapus = async (id: string) => {
    if (!confirm('Hapus FAQ ini?')) return
    try { await api.delete(`/faq/${id}`); toast.success('FAQ dihapus'); muat() }
    catch { toast.error('Gagal menghapus FAQ') }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <form onSubmit={simpan} className="lg:col-span-1 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="font-bold text-gray-800">{form.id ? 'Edit FAQ' : 'Tambah FAQ'}</h2>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Pertanyaan</label>
          <input className="input" value={form.pertanyaan} onChange={e => setForm({ ...form, pertanyaan: e.target.value })} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Jawaban</label>
          <textarea className="input" rows={4} value={form.jawaban} onChange={e => setForm({ ...form, jawaban: e.target.value })} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Urutan</label>
          <input type="number" className="input" value={form.urutan} onChange={e => setForm({ ...form, urutan: Number(e.target.value) })} />
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Menyimpan...' : 'Simpan'}</button>
          {form.id && <button type="button" onClick={() => setForm({ pertanyaan: '', jawaban: '', urutan: 0 })} className="btn-secondary">Batal</button>}
        </div>
      </form>

      <div className="lg:col-span-2 space-y-2">
        {loading ? <p className="text-sm text-gray-400">Memuat...</p> : faq.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">Belum ada FAQ.</p>
        ) : faq.map(f => (
          <div key={f.id} className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-gray-800">{f.pertanyaan}</p>
              <p className="mt-1 text-sm text-gray-500">{f.jawaban}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button onClick={() => setForm({ id: f.id, pertanyaan: f.pertanyaan, jawaban: f.jawaban, urutan: f.urutan })} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><Pencil size={15} /></button>
              <button onClick={() => hapus(f.id)} className="rounded-lg p-2 text-red-400 hover:bg-red-50"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function KontakTab() {
  const [kontak, setKontak] = useState<KontakItem[]>([])
  const [loading, setLoading] = useState(false)
  const muat = () => { setLoading(true); api.get('/kontak').then(({ data }) => setKontak(Array.isArray(data?.kontak) ? data.kontak : [])).catch(() => toast.error('Gagal memuat pesan')).finally(() => setLoading(false)) }
  useEffect(muat, [])

  const tandai = async (id: string) => {
    try { await api.post(`/kontak/${id}/dibaca`); muat() } catch { toast.error('Gagal menandai') }
  }

  return (
    <div className="space-y-2">
      {loading ? <p className="text-sm text-gray-400">Memuat...</p> : kontak.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">Belum ada pesan masuk.</p>
      ) : kontak.map(k => (
        <div key={k.id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Inbox size={15} className={k.dibaca ? 'text-gray-300' : 'text-primary'} />
                <p className="font-semibold text-sm text-gray-800">{k.nama}</p>
                {!k.dibaca && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">Baru</span>}
              </div>
              <p className="mt-0.5 text-xs text-gray-400">{tgl(k.created_at)}{k.subjek ? ` · ${k.subjek}` : ''}</p>
              <p className="mt-2 text-sm text-gray-600">{k.pesan}</p>
              <p className="mt-1 text-xs text-gray-400">{[k.email, k.phone].filter(Boolean).join(' · ')}</p>
            </div>
            {!k.dibaca && (
              <button onClick={() => tandai(k.id)} className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50">
                <CheckCheck size={14} /> Tandai dibaca
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function HelpdeskTab() {
  const [tiket, setTiket] = useState<TiketItem[]>([])
  const [loading, setLoading] = useState(false)
  const muat = () => { setLoading(true); api.get('/helpdesk').then(({ data }) => setTiket(Array.isArray(data?.tiket) ? data.tiket : [])).catch(() => toast.error('Gagal memuat tiket')).finally(() => setLoading(false)) }
  useEffect(muat, [])

  const statusLabel: Record<string, string> = { baru: 'Baru', diproses: 'Diproses', selesai: 'Selesai' }
  const statusWarna: Record<string, string> = { baru: 'bg-primary/10 text-primary', diproses: 'bg-amber-100 text-amber-700', selesai: 'bg-emerald-100 text-emerald-700' }

  const ubah = async (id: string, status: string) => {
    try { await api.put(`/helpdesk/${id}/status`, { status }); muat() } catch { toast.error('Gagal mengubah status') }
  }

  return (
    <div className="space-y-2">
      {loading ? <p className="text-sm text-gray-400">Memuat...</p> : tiket.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">Belum ada tiket.</p>
      ) : tiket.map(t => (
        <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <HelpCircle size={15} className="text-primary" />
                <p className="font-semibold text-sm text-gray-800">{t.subjek}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusWarna[t.status] || 'bg-gray-100 text-gray-600'}`}>{statusLabel[t.status] || t.status}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-400">{t.nama}{t.username_nim ? ` · ${t.username_nim}` : ''} · {tgl(t.created_at)} · {t.kategori}</p>
              <p className="mt-2 text-sm text-gray-600">{t.pesan}</p>
              <p className="mt-1 text-xs text-gray-400">{[t.email, t.phone].filter(Boolean).join(' · ')}</p>
            </div>
            <select value={t.status} onChange={e => ubah(t.id, e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-600">
              <option value="baru">Baru</option>
              <option value="diproses">Diproses</option>
              <option value="selesai">Selesai</option>
            </select>
          </div>
        </div>
      ))}
    </div>
  )
}
