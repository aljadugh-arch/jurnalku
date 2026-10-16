'use strict'

// SMTP & IMAP per lembaga — klien murni Node (`net`/`tls`), TANPA paket npm.
//
// Kenapa tanpa nodemailer/nodemailer-imap: deploy produksi hanya mengirim
// `server/*.cjs` ke VPS, jadi dependensi npm baru TIDAK PERNAH sampai. Klien
// di bawah ini cukup untuk kebutuhan lembaga: kirim email lewat SMTP server
// milik lembaga (mis. smtp.google.com, smtp.zoho.com, mail.domain-lembaga.id),
// dan uji koneksi IMAP untuk membaca balasan.
//
// Konfigurasi disimpan per tenant di tabel `smtp_config` (password dienkripsi
// dengan AES-256-GCM memakai kunci turunan dari JWT_SECRET — tidak pernah
// dikembalikan utuh ke klien, hanya "sudah diisi / belum").

const net = require('node:net')
const tls = require('node:tls')
const crypto = require('node:crypto')

// ===================== ENKRIPSI PASSWORD =====================
function kunciDari(rahasia) {
  return crypto.createHash('sha256').update(String(rahasia || 'jurnalku-smtp')).digest()
}
function enkripsi(teks, rahasia) {
  if (teks === null || teks === undefined || teks === '') return ''
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', kunciDari(rahasia), iv)
  const enc = Buffer.concat([c.update(String(teks), 'utf8'), c.final()])
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join(':')
}
function dekripsi(blob, rahasia) {
  if (!blob) return ''
  try {
    const [ivb, tagb, encb] = String(blob).split(':')
    if (!ivb || !tagb || !encb) return ''
    const d = crypto.createDecipheriv('aes-256-gcm', kunciDari(rahasia), Buffer.from(ivb, 'base64'))
    d.setAuthTag(Buffer.from(tagb, 'base64'))
    return Buffer.concat([d.update(Buffer.from(encb, 'base64')), d.final()]).toString('utf8')
  } catch { return '' }
}

// ===================== TABEL =====================
function setupSmtpTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS smtp_config (
    tenant_id TEXT PRIMARY KEY,
    smtp_host TEXT DEFAULT '', smtp_port INTEGER DEFAULT 587, smtp_aman TEXT DEFAULT 'starttls',
    smtp_user TEXT DEFAULT '', smtp_pass_enc TEXT DEFAULT '', smtp_from TEXT DEFAULT '', smtp_from_nama TEXT DEFAULT '',
    imap_host TEXT DEFAULT '', imap_port INTEGER DEFAULT 993, imap_aman TEXT DEFAULT 'ssl',
    imap_user TEXT DEFAULT '', imap_pass_enc TEXT DEFAULT '',
    aktif INTEGER DEFAULT 0,
    terakhir_uji TEXT, terakhir_uji_ok INTEGER, terakhir_uji_pesan TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)
}

// ===================== KLIEN SMTP =====================
/**
 * Kirim email lewat SMTP server mana pun. Mendukung:
 *  - koneksi langsung TLS (port 465), STARTTLS (587), atau polos (25)
 *  - AUTH LOGIN (dengan dot-stuffing body sesuai RFC 5321)
 * Mengembalikan { ok, error, dialog } — dialog = transkrip perintah untuk diagnosa.
 *
 * Ditulis sebagai satu state machine dengan SATU penangan `data`; respons
 * multi-baris (EHLO) ditunggu sampai baris terakhir (kode diikuti spasi).
 */
function kirimSmtp(cfg, { to, subject, html, text, from, fromNama, replyTo }) {
  return new Promise((resolve) => {
    const dialog = []
    const host = String(cfg.host || '').trim()
    const port = Number(cfg.port) || 587
    const aman = String(cfg.aman || 'starttls').toLowerCase()
    if (!host) return resolve({ ok: false, error: 'Host SMTP belum diisi', dialog })
    if (!to) return resolve({ ok: false, error: 'Penerima kosong', dialog })

    const b64 = (s) => Buffer.from(String(s || ''), 'utf8').toString('base64')
    let sock = null, selesai = false, buffer = '', state = 'sapaan', authTahap = 0
    const selesai_ = (hasil) => { if (selesai) return; selesai = true; try { sock.destroy() } catch { } resolve({ ...hasil, dialog }) }
    const timer = setTimeout(() => selesai_({ ok: false, error: `timeout 20s menunggu ${host}:${port}` }), 20000)
    const kirim = (baris, rahasiakan) => {
      try {
        sock.write(baris + '\r\n')
        dialog.push('C: ' + (rahasiakan ? '***' : (baris.length > 60 ? baris.slice(0, 45) + '…' : baris)))
      } catch (e) { selesai_({ ok: false, error: e.message }) }
    }
    const gagal = (pesan) => { clearTimeout(timer); selesai_({ ok: false, error: pesan }) }

    const bodyPesan = () => {
      const dari = from || cfg.from || cfg.user
      const nama = fromNama || cfg.from_nama || ''
      const batas = 'jurnalku-' + crypto.randomBytes(10).toString('hex')
      const isiTeks = text || String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      const baris = [
        `From: ${nama ? `${nama} <${dari}>` : dari}`,
        `To: ${to}`,
        `Subject: ${String(subject || '').replace(/[\r\n]+/g, ' ')}`,
        'MIME-Version: 1.0',
        ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
        `Content-Type: multipart/alternative; boundary="${batas}"`,
        '', `--${batas}`, 'Content-Type: text/plain; charset=UTF-8', '', isiTeks,
        '', `--${batas}`, 'Content-Type: text/html; charset=UTF-8', '', html || `<pre>${isiTeks}</pre>`,
        '', `--${batas}--`,
      ]
      // Dot-stuffing: baris yang diawali '.' harus didahului '.' lagi.
      const isi = baris.map(b => (b.startsWith('.') ? '.' + b : b)).join('\r\n')
      try { sock.write(isi + '\r\n.\r\n'); dialog.push('C: [isi pesan dikirim]') } catch (e) { gagal(e.message) }
    }

    const mulaiAuth = () => {
      if (!cfg.user) { state = 'mail'; return kirim(`MAIL FROM:<${cfg.from || cfg.user}>`) }
      state = 'auth'; authTahap = 0; kirim('AUTH LOGIN')
    }
    const mulaiPesan = () => { state = 'mail'; kirim(`MAIL FROM:<${cfg.from || cfg.user}>`) }

    const tlsNaik = () => {
      const lama = sock
      sock = tls.connect({ socket: lama, servername: host, rejectUnauthorized: false }, () => {
        buffer = ''; state = 'ehlo2'; kirim('EHLO jurnalku.local')
      })
      sock.on('error', (e) => gagal('TLS: ' + e.message))
      sock.setEncoding('utf8')
      sock.on('data', onData)
      sock.on('close', () => { if (!selesai) gagal('koneksi ditutup setelah STARTTLS') })
    }

    const onBaris = (baris) => {
      const kode = baris.slice(0, 3)
      const akhir = baris.length <= 3 || baris[3] === ' '   // baris terakhir respons
      if (kode[0] === '5') return gagal('Server menolak: ' + baris.slice(0, 160))
      if (!akhir) return                                     // lanjutan multi-baris

      if (state === 'sapaan') {
        if (kode !== '220') return gagal('Sapaan server tidak dikenal: ' + baris.slice(0, 120))
        state = 'ehlo'; kirim('EHLO jurnalku.local')
        return
      }
      if (state === 'ehlo') {
        if (kode !== '250') return gagal('EHLO gagal: ' + baris.slice(0, 120))
        if (aman === 'starttls') { state = 'starttls'; kirim('STARTTLS') }
        else mulaiAuth()
        return
      }
      if (state === 'starttls') {
        if (kode !== '220') return gagal('STARTTLS ditolak: ' + baris.slice(0, 120))
        return tlsNaik()
      }
      if (state === 'ehlo2') {
        if (kode !== '250') return gagal('EHLO(TLS) gagal: ' + baris.slice(0, 120))
        return mulaiAuth()
      }
      if (state === 'auth') {
        if (kode === '334') {
          if (authTahap === 0) { authTahap = 1; return kirim(b64(cfg.user), true) }
          authTahap = 2; return kirim(b64(cfg.pass), true)
        }
        if (kode === '235') return mulaiPesan()
        return gagal('AUTH tidak dikenali: ' + baris.slice(0, 140))
      }
      if (state === 'mail') {
        if (kode !== '250') return gagal('MAIL FROM ditolak: ' + baris.slice(0, 140))
        state = 'rcpt'; return kirim(`RCPT TO:<${to}>`)
      }
      if (state === 'rcpt') {
        if (kode !== '250' && kode !== '251') return gagal('RCPT TO ditolak: ' + baris.slice(0, 140))
        state = 'data'; return kirim('DATA')
      }
      if (state === 'data') {
        if (kode !== '354') return gagal('DATA ditolak: ' + baris.slice(0, 140))
        state = 'selesai'; return bodyPesan()
      }
      if (state === 'selesai') {
        if (kode !== '250') return gagal('Pesan ditolak: ' + baris.slice(0, 140))
        kirim('QUIT'); clearTimeout(timer); return selesai_({ ok: true })
      }
    }

    const onData = (chunk) => {
      buffer += chunk
      let idx
      while ((idx = buffer.indexOf('\r\n')) !== -1) {
        const baris = buffer.slice(0, idx); buffer = buffer.slice(idx + 2)
        dialog.push('S: ' + baris.slice(0, 160))
        onBaris(baris)
        if (selesai) return
      }
    }

    try {
      if (aman === 'ssl') {
        sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false })
        sock.on('error', (e) => gagal('TLS: ' + e.message))
      } else {
        sock = net.connect({ host, port })
        sock.on('error', (e) => gagal(e.message))
      }
      sock.setEncoding('utf8')
      sock.on('data', onData)
      sock.on('close', () => { if (!selesai) gagal('koneksi ditutup server sebelum selesai') })
    } catch (e) { return resolve({ ok: false, error: e.message, dialog }) }
  })
}

// ===================== KLIEN IMAP (uji koneksi + LOGIN) =====================
function ujiImap(cfg) {
  return new Promise((resolve) => {
    const dialog = []
    const host = String(cfg.host || '').trim()
    const port = Number(cfg.port) || 993
    const aman = String(cfg.aman || 'ssl').toLowerCase()
    if (!host) return resolve({ ok: false, error: 'Host IMAP belum diisi', dialog })
    let sock, selesai = false, buffer = '', tag = 0
    const selesai_ = (h) => { if (selesai) return; selesai = true; try { sock.destroy() } catch { } resolve({ ...h, dialog }) }
    const timer = setTimeout(() => selesai_({ ok: false, error: `timeout 15s menunggu ${host}:${port}` }), 15000)
    const perintah = (cmd) => { tag++; const t = 'a' + tag; try { sock.write(`${t} ${cmd}\r\n`); dialog.push('C: ' + (cmd.startsWith('LOGIN') ? 'LOGIN ***' : cmd)) } catch (e) { selesai_({ ok: false, error: e.message }) } return t }

    const pasang = () => {
      sock.setEncoding('utf8')
      sock.on('data', (chunk) => {
        buffer += chunk
        let idx
        while ((idx = buffer.indexOf('\r\n')) !== -1) {
          const baris = buffer.slice(0, idx); buffer = buffer.slice(idx + 2)
          dialog.push('S: ' + baris.slice(0, 160))
          if (baris.startsWith('* OK') && !selesai) { perintah(`LOGIN "${cfg.user}" "${cfg.pass}"`); continue }
          if (/^a\d+ OK/i.test(baris)) { clearTimeout(timer); return selesai_({ ok: true }) }
          if (/^a\d+ (NO|BAD)/i.test(baris)) { clearTimeout(timer); return selesai_({ ok: false, error: 'Login IMAP ditolak: ' + baris.slice(0, 120) }) }
        }
      })
      sock.on('error', (e) => { clearTimeout(timer); selesai_({ ok: false, error: e.message }) })
      sock.on('close', () => { if (!selesai) { clearTimeout(timer); selesai_({ ok: false, error: 'koneksi IMAP ditutup sebelum selesai' }) } })
    }

    try {
      if (aman === 'ssl') sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => pasang())
      else sock = net.connect({ host, port }, () => pasang())
    } catch (e) { return resolve({ ok: false, error: e.message, dialog }) }
  })
}

// ===================== LAYANAN PER TENANT =====================
function buatLayananSmtp(db, { rahasia, logger = console } = {}) {
  setupSmtpTables(db)

  const baca = (tenantId) => {
    const r = db.prepare('SELECT * FROM smtp_config WHERE tenant_id=?').get(tenantId)
    if (!r) return null
    return {
      ...r,
      smtp_pass: undefined, imap_pass: undefined,
      smtp_pass_terisi: !!r.smtp_pass_enc,
      imap_pass_terisi: !!r.imap_pass_enc,
    }
  }

  const simpan = (tenantId, data) => {
    const lama = db.prepare('SELECT * FROM smtp_config WHERE tenant_id=?').get(tenantId)
    // Password hanya ditimpa bila dikirim non-kosong → form bisa dikirim ulang
    // tanpa mengetik ulang password.
    const smtpEnc = data.smtp_pass ? enkripsi(data.smtp_pass, rahasia) : (lama?.smtp_pass_enc || '')
    const imapEnc = data.imap_pass ? enkripsi(data.imap_pass, rahasia) : (lama?.imap_pass_enc || '')
    db.prepare(`INSERT INTO smtp_config (tenant_id,smtp_host,smtp_port,smtp_aman,smtp_user,smtp_pass_enc,smtp_from,smtp_from_nama,
        imap_host,imap_port,imap_aman,imap_user,imap_pass_enc,aktif,updated_at)
      VALUES (@tenant_id,@smtp_host,@smtp_port,@smtp_aman,@smtp_user,@smtp_pass_enc,@smtp_from,@smtp_from_nama,
        @imap_host,@imap_port,@imap_aman,@imap_user,@imap_pass_enc,@aktif,datetime('now'))
      ON CONFLICT(tenant_id) DO UPDATE SET
        smtp_host=@smtp_host, smtp_port=@smtp_port, smtp_aman=@smtp_aman, smtp_user=@smtp_user,
        smtp_pass_enc=@smtp_pass_enc, smtp_from=@smtp_from, smtp_from_nama=@smtp_from_nama,
        imap_host=@imap_host, imap_port=@imap_port, imap_aman=@imap_aman, imap_user=@imap_user,
        imap_pass_enc=@imap_pass_enc, aktif=@aktif, updated_at=datetime('now')`)
      .run({
        tenant_id: tenantId,
        smtp_host: String(data.smtp_host || '').trim(),
        smtp_port: Number(data.smtp_port) || 587,
        smtp_aman: ['ssl', 'starttls', 'none'].includes(data.smtp_aman) ? data.smtp_aman : 'starttls',
        smtp_user: String(data.smtp_user || '').trim(),
        smtp_pass_enc: smtpEnc,
        smtp_from: String(data.smtp_from || '').trim(),
        smtp_from_nama: String(data.smtp_from_nama || '').trim(),
        imap_host: String(data.imap_host || '').trim(),
        imap_port: Number(data.imap_port) || 993,
        imap_aman: ['ssl', 'starttls', 'none'].includes(data.imap_aman) ? data.imap_aman : 'ssl',
        imap_user: String(data.imap_user || '').trim(),
        imap_pass_enc: imapEnc,
        aktif: data.aktif ? 1 : 0,
      })
    return baca(tenantId)
  }

  const catatUji = (tenantId, ok, pesan) => {
    try { db.prepare("UPDATE smtp_config SET terakhir_uji=datetime('now'), terakhir_uji_ok=?, terakhir_uji_pesan=? WHERE tenant_id=?").run(ok ? 1 : 0, String(pesan || '').slice(0, 300), tenantId) } catch { }
  }

  async function ujiSmtp(tenantId, { to } = {}) {
    const cfg = db.prepare('SELECT * FROM smtp_config WHERE tenant_id=?').get(tenantId)
    if (!cfg || !cfg.smtp_host) return { ok: false, error: 'SMTP belum dikonfigurasi' }
    const hasil = await kirimSmtp({
      host: cfg.smtp_host, port: cfg.smtp_port, aman: cfg.smtp_aman,
      user: cfg.smtp_user, pass: dekripsi(cfg.smtp_pass_enc, rahasia),
      from: cfg.smtp_from || cfg.smtp_user, from_nama: cfg.smtp_from_nama,
    }, {
      to: to || cfg.smtp_from || cfg.smtp_user,
      subject: 'Uji konfigurasi SMTP Jurnalku',
      html: `<p>Konfigurasi SMTP lembaga Anda berhasil dihubungi pada ${new Date().toISOString()}.</p>`,
    })
    catatUji(tenantId, hasil.ok, hasil.ok ? 'OK' : hasil.error)
    return hasil
  }

  async function ujiImapKoneksi(tenantId) {
    const cfg = db.prepare('SELECT * FROM smtp_config WHERE tenant_id=?').get(tenantId)
    if (!cfg || !cfg.imap_host) return { ok: false, error: 'IMAP belum dikonfigurasi' }
    const hasil = await ujiImap({
      host: cfg.imap_host, port: cfg.imap_port, aman: cfg.imap_aman,
      user: cfg.imap_user, pass: dekripsi(cfg.imap_pass_enc, rahasia),
    })
    catatUji(tenantId, hasil.ok, hasil.ok ? 'IMAP OK' : hasil.error)
    return hasil
  }

  /**
   * Kirim email memakai SMTP lembaga bila aktif; kalau tidak, jatuh ke MTA
   * sistem (mailer.cjs). `fallback` disuntikkan pemanggil agar tidak ada
   * ketergantungan melingkar.
   */
  async function kirim(tenantId, pesan, fallback) {
    const cfg = db.prepare('SELECT * FROM smtp_config WHERE tenant_id=?').get(tenantId)
    if (cfg && cfg.aktif && cfg.smtp_host) {
      const hasil = await kirimSmtp({
        host: cfg.smtp_host, port: cfg.smtp_port, aman: cfg.smtp_aman,
        user: cfg.smtp_user, pass: dekripsi(cfg.smtp_pass_enc, rahasia),
        from: cfg.smtp_from || cfg.smtp_user, from_nama: cfg.smtp_from_nama,
      }, pesan)
      if (hasil.ok) return { ...hasil, via: 'smtp-lembaga' }
      logger.warn?.(`[smtp] tenant ${tenantId} gagal, jatuh ke MTA sistem: ${hasil.error}`)
      if (fallback) { const f = await fallback(pesan); return { ...f, via: 'mta-sistem', smtp_error: hasil.error } }
      return { ...hasil, via: 'smtp-lembaga' }
    }
    if (fallback) { const f = await fallback(pesan); return { ...f, via: 'mta-sistem' } }
    return { ok: false, error: 'Tidak ada SMTP lembaga dan tidak ada MTA sistem', via: 'tidak-ada' }
  }

  return { baca, simpan, ujiSmtp, ujiImapKoneksi, kirim, setupSmtpTables }
}

module.exports = { buatLayananSmtp, setupSmtpTables, kirimSmtp, ujiImap, enkripsi, dekripsi }
