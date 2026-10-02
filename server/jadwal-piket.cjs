// Guru piket = guru pendamping yang ikut masuk ke satu slot jadwal, maksimal 2
// guru piket per slot. Disimpan sebagai JSON array gtk_id di kolom jadwal.guru_piket.
// Guru piket hanya tampil di jadwal & monitoring; tidak membuat jurnal/absensi sendiri.
const MAKS_GURU_PIKET = 2

function normalizePiketIds(db, { gtk_id, piket_ids, tenant_id }) {
  const ids = Array.isArray(piket_ids) ? piket_ids.filter(x => x != null).map(String).filter(Boolean) : []
  const uniq = [...new Set(ids)]
  if (uniq.length > MAKS_GURU_PIKET) return { error: `Maksimal ${MAKS_GURU_PIKET} guru piket per slot.` }
  if (uniq.includes(String(gtk_id || ''))) return { error: 'Guru piket tidak boleh sama dengan guru utama.' }
  if (uniq.length) {
    const ph = uniq.map(() => '?').join(',')
    const found = db.prepare(`SELECT COUNT(*) AS c FROM gtk WHERE tenant_id=? AND COALESCE(status_kepegawaian,'')!='Nonaktif' AND id IN (${ph})`).get(tenant_id, ...uniq).c
    if (found !== uniq.length) return { error: 'Salah satu guru piket tidak valid untuk tenant ini.' }
  }
  return { ids: uniq }
}

// Tempelkan nama & validitas guru piket ke baris jadwal (hasil query j.*).
function attachPiketNames(db, rows) {
  const idSet = new Set()
  for (const row of rows) {
    try { for (const id of JSON.parse(row.guru_piket || '[]')) if (id) idSet.add(String(id)) } catch {}
  }
  const names = new Map()
  if (idSet.size) {
    const ph = [...idSet].map(() => '?').join(',')
    for (const g of db.prepare(`SELECT id, nama FROM gtk WHERE id IN (${ph})`).all(...idSet)) names.set(g.id, g.nama)
  }
  for (const row of rows) {
    let ids = []
    try { ids = (JSON.parse(row.guru_piket || '[]') || []).map(String).filter(Boolean) } catch {}
    row.piket = ids.map(id => ({ gtk_id: id, nama: names.get(id) || null })).filter(p => p.nama)
  }
  return rows
}

module.exports = { MAKS_GURU_PIKET, normalizePiketIds, attachPiketNames }
