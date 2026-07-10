import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface Tagihan {
  id: string; siswa_id: string; siswa_nama: string; nis: string
  jenis_nama: string; jenis_tagihan_id: string; bulan: string; tahun: string
  nominal: number; status: string; tanggal_bayar: string; metode_bayar: string
}

export default function TagihanPage() {
  const [data, setData] = useState<Tagihan[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showGenerate, setShowGenerate] = useState(false)
  const [rombels, setRombels] = useState<any[]>([])
  const [jenisTagihan, setJenisTagihan] = useState<any[]>([])
  const [genForm, setGenForm] = useState({ jenis_nama: '', rombel_id: '', bulan: '', tahun: '2025', nominal: '' })

  const fetchData = async () => {
    try {
      const params: any = {}
      if (filter) params.status = filter
      const [res, rombelRes, jenisRes] = await Promise.all([
        api.get('/tagihan', { params }),
        api.get('/rombel'),
        api.get('/jenis-tagihan')
      ])
      setData(res.data); setRombels(rombelRes.data); setJenisTagihan(jenisRes.data)
    } catch { toast.error('Gagal memuat tagihan') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [filter])

  const filtered = data.filter(t =>
    t.siswa_nama?.toLowerCase().includes(search.toLowerCase()) ||
    t.nis?.includes(search)
  )

  const totalBelum = data.filter(t => t.status === 'belum_bayar').reduce((s, t) => s + t.nominal, 0)
  const totalLunas = data.filter(t => t.status === 'lunas').reduce((s, t) => s + t.nominal, 0)

  const handleBayar = async (id: string) => {
    if (!confirm('Konfirmasi pembayaran?')) return
    try {
      await api.put('/tagihan/' + id + '/bayar', { metode_bayar: 'tunai' })
      toast.success('Pembayaran berhasil')
      fetchData()
    } catch { toast.error('Gagal') }
  }

  const handleGenerate = async () => {
    if (!genForm.jenis_nama.trim()) { toast.error('Isi nama jenis tagihan'); return }
    if (!genForm.nominal || Number(genForm.nominal) <= 0) { toast.error('Isi nominal tagihan'); return }
    if (!genForm.rombel_id) { toast.error('Pilih rombel'); return }
    try {
      const res = await api.post('/tagihan/generate', genForm)
      const skip = res.data.skipped ? `, ${res.data.skipped} dilewati (duplikat)` : ''
      toast.success(`${res.data.count} tagihan digenerate${skip}`)
      setShowGenerate(false); setGenForm({ jenis_nama: '', rombel_id: '', bulan: '', tahun: '2025', nominal: '' }); fetchData()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal generate') }
  }

  const fmt = (n: number) => 'Rp ' + n.toLocaleString('id-ID')

  const handleKuitansi = (t: Tagihan) => {
    const w = window.open('', '_blank')
    if (!w) { toast.error('Popup blocked'); return }
    w.document.write(`<!DOCTYPE html><html><head><title>Kuitansi ${t.id}</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;padding:40px;background:#fff}
      .kw{max-width:600px;margin:0 auto;border:2px solid #333;padding:30px;border-radius:4px}
      .hdr{text-align:center;border-bottom:2px solid #333;padding-bottom:15px;margin-bottom:20px}
      .hdr h1{font-size:20px;font-weight:700;margin-bottom:4px}.hdr p{font-size:11px;color:#666}
      .row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px}
      .row .lbl{color:#666;width:140px;flex-shrink:0}.row .val{font-weight:600;text-align:right}
      .total{border-top:2px solid #333;margin-top:15px;padding-top:15px;display:flex;justify-content:space-between;font-size:16px;font-weight:700}
      .stamp{margin-top:30px;text-align:center;padding:12px;border:3px solid #16a34a;color:#16a34a;font-size:24px;font-weight:900;letter-spacing:4px;border-radius:4px;display:inline-block;float:right}
      .footer{margin-top:40px;font-size:11px;color:#999;text-align:center;clear:both}
      @media print{body{padding:20px}.no-print{display:none}}</style></head><body>
      <div class="kw">
        <div class="hdr"><h1>KUITANSI PEMBAYARAN</h1><p>JURNALKU — Sistem Manajemen Sekolah</p></div>
        <div class="row"><span class="lbl">No. Kuitansi</span><span class="val">KWT-${t.id.substring(0,8).toUpperCase()}</span></div>
        <div class="row"><span class="lbl">Tanggal Bayar</span><span class="val">${t.tanggal_bayar || '-'}</span></div>
        <div class="row"><span class="lbl">Siswa</span><span class="val">${t.siswa_nama}</span></div>
        <div class="row"><span class="lbl">NIS</span><span class="val">${t.nis}</span></div>
        <div class="row"><span class="lbl">Jenis Tagihan</span><span class="val">${t.jenis_nama}</span></div>
        <div class="row"><span class="lbl">Periode</span><span class="val">${t.bulan || ''} ${t.tahun}</span></div>
        <div class="row"><span class="lbl">Metode Bayar</span><span class="val">${t.metode_bayar || 'Tunai'}</span></div>
        <div class="total"><span>Total Pembayaran</span><span>${fmt(t.nominal)}</span></div>
        <div class="stamp">LUNAS</div>
        <div class="footer">Dikeluarkan oleh JURNALKU — ${new Date().toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'})}</div>
      </div>
      <div class="no-print" style="text-align:center;margin-top:20px"><button onclick="window.print()" style="padding:10px 30px;background:#333;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px">Cetak / Save PDF</button></div>
    </body></html>`)
    w.document.close()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Tagihan & Pembayaran</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola SPP, daftar ulang, dan tagihan lainnya</p>
        </div>
        <button onClick={() => setShowGenerate(true)} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
          Generate Tagihan
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Belum Bayar</p>
          <p className="text-xl font-bold text-red-600">{fmt(totalBelum)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Sudah Lunas</p>
          <p className="text-xl font-bold text-green-600">{fmt(totalLunas)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Total Tagihan</p>
          <p className="text-xl font-bold text-gray-800">{data.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Cari siswa..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setFilter('')} className={'px-3 py-2 rounded-lg text-sm ' + (!filter ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600')}>Semua</button>
          <button onClick={() => setFilter('belum_bayar')} className={'px-3 py-2 rounded-lg text-sm ' + (filter === 'belum_bayar' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600')}>Belum Bayar</button>
          <button onClick={() => setFilter('lunas')} className={'px-3 py-2 rounded-lg text-sm ' + (filter === 'lunas' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600')}>Lunas</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Siswa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Jenis</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Bulan</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nominal</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tgl Bayar</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Memuat...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Belum ada tagihan. Klik "Generate Tagihan" untuk membuat.</td></tr>
              ) : filtered.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3"><span className="font-medium text-gray-800">{t.siswa_nama}</span><br/><span className="text-xs text-gray-400">{t.nis}</span></td>
                  <td className="px-4 py-3 text-gray-600">{t.jenis_nama}</td>
                  <td className="px-4 py-3 text-gray-600">{t.bulan || '-'} {t.tahun}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{fmt(t.nominal)}</td>
                  <td className="px-4 py-3">
                    <span className={'px-2 py-1 rounded-full text-xs font-medium ' + (t.status === 'lunas' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                      {t.status === 'lunas' ? 'Lunas' : 'Belum Bayar'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{t.tanggal_bayar || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {t.status !== 'lunas' && <button onClick={() => handleBayar(t.id)} className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">Bayar</button>}
                      {t.status === 'lunas' && <button onClick={() => handleKuitansi(t)} className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">Kuitansi</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showGenerate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Generate Tagihan</h2>
              <button onClick={() => setShowGenerate(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Jenis Tagihan *</label><input type="text" value={genForm.jenis_nama} onChange={e => setGenForm({...genForm, jenis_nama: e.target.value})} placeholder="Contoh: SPP Juli, Daftar Ulang, Seragam" className="w-full px-3 py-2 border rounded-lg text-sm" /><p className="text-[11px] text-gray-400 mt-1">Ketik nama tagihan. Akan tersimpan otomatis untuk penggunaan berikutnya.</p></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Nominal *</label><input type="number" value={genForm.nominal} onChange={e => setGenForm({...genForm, nominal: e.target.value})} placeholder="150000" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Rombel *</label><select value={genForm.rombel_id} onChange={e => setGenForm({...genForm, rombel_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm"><option value="">-- Pilih --</option><option value="all">Semua Rombel (semua siswa aktif)</option>{rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Bulan</label><input value={genForm.bulan} onChange={e => setGenForm({...genForm, bulan: e.target.value})} placeholder="Januari" className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Tahun</label><input value={genForm.tahun} onChange={e => setGenForm({...genForm, tahun: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowGenerate(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm">Batal</button>
              <button onClick={handleGenerate} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">Generate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
