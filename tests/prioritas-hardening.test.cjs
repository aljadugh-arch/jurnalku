const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const server = read('server/index.cjs')
const jurnal = read('src/pages/guru/GuruJurnalPage.tsx')
const html = read('index.html')
const vite = read('vite.config.ts')

test('B2+B3: meta description/OpenGraph + skeleton #root ada di index.html', () => {
  assert.match(html, /<meta name="description"/, 'meta description')
  assert.match(html, /property="og:title"/, 'og:title')
  assert.match(html, /property="og:image"/, 'og:image')
  assert.match(html, /name="twitter:card"/, 'twitter card')
  assert.match(html, /id="boot-splash"/, 'skeleton splash')
  assert.match(html, /Memuat JURNALKU/, 'teks loading')
})

test('B4: vite.config punya manualChunks untuk vendor berat', () => {
  assert.match(vite, /manualChunks/, 'manualChunks ada')
  assert.match(vite, /vendor-xlsx/, 'chunk xlsx')
  assert.match(vite, /vendor-react/, 'chunk react')
})

test('B6+D1: jurnal punya guard submitting + autosave draf localStorage', () => {
  assert.match(jurnal, /const \[submitting, setSubmitting\]/, 'state submitting')
  assert.match(jurnal, /if \(submitting\) return/, 'cegah double-submit')
  assert.match(jurnal, /disabled=\{submitting\}/, 'tombol disabled saat kirim')
  assert.match(jurnal, /JURNAL_DRAFT_KEY/, 'kunci draf localStorage')
  assert.match(jurnal, /loadJurnalDraft|clearJurnalDraft/, 'helper draf')
  assert.match(jurnal, /clearJurnalDraft\(\)/, 'draf dibersihkan setelah sukses')
})

test('C3: index komposit jurnal_mengajar dideklarasi', () => {
  assert.match(server, /idx_jurnal_tenant_tanggal_guru/, 'index (tenant,tanggal,guru)')
  assert.match(server, /idx_jurnal_tenant_rombel_tanggal/, 'index (tenant,rombel,tanggal)')
})

test('C4: jurnal menulis waktu server (created_at/updated_at/submitted_at)', () => {
  assert.match(server, /ALTER TABLE jurnal_mengajar ADD COLUMN updated_at/, 'migrasi updated_at')
  assert.match(server, /ALTER TABLE jurnal_mengajar ADD COLUMN submitted_at/, 'migrasi submitted_at')
  assert.match(server, /INSERT INTO jurnal_mengajar[^)]*created_at, updated_at, submitted_at/s, 'insert menulis kolom waktu')
  assert.match(server, /updated_at=datetime\('now'\)/, 'update memakai waktu server')
})

test('siswa keluar bisa dihapus: hapus paksa mencakup SEMUA tabel ber-FK', () => {
  // 16 tabel FK ke siswa; daftar lama hanya 11 → hapus paksa tetap gagal.
  for (const t of ['rapor_pelengkap', 'ujian_proktor_audit', 'jawaban_ujian', 'sesi_ujian', 'rapor', 'penilaian_harian', 'penilaian_ekskul', 'absensi_mapel', 'absensi_siswa', 'absensi_ekskul', 'absensi_kegiatan', 'catatan_kepribadian', 'ekskul_anggota', 'beasiswa', 'tagihan', 'tabungan']) {
    assert.ok(server.includes(`'${t}'`), `tabel ${t} ada di daftar hapus paksa`)
  }
  // cascade bulk-delete juga diperluas
  assert.match(server, /cascade: \['rapor_pelengkap', 'ujian_proktor_audit'/, 'bulk-delete cascade diperluas')
})

test('tidak ada duplikasi absensi harian: tulis lewat satu fungsi idempotent', () => {
  const rules = read('server/attendance-rules.cjs')
  assert.match(rules, /ON CONFLICT\(tenant_id,siswa_id,tanggal\) DO NOTHING/, 'unique-guard saat insert')
  assert.match(rules, /already: true/, 'kembalikan already saat sudah tercatat')
  // endpoint harian (admin & guru) semua lewat writeDailyAttendanceSession
  assert.doesNotMatch(server, /INSERT INTO absensi_siswa \(/, 'tidak ada INSERT absensi_siswa mentah di index.cjs')
})
