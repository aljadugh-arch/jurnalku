const HARI = new Set(['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'])
const key = value => String(value || '').trim().toLocaleLowerCase('id-ID')

function parseGuruHariRules(text = '') {
  const rules = {}
  for (const raw of String(text).split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const split = line.indexOf(':')
    if (split < 1) throw new Error('Format aturan harus "Nama Guru: senin, selasa".')
    const nama = key(line.slice(0, split))
    const days = line.slice(split + 1).split(',').map(key).filter(Boolean)
    if (!days.length || days.some(day => !HARI.has(day))) throw new Error('Hari pada aturan guru tidak valid.')
    rules[nama] = [...new Set(days)]
  }
  return rules
}

function guruBolehMengajar(nama, hari, rules) {
  const allowed = rules[key(nama)]
  return !allowed || allowed.includes(key(hari))
}

module.exports = { parseGuruHariRules, guruBolehMengajar }
