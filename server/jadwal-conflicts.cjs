'use strict'

function detectJadwalConflicts(rows) {
  const konflik = []
  const ov = (a, b) => a.hari === b.hari && a.jam_mulai < b.jam_selesai && a.jam_selesai > b.jam_mulai
  for (let i = 0; i < rows.length; i++) for (let k = i + 1; k < rows.length; k++) {
    const a = rows[i], b = rows[k]
    if (!ov(a, b)) continue
    const teachingPair = a.jenis_kegiatan === 'mapel' && b.jenis_kegiatan === 'mapel'
    let jenis = null
    if (teachingPair && a.gtk_id && a.gtk_id === b.gtk_id) jenis = `Guru ${a.guru_nama} bentrok`
    else if (teachingPair && a.rombel_id === b.rombel_id) jenis = `Kelas ${a.rombel_nama} bentrok`
    else if (teachingPair && a.ruangan && a.ruangan === b.ruangan) jenis = `Ruangan ${a.ruangan} bentrok`
    if (jenis) konflik.push({ jenis, hari: a.hari, jam: `${a.jam_mulai}-${a.jam_selesai}`, a: `${a.mapel_nama} (${a.rombel_nama})`, b: `${b.mapel_nama} (${b.rombel_nama})` })
  }
  return konflik
}

module.exports = { detectJadwalConflicts }
