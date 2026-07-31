function saldoTabungan(rows, tenantId) {
  return rows.filter(r => r.tenant_id === tenantId).reduce((out, r) => {
    out[r.rombel_id] = (out[r.rombel_id] || 0) + (r.tipe === 'setor' ? r.nominal : -r.nominal)
    return out
  }, {})
}
const slotDalamBatas = (rombel, hari, mulai, selesai, batas) => selesai <= (batas[`${rombel}:${hari.toLowerCase()}`] || '23:59')
const pesertaTerpilih = (siswa, ids) => { const selected = new Set(ids); return siswa.filter(s => selected.has(s.id)) }
module.exports = { saldoTabungan, slotDalamBatas, pesertaTerpilih }
