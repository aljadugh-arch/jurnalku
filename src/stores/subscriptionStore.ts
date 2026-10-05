import { create } from 'zustand'
import api from '../services/api'

export type FeatureKey = 'master_data'|'jadwal'|'absensi'|'jurnal'|'penilaian'|'keuangan'|'whatsapp'|'posting'|'modul_ajar'|'backup_drive'|'website'|'rest_api'|'cashless'|'ekantin'
export interface PlanInfo { plan: string; label: string; harga: number; masa_nilai: number; masa_satuan: string; aktif: 0|1; urutan: number; fitur?: string[] }
export interface SubscriptionStateData {
  plan: string
  locked: boolean
  /** true bila paket yang dipakai dinonaktifkan admin platform (kunci unlock tidak menolong). */
  plan_inactive?: boolean
  expires_at: string|null
  features: Record<FeatureKey, boolean>
  prices?: Record<string, number>
  plans?: PlanInfo[]
  tenant_name?: string
}
interface State { subscription: SubscriptionStateData|null; loading:boolean; load:()=>Promise<void>; setSubscription:(s:SubscriptionStateData)=>void }
export const useSubscriptionStore = create<State>(set => ({
  subscription: null, loading: false,
  load: async () => { if (!localStorage.getItem('jurnalku_token')) return; set({loading:true}); try { const {data}=await api.get('/subscription/status'); set({subscription:data}) } catch {} finally { set({loading:false}) } },
  setSubscription: subscription => set({subscription}),
}))
