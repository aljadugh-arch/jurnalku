'use strict'

const PDFDocument = require('pdfkit')
const fs = require('fs')
const path = require('path')
const QRCode = require('qrcode')

const CARD_W = 85.6 / 25.4 * 72
const CARD_H = 54 / 25.4 * 72

// Posisi default (poin pt, relatif kartu). Setiap field {x, y} bebas diseret.
const DEFAULT_KTS_LAYOUT = {
  depan: { nama: { x: 12, y: 12 }, nis: { x: 12, y: 24 }, qr: { x: CARD_W - 48, y: 9 } },
  belakang: { nama: { x: 0, y: 0 }, nis: { x: 0, y: 0 }, qr: { x: 0, y: 0 } },
}

function clampCoord(value, fallback, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(max, n))
}

// Normalisasi layout dari penyimpanan. Dukungan backward-compatible:
// - {x, y} object -> posisi bebas
// - angka (legacy) -> dianggap posisi Y saja, X memakai default field.
function normalizeKtsLayout(raw) {
  const result = JSON.parse(JSON.stringify(DEFAULT_KTS_LAYOUT))
  const parsed = (() => { try { return JSON.parse(raw || '{}') || {} } catch { return {} } })()
  for (const side of ['depan', 'belakang']) {
    for (const field of ['nama', 'nis', 'qr']) {
      const dflt = DEFAULT_KTS_LAYOUT[side][field]
      const v = parsed[side]?.[field]
      if (v && typeof v === 'object') {
        result[side][field] = {
          x: clampCoord(v.x, dflt.x, CARD_W),
          y: clampCoord(v.y, dflt.y, CARD_H),
        }
      } else if (Number.isFinite(Number(v))) {
        result[side][field] = { x: dflt.x, y: clampCoord(v, dflt.y, CARD_H) }
      }
    }
  }
  return result
}

async function createKtsPdf({ siswaList, settings = {}, uploadDir }) {
  const cards = Array.isArray(siswaList) ? siswaList : []
  if (!cards.length) throw new Error('Tidak ada siswa untuk KTS')
  const doc = new PDFDocument({ size: [CARD_W, CARD_H], margin: 0, autoFirstPage: false })
  const chunks = []
  doc.on('data', chunk => chunks.push(chunk))
  const done = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject) })
  const resolveUpload = value => {
    if (!value || !String(value).startsWith('/uploads/')) return null
    const full = path.resolve(uploadDir, path.basename(value))
    return full.startsWith(path.resolve(uploadDir)) && fs.existsSync(full) ? full : null
  }
  const front = resolveUpload(settings.kts_depan)
  const back = resolveUpload(settings.kts_belakang)
  const layout = normalizeKtsLayout(settings.kts_layout)
  for (const siswa of cards) {
    for (const [side, bg] of [['depan', front], ['belakang', back]]) {
      doc.addPage({ size: [CARD_W, CARD_H], margin: 0 })
      if (bg) { try { doc.image(bg, 0, 0, { width: CARD_W, height: CARD_H }) } catch {} }
      if (side === 'depan') {
        // Template depan adalah artwork utama; data ditambahkan pada posisi bebas {x,y}.
        const namaPos = layout.depan.nama
        const nisPos = layout.depan.nis
        const qrPos = layout.depan.qr
        doc.fontSize(7).fillColor('#111').text(String(siswa.nama || ''), namaPos.x, namaPos.y, { width: Math.max(50, CARD_W - namaPos.x - 6), lineBreak: false })
        doc.fontSize(5.5).text(`NIS: ${siswa.nis || '-'}   ${siswa.rombel_nama || ''}`, nisPos.x, nisPos.y, { width: Math.max(50, CARD_W - nisPos.x - 6), lineBreak: false })
        if (siswa.qr_token) {
          try { const qr = await QRCode.toDataURL(String(siswa.qr_token), { margin: 0, width: 180 }); doc.image(qr, qrPos.x, qrPos.y, { width: 36, height: 36 }) } catch {}
        }
      }
    }
  }
  doc.end()
  return done
}

module.exports = { createKtsPdf, CARD_W, CARD_H, DEFAULT_KTS_LAYOUT, normalizeKtsLayout }