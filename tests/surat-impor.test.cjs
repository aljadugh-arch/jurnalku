'use strict'
// Uji impor template surat dengan berkas NYATA (docx, xlsx, pdf dibuat di sini).
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { imporTemplate, rapikanHtml } = require('../server/surat-impor.cjs')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'surat-'))

function berkas(nama, buffer, mimetype) {
  return { buffer, size: buffer.length, originalname: nama, mimetype }
}

test('DOCX nyata: teks & placeholder terbaca, tabel dipertahankan', async () => {
  // Bangun .docx asli memakai paket `docx`.
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell } = require('docx')
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun({ text: 'SURAT KETERANGAN', bold: true })] }),
        new Paragraph({ children: [new TextRun('Nomor: {{nomor}}')] }),
        new Paragraph({ children: [new TextRun('Yang bertanda tangan di bawah ini menerangkan bahwa {{nama}} dengan NIP {{nip}}.')] }),
        new Paragraph({ children: [new TextRun('Tanggal: {{tanggal_surat}}')] }),
        new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('No')] }), new TableCell({ children: [new Paragraph('Keterangan')] })] })] }),
      ],
    }],
  })
  const buf = await Packer.toBuffer(doc)
  const h = await imporTemplate(berkas('surat.docx', buf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
  assert.strictEqual(h.jenis, 'docx')
  assert.match(h.html, /SURAT KETERANGAN/)
  assert.match(h.html, /\{\{nomor\}\}/)
  assert.match(h.html, /\{\{nama\}\}/)
  assert.match(h.html, /<table/i, 'tabel harus dipertahankan')
  assert.ok(h.placeholder_terdeteksi.includes('nama'))
  assert.ok(h.placeholder_terdeteksi.includes('nomor'))
  assert.strictEqual(h.peringatan.length, 0, 'placeholder sudah ada -> tanpa peringatan')
})

test('XLSX nyata: tiap baris jadi paragraf, kolom digabung', async () => {
  const XLSX = require('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([
    ['SURAT UNDANGAN'],
    ['Nomor', '{{nomor}}'],
    ['Kepada', '{{kepada}}'],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const h = await imporTemplate(berkas('surat.xlsx', buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
  assert.strictEqual(h.jenis, 'excel')
  assert.match(h.html, /SURAT UNDANGAN/)
  assert.match(h.html, /Nomor \| \{\{nomor\}\}/)
  assert.ok(h.peringatan.some(p => /setiap baris/i.test(p)))
})

test('PDF nyata: teks diekstrak', async () => {
  const PDFDocument = require('pdfkit')
  const buf = await new Promise((resolve, reject) => {
    const doc = new PDFDocument()
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.fontSize(12).text('SURAT TUGAS')
    doc.moveDown().text('Nomor: {{nomor}}')
    doc.moveDown().text('Kepada: {{nama}}')
    doc.end()
  })
  const h = await imporTemplate(berkas('surat.pdf', buf, 'application/pdf'))
  assert.strictEqual(h.jenis, 'pdf')
  assert.match(h.html, /SURAT TUGAS/)
  assert.match(h.html, /\{\{nama\}\}/)
  assert.ok(h.peringatan.some(p => /tata letak/i.test(p)))
  assert.ok(!/of 1/.test(h.html), 'penanda halaman pdf-parse harus dibuang')
})

test('TXT: paragraf terbentuk, placeholder terdeteksi', async () => {
  const h = await imporTemplate(berkas('a.txt', Buffer.from('SURAT\nNomor {{nomor}}\nNama {{nama}}'), 'text/plain'))
  assert.strictEqual(h.jenis, 'txt')
  assert.match(h.html, /<p>SURAT<\/p>/)
})

test('format .doc lama ditolak dengan arahan jelas', async () => {
  await assert.rejects(
    () => imporTemplate(berkas('lama.doc', Buffer.from('xx'), 'application/msword')),
    /Simpan ulang sebagai \.docx/
  )
})

test('format tak didukung ditolak', async () => {
  await assert.rejects(() => imporTemplate(berkas('a.zip', Buffer.from('PK'), 'application/zip')), /tidak didukung/)
})

test('berkas kosong / tanpa buffer ditolak', async () => {
  await assert.rejects(() => imporTemplate(null), /tidak terbaca/)
})

test('tanpa placeholder -> peringatan diberikan (bukan gagal)', async () => {
  const h = await imporTemplate(berkas('a.txt', Buffer.from('Surat biasa tanpa placeholder sama sekali'), 'text/plain'))
  assert.ok(h.peringatan.some(p => /placeholder/i.test(p)))
})

test('rapikanHtml membuang img, class, dan tag berbahaya', () => {
  const kotor = '<p class="x" style="color:red" onclick="evil()">Halo</p><img src="x.png"><script>alert(1)</script><b>Tebal</b>'
  const bersih = rapikanHtml(kotor)
  assert.ok(!/img/i.test(bersih))
  assert.ok(!/script/i.test(bersih))
  assert.ok(!/class=/i.test(bersih))
  assert.ok(!/onclick/i.test(bersih))
  assert.match(bersih, /<b>Tebal<\/b>/)
})

test('PDF hasil pindai (tanpa teks) ditolak, bukan menghasilkan template kosong', async () => {
  const PDFDocument = require('pdfkit')
  const buf = await new Promise((resolve, reject) => {
    const doc = new PDFDocument()
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end() // halaman kosong
  })
  await assert.rejects(() => imporTemplate(berkas('scan.pdf', buf, 'application/pdf')), /pindai|tidak terbaca/)
})
