'use strict'
// Uji endpoint filter bulan di produksi dengan token nyata.
// Token dibuat runtime dari JWT_SECRET milik proses jurnalku-api (bukan menebak
// password), lalu dipakai memanggil API sebagai user bendahara.
const fs = require('fs')
const path = require('path')
const jwt = require(path.join(__dirname, '..', 'node_modules/jsonwebtoken'))
const Database = require(path.join(__dirname, '..', 'node_modules/better-sqlite3'))

function cariSecret() {
  const pid = fs.readFileSync('/proc/self/stat', 'utf8')
  // Cari proses jurnalku-api lewat /proc
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue
    try {
      const cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8')
      if (!cmd.includes('server/index.cjs')) continue
      const env = fs.readFileSync(`/proc/${d}/environ`, 'utf8').split('\0')
      for (const kv of env) {
        if (kv.startsWith('JWT_SECRET=')) return kv.slice('JWT_SECRET='.length)
      }
    } catch {}
  }
  return null
}

const secret = cariSecret()
if (!secret) { console.error('JWT_SECRET tidak ditemukan di proses'); process.exit(1) }

const db = new Database(path.join(__dirname, '..', 'server/jurnalku.db'), { readonly: true })
// Pilih tenant yang benar-benar punya data keuangan supaya uji ini membuktikan
// angkanya berubah per bulan, bukan sekadar mengembalikan nol.
const tenantUji = process.env.TENANT_UJI
  || db.prepare("SELECT tenant_id, COUNT(*) n FROM keuangan_transaksi GROUP BY tenant_id ORDER BY n DESC LIMIT 1").get()?.tenant_id
const user = db.prepare("SELECT * FROM users WHERE role='admin' AND tenant_id=? LIMIT 1").get(tenantUji)
  || db.prepare("SELECT * FROM users WHERE tenant_id=? LIMIT 1").get(tenantUji)
if (!user) { console.error('user tidak ada untuk tenant', tenantUji); process.exit(1) }

const token = jwt.sign({ id: user.id, email: user.email, nama: user.nama, role: user.role, tenant_id: user.tenant_id, gtk_id: user.gtk_id, siswa_id: user.siswa_id, nis: user.nis }, secret, { expiresIn: '10m' })

const BASE = 'http://127.0.0.1:3002'
// Host mengikuti tenant yang diuji supaya tenantMiddleware memilih tenant benar.
const HOST = process.env.HOST_UJI || 'jurnal.cc.cd'

async function get(p) {
  const r = await fetch(BASE + p, { headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-Host': HOST, Host: HOST } })
  const t = await r.text()
  try { return { status: r.status, body: JSON.parse(t) } } catch { return { status: r.status, body: t.slice(0, 200) } }
}

;(async () => {
  console.log(`user: ${user.nama} (${user.role}) tenant=${user.tenant_id}\n`)

  console.log('=== dashboard: tanpa bulan vs Oktober vs September ===')
  for (const b of ['', '2026-10', '2026-09']) {
    const q = b ? `?bulan=${b}` : ''
    const r = await get('/api/bendahara/dashboard' + q)
    if (r.status !== 200) { console.log(b || '(default)', r.status, r.body); continue }
    const d = r.body
    console.log(`  ${b || '(default)'}: lunas=${d.lunas_bulan_ini?.jumlah} Rp${Number(d.lunas_bulan_ini?.nominal || 0).toLocaleString('id-ID')}`
      + ` | tabSetor=Rp${Number(d.tabungan_setor?.total || 0).toLocaleString('id-ID')} (${d.tabungan_setor?.jumlah})`
      + ` | kasMasuk=Rp${Number(d.kas_masuk || 0).toLocaleString('id-ID')}`
      + ` | tagihanBulanIni=${d.tagihan_bulan_ini?.jumlah} Rp${Number(d.tagihan_bulan_ini?.nominal || 0).toLocaleString('id-ID')}`)
    console.log(`     bulan_tersedia: ${(d.bulan_tersedia || []).join(', ')}`)
  }

  console.log('\n=== laporan keuangan Oktober ===')
  const lap = await get('/api/keuangan/laporan?bulan=2026-10')
  if (lap.status === 200) {
    console.log(`  periode ${lap.body.periode?.mulai} s/d ${lap.body.periode?.selesai}`)
    console.log(`  debet=Rp${Number(lap.body.debet || 0).toLocaleString('id-ID')} kredit=Rp${Number(lap.body.kredit || 0).toLocaleString('id-ID')}`)
    console.log(`  bulan_tersedia: ${(lap.body.bulan_tersedia || []).join(', ')}`)
  } else console.log(' ', lap.status, lap.body)

  console.log('\n=== tagihan: bulan tagihan vs bulan bayar (Oktober) ===')
  const t1 = await get('/api/tagihan?bulan=2026-10')
  const t2 = await get('/api/tagihan?bulan_bayar=2026-10')
  console.log(`  bulan tagihan : ${Array.isArray(t1.body) ? t1.body.length : t1.status} baris`)
  console.log(`  bulan bayar   : ${Array.isArray(t2.body) ? t2.body.length : t2.status} baris`)
  if (Array.isArray(t1.body) && t1.body.length) {
    const s = t1.body.slice(0, 3).map(x => `${x.siswa_nama}/${x.bulan} ${x.tahun}/${x.status}`)
    console.log('    contoh:', s.join(' | '))
  }

  console.log('\n=== tabungan ringkasan bulanan Oktober ===')
  const tab = await get('/api/tabungan/ringkasan-bulanan?bulan=2026-10')
  if (tab.status === 200) {
    console.log(`  setor=Rp${Number(tab.body.setor?.total || 0).toLocaleString('id-ID')} (${tab.body.setor?.jumlah})`
      + ` tarik=Rp${Number(tab.body.tarik?.total || 0).toLocaleString('id-ID')} (${tab.body.tarik?.jumlah})`
      + ` penabung=${tab.body.penabung} saldo_total=Rp${Number(tab.body.saldo_total || 0).toLocaleString('id-ID')}`)
  } else console.log(' ', tab.status, tab.body)

  console.log('\n=== validasi bulan tidak valid (harus diabaikan, bukan error) ===')
  const bad = await get('/api/keuangan/laporan?bulan=2026-13')
  console.log('  status', bad.status, 'periode', bad.body?.periode)
})()
