import { useEffect, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useSubscriptionStore, type FeatureKey } from '../stores/subscriptionStore'

const labels: Record<FeatureKey,[string,string]> = {
  master_data:['Data Master','Siswa, GTK, rombel, mapel, tahun ajaran dan pengguna'],
  jadwal:['Jadwal','Jadwal pelajaran, pengajar, wali kelas dan kalender'],
  absensi:['Absensi','Absensi siswa, guru, jamaah, kegiatan, ekskul dan ceklok'],
  jurnal:['Jurnal Mengajar','Jurnal kegiatan pembelajaran guru'],
  penilaian:['Penilaian & Rapor','Nilai, rapor, catatan kepribadian dan supervisi'],
  keuangan:['Keuangan','Tagihan, pembayaran, tabungan, beasiswa dan cashless'],
  whatsapp:['WhatsApp','Broadcast, gateway dan notifikasi otomatis'],
  posting:['Posting','Informasi dan posting lembaga'],
  modul_ajar:['Modul Ajar','Generator dan pengelolaan modul ajar'],
  backup_drive:['Backup Google Drive','Tersedia hanya pada paket Pro'],
  website:['Website Lembaga','Publikasi informasi lembaga'],
  cashless:['Cashless','Saldo digital, topup dan transaksi tanpa uang tunai'],
  ekantin:['E-Kantin','Menu kantin, order QR dan kasir digital'],
  rest_api:['REST API Developer','API key dan integrasi data eksternal'],
}
export default function FeatureSettings(){const {subscription,setSubscription}=useSubscriptionStore();const [features,setFeatures]=useState(subscription?.features);const [saving,setSaving]=useState(false);useEffect(()=>setFeatures(subscription?.features),[subscription]);if(!subscription||!features)return null;const save=async()=>{setSaving(true);try{const{data}=await api.put('/subscription/features',{features});setSubscription({...subscription,...data});toast.success('Pilihan menu berhasil disimpan')}catch(e:any){toast.error(e.response?.data?.error||'Gagal menyimpan fitur')}finally{setSaving(false)}};return <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100"><div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800"><SlidersHorizontal size={20}/>Menu & Fitur Aktif</h2><p className="text-sm text-gray-500 mt-1">Matikan modul yang tidak digunakan. Pengaturan hanya berlaku untuk lembaga ini.</p></div><span className="self-start rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary uppercase">Paket {subscription.plan}</span></div><div className="grid sm:grid-cols-2 gap-3 mt-5">{(Object.keys(labels) as FeatureKey[]).map(key=>{const planLocked=subscription.plan==='lite'&&['backup_drive'].includes(key);return <label key={key} className={'flex items-start justify-between gap-3 rounded-xl border p-3 '+(planLocked?'bg-gray-50 opacity-60':'cursor-pointer')}><span className="min-w-0"><b className="block text-sm text-gray-800">{labels[key][0]}</b><span className="block text-xs text-gray-500 mt-0.5">{labels[key][1]}</span></span><input type="checkbox" className="mt-1 h-5 w-5 accent-primary shrink-0" disabled={planLocked} checked={!!features[key]&&!planLocked} onChange={e=>setFeatures({...features,[key]:e.target.checked})}/></label>})}</div><button onClick={save} disabled={saving} className="mt-4 w-full sm:w-auto px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-50">{saving?'Menyimpan...':'Simpan Pilihan Fitur'}</button></div>}
