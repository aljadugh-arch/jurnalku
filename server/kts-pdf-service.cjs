'use strict'

const PDFDocument = require('pdfkit')
const fs = require('fs')
const path = require('path')
const QRCode = require('qrcode')

const CARD_W = 85.6 / 25.4 * 72
const CARD_H = 54 / 25.4 * 72

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
  for (const siswa of cards) {
    for (const [side, bg] of [['depan', front], ['belakang', back]]) {
      doc.addPage({ size: [CARD_W, CARD_H], margin: 0 })
      if (bg) { try { doc.image(bg, 0, 0, { width: CARD_W, height: CARD_H }) } catch {} }
      if (side === 'depan') {
        doc.fontSize(7).fillColor('#111').text(String(siswa.nama || ''), 12, CARD_H - 38, { width: CARD_W - 70, lineBreak: false })
        doc.fontSize(5.5).text(`NIS: ${siswa.nis || '-'}   ${siswa.rombel_nama || ''}`, 12, CARD_H - 27, { width: CARD_W - 70, lineBreak: false })
        if (siswa.qr_token) {
          try { const qr = await QRCode.toDataURL(String(siswa.qr_token), { margin: 0, width: 180 }); doc.image(qr, CARD_W - 48, CARD_H - 50, { width: 36, height: 36 }) } catch {}
        }
      } else {
        doc.fontSize(6).fillColor('#111').text(String(settings.nama_lembaga || ''), 10, CARD_H - 25, { width: CARD_W - 20, align: 'center' })
      }
    }
  }
  doc.end()
  return done
}

module.exports = { createKtsPdf, CARD_W, CARD_H }
