import { useState, useEffect } from 'react'
import { Bell, MessageSquare, Save, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

export default function NotifSettingsPage() {
  const [settings, setSettings] = useState({
    absensi_siswa_ke_wali: false,
    guru_belum_ceklok: false,
    batas_ceklok_guru: '07:30',
    template_absensi_wali: '',
    template_guru_ceklok: '',
    notif_jadwal_guru: false,
    template_jadwal_guru: '',
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [whitelist, setWhitelist] = useState<any[]>([])
  const [whiteForm, setWhiteForm] = useState({ target_type: 'phone', phone: '', target_id: '', reason: '' })

  useEffect(() => {
    api.get('/notif-whitelist').then(r => setWhitelist(r.data)).catch(() => {})
    api.get('/notif-settings').then(res => {
      const d = res.data
      setSettings({
        absensi_siswa_ke_wali: !!d.absensi_siswa_ke_wali,
        guru_belum_ceklok: !!d.guru_belum_ceklok,
        batas_ceklok_guru: d.batas_ceklok_guru || '07:30',
        template_absensi_wali: d.template_absensi_wali || '',
        template_guru_ceklok: d.template_guru_ceklok || '',
        notif_jadwal_guru: !!d.notif_jadwal_guru,
        template_jadwal_guru: d.template_jadwal_guru || '',
      })
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/notif-settings', settings)
      toast.success('Pengaturan notifikasi berhasil disimpan')
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  const addWhitelist = async () => { try { await api.post('/notif-whitelist', whiteForm); const r = await api.get('/notif-whitelist'); setWhitelist(r.data); setWhiteForm({ target_type: 'phone', phone: '', target_id: '', reason: '' }); toast.success('Whitelist ditambah') } catch { toast.error('Gagal whitelist') } }
  const delWhitelist = async (id: string) => { try { await api.delete('/notif-whitelist/' + id); setWhitelist(whitelist.filter(w => w.id !== id)) } catch { toast.error('Gagal hapus') } }
  const handleTestJadwalGuru = async () => { setTesting(true); try { const r = await api.post('/notif/jadwal-guru'); toast.success(`Antrean notif jadwal: ${r.data.queued || 0}`) } catch { toast.error('Gagal test jadwal') } finally { setTesting(false) } }

  const handleTestGuruCeklok = async () => {
    setTesting(true)
    try {
      const res = await api.post('/notif/cek-guru-ceklok')
      if (res.data.skipped) {
        toast.error('Notifikasi guru nonaktif, aktifkan dulu')
      } else {
        toast.success(`Notifikasi terkirim ke ${res.data.sent} guru`)
      }
    } catch { toast.error('Gagal mengirim notifikasi') }
    finally { setTesting(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Pengaturan Notifikasi WA</h1>
          <p className="text-gray-500 text-sm mt-1">Atur notifikasi otomatis via WhatsApp</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
        </button>
      </div>

      {/* Toggle Notifikasi */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Notif Absensi Siswa -> Wali */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Bell size={20} className="text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">Notifikasi Absensi ke Wali Murid</h3>
                <p className="text-xs text-gray-500 mt-0.5">Kirim WA otomatis ke wali saat siswa diabsen</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={settings.absensi_siswa_ke_wali} onChange={e => setSettings({...settings, absensi_siswa_ke_wali: e.target.checked})} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-green-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
            </label>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">Template Pesan</label>
            <textarea
              value={settings.template_absensi_wali}
              onChange={e => setSettings({...settings, template_absensi_wali: e.target.value})}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="Gunakan variable: {nama_ortu}, {nama}, {status}, {tanggal}, {lembaga}"
            />
            <p className="text-xs text-gray-400 mt-1">Variable: {'{nama_ortu}'}, {'{nama}'}, {'{status}'}, {'{tanggal}'}, {'{lembaga}'}</p>
          </div>
        </div>

        {/* Notif Guru Belum Ceklok */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <MessageSquare size={20} className="text-orange-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">Notifikasi Guru Belum Ceklok</h3>
                <p className="text-xs text-gray-500 mt-0.5">Kirim WA ke guru yang belum absen</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={settings.guru_belum_ceklok} onChange={e => setSettings({...settings, guru_belum_ceklok: e.target.checked})} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-green-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
            </label>
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Batas Waktu Ceklok</label>
              <input type="time" value={settings.batas_ceklok_guru} onChange={e => setSettings({...settings, batas_ceklok_guru: e.target.value})} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <p className="text-xs text-gray-400 mt-1">Guru akan dinotif jika belum ceklok setelah jam ini</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Template Pesan</label>
              <textarea
                value={settings.template_guru_ceklok}
                onChange={e => setSettings({...settings, template_guru_ceklok: e.target.value})}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Gunakan variable: {nama}, {tanggal}, {lembaga}"
              />
              <p className="text-xs text-gray-400 mt-1">Variable: {'{nama}'}, {'{tanggal}'}, {'{lembaga}'}</p>
            </div>
            <button onClick={handleTestGuruCeklok} disabled={testing} className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-lg text-sm hover:bg-orange-200 disabled:opacity-50">
              {testing ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
              Test Kirim Notifikasi Sekarang
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
        <h3 className="font-semibold text-gray-800">Notifikasi Jadwal Guru Mapel</h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.notif_jadwal_guru} onChange={e => setSettings({...settings, notif_jadwal_guru: e.target.checked})} /> Aktifkan pengingat 5 menit sebelum jam mapel</label>
        <textarea value={settings.template_jadwal_guru} onChange={e => setSettings({...settings, template_jadwal_guru: e.target.value})} rows={3} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="{nama_guru}, {mapel}, {rombel}, {jam_mulai}, {jam_selesai}, {tanggal}, {lembaga}" />
        <button onClick={handleTestJadwalGuru} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Test Notif Jadwal Sekarang</button>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
        <h3 className="font-semibold text-gray-800">Whitelist Notifikasi WA</h3>
        <p className="text-xs text-gray-500">Nomor/target di daftar ini dikecualikan dari antrean WA.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2"><select value={whiteForm.target_type} onChange={e=>setWhiteForm({...whiteForm,target_type:e.target.value})} className="px-3 py-2 border rounded-lg text-sm"><option value="phone">Nomor</option><option value="siswa">Siswa</option><option value="gtk">GTK</option></select><input value={whiteForm.phone} onChange={e=>setWhiteForm({...whiteForm,phone:e.target.value})} placeholder="Nomor WA" className="px-3 py-2 border rounded-lg text-sm" /><input value={whiteForm.target_id} onChange={e=>setWhiteForm({...whiteForm,target_id:e.target.value})} placeholder="ID target opsional" className="px-3 py-2 border rounded-lg text-sm" /><button onClick={addWhitelist} className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm">Tambah</button></div>
        <div className="divide-y">{whitelist.map(w=><div key={w.id} className="py-2 flex justify-between text-sm"><span>{w.target_type} {w.phone || w.target_id} {w.reason ? '· '+w.reason : ''}</span><button onClick={()=>delWhitelist(w.id)} className="text-red-600">Hapus</button></div>)}</div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h4 className="font-medium text-blue-800 mb-2">Cara Kerja Notifikasi</h4>
        <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
          <li><strong>Absensi Siswa:</strong> Otomatis kirim WA ke nomor wali murid setiap kali absensi siswa disimpan (hadir/sakit/izin/alpha)</li>
          <li><strong>Guru Belum Ceklok:</strong> Kirim WA pengingat ke guru yang belum melakukan ceklok kehadiran setelah batas waktu</li>
          <li>Pastikan WhatsApp Gateway sudah terkoneksi di menu Pengaturan WhatsApp</li>
          <li>Nomor HP siswa (wali) dan guru harus terisi di data master</li>
        </ul>
      </div>
    </div>
  )
}
