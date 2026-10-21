'use strict'
// Audit permanen: menjaga integritas menu, rute, dan endpoint.
//
// Tes ini bukan sekadar "apakah file ada" — ia memeriksa hal yang paling mudah
// rusak saat menambah fitur: menu yang menunjuk rute tidak ada, rute yang tidak
// bisa ditemukan pengguna, dan endpoint yang dipanggil frontend tapi tidak
// pernah didaftarkan server.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const AKAR = path.join(__dirname, '..')
const baca = (p) => fs.readFileSync(path.join(AKAR, p), 'utf8')

const app = baca('src/App.tsx')
const menu = baca('src/lib/menuItems.tsx')

// Rute bersarang: gabungkan dengan induknya.
function ruteSemua() {
  const hasil = new Set()
  let induk = ''
  for (const line of app.split('\n')) {
    const mInduk = line.match(/<Route path="(\/(?:admin|guru|siswa|proktor))"/)
    if (mInduk) { induk = mInduk[1]; hasil.add(induk); continue }
    const m = line.match(/<Route path="([^"]+)"/)
    if (m && !m[1].startsWith('/')) {
      hasil.add((induk || '') + '/' + m[1])
    } else if (m) {
      hasil.add(m[1])
    }
  }
  return hasil
}

test('setiap path menu menunjuk rute yang benar-benar terdaftar', () => {
  const rute = ruteSemua()
  const menuPath = [...menu.matchAll(/path:\s*'(\/[^']+)'/g)].map(m => m[1].split('#')[0])
  const mati = menuPath.filter(p => !rute.has(p))
  assert.deepStrictEqual(mati, [], `menu menunjuk rute yang tidak ada: ${mati.join(', ')}`)
})

test('halaman Rapor memakai tiga tujuan berbeda (tidak kembar)', () => {
  const rute = ruteSemua()
  for (const p of ['/admin/rapor', '/admin/cetak-rapor', '/admin/buku-induk']) {
    assert.ok(rute.has(p), `${p} harus terdaftar sebagai rute`)
  }
})

test('endpoint yang dipanggil frontend terdaftar di server', () => {
  // Kumpulkan endpoint server dari SEMUA modul.
  const server = new Set()
  for (const f of fs.readdirSync(path.join(AKAR, 'server'))) {
    if (!/\.(cjs|mjs)$/.test(f)) continue
    const isi = fs.readFileSync(path.join(AKAR, 'server', f), 'utf8')
    for (const m of isi.matchAll(/app\.(?:get|post|put|patch|delete)\(\s*'([^']+)'/g)) server.add(m[1])
  }
  // Kumpulkan panggilan frontend.
  const panggilan = new Set()
  const jelajah = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f)
      if (fs.statSync(p).isDirectory()) jelajah(p)
      else if (/\.(tsx|ts)$/.test(f)) {
        const isi = fs.readFileSync(p, 'utf8')
        for (const m of isi.matchAll(/\bapi\.(?:get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)/g)) {
          if (m[1].startsWith('/')) panggilan.add(m[1].replace(/\$\{[^}]*\}/g, ':x').split('?')[0])
        }
      }
    }
  }
  jelajah(path.join(AKAR, 'src'))

  const normal = (u) => {
    // Buang garis miring di akhir, dan samakan SEMUA segmen dinamis menjadi :p.
    // Frontend menyusun URL sebagai `/tagihan/${id}` (terdeteksi `/tagihan/`)
    // atau `/bk/${sesiId}/pelanggaran/${id}` (terdeteksi `:x/:x`), sementara
    // server mendaftarkan `:id`. Keduanya harus dianggap sama.
    let s = u.replace(/\/+$/, '')
    s = s.replace(/\/:x/g, '/:p').replace(/\/:id/g, '/:p').replace(/\/:[A-Za-z_][A-Za-z0-9_]*/g, '/:p')
    return s
  }
  const setPola = new Set([...server].map(normal))
  // Cocokkan juga pola ber-wildcard: '/a/:p/:p' cocok dengan '/a/:p/pdf'.
  const cocokPola = (u) => {
    const seg = u.split('/')
    for (const e of setPola) {
      const es = e.split('/')
      if (es.length !== seg.length) continue
      let sama = true
      for (let i = 0; i < seg.length; i++) {
        if (es[i] === ':p' || seg[i] === ':p') continue
        if (es[i] !== seg[i]) { sama = false; break }
      }
      if (sama) return true
    }
    return false
  }
  const hilang = [...panggilan].filter(u => {
    const kandidat = u.startsWith('/api/') ? [u] : [u, '/api' + u]
    for (const k of kandidat) {
      if (setPola.has(normal(k)) || cocokPola(normal(k))) return false
      if (k.endsWith('/')) {
        const dasar = normal(k).replace(/\/$/, '')
        for (const e of setPola) {
          if (e === dasar || e.startsWith(dasar + '/')) return false
        }
      }
    }
    return true
  })
  assert.deepStrictEqual(hilang, [], `endpoint dipanggil tapi tidak ada di server: ${hilang.join(', ')}`)
})

test('setiap endpoint sensitif memakai penjagaan peran', () => {
  const SENSITIF = ['/api/siswa', '/api/gtk', '/api/users', '/api/keuangan', '/api/payroll', '/api/tenants']
  const AMAN = ['/api/health', '/api/auth/', '/api/demo-status', '/api/tenant/info', '/api/subscription']
  const penjaga = /authMiddleware|requireRole|\bADMIN\b|\bSTAFF\b|\bSUPER\b|\bBENDAHARA\b|\bPROCTOR\b|\bBK_READ\b|\bBK_WRITE\b/
  const temuan = []
  for (const f of fs.readdirSync(path.join(AKAR, 'server'))) {
    if (!f.endsWith('.cjs')) continue
    const baris = fs.readFileSync(path.join(AKAR, 'server', f), 'utf8').split('\n')
    baris.forEach((l, i) => {
      const m = l.match(/app\.(?:get|post|put|patch|delete)\(\s*'([^']+)'\s*,\s*([^,)]+)/)
      if (!m) return
      const [, url, mw] = m
      if (!SENSITIF.some(s => url.startsWith(s))) return
      if (AMAN.some(a => url.startsWith(a))) return
      if (!penjaga.test(mw)) temuan.push(`${f}:${i + 1} ${url}`)
    })
  }
  assert.deepStrictEqual(temuan, [], `endpoint sensitif tanpa penjagaan: ${temuan.join(' | ')}`)
})

test('halaman baru (Buku Induk, Portal Operator, Masuk Lembaga) terdaftar', () => {
  const rute = ruteSemua()
  for (const p of ['/admin/buku-induk', '/admin/portal-operator', '/admin/masuk-lembaga']) {
    assert.ok(rute.has(p), `${p} harus terdaftar`)
  }
})
