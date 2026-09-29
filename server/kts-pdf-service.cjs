'use strict'

const PDFDocument = require('pdfkit')
const fs = require('fs')
const path = require('path')
const QRCode = require('qrcode')

const CARD_W = 85.6 / 25.4 * 72
const CARD_H = 54 / 25.4 * 72
const DEFAULT_KTS_LAYOUT = { depan: { nama: 12, nis: 24, qr: 9 }, belakang: { nama: 0, nis: 0, qr: 0 } }

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
  let layout = JSON.parse(JSON.stringify(DEFAULT_KTS_LAYOUT))
  try { layout = { ...layout, ...(JSON.parse(settings.kts_layout || '{}')) } } catch {}
  for (const siswa of cards) {
    for (const [side, bg] of [['depan', front], ['belakang', back]]) {
      doc.addPage({ size: [CARD_W, CARD_H], margin: 0 })
      if (bg) { try { doc.image(bg, 0, 0, { width: CARD_W, height: CARD_H }) } catch {} }
      if (side === 'depan') {
        // Template depan adalah artwork utama; data hanya ditambahkan di area
        // informasi standar dan tidak pernah menimpa template belakang.
        doc.fontSize(7).fillColor('#111').text(String(siswa.nama || ''), 12, Number(layout.depan.nama) || 12, { width: CARD_W - 70, lineBreak: false })
        doc.fontSize(5.5).text(`NIS: ${siswa.nis || '-'}   ${siswa.rombel_nama || ''}`, 12, Number(layout.depan.nis) || 24, { width: CARD_W - 70, lineBreak: false })
        if (siswa.qr_token) {
          try { const qr = await QRCode.toDataURL(String(siswa.qr_token), { margin: 0, width: 180 }); doc.image(qr, CARD_W - 48, Number(layout.depan.qr) || 9, { width: 36, height: 36 }) } catch {}
        }
      }
    }
  }
  doc.end()
  return done
}

module.exports = { createKtsPdf, CARD_W, CARD_H }
