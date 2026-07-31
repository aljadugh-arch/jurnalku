function intervalTumpangTindih(aMulai, aSelesai, bMulai, bSelesai) {
  return aMulai < bSelesai && aSelesai > bMulai
}

function bentrokWaktu(jadwal, guru, hari, mulai, selesai) {
  return jadwal.some(j => j.guru === guru && j.hari === hari && intervalTumpangTindih(j.mulai, j.selesai, mulai, selesai))
}

module.exports = { intervalTumpangTindih, bentrokWaktu }
