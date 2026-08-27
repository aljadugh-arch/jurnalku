const crypto = require('crypto')
const { isHoliday } = require('./holiday-rules.cjs')

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
  const settings = db.prepare('SELECT hari_libur FROM settings WHERE tenant_id=?').get(tenantId)
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
  const school=db.prepare('SELECT nama_lembaga FROM settings WHERE tenant_id=?').get(tenantId)
  const message=render(conf.template_absensi_wali,{nama_ortu:s.nama_ortu||user?.nama||'Bapak/Ibu',nama:s.nama,status,tanggal:date,lembaga:school?.nama_lembaga||'Sekolah'})
  return enqueue(db,{tenantId,phone,message,key:`wali:${studentId}:${date}:${session}:${status}`,targetType:'siswa',targetId:studentId})
}
function queueDueTeachers(db,{tenantId,date,time}) {
  const out={queued:0,skipped:0,missing:0}
  if (shouldSuppress(db, tenantId, date)) return {...out, reason:'holiday'}
  const conf=db.prepare('SELECT * FROM notif_settings WHERE tenant_id=?').get(tenantId)
  if(!conf?.guru_belum_ceklok||time<conf.batas_ceklok_guru)return out
  const school=db.prepare('SELECT nama_lembaga FROM settings WHERE tenant_id=?').get(tenantId)
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
  const school=db.prepare('SELECT nama_lembaga FROM settings WHERE tenant_id=?').get(tenantId)
  const rows=db.prepare(`SELECT j.id,j.gtk_id,j.jam_mulai,j.jam_selesai,g.nama nama_guru,g.no_hp,m.nama mapel,r.nama rombel
    FROM jadwal j JOIN gtk g ON g.id=j.gtk_id AND g.tenant_id=j.tenant_id AND g.status='aktif'
    JOIN mapel m ON m.id=j.mapel_id AND m.tenant_id=j.tenant_id JOIN rombel r ON r.id=j.rombel_id AND r.tenant_id=j.tenant_id
    WHERE j.tenant_id=? AND lower(j.hari)=lower(?) AND time(j.jam_mulai) BETWEEN time(?) AND time(?, '+5 minutes')`).all(tenantId,day,time,time)
  for(const x of rows){
    if(!normalizePhone(x.no_hp)){out.missing++;continue}
    const defaultTemplate='Assalamu’alaikum {nama_guru}. Pengingat jadwal mengajar {mapel} di kelas {rombel}, pukul {jam_mulai}–{jam_selesai} pada {tanggal}. — {lembaga}'
    const gtkColumns = db.prepare('PRAGMA table_info(gtk)').all()
    const hasGender = gtkColumns.some(column => column.name === 'jenis_kelamin')
    const gender = hasGender ? db.prepare('SELECT jenis_kelamin FROM gtk WHERE id=? AND tenant_id=?').get(x.gtk_id, tenantId)?.jenis_kelamin : 'L'
    const namaGuru = honorificTeacherName(x.nama_guru, gender)
    const message=render(String(conf.template_jadwal_guru||'').trim()||defaultTemplate,{...x,nama_guru:namaGuru,tanggal:date,lembaga:school?.nama_lembaga||'Sekolah'})
    const r=enqueue(db,{tenantId,phone:x.no_hp,message,key:`jadwal-guru:${x.id}:${date}:${x.jam_mulai}`,targetType:'gtk',targetId:x.gtk_id})
    if (r.queued) out.queued++
    else out.skipped++
  }
  return out
}
module.exports={setupWA,normalizePhone,enqueue,claimNext,render,honorificTeacherName,queueWaliAttendance,queueDueTeachers,queueDueSchedules,isWhitelisted,shouldSuppress}
