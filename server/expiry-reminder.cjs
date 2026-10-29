'use strict'

// Pengingat masa aktif paket (trial/langganan) yang hampir berakhir.
//
// Berjalan sebagai scheduler harian: setiap lembaga aktif yang sisa masa
// aktifnya tinggal <= REMINDER_DAYS hari mendapat satu pengingat WA + email,
// lalu dicatat di expiry_reminder_log supaya tidak terkirim dua kali untuk
// tanggal berakhir yang sama.
//
// Tidak pernah melempar: satu lembaga gagal tidak menghentikan lembaga lain.

const { enqueue } = require('./wa-queue.cjs')
const { kirimEmail } = require('./mailer.cjs')
const { getTenantSettings } = require('./tenant-settings.cjs')
const { formatTanggalId, waLink } = require('./register-notify.cjs')
const { getReminderDays } = require('./platform-settings.cjs')

/** URL aplikasi tenant: domain sendiri (aktif) atau subdomain slug.base_domain. */
function urlTenant(t) {
  if (t.domain_custom && t.domain_status === 'active') return `https://${t.domain_custom}`
  const base = t.base_domain || process.env.BASE_DOMAIN || 'jurnal.cc.cd'
  return `https://${t.slug}.${base}`
}

/** Label paket untuk pesan (mis. "Paket Trial (Masa Uji Coba)", "Paket Lite"). */
function planLabelId(plan, label) {
  if (plan === 'trial') return 'Paket Trial (Masa Uji Coba)'
  return `Paket ${label || plan}`
}

/** Frasa masa: "Masa uji coba" untuk trial, "Masa aktif" untuk paket berbayar. */
function frasaMasa(plan) {
  return plan === 'trial' ? 'Masa uji coba' : 'Masa aktif paket'
}

function pesanWaPengingat(d) {
  const baris = [
    `*⏳ PENGINGAT MASA AKTIF PAKET*`,
    '',
    `Halo ${d.namaAdmin}, assalamualaikum,`,
    `${d.frasaMasa} ${d.namaLembaga} akan berakhir dalam ${d.nHari} hari. Segera lakukan perpanjangan agar layanan tidak terhenti.`,
    '',
    `🏫 *Madrasah* : ${d.namaLembaga}`,
    `📦 *Paket* : ${d.planLabel}`,
    `📅 *Berakhir pada* : ${d.tanggal}`,
    `⏳ *Sisa waktu* : tinggal ${d.nHari} hari`,
    '',
    'Perpanjang paket di sini:',
    `${d.url}/admin/tenants`,
  ]
  if (d.supportPhone || d.supportEmail) {
    baris.push('')
    baris.push('Untuk bantuan, hubungi Super Admin:')
    if (d.supportPhone) baris.push(`📞 ${d.supportPhone}${d.supportWa ? ` (${d.supportWa})` : ''}`)
    if (d.supportEmail) baris.push(`✉️ ${d.supportEmail}`)
  }
  baris.push('')
  baris.push('_Jika sudah membayar, mohon abaikan pesan ini._')
  return baris.join('\n')
}

function htmlEmailPengingat(d) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const row = (label, val) => val ? `<tr><td style="padding:6px 0;color:#64748b">${label}</td><td style="padding:6px 0;font-weight:600">${esc(val)}</td></tr>` : ''
  const bantuan = (d.supportPhone || d.supportEmail)
    ? `<p style="margin:16px 0 0;font-size:13px;color:#64748b">Untuk bantuan, hubungi Super Admin:</p>
       ${d.supportPhone ? `<p style="margin:2px 0;font-size:13px">📞 ${esc(d.supportPhone)}${d.supportWa ? ` (<a href="${esc(d.supportWa)}" style="color:#1e40af">${esc(d.supportWa)}</a>)` : ''}</p>` : ''}
       ${d.supportEmail ? `<p style="margin:2px 0;font-size:13px">✉️ ${esc(d.supportEmail)}</p>` : ''}`
    : ''
  return `<!DOCTYPE html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#b45309;color:#fff;padding:20px 24px">
      <div style="font-size:19px;font-weight:700">⏳ Pengingat Masa Aktif Paket</div>
      <div style="font-size:13px;opacity:.85;margin-top:4px">Segera perpanjang agar layanan tidak terhenti</div>
    </div>
    <div style="padding:22px 24px;color:#0f172a;font-size:14px;line-height:1.6">
      <p style="margin:0 0 14px">Halo <b>${esc(d.namaAdmin)}</b>, assalamualaikum. ${esc(d.frasaMasa)} <b>${esc(d.namaLembaga)}</b> akan berakhir dalam <b>${d.nHari} hari</b>.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
        ${row('Madrasah', d.namaLembaga)}
        ${row('Paket', d.planLabel)}
        ${row('Berakhir pada', d.tanggal)}
        ${row('Sisa waktu', `tinggal ${d.nHari} hari`)}
      </table>
      <p style="margin:0 0 8px;font-size:13px">Perpanjang paket di sini:</p>
      <p style="margin:0 0 16px"><a href="${esc(`${d.url}/admin/tenants`)}" style="color:#1e40af;font-weight:600">${esc(`${d.url}/admin/tenants`)}</a></p>
      ${bantuan}
      <p style="margin:16px 0 0;padding:12px;background:#f8fafc;border-radius:8px;font-size:12px;color:#64748b">Jika sudah membayar, mohon abaikan pesan ini.</p>
    </div>
  </div></body></html>`
}

/** Cari tenant pengirim WA aktif (platform didahulukan). */
function tenantPengirimWa(db) {
  try {
    const kandidat = db.prepare(`
      SELECT s.tenant_id FROM wa_sessions s
      JOIN wa_gateway_config g ON g.tenant_id = s.tenant_id AND g.enabled = 1
      WHERE s.status = 'connected'
      ORDER BY CASE WHEN s.tenant_id = 'default' THEN 0 ELSE 1 END, s.updated_at DESC
      LIMIT 1`).get()
    if (kandidat) return kandidat.tenant_id
    return db.prepare('SELECT tenant_id FROM wa_gateway_config WHERE enabled=1 LIMIT 1').get()?.tenant_id || null
  } catch { return null }
}

async function kirimPengingatTenant(db, tenant, nHari, opts) {
  const admin = db.prepare("SELECT nama, email FROM users WHERE tenant_id=? AND role='admin' ORDER BY created_at ASC LIMIT 1").get(tenant.id)
  const settings = getTenantSettings(db, tenant.id)
  const phone = settings?.telepon || ''
  const label = db.prepare('SELECT label FROM subscription_plans WHERE plan=?').get(tenant.plan)?.label || tenant.plan
  const d = {
    namaLembaga: tenant.nama,
    namaAdmin: admin?.nama || 'Admin',
    email: admin?.email,
    phone,
    url: urlTenant(tenant),
    nHari,
    planLabel: planLabelId(tenant.plan, label),
    frasaMasa: frasaMasa(tenant.plan),
    tanggal: formatTanggalId(tenant.subscription_ends_at || tenant.trial_ends_at || tenant.expired_at),
    supportPhone: opts.supportPhone || '',
    supportEmail: opts.supportEmail || '',
    supportWa: (opts.supportPhone || '') ? waLink(opts.supportPhone) : '',
  }

  const hasil = { wa: { ok: false, reason: '' }, email: { ok: false, error: '' } }
  const pengirim = tenantPengirimWa(db)
  if (!pengirim) {
    hasil.wa = { ok: false, reason: 'tidak ada sesi WA aktif' }
  } else if (!d.phone) {
    hasil.wa = { ok: false, reason: 'nomor WA lembaga kosong' }
  } else {
    try {
      const r = enqueue(db, {
        tenantId: pengirim,
        phone: d.phone,
        message: pesanWaPengingat(d),
        key: `expiry:${tenant.id}:${d.tanggal}`,
        targetType: 'masa-aktif',
        targetId: tenant.id,
      })
      hasil.wa = r.queued ? { ok: true } : r.reason === 'duplicate' ? { ok: true, reason: 'sudah diantrekan' } : { ok: false, reason: r.reason || 'gagal antre' }
    } catch (e) { hasil.wa = { ok: false, reason: e.message } }
  }

  if (d.email) {
    try {
      const r = await kirimEmail({ to: d.email, subject: `Pengingat: ${d.frasaMasa} ${d.namaLembaga} berakhir dalam ${nHari} hari`, html: htmlEmailPengingat(d), headers: { 'X-Jurnalku-Event': 'masa-aktif' } })
      hasil.email = r.ok ? { ok: true } : { ok: false, error: r.error }
    } catch (e) { hasil.email = { ok: false, error: e.message } }
  }

  return hasil
}

function setupExpiryReminderLog(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS expiry_reminder_log (
    tenant_id TEXT NOT NULL,
    target_date TEXT NOT NULL,
    sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, target_date)
  )`)
}

/**
 * Jalankan satu putaran pengingat. Mengembalikan ringkasan {terkirim, dilewati}.
 * Aman dipanggil berulang (mis. saat restart) karena tabel log mencegah duplikat.
 */
async function jalankanPengingat(db, opts = {}) {
  setupExpiryReminderLog(db)
  // Hari pengingat dari DB (dashboard superadmin) > env EXPIRY_REMINDER_DAYS > 3.
  const reminderDays = getReminderDays(db, Number(opts.reminderDays) > 0 ? Number(opts.reminderDays) : 3)
  const nowMs = Date.now()
  const tenants = db.prepare(`
    SELECT id, nama, slug, base_domain, domain_custom, domain_status, plan,
           trial_ends_at, subscription_ends_at, expired_at
    FROM tenants WHERE id != 'default' AND aktif = 1`).all()

  let terkirim = 0
  let dilewati = 0
  for (const t of tenants) {
    const expiresAt = t.plan === 'premium'
      ? (t.subscription_ends_at || null)
      : (t.subscription_ends_at || t.trial_ends_at || t.expired_at || null)
    if (!expiresAt) { dilewati++; continue }
    const expiryMs = new Date(expiresAt).getTime()
    if (Number.isNaN(expiryMs)) { dilewati++; continue }
    const daysLeft = Math.ceil((expiryMs - nowMs) / 86400000)
    if (daysLeft < 1 || daysLeft > reminderDays) { dilewati++; continue }

    const targetDate = String(expiresAt).slice(0, 10)
    if (db.prepare('SELECT 1 FROM expiry_reminder_log WHERE tenant_id=? AND target_date=?').get(t.id, targetDate)) {
      dilewati++
      continue
    }
    try {
      await kirimPengingatTenant(db, t, daysLeft, opts)
      db.prepare('INSERT OR IGNORE INTO expiry_reminder_log (tenant_id, target_date) VALUES (?,?)').run(t.id, targetDate)
      terkirim++
    } catch (e) {
      console.error(`[expiry-reminder] gagal ${t.id}:`, e.message)
      dilewati++
    }
  }
  return { terkirim, dilewati }
}

/**
 * Mulai scheduler harian. Menjalankan satu putaran segera, lalu tiap 24 jam.
 * `db` harus sudah siap (tabel ter-migrasi).
 */
function mulaiPengingat(db, opts = {}) {
  const jam = Number(opts.intervalMs) > 0 ? Number(opts.intervalMs) : 24 * 60 * 60 * 1000
  const jalankan = () => {
    jalankanPengingat(db, opts)
      .then(r => { if (r.terkirim) console.log(`[expiry-reminder] ${r.terkirim} pengingat terkirim, ${r.dilewati} dilewati`) })
      .catch(e => console.error('[expiry-reminder] galat putaran:', e.message))
  }
  jalankan()
  return setInterval(jalankan, jam)
}

module.exports = {
  jalankanPengingat, mulaiPengingat, kirimPengingatTenant,
  pesanWaPengingat, htmlEmailPengingat, urlTenant, planLabelId,
}
