function relasiUntuk(relasi, rombelId, field, id) {
  return relasi.filter(p => p.rombel_id === rombelId && p[field] === id)
}

function pilihGuru(relasi, rombelId, gtkId, mapelSaatIni, guruKelas = false) {
  if (!gtkId) return ''
  if (guruKelas) return mapelSaatIni
  const cocok = relasiUntuk(relasi, rombelId, 'gtk_id', gtkId)
  if (cocok.some(p => p.mapel_id === mapelSaatIni)) return mapelSaatIni
  return cocok.length === 1 ? cocok[0].mapel_id : ''
}

function pilihMapel(relasi, rombelId, mapelId, guruSaatIni, guruKelasId = '') {
  if (!mapelId) return ''
  const cocok = relasiUntuk(relasi, rombelId, 'mapel_id', mapelId)
  if (cocok.some(p => p.gtk_id === guruSaatIni) || (guruSaatIni && guruSaatIni === guruKelasId)) return guruSaatIni
  const guru = [...new Set(cocok.map(p => p.gtk_id))]
  return guru.length === 1 ? guru[0] : ''
}

module.exports = { pilihGuru, pilihMapel }
