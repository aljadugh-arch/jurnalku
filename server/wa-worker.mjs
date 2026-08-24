import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import pino from 'pino'
import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import queue from './wa-queue.cjs'

const db=new Database(path.join(import.meta.dirname,'jurnalku.db')); db.pragma('journal_mode=WAL'); queue.setupWA(db)
const log=pino({level:process.env.LOG_LEVEL||'info'}); const sockets=new Map(); const stopping=new Set(); const retryAfter=new Map()
const nowWib=()=>({date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'}),time:new Date().toLocaleTimeString('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false})})
const safe=id=>String(id).replace(/[^a-zA-Z0-9_-]/g,'_')
function session(tenantId,status,extra={}){db.prepare(`INSERT INTO wa_sessions(tenant_id,status,qr,last_error,phone,updated_at) VALUES(?,?,?,?,?,datetime('now')) ON CONFLICT(tenant_id) DO UPDATE SET status=excluded.status,qr=CASE WHEN excluded.status='qr' THEN excluded.qr WHEN excluded.status='connected' THEN NULL ELSE wa_sessions.qr END,last_error=excluded.last_error,phone=COALESCE(excluded.phone,wa_sessions.phone),updated_at=datetime('now')`).run(tenantId,status,extra.qr||null,extra.error||null,extra.phone||null)}
async function connect(tenantId){
  if(sockets.has(tenantId) || Date.now() < (retryAfter.get(tenantId)||0))return
  fs.mkdirSync(path.join(import.meta.dirname,'wa-auth',safe(tenantId)),{recursive:true})
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Baileys auth helper, not a React Hook
  const {state,saveCreds}=await useMultiFileAuthState(path.join(import.meta.dirname,'wa-auth',safe(tenantId)))
  const {version}=await fetchLatestBaileysVersion()
  const sock=makeWASocket({version,auth:state,logger:log.child({tenantId}),printQRInTerminal:false}); sockets.set(tenantId,sock); session(tenantId,'connecting')
  sock.ev.on('creds.update',saveCreds)
  sock.ev.on('connection.update',({connection,lastDisconnect,qr})=>{
    if(qr)session(tenantId,'qr',{qr}) // QR stored for admin endpoint; never logged
    if(connection==='open'){retryAfter.delete(tenantId);session(tenantId,'connected',{phone:sock.user?.id?.split(':')[0]})}
    if(connection==='close'){
      sockets.delete(tenantId); const code=lastDisconnect?.error?.output?.statusCode
      if(code===DisconnectReason.loggedOut||stopping.delete(tenantId))session(tenantId,'disconnected')
      else {retryAfter.set(tenantId,Date.now()+10000);session(tenantId,'reconnecting',{error:String(lastDisconnect?.error?.message||'connection closed').slice(0,500)}); setTimeout(()=>connect(tenantId).catch(e=>log.error({tenantId,err:e.message},'reconnect')),10000)}
    }
  })
}
async function tick(){
  for(const x of db.prepare("SELECT tenant_id,requested_action FROM wa_sessions WHERE requested_action IS NOT NULL").all()){
    db.prepare('UPDATE wa_sessions SET requested_action=NULL WHERE tenant_id=?').run(x.tenant_id)
    if(x.requested_action==='connect')await connect(x.tenant_id)
    if(x.requested_action==='logout'){
      const sock=sockets.get(x.tenant_id); stopping.add(x.tenant_id); if(sock)await sock.logout().catch(()=>sock.end(undefined)); sockets.delete(x.tenant_id)
      fs.rmSync(path.join(import.meta.dirname,'wa-auth',safe(x.tenant_id)),{recursive:true,force:true}); session(x.tenant_id,'disconnected')
    }
  }
  for(const c of db.prepare("SELECT tenant_id FROM wa_gateway_config WHERE enabled=1 AND provider='baileys'").all()){
    await connect(c.tenant_id)
    const sock=sockets.get(c.tenant_id); if(!sock?.user)continue
    const job=queue.claimNext(db,c.tenant_id); if(!job)continue
    try {const r=await sock.sendMessage(`${job.phone}@s.whatsapp.net`,{text:job.message}); db.prepare("UPDATE wa_queue SET status='sent',sent_at=datetime('now'),message_id=?,last_error=NULL WHERE id=? AND tenant_id=?").run(r.key?.id||null,job.id,c.tenant_id); log.info({tenantId:c.tenant_id,queueId:job.id,status:'sent'},'WA queue message sent')}
    catch(e){const msg=String(e.message||e).slice(0,500); db.prepare("UPDATE wa_queue SET status='failed',failed_at=datetime('now'),last_error=?,available_at=datetime('now',printf('+%d minutes',MIN(attempts,5)*2)) WHERE id=? AND tenant_id=?").run(msg,job.id,c.tenant_id); log.error({tenantId:c.tenant_id,queueId:job.id,status:'failed',error:msg},'WA queue message failed')}
  }
}
function schedule(){const n=nowWib(); for(const c of db.prepare("SELECT tenant_id FROM wa_gateway_config WHERE enabled=1").all())try{queue.queueDueTeachers(db,{tenantId:c.tenant_id,...n});queue.queueDueSchedules(db,{tenantId:c.tenant_id,...n})}catch(e){log.error({tenantId:c.tenant_id,err:e.message},'teacher scheduler')}}
setInterval(()=>tick().catch(e=>log.error({err:e.message},'queue tick')),2000); setInterval(schedule,60000); schedule(); tick()
process.on('SIGTERM',()=>{for(const [id,s] of sockets){stopping.add(id);s.end(undefined)} db.close();process.exit(0)})
