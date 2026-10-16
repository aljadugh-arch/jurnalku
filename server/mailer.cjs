'use strict'

// Pengirim email sederhana memakai MTA sistem (`/usr/sbin/sendmail`, Postfix).
//
// Kenapa bukan nodemailer: deploy produksi hanya mengirim `server/*.cjs`, jadi
// dependensi npm baru TIDAK akan pernah sampai ke VPS. Postfix sudah aktif di
// server ini dan menyediakan `sendmail`, jadi kita pakai itu — tanpa paket baru.
//
// Konfigurasi opsional lewat environment (tanpa ubah kode):
//   MAIL_FROM        alamat pengirim (default: no-reply@<domain>)
//   MAIL_REPLY_TO    alamat balasan (opsional)
//   MAIL_DISABLED=1  matikan pengiriman email (mis. saat uji)
//
// CATATAN DELIVERABILITY (jujur): pengiriman langsung dari VPS tanpa SPF/DKIM/PTR
// berpeluang masuk folder spam. Untuk produksi serius, arahkan Postfix ke relay
// SMTP (mis. `relayhost = [smtp.provider]:587` + `smtp_sasl_*`) atau isi
// MAIL_FROM dengan domain yang sudah punya SPF/DKIM. Kode ini tidak berubah
// saat relay dipasang.

const { execFile } = require('node:child_process')

const SENDMAIL = process.env.MAIL_SENDMAIL_PATH || '/usr/sbin/sendmail'
const MAIL_FROM = String(process.env.MAIL_FROM || '').trim()

/** Header MIME tidak boleh memuat CR/LF mentah (cegah header injection). */
function bersihHeader(nilai) {
  return String(nilai ?? '').replace(/[\r\n]+/g, ' ').trim()
}

function alamatAman(alamat) {
  const a = bersihHeader(alamat)
  if (!a) return ''
  // Terima `Nama <email@domain>` atau `email@domain` saja.
  const cocok = a.match(/<([^>]+)>/)
  const email = (cocok ? cocok[1] : a).trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ''
  return a
}

/** Bungkus body agar baris panjang tidak dirusak MTA dan baris titik dinetralkan. */
function bungkusBody(body) {
  return String(body || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(baris => (baris.startsWith('.') ? '.' + baris : baris))
    .join('\r\n')
}

function bangunPesan({ to, subject, html, text, from, replyTo, headers = {} }) {
  const pengirim = alamatAman(from || MAIL_FROM || 'no-reply@jurnal.cc.cd')
  const penerima = alamatAman(to)
  if (!pengirim) throw new Error('Alamat pengirim email tidak valid')
  if (!penerima) throw new Error('Alamat penerima email tidak valid')

  const batas = 'jurnalku-' + require('node:crypto').randomBytes(12).toString('hex')
  const isiTeks = text || String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  const baris = [
    `From: ${pengirim}`,
    `To: ${penerima}`,
    `Subject: ${bersihHeader(subject)}`,
    'MIME-Version: 1.0',
  ]
  const balas = alamatAman(replyTo)
  if (balas) baris.push(`Reply-To: ${balas}`)
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined || v === null || v === '') continue
    baris.push(`${bersihHeader(k)}: ${bersihHeader(v)}`)
  }
  baris.push(`Content-Type: multipart/alternative; boundary="${batas}"`)
  baris.push('')
  baris.push(`--${batas}`)
  baris.push('Content-Type: text/plain; charset=UTF-8')
  baris.push('Content-Transfer-Encoding: 8bit')
  baris.push('')
  baris.push(bungkusBody(isiTeks))
  baris.push('')
  baris.push(`--${batas}`)
  baris.push('Content-Type: text/html; charset=UTF-8')
  baris.push('Content-Transfer-Encoding: 8bit')
  baris.push('')
  baris.push(bungkusBody(html || `<pre>${isiTeks}</pre>`))
  baris.push('')
  baris.push(`--${batas}--`)
  baris.push('')
  return baris.join('\r\n')
}

/**
 * Kirim satu email. Mengembalikan { ok, error } — TIDAK melempar, supaya
 * pemanggil (mis. route registrasi) tidak pernah gagal hanya karena email.
 */
async function kirimEmail({ to, subject, html, text, from, replyTo, headers } = {}) {
  if (process.env.MAIL_DISABLED === '1') return { ok: false, error: 'email dimatikan (MAIL_DISABLED=1)' }
  let pesan
  try {
    pesan = bangunPesan({ to, subject, html, text, from, replyTo, headers })
  } catch (e) {
    return { ok: false, error: e.message }
  }

  return new Promise(resolve => {
    let anak
    try {
      // `-f` menetapkan envelope sender. Tanpa ini Postfix memakai
      // root@<hostname-lokal> sebagai pengirim, yang hampir pasti ditolak/tak
      // dipercaya penerima. `-t` membaca daftar penerima dari header To/Cc/Bcc.
      const pengirimEnvelope = (alamatAman(from || MAIL_FROM || 'no-reply@jurnal.cc.cd').match(/<([^>]+)>/)?.[1])
        || alamatAman(from || MAIL_FROM || 'no-reply@jurnal.cc.cd')
        || 'no-reply@jurnal.cc.cd'
      const args = ['-t', '-i', '-f', pengirimEnvelope]
      anak = execFile(SENDMAIL, args, { timeout: 15000 }, (err, _stdout, stderr) => {
        if (err) return resolve({ ok: false, error: (stderr || err.message || 'sendmail gagal').toString().slice(0, 300) })
        resolve({ ok: true })
      })
    } catch (e) {
      return resolve({ ok: false, error: `sendmail tidak bisa dijalankan: ${e.message}` })
    }
    anak.on('error', e => resolve({ ok: false, error: `sendmail error: ${e.message}` }))
    try {
      anak.stdin.write(pesan)
      anak.stdin.end()
    } catch (e) {
      resolve({ ok: false, error: `gagal menulis ke sendmail: ${e.message}` })
    }
  })
}

module.exports = { kirimEmail, bangunPesan, alamatAman, bersihHeader }
