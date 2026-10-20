'use strict'
// Uji dashboard wali murid lewat HTTP nyata: login nomor WA -> token -> dashboard.
// Membuktikan jalur kredensial nomor WA benar-benar bekerja, bukan hanya ada kodenya.
const fs = require('fs')
const path = require('path')
const jwt = require(path.join(__dirname, '..', 'node_modules/jsonwebtoken'))
const Database = require(path.join(__dirname, '..', 'node_modules/better-sqlite3'))

const BASE = process.env.UJI_BASE || 'http://127.0.0.1:3002'
const HOST = process.env.UJI_HOST || 'jurnal.mtsplussd7.cc.cd'
const db = new Database(path.join(__dirname, '..', 'server/jurnalku.db'), { readonly: true })

// Ambil siswa yang punya nomor HP wali yang VALID (minimal 10 digit) di
// tenant mtsplussd7. Sebelumnya query hanya mengecek no_hp tidak kosong,
// sehingga bisa terpilih baris berisi tanda '-' dan login gagal.
const siswa = db.prepare(`SELECT s.id,s.nama,s.nis,s.no_hp,s.rombel_id FROM siswa s
  WHERE s.tenant_id='mtsplussd7' AND s.status='aktif'
    AND LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(s.no_hp,''),' ',''),'-',''),'+',''),'.','')) >= 10
    AND s.rombel_id IS NOT NULL
  ORDER BY s.nama LIMIT 1`).get()
if (!siswa) { console.log('TIDAK ADA siswa dengan no_hp'); process.exit(0) }

const digit = String(siswa.no_hp).replace(/\D/g, '')
const sandi = digit.slice(-6)
console.log(`siswa uji : ${siswa.nama} (${siswa.nis})`)
console.log(`no_hp     : ${digit.slice(0, 4)}****${digit.slice(-2)}`)
console.log(`sandi uji : ${sandi.slice(0, 2)}****`)

async function main() {
  // 1) Login dengan nomor WA + sandi 6 digit terakhir.
  const r1 = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-Host': HOST, Host: HOST },
    body: JSON.stringify({ email: digit, password: sandi }),
  })
  const j1 = await r1.json().catch(() => ({}))
  console.log(`\n1. login nomor WA      : status=${r1.status} role=${j1?.user?.role || '-'}`)
  if (!j1?.token) { console.log('   respons:', JSON.stringify(j1).slice(0, 160)); return }
  const token = j1.token
  const H = { Authorization: `Bearer ${token}`, 'X-Forwarded-Host': HOST, Host: HOST }

  // 2) Dashboard wali.
  const r2 = await fetch(`${BASE}/api/siswa/dashboard`, { headers: H })
  const j2 = await r2.json().catch(() => ({}))
  const anak = j2?.children || []
  const s = j2?.siswa
  console.log(`2. /siswa/dashboard    : status=${r2.status} anak=${anak.length} terpilih=${s?.nama || '-'}`)
  console.log(`   kehadiran           : hadir=${j2?.rekap?.hadir ?? 0} sakit=${j2?.rekap?.sakit ?? 0} izin=${j2?.rekap?.izin ?? 0} alpha=${j2?.rekap?.alpha ?? 0}`)
  console.log(`   tagihan belum bayar : Rp ${Number(j2?.tagihan?.belum_bayar || 0).toLocaleString('id-ID')}`)
  console.log(`   saldo tabungan      : Rp ${Number(j2?.tabungan?.saldo || 0).toLocaleString('id-ID')}`)
  console.log(`   nilai tercatat      : ${(j2?.nilai_detail || []).length} baris`)
  console.log(`   absensi tercatat    : ${(j2?.absensi_detail || []).length} baris`)

  // 3) Kalau ada lebih dari satu anak, pastikan bisa pindah anak.
  if (anak.length > 1) {
    const lain = anak.find(a => String(a.id) !== String(s?.id))
    const r3 = await fetch(`${BASE}/api/siswa/dashboard?student_id=${lain.id}`, { headers: H })
    const j3 = await r3.json().catch(() => ({}))
    console.log(`3. pindah anak         : status=${r3.status} terpilih=${j3?.siswa?.nama || '-'}`)
  } else {
    console.log('3. pindah anak         : dilewati (wali hanya punya 1 anak)')
  }

  // 4) Anak yang bukan miliknya harus ditolak.
  const asing = db.prepare(`SELECT id,nama FROM siswa WHERE tenant_id='mtsplussd7' AND status='aktif'
    AND id NOT IN (SELECT student_id FROM user_students WHERE user_id=(SELECT id FROM users WHERE tenant_id='mtsplussd7' AND role='wali_murid' ORDER BY created_at DESC LIMIT 1))
    LIMIT 1`).get()
  if (asing) {
    const r4 = await fetch(`${BASE}/api/siswa/dashboard?student_id=${asing.id}`, { headers: H })
    console.log(`4. anak bukan miliknya : status=${r4.status} (harus 403)`)
  }
}

main().catch(e => { console.error('GAGAL:', e.message); process.exit(1) })
