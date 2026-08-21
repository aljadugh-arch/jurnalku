import { useState, type ReactNode } from 'react'
import { LockKeyhole } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { useSubscriptionStore } from '../stores/subscriptionStore'

export default function SubscriptionGate({ children }: { children: ReactNode }) {
  const role=useAuthStore(s=>s.user?.role); const {subscription,setSubscription}=useSubscriptionStore(); const [code,setCode]=useState(''); const [saving,setSaving]=useState(false)
  if (!subscription?.locked || role==='super_admin') return <>{children}</>
  const unlock=async()=>{setSaving(true);try{const {data}=await api.post('/subscription/unlock',{code});setSubscription(data);toast.success('Langganan berhasil dibuka')}catch(e:any){toast.error(e.response?.data?.error||'Kunci tidak valid')}finally{setSaving(false)}}
  return <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4"><div className="w-full max-w-lg rounded-3xl bg-white border shadow-xl p-6 sm:p-9 text-center">
    <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center"><LockKeyhole size={32}/></div>
    <h1 className="mt-5 text-2xl font-bold text-slate-900">Akses Jurnal Terkunci</h1><p className="mt-2 text-sm text-slate-600">Masa percobaan satu bulan atau langganan lembaga telah berakhir.</p>
    <div className="mt-5 grid sm:grid-cols-2 gap-3 text-left"><div className="border rounded-xl p-3"><b>Lite — Rp50.000/bulan</b><p className="text-xs text-slate-500 mt-1">Semua fitur jurnal, tanpa backup Google Drive dan website lembaga.</p></div><div className="border border-primary/40 rounded-xl p-3"><b>Pro — Rp80.000/bulan</b><p className="text-xs text-slate-500 mt-1">Semua fitur, termasuk backup Drive dan website lembaga.</p></div></div>
    {role==='admin'?<div className="mt-6"><label className="block text-sm font-medium text-left mb-1">Kunci unlock dari super admin</label><div className="flex flex-col sm:flex-row gap-2"><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} className="min-w-0 flex-1 border rounded-xl px-4 py-3 font-mono text-sm" placeholder="JURNAL-XXXX-XXXX"/><button disabled={saving||!code.trim()} onClick={unlock} className="px-5 py-3 bg-primary text-white rounded-xl disabled:opacity-50">{saving?'Memproses...':'Unlock'}</button></div></div>:<p className="mt-6 text-sm text-amber-700">Hubungi admin lembaga untuk memasukkan kunci unlock.</p>}
  </div></div>
}
