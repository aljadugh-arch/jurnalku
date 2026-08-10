'use strict'

function bulkAssignGuru(db, tenantId, scheduleIds, gtkId) {
  if (!Array.isArray(scheduleIds) || scheduleIds.length < 1 || scheduleIds.length > 500) throw new Error('schedule_ids wajib 1 sampai maksimal 500 ID')
  if (!scheduleIds.every(id => typeof id === 'string' && id.trim())) throw new Error('schedule_ids tidak valid')
  if (new Set(scheduleIds).size !== scheduleIds.length) throw new Error('schedule_ids harus unik')
  if (typeof gtkId !== 'string' || !gtkId.trim()) throw new Error('gtk_id wajib diisi')
  return db.transaction(() => {
    const guru = db.prepare('SELECT id FROM gtk WHERE id=? AND tenant_id=?').get(gtkId, tenantId)
    if (!guru) throw new Error('Guru tidak ditemukan pada tenant ini')
    const find = db.prepare(`SELECT j.id, j.jenis_kegiatan, j.mapel_id, m.id AS valid_mapel
      FROM jadwal j LEFT JOIN mapel m ON m.id=j.mapel_id AND m.tenant_id=j.tenant_id
      WHERE j.id=? AND j.tenant_id=?`)
    const rows = scheduleIds.map(id => find.get(id, tenantId))
    if (rows.some(row => !row)) throw new Error('Satu atau lebih jadwal tidak ditemukan pada tenant ini')
    if (rows.some(row => row.jenis_kegiatan !== 'mapel' || !row.mapel_id || !row.valid_mapel)) throw new Error('Bulk guru hanya untuk jadwal mapel valid pada tenant ini')
    const update = db.prepare('UPDATE jadwal SET gtk_id=? WHERE id=? AND tenant_id=?')
    let updated = 0
    for (const id of scheduleIds) updated += update.run(gtkId, id, tenantId).changes
    return { updated }
  })()
}

function cleanupNonMapel(db, tenantId, dryRun = true) {
  const rows = db.prepare(`SELECT * FROM jadwal WHERE tenant_id=? AND jenis_kegiatan!='mapel' ORDER BY id`).all(tenantId)
  const seen = new Set(), duplicate_ids = []
  for (const row of rows) {
    const key = [row.rombel_id, row.hari, row.jam_mulai, row.jam_selesai, row.jenis_kegiatan, row.nama_kegiatan || '', row.mapel_id || ''].join('\0')
    if (seen.has(key)) duplicate_ids.push(row.id); else seen.add(key)
  }
  const gtk_ids_to_clear = rows.filter(row => row.gtk_id).map(row => row.id)
  if (!dryRun) db.transaction(() => {
    const del = db.prepare("DELETE FROM jadwal WHERE id=? AND tenant_id=? AND jenis_kegiatan!='mapel'")
    duplicate_ids.forEach(id => del.run(id, tenantId))
    db.prepare("UPDATE jadwal SET gtk_id=NULL WHERE tenant_id=? AND jenis_kegiatan!='mapel'").run(tenantId)
  })()
  return { duplicate_ids, gtk_ids_to_clear }
}

module.exports = { bulkAssignGuru, cleanupNonMapel }
