const PDFDocument = require('pdfkit')
const QRCode = require('qrcode')
const { getTenantSettings } = require('./tenant-settings.cjs')
const path = require('path')
const fs = require('fs')

// Rapor siswa siap-cetak (server-side PDF).
// Struktur mengikuti desain rapor RDM (Rapor Digital Madrasah) Kemenag:
//   halaman 1: sampul
//   halaman 2: identitas peserta didik
//   halaman 3: KOP + identitas ringkas + CAPAIAN HASIL BELAJAR
//              (Mata Pelajaran | Nilai Akhir | Capaian Kompetensi) + Jumlah
//   halaman 4: Ekstrakurikuler, Prestasi, Ketidakhadiran, Catatan Wali Kelas,
//              Tanggapan Orang Tua/Wali, dan blok tanda tangan
// Tata letak memakai geometri yang diukur dari PDF rapor RDM asli (A4, margin 34pt).

function safeText(value, fallback = '-') {
  const s = String(value ?? '').trim()
  return s || fallback
}

function resolveUploadPath(uploadDir, url) {
  if (!url) return null
  const relative = decodeURIComponent(String(url).split('?')[0]).replace(/^\/+/, '')
  if (!relative.startsWith('uploads/')) return null
  const resolved = path.join(uploadDir, relative.replace(/^uploads\//, ''))
  return fs.existsSync(resolved) ? resolved : null
}

function coverLayout({ tahunAjaran }) {
  const tahun = String(tahunAjaran).split('/')[0]
  return {
    kemenagLogoY: 40,
    kemenagLogoSize: 50,
    raporTitleY: 100,
    laporanSubtitleY: 125,
    jenjangY: 155,
    namaLembagaY: 180,
    nsmNpsnY: 215,
    lembagaLogoY: 250,
    lembagaLogoSize: 80,
    siswaBoxY: 360,
    siswaBoxHeight: 100,
    kemenagFooterY: 520,
    yayasanFooterY: 545,
    tahunFooterY: 570,
    tahun,
  }
}

function identitasLayout({ pageWidth }) {
  return {
    headerY: 30,
    headerHeight: 60,
    titleY: 100,
    titleHeight: 25,
    contentStartY: 135,
    col1X: 60,
    col2X: pageWidth / 2 + 30,
    // Render memakai lebar nilai = colWidth - 125 mulai di col1X + 125, jadi
    // colWidth harus berhenti tepat di margin kanan (pageWidth - 110) agar
    // nilai panjang tidak melewati batas halaman.
    colWidth: pageWidth - 110,
    labelX: 85,
    labelWidth: 120,
    colonX: 210,
    valueX: 220,
    rowHeight: 22,
    sectionSpacing: 30,
  }
}

// Rentang tanggal semester — duplikat kecil dari index.cjs (fungsi lokal, bukan exported)
// supaya service ini tidak circular-require index.cjs.
function semesterRange(tahunAjaran, semester) {
  const [thn1, thn2] = String(tahunAjaran).split('/')
  const y1 = thn1, y2 = thn2 || thn1
  const from = semester === 'ganjil' ? `${y1}-07-01` : `${y2}-01-01`
  const to = semester === 'ganjil' ? `${y1}-12-31` : `${y2}-06-30`
  return { from, to }
}

// ---------------------------------------------------------------------------
// Geometri rapor gaya RDM (diukur dari PDF rapor RDM A4, margin 34pt)
// ---------------------------------------------------------------------------
const RDM = {
  pageWidth: 595.28,
  pageHeight: 841.89,
  margin: 34,
  contentRight: 561.28,
  kop: { line1Y: 42, line2Y: 55, line3Y: 69, line4Y: 81, ruleY: 92 },
  identity: {
    rowY0: 103,
    rowPitch: 15.5,
    leftLabelX: 37,
    leftColonX: 86.5,
    leftValueX: 94.8,
    leftValueWidth: 200,
    rightLabelX: 308.7,
    rightColonX: 388.2,
    rightValueX: 396.4,
    rightValueWidth: 158,
  },
  titleY: 190,
  table: {
    headerTop: 220,
    headerHeight: 16,
    bodyStartY: 236,
    minRowHeight: 17,
    padX: 3,
    c1: { x: 34, w: 138 },
    c2: { x: 172, w: 56 },
    c3: { x: 228, w: 333.28 },
    bodySize: 8,
    headerSize: 8,
  },
  footer: { ruleY: 810, textY: 816, leftX: 34, rightX: 561.28 },
}

// Fase capaian pembelajaran (Kurikulum Merdeka) dari tingkat kelas.
// MI: I-II=A, III-IV=B, V-VI=C | MTs: VII-IX=D | MA: X=E, XI-XII=F
// Tingkat disimpan sebagai angka ("7") maupun romawi ("VII-A") di data nyata.
const ROMAN_TINGKAT = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 }

function tingkatToNumber(tingkat) {
  const raw = String(tingkat ?? '').trim()
  if (!raw) return 0
  const digits = raw.match(/\d+/)
  if (digits) return Number(digits[0])
  const roman = raw.toLowerCase().match(/^[ivx]+/)
  return roman ? (ROMAN_TINGKAT[roman[0]] || 0) : 0
}

function faseFromTingkat(tingkat, jenjang = '') {
  const n = tingkatToNumber(tingkat)
  const j = String(jenjang || '').toLowerCase()
  if (!n) return ''
  if (j.includes('ibtidaiyah') || j === 'mi') {
    if (n <= 2) return 'A'
    if (n <= 4) return 'B'
    return 'C'
  }
  if (j.includes('tsanawiyah') || j === 'mts') return 'D'
  if (n <= 9) return 'D'
  if (n === 10) return 'E'
  return 'F'
}

// Capaian kompetensi per mata pelajaran — kalimat deskriptif bergaya RDM,
// memakai materi terakhir yang diajarkan pada mapel tersebut bila tersedia.
// Font standar PDFKit (Helvetica) hanya mendukung WinAnsi; materi berbahasa Arab
// (mis. "المواد الدراسية") tercetak sebagai mojibake bila dibiarkan. Bersihkan dulu.
function sanitizeLatin(text) {
  return String(text ?? '')
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2018\u2019\u201C\u201D\u2013\u2014]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildCapaianKompetensi({ nilai, mapel, materi }) {
  const n = Number(nilai) || 0
  const kualitas = n >= 93 ? 'sangat baik'
    : n >= 84 ? 'baik'
    : n >= 75 ? 'cukup'
    : 'perlu bimbingan'
  const topik = sanitizeLatin(materi) || `kompetensi ${safeText(mapel, 'mata pelajaran')}`
  return `Menunjukkan penguasaan yang ${kualitas} dalam ${topik}.`
}

const KELOMPOK_LABEL = {
  wajib: 'Kelompok Mata Pelajaran Umum',
  mulok: 'Kelompok Mata Pelajaran Pilihan',
  'muatan lokal': 'Kelompok Mata Pelajaran Pilihan',
  pilihan: 'Kelompok Mata Pelajaran Pilihan',
}

function kelompokLabel(kelompok) {
  const key = String(kelompok || '').trim().toLowerCase()
  return KELOMPOK_LABEL[key] || 'Kelompok Mata Pelajaran Umum'
}

async function createRaporSiswaPdf(db, options) {
  const { tenantId, siswaId, tahunAjaran, semester, jenis, uploadDir } = options

  const siswa = db.prepare(`
    SELECT s.*, r.nama AS rombel_nama, r.tingkat, g.nama AS wali_kelas_nama, g.nip AS wali_kelas_nip
    FROM siswa s LEFT JOIN rombel r ON s.rombel_id=r.id AND r.tenant_id=s.tenant_id
    LEFT JOIN gtk g ON r.wali_kelas_id=g.id AND g.tenant_id=s.tenant_id
    WHERE s.id=? AND s.tenant_id=?
  `).get(siswaId, tenantId)
  if (!siswa) return null

  const settings = getTenantSettings(db, tenantId) || {}

  const rapor = db.prepare(`
    SELECT r.*, m.nama AS mapel_nama, m.kelompok AS mapel_kelompok
    FROM rapor r LEFT JOIN mapel m ON r.mapel_id = m.id AND m.tenant_id = r.tenant_id
    WHERE r.tenant_id=? AND r.siswa_id=? AND r.tahun_ajaran=? AND r.semester=? AND r.jenis=?
    ORDER BY COALESCE(m.kelompok,'wajib'), m.nama
  `).all(tenantId, siswaId, tahunAjaran, semester, jenis)
  if (rapor.length === 0) return { error: 'RAPOR_NOT_GENERATED' }

  const { from, to } = semesterRange(tahunAjaran, semester)

  const absensiRows = db.prepare(`SELECT lower(status) AS status, COUNT(DISTINCT tanggal) AS jumlah
    FROM absensi_siswa WHERE siswa_id=? AND tenant_id=? AND tanggal>=? AND tanggal<=? GROUP BY lower(status)`)
    .all(siswaId, tenantId, from, to)
  const kehadiran = { hadir: 0, sakit: 0, izin: 0, alpa: 0 }
  for (const row of absensiRows) {
    const key = ['alpha', 'tanpa_keterangan'].includes(row.status) ? 'alpa' : row.status
    if (Object.hasOwn(kehadiran, key)) kehadiran[key] += Number(row.jumlah) || 0
  }

  const kepribadian = db.prepare(`SELECT sikap_spiritual,sikap_sosial,sikap_umum,kelakuan,kerajinan,kerapian,kedisiplinan,catatan_wali_kelas,saran
    FROM catatan_kepribadian WHERE siswa_id=? AND tahun_ajaran=? AND semester=? AND tenant_id=? ORDER BY updated_at DESC LIMIT 1`)
    .get(siswaId, tahunAjaran, semester, tenantId) || {}

  const pelengkap = db.prepare(`SELECT * FROM rapor_pelengkap WHERE tenant_id=? AND siswa_id=? AND tahun_ajaran=? AND semester=? AND jenis=?`)
    .get(tenantId, siswaId, tahunAjaran, semester, jenis) || {}
  let prestasi = []
  try { prestasi = JSON.parse(pelengkap.prestasi || '[]') } catch { prestasi = [] }

  const tanggalRapor = safeText(pelengkap.tanggal_pembagian, new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))

  const ekstrakurikuler = db.prepare(`SELECT e.id,e.nama,e.jenis_kegiatan,
      COUNT(a.id) AS total_pertemuan,
      SUM(CASE WHEN lower(a.status)='hadir' THEN 1 ELSE 0 END) AS hadir
    FROM ekskul_anggota ea JOIN ekskul e ON e.id=ea.ekskul_id AND e.tenant_id=ea.tenant_id
    LEFT JOIN absensi_ekskul a ON a.ekskul_id=e.id AND a.siswa_id=ea.siswa_id AND a.tenant_id=ea.tenant_id AND a.tanggal>=? AND a.tanggal<=?
    WHERE ea.siswa_id=? AND ea.tenant_id=? GROUP BY e.id,e.nama,e.jenis_kegiatan ORDER BY e.jenis_kegiatan,e.nama`)
    .all(from, to, siswaId, tenantId)
    .map(row => ({ ...row, nilai: row.total_pertemuan ? Math.round((row.hadir / row.total_pertemuan) * 100) : null }))

  // Kokurikuler: kegiatan khusus berjenis kokurikuler yang diikuti siswa pada semester ini.
  let kokurikuler = []
  try {
    kokurikuler = db.prepare(`SELECT k.nama, k.deskripsi FROM kegiatan_khusus k
      JOIN absensi_kegiatan ak ON ak.kegiatan_id=k.id AND ak.siswa_id=? AND ak.tenant_id=k.tenant_id
      WHERE k.tenant_id=? AND k.jenis='kokurikuler' AND k.tanggal>=? AND k.tanggal<=?
      GROUP BY k.id ORDER BY k.tanggal`).all(siswaId, tenantId, from, to)
  } catch { kokurikuler = [] }

  // Materi terakhir per mapel (dipakai untuk kalimat capaian kompetensi).
  const materiByMapel = new Map()
  try {
    const rows = db.prepare(`SELECT mapel_id, materi FROM jurnal_mengajar
      WHERE tenant_id=? AND rombel_id=? AND tanggal>=? AND tanggal<=? AND COALESCE(materi,'')<>''
      ORDER BY tanggal ASC`).all(tenantId, siswa.rombel_id, from, to)
    for (const row of rows) materiByMapel.set(row.mapel_id, row.materi)
  } catch { /* jurnal_mengajar belum ada di fixture lama */ }

  const rataAkhir = rapor.length ? Math.round(rapor.reduce((sum, r) => sum + (Number(r.nilai_akhir) || 0), 0) / rapor.length) : 0
  const jumlahNilai = rapor.reduce((sum, r) => sum + (Number(r.nilai_akhir) || 0), 0)

  const qrDataUrl = await QRCode.toDataURL(`Rapor - ${siswa.nama} - Kepsek: ${settings.kepala_sekolah || '-'} - Diverifikasi digital`)
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64')

  const fotoPath = resolveUploadPath(uploadDir, siswa.foto)
  const settingsLogoPath = resolveUploadPath(uploadDir, settings.logo)
  const hasLogo = !!settingsLogoPath
  const kemenagLogoUploadPath = resolveUploadPath(uploadDir, settings.logo_kemenag)
  const kemenagLogoPath = kemenagLogoUploadPath || path.join(__dirname, 'assets', 'kemenag-logo.svg')
  const hasKemenagLogo = kemenagLogoUploadPath ? fs.existsSync(kemenagLogoUploadPath) : fs.existsSync(kemenagLogoPath)

  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true })
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right

  // ---------- Halaman 1: Sampul (Cover) ----------
  // Border halaman
  doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).lineWidth(2).stroke()
  doc.rect(36, 36, doc.page.width - 72, doc.page.height - 72).lineWidth(0.5).stroke()

  const cover = coverLayout({ pageWidth, contentWidth: pageWidth, tahunAjaran })

  // Logo Kemenag (asset SVG)
  if (hasKemenagLogo) {
    try {
      doc.image(kemenagLogoPath, doc.page.margins.left + pageWidth / 2 - 20, cover.kemenagLogoY, {
        fit: [40, 40],
        align: 'center',
      })
    } catch {
      // Fallback ke teks
      doc.font('Helvetica-Bold').fontSize(8).text('KEMENAG', doc.page.margins.left + pageWidth / 2 - 25, cover.kemenagLogoY + 15, {
        width: 50,
        align: 'center',
      })
    }
  } else {
    doc.font('Helvetica-Bold').fontSize(8).text('KEMENAG', doc.page.margins.left + pageWidth / 2 - 25, cover.kemenagLogoY + 15, {
      width: 50,
      align: 'center',
    })
  }

  // Judul RAPOR
  doc.font('Helvetica-Bold').fontSize(20).text('RAPOR', doc.page.margins.left, cover.raporTitleY, {
    width: pageWidth,
    align: 'center',
    lineBreak: false,
  })

  // Subjudul Laporan Hasil Belajar Siswa
  doc.font('Helvetica-Bold').fontSize(12).text('LAPORAN HASIL BELAJAR SISWA', doc.page.margins.left, cover.laporanSubtitleY, {
    width: pageWidth,
    align: 'center',
    lineBreak: false,
  })

  // Jenjang (dari settings.jenjang)
  const jenjangText = safeText(settings.jenjang, 'MADRASAH TSANAWIYAH')
  doc.font('Helvetica-Bold').fontSize(12).text(jenjangText.toUpperCase(), doc.page.margins.left, cover.jenjangY, {
    width: pageWidth,
    align: 'center',
    lineBreak: false,
  })

  // Nama Lembaga
  const namaLembagaText = safeText(settings.nama_lembaga, 'Nama Lembaga')
  doc.font('Helvetica-Bold').fontSize(13).text(namaLembagaText.toUpperCase(), doc.page.margins.left, cover.namaLembagaY, {
    width: pageWidth,
    align: 'center',
    height: 20,
    lineGap: 1,
  })

  // NSM dan NPSN
  const identifiers = []
  if (settings.nsm) identifiers.push(`NSM: ${settings.nsm}`)
  if (settings.npsn) identifiers.push(`NPSN: ${settings.npsn}`)
  const identifierText = identifiers.join('     ')
  doc.font('Helvetica').fontSize(9).text(identifierText || '', doc.page.margins.left, cover.nsmNpsnY, {
    width: pageWidth,
    align: 'center',
    lineBreak: false,
  })

  // Logo Lembaga (di tengah, lebih besar)
  if (hasLogo) {
    try {
      doc.image(settingsLogoPath, doc.page.margins.left + pageWidth / 2 - cover.lembagaLogoSize / 2, cover.lembagaLogoY, {
        fit: [cover.lembagaLogoSize, cover.lembagaLogoSize],
        align: 'center',
      })
    } catch {}
  } else {
    // Placeholder jika tidak ada logo
    doc.rect(doc.page.margins.left + pageWidth / 2 - cover.lembagaLogoSize / 2, cover.lembagaLogoY, cover.lembagaLogoSize, cover.lembagaLogoSize).stroke()
    doc.font('Helvetica').fontSize(8).text('LOGO', doc.page.margins.left + pageWidth / 2 - cover.lembagaLogoSize / 2, cover.lembagaLogoY + 35, {
      width: cover.lembagaLogoSize,
      align: 'center',
    })
  }

  // Kotak nama siswa dan NIS/NISN
  const boxY = cover.siswaBoxY
  const boxWidth = pageWidth * 0.85
  const boxX = doc.page.margins.left + (pageWidth - boxWidth) / 2
  doc.rect(boxX, boxY, boxWidth, cover.siswaBoxHeight).lineWidth(1.5).stroke()

  doc.font('Helvetica').fontSize(9).text('NAMA PESERTA DIDIK', boxX + 15, boxY + 15, { width: boxWidth - 30, align: 'center', lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(16).text(safeText(siswa.nama).toUpperCase(), boxX + 15, boxY + 28, {
    width: boxWidth - 30,
    align: 'center',
    height: 30,
    ellipsis: true,
  })

  doc.font('Helvetica').fontSize(9).text('NIS / NISN', boxX + 15, boxY + 62, { width: boxWidth - 30, align: 'center', lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(11).text(`${safeText(siswa.nis)} / ${safeText(siswa.nisn)}`, boxX + 15, boxY + 74, {
    width: boxWidth - 30,
    align: 'center',
    lineBreak: false,
  })

  // Footer: Kementerian, Yayasan, Tahun
  doc.font('Helvetica').fontSize(9).text('KEMENTERIAN AGAMA REPUBLIK INDONESIA', doc.page.margins.left, cover.kemenagFooterY, {
    width: pageWidth,
    align: 'center',
    lineBreak: false,
  })

  const yayasanText = safeText(settings.yayasan_nama, 'Yayasan')
  doc.font('Helvetica').fontSize(9).text(yayasanText.toUpperCase(), doc.page.margins.left, cover.yayasanFooterY, {
    width: pageWidth,
    align: 'center',
    lineBreak: false,
  })

  doc.font('Helvetica-Bold').fontSize(11).text(`TAHUN ${cover.tahun}`, doc.page.margins.left, cover.tahunFooterY, {
    width: pageWidth,
    align: 'center',
    lineBreak: false,
  })

  // ---------- Halaman 2: Identitas Peserta Didik ----------
  doc.addPage({ size: 'A4', margin: 50 })
  const idLayout = identitasLayout({ pageWidth, contentWidth: pageWidth })

  // Header halaman 2 dengan logo dan nama lembaga
  if (hasLogo) {
    try {
      doc.image(settingsLogoPath, doc.page.margins.left, idLayout.headerY, {
        fit: [50, 50],
        align: 'center',
      })
    } catch {}
  }
  const logoOffset = hasLogo ? 60 : 0
  doc.font('Helvetica-Bold').fontSize(11).text(safeText(settings.nama_lembaga).toUpperCase(), doc.page.margins.left + logoOffset, idLayout.headerY + 5, {
    width: pageWidth - logoOffset - 20,
    align: 'center',
  })
  if (settings.alamat) {
    doc.font('Helvetica').fontSize(8).text(settings.alamat, doc.page.margins.left + logoOffset, idLayout.headerY + 25, {
      width: pageWidth - logoOffset - 20,
      align: 'center',
    })
  }

  // Judul IDENTITAS PESERTA DIDIK
  doc.font('Helvetica-Bold').fontSize(12).text('IDENTITAS PESERTA DIDIK', doc.page.margins.left, idLayout.titleY, {
    width: pageWidth,
    align: 'center',
    underline: false,
  })

  // Bagian A: Data Diri Peserta Didik
  let yPos = idLayout.contentStartY
  doc.font('Helvetica-Bold').fontSize(10).text('A.  DATA DIRI PESERTA DIDIK', doc.page.margins.left, yPos)
  yPos += idLayout.rowHeight + 5

  const dataDiri = [
    ['1', 'Nama Lengkap', safeText(siswa.nama).toUpperCase()],
    ['2', 'NIS / NISN', `${safeText(siswa.nis)} / ${safeText(siswa.nisn)}`],
    ['3', 'Tempat, Tanggal Lahir', `${safeText(siswa.tempat_lahir, '-')}, ${safeText(siswa.tanggal_lahir, '-')}`],
    ['4', 'Jenis Kelamin', safeText(siswa.jenis_kelamin, '-')],
    ['5', 'Agama', safeText(siswa.agama, '-')],
    ['6', 'Status dalam Keluarga', safeText(siswa.status_keluarga, '-')],
    ['7', 'Anak Ke', safeText(siswa.anak_ke, '-')],
    ['8', 'Alamat Peserta Didik', safeText(siswa.alamat, '-')],
    ['9', 'Nomor Telepon', safeText(siswa.no_hp, '-')],
    ['10', 'Sekolah Asal (SD/MI)', safeText(siswa.asal_sekolah, '-')],
  ]

  doc.font('Helvetica').fontSize(9)
  for (const row of dataDiri) {
    const num = row[0]
    const label = row[1]
    const val = row[2]
    doc.text(num, idLayout.col1X, yPos, { width: 20 })
    doc.text(label, idLayout.col1X + 25, yPos, { width: 80 })
    doc.text(':', idLayout.col1X + 115, yPos, { width: 5 })
    doc.text(val, idLayout.col1X + 125, yPos, { width: idLayout.colWidth - 125 })
    yPos += idLayout.rowHeight
  }

  // Bagian B: Data Orang Tua
  yPos += idLayout.sectionSpacing
  doc.font('Helvetica-Bold').fontSize(10).text('B.  DATA ORANG TUA', doc.page.margins.left, yPos)
  yPos += idLayout.rowHeight + 5

  const dataOrangTua = [
    ['1', 'Nama Ayah', safeText(siswa.nama_ayah, '-')],
    ['2', 'Pekerjaan Ayah', safeText(siswa.kerja_ayah, '-')],
    ['3', 'Nama Ibu', safeText(siswa.nama_ibu, '-')],
    ['4', 'Pekerjaan Ibu', safeText(siswa.kerja_ibu, '-')],
    ['5', 'Alamat Orang Tua', safeText(siswa.alamat_ortu, '-')],
    ['6', 'Nama Wali', safeText(siswa.nama_wali, '-')],
    ['7', 'Pekerjaan Wali', safeText(siswa.kerja_wali, '-')],
  ]

  for (const row of dataOrangTua) {
    const num = row[0]
    const label = row[1]
    const val = row[2]
    doc.text(num, idLayout.col1X, yPos, { width: 20 })
    doc.text(label, idLayout.col1X + 25, yPos, { width: 80 })
    doc.text(':', idLayout.col1X + 115, yPos, { width: 5 })
    doc.text(val, idLayout.col1X + 125, yPos, { width: idLayout.colWidth - 125 })
    yPos += idLayout.rowHeight
  }

  // Foto + Tanda tangan kepala sekolah di bawah
  yPos += idLayout.sectionSpacing
  const photoX = doc.page.margins.left
  const photoY = yPos
  const photoSize = 90
  doc.rect(photoX, photoY, photoSize, photoSize).stroke()
  doc.font('Helvetica').fontSize(8).text('PAS FOTO\n3 x 4', photoX, photoY + 35, {
    width: photoSize,
    align: 'center',
  })

  if (fotoPath) {
    try {
      doc.image(fotoPath, photoX, photoY, { width: photoSize, height: photoSize, fit: [photoSize, photoSize] })
    } catch {}
  }

  const sigX = photoX + photoSize + 80
  const sigY = photoY + 20
  doc.font('Helvetica').fontSize(9).text('Kepala Sekolah / Madrasah', sigX, sigY, {
    width: pageWidth - sigX - 50,
    align: 'center',
  })
  doc.font('Helvetica-Bold').fontSize(9).text(`(${safeText(settings.kepala_sekolah, '............................')})`, sigX, sigY + 50, {
    width: pageWidth - sigX - 50,
    align: 'center',
    underline: true,
  })

  // ==========================================================================
  // Halaman 3-4: Rapor (desain RDM)
  // ==========================================================================

  const fase = faseFromTingkat(siswa.tingkat, settings.jenjang)
  const semesterLabel = semester === 'genap' ? 'Genap' : 'Ganjil'
  const alamatLembaga = String(settings.alamat || '').trim()
  const kecamatanLine = String(settings.kota_cetak || '').trim()

  const raporPages = []

  function newRaporPage() {
    doc.addPage({ size: 'A4', margin: RDM.margin })
    raporPages.push(doc.bufferedPageRange().count - 1)
    return doc.page.margins.top
  }

  function drawKop() {
    const center = { width: RDM.pageWidth - 2 * RDM.margin, align: 'center' }
    doc.font('Helvetica').fontSize(10).fillColor('black')
      .text('KEMENTERIAN AGAMA REPUBLIK INDONESIA', RDM.margin, RDM.kop.line1Y, { ...center, lineBreak: false })
    doc.font('Helvetica-Bold').fontSize(12)
      .text(safeText(settings.nama_lembaga, 'Nama Lembaga').toUpperCase(), RDM.margin, RDM.kop.line2Y, { ...center, lineBreak: false })
    doc.font('Helvetica').fontSize(9)
      .text(alamatLembaga, RDM.margin, RDM.kop.line3Y, { ...center, lineBreak: false })
    if (kecamatanLine) {
      doc.font('Helvetica').fontSize(9)
        .text(kecamatanLine, RDM.margin, RDM.kop.line4Y, { ...center, lineBreak: false })
    }
    doc.moveTo(RDM.margin, RDM.kop.ruleY).lineTo(RDM.contentRight, RDM.kop.ruleY).lineWidth(1.2).stroke()
  }

  function drawIdentityGrid() {
    const id = RDM.identity
    const rows = [
      ['NAMA', safeText(siswa.nama), 'Kelas', safeText(siswa.rombel_nama)],
      ['NIS/NISN', `${safeText(siswa.nis)} / ${safeText(siswa.nisn)}`, 'Fase', fase],
      ['Madrasah', safeText(settings.nama_lembaga), 'Semester', semesterLabel],
      ['Alamat', alamatLembaga || '-', 'Tahun Ajaran', String(tahunAjaran)],
    ]
    let y = id.rowY0
    for (const [labelKiri, nilaiKiri, labelKanan, nilaiKanan] of rows) {
      doc.font('Helvetica').fontSize(9).fillColor('black')
      doc.text(labelKiri, id.leftLabelX, y, { lineBreak: false })
      doc.text(':', id.leftColonX, y, { lineBreak: false })
      doc.text(nilaiKiri, id.leftValueX, y, { width: id.leftValueWidth })
      doc.text(labelKanan, id.rightLabelX, y, { lineBreak: false })
      doc.text(':', id.rightColonX, y, { lineBreak: false })
      doc.text(nilaiKanan, id.rightValueX, y, { width: id.rightValueWidth })
      const tinggiKiri = doc.heightOfString(nilaiKiri, { width: id.leftValueWidth })
      y += Math.max(id.rowPitch, tinggiKiri + 7)
    }
    return y
  }

  function drawCapaianTable(startY) {
    const t = RDM.table
    let y = startY

    function drawHeader() {
      doc.rect(t.c1.x, y, RDM.contentRight - t.c1.x, t.headerHeight).lineWidth(0.7).stroke()
      doc.font('Helvetica-Bold').fontSize(t.headerSize).fillColor('black')
      doc.text('Mata Pelajaran', t.c1.x, y + 4, { width: t.c1.w, align: 'center', lineBreak: false })
      doc.text('Nilai Akhir', t.c2.x, y + 4, { width: t.c2.w, align: 'center', lineBreak: false })
      doc.text('Capaian Kompetensi', t.c3.x, y + 4, { width: t.c3.w, align: 'center', lineBreak: false })
      y += t.headerHeight
    }

    function rowHeight(cells) {
      doc.font('Helvetica').fontSize(t.bodySize)
      const hNama = doc.heightOfString(cells.nama, { width: t.c1.w - 2 * t.padX - 20 })
      const hCapaian = doc.heightOfString(cells.capaian, { width: t.c3.w - 2 * t.padX - 4 })
      return Math.max(t.minRowHeight, Math.max(hNama, hCapaian) + 6)
    }

    function drawCells(cells, h) {
      const left = t.c1.x
      const right = RDM.contentRight
      doc.lineWidth(0.7).strokeColor('black')
      doc.moveTo(left, y).lineTo(right, y).stroke()
      doc.moveTo(left, y + h).lineTo(right, y + h).stroke()
      doc.moveTo(t.c2.x, y).lineTo(t.c2.x, y + h).stroke()
      doc.moveTo(t.c3.x, y).lineTo(t.c3.x, y + h).stroke()
      doc.font('Helvetica').fontSize(t.bodySize).fillColor('black')
      if (cells.nomor != null) {
        doc.text(String(cells.nomor), t.c1.x + 5, y + 5, { width: 20, align: 'left', lineBreak: false })
      }
      const namaX = cells.nomor != null ? t.c1.x + 19 : t.c1.x + t.padX
      doc.text(cells.nama, namaX, y + 5, { width: t.c1.x + t.c1.w - namaX - t.padX })
      if (cells.nilai != null) {
        doc.text(String(cells.nilai), t.c2.x, y + 5, { width: t.c2.w, align: 'center', lineBreak: false })
      }
      doc.text(cells.capaian, t.c3.x + t.padX, y + 4, { width: t.c3.w - 2 * t.padX - 4 })
      y += h
    }

    drawHeader()

    let kelompokSebelumnya = null
    let nomor = 0
    const LANTAI = RDM.footer.ruleY - 20

    for (const row of rapor) {
      const labelKelompok = kelompokLabel(row.mapel_kelompok)
      if (labelKelompok !== kelompokSebelumnya) {
        kelompokSebelumnya = labelKelompok
        const hGrup = t.minRowHeight
        if (y + hGrup > LANTAI) { doc.addPage({ size: 'A4', margin: RDM.margin }); raporPages.push(doc.bufferedPageRange().count - 1); drawKop(); y = RDM.table.bodyStartY; drawHeader() }
        doc.lineWidth(0.7).strokeColor('black')
        doc.moveTo(t.c1.x, y).lineTo(RDM.contentRight, y).stroke()
        doc.moveTo(t.c1.x, y + hGrup).lineTo(RDM.contentRight, y + hGrup).stroke()
        doc.moveTo(t.c2.x, y).lineTo(t.c2.x, y + hGrup).stroke()
        doc.moveTo(t.c3.x, y).lineTo(t.c3.x, y + hGrup).stroke()
        doc.font('Helvetica-Bold').fontSize(t.bodySize).fillColor('black')
        doc.text(labelKelompok, t.c1.x + 3.4, y + 4, { width: t.c1.w + t.c2.w, lineBreak: false })
        y += hGrup
      }
      const capaian = String(row.deskripsi || '').trim()
        || buildCapaianKompetensi({ nilai: row.nilai_akhir, mapel: row.mapel_nama, materi: materiByMapel.get(row.mapel_id) })
      const cells = { nomor: ++nomor, nama: safeText(row.mapel_nama), nilai: row.nilai_akhir, capaian }
      const h = rowHeight(cells)
      if (y + h > LANTAI) { doc.addPage({ size: 'A4', margin: RDM.margin }); raporPages.push(doc.bufferedPageRange().count - 1); drawKop(); y = RDM.table.bodyStartY; drawHeader() }
      drawCells(cells, h)
    }

    // Baris Jumlah (total Nilai Akhir), seperti pada rapor RDM.
    const hJumlah = t.minRowHeight
    if (y + hJumlah > LANTAI) { doc.addPage({ size: 'A4', margin: RDM.margin }); raporPages.push(doc.bufferedPageRange().count - 1); drawKop(); y = RDM.table.bodyStartY; drawHeader() }
    doc.lineWidth(0.7).strokeColor('black')
    doc.moveTo(t.c1.x, y).lineTo(RDM.contentRight, y).stroke()
    doc.moveTo(t.c1.x, y + hJumlah).lineTo(RDM.contentRight, y + hJumlah).stroke()
    doc.moveTo(t.c2.x, y).lineTo(t.c2.x, y + hJumlah).stroke()
    doc.moveTo(t.c3.x, y).lineTo(t.c3.x, y + hJumlah).stroke()
    doc.font('Helvetica-Bold').fontSize(t.bodySize).fillColor('black')
    doc.text('Jumlah', t.c1.x + 3.4, y + 4, { lineBreak: false })
    doc.text(String(jumlahNilai), t.c2.x, y + 4, { width: t.c2.w, align: 'center', lineBreak: false })
    y += hJumlah

    doc.font('Helvetica').fontSize(7).fillColor('black')
      .text(`Rata-rata nilai akhir: ${rataAkhir}`, t.c1.x, y + 4)
    return y
  }

  // ---------- Halaman 3: Capaian Hasil Belajar ----------
  newRaporPage()
  drawKop()
  let tabelY = drawIdentityGrid()
  doc.font('Helvetica-Bold').fontSize(12).fillColor('black')
    .text('CAPAIAN HASIL BELAJAR', RDM.margin, Math.max(RDM.titleY, tabelY + 8), {
      width: RDM.pageWidth - 2 * RDM.margin, align: 'center', lineBreak: false,
    })
  drawCapaianTable(RDM.table.headerTop)

  // ---------- Halaman 4: Ekstrakurikuler, Prestasi, dst. ----------
  newRaporPage()
  let y2 = 40

  function sectionTitle(text) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('black').text(text, RDM.margin, y2, { lineBreak: false })
    y2 += 12
  }

  function tabelSederhana(headers, rows, widths) {
    const total = widths.reduce((a, b) => a + b, 0)
    const startX = RDM.margin
    const h = 16
    doc.lineWidth(0.7).strokeColor('black')
    doc.rect(startX, y2, total, h).stroke()
    doc.font('Helvetica-Bold').fontSize(8).fillColor('black')
    let x = startX
    headers.forEach((label, i) => {
      doc.text(label, x, y2 + 4, { width: widths[i], align: 'center', lineBreak: false })
      if (i > 0) doc.moveTo(x, y2).lineTo(x, y2 + h).stroke()
      x += widths[i]
    })
    y2 += h
    const body = rows.length ? rows : [headers.map(() => '')]
    for (const row of body) {
      const hRow = 17
      doc.rect(startX, y2, total, hRow).stroke()
      doc.font('Helvetica').fontSize(8).fillColor('black')
      x = startX
      row.forEach((value, i) => {
        doc.text(String(value ?? ''), x + 3, y2 + 5, { width: widths[i] - 6, align: i === 0 ? 'center' : 'left', lineBreak: false })
        if (i > 0) doc.moveTo(x, y2).lineTo(x, y2 + hRow).stroke()
        x += widths[i]
      })
      y2 += hRow
    }
    y2 += 8
  }

  if (kokurikuler.length) {
    sectionTitle('Kokurikuler')
    const teks = kokurikuler.map(k => k.deskripsi ? `${k.nama} (${k.deskripsi})` : k.nama).join(', ')
    doc.font('Helvetica').fontSize(8).fillColor('black')
      .text(`Siswa mengikuti kegiatan kokurikuler: ${teks}.`, RDM.margin, y2, { width: RDM.contentRight - RDM.margin, align: 'justify' })
    y2 = doc.y + 10
  }

  sectionTitle('Ekstrakurikuler')
  tabelSederhana(
    ['No', 'Kegiatan Ekstrakurikuler', 'Nilai', 'Keterangan'],
    ekstrakurikuler.map((e, i) => [
      i + 1, e.nama, e.nilai == null ? '' : e.nilai,
      e.nilai == null ? '' : (e.nilai >= 85 ? 'Sangat Baik' : e.nilai >= 70 ? 'Baik' : 'Cukup'),
    ]),
    [40, 230, 70, 187.28],
  )

  sectionTitle('Prestasi')
  tabelSederhana(
    ['No', 'Jenis Prestasi', 'Keterangan'],
    prestasi.map((p, i) => [i + 1, p.jenis || '-', p.keterangan || '-']),
    [40, 220, 267.28],
  )

  sectionTitle('Ketidakhadiran')
  for (const [label, jumlah] of [['Sakit', kehadiran.sakit], ['Izin', kehadiran.izin], ['Alpa', kehadiran.alpa]]) {
    doc.font('Helvetica').fontSize(9).fillColor('black')
    doc.text(label, RDM.margin + 3.4, y2, { width: 120, lineBreak: false })
    doc.text(String(jumlah), RDM.margin + 300, y2, { width: 40, align: 'right', lineBreak: false })
    doc.text('Hari', RDM.margin + 350, y2, { lineBreak: false })
    y2 += 17.7
  }
  y2 += 4

  sectionTitle('Catatan Wali Kelas')
  doc.font('Helvetica').fontSize(8).fillColor('black').text(
    safeText(pelengkap.catatan_wali_kelas || kepribadian.catatan_wali_kelas || kepribadian.saran,
      'Tingkatkan terus kedisiplinan dan semangat belajarmu.'),
    RDM.margin, y2, { width: RDM.contentRight - RDM.margin, align: 'justify' },
  )
  y2 = doc.y + 14

  sectionTitle('Tanggapan Orang Tua/Wali')
  doc.font('Helvetica').fontSize(8).fillColor('black').text(
    String(pelengkap.tanggapan_orang_tua || '').trim() || ' ',
    RDM.margin, y2, { width: RDM.contentRight - RDM.margin, height: 26 },
  )
  y2 += 40

  // Blok tanda tangan (tata letak RDM: kiri orang tua, kanan wali kelas, bawah tengah kepala madrasah)
  const kolomKananX = 253.8
  doc.font('Helvetica').fontSize(9).fillColor('black')
    .text(`${safeText(settings.kota_cetak, 'Bondowoso')}, ${tanggalRapor}`, 372, y2, { width: 190, align: 'left', lineBreak: false })
  doc.text('Orang Tua/Wali', 57.3, y2 + 20, { lineBreak: false })
  doc.text('Wali Kelas', 372.3, y2 + 20, { lineBreak: false })

  doc.font('Helvetica').fontSize(9)
    .text(safeText(siswa.wali_kelas_nama, '.....................'), 372.3, y2 + 90, { lineBreak: false })
  doc.font('Helvetica').fontSize(9)
    .text(`NIP. ${safeText(siswa.wali_kelas_nip, '-')}`, 372.3, y2 + 104, { lineBreak: false })

  try { doc.image(qrBuffer, 60, y2 + 60, { width: 44 }) } catch {}

  doc.font('Helvetica').fontSize(9)
    .text('Mengetahui', kolomKananX, y2 + 128, { lineBreak: false })
    .text('Kepala Madrasah', kolomKananX, y2 + 140, { lineBreak: false })
    .text(safeText(settings.kepala_sekolah, '.....................'), kolomKananX, y2 + 200, { lineBreak: false })
    .text('NIP. -', kolomKananX, y2 + 214, { lineBreak: false })

  // ---------- Footer strip pada setiap halaman rapor (gaya RDM) ----------
  const identitasFooter = `${safeText(siswa.rombel_nama)} _ ${safeText(siswa.nama)} _ ${safeText(siswa.nisn)}`
  const range = doc.bufferedPageRange()
  for (const pageIndex of raporPages) {
    if (pageIndex >= range.count) continue
    doc.switchToPage(pageIndex)
    // Footer digambar di bawah margin bawah halaman; tanpa ini PDFKit menganggapnya
    // overflow dan menyisipkan halaman kosong berisi nomor halaman saja.
    const savedBottom = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc.moveTo(RDM.footer.leftX, RDM.footer.ruleY).lineTo(RDM.footer.rightX, RDM.footer.ruleY).lineWidth(0.7).stroke()
    doc.font('Helvetica').fontSize(7).fillColor('black')
      .text(identitasFooter, RDM.footer.leftX, RDM.footer.textY + 2, { lineBreak: false })
    doc.font('Helvetica').fontSize(8)
      .text(`Halaman ${pageIndex - raporPages[0] + 1}`, RDM.footer.rightX - 60, RDM.footer.textY, {
        width: 60, align: 'right', lineBreak: false,
      })
    doc.page.margins.bottom = savedBottom
  }

  return doc
}

module.exports = { createRaporSiswaPdf, coverLayout, faseFromTingkat, buildCapaianKompetensi, RDM }
