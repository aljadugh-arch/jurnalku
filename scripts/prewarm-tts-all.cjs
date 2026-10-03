// Re-prewarm cache TTS untuk SEMUA tenant aktif dengan key BARU (voice+version).
// Dipakai sekali untuk mengisi ulang cache yang invalid setelah cacheKey diubah
// di commit b4f96f7 (dari tenantId|text -> tenantId|voice|version|text).
// Logika koleksi nama IDENTIK dengan collectTtsAnnouncementNames di index.cjs.
const Database = require('better-sqlite3')
const { generateTtsAudioLocal, checkTtsCache } = require('/www/wwwroot/jurnal.cc.cd/server/tts-local.cjs')
const { runTtsQueue } = require('/www/wwwroot/jurnal.cc.cd/server/gemini-tts.cjs')

const UPLOAD_DIR = '/www/wwwroot/jurnal.cc.cd/server/uploads'
const db = new Database('/www/wwwroot/jurnal.cc.cd/server/jurnalku.db', { readonly: true, fileMustExist: true })

function normalizeNameParts(name) {
  return String(name || '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
}
function toNaturalCase(word) {
  const clean = String(word || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return clean.split(' ').filter(Boolean).map(part => {
    const lower = part.toLocaleLowerCase('id-ID')
    return lower.charAt(0).toLocaleUpperCase('id-ID') + lower.slice(1)
  }).join(' ')
}
function firstName(name) {
  const clean = toNaturalCase(String(name || ''))
  if (!clean) return ''
  return clean.split(' ')[0]
}
function uniqueStudentNickname(siswa, tenantId) {
  const parts = normalizeNameParts(siswa?.nama)
  if (!parts.length) return siswa?.nama || ''
  const all = db.prepare("SELECT nama FROM siswa WHERE tenant_id=? AND COALESCE(status,'aktif')='aktif'").all(tenantId)
  const tokenCounts = new Map()
  for (const row of all) for (const part of normalizeNameParts(row.nama)) tokenCounts.set(part.toLowerCase(), (tokenCounts.get(part.toLowerCase()) || 0) + 1)
  for (let i = parts.length - 1; i >= 0; i--) if ((tokenCounts.get(parts[i].toLowerCase()) || 0) === 1) return parts[i]
  const suffixCounts = new Map()
  for (const row of all) { const rp = normalizeNameParts(row.nama); for (let s = 2; s <= rp.length; s++) suffixCounts.set(rp.slice(-s).join(' ').toLowerCase(), (suffixCounts.get(rp.slice(-s).join(' ').toLowerCase()) || 0) + 1) }
  for (let s = 2; s <= parts.length; s++) { const suf = parts.slice(-s).join(' '); if ((suffixCounts.get(suf.toLowerCase()) || 0) === 1) return suf }
  return parts.join(' ')
}

function collectNames(tenantId) {
  const names = new Set()
  for (const s of db.prepare("SELECT nama, nama_panggilan FROM siswa WHERE tenant_id=? AND COALESCE(status,'aktif')='aktif'").all(tenantId)) {
    const nn = firstName(s.nama_panggilan || uniqueStudentNickname(s, tenantId))
    if (nn) names.add(nn)
  }
  for (const g of db.prepare('SELECT nama FROM gtk WHERE tenant_id=?').all(tenantId)) {
    const nn = firstName(g.nama)
    if (nn) names.add(nn)
  }
  return [...names]
}

;(async () => {
  const tenants = db.prepare("SELECT id FROM tenants WHERE aktif=1 OR aktif IS NULL").all().map(t => t.id)
  let totalPhrases = 0, missing = 0, generated = 0, failed = 0
  const allMissing = []

  for (const tid of tenants) {
    const names = collectNames(tid)
    if (!names.length) continue
    for (const n of names) {
      for (const sesi of ['masuk', 'pulang']) {
        const phrase = `${n} ${sesi}`
        totalPhrases++
        if (!checkTtsCache(phrase, UPLOAD_DIR, tid)) {
          missing++
          allMissing.push({ phrase, tid })
        }
      }
    }
    console.log(`tenant ${tid}: ${names.length} nama, total ${names.length * 2} frase`)
  }

  console.log(`\nTotal frase: ${totalPhrases} | missing (akan digenerate): ${missing}`)
  if (!allMissing.length) { console.log('Cache sudah lengkap, tidak ada yang perlu digenerate.'); process.exit(0) }

  let done = 0
  await runTtsQueue(allMissing, (item) => generateTtsAudioLocal(item.phrase, UPLOAD_DIR, item.tid), {
    concurrency: 2,
    maxRetries: 1,
    rateLimitDelayMs: 300,
    onProgress: (error) => {
      done++
      if (error) { failed++; if (failed <= 5) console.error('  GAGAL:', error.message) }
      else generated++
      if (done % 50 === 0) console.log(`  progres ${done}/${missing}`)
    },
  })
  console.log(`\nSelesai: generated=${generated}, failed=${failed}, total missing=${missing}`)
  db.close()
})().catch(e => { console.error('FATAL:', e); process.exit(1) })
