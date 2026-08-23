import { create } from 'zustand'
import api from '../services/api'

export type FeatureKey = 'master_data'|'jadwal'|'absensi'|'jurnal'|'penilaian'|'keuangan'|'whatsapp'|'posting'|'modul_ajar'|'backup_drive'|'cashless'|'ekantin'
export interface SubscriptionStateData { plan: string; locked: boolean; expires_at: string|null; features: Record<FeatureKey, boolean>; prices?: {lite:number;pro:number}; tenant_name?: string }
interface State { subscription: SubscriptionStateData|null; loading:boolean; load:()=>Promise<void>; setSubscription:(s:SubscriptionStateData)=>void }
export const useSubscriptionStore = create<State>(set => ({
  subscription: null, loading: false,
  load: async () => { if (!localStorage.getItem('jurnalku_token')) return; set({loading:true}); try { const {data}=await api.get('/subscription/status'); set({subscription:data}) } catch {} finally { set({loading:false}) } },
  setSubscription: subscription => set({subscription}),
}))
