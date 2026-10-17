'use strict'
// Bersihkan berkas di server/uploads/ yang TIDAK DIRUJUK data mana pun.
//
// Jalankan DI VPS (butuh akses langsung ke SQLite + folder uploads):
//   node server/scripts/bersih-uploads.cjs              -> laporan saja (dry-run)
//   node server/scripts/bersih-uploads.cjs --hapus      -> benar-benar menghapus
//
// ─────────────────────────────────────────────────────────────────────────────
// PELAJARAN PENTING (jangan diulang):
//
// Versi pertama skrip ini memakai regex `/\/uploads\/([^\s"'<>()\\,;]+)/` untuk
// mengambil nama berkas dari isi kolom. Regex itu BERHENTI DI SPASI, sehingga
// "/uploads/1787891148476-Abdul Azzis.JPG" hanya tertangkap "1787891148476-Abdul".
// Akibatnya 89 foto siswa + 31 foto GTK dianggap yatim — kalau `--hapus`
// dijalankan, FOTO SISWA & GURU akan terhapus.
//
// Karena itu sekarang nama berkas ditentukan dengan mencocokkan AWALAN teks
// terhadap daftar berkas fisik (exact-prefix, ambil yang terpanjang), sehingga
// nama ber-spasi tetap utuh.
// ─────────────────────────────────────────────────────────────────────────────
//
// Pengaman:
//  - Hanya berkas berumur > 60 menit (menghindari unggahan yang sedang berjalan).
//  - Berkas dengan nama "sensitif" (siswa/gtk/guru/foto/avatar/logo/ttd) TIDAK
//    dihapus otomatis; dilaporkan terpisah untuk ditinjau manual.
//  - Subfolder (.thumbs, ppdb, signatures, cache) tidak disentuh.
//  - Arsipkan dulu sebelum --hapus:
//      tar -czf /root/backups/uploads-yatim.tar.gz -C server/uploads -T /tmp/yatim.txt

const fs = require('node:fs')
const path = require('node:path')

// Akar proyek: dua level di atas folder scripts/.
const AKAR = path.resolve(__dirname, '..', '..')
const UPLOAD = path.join(AKAR, 'server', 'uploads')
const DB_PATH = process.env.DB_PATH || path.join(AKAR, 'server', 'jurnalku.db')
const HAPUS = process.argv.includes('--hapus')
const UMUR_MIN_MENIT = Number(process.env.UMUR_MIN_MENIT || 60)

let Database
try { Database = require(path.join(AKAR, 'node_modules', 'better-sqlite3')) }
catch { Database = require('better-sqlite3') }

if (!fs.existsSync(UPLOAD)) { console.log('Folder uploads tidak ditemukan:', UPLOAD); process.exit(1) }

const db = new Database(DB_PATH, { readonly: true })

const fisik = new Set(
  fs.readdirSync(UPLOAD, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name)
)

/** Nama berkas fisik yang dirujuk oleh sebuah nilai kolom. */
function rujukanDari (nilai) {
  const t = String(nilai || '')
  const h = new Set()
  if (!t.includes('/uploads/')) return h
  // (a) nilai tunggal persis
  const s = t.trim()
  if (s.startsWith('/uploads/')) {
    const n = s.slice('/uploads/'.length).split('?')[0].split('#')[0]
    if (fisik.has(n)) h.add(n)
  }
  // (b) pindai tiap kemunculan; cocokkan awalan terpanjang ke berkas fisik
  let i = t.indexOf('/uploads/')
  while (i !== -1) {
    const sisa = t.slice(i + '/uploads/'.length)
    let b = ''
    for (const n of fisik) if (sisa.startsWith(n) && n.length > b.length) b = n
    if (b) h.add(b)
    i = t.indexOf('/uploads/', i + 1)
  }
  return h
}

const tabel = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(x => x.name)
const dipakai = new Set()
let kolomDiperiksa = 0

for (const t of tabel) {
  let kolom
  try { kolom = db.prepare(`PRAGMA table_info(${t})`).all() } catch { continue }
  for (const c of kolom) {
    const tp = String(c.type || '').toUpperCase()
    if (tp && !/TEXT|CHAR|CLOB|BLOB/.test(tp)) continue
    let rows
    try { rows = db.prepare(`SELECT ${c.name} AS v FROM ${t} WHERE ${c.name} LIKE '%/uploads/%'`).all() } catch { continue }
    kolomDiperiksa++
    for (const r of rows) for (const n of rujukanDari(r.v)) dipakai.add(n)
  }
}

const sekarang = Date.now()
const yatim = [], muda = [], terpakai = []
for (const nama of fisik) {
  const p = path.join(UPLOAD, nama)
  let st
  try { st = fs.statSync(p) } catch { continue }
  const umur = (sekarang - st.mtimeMs) / 60000
  if (dipakai.has(nama)) terpakai.push({ nama, ukuran: st.size })
  else if (umur < UMUR_MIN_MENIT) muda.push({ nama })
  else yatim.push({ nama, ukuran: st.size })
}

const mb = n => (n / 1024 / 1024).toFixed(2) + ' MB'
console.log('=== PEMINDAIAN ===')
console.log('  tabel / kolom     :', tabel.length, '/', kolomDiperiksa)
console.log('  berkas fisik      :', fisik.size)
console.log('  dipakai           :', terpakai.length, '(' + mb(terpakai.reduce((s, x) => s + x.ukuran, 0)) + ')')
console.log('  yatim (>' + UMUR_MIN_MENIT + ' mnt) :', yatim.length, '(' + mb(yatim.reduce((s, x) => s + x.ukuran, 0)) + ')')
console.log('  terlalu muda      :', muda.length)

// Berkas bernama sensitif tidak dihapus otomatis.
const SENSITIF = /siswa|gtk|guru|pegawai|foto|avatar|logo|ttd|signature/i
const ditahan = yatim.filter(y => SENSITIF.test(y.nama))
const aman = yatim.filter(y => !SENSITIF.test(y.nama))

if (yatim.length) {
  console.log('\n=== YATIM (30 terbesar) ===')
  for (const y of [...yatim].sort((a, b) => b.ukuran - a.ukuran).slice(0, 30)) {
    console.log(`  ${String(Math.round(y.ukuran / 1024)).padStart(7)} KB  ${y.nama}`)
  }
  if (ditahan.length) {
    console.log('\n  DITAHAN (nama sensitif, tinjau manual):', ditahan.length)
    for (const d of ditahan.slice(0, 10)) console.log('    -', d.nama)
  }
}

if (!HAPUS) {
  console.log('\nMODE LAPORAN — tidak ada yang dihapus. Tambahkan --hapus untuk menghapus.')
} else {
  let n = 0, bytes = 0
  for (const y of aman) {
    try { fs.unlinkSync(path.join(UPLOAD, y.nama)); n++; bytes += y.ukuran } catch { /* lewati */ }
  }
  console.log(`\nDIHAPUS: ${n} berkas (${mb(bytes)}). Ditahan (sensitif): ${ditahan.length}.`)
}

db.close()
