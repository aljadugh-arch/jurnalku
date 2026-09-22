const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

for (const [label, file] of [
  ['GuruNilaiSTSPage', 'src/pages/guru/GuruNilaiSTSPage.tsx'],
  ['GuruNilaiSASPage', 'src/pages/guru/GuruNilaiSASPage.tsx'],
]) {
  test(`${label}: hanya membuang input kosong dan tetap mengirim nilai numerik 0`, () => {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    const saveBlock = source.slice(source.indexOf('const handleSave'), source.indexOf('const selectedPengajar'))

    assert.ok(saveBlock.includes("v !== ''"), 'filter harus membedakan input kosong dari angka 0')
    assert.ok(saveBlock.includes('v !== null'), 'filter harus membuang null')
    assert.ok(saveBlock.includes('v !== undefined'), 'filter harus membuang undefined')
    assert.doesNotMatch(saveBlock, /numVal\s*>\s*0/, 'nilai 0 adalah nilai sah dan tidak boleh dibuang')
    assert.doesNotMatch(saveBlock, /nilai\[s\.id\]\s*\|\|\s*0/, 'konversi tidak boleh menyamakan kosong dengan 0')
  })
}
