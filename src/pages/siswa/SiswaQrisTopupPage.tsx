import { useEffect, useState } from 'react'
import { Loader2, Upload, Send, QrCode, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { imageFileToDataUrl } from '../../lib/image'
import QrisPayModal, { JALUR_PORTAL, type QrisTarget } from '../../components/QrisPayModal'

// QRIS statis MILIK LEMBAGA (bank / e-wallet apa pun), bukan akun merchant
// Shopee/GoPay seperti sebelumnya.
type QrisItem = { id: string; label: string; jenis: 'bank' | 'ewallet' | 'lain'; gambar: string }
type Qris = { enabled: boolean; qris_list: QrisItem[] }
const empty: Qris = { enabled: false, qris_list: [] }

const imageData = async (file: File, set: (x: string) => void) => {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) return toast.error('Upload gambar PNG/JPG/WEBP maksimal 5 MB')
  try { set(await imageFileToDataUrl(file, { maxSize: 1600 })) } catch { toast.error('Gagal memproses bukti transfer') }
}

export default function SiswaQrisTopupPage() {
  const [children, setChildren] = useState<any[]>([])
  const [gateway, setGateway] = useState(false)
  const [mode, setMode] = useState<'otomatis' | 'manual'>('manual')

  // --- mode otomatis (gateway) ---
  const [autoStudent, setAutoStudent] = useState('')
  const [autoNominal, setAutoNominal] = useState('')
  const [target, setTarget] = useState<QrisTarget | null>(null)

  // --- mode manual (QRIS statis + laporan bukti) ---
  const [qris, setQris] = useState(empty)
  const [studentId, setStudentId] = useState('')
  const [provider, setProvider] = useState('')
  const [amount, setAmount] = useState('')
  const [uniqueCode, setUniqueCode] = useState(() => String(Math.floor(100 + Math.random() * 900)))
  const [name, setName] = useState('')
  const [sender, setSender] = useState('')
  const [proof, setProof] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/portal/children')
      .then(r => { setChildren(r.data); if (r.data.length === 1) { setStudentId(r.data[0].id); setAutoStudent(r.data[0].id) } })
      .catch(() => toast.error('Gagal memuat data anak'))
    api.get('/portal/payment-gateway')
      .then(r => { const on = r.data?.enabled === true; setGateway(on); setMode(on ? 'otomatis' : 'manual') })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (gateway) return
    api.get('/cashless/provider/bank_transfer/static-qris')
      .then(r => { setQris({ enabled: !!r.data?.enabled, qris_list: Array.isArray(r.data?.qris_list) ? r.data.qris_list : [] }); setProvider(r.data?.qris_list?.[0]?.id || '') })
      .catch(() => {})
  }, [gateway])

  const bukaQris = () => {
    const nominal = Number(autoNominal) || 0
    if (!autoStudent) return toast.error('Pilih siswa dulu')
    if (nominal <= 0) return toast.error('Isi nominal top-up')
    setTarget({ ref_type: 'topup', student_id: autoStudent, nominal, label: 'Top-up saldo' })
  }

  const baseAmount = Number(amount) || 0
  const transferAmount = baseAmount + (Number(uniqueCode) || 0)

  const submit = async () => {
    setSaving(true)
    try {
      await api.post('/cashless/topup/manual', {
        student_id: studentId, provider, amount: baseAmount, unique_code: uniqueCode,
        transfer_amount: transferAmount, atas_nama: name, no_rek_dari: sender, bukti_transfer: proof,
      })
      toast.success('Laporan transfer dikirim, menunggu verifikasi bendahara')
      setAmount(''); setUniqueCode(String(Math.floor(100 + Math.random() * 900))); setName(''); setSender(''); setProof('')
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal mengirim laporan') }
    finally { setSaving(false) }
  }

  const qrisDipilih = qris.qris_list.find(q => q.id === provider) || null
  const img = qrisDipilih?.gambar || ''

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Top-up QRIS</h1>
        <p className="text-sm text-gray-500 mt-1">
          {gateway
            ? 'QRIS dibuat otomatis untuk nominal Anda — saldo langsung bertambah setelah dibayar.'
            : 'Scan QRIS merchant, lalu laporkan detail transfer agar bendahara dapat mencocokkannya.'}
        </p>
      </div>

      {gateway && (
        <div className="flex gap-2">
          <button onClick={() => setMode('otomatis')} className={`px-4 py-2 rounded-lg text-sm inline-flex items-center gap-2 ${mode === 'otomatis' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>
            <QrCode size={15} /> QRIS Otomatis
          </button>
          <button onClick={() => setMode('manual')} className={`px-4 py-2 rounded-lg text-sm inline-flex items-center gap-2 ${mode === 'manual' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>
            <FileText size={15} /> Laporan Manual
          </button>
        </div>
      )}

      {mode === 'otomatis' && gateway && (
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <select value={autoStudent} onChange={e => setAutoStudent(e.target.value)} className="w-full border rounded-lg p-2">
            <option value="">Pilih siswa</option>
            {children.map(c => <option key={c.id} value={c.id}>{c.nama} ({c.nis})</option>)}
          </select>
          <input type="number" placeholder="Nominal top-up (contoh 50000)" value={autoNominal} onChange={e => setAutoNominal(e.target.value)} className="w-full border rounded-lg p-2" />
          <p className="text-xs text-gray-500">
            Sistem menambahkan kode unik di belakang nominal agar pembayaran Anda terbaca otomatis. Bayar sesuai angka yang muncul.
          </p>
          <button onClick={bukaQris} className="w-full bg-primary text-white rounded-lg py-2.5 inline-flex justify-center items-center gap-2">
            <QrCode size={17} /> Tampilkan QRIS
          </button>
        </div>
      )}

      {mode === 'manual' && (
        !qris.enabled || !qris.qris_list.length ? (
          <div className="rounded-xl bg-amber-50 p-4 text-amber-800">QRIS belum diaktifkan oleh lembaga.</div>
        ) : (
          <>
            {/* Pilihan QRIS lembaga — bisa lebih dari dua, dari bank atau e-wallet. */}
            <div className="flex flex-wrap gap-2">
              {qris.qris_list.map(q => (
                <button key={q.id} onClick={() => setProvider(q.id)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${provider === q.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700'}`}>
                  {q.label}
                </button>
              ))}
            </div>
            <div className="bg-white rounded-xl border p-4 text-center">
              {img
                ? <img src={img} alt={`QRIS ${qrisDipilih?.label || ''}`} className="w-72 h-72 object-contain mx-auto" />
                : <p className="py-10 text-sm text-gray-400">Gambar QRIS belum diunggah.</p>}
              <p className="text-sm font-semibold mt-2">{qrisDipilih?.label || 'QRIS Lembaga'}</p>
            </div>
            <div className="bg-white rounded-xl border p-5 space-y-3">
              <select value={studentId} onChange={e => setStudentId(e.target.value)} className="w-full border rounded-lg p-2">
                <option value="">Pilih siswa</option>
                {children.map(c => <option key={c.id} value={c.id}>{c.nama} ({c.nis})</option>)}
              </select>
              <input type="number" placeholder="Nominal top-up (contoh 50000)" value={amount} onChange={e => setAmount(e.target.value)} className="w-full border rounded-lg p-2" />
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
                Kode unik verifikasi: <strong>{uniqueCode || '---'}</strong><br />
                Transfer tepat <strong>Rp {transferAmount.toLocaleString('id-ID')}</strong> (nominal top-up + kode unik 3 digit).
              </div>
              <input placeholder="Nama pengirim sesuai aplikasi" value={name} onChange={e => setName(e.target.value)} className="w-full border rounded-lg p-2" />
              <input placeholder="Nomor HP/akun pengirim" value={sender} onChange={e => setSender(e.target.value)} className="w-full border rounded-lg p-2" />
              <label className="block text-sm">
                Bukti transfer (wajib)
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => e.target.files?.[0] && imageData(e.target.files[0], setProof)} className="block mt-1" />
              </label>
              {proof && <img src={proof} alt="Bukti transfer" className="max-h-52 rounded border" />}
              <button onClick={submit} disabled={saving} className="w-full bg-primary text-white rounded-lg py-2.5 flex justify-center gap-2">
                {saving ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />} Kirim Laporan Transfer
              </button>
            </div>
          </>
        )
      )}

      {target && (
        <QrisPayModal
          target={target}
          paths={JALUR_PORTAL}
          onClose={() => setTarget(null)}
          onPaid={() => { setTarget(null); toast.success('Saldo akan bertambah otomatis') }}
        />
      )}
    </div>
  )
}