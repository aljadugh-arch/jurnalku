'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createRdmClient,
  extractSasRows,
  bobotRdmKeJurnalku,
} = require('../server/rdm-sas-connector.cjs')

function response(body, { status = 200, cookies = [] } = {}) {
  return {
    status,
    headers: {
      getSetCookie: () => cookies,
      get: () => null,
    },
    async text() { return typeof body === 'string' ? body : JSON.stringify(body) },
  }
}

function fakeRdmFetch() {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    const path = new URL(url).pathname
    if (path === '/auth') {
      return response('<input name="csrf_token" value="csrf-x"><select name="tahunajaran"><option value="ta-x" selected>2025/2026</option></select><select name="semester"><option value="sem-x" selected>Ganjil</option></select>', { cookies: ['sid=abc; Path=/'] })
    }
    if (path === '/login/dologin') return response({ success: true })
    if (path === '/guru/getkelas') return response({ data: [{ ajar_id: 'ajar-1', mapel_id: '145' }], kelas: {} })
    if (path === '/guru/kelas/bobot/ajar-1') return response({ bobot: { bebanjtm: 3, bobotkelas: { harian: 1, paspat: 1 } }, kurikulum: '2' })
    if (path === '/guru/kelas/datasiswa/ajar-1') return response({ data: [{ siswa_id: 'sid-1', siswa_nis: '250001', siswa_nama: 'Siswa Satu' }] })
    if (path === '/guru/pengetahuan/sumatif') return response({ datapas: { 'sid-1': '80' }, datarapor: { 'sid-1': { rapor_nilai: '83', rapor_deskripsi: 'Baik' } }, nilailock: 3 })
    throw new Error(`unexpected path ${path}`)
  }
  return { fetchImpl, calls }
}

test('bobot RDM paspat dipetakan menjadi bobot SAS Jurnalku', () => {
  assert.deepEqual(bobotRdmKeJurnalku({ harian: 1, paspat: 1 }), { harian: 0.5, sts: 0, sas: 0.5 })
  assert.deepEqual(bobotRdmKeJurnalku({ harian: 3, paspat: 1 }), { harian: 0.75, sts: 0, sas: 0.25 })
  assert.equal(bobotRdmKeJurnalku({ harian: 0, paspat: 0 }), null)
})

test('extractSasRows memetakan ID siswa RDM ke NIS dan nilai SAS', () => {
  const rows = extractSasRows({
    siswa: [{ siswa_id: 'enc-1', siswa_nis: ' 250001 ', siswa_nisn: null, siswa_nama: ' A ' }],
    sumatif: { datapas: { 'enc-1': '80' }, datarapor: { 'enc-1': { rapor_nilai: '83', rapor_predikat: 'B', rapor_deskripsi: 'Baik' } } },
  })
  assert.deepEqual(rows[0], { nis: '250001', nisn: '', nama: 'A', rdmSiswaId: 'enc-1', nilaiSas: 80, nilaiRapor: 83, predikat: 'B', deskripsi: 'Baik' })
})

test('connector login memakai token TA/semester dan cookie selectkelas', async () => {
  const { fetchImpl, calls } = fakeRdmFetch()
  const client = createRdmClient({ baseUrl: 'https://rdm.example.test/', username: 'u', password: 'p', fetchImpl })
  const out = await client.pullSas({ ajarId: 'ajar-1' })
  assert.equal(out.rows[0].nilaiSas, 80)
  assert.equal(out.nilailock, 3)
  const login = calls.find(c => c.url.endsWith('/login/dologin'))
  assert.match(login.init.body, /tahunajaran=ta-x/)
  assert.match(login.init.body, /semester=sem-x/)
  const sas = calls.find(c => c.url.endsWith('/guru/pengetahuan/sumatif'))
  assert.equal(sas.init.method, 'GET')
  assert.match(sas.init.headers.Cookie, /selectkelas=ajar-1/)
})
