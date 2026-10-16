import * as XLSX from 'xlsx-js-style'
import { tenantIdentity, tenantExportFilename, exportSafeName, triggerBlobDownload } from './tenantExport'

// ============================================================================
// Pembangun Excel bersama — satu sumber agar SEMUA ekspor rapi dan seragam.
//
// Masalah yang diperbaiki: dulu DataSiswa/DataGTK mengekspor CSV mentah dengan
// `join(',')`, sehingga (a) koma di dalam alamat/nama memecah kolom dan tabel
// jadi "amburadul", (b) tidak ada kop/identitas lembaga, (c) lebar kolom tak
// diatur, (d) ekstensi .csv padahal user mengharapkan .xlsx. PDF sudah rapi
// karena dibangun sebagai dokumen HTML bertata letak.
//
// Helper ini menghasilkan workbook .xlsx sungguhan: kop lembaga + judul +
// baris tanggal, header berwarna tebal, lebar kolom otomatis, autofilter,
// dan angka ditulis sebagai angka (bukan teks) supaya bisa dihitung.
// ============================================================================

export type ExcelColumn = {
  header: string
  /** Kunci pada baris data, atau fungsi pengambil nilai. */
  value?: string | ((row: any) => unknown)
  /** Perkiraan lebar kolom (karakter). Bila kosong, dihitung dari isi. */
  width?: number
  /** Format angka Excel, mis. '#,##0' untuk rupiah, '0.00' untuk desimal. */
  numFmt?: string
}

export type ExcelSheetSpec = {
  /** Nama sheet (maks 31 karakter, tanpa karakter terlarang Excel). */
  name: string
  columns: ExcelColumn[]
  rows: any[]
}

export type ExcelDocOptions = {
  /** Judul dokumen, mis. "Data Siswa". */
  title: string
  /** Nama file tanpa ekstensi; default diturunkan dari judul + nama lembaga. */
  filename?: string
  /** Identitas lembaga (dari settings). */
  settings?: Record<string, unknown>
  /** Baris keterangan tambahan di bawah judul (mis. periode/filter). */
  subtitle?: string
}

const HEADER_FILL = 'FF1E40AF' // biru tua
const HEADER_FONT = 'FFFFFFFF'
const TITLE_SIZE = 14
const LABEL_SIZE = 11

function ambilNilai(row: any, col: ExcelColumn): unknown {
  if (typeof col.value === 'function') return col.value(row)
  if (typeof col.value === 'string') return row?.[col.value]
  return row?.[col.header]
}

/** Angka asli (number) atau string numerik murni → number; selain itu apa adanya. */
function normalisasiSel(v: unknown): unknown {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 'Ya' : 'Tidak'
  return String(v)
}

function namaSheetAman(nama: string, index: number): string {
  const bersih = String(nama || `Sheet${index + 1}`).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31)
  return bersih || `Sheet${index + 1}`
}

/**
 * Bangun satu worksheet bertata letak: kop, judul, header tabel, data,
 * lebar kolom, autofilter, dan gaya header.
 *
 * Baris:
 *   1  Nama lembaga
 *   2  Alamat lembaga (bila ada)
 *   3  (kosong)
 *   4  Judul dokumen
 *   5  Subtitle (bila ada)
 *   6  (kosong)
 *   7  Header kolom
 *   8+ Data
 */
function bangunSheet(spec: ExcelSheetSpec, opts: ExcelDocOptions, settings: Record<string, unknown>) {
  const ident = tenantIdentity(settings)
  const jumlahKolom = spec.columns.length
  const aoa: unknown[][] = []

  aoa.push([ident.name])                              // 1
  aoa.push([ident.address || ''])                     // 2
  aoa.push([])                                        // 3
  aoa.push([opts.title])                              // 4
  aoa.push([opts.subtitle || ''])                     // 5
  aoa.push([])                                        // 6
  aoa.push(spec.columns.map(c => c.header))           // 7 header

  const barisHeaderIndex = aoa.length - 1
  for (const row of spec.rows) {
    aoa.push(spec.columns.map(c => normalisasiSel(ambilNilai(row, c))))
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Lebar kolom: pakai `width` bila diberikan, selain itu hitung dari isi.
  ws['!cols'] = spec.columns.map((c, i) => {
    if (c.width) return { wch: c.width }
    const headerLen = String(c.header).length
    const isiLen = spec.rows.reduce((maks, r) => {
      const teks = String(normalisasiSel(ambilNilai(r, c)) ?? '')
      return Math.max(maks, teks.length)
    }, 0)
    return { wch: Math.min(50, Math.max(8, headerLen + 2, isiLen + 2)) }
  })

  // Autofilter hanya bila ada data, agar dropdown filter tidak menutupi kop.
  if (spec.rows.length > 0) {
    const ref = XLSX.utils.encode_range({
      s: { r: barisHeaderIndex, c: 0 },
      e: { r: barisHeaderIndex + spec.rows.length, c: Math.max(0, jumlahKolom - 1) },
    })
    ws['!autofilter'] = { ref }
  }

  // Gaya: judul besar tebal, header tabel putih di atas biru tua.
  const alamatSel = (r: number, c: number) => XLSX.utils.encode_cell({ r, c })
  const judulSel = alamatSel(3, 0)
  if (ws[judulSel]) ws[judulSel].s = { font: { bold: true, sz: TITLE_SIZE } }
  const namaSel = alamatSel(0, 0)
  if (ws[namaSel]) ws[namaSel].s = { font: { bold: true, sz: LABEL_SIZE } }

  for (let c = 0; c < jumlahKolom; c++) {
    const sel = alamatSel(barisHeaderIndex, c)
    if (!ws[sel]) continue
    ws[sel].s = {
      font: { bold: true, color: { rgb: HEADER_FONT } },
      fill: { fgColor: { rgb: HEADER_FILL }, patternType: 'solid' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      },
    }
  }

  // Format angka per kolom bila diminta.
  const adaNumFmt = spec.columns.some(c => c.numFmt)
  if (adaNumFmt) {
    for (let r = barisHeaderIndex + 1; r <= barisHeaderIndex + spec.rows.length; r++) {
      spec.columns.forEach((c, ci) => {
        if (!c.numFmt) return
        const sel = alamatSel(r, ci)
        if (ws[sel] && typeof ws[sel].v === 'number') ws[sel].z = c.numFmt
      })
    }
  }

  // Baris beku di bawah header supaya header tetap terlihat saat scroll.
  ws['!freeze'] = { xSplit: 0, ySplit: barisHeaderIndex + 1 }

  return ws
}

/**
 * Tulis file .xlsx dengan satu atau banyak sheet.
 * Semua sheet memakai kop lembaga yang sama; judul boleh per-sheet lewat
 * `spec.name` (dipakai sebagai nama tab) — judul dokumen tetap dari `opts.title`.
 */
export function unduhExcel(sheets: ExcelSheetSpec[], opts: ExcelDocOptions) {
  const settings = opts.settings || {}
  const wb = XLSX.utils.book_new()
  sheets.forEach((spec, i) => {
    const ws = bangunSheet(spec, opts, settings)
    XLSX.utils.book_append_sheet(wb, ws, namaSheetAman(spec.name, i))
  })

  const namaFile = opts.filename
    ? `${exportSafeName(opts.filename, 'Laporan')}.xlsx`
    : tenantExportFilename(opts.title, tenantIdentity(settings).name, new Date().toISOString().slice(0, 10), 'xlsx')

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  triggerBlobDownload(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    namaFile,
  )
  return namaFile
}
