// Blok tanda tangan untuk ekspor PDF (jurnal, rekap absensi, nilai ledger, dll).
// Format: kiri = Guru Mapel/Wali Kelas/Guru Kelas, kanan = Kepala Lembaga.
// Menyesuaikan contoh dokumen: "Mengetahui; ... Kepala ..." + "Guru Mapel (____)".

export type SignatureSettings = {
  nama_lembaga?: unknown
  kota_cetak?: unknown
  kepala_sekolah?: unknown
  alamat?: unknown
  logo?: unknown
}

export type SignatureOptions = {
  /** Jabatan & nama penandatangan kiri, mis. "Guru Mapel" / "Wali Kelas VII-A". */
  leftTitle?: string
  /** Nama orang di kiri (guru/wali). Kosongkan untuk garis kosong. */
  leftName?: string
  /** Label kanan; default "Kepala Lembaga". */
  rightTitle?: string
  /** Tanggal cetak (default: hari ini, waktu lokal). */
  date?: Date
  /** Tampilkan garis titik-titik nama (default true bila nama kosong). */
  showDate?: boolean
}

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

function formatTanggal(d: Date) {
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`
}

function escapeHtmlText(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * HTML blok tanda tangan dua kolom (kiri guru, kanan kepala).
 * Sertakan di dalam <body> hasil printWindow.document.write().
 */
export function signatureBlockHtml(settings: SignatureSettings, opts: SignatureOptions = {}) {
    const kota = String(settings.kota_cetak || '').trim()
  const tanggal = formatTanggal(opts.date || new Date())
    const tempatTanggal = kota ? `${escapeHtmlText(kota)}, ${tanggal}` : tanggal
  const kepala = String(settings.kepala_sekolah || '').trim()
  const leftTitle = opts.leftTitle || 'Guru Mapel'
  const rightTitle = opts.rightTitle || 'Kepala Lembaga'
  const leftName = String(opts.leftName || '').trim()
  const nama = (n: string) => n ? escapeHtmlText(n) : '(&nbsp;' + '.'.repeat(30) + '&nbsp;)'
  return `
  <div class="ttd-wrap">
    ${opts.showDate === false ? '' : `<div class="ttd-date">${tempatTanggal}</div>`}
    <div class="ttd-row">
      <div class="ttd-col">
        <div class="ttd-label">Mengetahui,</div>
        <div class="ttd-title">${escapeHtmlText(leftTitle)}</div>
        <div class="ttd-space"></div>
        <div class="ttd-name">${nama(leftName)}</div>
      </div>
      <div class="ttd-col">
        <div class="ttd-label">&nbsp;</div>
        <div class="ttd-title">${escapeHtmlText(rightTitle)}</div>
        <div class="ttd-space"></div>
        <div class="ttd-name">${nama(kepala)}</div>
      </div>
    </div>
  </div>`
}

/** CSS blok tanda tangan. Sisipkan dalam <style> dokumen cetak. */
export const SIGNATURE_CSS = `
.ttd-wrap{margin-top:26px;page-break-inside:avoid}
.ttd-date{text-align:right;font-size:10px;margin-bottom:19px}
.ttd-row{display:flex;justify-content:space-between;gap:24px}
.ttd-col{flex:1;text-align:center;font-size:10px}
.ttd-label{font-size:10px}
.ttd-title{font-size:10px;font-weight:bold}
.ttd-space{height:48px}
.ttd-name{border-top:1px dotted #000;padding-top:2px;font-size:10px}
@media print{.ttd-wrap{margin-top:22px}}
`

/** Identitas lengkap tenant untuk kop + TTD. */
export function tenantSignatureSettings(settings: SignatureSettings) {
  return {
    nama_lembaga: String(settings.nama_lembaga || 'Lembaga'),
    alamat: String(settings.alamat || ''),
    logo: String(settings.logo || ''),
    kota_cetak: String(settings.kota_cetak || ''),
    kepala_sekolah: String(settings.kepala_sekolah || ''),
  }
}
