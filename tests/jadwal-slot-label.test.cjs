const assert = require('node:assert/strict')

const generated = [{ mulai: '07:00', selesai: '07:45' }, { mulai: '07:45', selesai: '08:30' }]
const classify = (mulai, selesai) => generated.some(j => j.mulai === mulai && j.selesai === selesai)

assert.equal(classify('07:00', '07:45'), true, 'mapel pada slot baku harus tetap Jam 1')
assert.equal(classify('06:45', '07:00'), false, 'kegiatan/istirahat di luar slot baku memakai ikon jam')
console.log('jadwal slot label tests passed')
