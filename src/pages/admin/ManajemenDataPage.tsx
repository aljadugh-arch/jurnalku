import { useState, useEffect, useCallback } from 'react'
import { Database, Download, Upload, Trash2, RefreshCw, AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface Bagian { key: string; label: string }
interface Tenant { id: string; slug: string; nama: string; plan: string; aktif: number }
interface Ringkas { key: string; label: string; jumlah: number; per_tabel: Array<{ tabel: string; jumlah: number }> }
interface HapusHasil {
  bagian: string; label: string; dihapus: number; tenant_id: string | null
  rincian: Array<{ tabel: string; jumlah: number }>
  di_null: Array<{ tabel: string; kolom: string; jumlah: number }>
  tabel_disentuh: string[]; terhalang: Array<{ tabel: string; kolom: string; alasan: string }>
  integritas: { ok: boolean | null; pelanggaran?: number }
}
interface Riwayat { id: string; aksi: string; bagian: string; tenant_id: string | null; jumlah: number; oleh: string | null; created_at: string }

export default function ManajemenDataPage() {
  const [bagian, setBagian] = useState<Bagian[]>([])
  const [tenant, setTenant] = useState<Tenant[]>([])
  const [pilihTenant, setPilihTenant] = useState<string>('')  // '' = semua lembaga
  const [ringkas, setRingkas] = useState<Ringkas[]>([])
  const [loading, setLoading] = useState(false)
  const [riwayat, setRiwayat] = useState<Riwayat[]>([])
  const [imporBagian, setImporBagian] = useState('')
  const [imporMode, setImporMode] = useState<'merge' | 'replace'>('merge')
  const [imporFile, setImporFile] = useState<File | null>(null)
  const [imporJalan, setImporJalan] = useState(false)

  // Dialog hapus — wajib dua langkah: minta kode, lalu isi kode.
  const [hapusBagian, setHapusBagian] = useState<Ringkas | null>(null)
  const [kodeBenar, setKodeBenar] = useState('')
  const [kodeIsi, setKodeIsi] = useState('')
  const [hapusJalan, setHapusJalan] = useState(false)

  const namaTenant = (id: string) => tenant.find(t => t.id === id)?.nama || (id || 'Seluruh Lembaga')

  const muatRingkas = useCallback(() => {
    setLoading(true)
    api.get('/data-admin/ringkasan', { params: { tenant_id: pilihTenant || undefined } })
      .then(({ data }) => setRingkas(data.ringkasan || []))
      .catch(() => toast.error('Gagal memuat ringkasan data'))
      .finally(() => setLoading(false))
  }, [pilihTenant])

  useEffect(() => {
    api.get('/data-admin/bagian').then(({ data }) => { setBagian(data.bagian || []); setTenant(data.tenant || []) }).catch(() => toast.error('Gagal memuat daftar bagian'))
    api.get('/data-admin/riwayat').then(({ data }) => setRiwayat(data || [])).catch(() => {})
  }, [])

  useEffect(() => { muatRingkas() }, [muatRingkas])

  const ekspor = (r: Ringkas) => {
    const url = `/data-admin/ekspor/${r.key}${pilihTenant ? `?tenant_id=${encodeURIComponent(pilihTenant)}` : ''}`
    api.get(url, { responseType: 'blob' }).then(({ data }) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
      a.download = `jurnalku-${r.key}-${pilihTenant || 'semua'}-${Date.now()}.json`
      a.click(); URL.revokeObjectURL(a.href)
      toast.success(`${r.label} diekspor`)
    }).catch(() => toast.error('Gagal mengekspor data'))
  }

  const bukaHapus = async (r: Ringkas) => {
    if (r.jumlah === 0) { toast.error('Tidak ada data untuk dihapus'); return }
    try {
      const { data } = await api.get('/data-admin/kode-hapus', { params: { bagian: r.key, tenant_id: pilihTenant || undefined } })
      setKodeBenar(data.kode); setKodeIsi(''); setHapusBagian(r)
    } catch { toast.error('Gagal mengambil kode konfirmasi') }
  }

  const jalankanHapus = async () => {
    if (!hapusBagian) return
    if (kodeIsi.trim().toUpperCase() !== kodeBenar) { toast.error('Kode konfirmasi tidak cocok'); return }
    setHapusJalan(true)
    try {
      const { data } = await api.post('/data-admin/hapus', { bagian: hapusBagian.key, tenant_id: pilihTenant || undefined, kode: kodeIsi.trim().toUpperCase() })
      const h = data as HapusHasil
      toast.success(`${h.label}: ${h.dihapus} baris dihapus`)
      if (h.integritas && h.integritas.ok === false) toast.error(`PERINGATAN: ${h.integritas.pelanggaran} pelanggaran integritas tersisa`)
      if (h.terhalang?.length) toast.error(`${h.terhalang.length} tabel terhalang — lihat rincian`)
      setHapusBagian(null); muatRingkas()
      api.get('/data-admin/riwayat').then(({ data }) => setRiwayat(data || [])).catch(() => {})
    } catch (e: any) {
      const p = e?.response?.data
      if (p?.kode_benar) { setKodeBenar(p.kode_benar); toast.error(p.error) }
      else if (p?.error) toast.error(p.error)
      else toast.error('Gagal menghapus data')
    } finally { setHapusJalan(false) }
  }

  const jalankanImpor = async () => {
    if (!imporBagian) { toast.error('Pilih bagian data'); return }
    if (!imporFile) { toast.error('Pilih file JSON hasil ekspor'); return }
    setImporJalan(true)
    try {
      const teks = await imporFile.text()
      const payload = JSON.parse(teks)
      const { data } = await api.post('/data-admin/impor', { bagian: imporBagian, tenant_id: pilihTenant || undefined, mode: imporMode, payload })
      toast.success(`Impor selesai: ${data.masuk} baris masuk${data.dilewati ? `, ${data.dilewati} dilewati` : ''}`)
      setImporFile(null); muatRingkas()
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Gagal mengimpor (pastikan file JSON hasil ekspor)')
    } finally { setImporJalan(false) }
  }

  const totalBaris = ringkas.reduce((s, r) => s + r.jumlah, 0)

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Database size={22} /> Manajemen Data</h1>
        <p className="text-sm text-gray-500 mt-1">Kelola data seluruh lembaga dari satu tempat: lihat jumlah, ekspor, impor, dan hapus per bagian. Khusus super admin.</p>
      </div>

      <div className="rounded-xl border bg-white p-4 mb-5">
        <label className="block text-xs font-medium text-gray-600 mb-1">Lingkup data</label>
        <select value={pilihTenant} onChange={e => setPilihTenant(e.target.value)} className="w-full sm:w-96 px-3 py-2 border rounded-lg text-sm">
          <option value="">Seluruh Lembaga (semua tenant)</option>
          {tenant.map(t => <option key={t.id} value={t.id}>{t.nama} — paket {t.plan}{t.aktif ? '' : ' (nonaktif)'}</option>)}
        </select>
        <p className="text-xs text-gray-500 mt-2">
          {pilihTenant ? `Menampilkan data milik ${namaTenant(pilihTenant)} saja.` : 'Menampilkan data gabungan SELURUH lembaga. Penghapusan di lingkup ini menghapus data semua lembaga.'}
        </p>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden mb-5">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="text-sm font-semibold text-gray-700">Ringkasan Data <span className="text-gray-400 font-normal">({totalBaris.toLocaleString('id-ID')} baris)</span></div>
          <button onClick={muatRingkas} disabled={loading} className="flex items-center gap-1 text-sm text-primary hover:underline disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Muat ulang
          </button>
        </div>
        <div className="divide-y">
          {ringkas.map(r => (
            <div key={r.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-[180px]">
                <div className="text-sm font-medium text-gray-800">{r.label}</div>
                <div className="text-xs text-gray-400">{r.per_tabel.filter(t => t.jumlah > 0).map(t => `${t.tabel} ${t.jumlah}`).join(' · ') || 'kosong'}</div>
              </div>
              <div className={`text-sm font-semibold tabular-nums w-20 text-right ${r.jumlah ? 'text-gray-800' : 'text-gray-300'}`}>{r.jumlah.toLocaleString('id-ID')}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => ekspor(r)} disabled={!r.jumlah} title="Ekspor JSON" className="p-2 rounded-lg border text-gray-600 hover:bg-gray-50 disabled:opacity-40"><Download size={15} /></button>
                <button onClick={() => bukaHapus(r)} disabled={!r.jumlah} title="Hapus data bagian ini" className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
          {!ringkas.length && <div className="px-4 py-6 text-center text-sm text-gray-400">{loading ? 'Memuat…' : 'Tidak ada data'}</div>}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3"><Upload size={16} /> Impor Data</h2>
        <p className="text-xs text-gray-500 mb-3">Unggah file JSON hasil ekspor. Data akan dimasukkan ke lingkup yang dipilih di atas. Mode <b>gabung</b> menambah/menimpa berdasarkan kunci; mode <b>ganti</b> menghapus isi bagian itu lebih dulu.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select value={imporBagian} onChange={e => setImporBagian(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">— pilih bagian —</option>
            {bagian.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
          <select value={imporMode} onChange={e => setImporMode(e.target.value as 'merge' | 'replace')} className="px-3 py-2 border rounded-lg text-sm">
            <option value="merge">Gabung (aman)</option>
            <option value="replace">Ganti (hapus dulu)</option>
          </select>
          <input type="file" accept=".json,application/json" onChange={e => setImporFile(e.target.files?.[0] || null)} className="text-sm" />
        </div>
        <button onClick={jalankanImpor} disabled={imporJalan || !imporBagian || !imporFile} className="mt-3 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-50">
          {imporJalan ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Jalankan impor
        </button>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">Riwayat Penghapusan</div>
        <div className="divide-y max-h-72 overflow-y-auto">
          {riwayat.map(r => (
            <div key={r.id} className="flex items-center justify-between px-4 py-2 text-xs">
              <div><span className="font-medium text-gray-700">{r.bagian}</span> <span className="text-gray-400">· {namaTenant(r.tenant_id || '')}</span></div>
              <div className="flex items-center gap-3 text-gray-400">
                <span>{r.jumlah} baris</span>
                <span>{r.created_at}</span>
                {r.oleh && <span>{r.oleh}</span>}
              </div>
            </div>
          ))}
          {!riwayat.length && <div className="px-4 py-6 text-center text-sm text-gray-400">Belum ada operasi penghapusan</div>}
        </div>
      </div>

      {hapusBagian && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5">
            <div className="flex items-center gap-2 text-red-600 mb-3"><ShieldAlert size={20} /><h3 className="font-bold">Konfirmasi Penghapusan</h3></div>
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 mb-3">
              <div className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  Akan menghapus <b>{hapusBagian.jumlah.toLocaleString('id-ID')} baris</b> dari <b>{hapusBagian.label}</b> untuk <b>{namaTenant(pilihTenant)}</b>.
                  Data turunan yang bergantung (mis. nilai, absensi, jadwal) ikut terhapus. Tindakan ini tidak dapat dibatalkan.
                </div>
              </div>
            </div>
            <div className="text-xs text-gray-500 mb-1">Ketik kode berikut untuk melanjutkan:</div>
            <div className="mb-2 font-mono text-lg font-bold tracking-widest text-center rounded-lg bg-gray-100 py-2">{kodeBenar}</div>
            <input value={kodeIsi} onChange={e => setKodeIsi(e.target.value.toUpperCase())} placeholder="Ketik kode di sini" className="w-full px-3 py-2 border rounded-lg text-sm font-mono tracking-widest text-center mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setHapusBagian(null)} className="flex-1 rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Batal</button>
              <button onClick={jalankanHapus} disabled={hapusJalan || kodeIsi.trim().toUpperCase() !== kodeBenar} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50">
                {hapusJalan ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Hapus permanen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
