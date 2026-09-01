import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useSettingsStore } from '../stores/settingsStore'
import { tenantExportFilename, tenantIdentity, triggerBlobDownload } from '../utils/tenantExport'
import { todayWib } from '../lib/dateFormat'
import { escapeHtml } from '../utils/escapeHtml'

function responseFilename(disposition: string | undefined) {
  return disposition?.match(/filename="?([^";]+)"?/i)?.[1]
}

export default function FinanceExcelPanel() {
  const file = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<any>()
  const [busy, setBusy] = useState(false)
  const settings = useSettingsStore(s => s.settings)
  const tenant = tenantIdentity(settings)

  const exportFile = async () => {
    try {
      const response = await api.get('/finance-excel/export', { responseType: 'blob' })
      const filename = responseFilename(response.headers['content-disposition']) || tenantExportFilename('Rekap_Keuangan', tenant.name, todayWib(), 'xlsx')
      triggerBlobDownload(response.data, filename)
    } catch { toast.error('Ekspor gagal') }
  }

  const exportPdf = async () => {
    try {
      const [transactions, report] = await Promise.all([
        api.get('/keuangan/transaksi'),
        api.get('/keuangan/laporan'),
      ])
      const popup = window.open('', '_blank')
      if (!popup) return toast.error('Popup blocked')
      const money = (value: unknown) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0))
      const rows = (transactions.data || []).map((row: any, index: number) => `<tr><td>${index + 1}</td><td>${escapeHtml(row.tanggal || '')}</td><td>${escapeHtml(row.akun_nama || '')}</td><td>${escapeHtml(row.kategori_nama || '')}</td><td>${row.tipe === 'masuk' ? 'Masuk' : 'Keluar'}</td><td class="money">${money(row.nominal)}</td><td>${escapeHtml(row.keterangan || '')}</td></tr>`).join('')
      const filename = tenantExportFilename('Rekap_Keuangan', tenant.name, todayWib(), 'pdf').replace(/\.pdf$/, '')
      const logo = tenant.logo ? `<img src="${escapeHtml(tenant.logo)}" alt="Logo ${escapeHtml(tenant.name)}" onerror="this.style.display='none'">` : ''
      popup.document.write(`<!doctype html><html><head><title>${escapeHtml(filename)}</title><meta name="author" content="${escapeHtml(tenant.name)}"><style>@page{size:landscape;margin:9mm}body{font:10px Arial;color:#111}.kop{display:flex;align-items:center;justify-content:center;gap:14px;border-bottom:2px solid #111;padding-bottom:8px}.kop img{width:64px;height:64px;object-fit:contain}.kop div{text-align:center}.kop h1,.kop h2{margin:2px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.summary div{border:1px solid #bbb;padding:8px}.summary b{display:block;margin-top:3px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:4px}th{background:#eee}.money{text-align:right;white-space:nowrap}</style></head><body><div class="kop">${logo}<div><h1>${escapeHtml(tenant.name)}</h1>${tenant.address ? `<div>${escapeHtml(tenant.address)}</div>` : ''}<h2>REKAPITULASI KEUANGAN</h2></div></div><div class="summary"><div>Saldo Awal<b>${money(report.data.saldo_awal)}</b></div><div>Pemasukan<b>${money(report.data.debet)}</b></div><div>Pengeluaran<b>${money(report.data.kredit)}</b></div><div>Saldo Akhir<b>${money(report.data.saldo)}</b></div></div><table><thead><tr><th>No</th><th>Tanggal</th><th>Akun</th><th>Kategori</th><th>Tipe</th><th>Nominal</th><th>Keterangan</th></tr></thead><tbody>${rows || '<tr><td colspan="7" style="text-align:center">Belum ada transaksi</td></tr>'}</tbody></table><script>setTimeout(()=>window.print(),500)<\/script></body></html>`)
      popup.document.close()
    } catch { toast.error('Ekspor PDF gagal') }
  }

  const inspect = async () => {
    const selected = file.current?.files?.[0]
    if (!selected) return toast.error('Pilih file Excel')
    setBusy(true)
    try {
      const data = new FormData()
      data.append('file', selected)
      setPreview((await api.post('/finance-excel/preview', data)).data)
    } catch (error: any) { toast.error(error.response?.data?.error || 'Preview gagal') }
    finally { setBusy(false) }
  }

  const commit = async (policy: 'skip' | 'reject') => {
    if (!confirm(`Impor ${preview.valid} baris? Duplikat: ${policy}.`)) return
    setBusy(true)
    try {
      const response = await api.post('/finance-excel/commit', { token: preview.token, duplicate_policy: policy })
      toast.success(`${response.data.inserted} masuk, ${response.data.skipped} dilewati`)
      setPreview(undefined)
    } catch (error: any) { toast.error(error.response?.data?.error || 'Impor gagal') }
    finally { setBusy(false) }
  }

  return <section className="rounded-xl border bg-white p-4 space-y-3">
    <div className="flex flex-wrap gap-2">
      <button onClick={exportFile} className="rounded-lg border px-4 py-2 text-sm">Ekspor Excel</button>
      <button onClick={exportPdf} className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700">Ekspor PDF</button>
      <input ref={file} type="file" accept=".xlsx" className="text-sm" />
      <button disabled={busy} onClick={inspect} className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-50">Preview Impor</button>
    </div>
    {preview && <div className="text-sm">
      <p><b>{preview.valid}</b> valid, <b>{preview.errors.length}</b> bermasalah. Maksimal 5000 baris; master siswa, jenis tagihan, akun, kategori wajib sudah ada.</p>
      {preview.errors.slice(0, 10).map((error: any) => <p className="text-red-600" key={`${error.sheet}-${error.row}`}>{error.sheet} baris {error.row}: {error.error}</p>)}
      <div className="mt-2 flex gap-2"><button disabled={busy || preview.errors.length} onClick={() => commit('reject')} className="rounded border px-3 py-2 disabled:opacity-50">Impor, Tolak Semua Duplikat</button><button disabled={busy || preview.errors.length} onClick={() => commit('skip')} className="rounded bg-primary px-3 py-2 text-white disabled:opacity-50">Impor, Lewati Duplikat</button></div>
    </div>}
  </section>
}
