import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Download, FileText, Image as ImageIcon, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import ResponsiveTable from '../../components/ui/ResponsiveTable'

interface Tenant { id: string; nama: string; plan: string; alamat?: string }
interface Plan { plan: string; label: string; harga: number; masa_nilai: number; masa_satuan: string; aktif: number }
interface Invoice {
  id: string; nomor: string; tenant_id: string; tenant_nama: string; plan: string; plan_label: string
  harga: number; masa_nilai: number; masa_satuan: string; periode_mulai: string; periode_selesai: string
  keterangan: string; tanggal: string; created_at: string
}

const rupiah = (n: number) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')
const todayIso = () => new Date().toISOString().slice(0, 10)

function tambahMasa(iso: string, nilai: number, satuan: string) {
  const d = new Date(iso + 'T00:00:00')
  if (satuan === 'hari') d.setDate(d.getDate() + nilai)
  else d.setMonth(d.getMonth() + nilai)
  return d.toISOString().slice(0, 10)
}

export default function InvoicePage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    tenant_id: '', plan: 'pro', harga: 80000, masa_nilai: 1, masa_satuan: 'bulan',
    periode_mulai: todayIso(), periode_selesai: tambahMasa(todayIso(), 1, 'bulan'), keterangan: '',
  })

  const muat = useCallback(async () => {
    try {
      const [t, p, inv] = await Promise.all([
        api.get('/tenants'), api.get('/subscription/plans'), api.get('/admin/invoices'),
      ])
      setTenants(t.data); setPlans(p.data.plans || []); setInvoices(inv.data)
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal memuat data') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { muat() }, [muat])

  const pilihTenant = (id: string) => {
    const t = tenants.find(x => x.id === id)
    const plan = plans.find(p => p.plan === (t?.plan || 'pro')) || plans.find(p => p.plan === 'pro') || plans[0]
    setForm(f => ({
      ...f, tenant_id: id, plan: plan?.plan || 'pro', harga: plan?.harga ?? 0,
      masa_nilai: plan?.masa_nilai ?? 1, masa_satuan: plan?.masa_satuan || 'bulan',
      periode_selesai: tambahMasa(f.periode_mulai, plan?.masa_nilai ?? 1, plan?.masa_satuan || 'bulan'),
    }))
  }

  const pilihPlan = (planKey: string) => {
    const plan = plans.find(p => p.plan === planKey)
    setForm(f => ({
      ...f, plan: planKey, harga: plan?.harga ?? 0,
      masa_nilai: plan?.masa_nilai ?? 1, masa_satuan: plan?.masa_satuan || 'bulan',
      periode_selesai: tambahMasa(f.periode_mulai, plan?.masa_nilai ?? 1, plan?.masa_satuan || 'bulan'),
    }))
  }

  const buat = async () => {
    if (!form.tenant_id) return toast.error('Pilih lembaga')
    setSaving(true)
    try {
      const res = await api.post('/admin/invoices', form)
      toast.success('Invoice diterbitkan: ' + res.data.invoice.nomor)
      setOpen(false)
      muat()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menerbitkan') }
    finally { setSaving(false) }
  }

  const unduh = async (id: string, kind: 'pdf' | 'jpeg') => {
    try {
      const res = await api.get(`/admin/invoices/${id}/${kind}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = `invoice-${id}.${kind === 'pdf' ? 'pdf' : 'jpg'}`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal mengunduh ' + kind.toUpperCase()) }
  }

  const hapus = async (inv: Invoice) => {
    if (!confirm('Hapus invoice ' + inv.nomor + '?')) return
    try { await api.delete('/admin/invoices/' + inv.id); toast.success('Dihapus'); muat() }
    catch (e: any) { toast.error(e.response?.data?.error || 'Gagal menghapus') }
  }

  const totalTertagih = useMemo(() => invoices.reduce((s, i) => s + i.harga, 0), [invoices])

  if (loading) return <div className="py-16 text-center text-gray-400"><Loader2 className="animate-spin mx-auto" /></div>

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Invoice Langganan</h1>
          <p className="text-gray-500 text-sm mt-1">Terbitkan bukti tagihan langganan lembaga sebagai PDF & JPEG.</p>
        </div>
        <button onClick={() => setOpen(true)} className="px-4 py-2 bg-primary text-white rounded-lg text-sm inline-flex items-center gap-2">
          <Plus size={16} /> Terbitkan Invoice
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500">Total invoice</p>
          <p className="text-xl font-bold text-gray-800">{invoices.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500">Total tertagih</p>
          <p className="text-xl font-bold text-indigo-700">{rupiah(totalTertagih)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-sm text-gray-500">Lembaga</p>
          <p className="text-xl font-bold text-gray-800">{new Set(invoices.map(i => i.tenant_id)).size}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5">
        <ResponsiveTable<Invoice>
          columns={[
            { key: 'nomor', header: 'No. Invoice', render: (r) => <span className="font-mono text-xs">{r.nomor}</span> },
            { key: 'tenant_nama', header: 'Lembaga', render: (r) => <span className="font-medium text-gray-800">{r.tenant_nama || '—'}</span> },
            { key: 'plan_label', header: 'Paket', render: (r) => <span className="text-sm">{r.plan_label || r.plan}</span> },
            { key: 'harga', header: 'Nominal', render: (r) => <span className="font-medium">{rupiah(r.harga)}</span> },
            { key: 'tanggal', header: 'Terbit', hideOnMobile: true, render: (r) => <span className="text-xs text-gray-500">{r.tanggal}</span> },
          ]}
          rows={invoices}
          rowKey={(r) => r.id}
          empty="Belum ada invoice. Klik 'Terbitkan Invoice'."
          actions={(r) => (
            <div className="flex gap-2">
              <button onClick={() => unduh(r.id, 'pdf')} className="px-2 py-1 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100 inline-flex items-center gap-1"><FileText size={12} /> PDF</button>
              <button onClick={() => unduh(r.id, 'jpeg')} className="px-2 py-1 text-xs rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 inline-flex items-center gap-1"><ImageIcon size={12} /> JPEG</button>
              <button onClick={() => hapus(r)} className="px-2 py-1 text-xs rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100"><Trash2 size={12} /></button>
            </div>
          )}
        />
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Terbitkan Invoice</h2>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Lembaga *</label>
                <select value={form.tenant_id} onChange={e => pilihTenant(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Pilih lembaga --</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Paket</label>
                <select value={form.plan} onChange={e => pilihPlan(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                  {plans.map(p => <option key={p.plan} value={p.plan}>{p.label} ({rupiah(p.harga)})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nominal (Rp)</label>
                  <input type="number" min={0} value={form.harga} onChange={e => setForm({ ...form, harga: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Masa aktif</label>
                  <div className="flex gap-2">
                    <input type="number" min={1} value={form.masa_nilai} onChange={e => setForm({ ...form, masa_nilai: Number(e.target.value), periode_selesai: tambahMasa(form.periode_mulai, Number(e.target.value), form.masa_satuan) })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                    <select value={form.masa_satuan} onChange={e => setForm({ ...form, masa_satuan: e.target.value, periode_selesai: tambahMasa(form.periode_mulai, form.masa_nilai, e.target.value) })} className="px-2 py-2 border rounded-lg text-sm">
                      <option value="bulan">bulan</option>
                      <option value="hari">hari</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Periode mulai</label>
                  <input type="date" value={form.periode_mulai} onChange={e => setForm({ ...form, periode_mulai: e.target.value, periode_selesai: tambahMasa(e.target.value, form.masa_nilai, form.masa_satuan) })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Periode selesai</label>
                  <input type="date" value={form.periode_selesai} onChange={e => setForm({ ...form, periode_selesai: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Keterangan</label>
                <textarea value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} placeholder="Opsional — mis. pembayaran via transfer/QRIS" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setOpen(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={buat} disabled={saving} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm inline-flex justify-center items-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Terbitkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}