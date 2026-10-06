const crypto = require('crypto')
const { isHoliday } = require('./holiday-rules.cjs')
const { getTenantSettings } = require('./tenant-settings.cjs')

function setupWA(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS wa_queue(
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, phone TEXT NOT NULL, message TEXT NOT NULL,
    idempotency_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
    available_at TEXT NOT NULL DEFAULT (datetime('now')), claimed_at TEXT, sent_at TEXT, failed_at TEXT,
    message_id TEXT, last_error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(tenant_id,idempotency_key));
    CREATE INDEX IF NOT EXISTS idx_wa_queue_due ON wa_queue(status,available_at,tenant_id);
    CREATE TABLE IF NOT EXISTS wa_sessions(tenant_id TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'disconnected',qr TEXT,last_error TEXT,phone TEXT,requested_action TEXT,updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS wa_notif_whitelist(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT, phone TEXT, reason TEXT, aktif INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`)
  if(!db.prepare("PRAGMA table_info(wa_sessions)").all().some(c=>c.name==='requested_action')) db.exec('ALTER TABLE wa_sessions ADD COLUMN requested_action TEXT')
}
function normalizePhone(value) {
  let p=String(value||'').replace(/\D/g,'')
  if(p.startsWith('0')) p='62'+p.slice(1); else if(p.startsWith('8')) p='62'+p
  return /^62[1-9]\d{7,13}$/.test(p)?p:''
}
function isWhitelisted(db, tenantId, phone, targetType='', targetId='') {
  const normalized=normalizePhone(phone)
  if(!normalized)return false
  return !!db.prepare(`SELECT id FROM wa_notif_whitelist WHERE tenant_id=? AND aktif=1 AND (phone=? OR (target_type=? AND target_id=?)) LIMIT 1`).get(tenantId, normalized, targetType, targetId)
}
function enqueue(db,{tenantId,phone,message,key,targetType='',targetId=''}) {
  const normalized=normalizePhone(phone)
  if(isWhitelisted(db, tenantId, normalized, targetType, targetId)) return {queued:false,reason:'whitelisted'}
  if(!tenantId||!normalized||!String(message||'').trim()) return {queued:false,reason:'invalid'}
  const id=crypto.randomUUID()
  const r=db.prepare(`INSERT OR IGNORE INTO wa_queue(id,tenant_id,phone,message,idempotency_key) VALUES(?,?,?,?,?)`).run(id,tenantId,normalized,String(message),key||id)
  return {queued:r.changes===1,id:r.changes?id:db.prepare('SELECT id FROM wa_queue WHERE tenant_id=? AND idempotency_key=?').get(tenantId,key)?.id,reason:r.changes?'queued':'duplicate'}
}
function claimNext(db,tenantId) {
  return db.transaction(()=> {
    const row=db.prepare("SELECT * FROM wa_queue WHERE tenant_id=? AND status IN ('pending','failed') AND attempts<5 AND available_at<=datetime('now') ORDER BY created_at LIMIT 1").get(tenantId)
    if(!row)return null
    const r=db.prepare("UPDATE wa_queue SET status='processing',claimed_at=datetime('now'),attempts=attempts+1 WHERE id=? AND tenant_id=? AND status IN ('pending','failed')").run(row.id,tenantId)
    return r.changes?db.prepare('SELECT * FROM wa_queue WHERE id=? AND tenant_id=?').get(row.id,tenantId):null
  })()
}
function honorificTeacherName(name, jenisKelamin) {
  const clean = String(name || '').trim()
  if (!clean) return 'Guru'
  return `${String(jenisKelamin || '').toUpperCase() === 'P' ? 'Ibu' : 'Pak'} ${clean}`
}
function render(template,data){return String(template||'').replace(/\{(\w+)\}/g,(_,k)=>data[k]??'')}
function tenantHolidayState(db, tenantId, date) {
  const settings = getTenantSettings(db, tenantId, 'hari_libur')
  const events = db.prepare("SELECT jenis FROM kalender_kbm WHERE tenant_id=? AND tanggal=? AND jenis='libur'").all(tenantId, date)
  return { holidayDays: settings?.hari_libur || [], calendarEvents: events }
}
function shouldSuppress(db, tenantId, date) {
  return isHoliday({ date, ...tenantHolidayState(db, tenantId, date) })
}
function queueWaliAttendance(db,{tenantId,studentId,date,session,status}) {
  if (shouldSuppress(db, tenantId, date)) return {queued:false,reason:'holiday'}
  const conf=db.prepare('SELECT * FROM notif_settings WHERE tenant_id=?').get(tenantId)
  if(!conf?.absensi_siswa_ke_wali)return {queued:false,reason:'disabled'}
  const s=db.prepare('SELECT * FROM siswa WHERE id=? AND tenant_id=?').get(studentId,tenantId)
  if(!s)return {queued:false,reason:'missing_student'}
  const linked=db.prepare("SELECT u.phone,u.nama FROM user_students l JOIN users u ON u.id=l.user_id AND u.tenant_id=l.tenant_id WHERE l.tenant_id=? AND l.student_id=? AND u.role='wali_murid' LIMIT 1").get(tenantId,studentId)
  const user=linked||db.prepare("SELECT phone,nama FROM users WHERE tenant_id=? AND role='wali_murid' AND nis=? LIMIT 1").get(tenantId,s.nis)
  const phone=s.no_hp||user?.phone
  if(!normalizePhone(phone))return {queued:false,reason:'missing_phone'}
  const school=getTenantSettings(db, tenantId, 'nama_lembaga')
  const message=render(conf.template_absensi_wali,{nama_ortu:s.nama_ortu||user?.nama||'Bapak/Ibu',nama:s.nama,status,tanggal:date,lembaga:school?.nama_lembaga||'Sekolah'})
  return enqueue(db,{tenantId,phone,message,key:`wali:${studentId}:${date}:${session}:${status}`,targetType:'siswa',targetId:studentId})
}
function queueDueTeachers(db,{tenantId,date,time}) {
  const out={queued:0,skipped:0,missing:0}
  if (shouldSuppress(db, tenantId, date)) return {...out, reason:'holiday'}
  const conf=db.prepare('SELECT * FROM notif_settings WHERE tenant_id=?').get(tenantId)
  if(!conf?.guru_belum_ceklok||time<conf.batas_ceklok_guru)return out
  const school=getTenantSettings(db, tenantId, 'nama_lembaga')
  const day=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][new Date(`${date}T12:00:00Z`).getUTCDay()]
  // Hanya ingatkan GTK yang memang memiliki jadwal mengajar pada hari tersebut.
  // Sebelumnya semua GTK aktif ikut diproses, termasuk staf tanpa jadwal.
  for(const g of db.prepare(`SELECT g.* FROM gtk g
    WHERE g.tenant_id=? AND g.status='aktif'
      AND EXISTS (SELECT 1 FROM jadwal j WHERE j.tenant_id=g.tenant_id AND j.gtk_id=g.id AND lower(j.hari)=lower(?) AND COALESCE(j.jenis_kegiatan,'mapel')='mapel')
      AND NOT EXISTS(SELECT 1 FROM absensi_guru a WHERE a.tenant_id=? AND a.gtk_id=g.id AND a.tanggal=?)`).all(tenantId,day,tenantId,date)){
    if(!normalizePhone(g.no_hp)){out.missing++;continue}
      const namaGuru = honorificTeacherName(g.nama, g.jenis_kelamin)
    const message=render(conf.template_guru_ceklok,{nama:namaGuru,nama_guru:namaGuru,tanggal:date,lembaga:school?.nama_lembaga||'Sekolah'})
    const r=enqueue(db,{tenantId,phone:g.no_hp,message,key:`guru-belum-ceklok:${g.id}:${date}`,targetType:'gtk',targetId:g.id})
    if (r.queued) out.queued++
    else out.skipped++
  } return out
}
function queueDueSchedules(db,{tenantId,date,time}) {
  const out={queued:0,skipped:0,missing:0}
  if (shouldSuppress(db, tenantId, date)) return {...out, reason:'holiday'}
  const conf=db.prepare('SELECT * FROM notif_settings WHERE tenant_id=?').get(tenantId)
  if(!conf?.notif_jadwal_guru)return out
  if(!time || !/^\d{2}:\d{2}$/.test(String(time))) return {...out,reason:'invalid_time'}
  const day=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][new Date(`${date}T12:00:00Z`).getUTCDay()]
  const active=db.prepare('SELECT 1 FROM tahun_ajaran WHERE tenant_id=? AND aktif=1 AND (? BETWEEN tanggal_mulai AND tanggal_selesai) LIMIT 1').get(tenantId,date)
  if(!active)return out
  const school=getTenantSettings(db, tenantId, 'nama_lembaga')
  const rows=db.prepare(`SELECT j.id,j.gtk_id,j.jam_mulai,j.jam_selesai,g.nama nama_guru,g.no_hp,m.nama mapel,r.nama rombel
    FROM jadwal j JOIN gtk g ON g.id=j.gtk_id AND g.tenant_id=j.tenant_id AND g.status='aktif'
    JOIN mapel m ON m.id=j.mapel_id AND m.tenant_id=j.tenant_id JOIN rombel r ON r.id=j.rombel_id AND r.tenant_id=j.tenant_id
    WHERE j.tenant_id=? AND lower(j.hari)=lower(?) ORDER BY j.jam_mulai`).all(tenantId,day)
  // Dua JTM identik/berurutan untuk guru-mapel-rombel menjadi satu sesi.
  // Pilih slot pertama dan tampilkan rentang sampai JTM terakhir, sehingga tick berikutnya tidak mengirim ulang.
  const grouped = new Map()
  for (const row of rows) {
    const key = `${row.gtk_id}|${row.mapel}|${row.rombel}|${date}`
    const current = grouped.get(key)
    if (!current || String(row.jam_mulai) < String(current.jam_mulai)) grouped.set(key, { ...row, _slots: [row] })
    else if (String(row.jam_mulai) <= String(current.jam_selesai)) {
      current.jam_selesai = String(row.jam_selesai) > String(current.jam_selesai) ? row.jam_selesai : current.jam_selesai
      current._slots.push(row)
    }
  }
  // Hanya proses grup ketika tick berada pada slot pertama atau jendela lima menitnya.
  for(const x of grouped.values()){
    const firstStart = String(x.jam_mulai)
    const firstMinutes = Number(firstStart.slice(0, 2)) * 60 + Number(firstStart.slice(3, 5))
    const tickMinutes = Number(String(time).slice(0, 2)) * 60 + Number(String(time).slice(3, 5))
    if (!Number.isFinite(tickMinutes) || tickMinutes < firstMinutes - 5 || tickMinutes > firstMinutes + 5) { out.skipped++; continue }
    delete x._slots
    if(!normalizePhone(x.no_hp)){out.missing++;continue}
    const defaultTemplate='Assalamu’alaikum {nama_guru}. Pengingat jadwal mengajar {mapel} di kelas {rombel}, pukul {jam_mulai}–{jam_selesai} pada {tanggal}. — {lembaga}'
    const gtkColumns = db.prepare('PRAGMA table_info(gtk)').all()
    const hasGender = gtkColumns.some(column => column.name === 'jenis_kelamin')
    const gender = hasGender ? db.prepare('SELECT jenis_kelamin FROM gtk WHERE id=? AND tenant_id=?').get(x.gtk_id, tenantId)?.jenis_kelamin : 'L'
    const namaGuru = honorificTeacherName(x.nama_guru, gender)
    const message=render(String(conf.template_jadwal_guru||'').trim()||defaultTemplate,{...x,nama_guru:namaGuru,tanggal:date,lembaga:school?.nama_lembaga||'Sekolah'})
    const r=enqueue(db,{tenantId,phone:x.no_hp,message,key:`jadwal-guru:${x.gtk_id}:${x.mapel}:${x.rombel}:${date}:${x.jam_mulai}`,targetType:'gtk',targetId:x.gtk_id})
    if (r.queued) out.queued++
    else out.skipped++
  }
  return out
}
// Mode ujian aktif pada tanggal tsb bila ada event kalender_kbm jenis='ujian'
// DAN ada template ujian yang memiliki slot jadwal_ujian. Logika ini meniru
// examModeForDate() di index.cjs agar notif WA konsisten dengan tampilan
// dashboard guru (yang sudah memakai jadwal_ujian saat mode ujian).
function examModeForDate(db, tenantId, date) {
  const event = db.prepare("SELECT id FROM kalender_kbm WHERE tenant_id=? AND tanggal=? AND jenis='ujian' LIMIT 1").get(tenantId, date)
  if (!event) return null
  const tpl = db.prepare(`SELECT t.id FROM template_jadwal t
    WHERE t.tenant_id=? AND t.jenis='ujian'
      AND EXISTS (SELECT 1 FROM jadwal_ujian j WHERE j.template_id=t.id AND j.tenant_id=t.tenant_id)
    ORDER BY t.created_at DESC LIMIT 1`).get(tenantId)
  return tpl ? tpl.id : null
}
// Notif WA pengingat jadwal UJIAN ke guru pengawas. Saat mode ujian aktif,
// jadwal reguler diganti jadwal_ujian; guru harus diingatkan ujian, bukan
// jadwal mengajar biasa. Tidak mengubah queueDueSchedules (jadwal reguler).
function queueDueExamSchedules(db,{tenantId,date,time}) {
  const out={queued:0,skipped:0,missing:0}
  if (shouldSuppress(db, tenantId, date)) return {...out, reason:'holiday'}
  const conf=db.prepare('SELECT * FROM notif_settings WHERE tenant_id=?').get(tenantId)
  if(!conf?.notif_ujian_guru)return out
  if(!time || !/^\d{2}:\d{2}$/.test(String(time))) return {...out,reason:'invalid_time'}
  const examTemplateId = examModeForDate(db, tenantId, date)
  if (!examTemplateId) return out // bukan hari ujian: jadwal reguler yang menangani
  const day=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][new Date(`${date}T12:00:00Z`).getUTCDay()]
  const school=getTenantSettings(db, tenantId, 'nama_lembaga')
  const rows=db.prepare(`SELECT j.id,j.gtk_id,j.jam_mulai,j.jam_selesai,g.nama nama_guru,g.no_hp,m.nama mapel,r.nama rombel
    FROM jadwal_ujian j
    LEFT JOIN gtk g ON g.id=j.gtk_id AND g.tenant_id=j.tenant_id AND g.status='aktif'
    LEFT JOIN mapel m ON m.id=j.mapel_id AND m.tenant_id=j.tenant_id
    LEFT JOIN rombel r ON r.id=j.rombel_id AND r.tenant_id=j.tenant_id
    WHERE j.tenant_id=? AND j.template_id=? AND lower(j.hari)=lower(?) ORDER BY j.jam_mulai`).all(tenantId, examTemplateId, day)
  const grouped = new Map()
  for (const row of rows) {
    if (!row.gtk_id) continue // slot tanpa pengawas: tidak ada yang diingatkan
    const key = `${row.gtk_id}|${row.mapel}|${row.rombel}|${date}`
    const current = grouped.get(key)
    if (!current || String(row.jam_mulai) < String(current.jam_mulai)) grouped.set(key, { ...row, _slots: [row] })
    else if (String(row.jam_mulai) <= String(current.jam_selesai)) {
      current.jam_selesai = String(row.jam_selesai) > String(current.jam_selesai) ? row.jam_selesai : current.jam_selesai
      current._slots.push(row)
    }
  }
  for(const x of grouped.values()){
    const firstStart = String(x.jam_mulai)
    const firstMinutes = Number(firstStart.slice(0, 2)) * 60 + Number(firstStart.slice(3, 5))
    const tickMinutes = Number(String(time).slice(0, 2)) * 60 + Number(String(time).slice(3, 5))
    if (!Number.isFinite(tickMinutes) || tickMinutes < firstMinutes - 5 || tickMinutes > firstMinutes + 5) { out.skipped++; continue }
    delete x._slots
    if(!normalizePhone(x.no_hp)){out.missing++;continue}
    const gtkColumns = db.prepare('PRAGMA table_info(gtk)').all()
    const hasGender = gtkColumns.some(column => column.name === 'jenis_kelamin')
    const gender = hasGender ? db.prepare('SELECT jenis_kelamin FROM gtk WHERE id=? AND tenant_id=?').get(x.gtk_id, tenantId)?.jenis_kelamin : 'L'
    const namaGuru = honorificTeacherName(x.nama_guru, gender)
    const defaultTemplate='Assalamu’alaikum {nama_guru}. Pengingat jadwal UJIAN {mapel} di kelas {rombel}, pukul {jam_mulai}–{jam_selesai} pada {tanggal}. — {lembaga}'
    const message=render(String(conf.template_ujian_guru||'').trim()||defaultTemplate,{...x,nama_guru:namaGuru,tanggal:date,lembaga:school?.nama_lembaga||'Sekolah'})
    const r=enqueue(db,{tenantId,phone:x.no_hp,message,key:`ujian-guru:${x.gtk_id}:${x.mapel}:${x.rombel}:${date}:${x.jam_mulai}`,targetType:'gtk',targetId:x.gtk_id})
    if (r.queued) out.queued++
    else out.skipped++
  }
  return out
}
function queueDueEkskul(db,{tenantId,date,time}) {
  const out={queued:0,skipped:0,missing:0}
  if (shouldSuppress(db, tenantId, date)) return {...out, reason:'holiday'}
  const conf=db.prepare('SELECT * FROM notif_settings WHERE tenant_id=?').get(tenantId)
  if(!conf?.notif_ekskul_guru)return out
  if(!time || !/^\d{2}:\d{2}$/.test(String(time))) return {...out,reason:'invalid_time'}
  const day=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][new Date(`${date}T12:00:00Z`).getUTCDay()]
  const active=db.prepare('SELECT 1 FROM tahun_ajaran WHERE tenant_id=? AND aktif=1 AND (? BETWEEN tanggal_mulai AND tanggal_selesai) LIMIT 1').get(tenantId,date)
  if(!active)return out
  const school=getTenantSettings(db, tenantId, 'nama_lembaga')
  // Ekskul/peminatan yang punya pembina (guru) dan jadwal hari ini.
  const rows=db.prepare(`SELECT e.id,e.nama ekskul,e.jam_mulai,e.jam_selesai,e.pembina_id,g.nama nama_guru,g.no_hp,g.jenis_kelamin
    FROM ekskul e JOIN gtk g ON g.id=e.pembina_id AND g.tenant_id=e.tenant_id AND g.status='aktif'
    WHERE e.tenant_id=? AND lower(COALESCE(e.hari,''))=lower(?) ORDER BY e.jam_mulai`).all(tenantId,day)
  for(const x of rows){
    const start = String(x.jam_mulai || '')
    const firstMinutes = /^\d{2}:\d{2}$/.test(start) ? Number(start.slice(0,2))*60+Number(start.slice(3,5)) : null
    const tickMinutes = Number(String(time).slice(0,2))*60+Number(String(time).slice(3,5))
    if (!Number.isFinite(tickMinutes)) { out.skipped++; continue }
    if (firstMinutes != null && (tickMinutes < firstMinutes - 5 || tickMinutes > firstMinutes + 5)) { out.skipped++; continue }
    if(!normalizePhone(x.no_hp)){out.missing++;continue}
    const namaGuru = honorificTeacherName(x.nama_guru, x.jenis_kelamin)
    const defaultTemplate='Assalamu’alaikum {nama_guru}. Pengingat jadwal {ekskul} pukul {jam_mulai}–{jam_selesai} pada {tanggal}. — {lembaga}'
    const message=render(String(conf.template_ekskul_guru||'').trim()||defaultTemplate,{...x,nama_guru:namaGuru,tanggal:date,lembaga:school?.nama_lembaga||'Sekolah'})
    const r=enqueue(db,{tenantId,phone:x.no_hp,message,key:`ekskul-guru:${x.pembina_id}:${x.id}:${date}:${x.jam_mulai}`,targetType:'gtk',targetId:x.pembina_id})
    if (r.queued) out.queued++
    else out.skipped++
  }
  return out
}
function queueFinanceReports(db,{tenantId,date,time,force=false}) {
  const out={queued:0,skipped:0,missing:0}
  if (shouldSuppress(db, tenantId, date)) return {...out, reason:'holiday'}
  const conf=db.prepare('SELECT * FROM notif_settings WHERE tenant_id=?').get(tenantId)
  if(!conf?.notif_keuangan_wali)return out
  // Hanya kirim pada hari & jam yang diatur. Scheduler jalan tiap menit,
  // jadi cukup cocokkan jam tepat (HH:MM) supaya tiap periode terkirim sekali.
  if(!time || !/^\d{2}:\d{2}/.test(String(time)))return {...out,reason:'invalid_time'}
  const dayNames=['minggu','senin','selasa','rabu','kamis','jumat','sabtu']
  const dayName=dayNames[new Date(`${date}T12:00:00Z`).getUTCDay()]
  const dayOfMonth=Number(String(date).slice(8,10))
  const frekuensi=String(conf.keuangan_frekuensi||'bulanan').toLowerCase()
  const hari=String(conf.keuangan_hari||'').trim().toLowerCase()
  const jam=String(conf.keuangan_jam||'08:00')
  if(!force){
    if(String(time).slice(0,5)!==jam)return out
    if(frekuensi==='mingguan'){
      if(!hari||dayName!==hari)return out
    }else{
      const target=Number(hari)
      if(!Number.isInteger(target)||target<1||target>28||dayOfMonth!==target)return out
    }
  }
  const school=getTenantSettings(db, tenantId, 'nama_lembaga')
  const lembaga=school?.nama_lembaga||'Sekolah'
  const template=String(conf.template_keuangan_wali||'').trim()
    || 'Assalamualaikum {nama_ortu}, berikut ringkasan keuangan ananda {nama}:\n{tagihan}\n\nSaldo tabungan: {saldo_tabungan}\n\n- {lembaga}'
  // Pasangan (wali -> siswa). Wali = akun role wali_murid yang tertaut via
  // user_students, atau fallback user wali_murid dengan nis yang sama.
  const links=db.prepare(`SELECT u.id AS user_id,u.nama AS user_nama,u.phone,l.student_id
    FROM user_students l JOIN users u ON u.id=l.user_id AND u.tenant_id=l.tenant_id
    WHERE l.tenant_id=? AND u.role='wali_murid'`).all(tenantId)
  const seen=new Set()
  const pairs=[]
  for(const l of links){ const k=l.user_id+':'+l.student_id; if(seen.has(k))continue; seen.add(k); pairs.push(l) }
  // Fallback: user wali_murid tanpa user_students tapi nis == siswa.nis.
  const fallback=db.prepare(`SELECT u.id AS user_id,u.nama AS user_nama,u.phone,s.id AS student_id
    FROM users u JOIN siswa s ON s.nis=u.nis AND s.tenant_id=u.tenant_id
    WHERE u.tenant_id=? AND u.role='wali_murid'`).all(tenantId)
  for(const l of fallback){ const k=l.user_id+':'+l.student_id; if(seen.has(k))continue; seen.add(k); pairs.push(l) }

  const unpaidStmt=db.prepare(`SELECT j.nama AS jenis,t.nominal,t.bulan,t.tahun FROM tagihan t JOIN jenis_tagihan j ON j.id=t.jenis_tagihan_id AND j.tenant_id=t.tenant_id WHERE t.siswa_id=? AND t.tenant_id=? AND t.status='belum_bayar' ORDER BY t.tahun DESC,t.bulan DESC`)
  const saldoStmt=db.prepare('SELECT saldo_akhir FROM tabungan WHERE siswa_id=? AND tenant_id=? ORDER BY created_at DESC LIMIT 1')
  const paidStmt=db.prepare(`SELECT j.nama AS jenis,t.nominal FROM tagihan t JOIN jenis_tagihan j ON j.id=t.jenis_tagihan_id AND j.tenant_id=t.tenant_id WHERE t.siswa_id=? AND t.tenant_id=? AND t.status='lunas' AND substr(COALESCE(t.tanggal_bayar,''),1,7)=? ORDER BY t.tanggal_bayar DESC`)
  const rupiah=n=>'Rp'+(Number(n)||0).toLocaleString('id-ID')

  for(const pair of pairs){
    const s=db.prepare('SELECT * FROM siswa WHERE id=? AND tenant_id=?').get(pair.student_id,tenantId)
    if(!s)continue
    const phone=s.no_hp||pair.phone
    if(!normalizePhone(phone)){out.missing++;continue}
    const unpaid=unpaidStmt.all(s.id,tenantId)
    const totalUnpaid=unpaid.reduce((sum,r)=>sum+Number(r.nominal||0),0)
    const saldo=Number(saldoStmt.get(s.id,tenantId)?.saldo_akhir||0)
    const paid=paidStmt.all(s.id,tenantId,date.slice(0,7))
    const lines=[]
    if(unpaid.length){
      lines.push(`Tagihan belum dibayar (total ${rupiah(totalUnpaid)}):`)
      for(const t of unpaid.slice(0,8)) lines.push(`- ${t.jenis} (${t.bulan||''} ${t.tahun||''}): ${rupiah(t.nominal)}`)
      if(unpaid.length>8) lines.push(`... dan ${unpaid.length-8} tagihan lainnya`)
    }else{
      lines.push('Tidak ada tagihan belum dibayar.')
    }
    if(paid.length){
      lines.push(`Pembayaran bulan ini:`)
      for(const p of paid.slice(0,8)) lines.push(`- ${p.jenis}: ${rupiah(p.nominal)}`)
    }
    const namaOrtu=s.nama_ortu||pair.user_nama||'Bapak/Ibu'
    const message=render(template,{nama_ortu:namaOrtu,nama:s.nama,tagihan:lines.join('\n'),pembayaran:paid.map(p=>`${p.jenis}: ${rupiah(p.nominal)}`).join(', '),saldo_tabungan:rupiah(saldo),lembaga})
    const periodKey=frekuensi==='mingguan'?`W${date}`:`M${date.slice(0,7)}`
    const r=enqueue(db,{tenantId,phone,message,key:`keuangan:${s.id}:${periodKey}`,targetType:'siswa',targetId:s.id})
    if(r.queued)out.queued++;else out.skipped++
  }
  return out
}

// Penerima notifikasi adzan.
//  'gtk'   = semua GTK aktif yang punya nomor HP
//  'admin' = hanya GTK yang terhubung ke akun admin/kepala/bendahara/operator/TU
//            (jauh lebih hemat kuota WA untuk lembaga besar)
function penerimaAdzan(db, tenantId, conf) {
  const target = String(conf?.adzan_target || 'gtk').toLowerCase()
  const kolom = db.prepare('PRAGMA table_info(gtk)').all().map(c => c.name)
  const pilih = `g.id, g.nama, g.no_hp${kolom.includes('jenis_kelamin') ? ', g.jenis_kelamin' : ", 'L' jenis_kelamin"}`
  if (target === 'admin') {
    return db.prepare(`SELECT ${pilih} FROM gtk g
      WHERE g.tenant_id=? AND COALESCE(g.status,'aktif')='aktif'
        AND EXISTS (SELECT 1 FROM users u WHERE u.tenant_id=g.tenant_id AND u.gtk_id=g.id
          AND u.role IN ('admin','super_admin','kepala','bendahara','operator','tata_usaha','tu'))`).all(tenantId)
  }
  return db.prepare(`SELECT ${pilih} FROM gtk g WHERE g.tenant_id=? AND COALESCE(g.status,'aktif')='aktif'`).all(tenantId)
}

/**
 * Notifikasi adzan saat masuk waktu sholat.
 *
 * Sengaja TIDAK memakai shouldSuppress(): waktu sholat tetap berjalan pada hari
 * libur maupun hari ujian, jadi penekanan hari libur tidak berlaku di sini.
 * Waktu diambil dari koordinat lembaga (Pengaturan) lewat jadwalSholatTenant —
 * sumber yang sama dengan kartu Jadwal Sholat, sehingga keduanya tidak berbeda.
 */
function queueAdzanReminders(db, { tenantId, date, time, force = false, paksaWaktu = '' }) {
  const out = { queued: 0, skipped: 0, missing: 0 }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return { ...out, reason: 'invalid_date' }
  if (!time || !/^\d{2}:\d{2}$/.test(String(time))) return { ...out, reason: 'invalid_time' }
  const conf = db.prepare('SELECT * FROM notif_settings WHERE tenant_id=?').get(tenantId)
  if (!force && !conf?.notif_adzan) return { ...out, reason: 'disabled' }

  const { WAKTU_SHOLAT, LABEL_WAKTU, jadwalSholatTenant } = require('./jadwal-sholat.cjs')
  let jadwal
  try { jadwal = jadwalSholatTenant(db, tenantId, date) } catch { return { ...out, reason: 'invalid_coordinates' } }

  const dipilih = String(conf?.adzan_waktu || '').split(',').map(s => s.trim().toLowerCase()).filter(k => WAKTU_SHOLAT.includes(k))
  // Kirim-uji: paksa satu waktu tertentu dan lewati pemeriksaan jam.
  const paksa = String(paksaWaktu || '').trim().toLowerCase()
  const aktif = WAKTU_SHOLAT.includes(paksa) ? [paksa] : (dipilih.length ? dipilih : WAKTU_SHOLAT)
  const menitAwal = Math.max(0, Math.min(120, Number(conf?.adzan_menit_awal) || 0))

  const tickMenit = Number(String(time).slice(0, 2)) * 60 + Number(String(time).slice(3, 5))
  const sekolah = getTenantSettings(db, tenantId, 'nama_lembaga')
  const template = String(conf?.template_adzan || '').trim()
    || 'Assalamualaikum, waktu {waktu} telah masuk untuk wilayah {kota} pukul {jam}. Mari tunaikan sholat berjamaah. - {lembaga}'

  for (const waktu of aktif) {
    const jam = jadwal[waktu]
    if (!/^\d{2}:\d{2}$/.test(String(jam || ''))) { out.skipped++; continue }
    const targetMenit = Number(String(jam).slice(0, 2)) * 60 + Number(String(jam).slice(3, 5)) - menitAwal
    // Toleransi ±5 menit seperti notifikasi lain supaya satu tick yang terlewat tetap terkirim.
    if (!paksa && (tickMenit < targetMenit - 5 || tickMenit > targetMenit + 5)) { out.skipped++; continue }

    for (const x of penerimaAdzan(db, tenantId, conf)) {
      if (!normalizePhone(x.no_hp)) { out.missing++; continue }
      const nama = honorificTeacherName(x.nama, x.jenis_kelamin)
      const message = render(template, {
        nama, nama_guru: nama,
        waktu: LABEL_WAKTU[waktu] || waktu,
        jam,
        kota: jadwal.kota,
        tanggal: date,
        lembaga: sekolah?.nama_lembaga || 'Sekolah',
      })
      const r = enqueue(db, {
        tenantId, phone: x.no_hp, message,
        // Kirim-uji memakai kunci berbeda supaya tidak menutup kiriman sungguhan hari itu.
        key: paksa ? `adzan-uji:${Date.now()}:${waktu}:${x.id}` : `adzan:${date}:${waktu}:${x.id}`,
        targetType: 'gtk', targetId: x.id,
      })
      if (r.queued) out.queued++
      else out.skipped++
    }
  }
  return out
}

module.exports={setupWA,normalizePhone,enqueue,claimNext,render,honorificTeacherName,queueWaliAttendance,queueDueTeachers,queueDueSchedules,queueDueExamSchedules,queueDueEkskul,queueFinanceReports,queueAdzanReminders,penerimaAdzan,isWhitelisted,shouldSuppress}
