'use strict'

// Unggah berkas PPDB (opsional) — KK, akta, ijazah, foto, dll.
//
// Kenapa modul sendiri:
//  - Berkas pendaftaran publik masuk ke folder TERPISAH per tenant, supaya satu
//    lembaga tidak bisa membaca berkas lembaga lain lewat URL yang ditebak.
//  - Nama file diacak (tidak memakai nama asli) agar tidak bisa ditebak/di-enumerasi.
//  - Tipe & ukuran divalidasi di server, bukan hanya di browser.
//
// URL publik berbentuk /uploads/ppdb/<tenant_id>/<nama-acak>.<ext>
// Path berisi tenant_id sehingga bisa diverifikasi ulang saat diakses.

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

// Tipe dokumen yang diterima. Sengaja TIDAK menerima SVG/HTML (bisa berisi skrip).
const TIPE_DIIZINKAN = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
})

const UKURAN_MAKS = 5 * 1024 * 1024 // 5 MB per berkas
const MAKS_BERKAS = 5               // per pendaftaran

function pastikanFolder(akar, tenantId) {
  // tenant_id berasal dari database (bukan input mentah), tapi tetap disaring
  // agar tidak bisa keluar dari folder unggahan.
  const aman = String(tenantId || '').replace(/[^a-zA-Z0-9_-]/g, '')
  if (!aman) throw new Error('tenant tidak valid')
  const dir = path.join(akar, 'ppdb', aman)
  fs.mkdirSync(dir, { recursive: true })
  return { dir, segmen: aman }
}

/**
 * Simpan satu berkas dari buffer.
 * @returns {{url:string, nama:string, tipe:string, ukuran:number}}
 */
function simpanBerkas(akar, tenantId, file) {
  if (!file || !file.buffer) throw new Error('Berkas tidak terbaca')
  const ext = TIPE_DIIZINKAN[file.mimetype]
  if (!ext) throw new Error('Tipe berkas tidak didukung. Gunakan JPG, PNG, WEBP, atau PDF.')
  if (file.size > UKURAN_MAKS) throw new Error(`Ukuran berkas melebihi ${UKURAN_MAKS / 1024 / 1024} MB.`)
  if (!file.size) throw new Error('Berkas kosong.')

  // Cek magic bytes — jangan percaya mimetype dari klien.
  const b = file.buffer
  const cocok =
    (ext === '.jpg' && b[0] === 0xff && b[1] === 0xd8) ||
    (ext === '.png' && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) ||
    (ext === '.webp' && b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') ||
    (ext === '.pdf' && b.slice(0, 5).toString('ascii') === '%PDF-')
  if (!cocok) throw new Error('Isi berkas tidak cocok dengan tipe yang dinyatakan.')

  const { dir, segmen } = pastikanFolder(akar, tenantId)
  const namaAcak = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`
  fs.writeFileSync(path.join(dir, namaAcak), b)

  return {
    url: `/uploads/ppdb/${segmen}/${namaAcak}`,
    nama: String(file.originalname || 'berkas').slice(0, 120),
    tipe: file.mimetype,
    ukuran: file.size,
  }
}

/**
 * Hapus berkas yang benar-benar berada di dalam folder tenant ini.
 * Menolak path yang mencoba keluar folder (path traversal).
 */
function hapusBerkas(akar, tenantId, url) {
  try {
    const segmen = String(tenantId || '').replace(/[^a-zA-Z0-9_-]/g, '')
    if (!segmen || !url) return false
    const nama = path.basename(String(url))
    const target = path.join(akar, 'ppdb', segmen, nama)
    const akarTenant = path.resolve(path.join(akar, 'ppdb', segmen))
    if (!path.resolve(target).startsWith(akarTenant + path.sep)) return false
    if (fs.existsSync(target)) { fs.unlinkSync(target); return true }
  } catch { /* abaikan */ }
  return false
}

module.exports = { simpanBerkas, hapusBerkas, TIPE_DIIZINKAN, UKURAN_MAKS, MAKS_BERKAS }
