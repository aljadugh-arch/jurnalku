const HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu']

function hariJakarta(date = new Date()) {
  const nama = new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' }).format(date)
  return nama.toLocaleLowerCase('id-ID')
}

function sesiAbsensiSiswa({ waktu, jamPulang, fallbackPulang, explicit, aktif }) {
  if (aktif === false || aktif === 0) throw new Error('Hari libur untuk rombel ini')
  if (explicit != null && !['masuk', 'pulang'].includes(explicit)) throw new Error('Sesi tidak valid')
  if (explicit) return explicit
  const batas = jamPulang || fallbackPulang
  return batas && waktu >= batas ? 'pulang' : 'masuk'
}

module.exports = { HARI, hariJakarta, sesiAbsensiSiswa }
