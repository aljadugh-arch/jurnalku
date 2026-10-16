'use strict'

// Notifikasi pendaftaran lembaga baru.
//
// Dua kanal, satu sumber isi:
//   - WhatsApp  : lewat antrean `wa_queue` yang sudah ada (worker jurnalku-wa
//                 mengirim dari nomor lembaga/platform). Nomor pendaftar dipakai
//                 apa adanya; kalau normalizePhone menolak (nomor tak valid),
//                 WA dilewati dengan alasan yang jelas.
//   - Email     : lewat `server/mailer.cjs` (sendmail/Postfix sistem).
//
// Prinsip: notifikasi TIDAK PERNAH menggagalkan registrasi. Semua galat
// ditangkap dan dikembalikan sebagai status, bukan dilempar.

const { enqueue } = require('./wa-queue.cjs')
const { kirimEmail } = require('./mailer.cjs')

/** Teks WA ringkas — gaya pesan aplikasi lain (bintang, baris pendek). */
function pesanWaRegistrasi({ namaLembaga, namaAdmin, email, url, slug, domainCustom, domainStatus }) {
  const baris = [
    `*Pendaftaran Jurnalku Berhasil*`,
    '',
    `Lembaga: ${namaLembaga}`,
    `Admin: ${namaAdmin}`,
    `Email: ${email}`,
  ]
  if (domainCustom) {
    baris.push(`Domain: ${domainCustom}`)
    baris.push(domainStatus === 'active'
      ? 'Status domain: AKTIF ✅'
      : 'Status domain: menunggu DNS (buat record A ke server, lalu Verifikasi di Pengaturan Domain)')
  } else if (slug) {
    baris.push(`Alamat: ${url || `https://${slug}.jurnal.cc.cd`}`)
  }
  baris.push('')
  baris.push('Masa uji coba 1 bulan sudah aktif. Simpan pesan ini sebagai bukti pendaftaran.')
  return baris.join('\n')
}

/** HTML email — tabel sederhana agar tampil rapi di klien email. */
function htmlEmailRegistrasi({ namaLembaga, namaAdmin, email, url, slug, domainCustom, domainStatus }) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const barisDomain = domainCustom
    ? `<tr><td style="padding:6px 0;color:#64748b">Domain</td><td style="padding:6px 0;font-weight:600">${esc(domainCustom)}</td></tr>
       <tr><td style="padding:6px 0;color:#64748b">Status domain</td><td style="padding:6px 0;font-weight:600">${domainStatus === 'active' ? 'Aktif' : 'Menunggu DNS'}</td></tr>`
    : slug
      ? `<tr><td style="padding:6px 0;color:#64748b">Alamat</td><td style="padding:6px 0;font-weight:600">${esc(url || `https://${slug}.jurnal.cc.cd`)}</td></tr>`
      : ''
  return `<!DOCTYPE html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#1e40af;color:#fff;padding:20px 24px">
      <div style="font-size:19px;font-weight:700">Pendaftaran Berhasil</div>
      <div style="font-size:13px;opacity:.85;margin-top:4px">Jurnalku — SIMS/M Terpadu</div>
    </div>
    <div style="padding:22px 24px;color:#0f172a;font-size:14px;line-height:1.6">
      <p style="margin:0 0 14px">Halo <b>${esc(namaAdmin)}</b>, lembaga <b>${esc(namaLembaga)}</b> berhasil terdaftar.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
        <tr><td style="padding:6px 0;color:#64748b">Lembaga</td><td style="padding:6px 0;font-weight:600">${esc(namaLembaga)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Admin</td><td style="padding:6px 0;font-weight:600">${esc(namaAdmin)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Email</td><td style="padding:6px 0;font-weight:600">${esc(email)}</td></tr>
        ${barisDomain}
      </table>
      <p style="margin:0 0 6px;color:#64748b;font-size:12px">Masa uji coba 1 bulan sudah aktif sejak pendaftaran.</p>
      <p style="margin:14px 0 0;font-size:12px;color:#94a3b8">Email ini dikirim otomatis. Simpan sebagai bukti pendaftaran.</p>
    </div>
  </div></body></html>`
}

/**
 * Kirim notifikasi pendaftaran ke WA + email pendaftar.
 * Selalu mengembalikan objek status; tidak pernah melempar.
 */
async function notifikasiRegistrasi(db, {
  tenantId, namaLembaga, namaAdmin, email, noHp,
  url = '', slug = '', domainCustom = null, domainStatus = null,
  appName = 'Jurnalku',
} = {}) {
  const hasil = { wa: { ok: false, reason: '' }, email: { ok: false, error: '' } }
  const data = { namaLembaga, namaAdmin, email, url, slug, domainCustom, domainStatus }

  // --- WhatsApp ---
  // PENTING: antrekan lewat tenant yang PUNYA sesi WA aktif, bukan tenant baru.
  // Worker (wa-worker.mjs) hanya memproses antrean untuk tenant dengan baris
  // `wa_gateway_config.enabled=1`; tenant yang baru mendaftar belum punya itu,
  // jadi pesan akan menggantung selamanya bila diantrekan atas namanya.
  // Kita pilih tenant yang sesinya 'connected' (platform didahulukan), dan
  // pemberitahuannya menyebut lembaga baru sebagai isi pesan — bukan pengirim.
  let tenantPengirim = null
  try {
    const kandidat = db.prepare(`
      SELECT s.tenant_id FROM wa_sessions s
      JOIN wa_gateway_config g ON g.tenant_id = s.tenant_id AND g.enabled = 1
      WHERE s.status = 'connected'
      ORDER BY CASE WHEN s.tenant_id = 'default' THEN 0 ELSE 1 END, s.updated_at DESC
      LIMIT 1`).get()
    if (kandidat) tenantPengirim = kandidat.tenant_id
    else {
      const mana = db.prepare("SELECT tenant_id FROM wa_gateway_config WHERE enabled=1 LIMIT 1").get()
      tenantPengirim = mana?.tenant_id || null
    }
  } catch { tenantPengirim = null }

  if (!tenantPengirim) {
    hasil.wa = { ok: false, reason: 'tidak ada sesi WhatsApp aktif yang bisa mengirim (hubungkan WA platform dulu)' }
  } else {
    try {
      const pesan = pesanWaRegistrasi(data)
      const r = enqueue(db, {
        tenantId: tenantPengirim,
        phone: noHp,
        message: pesan,
        key: `register:${tenantId || email}`,
        targetType: 'registrasi',
        targetId: tenantId || email,
      })
      if (r.queued) hasil.wa = { ok: true, reason: `diantrekan via ${tenantPengirim}` }
      else if (r.reason === 'duplicate') hasil.wa = { ok: true, reason: 'sudah pernah diantrekan' }
      else if (r.reason === 'whitelisted') hasil.wa = { ok: true, reason: 'nomor di-whitelist (tidak dikirim)' }
      else hasil.wa = { ok: false, reason: 'nomor WA tidak valid atau kosong' }
    } catch (e) {
      hasil.wa = { ok: false, reason: `galat antrean WA: ${e.message}` }
    }
  }

  // --- Email ---
  try {
    const r = await kirimEmail({
      to: email,
      subject: `Pendaftaran ${appName} Berhasil — ${namaLembaga}`,
      html: htmlEmailRegistrasi(data),
      headers: { 'X-Jurnalku-Event': 'register' },
    })
    hasil.email = r.ok ? { ok: true, error: '' } : { ok: false, error: r.error }
  } catch (e) {
    hasil.email = { ok: false, error: e.message }
  }

  return hasil
}

module.exports = { notifikasiRegistrasi, pesanWaRegistrasi, htmlEmailRegistrasi }
