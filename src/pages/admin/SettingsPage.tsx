import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { applyTheme } from '../../lib/applyTheme'
import { useSettingsStore } from '../../stores/settingsStore'
import { JENJANG_OPTIONS } from '../../lib/jenjang'
import MapPicker from '../../components/MapPicker'

export default function SettingsPage() {
  const [form, setForm] = useState({
    nama_lembaga: '', alamat: '', telepon: '', email: '',
    theme: 'light', primary_color: '#1e40af', accent_color: '#059669', sidebar_color: '#1e293b',
    geo_latitude: '', geo_longitude: '', geo_radius: '200', jenjang: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logo, setLogo] = useState('')
  const [background, setBackground] = useState('')
  const setSettings = useSettingsStore(s => s.setSettings)

  useEffect(() => {
    api.get('/settings').then(res => {
      const s = res.data
      setLogo(s.logo || '')
      setBackground(s.background || '')
      setForm({
        nama_lembaga: s.nama_lembaga || '', alamat: s.alamat || '', telepon: s.telepon || '', email: s.email || '',
        theme: s.theme || 'light', primary_color: s.primary_color || '#1e40af', accent_color: s.accent_color || '#059669', sidebar_color: s.sidebar_color || '#1e293b',
        geo_latitude: s.geo_latitude || '', geo_longitude: s.geo_longitude || '', geo_radius: s.geo_radius || '200', jenjang: s.jenjang || ''
      })
    }).catch(() => toast.error('Gagal memuat pengaturan'))
    .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/settings', form)
      applyTheme(form)
      setSettings(form)
      toast.success('Pengaturan berhasil disimpan')
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('logo', file)
    try {
      const res = await api.post('/settings/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const url = res.data.logo
      setLogo(url)
      setSettings({ logo: url })
      toast.success('Logo berhasil diunggah')
    } catch { toast.error('Gagal mengunggah logo') }
  }

  const handleBackgroundChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('background', file)
    try {
      const res = await api.post('/settings/background', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const url = res.data.background
      setBackground(url)
      setSettings({ background: url })
      toast.success('Background berhasil diunggah')
    } catch { toast.error('Gagal mengunggah background') }
  }

  const handleBackgroundRemove = async () => {
    try {
      await api.delete('/settings/background')
      setBackground('')
      setSettings({ background: '' })
      toast.success('Background dihapus')
    } catch { toast.error('Gagal menghapus background') }
  }

  const presets = [
    { name: 'Default Blue', primary: '#1e40af', accent: '#059669', sidebar: '#1e293b' },
    { name: 'Green Nature', primary: '#15803d', accent: '#0d9488', sidebar: '#1a2e1a' },
    { name: 'Purple Royal', primary: '#7c3aed', accent: '#db2777', sidebar: '#1e1b4b' },
    { name: 'Teal Ocean', primary: '#0f766e', accent: '#0284c7', sidebar: '#134e4a' },
    { name: 'Red Passion', primary: '#dc2626', accent: '#ea580c', sidebar: '#1c1917' },
    { name: 'Orange Warm', primary: '#ea580c', accent: '#ca8a04', sidebar: '#292524' },
  ]

  if (loading) return <div className="p-8 text-center text-gray-400">Memuat pengaturan...</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display break-words">Pengaturan Lembaga</h1>
          <p className="text-gray-500 text-sm mt-1">Identitas dan tampilan aplikasi</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
          <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
        </button>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Identitas Lembaga</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Nama Lembaga</label>
            <input value={form.nama_lembaga} onChange={e => setForm({...form, nama_lembaga: e.target.value})} className="w-full px-4 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Jenjang</label>
            <select value={form.jenjang} onChange={e => setForm({...form, jenjang: e.target.value})} className="w-full px-4 py-2 border rounded-lg text-sm">
              <option value="">- Pilih Jenjang -</option>
              {JENJANG_OPTIONS.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">Menentukan penamaan tingkat/kelas di Rombel (RA=A,B • MI=1-6 • MTs=7-9 • MA=10-12)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Alamat</label>
            <input value={form.alamat} onChange={e => setForm({...form, alamat: e.target.value})} className="w-full px-4 py-2 border rounded-lg text-sm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="min-w-0">
              <label className="block text-sm font-medium text-gray-600 mb-1">Telepon</label>
              <input value={form.telepon} onChange={e => setForm({...form, telepon: e.target.value})} className="w-full px-4 py-2 border rounded-lg text-sm" />
            </div>
            <div className="min-w-0">
              <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
              <input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full px-4 py-2 border rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Logo Lembaga</label>
            <div className="flex items-center gap-4">
              <img src={logo || '/logo-jurnalku-256.png'} alt="Logo" className="w-16 h-16 rounded-lg object-contain border bg-gray-50" />
              <input type="file" accept="image/*" onChange={handleLogoChange} className="text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Background Dashboard & Sidebar</label>
            <p className="text-xs text-gray-400 mb-2">Gambar latar untuk area dashboard dan sidebar. Kosongkan untuk warna polos.</p>
            <div className="flex items-center gap-4">
              <div className="w-24 h-16 rounded-lg border bg-gray-50 bg-cover bg-center flex items-center justify-center text-xs text-gray-400" style={background ? { backgroundImage: `url(${background})` } : undefined}>
                {!background && 'Polos'}
              </div>
              <input type="file" accept="image/*" onChange={handleBackgroundChange} className="text-sm" />
              {background && (
                <button type="button" onClick={handleBackgroundRemove} className="text-sm text-red-600 hover:text-red-700">Hapus</button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Tampilan & Theme</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Mode</label>
            <div className="flex gap-2">
              <button onClick={() => setForm({...form, theme: 'light'})} className={'px-4 py-2 rounded-lg text-sm ' + (form.theme === 'light' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600')}>Terang</button>
              <button onClick={() => setForm({...form, theme: 'dark'})} className={'px-4 py-2 rounded-lg text-sm ' + (form.theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600')}>Gelap</button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Preset Warna</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {presets.map(p => (
                <button key={p.name} onClick={() => setForm({...form, primary_color: p.primary, accent_color: p.accent, sidebar_color: p.sidebar})} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 min-w-0">
                  <div className="w-4 h-4 rounded-full shrink-0" style={{ background: p.primary }} />
                  <span className="text-gray-700 truncate">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Primary</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.primary_color} onChange={e => setForm({...form, primary_color: e.target.value})} className="w-8 h-8 rounded cursor-pointer shrink-0" />
                <input value={form.primary_color} onChange={e => setForm({...form, primary_color: e.target.value})} className="flex-1 min-w-0 px-3 py-2 border rounded-lg text-sm font-mono" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Accent</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.accent_color} onChange={e => setForm({...form, accent_color: e.target.value})} className="w-8 h-8 rounded cursor-pointer shrink-0" />
                <input value={form.accent_color} onChange={e => setForm({...form, accent_color: e.target.value})} className="flex-1 min-w-0 px-3 py-2 border rounded-lg text-sm font-mono" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Sidebar</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.sidebar_color} onChange={e => setForm({...form, sidebar_color: e.target.value})} className="w-8 h-8 rounded cursor-pointer shrink-0" />
                <input value={form.sidebar_color} onChange={e => setForm({...form, sidebar_color: e.target.value})} className="flex-1 min-w-0 px-3 py-2 border rounded-lg text-sm font-mono" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Geolokasi Ceklok Guru</h2>
        <p className="text-sm text-gray-500 mb-4">Klik pada peta atau geser marker untuk menentukan titik sekolah. Guru hanya bisa ceklok dalam radius yang ditentukan.</p>
        <MapPicker
          lat={form.geo_latitude ? parseFloat(form.geo_latitude) : null}
          lng={form.geo_longitude ? parseFloat(form.geo_longitude) : null}
          radius={parseInt(form.geo_radius) || 200}
          onChange={(lat, lng) => setForm(f => ({ ...f, geo_latitude: lat.toFixed(6), geo_longitude: lng.toFixed(6) }))}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Latitude</label>
            <input value={form.geo_latitude} readOnly placeholder="Belum dipilih" className="w-full px-4 py-2 border rounded-lg text-sm font-mono bg-gray-50 text-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Longitude</label>
            <input value={form.geo_longitude} readOnly placeholder="Belum dipilih" className="w-full px-4 py-2 border rounded-lg text-sm font-mono bg-gray-50 text-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Radius Meter</label>
            <input type="number" min="10" value={form.geo_radius} onChange={e => setForm({...form, geo_radius: e.target.value})} className="w-full px-4 py-2 border rounded-lg text-sm" />
          </div>
        </div>
      </div>
    </div>
  )
}
