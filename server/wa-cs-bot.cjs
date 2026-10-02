'use strict'

// Bot CS WhatsApp — jawab pertanyaan umum seputar lembaga berdasarkan PERAN
// pengirim. Semua query tenant-scoped + role-scoped: guru hanya melihat data
// yang diampunya, wali murid hanya melihat data anaknya. Tidak ada data yang
// boleh bocor antar-lembaga atau antar-pengguna.
//
// Dipanggil dari wa-worker.mjs saat ada pesan masuk. Return string balasan
// (atau null bila tidak perlu membalas).

const { normalizePhone } = require('./wa-queue.cjs')
const { getTenantSettings } = require('./tenant-settings.cjs')

// Strip semua karakter non-digit agar nomor telepon bisa dibandingkan lintas
// format ("0812...", "62812...", "+62 812-...", dst).
function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '')
}

// Nomor telepon dinormalisasi ke dua bentuk umum: "62xxx" dan "0xxx".
function phoneVariants(raw) {
  const d = digitsOnly(raw)
  if (!d) return []
  let n = d
  if (n.startsWith('0')) n = '62' + n.slice(1)
  else if (n.startsWith('8')) n = '62' + n
  if (!/^62\d{7,13}$/.test(n)) return []
  const leadingZero = '0' + n.slice(2)
  return [...new Set([n, leadingZero])]
}

// Identifikasi pengirim berdasarkan nomor WA-nya. Return { role, nama, gtkId,
// siswaIds[] } atau null. Wali murid bisa terhubung ke beberapa siswa.
function resolveSender(db, tenantId, phone) {
  const variants = phoneVariants(phone)
  if (!variants.length) return null
  const placeholders = variants.map(() => '?').join(',')

  // 1. GTK (guru / wali_kelas / kepala / operator / tu / bendahara).
  const gtk = db.prepare(`
    SELECT g.id, g.nama, g.no_hp, u.role
    FROM gtk g
    LEFT JOIN users u ON u.gtk_id = g.id AND u.tenant_id = g.tenant_id
    WHERE g.tenant_id=? AND g.no_hp IS NOT NULL
  `).all(tenantId)
  for (const g of gtk) {
    if (phoneVariants(g.no_hp).some(v => variants.includes(v))) {
      return { role: g.role || 'guru', nama: g.nama, gtkId: g.id, siswaIds: [], jenis: 'gtk' }
    }
  }

  // 2. Wali murid / siswa — nomor yang tersimpan di siswa.no_hp adalah kontak
  //    wali. Cari siswa yang no_hp-nya cocok, lalu kumpulkan semua siswa yang
  //    wali-nya sama (via user_students + user tersebut).
  const siswaMatch = db.prepare(`SELECT s.id, s.nama, s.no_hp, s.rombel_id, r.nama rombel
    FROM siswa s LEFT JOIN rombel r ON r.id=s.rombel_id AND r.tenant_id=s.tenant_id
    WHERE s.tenant_id=? AND s.no_hp IS NOT NULL`).all(tenantId)
    .filter(s => phoneVariants(s.no_hp).some(v => variants.includes(v)))

  if (siswaMatch.length) {
    // Kumpulkan semua anak dari wali ini (no_hp sama), supaya jawaban mencakup
    // semua anak bila satu wali punya lebih dari satu siswa.
    const waliPhones = new Set()
    for (const s of siswaMatch) waliPhones.add(digitsOnly(s.no_hp))
    const allAnak = []
    for (const s of db.prepare(`SELECT id, nama, no_hp, rombel_id FROM siswa WHERE tenant_id=? AND no_hp IS NOT NULL`).all(tenantId)) {
      if (waliPhones.has(digitsOnly(s.no_hp))) allAnak.push(s)
    }
    const ids = [...new Set(allAnak.map(s => s.id))]
    return {
      role: 'wali_murid',
      nama: siswaMatch[0].nama,
      siswaIds: ids,
      jenis: 'wali',
      siswaRows: allAnak,
    }
  }
  return null
}

// Ambil jadwal hari ini untuk satu rombel (siswa) atau satu guru.
function jadwalRombel(db, tenantId, rombelId, date) {
  const day = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][new Date(`${date}T12:00:00Z`).getUTCDay()]
  return db.prepare(`SELECT j.jam_mulai, j.jam_selesai, m.nama mapel, g.nama guru
    FROM jadwal j
    JOIN mapel m ON m.id=j.mapel_id AND m.tenant_id=j.tenant_id
    LEFT JOIN gtk g ON g.id=j.gtk_id AND g.tenant_id=j.tenant_id
    WHERE j.tenant_id=? AND j.rombel_id=? AND lower(j.hari)=lower(?)
      AND COALESCE(j.jenis_kegiatan,'mapel')='mapel'
    ORDER BY j.jam_mulai`).all(tenantId, rombelId, day)
}

function jadwalGuru(db, tenantId, gtkId, date) {
  const day = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][new Date(`${date}T12:00:00Z`).getUTCDay()]
  return db.prepare(`SELECT j.jam_mulai, j.jam_selesai, m.nama mapel, r.nama rombel
    FROM jadwal j
    JOIN mapel m ON m.id=j.mapel_id AND m.tenant_id=j.tenant_id
    JOIN rombel r ON r.id=j.rombel_id AND r.tenant_id=j.tenant_id
    WHERE j.tenant_id=? AND j.gtk_id=? AND lower(j.hari)=lower(?)
      AND COALESCE(j.jenis_kegiatan,'mapel')='mapel'
    ORDER BY j.jam_mulai`).all(tenantId, gtkId, day)
}

function infoLembaga(db, tenantId) {
  const s = getTenantSettings(db, tenantId) || {}
  const lines = []
  if (s.nama_lembaga) lines.push(`*${s.nama_lembaga}*`)
  if (s.alamat) lines.push(`Alamat: ${s.alamat}`)
  if (s.telepon) lines.push(`Telepon: ${s.telepon}`)
  if (s.email) lines.push(`Email: ${s.email}`)
  if (s.npsn) lines.push(`NPSN: ${s.npsn}`)
  if (s.nsm) lines.push(`NSM: ${s.nsm}`)
  return lines.length ? lines.join('\n') : 'Informasi lembaga belum dilengkapi.'
}

function tagihanAnak(db, tenantId, siswaId) {
  const rows = db.prepare(`SELECT t.nominal, t.bulan, t.tahun, j.nama jenis, t.status
    FROM tagihan t JOIN jenis_tagihan j ON j.id=t.jenis_tagihan_id AND j.tenant_id=t.tenant_id
    WHERE t.siswa_id=? AND t.tenant_id=? AND t.status='belum_bayar'
    ORDER BY t.tahun DESC, t.bulan DESC`).all(siswaId, tenantId)
  return rows
}

function saldoAnak(db, tenantId, siswaId) {
  const row = db.prepare('SELECT saldo_akhir FROM tabungan WHERE siswa_id=? AND tenant_id=? ORDER BY created_at DESC LIMIT 1').get(siswaId, tenantId)
  return row ? Number(row.saldo_akhir || 0) : 0
}

function absensiAnak(db, tenantId, siswaId) {
  const rows = db.prepare(`SELECT tanggal, status FROM absensi_siswa WHERE siswa_id=? AND tenant_id=? ORDER BY tanggal DESC LIMIT 5`).all(siswaId, tenantId)
  return rows
}

function nilaiAnak(db, tenantId, siswaId) {
  // Nilai rapor terakhir per mapel (STS/SAS), terlepas dari periode.
  return db.prepare(`SELECT m.nama mapel, r.nilai_akhir, r.predikat, r.semester, r.tahun_ajaran
    FROM rapor r JOIN mapel m ON m.id=r.mapel_id AND m.tenant_id=r.tenant_id
    WHERE r.siswa_id=? AND r.tenant_id=? AND r.nilai_akhir IS NOT NULL
    ORDER BY r.tahun_ajaran DESC, r.semester DESC, m.nama
    LIMIT 20`).all(siswaId, tenantId)
}

// Format jawaban menu berdasarkan peran.
function menuText(sender) {
  const umum = [
    '*Menu Layanan Lembaga*',
    '',
    'Ketik salah satu kata kunci:',
  ]
  const commands = []
  if (sender.jenis === 'wali') {
    commands.push('• *tagihan* — tagihan belum dibayar anak')
    commands.push('• *tabungan* — saldo tabungan anak')
    commands.push('• *nilai* — nilai rapor anak')
    commands.push('• *absensi* — kehadiran anak terakhir')
    commands.push('• *jadwal* — jadwal pelajaran hari ini')
  } else if (sender.jenis === 'gtk') {
    commands.push('• *jadwal* — jadwal mengajar hari ini')
    commands.push('• *info* — profil lembaga')
  } else {
    commands.push('• *info* — profil lembaga')
  }
  commands.push('• *info* — profil lembaga')
  commands.push('• *menu* — tampilkan menu ini')
  return [...umum, ...commands].join('\n')
}

// Handler utama. Return string balasan atau null.
// `date` opsional (default: hari ini WIB) — dipakai untuk uji.
function handleIncoming(db, { tenantId, phone, text, date: dateParam }) {
  if (!tenantId || !phone || !text) return null
  const sender = resolveSender(db, tenantId, phone)
  const msg = String(text).trim()
  const lower = msg.toLowerCase()
  const date = dateParam || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

  // Salam umum — balas dengan menu bila pengirim dikenal.
  if (['halo', 'hi', 'hai', 'hello', 'assalamualaikum', 'assalamu\'alaikum', 'menu', 'help', 'bantuan', 'start'].includes(lower)) {
    if (!sender) return 'Maaf, nomor Anda belum terdaftar di sistem. Silakan hubungi pihak lembaga.'
    return menuText(sender)
  }
  if (!sender) {
    // Nomor tidak dikenal: tetap balas info lembaga (tanpa data pribadi).
    return `Maaf, nomor Anda belum terdaftar di sistem.\n\n${infoLembaga(db, tenantId)}`
  }

  if (lower.includes('jadwal')) {
    if (sender.jenis === 'gtk' && sender.gtkId) {
      const rows = jadwalGuru(db, tenantId, sender.gtkId, date)
      if (!rows.length) return `Tidak ada jadwal mengajar untuk Anda hari ini (${date}).`
      return `*Jadwal Mengajar Hari Ini*\n` + rows.map(r => `• ${r.jam_mulai}–${r.jam_selesai} ${r.mapel} (${r.rombel})`).join('\n')
    }
    if (sender.jenis === 'wali' && sender.siswaRows?.length) {
      const parts = []
      for (const anak of sender.siswaRows) {
        const rows = jadwalRombel(db, tenantId, anak.rombel_id, date)
        const body = rows.length
          ? rows.map(r => `• ${r.jam_mulai}–${r.jam_selesai} ${r.mapel}${r.guru ? ` — ${r.guru}` : ''}`).join('\n')
          : 'Tidak ada jadwal hari ini.'
        parts.push(`*${anak.nama}* (${anak.rombel_id || '-'}):\n${body}`)
      }
      return `*Jadwal Pelajaran Hari Ini*\n\n${parts.join('\n\n')}`
    }
    return 'Perintah jadwal tidak tersedia untuk peran Anda.'
  }

  if (lower.includes('tagihan')) {
    if (sender.jenis !== 'wali') return 'Perintah ini hanya untuk wali murid.'
    const parts = []
    let total = 0
    for (const anak of sender.siswaRows) {
      const rows = tagihanAnak(db, tenantId, anak.id)
      if (!rows.length) { parts.push(`*${anak.nama}*: tidak ada tagihan belum dibayar.`); continue }
      const sum = rows.reduce((s, r) => s + Number(r.nominal || 0), 0)
      total += sum
      parts.push(`*${anak.nama}* (total Rp${sum.toLocaleString('id-ID')}):\n` + rows.map(r => `• ${r.jenis} (${r.bulan || ''} ${r.tahun || ''}): Rp${Number(r.nominal || 0).toLocaleString('id-ID')}`).join('\n'))
    }
    return `*Tagihan Belum Dibayar*\nTotal: Rp${total.toLocaleString('id-ID')}\n\n${parts.join('\n\n')}`
  }

  if (lower.includes('tabungan')) {
    if (sender.jenis !== 'wali') return 'Perintah ini hanya untuk wali murid.'
    const parts = sender.siswaRows.map(anak => `• ${anak.nama}: Rp${saldoAnak(db, tenantId, anak.id).toLocaleString('id-ID')}`)
    return `*Saldo Tabungan*\n${parts.join('\n')}`
  }

  if (lower.includes('absensi') || lower.includes('kehadiran')) {
    if (sender.jenis !== 'wali') return 'Perintah ini hanya untuk wali murid.'
    const parts = []
    for (const anak of sender.siswaRows) {
      const rows = absensiAnak(db, tenantId, anak.id)
      const body = rows.length
        ? rows.map(r => `• ${r.tanggal}: ${r.status}`).join('\n')
        : 'Belum ada catatan absensi.'
      parts.push(`*${anak.nama}*:\n${body}`)
    }
    return `*Kehadiran Terakhir*\n\n${parts.join('\n\n')}`
  }

  if (lower.includes('nilai')) {
    if (sender.jenis === 'wali') {
      const parts = []
      for (const anak of sender.siswaRows) {
        const rows = nilaiAnak(db, tenantId, anak.id)
        const body = rows.length
          ? rows.map(r => `• ${r.mapel}: ${r.nilai_akhir}${r.predikat ? ` (${r.predikat})` : ''}`).join('\n')
          : 'Belum ada nilai rapor.'
        parts.push(`*${anak.nama}*:\n${body}`)
      }
      return `*Nilai Rapor*\n\n${parts.join('\n\n')}`
    }
    return 'Perintah nilai untuk guru bisa dilihat lewat aplikasi (menu Ledger/Rekap Nilai).'
  }

  if (lower.includes('info') || lower.includes('kontak') || lower.includes('alamat')) {
    return infoLembaga(db, tenantId)
  }

  return null // Pesan tidak dikenali — tidak membalas (biarkan operator/manual).
}

module.exports = { handleIncoming, resolveSender, phoneVariants }
