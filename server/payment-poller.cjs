// Poller cadangan Payment Gateway QRIS.
//
// Webhook adalah jalur utama, tapi webhook bisa hilang (gateway retry habis, jaringan
// putus, server restart tepat saat callback datang, atau gateway tidak pernah mendaftar
// webhook karena API key baru diisi). Poller ini menutup celah itu: setiap 60 detik ia
// menanyakan status tiap intent pending ke gateway lewat
// GET {base}/api/payment/status?amount=N, lalu menandai lunas dengan applier yang sama
// persis seperti webhook — sehingga tidak ada jalur ganda yang bisa menambah saldo dua kali
// (tandaiLunas idempoten).
//
// Aman dijalankan berulang: satu putaran tidak menumpuk bila putaran sebelumnya belum usai.

const { intentPending, tandaiKedaluwarsa, tandaiLunas, klienUntukTenant } = require('./payment-gateway.cjs')

const INTERVAL_MS_DEFAULT = 60 * 1000
const JEDA_ANTAR_LEMBAGA_MS = 250

function daftarLembagaAktif(db) {
  return db.prepare(`SELECT tenant_id FROM payment_gateway_config
    WHERE enabled=1 AND api_key_encrypted IS NOT NULL AND api_key_encrypted<>''`).all()
}

const tunggu = (ms) => new Promise(r => setTimeout(r, ms))

/**
 * Satu putaran penuh untuk SEMUA lembaga aktif. `db` disuntik supaya bisa diuji.
 * Mengembalikan ringkasan supaya pemanggil (endpoint manual / log) bisa melaporkan angka.
 */
async function pollSekali(db, { klienPabrik = klienUntukTenant, sekarang = new Date(), fetchImpl = null } = {}) {
  const ringkas = { waktu: sekarang.toISOString(), lembaga: 0, dicek: 0, lunas: 0, gagal: 0, kedaluwarsa: 0, galat: [] }
  ringkas.kedaluwarsa = tandaiKedaluwarsa(db)

  for (const { tenant_id: tenantId } of daftarLembagaAktif(db)) {
    const daftar = intentPending(db, tenantId)
    if (!daftar.length) continue
    ringkas.lembaga++
    let klien
    try {
      klien = klienPabrik(db, tenantId, fetchImpl ? { fetchImpl } : {})
    } catch (e) {
      ringkas.galat.push({ tenant_id: tenantId, pesan: e.message })
      continue
    }
    for (const intent of daftar) {
      ringkas.dicek++
      try {
        const status = await klien.statusNominal(intent.pay_amount)
        if (!status.paid) continue
        const hasil = tandaiLunas(db, { intentId: intent.id, sumber: 'poller', waktu: new Date().toISOString() })
        if (!hasil.duplikat) ringkas.lunas++
      } catch (e) {
        ringkas.gagal++
        if (ringkas.galat.length < 10) ringkas.galat.push({ tenant_id: tenantId, intent_id: intent.id, pesan: e.message })
      }
    }
    await tunggu(JEDA_ANTAR_LEMBAGA_MS)
  }
  return ringkas
}

/**
 * Jalankan poller latar. Mengembalikan handle { stop, jalanSekarang } supaya bisa
 * dihentikan bersih saat shutdown (dan diuji tanpa menunggu 60 detik).
 */
function startPaymentPoller(db, { intervalMs = INTERVAL_MS_DEFAULT, onRingkas = null, logger = console } = {}) {
  let berjalan = false
  let berhenti = false
  let timer = null

  const jalankan = async () => {
    if (berjalan || berhenti) return null
    berjalan = true
    try {
      const hasil = await pollSekali(db)
      if (hasil.lunas || hasil.galat.length) {
        if (onRingkas) onRingkas(hasil)
        else if (hasil.lunas) logger.log(`[payment-poller] ${hasil.lunas} pembayaran ditandai lunas`)
      }
      return hasil
    } catch (e) {
      logger.error?.('[payment-poller] gagal:', e.message)
      return null
    } finally {
      berjalan = false
    }
  }

  timer = setInterval(jalankan, Math.max(15000, Number(intervalMs) || INTERVAL_MS_DEFAULT))
  if (timer.unref) timer.unref()
  // Putaran pertama ditunda sedikit supaya boot server tidak ikut menunggu jaringan.
  const awal = setTimeout(jalankan, 8000)
  if (awal.unref) awal.unref()

  return {
    jalankanSekarang: jalankan,
    stop: () => { berhenti = true; clearInterval(timer); clearTimeout(awal) },
  }
}

module.exports = { pollSekali, startPaymentPoller, daftarLembagaAktif, INTERVAL_MS_DEFAULT }