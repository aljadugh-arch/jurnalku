'use strict'
// Verifikasi aturan host demo terhadap DB nyata (read-only).
const path = require('path')
const Database = require(path.join(__dirname, '..', 'node_modules/better-sqlite3'))
const db = new Database(path.join(__dirname, '..', 'server/jurnalku.db'), { readonly: true })

const DEMO_HOSTS = new Set(
  String(process.env.DEMO_HOSTS || 'demo.jurnal.cc.cd,jurnal.cc.cd,www.jurnal.cc.cd,jurnalku.biz.id,www.jurnalku.biz.id,idjurnal.my.id,idjurnal.web.id,idjurnal.biz.id,localhost,127.0.0.1')
    .split(',').map(h => h.trim().toLowerCase()).filter(Boolean)
)
const DEMO_TENANT_ID = 'demo-tenant'

function hostMilikSatuLembaga(host) {
  try {
    const h = String(host || '').toLowerCase().replace(/\.$/, '')
    if (!h || h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return false
    const custom = db.prepare("SELECT id FROM tenants WHERE lower(trim(domain_custom,'.')) = ? AND aktif = 1").get(h)
    if (custom) return true
    const q = db.prepare("SELECT id FROM tenants WHERE lower(trim(base_domain,'.')) = ? AND aktif = 1")
    const rows = typeof q.all === 'function' ? q.all(h) : []
    return rows.length === 1 && rows[0].id !== DEMO_TENANT_ID
  } catch { return false }
}

const uji = [
  'jurnal.cc.cd', 'www.jurnal.cc.cd', 'jurnalmadrasah.web.id',
  'jurnal.mtsplussd7.cc.cd', 'jurnal.mimifdangimbang.my.id',
  'demo.jurnal.cc.cd', 'localhost',
]
console.log('host'.padEnd(32), 'demoHost', 'milikLembaga', 'AKTIF')
for (const h of uji) {
  const inList = DEMO_HOSTS.has(h)
  const milik = hostMilikSatuLembaga(h)
  console.log(h.padEnd(32), String(inList).padEnd(8), String(milik).padEnd(12), inList && !milik ? 'YA' : 'tidak')
}

console.log('\n-- base_domain yang dipakai >1 tenant (harus tetap boleh demo) --')
for (const r of db.prepare("SELECT base_domain, COUNT(*) n FROM tenants WHERE aktif=1 AND base_domain IS NOT NULL GROUP BY lower(trim(base_domain,'.')) ORDER BY n DESC").all()) {
  console.log(' ', r.base_domain, '->', r.n, 'tenant')
}

console.log('\n-- NIS berapostrof --')
const kotor = db.prepare("SELECT COUNT(*) n FROM siswa WHERE nis LIKE '''%' OR nisn LIKE '''%'").get().n
console.log('  siswa dengan NIS/NISN berapostrof:', kotor)
for (const r of db.prepare("SELECT tenant_id, nis, nisn, nama FROM siswa WHERE nis LIKE '''%' OR nisn LIKE '''%' LIMIT 5").all()) {
  console.log('   ', r.tenant_id, JSON.stringify(r.nis), JSON.stringify(r.nisn), r.nama)
}

console.log('\n-- bulan tersedia (keuangan_transaksi) --')
for (const r of db.prepare("SELECT strftime('%Y-%m', tanggal) b, COUNT(*) n, SUM(nominal) t FROM keuangan_transaksi WHERE tanggal IS NOT NULL GROUP BY b ORDER BY b DESC LIMIT 6").all()) {
  console.log('   ', r.b, r.n, 'transaksi, Rp', Number(r.t || 0).toLocaleString('id-ID'))
}
