'use strict'

/**
 * rdm-sas-connector.cjs — klien API RDM untuk menarik nilai SAS.
 *
 * Konteks: Jurnalku menangani penilaian harian + STS + SAS sendiri. Bagi
 * lembaga yang memakai RDM, komponen SAS berasal dari RDM, sehingga Jurnalku
 * perlu menarik nilai SAS dari RDM lalu menghitung nilai akhir dengan bobot
 * `rapor_bobot` yang sudah ada.
 *
 * Kontrak API RDM (terverifikasi live pada RDM 3.1, lihat docs/rdm-sas-api.md):
 *   POST auth                              -> HTML login (csrf_token + select TA/semester)
 *   POST login/dologin                     -> { success: true }  (cookie sesi)
 *   POST guru/getkelas                     -> { data:[ajar...], kelas:{ajar_id:{...}} }
 *   POST selectkelas  { selectkelas: ajar }-> set ajar aktif di sesi
 *   GET  guru/kelas/bobot/{ajar_id}        -> { bobot:{ bobotkelas:{harian,paspat,...} } }
 *   GET  guru/kelas/datasiswa/{ajar_id}    -> { data:[{siswa_id,siswa_nis,siswa_nama}] }
 *   GET  guru/pengetahuan/sumatif          -> { datapas:{siswa_id:nilai}, datarapor:{...} }
 *
 * Catatan penting: endpoint nilai RDM bersifat GURU-SCOPED. Akun proktor/admin
 * dapat mengelola kelas & memantau status kirim, tetapi tidak dapat membaca
 * nilai; pembacaan nilai harus memakai akun guru pemilik ajar tersebut.
 */

const DEFAULT_TIMEOUT_MS = 30000

class RdmError extends Error {
  constructor(message, { status, endpoint } = {}) {
    super(message)
    this.name = 'RdmError'
    this.status = status
    this.endpoint = endpoint
  }
}

function normalizeBaseUrl(baseUrl) {
  const raw = String(baseUrl || '').trim()
  if (!raw) throw new RdmError('base_url RDM wajib diisi')
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new RdmError(`base_url RDM tidak valid: ${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new RdmError('base_url RDM harus http/https')
  }
  return url.origin + url.pathname.replace(/\/+$/, '')
}

function extractCsrf(html) {
  const m = /name=["']csrf_token["'][^>]*value=["']([^"']+)["']/i.exec(html)
    || /value=["']([^"']+)["'][^>]*name=["']csrf_token["']/i.exec(html)
  return m ? m[1] : ''
}

function extractSelected(html, name) {
  const block = new RegExp(`<select[^>]*name=["']${name}["'][^>]*>([\\s\\S]*?)</select>`, 'i').exec(html)
  if (!block) return ''
  const opt = /<option[^>]*value=["']([^"']*)["'][^>]*selected/i.exec(block[1])
  return opt ? opt[1] : ''
}

function encodeForm(data) {
  return Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

/**
 * Klien RDM. `fetchImpl` bisa di-inject agar dapat diuji dengan server tiruan.
 */
function createRdmClient({
  baseUrl,
  username,
  password,
  tahunAjaran,
  semester,
  fetchImpl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const base = normalizeBaseUrl(baseUrl)
  if (!username || !password) throw new RdmError('username/password RDM wajib diisi')
  const doFetch = fetchImpl || globalThis.fetch
  if (typeof doFetch !== 'function') throw new RdmError('fetch tidak tersedia')
  let cookie = ''
  let loggedIn = false

  function cookieJar() {
    return new Map(
      cookie.split('; ').filter(Boolean).map(p => {
        const i = p.indexOf('=')
        return i < 0 ? [p, ''] : [p.slice(0, i), p.slice(i + 1)]
      }),
    )
  }

  function writeJar(jar) {
    cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  function setCookie(name, value) {
    const jar = cookieJar()
    jar.set(name, value)
    writeJar(jar)
  }

  async function request(path, { method = 'GET', form, accept = 'application/json, text/html, */*' } = {}) {
    const url = `${base}/${String(path).replace(/^\/+/, '')}`
    const headers = {
      'User-Agent': 'Jurnalku-RDM-Sync/1.0',
      Accept: accept,
      'X-Requested-With': 'XMLHttpRequest',
    }
    if (cookie) headers.Cookie = cookie
    const init = { method, headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) }
    if (form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      init.body = encodeForm(form)
    }
    const res = await doFetch(url, init)
    const setCookie = typeof res.headers?.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers?.get?.('set-cookie')].filter(Boolean)
    if (setCookie.length) {
      const jar = new Map(
        cookie.split('; ').filter(Boolean).map(p => {
          const i = p.indexOf('=')
          return [p.slice(0, i), p.slice(i + 1)]
        }),
      )
      for (const raw of setCookie) {
        const pair = String(raw).split(';')[0]
        const i = pair.indexOf('=')
        if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1))
      }
      cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    }
    const text = await res.text()
    return { status: res.status, text }
  }

  async function json(path, form, method = 'GET') {
    const { status, text } = await request(path, { form, method })
    if (status < 200 || status >= 300) {
      throw new RdmError(`RDM ${path} gagal (HTTP ${status})`, { status, endpoint: path })
    }
    try {
      return JSON.parse(text)
    } catch {
      throw new RdmError(`RDM ${path} tidak mengembalikan JSON (kemungkinan sesi habis)`, {
        status,
        endpoint: path,
      })
    }
  }

  async function login() {
    const { status, text } = await request('auth', { method: 'GET', accept: 'text/html' })
    if (status < 200 || status >= 300) {
      throw new RdmError(`RDM auth gagal (HTTP ${status})`, { status, endpoint: 'auth' })
    }
    const payload = {
      csrf_token: extractCsrf(text),
      username,
      password,
      tahunajaran: tahunAjaran || extractSelected(text, 'tahunajaran'),
      semester: semester || extractSelected(text, 'semester'),
    }
    const out = await json('login/dologin', payload, 'POST')
    if (out && out.success === false) {
      throw new RdmError(`Login RDM ditolak: ${out.message || 'kredensial salah'}`, { endpoint: 'login/dologin' })
    }
    loggedIn = true
    return out
  }

  async function ensureLogin() {
    if (!loggedIn) await login()
  }

  async function getKelas() {
    await ensureLogin()
    const out = await json('guru/getkelas')
    return {
      ajars: Array.isArray(out?.data) ? out.data : [],
      kelas: out?.kelas && typeof out.kelas === 'object' ? out.kelas : {},
      walas: out?.walas || null,
      dataWalas: out?.datawalas || null,
      kokurikuler: Array.isArray(out?.kokurikuler) ? out.kokurikuler : [],
    }
  }

  async function selectKelas(ajarId) {
    await ensureLogin()
    if (!ajarId) throw new RdmError('ajar_id wajib diisi')
    // RDM menyimpan ajar aktif di COOKIE `selectkelas` (bukan route server):
    // controller Angular memakai $cookies.put("selectkelas", idkelas).
    setCookie('selectkelas', String(ajarId))
    // Endpoint `selectkelas` returns 404 in the live RDM; Angular's UI uses
    // the cookie as the actual context, so do not make a failing network call.
    return { selectkelas: String(ajarId) }
  }

  async function getBobot(ajarId) {
    await ensureLogin()
    if (!ajarId) throw new RdmError('ajar_id wajib diisi')
    const out = await json(`guru/kelas/bobot/${encodeURIComponent(ajarId)}`)
    return {
      bebanJtm: out?.bobot?.bebanjtm ?? null,
      bobotKelas: out?.bobot?.bobotkelas || null,
      kurikulum: out?.kurikulum ?? null,
    }
  }

  async function getSiswa(ajarId) {
    await ensureLogin()
    if (!ajarId) throw new RdmError('ajar_id wajib diisi')
    const out = await json(`guru/kelas/datasiswa/${encodeURIComponent(ajarId)}`)
    return Array.isArray(out?.data) ? out.data : []
  }

  async function getSumatif() {
    await ensureLogin()
    const out = await json('guru/pengetahuan/sumatif')
    return {
      komponen: Array.isArray(out?.komponen) ? out.komponen : [],
      datanilai: out?.datanilai || {},
      datapas: out?.datapas || {},
      datapredikat: out?.datapredikat || {},
      datarapor: out?.datarapor || {},
      nilailock: out?.nilailock ?? null,
    }
  }

  /**
   * Tarik SAS untuk satu ajar (guru-mapel-kelas): hasilkan baris siap-impor
   * dengan kunci NIS (bukan ID terenkripsi RDM) agar dapat dipetakan ke siswa
   * Jurnalku.
   */
  async function pullSas({ ajarId } = {}) {
    if (!ajarId) throw new RdmError('ajarId wajib diisi')
    await selectKelas(ajarId)
    const [siswa, sumatif, bobot] = await Promise.all([
      getSiswa(ajarId),
      getSumatif(),
      getBobot(ajarId),
    ])
    return {
      ajarId,
      bobot: bobot.bobotKelas,
      kurikulum: bobot.kurikulum,
      nilailock: sumatif.nilailock,
      rows: extractSasRows({ siswa, sumatif }),
    }
  }

  return { login, getKelas, selectKelas, getBobot, getSiswa, getSumatif, pullSas, baseUrl: base }
}

/**
 * Gabungkan daftar siswa (yang memuat NIS) dengan datapas/datarapor
 * (yang berkunci siswa_id terenkripsi RDM) menjadi baris siap-impor.
 */
function extractSasRows({ siswa = [], sumatif = {} } = {}) {
  const datapas = sumatif.datapas || {}
  const datarapor = sumatif.datarapor || {}
  const rows = []
  for (const s of siswa) {
    const sid = s?.siswa_id
    if (!sid) continue
    const pas = datapas[sid]
    const rapor = datarapor[sid] || {}
    const nilaiSas = pas === undefined || pas === null || pas === '' ? null : Number(pas)
    rows.push({
      nis: String(s.siswa_nis ?? '').trim(),
      nisn: String(s.siswa_nisn ?? '').trim(),
      nama: String(s.siswa_nama ?? '').trim(),
      rdmSiswaId: sid,
      nilaiSas: Number.isFinite(nilaiSas) ? nilaiSas : null,
      nilaiRapor: rapor.rapor_nilai === undefined ? null : Number(rapor.rapor_nilai),
      predikat: rapor.rapor_predikat || '',
      deskripsi: rapor.rapor_deskripsi || '',
    })
  }
  return rows
}

/**
 * Bobot RDM `{harian, paspat, porto, praktek, proyek}` -> bobot SAS Jurnalku.
 * RDM memakai angka relatif (mis. harian=1, paspat=1 berarti 50/50).
 * `paspat` = Penilaian Akhir Semester (SAS).
 */
function bobotRdmKeJurnalku(bobotKelas) {
  if (!bobotKelas || typeof bobotKelas !== 'object') return null
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)
  const harian = num(bobotKelas.harian)
  const sas = num(bobotKelas.paspat)
  const total = harian + sas
  if (total <= 0) return null
  return {
    harian: Number((harian / total).toFixed(4)),
    sts: 0,
    sas: Number((sas / total).toFixed(4)),
  }
}

function buildSasImportItems({ rdmRows = [], jurnalkuSiswa = [], mapelId } = {}) {
  const mid = String(mapelId ?? '').trim()
  if (!mid) throw new TypeError('mapelId wajib diisi')
  const key = value => String(value ?? '').trim()
  const byNis = new Map()
  for (const siswa of jurnalkuSiswa) {
    const nis = key(siswa?.nis)
    if (!nis) continue
    const list = byNis.get(nis) || []
    list.push(siswa)
    byNis.set(nis, list)
  }
  const rdmByNis = new Map()
  const emptyValue = []
  const unmatched = []
  const ambiguous = []
  const items = []
  for (const row of rdmRows) {
    const nis = key(row?.nis)
    const value = row?.nilaiSas
    if (value === null || value === undefined || value === '') {
      emptyValue.push(row)
      continue
    }
    const nilai = Number(value)
    if (!Number.isFinite(nilai) || nilai < 0 || nilai > 100) {
      throw new RangeError(`nilai SAS untuk NIS ${nis || '(kosong)'} harus 0 sampai 100`)
    }
    if (!nis) {
      unmatched.push(row)
      continue
    }
    const existing = rdmByNis.get(nis) || []
    existing.push(row)
    rdmByNis.set(nis, existing)
  }
  for (const [nis, rows] of rdmByNis) {
    const targets = byNis.get(nis) || []
    if (rows.length !== 1 || targets.length !== 1) {
      if (rows.length > 1 || targets.length > 1) ambiguous.push({ nis, rows, targets })
      else unmatched.push(rows[0])
      continue
    }
    items.push({ siswa_id: String(targets[0].id), mapel_id: mid, nilai: Number(rows[0].nilaiSas) })
  }
  return { items, unmatched, ambiguous, emptyValue }
}

module.exports = {
  createRdmClient,
  extractSasRows,
  bobotRdmKeJurnalku,
  buildSasImportItems,
  normalizeBaseUrl,
  extractCsrf,
  extractSelected,
  RdmError,
}
