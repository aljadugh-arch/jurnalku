'use strict'

// Notifikasi pendaftaran lembaga baru — WA + email.
//
// Dua kanal, satu sumber isi:
//   - WhatsApp  : lewat antrean `wa_queue` (worker jurnalku-wa mengirim dari
//                 nomor lembaga/platform).
//   - Email     : lewat `server/mailer.cjs` (sendmail/Postfix sistem) atau
//                 SMTP lembaga bila diaktifkan.
//
// Isi pesan mengikuti template yang diminta: ringkasan akun lengkap (madrasah,
// alamat/login, nama admin, email, no WA, password, paket, aktif-sampai, langkah
// selanjutnya, kontak bantuan) + peringatan keamanan.
//
// Prinsip: notifikasi TIDAK PERNAH menggagalkan registrasi. Semua galat
// ditangkap dan dikembalikan sebagai status, bukan dilempar.

const { enqueue } = require('./wa-queue.cjs')
const { kirimEmail } = require('./mailer.cjs')

const NAMA_BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

/** "2026-10-30 12:34:56" -> "30 Oktober 2026". Kosong/tak valid -> ''. */
function formatTanggalId(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
  if (!mo || mo > 12 || !d || d > 31) return ''
  return `${d} ${NAMA_BULAN_ID[mo - 1]} ${y}`
}

/** Nomor WA -> tautan wa.me (628...). Kosong bila tidak valid. */
function waLink(phone) {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.startsWith('0')) return `https://wa.me/62${d.slice(1)}`
  if (d.startsWith('8')) return `https://wa.me/62${d}`
  if (d.startsWith('62')) return `https://wa.me/${d}`
  return ''
}

/** Teks WA — gaya pesan ringkas (bintang, baris pendek, emoji). */
function pesanWaRegistrasi(data) {
  const baris = [
    `*PENDAFTARAN BERHASIL* ✅`,
    '',
    `Assalamualaikum ${data.namaAdmin},`,
    `Terima kasih telah mendaftar di *${data.appName}*. Berikut ringkasan akun Anda:`,
    '',
    `🏫 *Madrasah* : ${data.namaLembaga}`,
    `🌐 *Alamat Aplikasi* : ${data.url}`,
    `🔑 *Halaman Login* : ${data.loginUrl}`,
    '',
    `👤 *Nama Admin* : ${data.namaAdmin}`,
    `📧 *Email Login* : ${data.email}`,
  ]
  if (data.noHp) baris.push(`📱 *No. WhatsApp* : ${data.noHp}`)
  if (data.password) baris.push(`🔐 *Password* : ${data.password}`)
  baris.push('')
  baris.push(`📦 *Paket* : ${data.planLabel}`)
  if (data.aktifSampai) baris.push(`⏳ *Aktif sampai* : ${data.aktifSampai}`)
  if (data.domainCustom && data.domainStatus === 'pending') {
    baris.push('')
    baris.push(`🌐 *Domain sendiri* : ${data.domainCustom}`)
    baris.push('_Status: menunggu DNS — sementara pakai alamat aplikasi di atas, lalu arahkan DNS domain Anda ke server ini._')
  }
  baris.push('')
  baris.push('*Langkah selanjutnya:*')
  baris.push('1. Buka alamat login di atas, masuk dengan email & password.')
  baris.push('2. Lengkapi profil madrasah dan tahun ajaran.')
  baris.push('3. Input data guru, kelas, dan siswa.')
  if (data.supportPhone || data.supportEmail) {
    baris.push('')
    baris.push('Butuh bantuan? Hubungi Super Admin:')
    if (data.supportPhone) baris.push(`📞 ${data.supportPhone}${data.supportWa ? ` (${data.supportWa})` : ''}`)
    if (data.supportEmail) baris.push(`✉️ ${data.supportEmail}`)
  }
  baris.push('')
  baris.push('⚠️ _Demi keamanan, simpan password di tempat aman lalu hapus pesan ini, dan segera ubah password lewat menu profil._')
  return baris.join('\n')
}

/** HTML email — tabel sederhana agar tampil rapi di klien email. */
function htmlEmailRegistrasi(data) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const row = (label, val) => val ? `<tr><td style="padding:6px 0;color:#64748b">${label}</td><td style="padding:6px 0;font-weight:600">${esc(val)}</td></tr>` : ''
  const bantuan = (data.supportPhone || data.supportEmail)
    ? `<p style="margin:16px 0 0;font-size:13px;color:#64748b">Butuh bantuan? Hubungi Super Admin:</p>
       ${data.supportPhone ? `<p style="margin:2px 0;font-size:13px">📞 ${esc(data.supportPhone)}${data.supportWa ? ` (<a href="${esc(data.supportWa)}" style="color:#1e40af">${esc(data.supportWa)}</a>)` : ''}</p>` : ''}
       ${data.supportEmail ? `<p style="margin:2px 0;font-size:13px">✉️ ${esc(data.supportEmail)}</p>` : ''}`
    : ''
  return `<!DOCTYPE html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#1e40af;color:#fff;padding:20px 24px">
      <div style="font-size:19px;font-weight:700">Pendaftaran Berhasil ✅</div>
      <div style="font-size:13px;opacity:.85;margin-top:4px">${esc(data.appName)} — SIMS/M Terpadu</div>
    </div>
    <div style="padding:22px 24px;color:#0f172a;font-size:14px;line-height:1.6">
      <p style="margin:0 0 14px">Assalamualaikum <b>${esc(data.namaAdmin)}</b>, terima kasih telah mendaftar di <b>${esc(data.appName)}</b>.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
        ${row('Madrasah', data.namaLembaga)}
        ${row('Alamat Aplikasi', data.url)}
        ${row('Halaman Login', data.loginUrl)}
        ${row('Nama Admin', data.namaAdmin)}
        ${row('Email Login', data.email)}
        ${row('No. WhatsApp', data.noHp)}
        ${row('Password', data.password)}
        ${row('Paket', data.planLabel)}
        ${row('Aktif sampai', data.aktifSampai)}
      </table>
      <p style="margin:0 0 6px;font-size:13px;color:#64748b">Langkah selanjutnya:</p>
      <ol style="margin:0 0 16px;padding-left:18px;font-size:13px;color:#0f172a">
        <li>Buka alamat login di atas, masuk dengan email &amp; password.</li>
        <li>Lengkapi profil madrasah dan tahun ajaran.</li>
        <li>Input data guru, kelas, dan siswa.</li>
      </ol>
      ${bantuan}
      <p style="margin:16px 0 0;padding:12px;background:#fef3c7;border-radius:8px;font-size:12px;color:#92400e">⚠️ Demi keamanan, simpan password di tempat aman lalu hapus email ini, dan segera ubah password lewat menu profil.</p>
      <p style="margin:14px 0 0;font-size:12px;color:#94a3b8">Email ini dikirim otomatis. Simpan sebagai bukti pendaftaran.</p>
    </div>
  </div></body></html>`
}

/**
 * Kirim notifikasi pendaftaran ke WA + email pendaftar.
 * Selalu mengembalikan objek status; tidak pernah melempar.
 */
async function notifikasiRegistrasi(db, {
  tenantId, namaLembaga, namaAdmin, email, noHp = '', password = '',
  url = '', loginUrl = '', slug = '', domainCustom = null, domainStatus = null,
  planLabel = '', aktifSampai = '',
  supportPhone = '', supportEmail = '',
  appName = 'Jurnalku', smtp = null,
} = {}) {
  const hasil = { wa: { ok: false, reason: '' }, email: { ok: false, error: '' } }
  const supportWa = supportPhone ? waLink(supportPhone) : ''
  const data = { namaLembaga, namaAdmin, email, noHp, password, url, loginUrl, slug, domainCustom, domainStatus, planLabel, aktifSampai, supportPhone, supportEmail, supportWa, appName }

  // --- WhatsApp ---
  // Antre lewat tenant yang PUNYA sesi WA aktif (platform didahulukan), bukan
  // tenant baru — worker hanya memproses tenant dengan wa_gateway_config.enabled.
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
  const pesanEmail = {
    to: email,
    subject: `Pendaftaran ${appName} Berhasil — ${namaLembaga}`,
    html: htmlEmailRegistrasi(data),
    headers: { 'X-Jurnalku-Event': 'register' },
  }
  try {
    let r
    if (smtp && tenantId) r = await smtp.kirim(tenantId, pesanEmail, (p) => kirimEmail(p))
    else r = await kirimEmail(pesanEmail)
    hasil.email = r.ok
      ? { ok: true, error: '', via: r.via || 'mta-sistem' }
      : { ok: false, error: r.error, via: r.via || 'mta-sistem' }
  } catch (e) {
    hasil.email = { ok: false, error: e.message }
  }

  return hasil
}

module.exports = { notifikasiRegistrasi, pesanWaRegistrasi, htmlEmailRegistrasi, formatTanggalId, waLink }
