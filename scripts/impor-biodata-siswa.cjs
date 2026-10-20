'use strict'
// Impor biodata siswa dari Excel "DATA RAPOR.xlsx".
//
// Mode LAPORAN (default) tidak menulis apa pun. Terapkan hanya dengan --terapkan.
// Backup DB otomatis sebelum menulis.
//
// Kolom Excel -> kolom DB `siswa`:
//   Tempat Lahir        -> tempat_lahir
//   Tanggal Lahir       -> tanggal_lahir   ("05 Oktober 2013" -> 2013-10-05)
//   NIK                 -> nik
//   Jenis Kelamin       -> jenis_kelamin   ("Laki-Laki" -> L)
//   Agama               -> agama
//   Status dalam Keluarga -> status_keluarga
//   Anak ke             -> anak_ke         ("3 (Tiga)" -> 3)
//   Alamat Peserta Didik-> alamat
//   Nomor               -> no_hp
//   Sekolah Asal        -> asal_sekolah
//   Ayah                -> nama_ayah
//   Ibu                 -> nama_ibu
//   Alamat Orang Tua    -> alamat_ortu
//   Pekerjaan Orang Tua -> kerja_ayah
//   Rombel              -> (dilaporkan saja, tidak diubah otomatis)
//
// Pencocokan: NAMA dulu (NIS di Excel berformat panjang 18 digit, sedangkan DB
// menyimpan NIS pendek 6 digit seperti 260121 — mencocokkan lewat NIS akan
// gagal 100%). NIS/NISN Excel tetap dilaporkan sebagai pembanding.

const fs = require('fs')
const path = require('path')
const Database = require(path.join(__dirname, '..', 'node_modules/better-sqlite3'))
const XLSX = require(path.join(__dirname, '..', 'node_modules/xlsx'))

const TERAPKAN = process.argv.includes('--terapkan')
const DB_PATH = process.env.JK_DB || path.join(__dirname, '..', 'server/jurnalku.db')
const XLSX_PATH = process.env.JK_XLSX || '/home/aljadugh/Downloads/DATA RAPOR(1).xlsx'
const TENANT = process.env.JK_TENANT || 'mtsplussd7'

const BULAN = { januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12 }

function normalNama(s) {
  return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim()
}

function tanggalIso(v) {
  if (!v) return null
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)
  if (m) {
    const bl = BULAN[m[2].toLowerCase()]
    if (bl) return `${m[3]}-${String(bl).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return s
  return null
}

function angkaDariTeks(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Math.trunc(v)
  const m = String(v).match(/(\d+)/)
  return m ? Number(m[1]) : null
}

function jenisKelamin(v) {
  const s = String(v || '').toLowerCase()
  if (s.startsWith('l')) return 'L'
  if (s.startsWith('p')) return 'P'
  return null
}

function bersih(v) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  return s === '' ? null : s
}

function bacaExcel() {
  const wb = XLSX.readFile(XLSX_PATH)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const kepala = rows[0].map(h => String(h).trim().toLowerCase())
  const idx = (nama) => kepala.findIndex(h => h === nama.toLowerCase())
  const K = {
    nama: idx('NAMA SISWA'), nis: idx('NIS'), nisn: idx('NISN'),
    tempat: idx('Tempat Lahir'), tanggal: idx('Tanggal Lahir'), nik: idx('NIK'),
    jk: idx('Jenis Kelamin'), agama: idx('Agama'), statusKel: idx('Status dalam Keluarga'),
    anakKe: idx('Anak ke'), alamat: idx('Alamat Peserta Didik'), nomor: idx('Nomor'),
    asal: idx('Sekolah Asal'), ayah: idx('Ayah'), ibu: idx('Ibu'),
    alamatOrtu: idx('Alamat Orang Tua'), kerja: idx('Pekerjaan Orang Tua'), rombel: idx('Rombel'),
  }
  return rows.slice(1).filter(r => normalNama(r[K.nama])).map(r => ({
    nama: normalNama(r[K.nama]),
    namaAsli: String(r[K.nama]).trim(),
    nisExcel: bersih(r[K.nis]), nisnExcel: bersih(r[K.nisn]),
    tempat_lahir: bersih(r[K.tempat]),
    tanggal_lahir: tanggalIso(r[K.tanggal]),
    nik: bersih(r[K.nik]),
    jenis_kelamin: jenisKelamin(r[K.jk]),
    agama: bersih(r[K.agama]),
    status_keluarga: bersih(r[K.statusKel]),
    anak_ke: angkaDariTeks(r[K.anakKe]),
    alamat: bersih(r[K.alamat]),
    no_hp: bersih(r[K.nomor]),
    asal_sekolah: bersih(r[K.asal]),
    nama_ayah: bersih(r[K.ayah]),
    nama_ibu: bersih(r[K.ibu]),
    alamat_ortu: bersih(r[K.alamatOrtu]),
    kerja_ayah: bersih(r[K.kerja]),
    rombel_excel: bersih(r[K.rombel]),
  }))
}

function main() {
  if (!fs.existsSync(XLSX_PATH)) { console.error('Excel tidak ada:', XLSX_PATH); process.exit(1) }
  if (!fs.existsSync(DB_PATH)) { console.error('DB tidak ada:', DB_PATH); process.exit(1) }

  const data = bacaExcel()
  const db = new Database(DB_PATH, { readonly: !TERAPKAN })
  const siswa = db.prepare(`SELECT id,nis,nama,nisn,tempat_lahir,tanggal_lahir,nik,jenis_kelamin,agama,
    status_keluarga,anak_ke,alamat,no_hp,asal_sekolah,nama_ayah,nama_ibu,alamat_ortu,kerja_ayah
    FROM siswa WHERE tenant_id=?`).all(TENANT)
  const petaNama = new Map(siswa.map(s => [normalNama(s.nama), s]))

  const cocok = [], tidakCocok = []
  for (const d of data) {
    const s = petaNama.get(d.nama)
    if (s) cocok.push({ siswa: s, excel: d })
    else tidakCocok.push(d)
  }

  // Kolom yang akan diisi: hanya yang di Excel ADA isinya.
  const KOLOM = ['tempat_lahir', 'tanggal_lahir', 'nik', 'jenis_kelamin', 'agama', 'status_keluarga',
    'anak_ke', 'alamat', 'no_hp', 'asal_sekolah', 'nama_ayah', 'nama_ibu', 'alamat_ortu', 'kerja_ayah']

  console.log('=== SUMBER ===')
  console.log(`  Excel      : ${path.basename(XLSX_PATH)}`)
  console.log(`  baris data : ${data.length}`)
  console.log(`  DB         : ${path.basename(DB_PATH)} (tenant ${TENANT}, ${siswa.length} siswa)`)
  console.log(`  MODE       : ${TERAPKAN ? 'TERAPKAN (menulis)' : 'LAPORAN (tidak menulis)'}`)

  console.log('\n=== PENCOCOKAN ===')
  console.log(`  cocok nama : ${cocok.length}`)
  console.log(`  tidak cocok: ${tidakCocok.length}`)
  for (const d of tidakCocok.slice(0, 10)) {
    console.log(`    - ${d.namaAsli} (NIS excel ${d.nisExcel || '-'}, rombel ${d.rombel_excel || '-'})`)
  }

  // Ringkasan perubahan per kolom: berapa yang kosong -> terisi.
  console.log('\n=== DAMPAK PER KOLOM (kosong -> terisi) ===')
  const dampak = {}
  for (const k of KOLOM) dampak[k] = 0
  for (const { siswa: s, excel: d } of cocok) {
    for (const k of KOLOM) {
      const lama = s[k] === null || s[k] === undefined || String(s[k]).trim() === '' || s[k] === 0
      const baru = d[k] !== null && d[k] !== undefined && String(d[k]).trim() !== ''
      if (lama && baru) dampak[k]++
    }
  }
  for (const k of KOLOM) console.log(`  ${k.padEnd(16)} ${String(dampak[k]).padStart(4)} siswa`)

  if (!TERAPKAN) {
    console.log('\nTidak ada yang ditulis. Jalankan dengan --terapkan untuk menyimpan.')
    return
  }

  // Backup sebelum menulis.
  const cap = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = `${DB_PATH}.backup-biodata-${cap}`
  fs.copyFileSync(DB_PATH, backup)
  console.log(`\nBackup: ${backup}`)

  const set = KOLOM.map(k => `${k}=COALESCE(NULLIF(?, ''), ${k})`).join(', ')
  const stmt = db.prepare(`UPDATE siswa SET ${set} WHERE id=? AND tenant_id=?`)
  let berubah = 0
  const tx = db.transaction((daftar) => {
    for (const { siswa: s, excel: d } of daftar) {
      const nilai = KOLOM.map(k => (d[k] === null || d[k] === undefined ? '' : String(d[k])))
      const r = stmt.run(...nilai, s.id, TENANT)
      if (r.changes) berubah++
    }
  })
  tx(cocok)
  console.log(`Selesai. ${berubah} baris diperbarui dari ${cocok.length} yang cocok.`)
}

main()
