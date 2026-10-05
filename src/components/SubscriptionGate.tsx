import { useState, type ReactNode } from 'react'
import { LockKeyhole, ShieldOff } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { useSubscriptionStore } from '../stores/subscriptionStore'

const rupiah = (n: number) => 'Rp' + Number(n || 0).toLocaleString('id-ID')

export default function SubscriptionGate({ children }: { children: ReactNode }) {
  const role = useAuthStore(s => s.user?.role)
  const { subscription, setSubscription } = useSubscriptionStore()
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  if (!subscription?.locked || role === 'super_admin') return <>{children}</>

  const planInactive = !!subscription.plan_inactive
  const plans = (subscription.plans || []).filter(p => p.aktif)

  const unlock = async () => {
    setSaving(true)
    try {
      const { data } = await api.post('/subscription/unlock', { code })
      setSubscription(data)
      toast.success('Langganan berhasil dibuka')
    } catch (e: any) { toast.error(e.response?.data?.error || 'Kunci tidak valid') }
    finally { setSaving(false) }
  }

  return <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4"><div className="w-full max-w-lg rounded-3xl bg-white border shadow-xl p-6 sm:p-9 text-center">
    <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center ${planInactive ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
      {planInactive ? <ShieldOff size={32} /> : <LockKeyhole size={32} />}
    </div>
    <h1 className="mt-5 text-2xl font-bold text-slate-900">{planInactive ? 'Layanan Sedang Dinonaktifkan' : 'Akses Jurnal Terkunci'}</h1>
    <p className="mt-2 text-sm text-slate-600">
      {planInactive
        ? 'Paket langganan lembaga ini dinonaktifkan oleh admin platform, sehingga aplikasi belum bisa digunakan.'
        : 'Masa percobaan satu bulan atau langganan lembaga telah berakhir.'}
    </p>

    {!planInactive && plans.length > 0 && <div className="mt-5 grid sm:grid-cols-2 gap-3 text-left">
      {plans.map((p, i) => <div key={p.plan} className={`border rounded-xl p-3 ${i === plans.length - 1 ? 'border-primary/40' : ''}`}>
        <b>{p.label} — {rupiah(p.harga)}/{p.masa_satuan}</b>
        <p className="text-xs text-slate-500 mt-1">Masa aktif {p.masa_nilai} {p.masa_satuan}.</p>
      </div>)}
    </div>}

    {planInactive
      ? <p className="mt-6 text-sm text-rose-700">Hubungi admin platform untuk mengaktifkan kembali paket lembaga Anda. Kunci unlock tidak akan membantu pada kondisi ini.</p>
      : role === 'admin'
        ? <div className="mt-6"><label className="block text-sm font-medium text-left mb-1">Kunci unlock dari super admin</label><div className="flex flex-col sm:flex-row gap-2"><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} className="min-w-0 flex-1 border rounded-xl px-4 py-3 font-mono text-sm" placeholder="JURNAL-XXXX-XXXX" /><button disabled={saving || !code.trim()} onClick={unlock} className="px-5 py-3 bg-primary text-white rounded-xl disabled:opacity-50">{saving ? 'Memproses...' : 'Unlock'}</button></div></div>
        : <p className="mt-6 text-sm text-amber-700">Hubungi admin lembaga untuk memasukkan kunci unlock.</p>}
  </div></div>
}
