const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require('docx')
const fs = require('node:fs')
const path = require('node:path')

const DOCUMENT_TYPES = {
  STS: { label: 'Soal STS', title: 'SUMATIF TENGAH SEMESTER', category: 'assessment' },
  SAS: { label: 'Soal SAS', title: 'SUMATIF AKHIR SEMESTER', category: 'assessment' },
  LKPD: { label: 'LKPD', title: 'LEMBAR KERJA PESERTA DIDIK', category: 'learning' },
  PROTA: { label: 'PROTA', title: 'PROGRAM TAHUNAN', category: 'planning' },
  PROMES: { label: 'PROMES', title: 'PROGRAM SEMESTER', category: 'planning' },
  ACP: { label: 'ACP', title: 'ANALISIS CAPAIAN PEMBELAJARAN', category: 'planning' },
  ATP: { label: 'ATP', title: 'ALUR TUJUAN PEMBELAJARAN', category: 'planning' },
  MODUL_AJAR: { label: 'Modul Ajar', title: 'MODUL AJAR', category: 'learning' },
  KISI_KISI: { label: 'Kisi-kisi Soal', title: 'KISI-KISI SOAL', category: 'assessment' },
}

const clean = value => String(value ?? '').trim()
const clampInt = (value, fallback) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback

function validateGenerateInput(input = {}) {
  const type = clean(input.type).toUpperCase()
  if (!DOCUMENT_TYPES[type]) return { error: 'Jenis dokumen tidak valid' }
  if (!clean(input.subject)) return { error: 'Mata pelajaran wajib diisi' }
  if (!clean(input.grade)) return { error: 'Kelas/fase wajib diisi' }
  if (!clean(input.topic)) return { error: 'Materi/topik wajib diisi' }
  const multipleChoiceCount = clampInt(input.multipleChoiceCount, 20)
  const essayCount = clampInt(input.essayCount, 5)
  if (multipleChoiceCount < 0 || essayCount < 0) return { error: 'Jumlah soal tidak boleh negatif' }
  if (multipleChoiceCount > 100 || essayCount > 30 || multipleChoiceCount + essayCount > 120) return { error: 'Jumlah soal maksimal 120 butir (100 pilihan ganda dan 30 uraian)' }
  return { value: { ...input, type, multipleChoiceCount, essayCount } }
}

function buildPrompt(input) {
  const checked = validateGenerateInput(input)
  if (checked.error) throw new Error(checked.error)
  const data = checked.value
  const common = `Gunakan bahasa Indonesia formal, faktual, sesuai ${clean(data.curriculum) || 'Kurikulum Merdeka'}, dan siap dicetak.\nMata Pelajaran: ${clean(data.subject)}\nKelas/Fase: ${clean(data.grade)}\nMateri/Topik: ${clean(data.topic)}\nLembaga: ${clean(data.schoolName) || 'Lembaga pengguna'}\nPengajar: ${clean(data.teacherName) || 'Guru mata pelajaran'}\nTahun Pelajaran: ${clean(data.academicYear) || 'tahun berjalan'}\nSemester: ${clean(data.semester) || 'Ganjil'}\nJangan mengarang sumber atau data identitas. Keluarkan Markdown saja tanpa pagar kode.`
  const prompts = {
    STS: `Buat naskah SUMATIF TENGAH SEMESTER. Buat ${data.multipleChoiceCount} pilihan ganda dengan opsi a-d dan ${data.essayCount} uraian. Susun bagian: A. PILIHAN GANDA, B. URAIAN, lalu Kunci Jawaban di bagian paling akhir. Variasikan level kognitif dan pastikan setiap kunci benar.`,
    SAS: `Buat naskah SUMATIF AKHIR SEMESTER. Buat ${data.multipleChoiceCount} pilihan ganda dengan opsi a-d dan ${data.essayCount} uraian. Susun bagian: A. PILIHAN GANDA, B. URAIAN, lalu Kunci Jawaban di bagian paling akhir. Cakupan harus representatif untuk akhir semester.`,
    LKPD: `Buat LKPD interaktif dan profesional dengan struktur: identitas, judul aktivitas, tujuan pembelajaran, stimulus/materi ringkas, alat dan bahan bila perlu, langkah kerja, lembar pengamatan/tugas/diskusi, kesimpulan, dan refleksi. Jenis aktivitas: ${clean(data.activityType) || 'diskusi dan pemecahan masalah'}. Alokasi waktu: ${clean(data.timeAllocation) || '2 JP'}.`,
    PROTA: `Buat PROTA dalam tabel Markdown yang mencakup semester, nomor, capaian pembelajaran/materi, tujuan pembelajaran, dan alokasi waktu sepanjang satu tahun.`,
    PROMES: `Buat PROMES semester ${clean(data.semester) || 'Ganjil'} dalam tabel Markdown yang memetakan tujuan/materi, alokasi JP, bulan, dan minggu efektif.`,
    ACP: `Buat Analisis Capaian Pembelajaran (ACP) yang menguraikan elemen, capaian pembelajaran, kompetensi, lingkup materi, tujuan pembelajaran, indikator ketercapaian, dan asesmen dalam tabel Markdown.`,
    ATP: `Buat Alur Tujuan Pembelajaran (ATP) berurutan dalam tabel Markdown: nomor, elemen/CP, tujuan pembelajaran, materi, aktivitas inti, alokasi waktu, dan asesmen. Pastikan alurnya progresif.`,
    MODUL_AJAR: `Buat Modul Ajar berdasarkan Panduan Pembelajaran dan Asesmen. Gunakan istilah Dimensi Profil Lulusan, bukan P5. Struktur: informasi umum, kompetensi awal, tujuan pembelajaran, pemahaman bermakna, pertanyaan pemantik, kegiatan pendahuluan-inti-penutup, diferensiasi, asesmen, remedial/pengayaan, refleksi, dan lampiran.`,
    KISI_KISI: `Buat kisi-kisi soal dalam tabel Markdown dengan kolom nomor, capaian pembelajaran, materi, indikator soal, level kognitif, bentuk soal, dan nomor soal. Total ${data.multipleChoiceCount + data.essayCount} butir.`,
  }
  return `${common}\n\n${prompts[data.type]}`
}

function parseMarkdown(content = '') {
  const lines = String(content).replace(/\r/g, '').split('\n')
  const blocks = []
  for (let i = 0; i < lines.length;) {
    const line = lines[i].trimEnd()
    if (!line.trim()) { i++; continue }
    if (line.trim().startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().slice(1, -1).split('|').map(v => v.trim())
        if (!cells.every(v => /^:?-{3,}:?$/.test(v))) rows.push(cells)
        i++
      }
      if (rows.length) blocks.push({ type: 'table', rows })
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
    else if (/^[-*]\s+/.test(line)) blocks.push({ type: 'bullet', text: line.replace(/^[-*]\s+/, '') })
    else blocks.push({ type: 'paragraph', text: line })
    i++
  }
  return blocks
}

const stripMarkdown = value => clean(value).replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '')
const cellBorders = { top: { style: BorderStyle.SINGLE, size: 8 }, bottom: { style: BorderStyle.SINGLE, size: 8 }, left: { style: BorderStyle.SINGLE, size: 8 }, right: { style: BorderStyle.SINGLE, size: 8 } }

function metadataCell(label, value) {
  return new TableCell({
    borders: cellBorders,
    children: [new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: label, bold: true, size: 20 })] }), new Paragraph({ children: [new TextRun({ text: value || '……………………', size: 20 })] })],
  })
}

function headingTable(data, title) {
  const logoPath = path.join(__dirname, '..', 'public', 'logo.png')
  const logoChildren = []
  if (fs.existsSync(logoPath)) logoChildren.push(new ImageRun({ data: fs.readFileSync(logoPath), transformation: { width: 64, height: 64 } }))
  else logoChildren.push(new TextRun({ text: 'LOGO', bold: true, size: 18 }))
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        new TableCell({ width: { size: 16, type: WidthType.PERCENTAGE }, borders: cellBorders, verticalAlign: 'center', children: [new Paragraph({ alignment: AlignmentType.CENTER, children: logoChildren })] }),
        new TableCell({ columnSpan: 3, borders: cellBorders, verticalAlign: 'center', children: [
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: `${title} ${clean(data.semester).toUpperCase() || 'GANJIL'}`, bold: true, size: 24 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: (clean(data.schoolName) || 'NAMA LEMBAGA').toUpperCase(), bold: true, size: 22 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `TAHUN PELAJARAN ${clean(data.academicYear) || '…………/…………'}`, bold: true, size: 22 })] }),
        ] }),
      ] }),
      new TableRow({ children: [
        metadataCell('Mata Pelajaran', clean(data.subject)), metadataCell('Kelas', clean(data.grade)), metadataCell('Pengajar', clean(data.teacherName)), metadataCell('Hari, Tanggal', clean(data.printDate)),
      ] }),
    ],
  })
}

function blocksToDocx(content) {
  return parseMarkdown(content).map(block => {
    if (block.type === 'table') {
      const columns = Math.max(...block.rows.map(row => row.length))
      return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: block.rows.map((row, rowIndex) => new TableRow({ children: Array.from({ length: columns }, (_, index) => new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: stripMarkdown(row[index] || ''), bold: rowIndex === 0, size: 20 })] })] })) })) })
    }
    const text = stripMarkdown(block.text)
    if (block.type === 'heading') return new Paragraph({ spacing: { before: 220, after: 100 }, children: [new TextRun({ text, bold: true, size: block.level === 1 ? 24 : 22 })] })
    if (block.type === 'bullet') return new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text, size: 22 })] })
    return new Paragraph({ spacing: { after: 100, line: 300 }, children: [new TextRun({ text, size: 22 })] })
  })
}

async function createDocumentDocx(data) {
  const type = clean(data.type).toUpperCase()
  const config = DOCUMENT_TYPES[type] || DOCUMENT_TYPES.MODUL_AJAR
  const isAssessment = config.category === 'assessment' && ['STS', 'SAS'].includes(type)
  const children = []
  if (isAssessment) {
    children.push(headingTable(data, config.title))
    children.push(new Paragraph({ spacing: { before: 220, after: 120 }, children: [new TextRun({ text: 'A. Pilihlah jawaban yang paling benar dengan memberi tanda silang (x) pada lembar jawaban!', bold: true, italics: true, size: 21 })] }))
  } else {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: config.title, bold: true, size: 28 })] }))
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: `${clean(data.subject)} — ${clean(data.grade)}`, bold: true, size: 22 })] }))
  }
  children.push(...blocksToDocx(data.content))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [new TextRun({ text: '~ Selamat Mengerjakan ~', italics: true, size: 20 })] }))
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Times New Roman', size: 22 }, paragraph: { spacing: { line: 276 } } } } },
    sections: [{
      properties: { page: { margin: { top: 850, right: 850, bottom: 850, left: 850 } } },
      headers: { default: new Header({ children: [] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${clean(data.schoolName)} • ${clean(data.academicYear)}`, size: 16, color: '666666' })] })] }) },
      children,
    }],
  })
  return Packer.toBuffer(doc)
}

function parseAiResponse(raw) {
  let body = {}
  try { body = JSON.parse(raw) } catch {}
  let content = body?.choices?.[0]?.message?.content || body?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('')
  if (!clean(content) && raw.includes('data:')) {
    content = raw.split('\n').filter(line => line.startsWith('data: ') && line.slice(6).trim() !== '[DONE]').map(line => {
      try { return JSON.parse(line.slice(6))?.choices?.[0]?.delta?.content || '' } catch { return '' }
    }).join('')
  }
  return clean(content)
}

async function callAi(prompt, options = {}) {
  const endpoint = clean(options.endpoint || process.env.AI_API_URL || process.env.OPENAI_BASE_URL)
  const apiKey = clean(options.apiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY)
  const model = clean(options.model || process.env.AI_MODEL || 'afal/auto/best-free')
  if (!endpoint) throw new Error('Layanan AI belum dikonfigurasi oleh administrator')
  const url = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint.replace(/\/$/, '')}/chat/completions`
  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ model, temperature: 0.4, stream: false, messages: [{ role: 'system', content: 'Anda adalah asisten administrasi guru Indonesia. Ikuti format dan jumlah yang diminta secara tepat.' }, { role: 'user', content: prompt }] }), signal: AbortSignal.timeout(120000) })
  const raw = await response.text()
  let body = {}
  try { body = JSON.parse(raw) } catch {}
  if (!response.ok) throw new Error(body?.error?.message || body?.error || `Layanan AI gagal (${response.status})`)
  const content = parseAiResponse(raw)
  if (!clean(content)) throw new Error('Layanan AI mengembalikan hasil kosong')
  return clean(content)
}

module.exports = { DOCUMENT_TYPES, buildPrompt, validateGenerateInput, createDocumentDocx, callAi, parseMarkdown, parseAiResponse }
