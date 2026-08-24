import { useState, useEffect } from 'react'
import { Send, MessageSquare, Users, GraduationCap, UserCheck, Clock, CheckCircle, XCircle, Eye, Phone, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

const templates = [
  { id: 'kbm', label: 'Info KBM/Pembelajaran', icon: '📚', pesan: 'Assalamualaikum Wr. Wb.\n\nYth. Orang Tua/Wali {nama},\n\nDiberitahukan bahwa besok ({tanggal}) akan diadakan kegiatan pembelajaran {mapel}.\n\nHarap siswa hadir tepat waktu.\n\nTerima kasih.\n{lembaga}' },
  { id: 'absensi', label: 'Laporan Absensi', icon: '📋', pesan: 'Assalamualaikum Wr. Wb.\n\nYth. Orang Tua/Wali {nama},\n\nLaporan kehadiran hari ini ({tanggal}):\nStatus: {status}\n\nJika ada pertanyaan silakan hubungi wali kelas.\n\nTerima kasih.\n{lembaga}' },
  { id: 'jadwal', label: 'Perubahan Jadwal', icon: '📅', pesan: 'Assalamualaikum Wr. Wb.\n\nYth. Bapak/Ibu {nama},\n\nDiberitahukan perubahan jadwal:\nHari: {tanggal}\nJam: {jam}\nMapel: {mapel}\n\nMohon perhatiannya.\n\nTerima kasih.\n{lembaga}' },
  { id: 'tagihan', label: 'Tagihan Pembayaran', icon: '💰', pesan: 'Assalamualaikum Wr. Wb.\n\nYth. Orang Tua/Wali {nama},\n\nMengingatkan tagihan yang belum dibayar:\nJumlah: Rp {jumlah}\n\nMohon segera melakukan pembayaran.\n\nTerima kasih.\n{lembaga}' },
  { id: 'tabungan', label: 'Info Tabungan', icon: '🏦', pesan: 'Assalamualaikum Wr. Wb.\n\nYth. Orang Tua/Wali {nama},\n\nInformasi tabungan siswa:\nSaldo saat ini: Rp {jumlah}\n\nTerima kasih.\n{lembaga}' },
  { id: 'umum', label: 'Pengumuman Umum', icon: '📢', pesan: 'Assalamualaikum Wr. Wb.\n\nYth. Bapak/Ibu {nama},\n\n[Isi pengumuman di sini]\n\nTerima kasih.\n{lembaga}' },
]

export default function BroadcastPage() {
  const [tab, setTab] = useState<'kirim' | 'riwayat' | 'whitelist'>('kirim')
  const [kategori, setKategori] = useState('semua_siswa')
  const [template, setTemplate] = useState(templates[0])
  const [pesan, setPesan] = useState(templates[0].pesan)
  const [rombels, setRombels] = useState<any[]>([])
  const [selectedRombel, setSelectedRombel] = useState('')
  const [history, setHistory] = useState<any[]>([])
  const [sending, setSending] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [whitelist, setWhitelist] = useState<any[]>([])
  const [wForm, setWForm] = useState({ phone: '', reason: '' })

  const loadWhitelist = async () => {
    try { setWhitelist((await api.get('/notif-whitelist')).data) } catch {}
  }
  const addWhitelist = async () => {
    if (!wForm.phone.trim()) { toast.error('Nomor HP wajib diisi'); return }
    try {
      await api.post('/notif-whitelist', { phone: wForm.phone, reason: wForm.reason })
      toast.success('Ditambahkan ke whitelist'); setWForm({ phone: '', reason: '' }); loadWhitelist()
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal') }
  }
  const removeWhitelist = async (id: string) => {
    if (!confirm('Hapus dari whitelist?')) return
    try { await api.delete('/notif-whitelist/' + id); toast.success('Dihapus'); loadWhitelist() } catch {}
  }

  useEffect(() => {
    api.get('/rombel').then(res => setRombels(res.data))
    loadHistory()
    loadWhitelist()
  }, [])

  const loadHistory = async () => {
    const res = await api.get('/broadcast')
    setHistory(res.data)
  }

  const selectTemplate = (t: typeof templates[0]) => {
    setTemplate(t)
    setPesan(t.pesan)
  }

  const handleSend = async () => {
    if (!pesan.trim()) { toast.error('Pesan tidak boleh kosong'); return }
    setSending(true)
    try {
      const body: any = { kategori, pesan }
      if (kategori === 'per_rombel') body.rombel_id = selectedRombel
      const res = await api.post('/broadcast/quick', body)
      toast.success(`Broadcast dimulai ke ${res.data.total} penerima`)
      loadHistory()
      setTab('riwayat')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal broadcast')
    }
    finally { setSending(false) }
  }

  const viewDetail = async (id: string) => {
    const res = await api.get('/broadcast/' + id)
    setDetail(res.data)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Broadcast WhatsApp</h1>
          <p className="text-gray-500 text-sm mt-1">Kirim notifikasi massal via WhatsApp</p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button onClick={() => setTab('kirim')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${tab === 'kirim' ? 'bg-white shadow text-primary' : 'text-gray-600'}`}>Kirim Baru</button>
          <button onClick={() => { setTab('riwayat'); loadHistory() }} className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${tab === 'riwayat' ? 'bg-white shadow text-primary' : 'text-gray-600'}`}>Riwayat</button>
        </div>
      </div>

      {tab === 'kirim' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Template */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="font-medium text-gray-800 mb-3 text-sm">Template Pesan</h3>
              <div className="space-y-2">
                {templates.map(t => (
                  <button key={t.id} onClick={() => selectTemplate(t)} className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition ${template.id === t.id ? 'bg-primary/10 text-primary border border-primary/20' : 'hover:bg-gray-50 border border-transparent'}`}>
                    <span>{t.icon}</span> {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="font-medium text-gray-800 mb-3 text-sm">Penerima</h3>
              <select value={kategori} onChange={e => setKategori(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm mb-2">
                <option value="semua_siswa">Semua Siswa</option>
                <option value="semua_gtk">Semua Guru/GTK</option>
                <option value="wali_murid">Wali Murid</option>
                <option value="per_rombel">Per Rombel</option>
              </select>
              {kategori === 'per_rombel' && (
                <select value={selectedRombel} onChange={e => setSelectedRombel(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">-- Pilih Rombel --</option>
                  {rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* Right: Editor & Preview */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="font-medium text-gray-800 mb-3 text-sm">Edit Pesan</h3>
              <textarea value={pesan} onChange={e => setPesan(e.target.value)} rows={10} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" />
              <div className="mt-2 text-xs text-gray-500">
                Variabel: <code className="bg-gray-100 px-1 rounded">{'{nama}'}</code> <code className="bg-gray-100 px-1 rounded">{'{nis}'}</code> <code className="bg-gray-100 px-1 rounded">{'{nip}'}</code> <code className="bg-gray-100 px-1 rounded">{'{kelas}'}</code> <code className="bg-gray-100 px-1 rounded">{'{mapel}'}</code> <code className="bg-gray-100 px-1 rounded">{'{tanggal}'}</code> <code className="bg-gray-100 px-1 rounded">{'{jam}'}</code> <code className="bg-gray-100 px-1 rounded">{'{jumlah}'}</code> <code className="bg-gray-100 px-1 rounded">{'{status}'}</code> <code className="bg-gray-100 px-1 rounded">{'{lembaga}'}</code>
              </div>
            </div>

            <div className="bg-green-50 rounded-xl p-4 border border-green-100">
              <h3 className="font-medium text-gray-800 mb-2 text-sm">📱 Preview</h3>
              <div className="bg-white rounded-lg p-3 text-sm whitespace-pre-wrap shadow-sm max-h-40 overflow-y-auto">
                {pesan.replace(/\{nama\}/g, 'Ahmad Fauzi').replace(/\{nis\}/g, '2024001').replace(/\{tanggal\}/g, new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta' }).format(new Date())).replace(/\{mapel\}/g, 'Matematika').replace(/\{jam\}/g, '07:30').replace(/\{jumlah\}/g, '250.000').replace(/\{status\}/g, 'Hadir').replace(/\{lembaga\}/g, 'JURNALKU').replace(/\{kelas\}/g, 'X-A').replace(/\{nip\}/g, '198501012010011001')}
              </div>
            </div>

            <button onClick={handleSend} disabled={sending} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              <Send size={18} /> {sending ? 'Mengirim...' : 'Kirim Broadcast'}
            </button>
          </div>
        </div>
      )}

      {tab === 'riwayat' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Waktu</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Kategori</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Judul</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Penerima</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Terkirim</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Gagal</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Belum ada riwayat broadcast</td></tr>
                  )}
                  {history.map(h => (
                    <tr key={h.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 text-xs">{h.created_at}</td>
                      <td className="px-4 py-3 text-gray-700 capitalize">{h.kategori?.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-gray-800 font-medium max-w-[200px] truncate">{h.judul}</td>
                      <td className="px-4 py-3 text-center">{h.total_penerima}</td>
                      <td className="px-4 py-3 text-center text-green-600 font-medium">{h.total_terkirim}</td>
                      <td className="px-4 py-3 text-center text-red-600 font-medium">{h.total_gagal}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${h.status === 'completed' ? 'bg-green-100 text-green-700' : h.status === 'sending' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                          {h.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => viewDetail(h.id)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Eye size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail Modal */}
          {detail && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
              <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h2 className="text-lg font-bold mb-2">Detail Broadcast</h2>
                <p className="text-sm text-gray-600 mb-1"><strong>Kategori:</strong> {detail.kategori}</p>
                <p className="text-sm text-gray-600 mb-3"><strong>Pesan:</strong></p>
                <pre className="text-xs bg-gray-50 p-3 rounded-lg mb-4 whitespace-pre-wrap">{detail.pesan}</pre>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2">Nama</th>
                      <th className="text-left px-3 py-2">Phone</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(detail.details || []).map((d: any) => (
                      <tr key={d.id}>
                        <td className="px-3 py-2">{d.nama}</td>
                        <td className="px-3 py-2 font-mono">{d.phone}</td>
                        <td className="px-3 py-2">
                          {d.status === 'sent' ? <CheckCircle size={14} className="text-green-600" /> : d.status === 'failed' ? <XCircle size={14} className="text-red-600" /> : <Clock size={14} className="text-yellow-600" />}
                        </td>
                        <td className="px-3 py-2 text-red-500">{d.error || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={() => setDetail(null)} className="mt-4 px-4 py-2 bg-gray-200 rounded-lg text-sm">Tutup</button>
              </div>
            </div>
          )}
        </div>
      )}
      {tab === 'whitelist' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Phone size={16}/> Tambah Nomor Whitelist</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <input value={wForm.phone} onChange={e => setWForm({...wForm, phone: e.target.value})} placeholder="08xxxxxxxxxx" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
              <input value={wForm.reason} onChange={e => setWForm({...wForm, reason: e.target.value})} placeholder="Keterangan (opsional)" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
              <button onClick={addWhitelist} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm"><Plus size={14}/>Tambah</button>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b"><h3 className="font-medium text-gray-700">Daftar Whitelist ({whitelist.length} nomor)</h3></div>
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {whitelist.length === 0 && <p className="px-4 py-8 text-center text-gray-400 text-sm">Belum ada nomor whitelist</p>}
              {whitelist.map((w: any) => (
                <div key={w.id} className="flex items-center justify-between px-4 py-3">
                  <div><p className="text-sm font-medium text-gray-800">{w.phone}</p>{w.reason && <p className="text-xs text-gray-400">{w.reason}</p>}</div>
                  <button onClick={() => removeWhitelist(w.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={15}/></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}