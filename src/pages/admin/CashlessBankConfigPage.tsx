import { useState, useEffect } from 'react'
import { Save, Loader2, QrCode, Plus, Trash2, Building2, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { imageFileToDataUrl } from '../../lib/image'

// ============================================================================
// Konfigurasi Transfer Bank & QRIS Lembaga
//
// Perubahan model: sebelumnya QRIS dibatasi ke dua akun merchant (ShopeePay &
// GoPay). Sekarang lembaga mengunggah QRIS statis MILIKNYA SENDIRI — bisa dari
// bank (BRI, BSI, Mandiri…) atau e-wallet (Dana, OVO…), berapa pun jumlahnya.
//
// Untuk pembayaran otomatis (QRIS dinamis), lembaga memakai Payment Gateway
// fazapay di menu Payment Gateway — bukan halaman ini. Halaman ini khusus
// QRIS statis yang diverifikasi manual oleh bendahara.
// ============================================================================

type Qris = { id: string; label: string; jenis: 'bank' | 'ewallet' | 'lain'; gambar: string }
type Config = {
  enabled: boolean
  va_prefix: string
  bank_code: string
  admin_fee: number
  manual_verify: boolean
  qris_list: Qris[]
}

const empty: Config = {
  enabled: false, va_prefix: '', bank_code: '', admin_fee: 0, manual_verify: true, qris_list: [],
}

const JENIS: { value: Qris['jenis']; label: string; ikon: any }[] = [
  { value: 'bank', label: 'Bank', ikon: Building2 },
  { value: 'ewallet', label: 'E-Wallet', ikon: Wallet },
  { value: 'lain', label: 'Lainnya', ikon: QrCode },
]

const readImage = async (file: File): Promise<string | null> => {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    toast.error('QRIS harus PNG, JPG, atau WEBP')
    return null
  }
  if (file.size > 1024 * 1024) {
    toast.error('Ukuran QRIS maksimal 1 MB')
    return null
  }
  try { return await imageFileToDataUrl(file, { maxSize: 1200 }) }
  catch { toast.error('Gagal memproses gambar QRIS'); return null }
}

export default function CashlessBankTransferConfigPage() {
  const [config, setConfig] = useState<Config>(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/cashless/provider/bank_transfer')
      .then(r => {
        const c = r.data?.config || {}
        setConfig({
          ...empty,
          ...c,
          enabled: Boolean(r.data?.enabled),
          qris_list: Array.isArray(c.qris_list) ? c.qris_list : [],
        })
      })
      .catch(() => toast.error('Gagal memuat konfigurasi'))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/cashless/provider/bank_transfer', config)
      toast.success('Konfigurasi transfer bank dan QRIS disimpan')
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const tambahQris = () => {
    if (config.qris_list.length >= 10) return toast.error('Maksimal 10 QRIS')
    setConfig(c => ({
      ...c,
      qris_list: [...c.qris_list, { id: `qris-${Date.now()}`, label: '', jenis: 'bank', gambar: '' }],
    }))
  }

  const ubahQris = (id: string, patch: Partial<Qris>) =>
    setConfig(c => ({ ...c, qris_list: c.qris_list.map(q => q.id === id ? { ...q, ...patch } : q) }))

  const hapusQris = (id: string) =>
    setConfig(c => ({ ...c, qris_list: c.qris_list.filter(q => q.id !== id) }))

  if (loading) {
    return <div className="p-12 text-center"><Loader2 className="mx-auto animate-spin" />Memuat…</div>
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Transfer Bank & QRIS Lembaga</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          QRIS statis milik lembaga untuk top-up yang diverifikasi bendahara.
        </p>
      </div>

      <div className="space-y-6 rounded-xl border bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        {/* ---- Transfer bank ---- */}
        <section className="space-y-4">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Transfer Bank</h2>
            <p className="mt-1 text-xs text-gray-500">Rekening tujuan/VA dan aturan verifikasi transfer manual.</p>
          </div>

          <label className="flex items-start gap-3 font-medium text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={config.enabled}
              onChange={e => setConfig({ ...config, enabled: e.target.checked })} className="mt-0.5" />
            <span>Aktifkan transfer bank sebagai metode top-up</span>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Prefix VA</span>
              <input type="text" value={config.va_prefix} maxLength={10}
                onChange={e => setConfig({ ...config, va_prefix: e.target.value.toUpperCase() })}
                placeholder="JURNAL"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              <span className="mt-1 block text-xs text-gray-500">Format VA: {config.va_prefix || 'PREFIX'} + NIS siswa</span>
            </label>

            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Kode Bank</span>
              <input type="text" inputMode="numeric" value={config.bank_code} maxLength={3}
                onChange={e => setConfig({ ...config, bank_code: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                placeholder="002, 008, 009, 014"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
              <span className="mt-1 block text-xs text-gray-500">3 digit: BRI 002, Mandiri 008, BNI 009, BCA 014.</span>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Biaya Admin per Transaksi (Rp)</span>
            <input type="number" min="0" step="100" value={config.admin_fee}
              onChange={e => setConfig({ ...config, admin_fee: Math.max(0, Number(e.target.value) || 0) })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
          </label>

          <label className="flex items-start gap-3 font-medium text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={config.manual_verify}
              onChange={e => setConfig({ ...config, manual_verify: e.target.checked })} className="mt-0.5" />
            <span>Verifikasi manual oleh admin/bendahara</span>
          </label>
        </section>

        {/* ---- QRIS lembaga ---- */}
        <section className="space-y-4 border-t pt-6 dark:border-gray-800">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">QRIS Statis Lembaga</h2>
              <p className="mt-1 text-xs text-gray-500">
                Unggah QRIS milik lembaga sendiri — dari bank atau e-wallet apa pun. Siswa memilih salah satu saat top-up.
              </p>
            </div>
            <button type="button" onClick={tambahQris}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">
              <Plus size={13} /> Tambah QRIS
            </button>
          </div>

          {config.qris_list.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-400 dark:border-gray-700">
              <QrCode size={32} className="mx-auto mb-2 opacity-60" />
              Belum ada QRIS. Klik "Tambah QRIS" untuk mengunggah QRIS lembaga.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {config.qris_list.map((q, i) => {
                const Ikon = JENIS.find(j => j.value === q.jenis)?.ikon || QrCode
                return (
                  <div key={q.id} className="min-w-0 space-y-3 rounded-xl border p-4 dark:border-gray-800">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                        <Ikon size={16} className="shrink-0" /> QRIS {i + 1}
                      </h3>
                      <button type="button" onClick={() => hapusQris(q.id)}
                        className="rounded-lg p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-xs text-gray-500">Nama tampil (mis. BRI, Dana, BSI)</span>
                      <input value={q.label} maxLength={40}
                        onChange={e => ubahQris(q.id, { label: e.target.value })}
                        placeholder="BRI"
                        className="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs text-gray-500">Jenis</span>
                      <select value={q.jenis} onChange={e => ubahQris(q.id, { jenis: e.target.value as Qris['jenis'] })}
                        className="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                        {JENIS.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
                      </select>
                    </label>

                    <label className="block text-xs text-gray-500">
                      Gambar QRIS
                      <input type="file" accept="image/png,image/jpeg,image/webp"
                        onChange={async e => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          const url = await readImage(f)
                          if (url) ubahQris(q.id, { gambar: url })
                        }}
                        className="mt-1 block w-full min-w-0 text-sm" />
                    </label>

                    {q.gambar && (
                      <>
                        <img src={q.gambar} alt={`QRIS ${q.label || i + 1}`}
                          className="mx-auto h-48 w-48 max-w-full rounded-lg border object-contain p-2" />
                        <button type="button" onClick={() => ubahQris(q.id, { gambar: '' })}
                          className="text-xs text-red-600">Hapus gambar</button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            QRIS statis tidak bisa membaca otomatis nama pengirim atau nominal. Siswa wajib mengisi identitas,
            nominal, dan bukti transfer; bendahara mencocokkan mutasi lalu memverifikasi.
          </div>
        </section>

        <button onClick={save} disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-white disabled:opacity-50">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Simpan Konfigurasi
        </button>
      </div>

      <p className="rounded-xl border bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
        Untuk pembayaran QRIS <strong>otomatis</strong> (nominal dibuat otomatis, saldo langsung masuk),
        gunakan menu <strong>Payment Gateway</strong> yang terhubung ke pg.fazapay.ccwu.cc — bukan halaman ini.
      </p>
    </div>
  )
}
