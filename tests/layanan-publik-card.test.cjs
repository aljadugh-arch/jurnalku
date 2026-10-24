'use strict'
// Kontrak halaman layanan publik + card tidak lagi menunjuk /login (24 Okt 2026).
//
// Sebelumnya card "Ujian Online", "LMS", dan "WhatsApp" di landing + login
// semuanya menunjuk /login. Sekarang tiap layanan punya halaman publik sendiri
// (diadopsi dari SISFO yang memberi tiap layanan halamannya, bukan satu tujuan).
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const login = fs.readFileSync(path.join(AKAR, 'src/pages/auth/LoginPage.tsx'), 'utf8')
const landing = fs.readFileSync(path.join(AKAR, 'src/pages/LandingPage.tsx'), 'utf8')
const app = fs.readFileSync(path.join(AKAR, 'src/App.tsx'), 'utf8')

test('route publik layanan terdaftar di App.tsx', () => {
  assert.ok(app.includes('path="/ujian-online"'), 'rute /ujian-online')
  assert.ok(app.includes('path="/lms"'), 'rute /lms')
  assert.ok(app.includes('path="/whatsapp"'), 'rute /whatsapp')
})

test('card login tidak lagi menunjuk /login untuk layanan', () => {
  assert.ok(/judul: 'Ujian Online'[\s\S]*?href: '\/ujian-online'/.test(login), 'Ujian Online -> /ujian-online')
  assert.ok(/judul: 'LMS'[\s\S]*?href: '\/lms'/.test(login), 'LMS -> /lms')
  assert.ok(/judul: 'WhatsApp'[\s\S]*?href: '\/whatsapp'/.test(login), 'WhatsApp -> /whatsapp')
  // PPDB tetap ke halaman publik PPDB.
  assert.ok(/judul: 'PPDB'[\s\S]*?href: '\/ppdb'/.test(login), 'PPDB -> /ppdb')
})

test('card landing tidak lagi menunjuk /login untuk layanan', () => {
  assert.ok(/judul: 'Ujian Online'[\s\S]*?to: '\/ujian-online'/.test(landing), 'Ujian Online -> /ujian-online')
  assert.ok(/judul: 'LMS'[\s\S]*?to: '\/lms'/.test(landing), 'LMS -> /lms')
  assert.ok(/judul: 'WhatsApp'[\s\S]*?to: '\/whatsapp'/.test(landing), 'WhatsApp -> /whatsapp')
})

test('halaman layanan publik punya konten (fitur + CTA masuk/daftar)', () => {
  const layanan = fs.readFileSync(path.join(AKAR, 'src/components/LayananDetail.tsx'), 'utf8')
  assert.ok(layanan.includes('PublicShell'), 'pakai cangkang publik')
  assert.ok(layanan.includes('/login'), 'CTA Masuk')
  assert.ok(layanan.includes('/register'), 'CTA Daftar')
  assert.ok(layanan.includes('fitur.map'), 'daftar fitur dirender')

  const ujian = fs.readFileSync(path.join(AKAR, 'src/pages/UjianOnlinePage.tsx'), 'utf8')
  const lms = fs.readFileSync(path.join(AKAR, 'src/pages/LmsPublikPage.tsx'), 'utf8')
  const wa = fs.readFileSync(path.join(AKAR, 'src/pages/WhatsAppPublikPage.tsx'), 'utf8')
  assert.ok(ujian.includes('Bank Soal'), 'ujian punya fitur Bank Soal')
  assert.ok(lms.includes('Penugasan Digital'), 'lms punya fitur Penugasan')
  assert.ok(wa.includes('Kehadiran'), 'wa punya fitur Kehadiran')
})
