import { useState, useEffect } from 'react'
import { Mail, Server, CheckCircle2, XCircle, Loader2, Save, Send, Inbox } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface SmtpConfig {
  smtp_host: string; smtp_port: number; smtp_aman: string; smtp_user: string
  smtp_from: string; smtp_from_nama: string
  imap_host: string; imap_port: number; imap_aman: string; imap_user: string
  aktif: number; smtp_pass_terisi: boolean; imap_pass_terisi: boolean
  terakhir_uji?: string | null; terakhir_uji_ok?: number | null; terakhir_uji_pesan?: string | null
}

const kosong: SmtpConfig = {
  smtp_host: '', smtp_port: 587, smtp_aman: 'starttls', smtp_user: '', smtp_from: '', smtp_from_nama: '',
  imap_host: '', imap_port: 993, imap_aman: 'ssl', imap_user: '', aktif: 0,
  smtp_pass_terisi: false, imap_pass_terisi: false,
}

export default function SmtpSettingsPage() {
  const [cfg, setCfg] = useState<SmtpConfig>(kosong)
  const [smtpPass, setSmtpPass] = useState('')
  const [imapPass, setImapPass] = useState('')
  const [loading, setLoading] = useState(true)
  const [menyimpan, setMenyimpan] = useState(false)
  const [uji, setUji] = useState<{ jenis: string; jalan: boolean; hasil: any }>({ jenis: '', jalan: false, hasil: null })
  const [ujiKe, setUjiKe] = useState('')

  useEffect(() => {
    api.get('/smtp/config').then(({ data }) => setCfg({ ...kosong, ...data })).catch(() => toast.error('Gagal memuat konfigurasi SMTP')).finally(() => setLoading(false))
  }, [])

  const simpan = async () => {
    setMenyimpan(true)
    try {
      const { data } = await api.put('/smtp/config', { ...cfg, smtp_pass: smtpPass || undefined, imap_pass: imapPass || undefined })
      setCfg({ ...kosong, ...data.config }); setSmtpPass(''); setImapPass('')
      toast.success('Konfigurasi disimpan')
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Gagal menyimpan') }
    finally { setMenyimpan(false) }
  }

  const jalankanUji = async (jenis: 'smtp' | 'imap') => {
    // Simpan dulu supaya yang diuji adalah nilai yang benar-benar tersimpan.
    setMenyimpan(true)
    try {
      await api.put('/smtp/config', { ...cfg, smtp_pass: smtpPass || undefined, imap_pass: imapPass || undefined })
      setSmtpPass(''); setImapPass('')
    } catch { /* lanjut uji dengan yang tersimpan */ }
    finally { setMenyimpan(false) }
    setUji({ jenis, jalan: true, hasil: null })
    try {
      const { data } = await api.post('/smtp/uji', { jenis, to: ujiKe || undefined })
      setUji({ jenis, jalan: false, hasil: data })
      if (data.ok) toast.success(jenis === 'smtp' ? 'SMTP berhasil dihubungi' : 'IMAP berhasil dihubungi')
      else toast.error(data.error || 'Uji gagal')
      api.get('/smtp/config').then(({ data: d }) => setCfg({ ...kosong, ...d })).catch(() => {})
    } catch (e: any) {
      setUji({ jenis, jalan: false, hasil: { ok: false, error: e?.response?.data?.error || e.message } })
      toast.error('Uji gagal')
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Memuat…</div>

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Mail size={22} /> SMTP & IMAP Lembaga</h1>
        <p className="text-sm text-gray-500 mt-1">
          Kirim email notifikasi memakai server email lembaga sendiri (mis. <code>mail.domain-lembaga.id</code>, Gmail Workspace, Zoho).
          Bila tidak diaktifkan, email tetap dikirim memakai server platform.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4 mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={!!cfg.aktif} onChange={e => setCfg({ ...cfg, aktif: e.target.checked ? 1 : 0 })} className="w-4 h-4" />
          <span className="text-sm font-medium text-gray-700">Gunakan SMTP lembaga untuk mengirim email</span>
        </label>
        <p className="text-xs text-gray-400 mt-1 ml-6">Bila dicentang, semua email dari lembaga Anda dikirim lewat server di bawah. Bila gagal, otomatis jatuh ke server platform.</p>
      </div>

      <div className="rounded-xl border bg-white p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3"><Send size={16} /> Server Pengiriman (SMTP)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-600 mb-1">Host SMTP</label><input value={cfg.smtp_host} onChange={e => setCfg({ ...cfg, smtp_host: e.target.value })} placeholder="mail.lembaga.id" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <div><label className="block text-xs text-gray-600 mb-1">Port</label><input type="number" value={cfg.smtp_port} onChange={e => setCfg({ ...cfg, smtp_port: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <div><label className="block text-xs text-gray-600 mb-1">Keamanan</label><select value={cfg.smtp_aman} onChange={e => setCfg({ ...cfg, smtp_aman: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
            <option value="starttls">STARTTLS (biasanya port 587)</option><option value="ssl">SSL/TLS (biasanya port 465)</option><option value="none">Tanpa enkripsi (port 25 — tidak disarankan)</option>
          </select></div>
          <div><label className="block text-xs text-gray-600 mb-1">Username</label><input value={cfg.smtp_user} onChange={e => setCfg({ ...cfg, smtp_user: e.target.value })} placeholder="notifikasi@lembaga.id" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <div><label className="block text-xs text-gray-600 mb-1">Password {cfg.smtp_pass_terisi && <span className="text-green-600">(sudah diisi — kosongkan bila tidak diubah)</span>}</label><input type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder={cfg.smtp_pass_terisi ? '••••••••' : ''} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <div><label className="block text-xs text-gray-600 mb-1">Alamat pengirim</label><input value={cfg.smtp_from} onChange={e => setCfg({ ...cfg, smtp_from: e.target.value })} placeholder="no-reply@lembaga.id" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <div className="sm:col-span-2"><label className="block text-xs text-gray-600 mb-1">Nama pengirim</label><input value={cfg.smtp_from_nama} onChange={e => setCfg({ ...cfg, smtp_from_nama: e.target.value })} placeholder="Nama Lembaga" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <input value={ujiKe} onChange={e => setUjiKe(e.target.value)} placeholder="kirim uji ke email… (opsional)" className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[200px]" />
          <button onClick={() => jalankanUji('smtp')} disabled={uji.jalan || !cfg.smtp_host} className="flex items-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm text-primary hover:bg-primary/5 disabled:opacity-50">
            {uji.jalan && uji.jenis === 'smtp' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Uji & kirim email uji
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3"><Inbox size={16} /> Penerimaan Email (IMAP) <span className="text-xs font-normal text-gray-400">— opsional</span></h2>
        <p className="text-xs text-gray-500 mb-3">Dipakai untuk memverifikasi lembaga benar-benar bisa membaca kotak suratnya sendiri.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-600 mb-1">Host IMAP</label><input value={cfg.imap_host} onChange={e => setCfg({ ...cfg, imap_host: e.target.value })} placeholder="mail.lembaga.id" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <div><label className="block text-xs text-gray-600 mb-1">Port</label><input type="number" value={cfg.imap_port} onChange={e => setCfg({ ...cfg, imap_port: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <div><label className="block text-xs text-gray-600 mb-1">Keamanan</label><select value={cfg.imap_aman} onChange={e => setCfg({ ...cfg, imap_aman: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
            <option value="ssl">SSL/TLS (biasanya port 993)</option><option value="starttls">STARTTLS (biasanya port 143)</option><option value="none">Tanpa enkripsi</option>
          </select></div>
          <div><label className="block text-xs text-gray-600 mb-1">Username</label><input value={cfg.imap_user} onChange={e => setCfg({ ...cfg, imap_user: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
          <div className="sm:col-span-2"><label className="block text-xs text-gray-600 mb-1">Password {cfg.imap_pass_terisi && <span className="text-green-600">(sudah diisi)</span>}</label><input type="password" value={imapPass} onChange={e => setImapPass(e.target.value)} placeholder={cfg.imap_pass_terisi ? '••••••••' : ''} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
        </div>
        <button onClick={() => jalankanUji('imap')} disabled={uji.jalan || !cfg.imap_host} className="mt-3 flex items-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm text-primary hover:bg-primary/5 disabled:opacity-50">
          {uji.jalan && uji.jenis === 'imap' ? <Loader2 size={15} className="animate-spin" /> : <Inbox size={15} />} Uji koneksi IMAP
        </button>
      </div>

      {uji.hasil && (
        <div className={`rounded-xl border p-4 mb-4 ${uji.hasil.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <div className={`flex items-center gap-2 text-sm font-semibold ${uji.hasil.ok ? 'text-green-700' : 'text-red-700'}`}>
            {uji.hasil.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />} Hasil uji {uji.jenis.toUpperCase()}: {uji.hasil.ok ? 'BERHASIL' : 'GAGAL'}
          </div>
          {uji.hasil.error && <div className="text-xs text-red-700 mt-2">{uji.hasil.error}</div>}
          {uji.hasil.dialog?.length > 0 && (
            <details className="mt-2"><summary className="text-xs text-gray-500 cursor-pointer">Lihat percakapan dengan server ({uji.hasil.dialog.length} baris)</summary>
              <pre className="mt-2 text-[11px] bg-white border rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap">{uji.hasil.dialog.join('\n')}</pre>
            </details>
          )}
        </div>
      )}

      {cfg.terakhir_uji && (
        <div className="text-xs text-gray-500 mb-4">Uji terakhir: {cfg.terakhir_uji} — {cfg.terakhir_uji_ok ? 'berhasil' : 'gagal'}{cfg.terakhir_uji_pesan ? ` (${cfg.terakhir_uji_pesan})` : ''}</div>
      )}

      <button onClick={simpan} disabled={menyimpan} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm text-white disabled:opacity-50">
        {menyimpan ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Simpan konfigurasi
      </button>
    </div>
  )
}
