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

// Pasangan (mapel, rombel) yang diampu seorang guru (dari jadwal + pengajar).
function pengajaranGuru(db, tenantId, gtkId) {
  return db.prepare(`
    SELECT m.id mapel_id, m.nama mapel, r.id rombel_id, r.nama rombel
    FROM jadwal j
    JOIN mapel m ON m.id=j.mapel_id AND m.tenant_id=j.tenant_id
    JOIN rombel r ON r.id=j.rombel_id AND r.tenant_id=j.tenant_id
    WHERE j.gtk_id=? AND j.tenant_id=? AND COALESCE(j.jenis_kegiatan,'mapel')='mapel'
    UNION
    SELECT m.id mapel_id, m.nama mapel, r.id rombel_id, r.nama rombel
    FROM pengajar p
    JOIN mapel m ON m.id=p.mapel_id AND m.tenant_id=p.tenant_id
    JOIN rombel r ON r.id=p.rombel_id AND r.tenant_id=p.tenant_id
    WHERE p.gtk_id=? AND p.tenant_id=?
    ORDER BY rombel, mapel
  `).all(gtkId, tenantId, gtkId, tenantId)
}

// Nilai akhir per siswa untuk satu (rombel, mapel) yang diampu guru.
function nilaiRombelMapel(db, tenantId, rombelId, mapelId) {
  return db.prepare(`
    SELECT s.nama, s.nis, r.nilai_akhir, r.predikat
    FROM siswa s
    LEFT JOIN rapor r ON r.siswa_id=s.id AND r.mapel_id=? AND r.tenant_id=s.tenant_id
      AND r.id = (SELECT id FROM rapor WHERE siswa_id=s.id AND mapel_id=? AND tenant_id=s.tenant_id AND nilai_akhir IS NOT NULL ORDER BY tahun_ajaran DESC, semester DESC LIMIT 1)
    WHERE s.tenant_id=? AND s.rombel_id=? AND COALESCE(s.status,'aktif')='aktif'
    ORDER BY s.nama
  `).all(mapelId, mapelId, tenantId, rombelId)
}

// Rekap absensi satu rombel pada tanggal tertentu (hadir/sakit/izin/alpha).
function absensiRombel(db, tenantId, rombelId, date) {
  const rows = db.prepare(`SELECT s.nama, a.status
    FROM siswa s LEFT JOIN absensi_siswa a ON a.siswa_id=s.id AND a.tenant_id=s.tenant_id AND a.tanggal=?
    WHERE s.tenant_id=? AND s.rombel_id=? AND COALESCE(s.status,'aktif')='aktif'
    ORDER BY s.nama`).all(date, tenantId, rombelId)
  const count = { hadir: 0, sakit: 0, izin: 0, alpha: 0, belum: 0 }
  const detail = []
  for (const r of rows) {
    const st = String(r.status || '').toLowerCase()
    if (st === 'hadir') count.hadir++
    else if (st === 'sakit') count.sakit++
    else if (st === 'izin') count.izin++
    else if (st === 'alpha' || st === 'alpa') count.alpha++
    else count.belum++
  }
  return { count, detail: rows.filter(r => String(r.status || '').toLowerCase() !== 'hadir') }
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
    commands.push('• *nilai* — nilai siswa per kelas & mapel yang Anda ampu')
    commands.push('• *absensi* — rekap absensi kelas yang Anda ampu')
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
    if (sender.jenis === 'wali') {
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
    if (sender.jenis === 'gtk' && sender.gtkId) {
      const pairs = pengajaranGuru(db, tenantId, sender.gtkId)
      if (!pairs.length) return 'Anda belum terdaftar mengampu kelas/mapel apa pun.'
      const rombels = [...new Map(pairs.map(p => [p.rombel_id, p])).values()]
      // Deteksi rombel yang disebut di pesan (kalau ada).
      const disebut = rombels.filter(r => r.rombel && lower.includes(String(r.rombel).toLowerCase()))
      const target = disebut.length === 1 ? [disebut[0]] : rombels
      const parts = []
      for (const rb of target) {
        const rekap = absensiRombel(db, tenantId, rb.rombel_id, date)
        const c = rekap.count
        let body = `Hadir ${c.hadir} · Sakit ${c.sakit} · Izin ${c.izin} · Alpha ${c.alpha}${c.belum ? ` · Belum ${c.belum}` : ''}`
        if (rekap.detail.length) {
          const tanpaHadir = rekap.detail.map(r => `  ${r.nama}: ${r.status || 'belum'}`).join('\n')
          if (tanpaHadir.split('\n').length <= 15) body += '\n' + tanpaHadir
          else body += '\n' + rekap.detail.slice(0, 15).map(r => `  ${r.nama}: ${r.status || 'belum'}`).join('\n') + '\n  …'
        }
        parts.push(`*${rb.rombel}* (${date}):\n${body}`)
      }
      return `*Rekap Absensi* — ${sender.nama}\n\n${parts.join('\n\n')}`
    }
    return 'Perintah ini hanya untuk wali murid atau guru.'
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
    if (sender.jenis === 'gtk' && sender.gtkId) {
      const pairs = pengajaranGuru(db, tenantId, sender.gtkId)
      if (!pairs.length) return 'Anda belum terdaftar mengampu kelas/mapel apa pun.'
      // Deteksi mapel dan rombel yang disebut di pesan.
      const mapelSebut = pairs.filter(p => p.mapel && lower.includes(String(p.mapel).toLowerCase()))
      const rombelSebut = pairs.filter(p => p.rombel && lower.includes(String(p.rombel).toLowerCase()))
      let target = pairs
      if (mapelSebut.length) target = target.filter(p => mapelSebut.some(m => m.mapel_id === p.mapel_id))
      if (rombelSebut.length) target = target.filter(p => rombelSebut.some(r => r.rombel_id === p.rombel_id))
      const unique = [...new Map(target.map(p => [p.mapel_id + '|' + p.rombel_id, p])).values()]
      if (!unique.length) return 'Tidak ada kelas/mapel yang cocok dengan yang Anda sebutkan.'
      // Bila tanpa penyebutan dan ampuannya banyak, tampilkan menu ringkas.
      if (!mapelSebut.length && !rombelSebut.length && pairs.length > 4) {
        return `*Kelas & Mapel yang Anda ampu:*\n${pairs.map(p => `• ${p.rombel} — ${p.mapel}`).join('\n')}\n\nKetik contoh: *nilai ${pairs[0].rombel} ${pairs[0].mapel}* untuk melihat nilainya.`
      }
      const parts = []
      for (const p of unique) {
        const rows = nilaiRombelMapel(db, tenantId, p.rombel_id, p.mapel_id)
        const isi = rows.length
          ? rows.map(r => `• ${r.nama}${r.nis ? ` (${r.nis})` : ''}: ${r.nilai_akhir ?? '—'}${r.predikat ? ` ${r.predikat}` : ''}`).join('\n')
          : 'Belum ada nilai.'
        parts.push(`*${p.rombel} — ${p.mapel}*:\n${isi}`)
      }
      return `*Nilai Siswa* — ${sender.nama}\n\n${parts.join('\n\n')}`
    }
    return 'Perintah nilai untuk guru bisa dilihat lewat aplikasi (menu Ledger/Rekap Nilai).'
  }

  if (lower.includes('info') || lower.includes('kontak') || lower.includes('alamat')) {
    return infoLembaga(db, tenantId)
  }

  return null // Pesan tidak dikenali — tidak membalas (biarkan operator/manual).
}

module.exports = { handleIncoming, resolveSender, phoneVariants }
