export function pilihGuru(relasi: any[], rombelId: string, gtkId: string, mapelSaatIni: string, guruKelas = false) {
  if (!gtkId) return ''
  if (guruKelas) return mapelSaatIni
  const cocok = relasi.filter(p => p.rombel_id === rombelId && p.gtk_id === gtkId)
  if (cocok.some(p => p.mapel_id === mapelSaatIni)) return mapelSaatIni
  return cocok.length === 1 ? cocok[0].mapel_id : ''
}

export function pilihMapel(relasi: any[], rombelId: string, mapelId: string, guruSaatIni: string, guruKelasId = '') {
  if (!mapelId) return ''
  const cocok = relasi.filter(p => p.rombel_id === rombelId && p.mapel_id === mapelId)
  if (cocok.some(p => p.gtk_id === guruSaatIni) || (guruSaatIni && guruSaatIni === guruKelasId)) return guruSaatIni
  const guru = [...new Set(cocok.map(p => p.gtk_id))]
  return guru.length === 1 ? String(guru[0]) : ''
}