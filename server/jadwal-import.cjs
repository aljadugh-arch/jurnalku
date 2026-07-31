const DAYS=new Set(['senin','selasa','rabu','kamis','jumat','sabtu','minggu'])
const TYPES=new Set(['mapel','istirahat','kegiatan'])
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/
function fail(message){throw new Error(message)}
function importJadwalRows(db,tenantId,rows,idFactory){
  if(!Array.isArray(rows)||!rows.length)fail('Data jadwal kosong')
  if(rows.length>5000)fail('Maksimal 5000 baris per impor')
  const ids=(table)=>new Set(db.prepare(`SELECT id FROM ${table} WHERE tenant_id=?`).all(tenantId).map(x=>x.id))
  const rombels=ids('rombel'),mapels=ids('mapel'),gtks=ids('gtk')
  const clean=rows.map((raw,i)=>{
    const n=i+1,r={rombel_id:String(raw?.rombel_id||''),mapel_id:raw?.mapel_id||null,gtk_id:raw?.gtk_id||null,hari:String(raw?.hari||'').toLowerCase(),jam_mulai:String(raw?.jam_mulai||''),jam_selesai:String(raw?.jam_selesai||''),jenis_kegiatan:String(raw?.jenis_kegiatan||'mapel'),nama_kegiatan:String(raw?.nama_kegiatan||'').trim()}
    if(!rombels.has(r.rombel_id))fail(`Baris ${n}: rombel tidak valid untuk tenant ini`)
    if(!DAYS.has(r.hari))fail(`Baris ${n}: hari tidak valid`)
    if(!TIME.test(r.jam_mulai)||!TIME.test(r.jam_selesai)||r.jam_mulai>=r.jam_selesai)fail(`Baris ${n}: waktu tidak valid`)
    if(!TYPES.has(r.jenis_kegiatan))fail(`Baris ${n}: jenis kegiatan tidak valid`)
    if(r.jenis_kegiatan==='mapel'){
      if(!mapels.has(r.mapel_id))fail(`Baris ${n}: mapel tidak valid untuk tenant ini`)
      if(!gtks.has(r.gtk_id))fail(`Baris ${n}: GTK tidak valid untuk tenant ini`)
    }else{r.mapel_id=null;r.gtk_id=null;if(r.nama_kegiatan.length<2||r.nama_kegiatan.length>100)fail(`Baris ${n}: nama kegiatan wajib 2-100 karakter`)}
    return r
  })
  const duplicate=db.prepare(`SELECT id FROM jadwal WHERE tenant_id=? AND rombel_id=? AND hari=? AND jam_mulai=? AND jam_selesai=? AND jenis_kegiatan=? AND COALESCE(mapel_id,'')=COALESCE(?,'') AND COALESCE(gtk_id,'')=COALESCE(?,'') AND COALESCE(nama_kegiatan,'')=?`)
  const insert=db.prepare('INSERT INTO jadwal (id,mapel_id,rombel_id,gtk_id,hari,jam_mulai,jam_selesai,ruangan,template_id,jenis_kegiatan,nama_kegiatan,tenant_id) VALUES (?,?,?,?,?,?,?,\'\',NULL,?,?,?)')
  return db.transaction(items=>{let created=0,skipped=0;for(const r of items){if(duplicate.get(tenantId,r.rombel_id,r.hari,r.jam_mulai,r.jam_selesai,r.jenis_kegiatan,r.mapel_id,r.gtk_id,r.nama_kegiatan)){skipped++;continue}insert.run(idFactory(),r.mapel_id,r.rombel_id,r.gtk_id,r.hari,r.jam_mulai,r.jam_selesai,r.jenis_kegiatan,r.nama_kegiatan,tenantId);created++}return{created,skipped}})(clean)
}
module.exports={importJadwalRows}
