const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
// Isolated test dependency; no changes to the application's package/lock files.
// npm install --prefix /tmp/jurnalku-frontend-grade-tests --no-audit --no-fund --package-lock=false react-test-renderer@19.2.7
const deps = process.env.FRONTEND_TEST_DEPS || '/tmp/jurnalku-frontend-grade-tests/node_modules'
const React = require(path.join(deps, 'react'))
const { create, act } = require(path.join(deps, 'react-test-renderer'))
global.IS_REACT_ACT_ENVIRONMENT = true
const student = { id: 's1', nama: 'Siswa Satu', nis: '001', rombel_id: 'r1' }
const scope = { mapel: [{ id: 'm1', nama: 'Mapel 1' }, { id: 'm2', nama: 'Mapel 2' }], rombel: [{ id: 'r1', nama: 'Kelas 1' }] }
const jadwal = { siswa: [student], jadwal: scope.mapel.map((m, i) => ({ jadwal_id: `j${i + 1}`, mapel_id: m.id, mapel_nama: m.nama, rombel_id: 'r1', rombel_nama: 'Kelas 1' })) }
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function loadPage(name, api) {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }; cache.set(file, module)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText
    const req = id => {
      if (id === 'react') return React
      if (id === 'react/jsx-runtime') return require(path.join(deps, 'react/jsx-runtime'))
      if (id.endsWith('/services/api')) return { __esModule: true, default: api }
      if (id === 'lucide-react') return new Proxy({}, { get: () => () => null })
      if (id === 'papaparse' && api.csvRows) return { parse: (_file, options) => options.complete({ data: api.csvRows }) }
      if (id.endsWith('ImportNilaiAsesmenExcel')) return { __esModule: true, default: () => null }
      if (id.startsWith('.')) { const base = path.resolve(path.dirname(file), id); return load(['.ts', '.tsx'].map(ext => base + ext).find(f => fs.existsSync(f)) || base) }
      return require(id)
    }
    vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(req, module, module.exports)
    return module.exports
  }
  return load(path.resolve(__dirname, '../src/pages/guru', `${name}.tsx`)).default
}
async function mount(t, name, handlers = {}) {
  const calls = []
  const api = {
    get: async (url, config) => {
      calls.push({ method: 'get', url, config })
      if (handlers.get) { const result = handlers.get(url, config); if (result !== undefined) return result }
      if (url === '/guru/jadwal-context') return { data: jadwal }
      if (url === '/guru/pengajar-saya') return { data: scope }
      if (url === '/siswa') return { data: [student] }
      return { data: [] }
    },
    post: async (url, body) => { calls.push({ method: 'post', url, body }); return handlers.post ? handlers.post(url, body) : { data: { count: body.items?.length || body.data?.length, message: 'tersimpan' } } }
  }
  const Page = loadPage(name, api)
  let tree
  await act(async () => { tree = create(React.createElement(Page)) })
  t.after(async () => { await act(async () => tree.unmount()) })
  return {
    calls, tree,
    numbers: () => tree.root.findAllByType('input').filter(x => x.props.type === 'number'),
    save: () => tree.root.findAllByType('button').find(x => String(x.props.children).includes('Simpan') || JSON.stringify(x.props.children).includes('Simpan')),
    text: () => JSON.stringify(tree.toJSON()),
    change: async (node, value) => { await act(async () => node.props.onChange({ target: { value } })) },
  }
}

const pageNames = ['GuruPenilaianHarianPage', 'GuruNilaiSTSPage', 'GuruNilaiSASPage', 'GuruNilaiSumatifPage']
for (const name of pageNames) {
  test(`${name}: failed grade load is visible and save stays locked`, async t => {
    const pending = deferred()
    const ui = await mount(t, name, { get: url => url.startsWith('/penilaian-harian') || url === '/rapor' ? pending.promise : undefined })
    assert.equal(ui.save().props.disabled, true, 'save locked during load')
    await act(async () => pending.reject(new Error('offline')))
    assert.match(ui.text(), /Gagal memuat/)
    assert.equal(ui.save().props.disabled, true, 'save locked after failed load')
    await act(async () => ui.save().props.onClick())
    assert.equal(ui.calls.filter(c => c.method === 'post').length, 0)
  })
  test(`${name}: late previous mapel response cannot replace current grades`, async t => {
    const old = deferred()
    let switched = false
    const daily = name === 'GuruPenilaianHarianPage'
    const ui = await mount(t, name, { get: url => {
      if (!(url.startsWith('/penilaian-harian') || url === '/rapor')) return
      if (!switched) return old.promise
      return { data: [{ siswa_id: 's1', mapel_id: 'm2', sikap: 22, keaktifan: 33, pengetahuan: 44, nilai_sts: 22, nilai_sas: 22 }] }
    } })
    switched = true
    await ui.change(ui.tree.root.findAllByType('select')[0], daily ? 'j2' : 'm2')
    assert.equal(ui.numbers()[0].props.value, 22)
    await act(async () => old.resolve({ data: [{ siswa_id: 's1', mapel_id: 'm1', sikap: 11, keaktifan: 11, pengetahuan: 11, nilai_sts: 11, nilai_sas: 11 }] }))
    assert.equal(ui.numbers()[0].props.value, 22)
  })
}

for (const name of pageNames) {
  for (const failure of ['count', 'readback']) {
    test(`${name}: never claims save success when ${failure} is incomplete`, async t => {
      const ui = await mount(t, name, { post: () => ({ data: { count: failure === 'count' ? 0 : 1, message: 'tersimpan' } }) })
      for (let i = 0; i < ui.numbers().length; i++) await ui.change(ui.numbers()[i], '0')
      await act(async () => ui.save().props.onClick())
      assert.equal(ui.calls.filter(c => c.method === 'post').length, 1)
      assert.doesNotMatch(ui.text(), /✓/)
      assert.match(ui.text(), /verifikasi|terverifikasi/i)
      assert.equal(ui.save().props.disabled, true, 'uncertain save requires reload before another write')
    })
  }
  test(`${name}: successful save reads back every submitted zero before confirmation`, async t => {
    let saved = null
    const ui = await mount(t, name, {
      post: (_url, body) => { saved = body; return { data: { count: 1 } } },
      get: url => {
        if (!saved || !(url.startsWith('/penilaian-harian') || url === '/rapor')) return
        return { data: [{ siswa_id: 's1', mapel_id: 'm1', sikap: 0, keaktifan: 0, pengetahuan: 0, catatan: '', nilai_sts: 0 }] }
      }
    })
    for (let i = 0; i < ui.numbers().length; i++) await ui.change(ui.numbers()[i], '0')
    await act(async () => ui.save().props.onClick())
    const postIndex = ui.calls.findIndex(c => c.method === 'post')
    assert.ok(ui.calls.slice(postIndex + 1).some(c => c.method === 'get'), 'must read back persisted grades')
    assert.match(ui.text(), /✓/)
    assert.match(ui.text(), /1.*terverifikasi/)
  })
}

for (const name of ['GuruNilaiSTSPage', 'GuruNilaiSASPage']) {
  test(`${name}: import locks manual save/scope and uncertain import requires reload`, async t => {
    const ui = await mount(t, name)
    const importer = ui.tree.root.find(n => typeof n.type === 'function' && n.props.jenis)
    assert.equal(typeof importer.props.onBusyChange, 'function')
    await act(async () => importer.props.onBusyChange(true))
    assert.equal(ui.save().props.disabled, true)
    assert.ok(ui.tree.root.findAllByType('select').every(n => n.props.disabled))
    await act(async () => { importer.props.onUnverified(); importer.props.onBusyChange(false) })
    assert.equal(ui.save().props.disabled, true)
    assert.match(ui.text(), /belum terverifikasi/)
  })
}

for (const mode of ['count', 'readback', 'success']) {
  test(`Excel import: verifies count and canonical persisted grades (${mode})`, async t => {
    const busy = []; let refreshed = 0; let reads = 0
    const api = {
      csvRows: [{ NIS: '001', Nama: 'Siswa Satu', Nilai: '0' }],
      post: async () => ({ data: { count: mode === 'count' ? 0 : 1, message: 'tersimpan' } }),
      get: async url => { reads++; return { data: url === '/siswa' ? [student] : mode === 'success' ? [{ siswa_id: 's1', mapel_id: 'm1', nilai_sts: 0 }] : [] } }
    }
    const Component = loadPage('../../components/ImportNilaiAsesmenExcel', api)
    let tree
    await act(async () => { tree = create(React.createElement(Component, { jenis: 'sts', rombel_id: 'r1', selectedMapel: 'm1', tahunAjaran: '2026/2027', semester: 'ganjil', onBusyChange: value => busy.push(value), onSuccess: () => { refreshed++ } })) })
    t.after(async () => { await act(async () => tree.unmount()) })
    await act(async () => tree.root.findByType('input').props.onChange({ target: { files: [{}] } }))
    const text = JSON.stringify(tree.toJSON())
    if (mode === 'success') {
      assert.ok(reads >= 2, 'resolve NIS and read persisted grades')
      assert.match(text, /1.*terverifikasi/)
      assert.equal(refreshed, 1)
    } else { assert.doesNotMatch(text, /✓/); assert.equal(refreshed, 0) }
    assert.deepEqual(busy, [true, false])
  })
}

test('sumatif: reload uses canonical STS and SAS rows, including zero', async t => {
  const ui = await mount(t, 'GuruNilaiSumatifPage', { get: (url, config) => url === '/rapor' ? { data: config.params.jenis === 'sumatif' ? [] : [{ siswa_id: 's1', mapel_id: 'm1', nilai_sts: config.params.jenis === 'sts' ? 0 : 73 }] } : undefined })
  assert.deepEqual(ui.numbers().map(n => n.props.value), [0, 73])
})
test('sumatif: blank components are omitted rather than saved as zero', async t => {
  const ui = await mount(t, 'GuruNilaiSumatifPage')
  await ui.change(ui.numbers()[0], '0')
  await act(async () => ui.save().props.onClick())
  const item = ui.calls.find(c => c.method === 'post').body.items[0]
  assert.equal(item.nilai_sts, 0)
  assert.equal(item.nilai_sas, undefined)
})
test('harian: untouched rows stay blank and cannot be accidentally saved as zeros', async t => {
  const ui = await mount(t, 'GuruPenilaianHarianPage')
  assert.deepEqual(ui.numbers().map(n => n.props.value), ['', '', ''])
  await act(async () => ui.save().props.onClick())
  assert.equal(ui.calls.filter(c => c.method === 'post').length, 0)
})

test('harian: late date context cannot replace the selected date', async t => {
  const old = deferred(); let first = true
  const ui = await mount(t, 'GuruPenilaianHarianPage', { get: url => {
    if (url !== '/guru/jadwal-context') return
    if (first) { first = false; return old.promise }
    return { data: { ...jadwal, jadwal: [jadwal.jadwal[1]] } }
  } })
  await ui.change(ui.tree.root.findAllByType('input').find(n => n.props.type === 'date'), '2026-10-01')
  assert.equal(ui.tree.root.findAllByType('select')[0].props.value, 'j2')
  await act(async () => old.resolve({ data: { ...jadwal, jadwal: [jadwal.jadwal[0]] } }))
  assert.equal(ui.tree.root.findAllByType('select')[0].props.value, 'j2')
})
for (const name of pageNames) {
  test(`${name}: retry after failed load restores saved zero without writing`, async t => {
    let failed = true
    const ui = await mount(t, name, { get: url => {
      if (!(url.startsWith('/penilaian-harian') || url === '/rapor')) return
      if (failed) return Promise.reject(new Error('offline'))
      return { data: [{ siswa_id: 's1', mapel_id: 'm1', sikap: 0, keaktifan: 0, pengetahuan: 0, nilai_sts: 0 }] }
    } })
    failed = false
    await act(async () => ui.tree.root.findAllByType('button').find(n => n.props.children === 'Coba lagi').props.onClick())
    assert.equal(ui.save().props.disabled, false)
    assert.ok(ui.numbers().every(n => n.props.value === 0))
    assert.equal(ui.calls.filter(c => c.method === 'post').length, 0)
  })
  test(`${name}: null readback is not accepted as persisted zero`, async t => {
    let saved = false
    const ui = await mount(t, name, {
      post: () => { saved = true; return { data: { count: 1 } } },
      get: url => saved && (url.startsWith('/penilaian-harian') || url === '/rapor') ? { data: [{ siswa_id: 's1', mapel_id: 'm1', sikap: null, keaktifan: null, pengetahuan: null, nilai_sts: null, catatan: '' }] } : undefined
    })
    for (let i = 0; i < ui.numbers().length; i++) await ui.change(ui.numbers()[i], '0')
    await act(async () => ui.save().props.onClick())
    assert.doesNotMatch(ui.text(), /✓/)
    assert.equal(ui.save().props.disabled, true)
  })
}
test('harian: a partially completed row is rejected rather than padded with zeros', async t => {
  const ui = await mount(t, 'GuruPenilaianHarianPage')
  await ui.change(ui.numbers()[0], '0')
  await act(async () => ui.save().props.onClick())
  assert.equal(ui.calls.filter(c => c.method === 'post').length, 0)
  assert.match(ui.text(), /Lengkapi ketiga nilai/)
})

test('harian: switching mapel in the same class reloads that mapel', async t => {
  const ui = await mount(t, 'GuruPenilaianHarianPage', { get: url => url.startsWith('/penilaian-harian') ? { data: [{ siswa_id: 's1', sikap: url.includes('m2') ? 22 : 11, keaktifan: 33, pengetahuan: 44 }] } : undefined })
  assert.equal(ui.numbers()[0].props.value, 11)
  await ui.change(ui.tree.root.findAllByType('select')[0], 'j2')
  assert.equal(ui.numbers()[0].props.value, 22)
})
