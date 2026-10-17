'use strict'

// Impor template surat dari Word (.docx), Excel (.xlsx/.xls), atau PDF.
//
// Tujuan: admin tidak perlu mengetik ulang format surat. Berkas diunggah, teks
// diekstrak, lalu diubah menjadi template HTML yang memakai placeholder
// {{nama}}, {{nomor}}, {{tanggal_surat}}, dst — sesuai mesin render yang sudah
// dipakai server/administrasi.cjs.
//
// Catatan penting:
//  - Word: dipertahankan struktur paragraf + tabel (mammoth -> HTML).
//  - Excel: setiap baris menjadi satu paragraf; kolom digabung dengan pemisah.
//  - PDF: hanya teks yang bisa diekstrak (PDF hasil scan TIDAK bisa, karena
//    perlu OCR — berkas seperti itu ditolak dengan pesan jelas, bukan diam-diam
//    menghasilkan template kosong).

const path = require('node:path')

const MAKS_BYTE = 10 * 1024 * 1024

// Placeholder yang dikenali mesin render surat (administrasi.cjs).
const PLACEHOLDER = [
  ['nomor', 'Nomor surat'],
  ['tanggal_surat', 'Tanggal surat'],
  ['perihal', 'Perihal'],
  ['kepada', 'Kepada'],
  ['nama', 'Nama penerima/terkait'],
  ['nip', 'NIP'],
  ['jabatan', 'Jabatan'],
  ['alamat', 'Alamat'],
  ['isi', 'Isi surat'],
  ['ttd', 'Blok tanda tangan'],
]

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Rapikan HTML hasil mammoth: buang style/class berlebih, sisakan struktur. */
function rapikanHtml(html) {
  return String(html || '')
    // Buang blok berbahaya BESERTA ISINYA. Membuang tag saja menyisakan teks
    // skrip yang bisa ikut tercetak di PDF surat.
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<img[^>]*>/gi, '')                       // gambar tidak ikut (tak bisa dirender PDF surat)
    // Buang atribut penangan event (onclick, onerror, dst) SEBELUM atribut lain.
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s(class|style|id|data-[\w-]+)="[^"]*"/gi, '')
    .replace(/<(?!\/?(p|br|b|strong|i|em|u|ul|ol|li|table|thead|tbody|tr|td|th|h1|h2|h3|h4|div)\b)[^>]+>/gi, '')
    .replace(/(\s*\n\s*){2,}/g, '\n')
    .trim()
}

/** Ekstrak teks dari PDF; menolak PDF tanpa lapisan teks (hasil scan).
 *  pdf-parse versi baru mengekspor kelas `PDFParse`, bukan fungsi default. */
async function dariPdf(buffer) {
  const mod = require('pdf-parse')
  let teks = ''
  try {
    if (typeof mod === 'function') {
      teks = String((await mod(buffer))?.text || '')
    } else if (typeof mod.PDFParse === 'function') {
      const parser = new mod.PDFParse({ data: buffer })
      try {
        const hasil = await parser.getText()
        teks = String(hasil?.text || '')
      } finally {
        await parser.destroy?.().catch?.(() => {})
      }
    } else if (typeof mod.pdf === 'function') {
      teks = String((await mod.pdf(buffer))?.text || '')
    } else {
      throw new Error('Pustaka PDF tidak dikenali.')
    }
  } catch (e) {
    throw new Error(`PDF tidak dapat dibaca. Pastikan berkas tidak rusak/terkunci password. (${e.message})`)
  }
  teks = teks.replace(/\r/g, '').trim()
  // pdf-parse menambahkan penanda halaman seperti "-- 1 of 1 --" yang bukan
  // bagian isi surat. Buang agar tidak ikut tercetak.
  teks = teks.replace(/^\s*-+\s*\d+\s+of\s+\d+\s*-+\s*$/gim, '').replace(/\n{3,}/g, '\n\n').trim()
  if (!teks || teks.replace(/\s/g, '').length < 20) {
    throw new Error('PDF ini tampaknya hasil pindai (gambar) sehingga teksnya tidak terbaca. Unggah DOCX, atau salin teksnya manual.')
  }
  return teks
}

/** Word -> HTML terstruktur (paragraf & tabel dipertahankan). */
async function dariWord(buffer) {
  const mammoth = require('mammoth')
  const hasil = await mammoth.convertToHtml({ buffer })
  const html = rapikanHtml(hasil.value)
  if (!html || html.replace(/<[^>]+>/g, '').trim().length < 10) {
    throw new Error('Dokumen Word tidak berisi teks yang bisa dibaca.')
  }
  return html
}

/** Excel -> HTML sederhana: tiap baris jadi paragraf, sel digabung " | ". */
async function dariExcel(buffer, ext) {
  const XLSX = require('xlsx')
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const namaSheet = wb.SheetNames[0]
  if (!namaSheet) throw new Error('Berkas Excel tidak punya lembar kerja.')
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[namaSheet], { header: 1, blankrows: false, raw: false })
  const baris = rows
    .map(r => (Array.isArray(r) ? r.map(c => String(c ?? '').trim()).filter(Boolean).join(' | ') : ''))
    .filter(Boolean)
  if (!baris.length) throw new Error('Lembar Excel kosong — tidak ada teks untuk dijadikan template.')
  return baris.map(b => `<p>${escapeHtml(b)}</p>`).join('\n')
}

/** Teks polos -> HTML paragraf. */
function dariTeks(teks) {
  return String(teks)
    .split(/\n{1,}/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => `<p>${escapeHtml(l)}</p>`)
    .join('\n')
}

/**
 * Ubah berkas menjadi { html, jenis, peringatan }.
 * @param {{buffer:Buffer, originalname:string, mimetype:string, size:number}} file
 */
async function imporTemplate(file) {
  if (!file || !file.buffer) throw new Error('Berkas tidak terbaca.')
  if (file.size > MAKS_BYTE) throw new Error(`Ukuran berkas melebihi ${MAKS_BYTE / 1024 / 1024} MB.`)
  const ext = path.extname(String(file.originalname || '')).toLowerCase()
  const peringatan = []

  let html = ''
  let jenis = ''

  if (ext === '.docx') {
    html = await dariWord(file.buffer); jenis = 'docx'
  } else if (ext === '.doc') {
    // .doc biner lama tidak didukung mammoth — beri arahan jelas.
    throw new Error('Format .doc lama tidak didukung. Simpan ulang sebagai .docx lalu unggah lagi.')
  } else if (ext === '.pdf') {
    html = dariTeks(await dariPdf(file.buffer)); jenis = 'pdf'
    peringatan.push('Dari PDF hanya teks yang diambil — tata letak, kolom, dan garis tidak terbawa. Rapikan di editor.')
  } else if (ext === '.xlsx' || ext === '.xls') {
    html = await dariExcel(file.buffer, ext); jenis = 'excel'
    peringatan.push('Dari Excel setiap baris menjadi satu paragraf; kolom digabung dengan " | ".')
  } else if (ext === '.txt') {
    html = dariTeks(file.buffer.toString('utf8')); jenis = 'txt'
  } else {
    throw new Error('Format tidak didukung. Gunakan DOCX, XLSX, XLS, PDF, atau TXT.')
  }

  // Deteksi placeholder yang sudah ada di dokumen (mis. {{nama}}).
  const adaPlaceholder = PLACEHOLDER.filter(([k]) => new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'i').test(html)).map(([k]) => k)
  if (!adaPlaceholder.length) {
    peringatan.push('Belum ada placeholder {{...}}. Tambahkan mis. {{nama}}, {{nomor}}, {{tanggal_surat}} agar data terisi otomatis.')
  }

  return { html, jenis, peringatan, placeholder_terdeteksi: adaPlaceholder, daftar_placeholder: PLACEHOLDER }
}

module.exports = { imporTemplate, PLACEHOLDER, MAKS_BYTE, rapikanHtml, escapeHtml }
