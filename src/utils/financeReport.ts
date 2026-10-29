import { signatureBlockHtml, SIGNATURE_CSS, tenantSignatureSettings, type SignatureSettings } from './pdfSignature'
import { escapeHtml } from './escapeHtml'

// Pembangun dokumen cetak (Save-as-PDF) bersama untuk SEMUA laporan keuangan
// bendahara: Tagihan & Pembayaran, Tabungan, Buku Kas, Laporan Keuangan.
// Satu kop lembaga + satu gaya tabel + satu blok tanda tangan (Bendahara |
// Kepala Lembaga) — bukan HTML cetak inline per halaman (dulu tiap halaman
// menulis ulang <style> dan kop sendiri, jadi tampilannya tidak seragam).
//
// Hasilnya dibuka via window.open + document.write + window.print() — pola
// ekspor PDF yang sama dengan RekapAbsensi/Jurnal (client-side, tanpa paket).

export type FinanceReportCell = string | { text: string; cls?: string; align?: string }

export type FinanceReportOpts = {
  /** Judul laporan, mis. "LAPORAN TAGIHAN & PEMBAYARAN". */
  title: string
  /** Periode manusiawi, mis. "14 Oktober 2026". */
  periode: string
  /** Header kolom tabel. */
  columns: string[]
  /** Baris tabel — tiap baris array sel. */
  rows: FinanceReportCell[][]
  /** Baris total di kaki tabel. */
  totals?: FinanceReportCell[]
  /** Catatan kaki di bawah tabel. */
  footnotes?: string[]
  /** Blok ringkasan di bawah judul (opsional). */
  summary?: { label: string; value: string }[]
  /** Identitas tenant untuk kop + tanda tangan. */
  settings?: Record<string, unknown>
  /** Jabatan kiri blok tanda tangan. Default: Bendahara. */
  signerTitle?: string
  /** Tampilkan blok tanda tangan. Default: true. */
  withSignature?: boolean
  /** Orientasi kertas. */
  landscape?: boolean
}

function sel(s: FinanceReportCell, fallbackAlign = 'left') {
  if (typeof s === 'string') {
    return `<td style="text-align:${fallbackAlign}">${escapeHtml(s)}</td>`
  }
  const cls = s.cls ? ` class="${s.cls}"` : ''
  const align = s.align || fallbackAlign
  return `<td${cls} style="text-align:${align}">${escapeHtml(s.text)}</td>`
}

export function financeReportHtml(opts: FinanceReportOpts): string {
  const t = tenantSignatureSettings((opts.settings || {}) as SignatureSettings)
  const logo = t.logo
    ? `<img src="${escapeHtml(t.logo)}" alt="logo" onerror="this.remove()" />`
    : ''

  const headerRow = opts.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')
  const bodyRows = opts.rows.map(row => {
    const cells = row.map((c, i) => sel(c, i === 0 ? 'left' : 'right')).join('')
    return `<tr>${cells}</tr>`
  }).join('')

  const totalsRow = opts.totals
    ? `<tr class="tot">${opts.totals.map((c, i) => sel(c, i === 0 ? 'left' : 'right')).join('')}</tr>`
    : ''

  const summaryBlock = (opts.summary && opts.summary.length)
    ? `<div class="summary">${opts.summary.map(s =>
        `<div class="sum-item"><span>${escapeHtml(s.label)}</span><b>${escapeHtml(s.value)}</b></div>`).join('')}</div>`
    : ''

  const footBlock = (opts.footnotes && opts.footnotes.length)
    ? `<div class="foot">${opts.footnotes.map(f => `<div>${escapeHtml(f)}</div>`).join('')}</div>`
    : ''

  const sigBlock = opts.withSignature !== false
    ? signatureBlockHtml(t, {
        leftTitle: opts.signerTitle || 'Bendahara',
        leftName: '',
        rightTitle: 'Kepala Lembaga',
      })
    : ''

  const orientation = opts.landscape ? 'size:landscape;margin:7mm' : 'size:portrait;margin:10mm'

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(opts.title)}</title>
<style>
@page{${orientation}}
body{font-family:Arial,sans-serif;font-size:10px;color:#000;margin:0}
.kop{display:flex;align-items:center;justify-content:center;gap:12px;border-bottom:2px solid #000;padding-bottom:7px;margin-bottom:8px}
.kop img{width:58px;height:58px;object-fit:contain}
.kop-text{text-align:center}
.kop-text h2,.kop-text h3{margin:1px 0}
.meta{display:flex;justify-content:center;margin:6px 0;font-weight:bold}
.hl{background:#ffeb3b;padding:2px 14px}
.summary{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:6px 0 10px}
.sum-item{border:1px solid #000;border-radius:6px;padding:4px 12px;text-align:center;min-width:120px}
.sum-item span{display:block;font-size:8px}
.sum-item b{font-size:11px}
table{border-collapse:collapse;width:100%;font-size:9px}
th,td{border:1px solid #000;padding:3px 4px}
th{background:#e5e7eb}
tr.tot td{background:#e5e7eb;font-weight:bold}
td.num{text-align:right}
tr:nth-child(even) td{background:#fafafa}
tr.tot td{background:#e5e7eb}
.foot{margin-top:8px;font-size:8px;display:flex;justify-content:space-between}
.print-actions{margin-top:16px;display:flex;justify-content:center}
.print-actions button{padding:10px 32px;background:#0f172a;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px}
@media print{.print-actions{display:none}}
${SIGNATURE_CSS}
</style>
</head>
<body>
<div class="kop">
  ${logo}
  <div class="kop-text">
    <h2>${escapeHtml(t.nama_lembaga)}</h2>
    ${t.alamat ? `<div>${escapeHtml(t.alamat)}</div>` : ''}
    <h3>${escapeHtml(opts.title.toUpperCase())}</h3>
  </div>
</div>
<div class="meta"><div>PERIODE: <span class="hl">${escapeHtml(opts.periode)}</span></div></div>
${summaryBlock}
<table>
  <thead><tr>${headerRow}</tr></thead>
  <tbody>${bodyRows}</tbody>
  ${totalsRow ? `<tfoot>${totalsRow}</tfoot>` : ''}
</table>
${footBlock}
<div class="foot" style="margin-top:8px"><div>Dicetak melalui JURNALKU</div><div>${new Date().toLocaleString('id-ID')}</div></div>
${sigBlock}
<div class="print-actions"><button onclick="window.print()">Cetak / Save PDF</button></div>
</body>
</html>`
}

/** Buka dokumen laporan di tab baru dan panggil dialog cetak. */
export function openFinanceReport(opts: FinanceReportOpts): boolean {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(financeReportHtml(opts))
  w.document.close()
  return true
}

export { escapeHtml }
