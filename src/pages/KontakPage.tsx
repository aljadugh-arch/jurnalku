import { useState } from 'react'
import { Mail, Phone, MessageCircle } from 'lucide-react'
import PublicShell, { PublicPageHead } from '../components/PublicShell'
import api from '../services/api'
import toast from 'react-hot-toast'
import { useSettingsStore } from '../stores/settingsStore'

export default function KontakPage() {
  const { settings } = useSettingsStore()
  const s = settings as any
  const [form, setForm] = useState({ nama: '', email: '', phone: '', subjek: '', pesan: '' })
  const [loading, setLoading] = useState(false)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/publik/kontak', form)
      toast.success('Pesan terkirim. Terima kasih.')
      setForm({ nama: '', email: '', phone: '', subjek: '', pesan: '' })
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal mengirim pesan.')
    } finally { setLoading(false) }
  }

  const namaLembaga = s.nama_lembaga || 'Lembaga'

  return (
    <PublicShell active="Kontak">
      <PublicPageHead
        eyebrow="Hubungi Kami"
        title="Kontak"
        desc="Sampaikan pertanyaan umum kepada tim pengelola."
      />
      <section className="mx-auto max-w-[1160px] px-5 pb-16 pt-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <form onSubmit={kirim} className="sk-form-card space-y-4">
              <h2>Kirim Pesan</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="sk-form-label">Nama</label>
                  <input className="sk-form-input" value={form.nama} onChange={set('nama')} required placeholder="Nama Anda" />
                </div>
                <div>
                  <label className="sk-form-label">Email</label>
                  <input type="email" className="sk-form-input" value={form.email} onChange={set('email')} placeholder="email@contoh.id" />
                </div>
              </div>
              <div>
                <label className="sk-form-label">No. HP / WhatsApp</label>
                <input className="sk-form-input" value={form.phone} onChange={set('phone')} placeholder="08xxxxxxxxxx" />
              </div>
              <div>
                <label className="sk-form-label">Subjek</label>
                <input className="sk-form-input" value={form.subjek} onChange={set('subjek')} placeholder="Subjek pesan" />
              </div>
              <div>
                <label className="sk-form-label">Pesan</label>
                <textarea className="sk-form-input" rows={5} value={form.pesan} onChange={set('pesan')} required placeholder="Tulis pesan Anda" />
              </div>
              <button type="submit" disabled={loading} className="sk-btn">
                {loading ? 'Mengirim...' : 'Kirim Pesan'}
              </button>
            </form>
          </div>

          <aside className="space-y-4">
            <div className="sk-form-card">
              <h2>{namaLembaga}</h2>
              <ul className="space-y-3 text-sm text-[#6f7785]">
                {s.telepon && (
                  <li className="flex items-center gap-2.5"><Phone size={16} className="text-[#f47b20]" /> {s.telepon}</li>
                )}
                {s.email && (
                  <li className="flex items-center gap-2.5"><Mail size={16} className="text-[#f47b20]" /> {s.email}</li>
                )}
                {s.alamat && (
                  <li className="flex items-start gap-2.5"><MessageCircle size={16} className="mt-0.5 text-[#f47b20]" /> {s.alamat}</li>
                )}
                {!s.telepon && !s.email && !s.alamat && (
                  <li>Informasi kontak belum diatur. Silakan gunakan formulir di samping.</li>
                )}
              </ul>
            </div>
            <div className="sk-form-card">
              <h2>Butuh bantuan akun?</h2>
              <p className="text-sm text-[#6f7785]">Untuk kendala login, password, atau SSO, gunakan Helpdesk.</p>
            </div>
          </aside>
        </div>
      </section>
    </PublicShell>
  )
}
