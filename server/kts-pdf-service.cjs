'use strict'

const PDFDocument = require('pdfkit')
const fs = require('fs')
const path = require('path')
const QRCode = require('qrcode')

const CARD_W = 85.6 / 25.4 * 72   // 242.65 pt
const CARD_H = 54 / 25.4 * 72     // 153.07 pt

// Posisi default (poin pt, relatif kartu CR80). Diukur dari template default
// public/kts-depan.png & kts-belakang.png (1011x639 px) + deskripsi layout:
//   depan  : header/kop y≈0-170px (0-41pt), foto kiri x≈47-256px (11-61pt),
//            biodata kanan x>260px (62pt), footer TTD y≈568px (136pt).
//   belakang: header y≈0-95px, isi visi/misi y≈166-392px, QR kanan.
// Setiap field {x,y} bisa diseret bebas di editor Pengaturan.
const DEFAULT_KTS_LAYOUT = {
  depan: {
    foto:   { x: 14, y: 46, w: 48, h: 64 },
    nama:   { x: 72, y: 48 },
    nisn:   { x: 72, y: 68 },
    jk:     { x: 72, y: 82 },
    ttl:    { x: 72, y: 96 },
    alamat: { x: 72, y: 110 },
    ttd:    { x: 128, y: 136 },
    qr:     { x: 200, y: 126 },
  },
  belakang: {
    qr:     { x: 182, y: 96 },
  },
}

const SIDES = ['depan', 'belakang']
const FRONT_FIELDS = ['foto', 'nama', 'nisn', 'jk', 'ttl', 'alamat', 'ttd', 'qr']
const BACK_FIELDS = ['qr']

// Pemetaan legacy -> field baru (format lama hanya {nama, nis, qr} per sisi).
const LEGACY_MAP = { nama: 'nama', nis: 'nisn', qr: 'qr' }

function clampCoord(value, fallback, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(max, n))
}

// Normalisasi layout dari penyimpanan. Dukungan backward-compatible:
// - {x, y} object -> posisi bebas (foto juga {x,y,w,h})
// - angka (legacy) -> dianggap posisi Y, X memakai default field.
function normalizeKtsLayout(raw) {
  const result = JSON.parse(JSON.stringify(DEFAULT_KTS_LAYOUT))
  const parsed = (() => { try { return JSON.parse(raw || '{}') || {} } catch { return {} } })()
  for (const side of SIDES) {
    const fields = side === 'depan' ? FRONT_FIELDS : BACK_FIELDS
    for (const field of fields) {
      const dflt = DEFAULT_KTS_LAYOUT[side][field]
      const v = parsed[side]?.[field]
      if (v && typeof v === 'object' && ('x' in v || 'y' in v)) {
        const out = { x: clampCoord(v.x, dflt.x, CARD_W), y: clampCoord(v.y, dflt.y, CARD_H) }
        if (field === 'foto') { out.w = clampCoord(v.w, dflt.w, CARD_W); out.h = clampCoord(v.h, dflt.h, CARD_H) }
        result[side][field] = out
      } else if (Number.isFinite(Number(v)) && !(field === 'foto')) {
        result[side][field] = { x: dflt.x, y: clampCoord(Number(v), dflt.y, CARD_H) }
      }
    }
    // Legacy: field lama (nama/nis/qr) bila belum ada di bentuk baru.
    if (parsed[side] && !parsed[side].foto && side === 'depan') {
      for (const [legacy, modern] of Object.entries(LEGACY_MAP)) {
        const lv = parsed[side][legacy]
        if (lv && typeof lv === 'object' && ('x' in lv || 'y' in lv)) {
          result[side][modern] = { x: clampCoord(lv.x, result[side][modern].x, CARD_W), y: clampCoord(lv.y, result[side][modern].y, CARD_H) }
        } else if (Number.isFinite(Number(lv))) {
          result[side][modern] = { x: result[side][modern].x, y: clampCoord(Number(lv), result[side][modern].y, CARD_H) }
        }
      }
    }
  }
  return result
}

function safe(str, fallback = '') { return str == null ? fallback : String(str) }

function resolveUpload(uploadDir, value) {
  if (!value || !String(value).startsWith('/uploads/')) return null
  const full = path.resolve(uploadDir, path.basename(value))
  return full.startsWith(path.resolve(uploadDir)) && fs.existsSync(full) ? full : null
}

function formatJk(value) {
  const v = String(value || '').trim().toUpperCase()
  if (v === 'L' || v === 'LAKI' || v === 'LAKI-LAKI') return 'Laki-laki'
  if (v === 'P' || v === 'PEREMPUAN') return 'Perempuan'
  return value || ''
}

function formatTtl(siswa) {
  const tempat = safe(siswa.tempat_lahir).trim()
  const tanggal = safe(siswa.tanggal_lahir).trim()
  if (tempat && tanggal) return `${tempat}, ${tanggal}`
  return tempat || tanggal || ''
}

async function createKtsPdf({ siswaList, settings = {}, uploadDir }) {
  const cards = Array.isArray(siswaList) ? siswaList : []
  if (!cards.length) throw new Error('Tidak ada siswa untuk KTS')
  const doc = new PDFDocument({ size: [CARD_W, CARD_H], margin: 0, autoFirstPage: false })
  const chunks = []
  doc.on('data', c => chunks.push(c))
  const done = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject) })

  const frontBg = resolveUpload(uploadDir, settings.kts_depan)
  const backBg = resolveUpload(uploadDir, settings.kts_belakang)
  const layout = normalizeKtsLayout(settings.kts_layout)
  const kepala = safe(settings.kepala_sekolah).trim()
  const namaLembaga = safe(settings.nama_lembaga).trim()

  for (const siswa of cards) {
    const qrToken = siswa.qr_token || siswa.id || ''
    // QR TTD (depan): tanda tangan digital berisi verifikasi kepala + lembaga.
    const ttdPayload = `KTS ${namaLembaga} | ${kepala || 'Kepala Lembaga'} | NIS ${siswa.nis || '-'}`

    // ===== DEPAN =====
    doc.addPage({ size: [CARD_W, CARD_H], margin: 0 })
    if (frontBg) { try { doc.image(frontBg, 0, 0, { width: CARD_W, height: CARD_H }) } catch {} }

    const L = layout.depan
    // Foto 3x4
    const fotoPath = resolveUpload(uploadDir, siswa.foto)
    if (fotoPath) {
      try { doc.image(fotoPath, L.foto.x, L.foto.y, { width: L.foto.w, height: L.foto.h }) } catch {}
    } else {
      doc.rect(L.foto.x, L.foto.y, L.foto.w, L.foto.h).stroke('#999')
      doc.fontSize(7).fillColor('#999').text('3 x 4', L.foto.x, L.foto.y + L.foto.h / 2 - 4, { width: L.foto.w, align: 'center' })
    }

    // Nama (BOLD)
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text(safe(siswa.nama).toUpperCase(), L.nama.x, L.nama.y, { width: Math.max(60, CARD_W - L.nama.x - 6), lineBreak: false })
    // NISN / NIS
    doc.font('Helvetica').fontSize(7.5).fillColor('#111')
    const nisnNis = [safe(siswa.nisn), safe(siswa.nis)].filter(Boolean).join(' / ') || '-'
    doc.text(`NISN/NIS: ${nisnNis}`, L.nisn.x, L.nisn.y, { width: Math.max(60, CARD_W - L.nisn.x - 6), lineBreak: false })
    // Jenis kelamin
    const jk = formatJk(siswa.jenis_kelamin)
    if (jk) doc.text(`Jenis Kelamin: ${jk}`, L.jk.x, L.jk.y, { width: Math.max(60, CARD_W - L.jk.x - 6), lineBreak: false })
    // TTL
    const ttl = formatTtl(siswa)
    if (ttl) doc.text(`TTL: ${ttl}`, L.ttl.x, L.ttl.y, { width: Math.max(60, CARD_W - L.ttl.x - 6), lineBreak: false })
    // Alamat (wrap)
    if (safe(siswa.alamat).trim()) {
      doc.font('Helvetica').fontSize(7).text(`Alamat: ${safe(siswa.alamat)}`, L.alamat.x, L.alamat.y, { width: Math.max(80, CARD_W - L.alamat.x - 6) })
    }
    // TTD: nama kepala + QR TTD
    if (kepala) {
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#111').text(kepala, L.ttd.x, L.ttd.y, { width: 70, align: 'center' })
    }
    try {
      const qrTtd = await QRCode.toDataURL(ttdPayload, { margin: 0, width: 160 })
      doc.image(qrTtd, L.qr.x, L.qr.y, { width: 26, height: 26 })
    } catch {}

    // ===== BELAKANG =====
    doc.addPage({ size: [CARD_W, CARD_H], margin: 0 })
    if (backBg) { try { doc.image(backBg, 0, 0, { width: CARD_W, height: CARD_H }) } catch {} }
    try {
      const qrSiswa = await QRCode.toDataURL(qrToken, { margin: 0, width: 200 })
      doc.image(qrSiswa, layout.belakang.qr.x, layout.belakang.qr.y, { width: 40, height: 40 })
    } catch {}
  }

  doc.end()
  return done
}

module.exports = { createKtsPdf, CARD_W, CARD_H, DEFAULT_KTS_LAYOUT, normalizeKtsLayout }