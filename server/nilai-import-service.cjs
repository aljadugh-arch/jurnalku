'use strict'

// Impor nilai (STS/SAS/harian) dari CSV/Excel/Google Sheets.
// Format yang didukung: matriks — kolom pertama identitas siswa (NIS/NISN/Nama),
// kolom berikutnya = mata pelajaran (header = nama mapel), sel = nilai.
// Juga mendukung format panjang: kolom NIS, Mapel, Nilai.

// Parser CSV minimal (koma/semicolon, kutipan ganda, baris kosong diabaikan).
function parseCsv(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n')
  const lines = src.split('\n').filter(l => l.trim() !== '')
  if (!lines.length) return { headers: [], rows: [] }
  const delim = detectDelimiter(lines[0])
  const parseLine = (line) => {
    const out = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = !inQ
      } else if (c === delim && !inQ) { out.push(cur.trim()); cur = '' }
      else cur += c
    }
    out.push(cur.trim())
    return out
  }
  const headers = parseLine(lines[0]).map((h, i) => h || `col${i + 1}`)
  const rows = lines.slice(1).map(line => {
    const cells = parseLine(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = cells[i] != null ? cells[i].trim() : '' })
    return obj
  })
  return { headers, rows }
}

function detectDelimiter(firstLine) {
  const commas = (firstLine.match(/,/g) || []).length
  const semis = (firstLine.match(/;/g) || []).length
  const tabs = (firstLine.match(/\t/g) || []).length
  if (tabs >= commas && tabs >= semis) return '\t'
  if (semis > commas) return ';'
  return ','
}

// Identifikasi kolom identitas siswa (NIS/NISN/Nama) dan kolom mapel.
function analyzeColumns(headers) {
  const lower = headers.map(h => String(h).toLowerCase())
  let identityCol = null
  let identityType = null
  for (let i = 0; i < lower.length; i++) {
    const h = lower[i]
    if (h === 'nisn') { identityCol = headers[i]; identityType = 'nisn'; break }
    if (h === 'nis' || h === 'nis lokal' || h === 'no induk') { identityCol = headers[i]; identityType = 'nis'; break }
    if (h === 'nama' || h === 'nama siswa' || h === 'nama lengkap') { identityCol = headers[i]; identityType = 'nama'; break }
  }
  const mapelCols = headers.filter((h, i) => {
    const hl = String(h).toLowerCase()
    return h !== identityCol && !['no', 'nomor', 'nama', 'nis', 'nisn'].includes(hl) && hl !== 'mapel' && hl !== 'nilai'
  })
  // Format panjang: deteksi kolom "mapel" + "nilai"
  const mapelLongCol = headers.find(h => ['mapel', 'mata pelajaran', 'mapel/mata pelajaran'].includes(String(h).toLowerCase()))
  const nilaiLongCol = headers.find(h => ['nilai', 'n. akhir', 'nilai akhir', 'score'].includes(String(h).toLowerCase()))
  return { identityCol, identityType, mapelCols, mapelLongCol, nilaiLongCol }
}

// Cocokkan siswa (by NIS/NISN/nama) dan mapel (by nama/kode) untuk tenant.
function buildImportPreview(db, tenantId, { headers, rows }) {
  const analyzed = analyzeColumns(headers)
  const siswaById = new Map()
  const siswaByNis = new Map()
  const siswaByNisn = new Map()
  const siswaByNama = new Map()
  for (const s of db.prepare("SELECT id, nis, nisn, nama, rombel_id FROM siswa WHERE tenant_id=? AND COALESCE(status,'aktif')='aktif'").all(tenantId)) {
    siswaById.set(s.id, s)
    if (s.nis) siswaByNis.set(String(s.nis).trim(), s)
    if (s.nisn) siswaByNisn.set(String(s.nisn).trim(), s)
    siswaByNama.set(String(s.nama).trim().toLowerCase(), s)
  }
  const mapelByName = new Map()
  for (const m of db.prepare('SELECT id, nama, kode FROM mapel WHERE tenant_id=? OR tenant_id IS NULL').all(tenantId)) {
    mapelByName.set(String(m.nama).trim().toLowerCase(), m)
    if (m.kode) mapelByName.set(String(m.kode).trim().toLowerCase(), m)
  }

  const hasil = []
  const tidakCocok = []
  for (const row of rows) {
    // Format panjang (NIS + Mapel + Nilai)
    if (analyzed.mapelLongCol && analyzed.nilaiLongCol) {
      const ident = row[analyzed.identityCol]
      const yr = findSiswa(ident, analyzed.identityType, { siswaByNis, siswaByNisn, siswaByNama })
      const mn = String(row[analyzed.mapelLongCol] || '').trim()
      const nl = Number(row[analyzed.nilaiLongCol])
      const mapel = mapelByName.get(mn.toLowerCase())
      if (!yr) { tidakCocok.push({ ident, mapel: mn, alasan: 'identitas siswa tidak dikenali' }); continue }
      if (!mapel) { tidakCocok.push({ ident, mapel: mn, alasan: 'mapel tidak dikenali' }); continue }
      if (!Number.isFinite(nl)) { tidakCocok.push({ ident, mapel: mn, alasan: 'nilai tidak valid' }); continue }
      hasil.push({ siswa_id: yr.id, mapel_id: mapel.id, nilai: clampNilai(nl), nama: yr.nama, nis: yr.nis, mapel_nama: mapel.nama })
      continue
    }
    // Format matriks
    const ident = row[analyzed.identityCol]
    const yr = findSiswa(ident, analyzed.identityType, { siswaByNis, siswaByNisn, siswaByNama })
    for (const col of analyzed.mapelCols) {
      const raw = row[col]
      if (raw === '' || raw == null) continue
      if (!yr) { tidakCocok.push({ ident, mapel: String(col), alasan: 'identitas siswa tidak dikenali' }); continue }
      const mapel = mapelByName.get(String(col).trim().toLowerCase())
      if (!mapel) { tidakCocok.push({ ident, mapel: String(col), alasan: 'mapel tidak dikenali' }); continue }
      const nl = Number(raw)
      if (!Number.isFinite(nl)) { tidakCocok.push({ ident, mapel: mapel.nama, alasan: 'nilai tidak valid' }); continue }
      hasil.push({ siswa_id: yr.id, mapel_id: mapel.id, nilai: clampNilai(nl), nama: yr.nama, nis: yr.nis, mapel_nama: mapel.nama })
    }
  }
  return { items: hasil, tidakCocok, total: hasil.length }
}

function findSiswa(ident, type, maps) {
  const v = String(ident ?? '').trim()
  if (!v) return null
  if (type === 'nisn') return maps.siswaByNisn.get(v) || null
  if (type === 'nis') return maps.siswaByNis.get(v) || maps.siswaByNisn.get(v) || null
  return maps.siswaByNama.get(v.toLowerCase()) || null
}

function clampNilai(v) { return Math.max(0, Math.min(100, Math.round(Number(v)))) }

// Parse buffer .xlsx/.xls menjadi { headers, rows } memakai ExcelJS.
async function parseExcelBuffer(buffer) {
  const ExcelJS = require('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws) return { headers: [], rows: [] }
  const matrix = []
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells = []
    row.eachCell({ includeEmpty: true }, (cell) => { cells.push(cell.text != null ? String(cell.text).trim() : '') })
    if (cells.some(c => c !== '')) matrix.push(cells)
  })
  if (!matrix.length) return { headers: [], rows: [] }
  const headers = matrix[0].map((h, i) => (h && h !== '' ? h : `col${i + 1}`))
  const rows = matrix.slice(1).map(cells => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = cells[i] != null ? cells[i].trim() : '' })
    return obj
  })
  return { headers, rows }
}

module.exports = { parseCsv, parseExcelBuffer, analyzeColumns, buildImportPreview, clampNilai }