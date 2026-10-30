import { useState, useEffect, useCallback, useRef } from 'react'
import { escapeHtml } from '../../utils/escapeHtml'
import { Download, FileSpreadsheet, Eye, CheckCircle, XCircle, Clock, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import SearchInput, { cocokBeberapa } from '../../components/SearchInput'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { tenantIdentity } from '../../utils/tenantExport'
import { signatureBlockHtml, SIGNATURE_CSS, tenantSignatureSettings } from '../../utils/pdfSignature'
import * as XLSX from 'xlsx'

// Satu halaman = 24 kartu. Dulu endpoint mengirim SELURUH riwayat sekaligus
// (lembaga besar: 947 baris / 578 KB) dan browser merender semuanya — itulah
// penyebab halaman Jurnal terasa lama memuat.
const PER_HALAMAN = 24

export default function JurnalPage() {
  const user = useAuthStore(s => s.user)
  const settings = useSettingsStore(s => s.settings)
  const canReview = ['admin', 'super_admin', 'kepala', 'operator'].includes(user?.role || '')
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ tanggal: '', guru_id: '', status: '' })
  const [gtks, setGtks] = useState<any[]>([])
  const [detail, setDetail] = useState<any>(null)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [jumlahSubmitted, setJumlahSubmitted] = useState(0)
  const [cariGuru, setCariGuru] = useState('')
  // Penanda agar request lama tidak menimpa hasil request baru (race saat
  // filter diketik cepat).
  const reqSeq = useRef(0)

  useEffect(() => {
    api.get('/gtk').then(res => setGtks(res.data)).catch(() => {})
  }, [])

  const loadData = useCallback(async (halaman = 1) => {
    const seq = ++reqSeq.current
    setLoading(true)
    try {
      const params: any = { page: halaman, limit: PER_HALAMAN }
      if (filter.tanggal) params.tanggal = filter.tanggal
      if (filter.guru_id) params.guru_id = filter.guru_id
      if (filter.status) params.status = filter.status
      const res = await api.get('/jurnal', { params })
      if (seq !== reqSeq.current) return // sudah usang, abaikan
      const rows = Array.isArray(res.data) ? res.data : (res.data.rows || [])
      setData(rows)
      setTotal(Array.isArray(res.data) ? rows.length : (res.data.total || rows.length))
      setHasMore(Array.isArray(res.data) ? false : !!res.data.has_more)
    } catch (err: any) {
      if (seq === reqSeq.current) toast.error(err.response?.data?.error || 'Gagal memuat jurnal')
    } finally {
      if (seq === reqSeq.current) setLoading(false)
    }
  }, [filter])

  // Hitung jurnal berstatus submitted pada filter aktif (untuk tombol bulk).
  // Dihitung di server lewat limit=1 + status filter agar tidak perlu memuat semua.
  useEffect(() => {
    let batal = false
    const params: any = { page: 1, limit: 1, status: 'submitted' }
    if (filter.tanggal) params.tanggal = filter.tanggal
    if (filter.guru_id) params.guru_id = filter.guru_id
    api.get('/jurnal', { params })
      .then(res => { if (!batal) setJumlahSubmitted(res.data?.total ?? 0) })
      .catch(() => { if (!batal) setJumlahSubmitted(0) })
    return () => { batal = true }
  }, [filter, data])

  // Reset ke halaman 1 tiap filter berubah, lalu muat dengan debounce 300ms.
  useEffect(() => {
    setPage(1)
    const t = setTimeout(() => loadData(1), 300)
    return () => clearTimeout(t)
  }, [loadData])

  const gantiHalaman = (baru: number) => {
    const p = Math.max(1, baru)
    setPage(p)
    loadData(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Ambil SEMUA baris (untuk ekspor) memakai limit=0 di server.
  const ambilSemuaUntukEkspor = async (): Promise<any[]> => {
    const params: any = { limit: 0 }
    if (filter.tanggal) params.tanggal = filter.tanggal
    if (filter.guru_id) params.guru_id = filter.guru_id
    if (filter.status) params.status = filter.status
    const res = await api.get('/jurnal', { params })
    return Array.isArray(res.data) ? res.data : (res.data.rows || [])
  }

  const updateStatus = async (id: string, status: string) => {
    await api.put('/jurnal/' + id, { status })
    toast.success(`Status diubah ke ${status}`)
    loadData(page)
    if (detail?.id === id) setDetail({ ...detail, status })
  }

  const bulkUpdateStatus = async (status: 'approved' | 'rejected') => {
    const submittedCount = jumlahSubmitted
    if (!submittedCount) return toast.error('Tidak ada jurnal submitted pada filter ini')
    const action = status === 'approved' ? 'Setujui' : 'Tolak'
    if (!confirm(`${action} ${submittedCount} jurnal submitted pada filter ini?`)) return
    const confirmation = status === 'approved' ? 'SETUJUI SEMUA' : 'TOLAK SEMUA'
    setBulkSaving(true)
    try {
      const { data: result } = await api.post('/jurnal/bulk-status', {
        status,
        tanggal: filter.tanggal || undefined,
        guru_id: filter.guru_id || undefined,
        confirmation,
      })
      toast.success(`${result.count} jurnal berhasil ${status === 'approved' ? 'disetujui' : 'ditolak'}`)
      await loadData(page)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal memproses jurnal')
    } finally {
      setBulkSaving(false)
    }
  }

  // Susun ekspor PER ROMBEL: tiap rombel jadi satu lembar/section berisi jurnal
  // hariannya — beberapa guru & mapel per hari sesuai jadwal. Urut: tanggal -> jam
  // -> mapel -> guru.
  const kelompokRombel = (data: any[]) => {
    const map = new Map<string, any[]>()
    for (const d of data) {
      const key = String(d.rombel_nama || 'Tanpa Rombel').trim() || 'Tanpa Rombel'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(d)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) =>
        String(a.tanggal || '').localeCompare(String(b.tanggal || ''))
        || (Number(a.jam_ke) || 0) - (Number(b.jam_ke) || 0)
        || String(a.mapel_nama || '').localeCompare(String(b.mapel_nama || ''))
        || String(a.guru_nama || '').localeCompare(String(b.guru_nama || '')))
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }
  // Nama sheet Excel: maks 31 karakter, tanpa \ / ? * [ ] :
  const namaSheet = (s: string, dipakai: Set<string>) => {
    const dasar = s.replace(/[\\/?*[\]:]/g, '-').slice(0, 26).trim() || 'Rombel'
    let n = dasar, i = 2
    while (dipakai.has(n.toLowerCase())) { n = `${dasar.slice(0, 24)}-${i++}` }
    dipakai.add(n.toLowerCase())
    return n
  }

  const exportExcel = async () => {
    const semua = await ambilSemuaUntukEkspor()
    const grup = kelompokRombel(semua)
    const wb = XLSX.utils.book_new()
    const dipakai = new Set<string>()
    const judulKolom = ['No', 'Tanggal', 'Jam Ke', 'Mapel', 'Guru', 'Materi', 'Kegiatan', 'Catatan', 'Status']
    const lebar = [{ wch: 4 }, { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 22 }, { wch: 28 }, { wch: 24 }, { wch: 20 }, { wch: 10 }]
    // Ringkasan di depan: rombel + jumlah entri + jumlah hari.
    const ringkas = grup.map(([r, arr]) => [r, arr.length, new Set(arr.map(d => d.tanggal)).size])
    const wsR = XLSX.utils.aoa_to_sheet([
      ['RINGKASAN JURNAL MENGAJAR'],
      [`Total entri: ${semua.length} · Jumlah rombel: ${grup.length}`],
      [],
      ['Rombel', 'Jumlah Entri', 'Jumlah Hari'],
      ...ringkas,
    ])
    wsR['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, wsR, 'Ringkasan')
    for (const [rombel, arr] of grup) {
      const rows = arr.map((d, i) => [
        i + 1, d.tanggal, `Jam ${d.jam_ke}`, d.mapel_nama || '', d.guru_nama || '',
        d.materi || '', d.kegiatan || '', d.catatan || '', d.status
      ])
      const ws = XLSX.utils.aoa_to_sheet([
        ['JURNAL MENGAJAR'], [`Rombel: ${rombel}`], [],
        judulKolom, ...rows
      ])
      ws['!cols'] = lebar
      XLSX.utils.book_append_sheet(wb, ws, namaSheet(rombel, dipakai))
    }
    XLSX.writeFile(wb, 'Jurnal_Mengajar_per_Rombel.xlsx')
    toast.success(`Excel per rombel diunduh (${semua.length} baris · ${grup.length} rombel)`)
  }

  const exportPDF = async () => {
    const semua = await ambilSemuaUntukEkspor()
    const printWindow = window.open('', '_blank')
    if (!printWindow) { toast.error('Popup blocked'); return }
    const tenant = tenantIdentity(settings)
    const sigSettings = tenantSignatureSettings(settings)
    const logo = tenant.logo ? `<img src="${escapeHtml(tenant.logo)}" alt="Logo" onerror="this.style.display='none'">` : ''
    // Tiap rombel jadi satu blok tabel tersendiri (beberapa guru & mapel per hari).
    const blok = kelompokRombel(semua).map(([rombel, arr]) => {
      const rows = arr.map((d, i) =>
        `<tr><td>${i+1}</td><td>${escapeHtml(String(d.tanggal||''))}</td><td>Jam ${escapeHtml(String(d.jam_ke||''))}</td><td>${escapeHtml(d.mapel_nama||'')}</td><td>${escapeHtml(d.guru_nama||'')}</td><td class="materi">${escapeHtml(d.materi||'')}</td><td class="materi">${escapeHtml(d.kegiatan||'')}</td><td>${escapeHtml(String(d.status||''))}</td></tr>`
      ).join('')
      return `<div class="blok"><h4>Rombel: ${escapeHtml(rombel)} <span class="kecil">· ${arr.length} entri</span></h4><table><thead><tr><th>No</th><th>Tanggal</th><th>Jam</th><th>Mapel</th><th>Guru</th><th>Materi</th><th>Kegiatan</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`
    }).join('')
    const filterInfo = [filter.tanggal ? `Tanggal: ${filter.tanggal}` : '', filter.guru_id ? `Guru: ${gtks.find(g => g.id === filter.guru_id)?.nama || ''}` : '', filter.status ? `Status: ${filter.status}` : ''].filter(Boolean).join(' · ') || 'Semua data'
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Jurnal Mengajar</title><style>@page{size:landscape;margin:8mm}body{font-family:Arial,sans-serif;padding:14px;font-size:11px}.kop{display:flex;align-items:center;justify-content:center;gap:12px;border-bottom:2px solid #000;padding-bottom:7px;margin-bottom:8px}.kop img{width:58px;height:58px;object-fit:contain}.kop-text{text-align:center}.kop-text h2{margin:0}h3{text-align:center;margin:4px 0}.meta{margin:6px 0;font-size:10px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4px;text-align:center}.materi{text-align:left}th{background:#f3f4f6;font-size:10px}@media print{body{padding:0}}.blok{margin-bottom:14px;break-inside:auto}.blok h4{margin:0 0 4px;font-size:12px;background:#eef2ff;border-left:3px solid #4f46e5;padding:4px 8px;page-break-after:avoid}.blok .kecil{font-weight:normal;color:#64748b;font-size:10px}${SIGNATURE_CSS}</style></head><body><div class="kop">${logo}<div class="kop-text"><h2>${escapeHtml(tenant.name)}</h2>${tenant.address ? `<div>${escapeHtml(tenant.address)}</div>` : ''}</div></div><h3>JURNAL KEGIATAN PEMBELAJARAN (PER ROMBEL)</h3><div class="meta">${escapeHtml(filterInfo)}</div>${blok}${signatureBlockHtml(sigSettings, { leftTitle: 'Guru Mapel', rightTitle: 'Kepala Madrasah' })}<script>setTimeout(()=>window.print(),500)<\/script></body></html>`)
    printWindow.document.close()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Jurnal Mengajar</h1>
          <p className="text-gray-500 text-sm mt-1">Monitoring & kontrol jurnal mengajar guru</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
            <Download size={16} /> PDF
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input type="date" value={filter.tanggal} onChange={e => setFilter({...filter, tanggal: e.target.value})} className="w-full min-w-0 px-3 py-2 border rounded-lg text-sm" />
        <div className="min-w-0">
          {/* Daftar guru bisa ratusan — cari dulu, baru pilih. */}
          <SearchInput value={cariGuru} onChange={setCariGuru} placeholder="Cari guru…" className="mb-2" />
          <select value={filter.guru_id} onChange={e => setFilter({...filter, guru_id: e.target.value})} className="w-full min-w-0 px-3 py-2 border rounded-lg text-sm">
            <option value="">Semua Guru</option>
            {gtks.filter(g => cocokBeberapa(cariGuru, g.nama, g.nip)).map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
          </select>
        </div>
        <select value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})} className="w-full min-w-0 px-3 py-2 border rounded-lg text-sm">
          <option value="">Semua Status</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {canReview && <div className="flex flex-col sm:flex-row gap-2">
        <button onClick={() => bulkUpdateStatus('approved')} disabled={bulkSaving || jumlahSubmitted === 0} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
          <CheckCircle size={16} /> Setujui Semua
        </button>
        <button onClick={() => bulkUpdateStatus('rejected')} disabled={bulkSaving || jumlahSubmitted === 0} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
          <XCircle size={16} /> Tolak Semua
        </button>
        <p className="self-center text-xs text-gray-500">Hanya jurnal submitted pada filter tanggal dan guru yang aktif.</p>
      </div>}

      {/* Info jumlah + status pemuatan */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
        <span>
          {loading ? 'Memuat…' : `${data.length} dari ${total} jurnal ditampilkan`}
        </span>
        {total > PER_HALAMAN && !loading && (
          <span>Halaman {page} dari {Math.max(1, Math.ceil(total / PER_HALAMAN))}</span>
        )}
      </div>

      {/* Tiles */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm animate-pulse">
              <div className="h-4 w-32 rounded bg-gray-200" />
              <div className="mt-2 h-3 w-24 rounded bg-gray-100" />
              <div className="mt-3 h-3 w-20 rounded bg-gray-100" />
              <div className="mt-2 h-3 w-full rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {data.length === 0 ? <p className="col-span-full py-8 text-center text-gray-400">Belum ada jurnal</p> : data.map(j => (
            <article key={j.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="font-semibold text-gray-800 truncate">{j.guru_nama}</p><p className="text-xs text-gray-500 truncate">{j.mapel_nama} · {j.rombel_nama}</p></div>
                <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${j.status === 'approved' ? 'bg-green-100 text-green-700' : j.status === 'submitted' ? 'bg-blue-100 text-blue-700' : j.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{j.status}</span>
              </div>
              <p className="mt-3 text-xs text-gray-500">{j.tanggal} · Jam {j.jam_ke || '-'}</p>
              <p className="mt-2 line-clamp-2 text-sm text-gray-700">{j.materi || 'Materi belum diisi'}</p>
              <div className="mt-3 flex items-center justify-end gap-1 border-t border-gray-50 pt-3">
                <button onClick={() => setDetail(j)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Detail"><Eye size={16} /></button>
                {canReview && j.status === 'submitted' && <><button onClick={() => updateStatus(j.id, 'approved')} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="Approve"><CheckCircle size={16} /></button><button onClick={() => updateStatus(j.id, 'rejected')} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title="Reject"><XCircle size={16} /></button></>}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Paginasi */}
      {!loading && total > PER_HALAMAN && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => gantiHalaman(page - 1)}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            <ChevronLeft size={16} /> Sebelumnya
          </button>
          <span className="text-sm text-gray-600">{page} / {Math.max(1, Math.ceil(total / PER_HALAMAN))}</span>
          <button
            onClick={() => gantiHalaman(page + 1)}
            disabled={!hasMore}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            Berikutnya <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Detail Jurnal</h2>
              <button onClick={() => setDetail(null)} className="p-1 hover:bg-gray-100 rounded-lg"><XCircle size={20} /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-gray-500">Tanggal:</span> <strong>{detail.tanggal}</strong></div>
                <div><span className="text-gray-500">Jam:</span> <strong>{detail.jam_ke}</strong></div>
                <div><span className="text-gray-500">Guru:</span> <strong>{detail.guru_nama}</strong></div>
                <div><span className="text-gray-500">Mapel:</span> <strong>{detail.mapel_nama}</strong></div>
                <div><span className="text-gray-500">Rombel:</span> <strong>{detail.rombel_nama}</strong></div>
                <div><span className="text-gray-500">Status:</span> <strong>{detail.status}</strong></div>
              </div>
              <div>
                <p className="text-gray-500">Materi:</p>
                <p className="bg-gray-50 p-3 rounded-lg mt-1">{detail.materi || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">Kegiatan Pembelajaran:</p>
                <p className="bg-gray-50 p-3 rounded-lg mt-1">{detail.kegiatan || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">Catatan:</p>
                <p className="bg-gray-50 p-3 rounded-lg mt-1">{detail.catatan || '-'}</p>
              </div>
            </div>
            {canReview && detail.status === 'submitted' && (
              <div className="flex gap-2 mt-4">
                <button onClick={() => updateStatus(detail.id, 'approved')} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm">Approve</button>
                <button onClick={() => updateStatus(detail.id, 'rejected')} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Reject</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
