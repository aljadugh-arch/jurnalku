'use strict'
// Retensi wa_queue: LAPORAN (default) atau --terapkan.
// Hanya status 'sent' yang lebih tua dari N hari yang dihapus. pending/failed
// TIDAK disentuh — pending masih akan dikirim, failed masih perlu ditelusuri.
const path = require('path')
const fs = require('fs')
const D = require(path.join(__dirname, '..', 'node_modules/better-sqlite3'))

const TERAPKAN = process.argv.includes('--terapkan')
const HARI = Number((process.argv.find(a => a.startsWith('--hari=')) || '--hari=90').split('=')[1]) || 90
const db = new D(path.join(__dirname, '..', 'server/jurnalku.db'))

console.log(`DB     : ${path.join(__dirname, '..', 'server/jurnalku.db')}`)
console.log(`Mode   : ${TERAPKAN ? 'TERAPKAN (menghapus)' : 'LAPORAN (tidak menghapus)'}`)
console.log(`Retensi: sent lebih tua dari ${HARI} hari\n`)

const total = db.prepare('SELECT COUNT(*) n FROM wa_queue').get().n
const perStatus = db.prepare('SELECT status, COUNT(*) n FROM wa_queue GROUP BY status').all()
console.log(`Total baris: ${total}`)
for (const r of perStatus) console.log(`  ${String(r.status).padEnd(8)} ${r.n}`)

const batas = `-${HARI} days`
const kandidat = db.prepare("SELECT COUNT(*) n FROM wa_queue WHERE status='sent' AND datetime(created_at) < datetime('now', ?)").get(batas).n
const tersisa = db.prepare("SELECT COUNT(*) n FROM wa_queue WHERE status<>'sent' OR datetime(created_at) >= datetime('now', ?)").get(batas).n
const rentang = db.prepare("SELECT MIN(created_at) lama, MAX(created_at) baru FROM wa_queue WHERE status='sent' AND datetime(created_at) < datetime('now', ?)").get(batas)

console.log(`\nKandidat dihapus (sent > ${HARI} hari): ${kandidat}`)
console.log(`Akan tersisa                    : ${tersisa}`)
if (kandidat) console.log(`Rentang kandidat                : ${rentang.lama} .. ${rentang.baru}`)

if (!kandidat) { console.log('\nTidak ada yang perlu dihapus.'); process.exit(0) }
if (!TERAPKAN) { console.log('\nTidak ada yang dihapus. Jalankan dengan --terapkan.'); process.exit(0) }

// Cadangkan dulu: hapus massal tanpa jejak bukan pilihan.
const cadangan = path.join(__dirname, '..', 'logs', `cadangan-wa-queue-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
fs.mkdirSync(path.dirname(cadangan), { recursive: true })
const rows = db.prepare("SELECT * FROM wa_queue WHERE status='sent' AND datetime(created_at) < datetime('now', ?)").all(batas)
fs.writeFileSync(cadangan, JSON.stringify(rows, null, 2))
console.log(`\nCadangan (${rows.length} baris): ${cadangan}`)

const info = db.prepare("DELETE FROM wa_queue WHERE status='sent' AND datetime(created_at) < datetime('now', ?)").run(batas)
console.log(`Terhapus: ${info.changes}`)
console.log(`Sisa wa_queue: ${db.prepare('SELECT COUNT(*) n FROM wa_queue').get().n}`)
db.exec('VACUUM')
console.log('VACUUM selesai.')
