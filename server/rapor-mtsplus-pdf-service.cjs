// Rapor siswa siap-cetak — LAYOUT ALTERNATIF "MTs Plus" (mirip rapor.mtsplussd7.cc.cd).
// Struktur per siswa:
//   halaman 1: cover "RAPOR PESERTA DIDIK" + jenis rapor (STS/SAS)
//   halaman 2: kop + IDENTITAS PESERTA DIDIK (biodata bernomor) + pas foto + TTD
//   halaman 3: kop + CAPAIAN HASIL BELAJAR (6 kolom: No|Mapel|KKM|Nilai|Huruf|Capaian)
//              + Penilaian Sikap + Ekstrakurikuler + Ketidakhadiran + Catatan + TTD
// Mendukung cetak SATU siswa (createRaporMtsplusPdf) dan cetak MASSAL satu kelas/
// seluruh siswa (createRaporMtsplusPdfBulk) — ratusan siswa jadi satu PDF sekaligus.

const PDFDocument = require('pdfkit')
const { formatTanggalLahir } = require('./format-tanggal.cjs')
const QRCode = require('qrcode')
const { getTenantSettings } = require('./tenant-settings.cjs')
const { terbilang, nilaiKeAbjad, semesterRange } = require('./rapor-k13-service.cjs')
const { computeRaporLive, computeRombelRanking } = require('./rapor-grade-service.cjs')
const path = require('path')
const fs = require('fs')

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

// PDFKit hanya bisa membaca JPEG dan PNG. Logo Kemenag diunggah admin sebagai
// WebP (hasil kompresi upload), dan `doc.image()` melempar error untuk format
// itu — ditelan `try {} catch {}` sehingga logo HILANG tanpa jejak. Konversi ke
// PNG sekali, lalu cache agar cetak massal 500 siswa tidak mengonversi file
// yang sama 500 kali.
//
// PENTING: hasil konversi ditulis ke BERKAS, bukan Buffer. PDFKit hanya
// mendeduplikasi objek gambar bila diberi path; Buffer yang sama ditanam ulang
// di setiap halaman. Pada rapor massal satu kelas itu berarti logo dicetak
// ulang 3x per siswa — puluhan MB byte yang isinya identik.
const _cacheGambar = new Map()
const _dirCache = path.join(require('os').tmpdir(), 'jurnalku-pdf-img')
async function siapkanGambar(filePath, maxW = 420) {
  if (!filePath) return null
  const kunci = `${filePath}|${maxW}`
  if (_cacheGambar.has(kunci)) return _cacheGambar.get(kunci)
  let hasil = null
  try {
    const sharp = require('sharp')
    const ext = path.extname(filePath).toLowerCase()
    const meta = await sharp(filePath).metadata()
    // File kecil yang sudah JPEG/PNG dipakai apa adanya (hindari re-encode).
    if (['.jpg', '.jpeg', '.png'].includes(ext) && (meta.width || 0) <= maxW) {
      hasil = filePath
    } else {
      // Resize ke lebar cetak + kompres. Tanpa ini, cetak massal satu kelas
      // menghasilkan PDF puluhan MB karena foto 900x1200 diulang tiap siswa.
      await fs.promises.mkdir(_dirCache, { recursive: true })
      const tujuan = path.join(_dirCache, `${require('crypto').createHash('sha1').update(kunci).digest('hex')}.png`)
      if (!fs.existsSync(tujuan)) {
        await sharp(filePath)
          .resize({ width: maxW, withoutEnlargement: true })
          .png({ compressionLevel: 9, palette: true })
          .toFile(tujuan)
      }
      hasil = tujuan
    }
  } catch {
    hasil = null // format benar-benar tidak terbaca — jangan gagalkan seluruh rapor
  }
  _cacheGambar.set(kunci, hasil)
  return hasil
}

function romawi(n) {
  // Hanya ubah ANGKA MURNI ("8" -> "VIII"). Nama rombel yang sudah berbentuk
  // "VIII-A" harus dibiarkan apa adanya; sebelumnya fungsi ini mengembalikan
  // string aslinya sehingga hasilnya benar, tetapi pemanggil memakai `||` yang
  // membuat nilai kosong jatuh ke '-'. Dijaga eksplisit agar aman.
  const s = String(n ?? '').trim()
  const table = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII' }
  if (/^\d+$/.test(s)) return table[parseInt(s, 10)] || s
  return s
}

function jenisLabel(jenis) {
  return jenis === 'rapor_sas' ? 'SUMATIF AKHIR SEMESTER (SAS)' : 'SUMATIF TENGAH SEMESTER (STS)'
}

// Peringkat siswa dalam satu rombel berdasarkan rata-rata nilai akhir.
function hitungRank(db, tenantId, rombelId, tahunAjaran, semester, jenis, siswaId) {
  const rows = db.prepare(`
    SELECT r.siswa_id, AVG(COALESCE(r.nilai_akhir, 0)) AS rata
    FROM rapor r JOIN siswa s ON s.id = r.siswa_id AND s.tenant_id = r.tenant_id
    WHERE r.tenant_id=? AND s.rombel_id=? AND r.tahun_ajaran=? AND r.semester=? AND r.jenis=?
      AND COALESCE(s.status,'aktif')='aktif'
    GROUP BY r.siswa_id
  `).all(tenantId, rombelId, tahunAjaran, semester, jenis)
  if (!rows.length) return { rank: 0, totalSiswa: 0 }
  rows.sort((a, b) => b.rata - a.rata)
  const idx = rows.findIndex(r => r.siswa_id === siswaId)
  return { rank: idx >= 0 ? idx + 1 : 0, totalSiswa: rows.length }
}

// Kop surat: logo kemenag (kiri) + instansi/lembaga/NSM/NPSN/alamat (tengah) + logo lembaga.
function drawKop(doc, settings, logo, y) {
  const W = doc.page.width
  const M = doc.page.margins.left
  // Nama properti HARUS `lembagaLogoPath` (bukan `lembagaPath`) — sebelumnya
  // salah nama sehingga logo lembaga tidak pernah tercetak di kop mana pun.
  if (logo.kemenagPath) { try { doc.image(logo.kemenagPath, M, y, { fit: [52, 52] }) } catch {} }
  if (logo.lembagaLogoPath) { try { doc.image(logo.lembagaLogoPath, W - M - 52, y, { fit: [52, 52] }) } catch {} }

  const tx = M + 60
  const tw = W - 2 * (M + 60)
  doc.font('Helvetica-Bold').fontSize(11).fillColor('black')
  doc.text(safeText(settings.nama_instansi, 'KEMENTERIAN AGAMA REPUBLIK INDONESIA').toUpperCase(), tx, y, { width: tw, align: 'center', lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(13)
  doc.text(safeText(settings.nama_lembaga, 'Nama Lembaga').toUpperCase(), tx, y + 14, { width: tw, align: 'center', lineBreak: false })
  const nsmNpsn = [settings.nsm ? `NSM : ${settings.nsm}` : '', settings.npsn ? `NPSN : ${settings.npsn}` : ''].filter(Boolean).join('  |  ')
  doc.font('Helvetica-Bold').fontSize(9)
  if (nsmNpsn) doc.text(nsmNpsn, tx, y + 30, { width: tw, align: 'center', lineBreak: false })
  doc.font('Helvetica').fontSize(8)
  if (settings.alamat) doc.text(safeText(settings.alamat), tx, y + 43, { width: tw, align: 'center', lineBreak: false })
  const kontak = [settings.email ? `Email: ${settings.email}` : '', settings.telepon ? `Telp: ${settings.telepon}` : ''].filter(Boolean).join('  |  ')
  if (kontak) doc.text(kontak, tx, y + 53, { width: tw, align: 'center', lineBreak: false })

  const ruleY = y + 66
  doc.moveTo(M, ruleY).lineTo(W - M, ruleY).lineWidth(2).strokeColor('black').stroke()
  return ruleY + 8
}

// Muat seluruh data satu siswa (query identik dengan renderer RDM).
// Return null (siswa tidak ada), {error:'RAPOR_NOT_GENERATED'}, atau bundle data.
async function loadStudentData(db, { tenantId, siswaId, tahunAjaran, semester, jenis, uploadDir }) {
  const siswa = db.prepare(`
    SELECT s.*, r.nama AS rombel_nama, r.tingkat, g.nama AS wali_kelas_nama
    FROM siswa s LEFT JOIN rombel r ON s.rombel_id=r.id AND r.tenant_id=s.tenant_id
    LEFT JOIN gtk g ON r.wali_kelas_id=g.id AND g.tenant_id=s.tenant_id
    WHERE s.id=? AND s.tenant_id=?
  `).get(siswaId, tenantId)
  if (!siswa) return null

  const settings = getTenantSettings(db, tenantId) || {}

  // Hitung nilai rapor SECARA LANGSUNG dari penilaian_harian + asesmen, tanpa
  // butuh baris rapor ter-materialisasi (tidak ada langkah "generate" manual).
  const { from, to } = semesterRange(semester, tahunAjaran)
  const live = computeRaporLive(db, { tenantId, siswaId, rombelId: siswa.rombel_id, tahunAjaran, semester, jenis })
  const rapor = live.rows
  if (rapor.length === 0) return { error: 'RAPOR_NOT_GENERATED' }

  const absensiRows = db.prepare(`SELECT lower(status) AS status, COUNT(DISTINCT tanggal) AS jumlah
    FROM absensi_siswa WHERE siswa_id=? AND tenant_id=? AND tanggal>=? AND tanggal<=? GROUP BY lower(status)`)
    .all(siswaId, tenantId, from, to)
  const kehadiran = { sakit: 0, izin: 0, alpa: 0 }
  for (const row of absensiRows) {
    const key = ['alpha', 'tanpa_keterangan'].includes(row.status) ? 'alpa' : row.status
    if (Object.hasOwn(kehadiran, key)) kehadiran[key] += Number(row.jumlah) || 0
  }

  const kepribadian = db.prepare(`SELECT sikap_spiritual,sikap_sosial,sikap_umum,kelakuan,kerajinan,kerapian,kedisiplinan,catatan_wali_kelas,saran
    FROM catatan_kepribadian WHERE siswa_id=? AND tahun_ajaran=? AND semester=? AND tenant_id=? ORDER BY updated_at DESC LIMIT 1`)
    .get(siswaId, tahunAjaran, semester, tenantId) || {}

  const pelengkap = db.prepare(`SELECT prestasi,catatan_wali_kelas,tanggapan_orang_tua,tanggal_pembagian FROM rapor_pelengkap WHERE tenant_id=? AND siswa_id=? AND tahun_ajaran=? AND semester=? AND jenis=?`)
    .get(tenantId, siswaId, tahunAjaran, semester, jenis) || {}

  const ekstrakurikuler = db.prepare(`SELECT e.id,e.nama,e.jenis_kegiatan,
      COUNT(a.id) AS total_pertemuan,
      SUM(CASE WHEN lower(a.status)='hadir' THEN 1 ELSE 0 END) AS hadir
    FROM ekskul_anggota ea JOIN ekskul e ON e.id=ea.ekskul_id AND e.tenant_id=ea.tenant_id
    LEFT JOIN absensi_ekskul a ON a.ekskul_id=e.id AND a.siswa_id=ea.siswa_id AND a.tenant_id=ea.tenant_id AND a.tanggal>=? AND a.tanggal<=?
    WHERE ea.siswa_id=? AND ea.tenant_id=? GROUP BY e.id,e.nama,e.jenis_kegiatan ORDER BY e.jenis_kegiatan,e.nama`)
    .all(from, to, siswaId, tenantId)
    .map(row => ({ ...row, nilai: row.total_pertemuan ? Math.round((row.hadir / row.total_pertemuan) * 100) : null }))

  const jumlahNilai = live.jumlah
  const rataAkhir = live.rata
  const ranking = computeRombelRanking(db, { tenantId, rombelId: siswa.rombel_id, tahunAjaran, semester, jenis })
  const rank = { rank: ranking.findIndex(r => r.siswa_id === siswaId) + 1, totalSiswa: ranking.length }

  const qrDataUrl = await QRCode.toDataURL(`Rapor - ${siswa.nama} - Kepsek: ${settings.kepala_sekolah || '-'} - Diverifikasi digital`)
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64')

  const fotoPath = resolveUploadPath(uploadDir, siswa.foto)
  const kemenagUpload = resolveUploadPath(uploadDir, settings.logo_kemenag)
  const kemenagPath = kemenagUpload || path.join(__dirname, 'assets', 'kemenag-logo.svg')
  const lembagaLogoPath = resolveUploadPath(uploadDir, settings.logo)
  // Konversi format yang tidak dibaca PDFKit (WebP logo Kemenag adalah kasus
  // nyata di produksi) SEBELUM render. Tanpa ini, `doc.image()` gagal diam-diam
  // dan sampul/kop tercetak tanpa logo.
  const logo = {
    kemenagPath: await siapkanGambar(fs.existsSync(kemenagPath) ? kemenagPath : null),
    lembagaLogoPath: await siapkanGambar(lembagaLogoPath),
  }
  const fotoSiap = await siapkanGambar(fotoPath)

  const tglRapor = safeText(pelengkap.tanggal_pembagian, new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))
  const kota = safeText(settings.kota_cetak || settings.kota, '')
  const namaKepsek = safeText(settings.kepala_sekolah, '................................................')

  return {
    siswa, settings, rapor, kehadiran, kepribadian, pelengkap, ekstrakurikuler,
    jumlahNilai, rataAkhir, rank, qrBuffer, fotoPath: fotoSiap, logo, tglRapor, kota, namaKepsek,
    semester, tahunAjaran, jenis,
  }
}

// Render halaman satu siswa ke doc (sudah berisi data lengkap dari loadStudentData).
function renderStudentPages(doc, data, bagian) {
  const { siswa, settings, rapor, kehadiran, kepribadian, pelengkap, ekstrakurikuler, jumlahNilai, rataAkhir, rank, qrBuffer, fotoPath, logo, tglRapor, kota, namaKepsek, semester, tahunAjaran, jenis } = data
  const cetakCover = bagian === 'cover' || bagian === 'lengkap'
  const cetakIdentitas = bagian === 'identitas' || bagian === 'lengkap'
  const butuhNilai = bagian === 'nilai' || bagian === 'lengkap'
  const W = 595.28
  const H = 841.89
  const M = 34

  // ---------- HALAMAN 1: COVER ----------
  if (cetakCover) {
    doc.addPage({ size: 'A4', margin: 34 })
    // Bingkai ganda seperti rapor cetak resmi.
    doc.rect(18, 18, W - 36, H - 36).lineWidth(4).strokeColor('black').stroke()
    doc.rect(26, 26, W - 52, H - 52).lineWidth(1).stroke()

    // ---- Tata letak mengikuti dokumen resmi "IDENTITAS RAPOR.docx" ----
    //
    // Proporsi diambil dari PDF hasil konversi dokumen itu (halaman 936pt):
    //   logo Kemenag   y  2.7%  135x121pt
    //   logo lembaga   y 21.4%  135x132pt
    //   "RAPOR"        y 24.6%  tinggi huruf 49pt
    //   "MADRASAH ..." y 31.6%  tinggi 27pt
    //   nama lembaga   y 35.7%  tinggi 45pt (bisa 2 baris)
    //   NSM / NPSN     y 47.7%
    //   kotak nama     y 71.4%
    //   instansi+yayasan di kaki halaman
    //
    // Sebelumnya sampul memakai susunan sendiri (RAPOR PESERTA DIDIK + badge
    // STS/SAS di tengah), sehingga bentuknya berbeda dari rapor resmi madrasah.

    // Logo instansi di atas, logo lembaga di bawahnya.
    if (logo.kemenagPath) { try { doc.image(logo.kemenagPath, W / 2 - 67, H * 0.027, { fit: [135, 121] }) } catch {} }
    if (logo.lembagaLogoPath) { try { doc.image(logo.lembagaLogoPath, W / 2 - 67, H * 0.214, { fit: [135, 132] }) } catch {} }

    // "RAPOR" — huruf besar berjarak lebar.
    doc.font('Helvetica-Bold').fontSize(36).fillColor('black')
    doc.text('R A P O R', M, H * 0.246, { width: W - 2 * M, align: 'center', characterSpacing: 2 })

    doc.font('Helvetica-Bold').fontSize(19)
    // Jenjang diambil dari settings, bukan ditanam. Lembaga MI/MA harus
    // tercetak dengan jenjangnya sendiri; sebelumnya baris ini selalu
    // "MADRASAH TSANAWIYAH" sehingga MI dan MA ikut salah.
    const jenjangKode = String(settings.jenjang || 'MTs').toUpperCase()
    const jenjangBaris = jenjangKode === 'MI' ? 'MADRASAH IBTIDAIYAH'
      : jenjangKode === 'MA' ? 'MADRASAH ALIYAH'
      : jenjangKode === 'MTS' ? 'MADRASAH TSANAWIYAH'
      : safeText(settings.jenjang, 'MADRASAH').toUpperCase()
    doc.text(jenjangBaris, M, H * 0.316, { width: W - 2 * M, align: 'center' })

    // Nama lembaga: bisa panjang, jadi diberi dua baris dan lebar penuh.
    doc.font('Helvetica-Bold').fontSize(24)
    doc.text(safeText(settings.nama_lembaga, '').toUpperCase(), M, H * 0.357, {
      width: W - 2 * M, align: 'center', lineGap: 2,
    })

    // NSM & NPSN sejajar.
    const idn = [settings.nsm ? `NSM: ${settings.nsm}` : '', settings.npsn ? `NPSN: ${settings.npsn}` : ''].filter(Boolean).join('    ')
    if (idn) {
      doc.font('Helvetica').fontSize(12)
      doc.text(idn, M, H * 0.477, { width: W - 2 * M, align: 'center' })
    }

    // Kotak identitas peserta didik.
    const boxY = H * 0.714
    const boxW = 330
    const boxH = 118
    doc.rect(W / 2 - boxW / 2, boxY, boxW, boxH).lineWidth(1.5).strokeColor('black').stroke()

    doc.font('Helvetica').fontSize(11).fillColor('black')
    doc.text('NAMA PESERTA DIDIK', W / 2 - boxW / 2 + 18, boxY + 14, { width: boxW - 36, align: 'center', lineBreak: false })
    doc.font('Helvetica-Bold').fontSize(15)
    doc.text(safeText(siswa.nama, '').toUpperCase(), W / 2 - boxW / 2 + 12, boxY + 32, { width: boxW - 24, align: 'center' })

    doc.font('Helvetica').fontSize(11)
    doc.text('NIS / NISN', W / 2 - boxW / 2 + 18, boxY + 64, { width: boxW - 36, align: 'center', lineBreak: false })
    const nisnSampul = String(siswa.nisn || '').split('#')[1] || safeText(siswa.nisn, '')
    doc.font('Helvetica-Bold').fontSize(13)
    doc.text(`${safeText(siswa.nis, '')} / ${nisnSampul}`, W / 2 - boxW / 2 + 12, boxY + 84, { width: boxW - 24, align: 'center', lineBreak: false })

    // Kaki halaman: instansi, yayasan, alamat.
    doc.font('Helvetica-Bold').fontSize(11)
    const instansi = safeText(settings.nama_instansi, 'KEMENTERIAN AGAMA REPUBLIK INDONESIA')
    doc.text(instansi.toUpperCase(), M, H - 120, { width: W - 2 * M, align: 'center' })
    if (settings.yayasan_nama) {
      doc.font('Helvetica').fontSize(10)
      doc.text(String(settings.yayasan_nama).toUpperCase(), M, H - 104, { width: W - 2 * M, align: 'center' })
    }
    const kaki = [settings.alamat, [settings.telepon ? `Telp. ${settings.telepon}` : '', settings.email || ''].filter(Boolean).join(' | ')].filter(Boolean).join('\n')
    if (kaki) {
      doc.font('Helvetica').fontSize(8)
      doc.text(kaki, M, H - 86, { width: W - 2 * M, align: 'center', lineGap: 1 })
    }
  }

  // ---------- HALAMAN 2: IDENTITAS ----------
  if (cetakIdentitas) {
    doc.addPage({ size: 'A4', margin: 34 })
    let y = drawKop(doc, settings, logo, 30)

    doc.font('Helvetica-Bold').fontSize(14)
    doc.text('IDENTITAS PESERTA DIDIK', M, y + 6, { width: W - 2 * M, align: 'center', underline: true })
    y += 36

    const nisData = String(siswa.nisn || '-').split('#')
    const nisLokal = safeText(siswa.nis)
    const nisnNasional = nisData[1] || safeText(siswa.nisn)
    // Nomor urut kini berurutan dan tidak berulang. Sebelumnya bagian orang
    // tua/wali memakai nomor kosong dan label 'a.'/'b.'/'c.' dua kali (ayah-ibu,
    // lalu pekerjaan) sehingga hasil cetak terbaca seperti daftar yang rusak.
    const rows = [
      ['1.', 'Nama Lengkap', safeText(siswa.nama).toUpperCase()],
      ['2.', 'NIS / NISN', `${nisLokal} / ${nisnNasional}`],
      ['3.', 'Tempat, Tanggal Lahir', `${safeText(siswa.tempat_lahir)}, ${formatTanggalLahir(siswa.tanggal_lahir)}`],
      ['4.', 'Jenis Kelamin', siswa.jenis_kelamin === 'L' ? 'Laki-laki' : siswa.jenis_kelamin === 'P' ? 'Perempuan' : safeText(siswa.jenis_kelamin)],
      ['5.', 'Agama', safeText(siswa.agama, 'Islam')],
      ['6.', 'Status dalam Keluarga', safeText(siswa.status_keluarga, 'Anak Kandung')],
      ['7.', 'Anak Ke', safeText(siswa.anak_ke)],
      ['8.', 'Alamat Peserta Didik', safeText(siswa.alamat)],
      ['9.', 'Nomor Telepon Rumah', safeText(siswa.no_hp)],
      ['10.', 'Sekolah Asal (SD/MI)', safeText(siswa.asal_sekolah)],
      ['11.', 'Nama Ayah', safeText(siswa.nama_ayah)],
      ['12.', 'Pekerjaan Ayah', safeText(siswa.kerja_ayah)],
      ['13.', 'Nama Ibu', safeText(siswa.nama_ibu)],
      ['14.', 'Pekerjaan Ibu', safeText(siswa.kerja_ibu)],
      ['15.', 'Nama Wali Peserta Didik', safeText(siswa.nama_wali)],
      ['16.', 'Pekerjaan Wali', safeText(siswa.kerja_wali)],
    ]
    doc.fontSize(11)
    for (const [no, label, val] of rows) {
      if (y > 700) { doc.addPage({ size: 'A4', margin: 34 }); y = 50 }
      doc.font('Helvetica')
      doc.text(`${no} ${label}`, M + 10, y, { width: 160, lineBreak: false })
      doc.text(':', M + 172, y, { width: 10, lineBreak: false })
      doc.text(val, M + 184, y, { width: W - M - 184 - 10, lineBreak: false })
      y += 20
    }

    const sigY = Math.max(y + 20, 660)
    if (fotoPath) { try { doc.image(fotoPath, M + 20, sigY, { fit: [85, 113] }) } catch {} }
    else {
      doc.rect(M + 20, sigY, 85, 113).lineWidth(1).stroke()
      doc.font('Helvetica').fontSize(8).text('PAS FOTO\n3 X 4', M + 20, sigY + 45, { width: 85, align: 'center', lineBreak: false })
    }
    doc.font('Helvetica-Bold').fontSize(11)
    doc.text(`${kota}${kota ? ', ' : ''}${tglRapor}`, W - M - 200, sigY, { width: 190, align: 'center', lineBreak: false })
    doc.font('Helvetica').fontSize(11)
    doc.text('Kepala Madrasah', W - M - 200, sigY + 20, { width: 190, align: 'center', lineBreak: false })
    if (qrBuffer) { try { doc.image(qrBuffer, W - M - 160, sigY + 40, { fit: [50, 50] }) } catch {} }
    doc.font('Helvetica-Bold').fontSize(11)
    doc.text(namaKepsek.toUpperCase(), W - M - 200, sigY + 95, { width: 190, align: 'center', underline: true, lineBreak: false })
  }

  // ---------- HALAMAN 3: NILAI ----------
  if (butuhNilai) {
    doc.addPage({ size: 'A4', margin: 34 })
    let y = drawKop(doc, settings, logo, 30)

    doc.font('Helvetica-Bold').fontSize(13)
    doc.text(`CAPAIAN HASIL BELAJAR ${jenisLabel(jenis)}`, M, y + 4, { width: W - 2 * M, align: 'center', underline: true })
    y += 30

    doc.font('Helvetica-Bold').fontSize(9)
    doc.text('Nama', M, y, { width: 40, lineBreak: false })
    doc.text(`: ${safeText(siswa.nama).toUpperCase()}`, M + 42, y, { width: 200, lineBreak: false })
    doc.text('Kelas', W / 2 + 30, y, { width: 30, lineBreak: false })
    doc.text(`: ${romawi(siswa.rombel_nama) || safeText(siswa.rombel_nama)}`, W / 2 + 62, y, { width: 100, lineBreak: false })
    doc.text('NIS/NISN', M, y + 14, { width: 40, lineBreak: false })
    doc.text(`: ${safeText(siswa.nis)} / ${safeText(siswa.nisn)}`, M + 42, y + 14, { width: 200, lineBreak: false })
    // "Semester" butuh lebar 48pt; sebelumnya 40pt sehingga label terpotong
    // menjadi "Semeste" + "r" yang membungkus ke baris berikutnya.
    doc.text('Semester', W / 2 + 30, y + 14, { width: 48, lineBreak: false })
    doc.text(`: ${semester === 'ganjil' ? 'Ganjil' : 'Genap'} (${tahunAjaran})`, W / 2 + 82, y + 14, { width: 160, lineBreak: false })
    y += 34

    // Kolom tabel nilai. Lebar total HARUS pas di dalam margin: sebelumnya
    // `capaian.w = W - M - 396` membuat tepi kanan tabel jatuh di x=595.28 —
    // melewati batas kertas, sehingga garis tabel terpotong saat dicetak.
    const cols = { no: { x: M, w: 22 }, mapel: { x: M + 22, w: 186 }, kkm: { x: M + 208, w: 30 }, nilai: { x: M + 238, w: 30 }, huruf: { x: M + 268, w: 116 }, capaian: { x: M + 384, w: W - M - (M + 384) } }
    const drawHeader = () => {
      doc.font('Helvetica-Bold').fontSize(8)
      doc.rect(M, y, W - 2 * M, 18).lineWidth(1).stroke()
      doc.text('No', cols.no.x, y + 5, { width: cols.no.w, align: 'center', lineBreak: false })
      doc.text('Mata Pelajaran', cols.mapel.x, y + 5, { width: cols.mapel.w, align: 'left', lineBreak: false })
      doc.text('KKM', cols.kkm.x, y + 5, { width: cols.kkm.w, align: 'center', lineBreak: false })
      doc.text('Nilai', cols.nilai.x, y + 5, { width: cols.nilai.w, align: 'center', lineBreak: false })
      doc.text('Huruf (Terbilang)', cols.huruf.x, y + 5, { width: cols.huruf.w, align: 'center', lineBreak: false })
      doc.text('Capaian', cols.capaian.x, y + 5, { width: cols.capaian.w, align: 'center', lineBreak: false })
      y += 18
    }
    const rowH = 17
    const drawRow = (no, nama, kkm, nilai, huruf, capaian, bold = false) => {
      // Halaman lanjutan WAJIB memakai kop lagi. Sebelumnya `y = 50` tanpa
      // `drawKop()`, sehingga tabel nilai halaman kedua melayang tanpa identitas
      // lembaga — dokumen resmi tidak boleh seperti itu.
      if (y + rowH > 760) {
        doc.addPage({ size: 'A4', margin: 34 })
        y = drawKop(doc, settings, logo, 30)
        doc.font('Helvetica-Bold').fontSize(10)
        doc.text(`CAPAIAN HASIL BELAJAR ${jenisLabel(jenis)} (lanjutan)`, M, y + 2, { width: W - 2 * M, align: 'center', lineBreak: false })
        y += 20
        drawHeader()
      }
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
      doc.rect(M, y, W - 2 * M, rowH).lineWidth(0.7).stroke()
      doc.moveTo(cols.mapel.x, y).lineTo(cols.mapel.x, y + rowH).stroke()
      doc.moveTo(cols.kkm.x, y).lineTo(cols.kkm.x, y + rowH).stroke()
      doc.moveTo(cols.nilai.x, y).lineTo(cols.nilai.x, y + rowH).stroke()
      doc.moveTo(cols.huruf.x, y).lineTo(cols.huruf.x, y + rowH).stroke()
      doc.moveTo(cols.capaian.x, y).lineTo(cols.capaian.x, y + rowH).stroke()
      doc.text(String(no ?? ''), cols.no.x, y + 4, { width: cols.no.w, align: 'center', lineBreak: false })
      doc.text(safeText(nama), cols.mapel.x + 4, y + 4, { width: cols.mapel.w - 8, lineBreak: false })
      doc.text(String(kkm ?? ''), cols.kkm.x, y + 4, { width: cols.kkm.w, align: 'center', lineBreak: false })
      doc.text(String(nilai ?? ''), cols.nilai.x, y + 4, { width: cols.nilai.w, align: 'center', lineBreak: false })
      doc.text(safeText(huruf), cols.huruf.x + 3, y + 4, { width: cols.huruf.w - 6, lineBreak: false })
      doc.text(safeText(capaian), cols.capaian.x + 3, y + 4, { width: cols.capaian.w - 6, lineBreak: false })
      y += rowH
    }

    drawHeader()
    rapor.forEach((r, i) => {
      const nilai = Number(r.nilai_akhir) || 0
      const kkm = Number(r.kkm) || 70
      drawRow(i + 1, r.mapel_nama, kkm, nilai, terbilang(nilai), nilai >= kkm ? 'Tercapai' : 'Belum Tercapai')
    })
    drawRow('', 'Jumlah Total', '', jumlahNilai, terbilang(jumlahNilai), '', true)
    drawRow('', 'Rata-Rata', '', rataAkhir.toFixed(1), '', `Peringkat: ${rank.rank} dari ${rank.totalSiswa}`, true)

    y += 4
    const sikap = [
      ['Kelakuan', kepribadian.kelakuan],
      ['Kerajinan', kepribadian.kerajinan],
      ['Kerapian', kepribadian.kerapian],
      ['Kedisiplinan', kepribadian.kedisiplinan],
      ['Sikap Spiritual', kepribadian.sikap_spiritual],
      ['Sikap Sosial', kepribadian.sikap_sosial],
    ].filter(([, v]) => v !== undefined && v !== null && v !== '')
    if (sikap.length) {
      doc.font('Helvetica-Bold').fontSize(8)
      doc.rect(M, y, W - 2 * M, 16).lineWidth(1).stroke()
      doc.text('Penilaian Sikap Wali Kelas', M, y + 4, { width: W - 2 * M, align: 'center', lineBreak: false })
      y += 16
      doc.font('Helvetica').fontSize(8)
      let sx = M
      sikap.forEach(([label, v]) => {
        const cellW = (W - 2 * M) / sikap.length
        doc.rect(sx, y, cellW, 16).lineWidth(0.7).stroke()
        doc.text(label, sx + 3, y + 3, { width: cellW - 6, align: 'left', lineBreak: false })
        doc.font('Helvetica-Bold')
        const abjad = nilaiKeAbjad(v)
        doc.text(abjad !== '-' ? abjad : safeText(v), sx + 3, y + 3, { width: cellW - 6, align: 'right', lineBreak: false })
        doc.font('Helvetica')
        sx += cellW
      })
      y += 20
    }

    const halfW = (W - 2 * M - 10) / 2
    const ex = M
    const ax = M + halfW + 10
    doc.font('Helvetica-Bold').fontSize(8)
    doc.rect(ex, y, halfW, 16).lineWidth(1).stroke()
    doc.text('Ekstrakurikuler', ex, y + 4, { width: halfW, align: 'center', lineBreak: false })
    doc.rect(ax, y, halfW, 16).lineWidth(1).stroke()
    doc.text('Ketidakhadiran', ax, y + 4, { width: halfW, align: 'center', lineBreak: false })
    y += 16
    doc.font('Helvetica').fontSize(8)
    const eksRows = ekstrakurikuler.slice(0, 2)
    let ey = y
    for (const e of eksRows) {
      doc.text(safeText(e.nama), ex + 3, ey + 3, { width: halfW - 30, lineBreak: false })
      doc.text(e.nilai != null ? String(e.nilai) : '-', ex + halfW - 25, ey + 3, { width: 22, align: 'center', lineBreak: false })
      ey += 14
    }
    if (!eksRows.length) doc.text('..............................', ex + 3, ey + 3, { width: halfW - 30, lineBreak: false })
    const abs = [['Sakit', kehadiran.sakit], ['Izin', kehadiran.izin], ['Tanpa Keterangan', kehadiran.alpa]]
    abs.forEach(([lbl, v]) => {
      doc.text(lbl, ax + 3, y + 3, { width: halfW - 50, lineBreak: false })
      doc.text(`${v} hari`, ax + halfW - 40, y + 3, { width: 38, align: 'right', lineBreak: false })
      y += 14
    })
    y = Math.max(y, ey) + 8

    doc.font('Helvetica-Bold').fontSize(8)
    doc.rect(M, y, W - 2 * M, 26).lineWidth(1).stroke()
    doc.text('Catatan Wali Kelas:', M + 4, y + 4, { width: W - 2 * M - 8, lineBreak: false })
    doc.font('Helvetica-Oblique').fontSize(8)
    doc.text(`"${safeText(pelengkap.catatan_wali_kelas || kepribadian.catatan_wali_kelas || kepribadian.saran, 'Tingkatkan terus kedisiplinan dan semangat belajarmu.')}"`, M + 4, y + 15, { width: W - 2 * M - 8, lineBreak: false })
    y += 34

    const ttdY = Math.max(y + 20, 700)
    doc.font('Helvetica').fontSize(9)
    doc.text('Mengetahui,\nOrang Tua / Wali', M, ttdY, { width: (W - 2 * M) / 3, align: 'center' })
    doc.font('Helvetica-Bold').text('( ...................................... )', M, ttdY + 50, { width: (W - 2 * M) / 3, align: 'center' })

    doc.font('Helvetica').fontSize(9)
    doc.text('Kepala Madrasah', M + (W - 2 * M) / 3, ttdY, { width: (W - 2 * M) / 3, align: 'center' })
    if (qrBuffer) { try { doc.image(qrBuffer, M + (W - 2 * M) / 3 + ((W - 2 * M) / 3 - 34) / 2, ttdY + 16, { fit: [34, 34] }) } catch {} }
    doc.font('Helvetica-Bold')
    doc.text(namaKepsek.toUpperCase(), M + (W - 2 * M) / 3, ttdY + 52, { width: (W - 2 * M) / 3, align: 'center', underline: true })

    doc.font('Helvetica').fontSize(9)
    doc.text(`${kota}${kota ? ', ' : ''}${tglRapor}\nWali Kelas ${romawi(siswa.rombel_nama) || ''}`, M + 2 * (W - 2 * M) / 3, ttdY, { width: (W - 2 * M) / 3, align: 'center' })
    doc.font('Helvetica-Bold')
    doc.text(safeText(siswa.wali_kelas_nama).toUpperCase(), M + 2 * (W - 2 * M) / 3, ttdY + 52, { width: (W - 2 * M) / 3, align: 'center', underline: true })
  }
}

// Cetak SATU siswa.
async function createRaporMtsplusPdf(db, options) {
  const { tenantId, siswaId, tahunAjaran, semester, jenis, uploadDir } = options
  const bagian = options.bagian || 'lengkap'
  const butuhNilai = bagian === 'nilai' || bagian === 'lengkap'
  const data = await loadStudentData(db, { tenantId, siswaId, tahunAjaran, semester, jenis, uploadDir })
  if (!data) return null
  if (data.error && butuhNilai) return { error: data.error }
  // cover/identitas bisa dicetak walau rapor belum digenerate (data error hanya saat butuh nilai)
  if (data.error && !butuhNilai) {
    // bangun data minimal untuk cover/identitas
    return createRaporMtsplusPdfPartial(db, { tenantId, siswaId, tahunAjaran, semester, jenis, uploadDir, bagian })
  }
  const doc = new PDFDocument({ size: 'A4', margin: 34, bufferPages: true, autoFirstPage: false })
  renderStudentPages(doc, data, bagian)
  return doc
}

// Cover/identitas tetap bisa dicetak walau nilai belum digenerate.
async function createRaporMtsplusPdfPartial(db, { tenantId, siswaId, tahunAjaran, semester, jenis, uploadDir, bagian }) {
  const siswa = db.prepare(`
    SELECT s.*, r.nama AS rombel_nama, r.tingkat, g.nama AS wali_kelas_nama
    FROM siswa s LEFT JOIN rombel r ON s.rombel_id=r.id AND r.tenant_id=s.tenant_id
    LEFT JOIN gtk g ON r.wali_kelas_id=g.id AND g.tenant_id=s.tenant_id
    WHERE s.id=? AND s.tenant_id=?
  `).get(siswaId, tenantId)
  if (!siswa) return null
  const settings = getTenantSettings(db, tenantId) || {}
  const qrDataUrl = await QRCode.toDataURL(`Rapor - ${siswa.nama} - Kepsek: ${settings.kepala_sekolah || '-'} - Diverifikasi digital`)
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64')
  const kemenagUpload = resolveUploadPath(uploadDir, settings.logo_kemenag)
  const kemenagPath = kemenagUpload || path.join(__dirname, 'assets', 'kemenag-logo.svg')
  const data = {
    siswa, settings, rapor: [], kehadiran: { sakit: 0, izin: 0, alpa: 0 }, kepribadian: {}, pelengkap: {}, ekstrakurikuler: [],
    jumlahNilai: 0, rataAkhir: 0, rank: { rank: 0, totalSiswa: 0 }, qrBuffer, fotoPath: await siapkanGambar(resolveUploadPath(uploadDir, siswa.foto)),
    // Jalur cetak "cover/identitas saja" memakai konversi yang SAMA supaya logo
    // WebP juga tampil di sini — dulu jalur ini melewati siapkanGambar.
    logo: {
      kemenagPath: await siapkanGambar(fs.existsSync(kemenagPath) ? kemenagPath : null),
      lembagaLogoPath: await siapkanGambar(resolveUploadPath(uploadDir, settings.logo)),
    },
    tglRapor: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
    kota: safeText(settings.kota_cetak || settings.kota, ''), namaKepsek: safeText(settings.kepala_sekolah, '................................................'),
    semester, tahunAjaran, jenis,
  }
  const doc = new PDFDocument({ size: 'A4', margin: 34, bufferPages: true, autoFirstPage: false })
  renderStudentPages(doc, data, bagian)
  return doc
}

// Cetak MASSAL: seluruh siswa aktif dalam satu rombel (atau seluruh tenant bila
// rombelId kosong) menjadi SATU PDF. Siswa yang belum digenerate dilewati.
async function createRaporMtsplusPdfBulk(db, options) {
  const { tenantId, rombelId, tahunAjaran, semester, jenis, uploadDir } = options
  const bagian = options.bagian || 'lengkap'
  const butuhNilai = bagian === 'nilai' || bagian === 'lengkap'

  const siswaRows = rombelId
    ? db.prepare(`SELECT id FROM siswa WHERE tenant_id=? AND rombel_id=? AND COALESCE(status,'aktif')='aktif' ORDER BY nama`)
        .all(tenantId, rombelId)
    : db.prepare(`SELECT id FROM siswa WHERE tenant_id=? AND COALESCE(status,'aktif')='aktif' ORDER BY rombel_id, nama`)
        .all(tenantId)

  const doc = new PDFDocument({ size: 'A4', margin: 34, bufferPages: true, autoFirstPage: false })
  let dicetak = 0
  let dilewati = 0
  for (const row of siswaRows) {
    const data = await loadStudentData(db, { tenantId, siswaId: row.id, tahunAjaran, semester, jenis, uploadDir })
    if (!data) continue
    if (data.error) { dilewati++; continue }
    renderStudentPages(doc, data, bagian)
    dicetak++
  }
  if (dicetak === 0 && dilewati === 0) return null
  doc.meta = { dicetak, dilewati, total: siswaRows.length }
  return doc
}

module.exports = { createRaporMtsplusPdf, createRaporMtsplusPdfBulk, jenisLabel }
