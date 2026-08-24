const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  DOCUMENT_TYPES,
  buildPrompt,
  validateGenerateInput,
  createDocumentDocx,
  parseAiResponse,
  createTemplateContent,
} = require('../server/ai-documents.cjs')

test('generator exposes the requested teacher document types', () => {
  for (const type of ['STS', 'SAS', 'LKPD', 'PROTA', 'PROMES', 'ACP', 'ATP', 'MODUL_AJAR', 'KISI_KISI']) {
    assert.ok(DOCUMENT_TYPES[type], `missing ${type}`)
  }
})

test('STS prompt requires mixed questions, answer key, and MTs template metadata', () => {
  const prompt = buildPrompt({
    type: 'STS', subject: 'Matematika', grade: 'Kelas 8 MTs', topic: 'Persamaan linear',
    curriculum: 'Kurikulum Merdeka', semester: 'Ganjil', academicYear: '2026/2027',
    multipleChoiceCount: 20, essayCount: 5, schoolName: 'MTs Contoh', teacherName: 'Guru Contoh',
  })
  for (const text of ['SUMATIF TENGAH SEMESTER', '20 pilihan ganda', '5 uraian', 'Kunci Jawaban', 'MTs Contoh', '2026/2027']) assert.match(prompt, new RegExp(text))
})

test('validation rejects incomplete and excessive requests', () => {
  assert.match(validateGenerateInput({ type: 'STS' }).error, /mata pelajaran/i)
  assert.match(validateGenerateInput({ type: 'STS', subject: 'IPA', grade: 'VIII', topic: 'Sel', multipleChoiceCount: 101 }).error, /maksimal/i)
  assert.equal(validateGenerateInput({ type: 'ATP', subject: 'IPA', grade: 'VIII', topic: 'Sel' }).error, undefined)
})

test('template mode builds deterministic, editable content for every document type', () => {
  const base = { subject: 'IPA', grade: 'VIII', topic: 'Sistem pencernaan', semester: 'Ganjil', academicYear: '2026/2027', schoolName: 'MTs Contoh', teacherName: 'Ibu Guru', multipleChoiceCount: 2, essayCount: 1 }
  for (const type of Object.keys(DOCUMENT_TYPES)) {
    const first = createTemplateContent({ ...base, type })
    const second = createTemplateContent({ ...base, type })
    assert.equal(first, second, `${type} template must be deterministic`)
    assert.match(first, /IPA/)
    assert.match(first, /Sistem pencernaan/)
    assert.ok(first.length > 250, `${type} template is too shallow`)
  }
  const assessment = createTemplateContent({ ...base, type: 'STS' })
  assert.match(assessment, /KUNCI JAWABAN/)
  assert.match(assessment, /Isilah soal pilihan ganda nomor 1/i)
})

test('generation mode accepts only explicit AI or template selection', () => {
  assert.equal(validateGenerateInput({ type: 'ATP', subject: 'IPA', grade: 'VIII', topic: 'Sel', mode: 'template' }).value.mode, 'template')
  assert.equal(validateGenerateInput({ type: 'ATP', subject: 'IPA', grade: 'VIII', topic: 'Sel', mode: 'ai' }).value.mode, 'ai')
  assert.match(validateGenerateInput({ type: 'ATP', subject: 'IPA', grade: 'VIII', topic: 'Sel', mode: 'other' }).error, /mode/i)
})

test('modul ajar preserves the legacy teacher choices in AI prompt and template', () => {
  const input = { type: 'MODUL_AJAR', subject: 'IPA', grade: 'Kelas 8 SMP/MTs (Fase D)', topic: 'Sistem pernapasan', mode: 'ai', dimensi: ['Penalaran kritis', 'Kolaborasi'], modelPembelajaran: 'Problem Based Learning (PBL)', targetPesertaDidik: 'Heterogen (Diferensiasi Penuh)', capaianPembelajaran: 'CP IPA Fase D', tujuanPembelajaran: 'Peserta didik mampu menganalisis', kompetensiAwal: 'Memahami organ tubuh', pertanyaanPemantik: 'Mengapa kita bernapas?', saranaPrasarana: 'Buku dan LCD' }
  const prompt = buildPrompt(input)
  for (const value of ['Kelas 8 SMP/MTs (Fase D)', 'Penalaran kritis', 'Kolaborasi', 'Problem Based Learning (PBL)', 'Heterogen (Diferensiasi Penuh)', 'CP IPA Fase D', 'Peserta didik mampu menganalisis']) assert.ok(prompt.includes(value), `prompt missing ${value}`)
  const template = createTemplateContent({ ...input, mode: 'template' })
  for (const value of ['Penalaran kritis', 'Problem Based Learning (PBL)', 'Heterogen (Diferensiasi Penuh)', 'Peserta didik mampu menganalisis']) assert.ok(template.includes(value), `template missing ${value}`)
})

test('AI response parser supports OpenAI JSON, Gemini JSON, and OpenAI SSE', () => {
  assert.equal(parseAiResponse(JSON.stringify({ choices: [{ message: { content: 'JSON' } }] })), 'JSON')
  assert.equal(parseAiResponse(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'GEMINI' }] } }] })), 'GEMINI')
  const sse = 'data: {"choices":[{"delta":{"content":"S"}}]}\n\ndata: {"choices":[{"delta":{"content":"SE"}}]}\n\ndata: [DONE]\n'
  assert.equal(parseAiResponse(sse), 'SSE')
})

test('DOCX export contains template heading, metadata, body, and answer-key page', async () => {
  const buffer = await createDocumentDocx({
    type: 'STS', subject: 'Matematika', grade: 'VIII', teacherName: 'Ibu Guru',
    schoolName: 'MTs Contoh', academicYear: '2026/2027', semester: 'Ganjil', printDate: '24 Agustus 2026',
    content: '# A. PILIHAN GANDA\n\n1. Berapakah 2 + 2?\n   a. 3\n   b. 4\n   c. 5\n   d. 6\n\n# B. URAIAN\n\n1. Jelaskan jawabanmu.\n\n# KUNCI JAWABAN\n\n1. b',
  })
  assert.ok(Buffer.isBuffer(buffer))
  const target = path.join('/tmp', 'ai-documents-sts-test.docx')
  fs.writeFileSync(target, buffer)
  assert.ok(fs.statSync(target).size > 5000)
  const { execFileSync } = require('node:child_process')
  const xml = execFileSync('unzip', ['-p', target, 'word/document.xml'], { encoding: 'utf8' })
  for (const text of ['SUMATIF TENGAH SEMESTER GANJIL', 'MTS CONTOH', 'Matematika', 'Ibu Guru', 'KUNCI JAWABAN']) assert.match(xml, new RegExp(text))
})
