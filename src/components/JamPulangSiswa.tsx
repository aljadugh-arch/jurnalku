import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'

const days = [['senin','Senin'],['selasa','Selasa'],['rabu','Rabu'],['kamis','Kamis'],['jumat','Jumat'],['sabtu','Sabtu'],['minggu','Minggu/Ahad']]

export default function JamPulangSiswa() {
  const [rombels,setRombels]=useState<any[]>([]), [times,setTimes]=useState<Record<string,string>>({}), [active,setActive]=useState<Record<string,boolean>>({}), [saving,setSaving]=useState(false)
  useEffect(() => { Promise.all([api.get('/rombel'),api.get('/rombel-jam-pulang')]).then(([r,j]) => {
    setRombels(r.data); setTimes(Object.fromEntries(j.data.map((x:any)=>[`${x.rombel_id}:${x.hari}`,x.jam_pulang]))); setActive(Object.fromEntries(j.data.map((x:any)=>[`${x.rombel_id}:${x.hari}`,Boolean(x.aktif)])))
  }).catch(()=>toast.error('Gagal memuat jam pulang siswa')) }, [])
  const save=async()=>{const rows=rombels.flatMap(r=>days.map(([hari])=>{const k=`${r.id}:${hari}`;return{rombel_id:r.id,hari,jam_pulang:times[k]||'',aktif:active[k]!==false}}));if(rows.some(x=>x.aktif&&!x.jam_pulang))return toast.error('Isi jam untuk semua hari aktif');setSaving(true);try{await api.put('/rombel-jam-pulang',{rows});toast.success('Jam pulang siswa disimpan')}catch(e:any){toast.error(e.response?.data?.error||'Gagal menyimpan')}finally{setSaving(false)}}
  return <section className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
    <div className="flex flex-col sm:flex-row sm:justify-between gap-3 mb-4"><div><h2 className="text-lg font-semibold">Jam Pulang Siswa (QR)</h2><p className="text-sm text-gray-500">QR siswa per rombel dan hari. RA/MI/MTs/MA independen. Hari nonaktif menolak scan sebagai hari libur.</p></div><button onClick={save} disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-50">{saving?'Menyimpan...':'Simpan Jam Pulang'}</button></div>
    <p className="text-xs text-gray-500 mb-3">Format 24 jam HH:mm WIB. Browser mungkin menampilkan AM/PM sesuai locale; preview selalu HH:mm WIB.</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-sm"><thead><tr><th className="p-2 text-left">Rombel</th>{days.map(d=><th className="p-2 text-left" key={d[0]}>{d[1]}</th>)}</tr></thead><tbody>{rombels.map(r=><tr className="border-t" key={r.id}><th className="p-2 text-left">{r.nama}</th>{days.map(d=>{const k=`${r.id}:${d[0]}`,v=times[k]||'',on=active[k]!==false;return <td className="p-2" key={d[0]}><label className="flex gap-1 text-xs"><input type="checkbox" checked={on} onChange={e=>setActive(x=>({...x,[k]:e.target.checked}))}/>{on?'Aktif':'Libur'}</label>{on&&<><input type="time" value={v} aria-label={`${r.nama} ${d[1]} WIB`} onChange={e=>setTimes(x=>({...x,[k]:e.target.value}))} className="w-full border rounded px-2 py-1 mt-1"/><span className={"block text-xs mt-1 "+(v?'text-gray-600':'text-amber-600')}>{v?`${v} WIB`:'Belum diatur'}</span></>}</td>})}</tr>)}</tbody></table></div>
  </section>
}
