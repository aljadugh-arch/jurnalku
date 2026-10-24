import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import PublicShell, { PublicPageHead } from '../components/PublicShell'
import api from '../services/api'
import toast from 'react-hot-toast'
import { useSettingsStore } from '../stores/settingsStore'

const kategori = [
  { value: 'login', label: 'Login' },
  { value: 'password', label: 'Password' },
  { value: 'sso', label: 'SSO / Google' },
  { value: 'academic', label: 'Akademik' },
  { value: 'payment', label: 'Keuangan / Pembayaran' },
  { value: 'other', label: 'Lainnya' },
]

export default function HelpdeskPage() {
  const { settings } = useSettingsStore()
  const s = settings as any
  const [form, setForm] = useState({ nama: '', username_nim: '', email: '', phone: '', kategori: 'login', subjek: '', pesan: '' })
  const [loading, setLoading] = useState(false)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/publik/helpdesk', form)
      toast.success('Tiket berhasil dibuat. Tim akan membalas Anda.')
      setForm({ nama: '', username_nim: '', email: '', phone: '', kategori: 'login', subjek: '', pesan: '' })
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal membuat tiket.')
    } finally { setLoading(false) }
  }

  const namaLembaga = s.nama_lembaga || 'Lembaga'
  const wa = s.telepon ? String(s.telepon).replace(/[^0-9]/g, '') : ''

  return (
    <PublicShell active="Kontak">
      <PublicPageHead
        eyebrow="Layanan"
        title="Helpdesk"
        desc="Buat tiket bantuan untuk kendala login, password, akademik, atau layanan lainnya."
      />
      <section className="mx-auto max-w-[1160px] px-5 pb-16 pt-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <form onSubmit={kirim} className="sk-form-card">
              <h2>Buat Tiket Bantuan</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="sk-form-label">Nama</label>
                  <input className="sk-form-input" value={form.nama} onChange={set('nama')} required placeholder="Nama Anda" />
                </div>
                <div>
                  <label className="sk-form-label">Username / NIS</label>
                  <input className="sk-form-input" value={form.username_nim} onChange={set('username_nim')} placeholder="Opsional" />
                </div>
                <div>
                  <label className="sk-form-label">Email</label>
                  <input type="email" className="sk-form-input" value={form.email} onChange={set('email')} placeholder="email@contoh.id" />
                </div>
                <div>
                  <label className="sk-form-label">No. HP / WhatsApp</label>
                  <input className="sk-form-input" value={form.phone} onChange={set('phone')} placeholder="08xxxxxxxxxx" />
                </div>
                <div>
                  <label className="sk-form-label">Kategori</label>
                  <select className="sk-form-input" value={form.kategori} onChange={set('kategori')}>
                    {kategori.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="sk-form-label">Subjek</label>
                  <input className="sk-form-input" value={form.subjek} onChange={set('subjek')} required placeholder="Subjek kendala" />
                </div>
              </div>
              <div className="mt-4">
                <label className="sk-form-label">Jelaskan kendala</label>
                <textarea className="sk-form-input" rows={6} value={form.pesan} onChange={set('pesan')} required placeholder="Jelaskan kendala Anda secara detail" />
              </div>
              <button type="submit" disabled={loading} className="sk-btn mt-5">
                {loading ? 'Mengirim...' : 'Kirim Tiket'}
              </button>
            </form>
          </div>

          <aside className="space-y-4">
            <div className="sk-form-card text-center">
              <img src={settings.logo || '/logo-jurnalku-256.png'} alt="" className="mx-auto h-[68px] w-[68px] object-contain" />
              <h2 className="mt-3">Helpdesk {namaLembaga}</h2>
              <p className="text-sm sk-txt-muted">Tim pengelola sistem informasi lembaga</p>
              {wa && (
                <a
                  className="sk-btn mt-4 w-full"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`https://wa.me/${wa}?text=${encodeURIComponent('Halo, saya membutuhkan bantuan.')}`}
                >
                  <MessageCircle size={16} /> Hubungi via WhatsApp
                </a>
              )}
            </div>
          </aside>
        </div>
      </section>
    </PublicShell>
  )
}
