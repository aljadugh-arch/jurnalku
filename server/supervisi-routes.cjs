// Route HTTP Menu Supervisi (kepala lembaga) — akademik & manajerial.
// Dipisah dari supervisi.cjs supaya inti (instrumen, hitung nilai, render laporan)
// bisa diuji tanpa HTTP.
//
// Aturan:
//   - Tenant-scoped lewat req.tenantId.
//   - Bank instrumen + butir editable admin/kepala.
//   - Laporan PDF/JPEG dirender dari HTML yang sama.
//   - Nilai dihitung server (bukan dipercaya dari klien).

const crypto = require('crypto')
const {
  setupSupervisiTables, seedInstrumenBawaan, daftarInstrumen,
  hitungSesi, predikatDari, labelAspek, buildLaporanHtml, ASPEK,
} = require('./supervisi.cjs')
const { getTenantSettings } = require('./tenant-settings.cjs')
const invoiceService = require('./invoice-service.cjs')

function setupSupervisi(db) {
  setupSupervisiTables(db)
  const makeId = () => crypto.randomUUID()
  for (const { id } of db.prepare('SELECT id FROM tenants').all()) {
    try { seedInstrumenBawaan(db, id, makeId) } catch { /* lewati lembaga tanpa id valid */ }
  }
}

function registerSupervisiRoutes(app, db, { requireRole }) {
  const SUPERVISI = requireRole('admin', 'super_admin', 'kepala')

  const aman = (res, fn) => { try { fn() } catch (e) { res.status(400).json({ error: e.message }) } }
  const settingsTenant = (tid) => { try { return getTenantSettings(db, tid) || {} } catch { return {} } }
  const buatId = () => crypto.randomUUID()
  const jaminInstrumen = (tid) => { try { seedInstrumenBawaan(db, tid, buatId) } catch { /* noop */ } }

  const introAspek = (v) => (ASPEK.includes(String(v)) ? String(v) : 'akademik')

  function butirInstrumen(tenantId, instrumenId) {
    return db.prepare('SELECT * FROM supervisi_butir WHERE tenant_id=? AND instrumen_id=? ORDER BY urutan, rowid').all(tenantId, instrumenId)
  }

  function barisSesi(tenantId, id) {
    return db.prepare('SELECT * FROM supervisi_sesi WHERE id=? AND tenant_id=?').get(id, tenantId)
  }

  // ---- Instrumen & butir -------------------------------------------------

  app.get('/api/supervisi/instrumen', SUPERVISI, (req, res) => {
    aman(res, () => {
      jaminInstrumen(req.tenantId)
      res.json({ success: true, instrumen: daftarInstrumen(db, req.tenantId, req.query.aspek || null) })
    })
  })

  app.post('/api/supervisi/instrumen', SUPERVISI, (req, res) => {
    aman(res, () => {
      const { aspek, nama, deskripsi } = req.body || {}
      if (!nama) throw new Error('Nama instrumen wajib')
      const id = buatId()
      db.prepare('INSERT INTO supervisi_instrumen (id, tenant_id, aspek, nama, deskripsi, aktif) VALUES (?,?,?,?,?,1)')
        .run(id, req.tenantId, introAspek(aspek), String(nama).trim(), String(deskripsi || ''))
      res.json({ success: true, instrumen: { id, butir: [] } })
    })
  })

  app.put('/api/supervisi/instrumen/:id', SUPERVISI, (req, res) => {
    aman(res, () => {
      const row = db.prepare('SELECT * FROM supervisi_instrumen WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
      if (!row) throw new Error('Instrumen tidak ditemukan')
      const { nama, deskripsi, aspek, aktif } = req.body || {}
      db.prepare('UPDATE supervisi_instrumen SET nama=?, deskripsi=?, aspek=?, aktif=? WHERE id=? AND tenant_id=?')
        .run(nama !== undefined ? String(nama) : row.nama,
          deskripsi !== undefined ? String(deskripsi) : row.deskripsi,
          aspek !== undefined ? introAspek(aspek) : row.aspek,
          aktif !== undefined ? (aktif ? 1 : 0) : row.aktif,
          req.params.id, req.tenantId)
      res.json({ success: true })
    })
  })

  app.delete('/api/supervisi/instrumen/:id', SUPERVISI, (req, res) => {
    aman(res, () => {
      const row = db.prepare('SELECT id FROM supervisi_instrumen WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
      if (!row) throw new Error('Instrumen tidak ditemukan')
      db.prepare('DELETE FROM supervisi_butir WHERE tenant_id=? AND instrumen_id=?').run(req.tenantId, row.id)
      db.prepare('DELETE FROM supervisi_instrumen WHERE id=? AND tenant_id=?').run(row.id, req.tenantId)
      res.json({ success: true })
    })
  })

  app.post('/api/supervisi/instrumen/:id/butir', SUPERVISI, (req, res) => {
    aman(res, () => {
      const ins = db.prepare('SELECT id FROM supervisi_instrumen WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
      if (!ins) throw new Error('Instrumen tidak ditemukan')
      const { pertanyaan, indikator, max_skor, urutan } = req.body || {}
      if (!pertanyaan) throw new Error('Pertanyaan butir wajib')
      const nextUrut = urutan || (db.prepare('SELECT COALESCE(MAX(urutan),0)+1 AS n FROM supervisi_butir WHERE instrumen_id=?').get(ins.id).n)
      const id = buatId()
      db.prepare('INSERT INTO supervisi_butir (id, tenant_id, instrumen_id, urutan, pertanyaan, indikator, max_skor) VALUES (?,?,?,?,?,?,?)')
        .run(id, req.tenantId, ins.id, Number(nextUrut) || 1, String(pertanyaan).trim(), String(indikator || ''), Math.max(1, Number(max_skor) || 4))
      res.json({ success: true, butir: db.prepare('SELECT * FROM supervisi_butir WHERE id=?').get(id) })
    })
  })

  app.put('/api/supervisi/butir/:id', SUPERVISI, (req, res) => {
    aman(res, () => {
      const row = db.prepare('SELECT * FROM supervisi_butir WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId)
      if (!row) throw new Error('Butir tidak ditemukan')
      const { pertanyaan, indikator, max_skor, urutan } = req.body || {}
      db.prepare('UPDATE supervisi_butir SET pertanyaan=?, indikator=?, max_skor=?, urutan=? WHERE id=? AND tenant_id=?')
        .run(pertanyaan !== undefined ? String(pertanyaan) : row.pertanyaan,
          indikator !== undefined ? String(indikator) : row.indikator,
          max_skor !== undefined ? Math.max(1, Number(max_skor) || 4) : row.max_skor,
          urutan !== undefined ? Number(urutan) : row.urutan,
          row.id, req.tenantId)
      res.json({ success: true })
    })
  })

  app.delete('/api/supervisi/butir/:id', SUPERVISI, (req, res) => {
    aman(res, () => {
      const info = db.prepare('DELETE FROM supervisi_butir WHERE id=? AND tenant_id=?').run(req.params.id, req.tenantId)
      res.json({ success: true, dihapus: info.changes })
    })
  })

  // ---- Sesi supervisi ----------------------------------------------------

  app.get('/api/supervisi/sesi', SUPERVISI, (req, res) => {
    aman(res, () => {
      const from = String(req.query.from || '').slice(0, 10)
      const to = String(req.query.to || '').slice(0, 10)
      const aspek = req.query.aspek ? String(req.query.aspek) : ''
      let sql = 'SELECT * FROM supervisi_sesi WHERE tenant_id=?'
      const args = [req.tenantId]
      if (from) { sql += ' AND tanggal>=?'; args.push(from) }
      if (to) { sql += ' AND tanggal<=?'; args.push(to) }
      if (aspek) { sql += ' AND aspek=?'; args.push(aspek) }
      sql += ' ORDER BY tanggal DESC, datetime(created_at) DESC LIMIT 300'
      res.json({ success: true, sesi: db.prepare(sql).all(...args) })
    })
  })

  app.get('/api/supervisi/sesi/:id', SUPERVISI, (req, res) => {
    aman(res, () => {
      const sesi = barisSesi(req.tenantId, req.params.id)
      if (!sesi) return res.status(404).json({ error: 'Sesi tidak ditemukan' })
      const butir = butirInstrumen(req.tenantId, sesi.instrumen_id)
      const skor = db.prepare('SELECT * FROM supervisi_skor WHERE sesi_id=?').all(sesi.id)
      res.json({ success: true, sesi, butir, skor, aspek_label: labelAspek(sesi.aspek) })
    })
  })

  app.post('/api/supervisi/sesi', SUPERVISI, (req, res) => {
    aman(res, () => {
      const { instrumen_id, nama_terperiksa, jabatan, guru_id, tanggal, supervisor_nama,
        catatan, rekomendasi, tindak_lanjut, status, skor } = req.body || {}
      if (!nama_terperiksa) throw new Error('Nama terperiksa wajib')
      const ins = db.prepare('SELECT * FROM supervisi_instrumen WHERE id=? AND tenant_id=?').get(instrumen_id, req.tenantId)
      if (!ins) throw new Error('Instrumen tidak ditemukan')
      const butir = butirInstrumen(req.tenantId, ins.id)
      if (!butir.length) throw new Error('Instrumen belum punya butir penilaian')
      const list = Array.isArray(skor) ? skor : []
      const hasil = hitungSesi(butir, list)
      const id = buatId()
      const tgl = String(tanggal || new Date().toISOString().slice(0, 10)).slice(0, 10)
      const jalankan = db.transaction(() => {
        db.prepare(`INSERT INTO supervisi_sesi
          (id, tenant_id, instrumen_id, aspek, guru_id, nama_terperiksa, jabatan, supervisor_nama, tanggal,
           skor_total, skor_maks, persen, predikat, catatan, rekomendasi, tindak_lanjut, status, created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(id, req.tenantId, ins.id, ins.aspek, String(guru_id || ''), String(nama_terperiksa).trim(),
            String(jabatan || ''), String(supervisor_nama || ''), tgl,
            hasil.skor_total, hasil.skor_maks, hasil.persen, hasil.predikat,
            String(catatan || ''), String(rekomendasi || ''), String(tindak_lanjut || ''),
            status === 'final' ? 'final' : 'draft', String(req.user?.id || ''))
        const insSkor = db.prepare('INSERT INTO supervisi_skor (id, sesi_id, butir_id, skor, catatan) VALUES (?,?,?,?,?)')
        for (const s of list) {
          const b = butir.find(x => x.id === s.butir_id)
          if (!b) continue
          insSkor.run(buatId(), id, b.id, Math.max(0, Math.min(Number(s.skor) || 0, Number(b.max_skor) || 4)), String(s.catatan || ''))
        }
      })
      jalankan()
      res.json({ success: true, sesi: barisSesi(req.tenantId, id) })
    })
  })

  app.put('/api/supervisi/sesi/:id', SUPERVISI, (req, res) => {
    aman(res, () => {
      const sesi = barisSesi(req.tenantId, req.params.id)
      if (!sesi) throw new Error('Sesi tidak ditemukan')
      const { catatan, rekomendasi, tindak_lanjut, status, skor, nama_terperiksa, jabatan, tanggal } = req.body || {}
      const jalankan = db.transaction(() => {
        db.prepare(`UPDATE supervisi_sesi SET catatan=?, rekomendasi=?, tindak_lanjut=?, status=?,
          nama_terperiksa=?, jabatan=?, tanggal=? WHERE id=? AND tenant_id=?`)
          .run(catatan !== undefined ? String(catatan) : sesi.catatan,
            rekomendasi !== undefined ? String(rekomendasi) : sesi.rekomendasi,
            tindak_lanjut !== undefined ? String(tindak_lanjut) : sesi.tindak_lanjut,
            status !== undefined ? (status === 'final' ? 'final' : 'draft') : sesi.status,
            nama_terperiksa !== undefined ? String(nama_terperiksa) : sesi.nama_terperiksa,
            jabatan !== undefined ? String(jabatan) : sesi.jabatan,
            tanggal !== undefined ? String(tanggal).slice(0, 10) : sesi.tanggal,
            sesi.id, req.tenantId)
        if (Array.isArray(skor)) {
          const butir = butirInstrumen(req.tenantId, sesi.instrumen_id)
          const hasil = hitungSesi(butir, skor)
          db.prepare('UPDATE supervisi_sesi SET skor_total=?, skor_maks=?, persen=?, predikat=? WHERE id=? AND tenant_id=?')
            .run(hasil.skor_total, hasil.skor_maks, hasil.persen, hasil.predikat, sesi.id, req.tenantId)
          db.prepare('DELETE FROM supervisi_skor WHERE sesi_id=?').run(sesi.id)
          const insSkor = db.prepare('INSERT INTO supervisi_skor (id, sesi_id, butir_id, skor, catatan) VALUES (?,?,?,?,?)')
          for (const s of skor) {
            const b = butir.find(x => x.id === s.butir_id)
            if (!b) continue
            insSkor.run(buatId(), sesi.id, b.id, Math.max(0, Math.min(Number(s.skor) || 0, Number(b.max_skor) || 4)), String(s.catatan || ''))
          }
        }
      })
      jalankan()
      res.json({ success: true, sesi: barisSesi(req.tenantId, sesi.id) })
    })
  })

  app.delete('/api/supervisi/sesi/:id', SUPERVISI, (req, res) => {
    aman(res, () => {
      const sesi = barisSesi(req.tenantId, req.params.id)
      if (!sesi) throw new Error('Sesi tidak ditemukan')
      db.prepare('DELETE FROM supervisi_skor WHERE sesi_id=?').run(sesi.id)
      db.prepare('DELETE FROM supervisi_sesi WHERE id=? AND tenant_id=?').run(sesi.id, req.tenantId)
      res.json({ success: true })
    })
  })

  app.get('/api/supervisi/sesi/:id/pdf', SUPERVISI, async (req, res) => {
    try {
      const sesi = barisSesi(req.tenantId, req.params.id)
      if (!sesi) return res.status(404).json({ error: 'Sesi tidak ditemukan' })
      const butir = butirInstrumen(req.tenantId, sesi.instrumen_id)
      const skor = db.prepare('SELECT * FROM supervisi_skor WHERE sesi_id=?').all(sesi.id)
      const html = buildLaporanHtml({ sesi, butir, skor, settings: settingsTenant(req.tenantId) })
      const buf = await invoiceService.renderInvoicePdf(html)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="supervisi-${sesi.aspek}-${sesi.tanggal}.pdf"`)
      res.send(buf)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.get('/api/supervisi/sesi/:id/jpeg', SUPERVISI, async (req, res) => {
    try {
      const sesi = barisSesi(req.tenantId, req.params.id)
      if (!sesi) return res.status(404).json({ error: 'Sesi tidak ditemukan' })
      const butir = butirInstrumen(req.tenantId, sesi.instrumen_id)
      const skor = db.prepare('SELECT * FROM supervisi_skor WHERE sesi_id=?').all(sesi.id)
      const html = buildLaporanHtml({ sesi, butir, skor, settings: settingsTenant(req.tenantId) })
      const buf = await invoiceService.renderInvoiceJpeg(html)
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Content-Disposition', `inline; filename="supervisi-${sesi.aspek}-${sesi.tanggal}.jpg"`)
      res.send(buf)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ---- Rekap tren --------------------------------------------------------

  app.get('/api/supervisi/tren', SUPERVISI, (req, res) => {
    aman(res, () => {
      const from = String(req.query.from || '').slice(0, 10)
      const to = String(req.query.to || '').slice(0, 10)
      let where = 'tenant_id=?'
      const args = [req.tenantId]
      if (from) { where += ' AND tanggal>=?'; args.push(from) }
      if (to) { where += ' AND tanggal<=?'; args.push(to) }
      const perBulan = db.prepare(`SELECT substr(tanggal,1,7) AS bulan, COUNT(*) AS jumlah,
          ROUND(AVG(persen),1) AS rata_persen, SUM(CASE WHEN persen>=80 THEN 1 ELSE 0 END) AS baik
        FROM supervisi_sesi WHERE ${where} GROUP BY bulan ORDER BY bulan`).all(...args)
      const perAspek = db.prepare(`SELECT aspek, COUNT(*) AS jumlah, ROUND(AVG(persen),1) AS rata_persen
        FROM supervisi_sesi WHERE ${where} GROUP BY aspek`).all(...args)
      res.json({ success: true, tren: { per_bulan: perBulan, per_aspek: perAspek.map(r => ({ ...r, label: labelAspek(r.aspek) })) } })
    })
  })
}

module.exports = { setupSupervisi, registerSupervisiRoutes }