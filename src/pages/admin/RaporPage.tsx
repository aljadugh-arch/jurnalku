import { useEffect, useMemo, useState } from 'react'
import api from '../../services/api'
import { FileText, Printer, Save, Zap, FileSpreadsheet, Link2, Download } from 'lucide-react'
import FoundationTenantPicker from '../../components/FoundationTenantPicker'
import { QRCodeSVG } from 'qrcode.react'
import { thumbUrl } from '../../lib/thumbUrl'

const emptyPelengkap = {
  prestasi: [] as Array<{ jenis: string; keterangan: string }>,
  catatan_wali_kelas: '', tanggapan_orang_tua: '', keputusan: '', tanggal_pembagian: '',
}

type BagianCetak = 'cover' | 'identitas' | 'nilai' | 'lengkap'

// Menu cetak mengikuti struktur dokumen rapor RDM: sampul, identitas peserta
// didik, lalu capaian hasil belajar. 'lengkap' menggabungkan ketiganya.
const CETAK_MENU: Array<{ bagian: BagianCetak; label: string; deskripsi: string }> = [
  { bagian: 'cover', label: 'Cetak Cover', deskripsi: 'Sampul rapor (A4)' },
  { bagian: 'identitas', label: 'Cetak Identitas Siswa', deskripsi: 'Biodata peserta didik' },
  { bagian: 'nilai', label: 'Cetak Rapor/Nilai Siswa', deskripsi: 'Capaian hasil belajar' },
  { bagian: 'lengkap', label: 'Cetak Lengkap', deskripsi: 'Cover + identitas + nilai' },
]

// Menu cetak K-13 mengikuti bagian yang didukung backend (/api/rapor-k13/pdf):
// cover, identitas, nilai. 'lengkap' = tanpa param bagian (dokumen utuh).
const K13_MENU: Array<{ bagian: BagianCetak; label: string; deskripsi: string }> = [
  { bagian: 'cover', label: 'Cetak Cover', deskripsi: 'Sampul rapor K-13 (A4)' },
  { bagian: 'identitas', label: 'Cetak Identitas Siswa', deskripsi: 'Biodata peserta didik' },
  { bagian: 'nilai', label: 'Cetak Rapor/Nilai Siswa', deskripsi: 'Capaian hasil belajar' },
  { bagian: 'lengkap', label: 'Cetak Lengkap', deskripsi: 'Cover + identitas + nilai' },
]

export default function RaporPage() {
  const [rombelList, setRombelList] = useState<any[]>([])
  const [siswaList, setSiswaList] = useState<any[]>([])
  const [rapor, setRapor] = useState<any[]>([])
  const [ringkasan, setRingkasan] = useState<any>(null)
  const [pelengkap, setPelengkap] = useState<any>(emptyPelengkap)
  const [settings, setSettings] = useState<any>({})
  const [selectedRombel, setSelectedRombel] = useState('')
  const [selectedSiswa, setSelectedSiswa] = useState('')
  const [tahunAjaran, setTahunAjaran] = useState('2026/2027')
  const [semester, setSemester] = useState('ganjil')
  const [jenis, setJenis] = useState<'rapor_sts' | 'rapor_sas'>('rapor_sts')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [foundationTenantId, setFoundationTenantId] = useState<string | null>(null)
  const [cetakOpen, setCetakOpen] = useState(false)
  const [cetakBagian, setCetakBagian] = useState<BagianCetak>('lengkap')
  const [k13CetakOpen, setK13CetakOpen] = useState(false)
  // Layout cetak rapor (Kurikulum Merdeka): 'rdm' (bawaan) atau 'mtsplus' (alternatif).
  const [raporFormat, setRaporFormat] = useState<'rdm' | 'mtsplus'>('rdm')
  const [mapelList, setMapelList] = useState<any[]>([])
  const [bobotMapel, setBobotMapel] = useState('')
  const [bobot, setBobot] = useState<any>(null)
  const [bobotRows, setBobotRows] = useState<any[]>([])
  const [bobotDefaults, setBobotDefaults] = useState<any>(null)
  const [bobotOpen, setBobotOpen] = useState(false)
  const [bobotSaving, setBobotSaving] = useState(false)
  const [bobotMsg, setBobotMsg] = useState('')
  // Kurikulum aktif: 'merdeka' (bawaan, KM) atau 'k13' (klasik).
  const [kurikulum, setKurikulum] = useState<'merdeka' | 'k13'>('merdeka')
  // State editor K-13.
  const [k13Nilai, setK13Nilai] = useState<Record<string, number>>({})
  const [k13Kkm, setK13Kkm] = useState<Record<string, number>>({})
  const [k13Sikap, setK13Sikap] = useState<Record<string, string>>({})
  const [k13Loading, setK13Loading] = useState(false)
  const [k13Jk, setK13Jk] = useState('')
  // Impor nilai (Google Sheets / CSV / Excel) — hybrid dengan input akun guru.
  const [importOpen, setImportOpen] = useState(false)
  const [sheetUrl, setSheetUrl] = useState('')
  const [importJenis, setImportJenis] = useState<'sts' | 'sas' | 'harian'>('sts')
  const [importLoading, setImportLoading] = useState(false)
  const [importPreview, setImportPreview] = useState<any>(null)
  const [csvText, setCsvText] = useState('')

  useEffect(() => { loadRombel(); loadSettings() }, [foundationTenantId])
  useEffect(() => { setSelectedSiswa(''); setRapor([]); setRingkasan(null); if (selectedRombel) loadSiswa() }, [selectedRombel, foundationTenantId])
  useEffect(() => { if (selectedSiswa) loadRapor() }, [selectedSiswa, tahunAjaran, semester, jenis, foundationTenantId])

  const loadSettings = async () => {
    try { const { data } = await api.get('/settings'); setSettings(data) } catch {}
  }
  const loadRombel = async () => {
    try {
      const params: any = {}
      if (foundationTenantId && foundationTenantId !== 'all') params.tenant_id = foundationTenantId
      const { data } = await api.get(foundationTenantId ? '/foundation/students' : '/rombel', { params })
      setRombelList(data)
    } catch (e) { console.error(e) }
  }
  // Bobot nilai hanya berlaku untuk data lembaga sendiri (bukan mode yayasan).
  useEffect(() => { if (!foundationTenantId) loadMapel() }, [foundationTenantId])
  useEffect(() => { if (!foundationTenantId && selectedRombel) loadBobot() }, [selectedRombel, bobotMapel, foundationTenantId])

  const loadMapel = async () => {
    try { const { data } = await api.get('/mapel'); setMapelList(data) } catch (e) { console.error(e) }
  }
  const loadBobot = async () => {
    try {
      const params: any = { rombel_id: selectedRombel }
      if (bobotMapel) params.mapel_id = bobotMapel
      const { data } = await api.get('/rapor/bobot', { params })
      setBobot(data.effective); setBobotRows(data.rows || []); setBobotDefaults(data.defaults)
    } catch (e) { console.error(e) }
  }
  const simpanBobot = async () => {
    if (!selectedRombel) return
    setBobotSaving(true); setBobotMsg('')
    try {
      await api.put('/rapor/bobot', { rombel_id: selectedRombel, mapel_id: bobotMapel, ...flattenBobot(bobot) })
      setBobotMsg('✓ Bobot tersimpan — klik Generate untuk menghitung ulang nilai akhir')
      await loadBobot()
    } catch (e: any) { setBobotMsg(`✗ ${e.response?.data?.error || 'Gagal menyimpan bobot'}`) }
    finally { setBobotSaving(false) }
  }
  const hapusBobot = async () => {
    if (!selectedRombel) return
    setBobotSaving(true); setBobotMsg('')
    try {
      await api.delete('/rapor/bobot', { params: { rombel_id: selectedRombel, mapel_id: bobotMapel } })
      setBobotMsg('✓ Bobot dikembalikan ke bawaan')
      await loadBobot()
    } catch (e: any) { setBobotMsg(`✗ ${e.response?.data?.error || 'Gagal menghapus bobot'}`) }
    finally { setBobotSaving(false) }
  }
  const loadSiswa = async () => {
    try {
      const params: any = { rombel_id: selectedRombel }
      if (foundationTenantId && foundationTenantId !== 'all') params.tenant_id = foundationTenantId
      const { data } = await api.get(foundationTenantId ? '/foundation/students' : '/siswa', { params })
      setSiswaList(data)
    } catch (e) { console.error(e) }
  }
  const loadRapor = async () => {
    setLoading(true)
    try {
      const params: any = { siswa_id: selectedSiswa, tahun_ajaran: tahunAjaran, semester, jenis }
      if (foundationTenantId && foundationTenantId !== 'all') params.tenant_id = foundationTenantId
      if (foundationTenantId) {
        const { data } = await api.get('/foundation/nilai', { params })
        setRapor(data); setRingkasan(null); setPelengkap(emptyPelengkap)
      } else {
        const [nilaiRes, ringkasanRes] = await Promise.all([
          api.get('/rapor', { params }), api.get('/rapor/ringkasan', { params }),
        ])
        setRapor(nilaiRes.data)
        setRingkasan(ringkasanRes.data)
        setPelengkap({ ...emptyPelengkap, ...(ringkasanRes.data.pelengkap || {}), prestasi: ringkasanRes.data.pelengkap?.prestasi || [] })
      }
    } catch (e) { console.error(e); setMsg('✗ Gagal memuat data rapor') }
    finally { setLoading(false) }
  }

  // ===== Editor Rapor K-13 =====
  const loadK13 = async () => {
    if (!selectedSiswa) { setK13Nilai({}); setK13Kkm({}); setK13Sikap({}); return }
    setK13Loading(true)
    try {
      const { data } = await api.get('/rapor-k13', { params: { siswa_id: selectedSiswa, tahun_ajaran: tahunAjaran, semester } })
      const nilaiMap: Record<string, number> = {}
      const kkmMap: Record<string, number> = {}
      ;(data.mapel || []).forEach((m: any) => { nilaiMap[m.id] = m.nilai ?? 0; kkmMap[m.id] = m.kkm ?? 75 })
      setK13Nilai(nilaiMap)
      setK13Kkm(kkmMap)
      setK13Sikap(data.sikap || {})
    } catch (e) { console.error(e); setMsg('✗ Gagal memuat rapor K-13') }
    finally { setK13Loading(false) }
  }
  useEffect(() => { if (kurikulum === 'k13') loadK13() }, [selectedSiswa, tahunAjaran, semester, kurikulum])

  const saveK13Nilai = async () => {
    if (!selectedSiswa) return
    setSaving(true); setMsg('')
    try {
      const data = mapelList.map(m => ({ mapel_id: m.id, nilai: k13Nilai[m.id] ?? 0, kkm: k13Kkm[m.id] ?? 75 }))
      const { data: r } = await api.put('/rapor-k13/nilai', { siswa_id: selectedSiswa, tahun_ajaran: tahunAjaran, semester, data })
      setMsg(`✓ ${r.count} nilai tersimpan`)
    } catch (e: any) { setMsg(`✗ ${e.response?.data?.error || 'Gagal menyimpan nilai K-13'}`) }
    finally { setSaving(false) }
  }

  const saveK13Sikap = async () => {
    if (!selectedSiswa) return
    setSaving(true); setMsg('')
    try {
      await api.put('/rapor-k13/sikap', { siswa_id: selectedSiswa, tahun_ajaran: tahunAjaran, semester, ...k13Sikap })
      setMsg('✓ Sikap tersimpan')
    } catch (e: any) { setMsg(`✗ ${e.response?.data?.error || 'Gagal menyimpan sikap'}`) }
    finally { setSaving(false) }
  }

  const exportK13Pdf = async (bagian: BagianCetak = 'lengkap') => {
    if (!selectedSiswa) { setMsg('✗ Pilih siswa terlebih dahulu'); return }
    const label = { cover: 'Cover', identitas: 'Identitas', nilai: 'Nilai', lengkap: 'Rapor' }[bagian]
    try {
      const params: Record<string, string> = { siswa_id: selectedSiswa, tahun_ajaran: tahunAjaran, semester }
      if (bagian !== 'lengkap') params.bagian = bagian
      const response = await api.get('/rapor-k13/pdf', {
        params,
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `rapor-k13-${label}-${siswa?.nama || selectedSiswa}-${tahunAjaran}-${semester}.pdf`)
      document.body.appendChild(link); link.click(); link.parentNode?.removeChild(link)
      window.URL.revokeObjectURL(url)
      setMsg(`✓ Rapor K-13 (${label}) siap cetak (PDF)`)
    } catch (e: any) {
      let pesan = 'Gagal download PDF'
      const data = e.response?.data
      if (data instanceof Blob) { try { pesan = JSON.parse(await data.text()).error || pesan } catch {} } else if (data?.error) pesan = data.error
      setMsg(`✗ ${pesan}`)
    }
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.setAttribute('download', filename)
    document.body.appendChild(link); link.click(); link.parentNode?.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const exportK13Legger = async (bagian: 'legger' | 'rapor' = 'legger') => {
    if (bagian === 'rapor') { await exportK13Pdf(); return }
    if (!selectedRombel) { setMsg('✗ Pilih kelas terlebih dahulu'); return }
    try {
      const response = await api.get('/rapor-k13/ledger/pdf', {
        params: { rombel_id: selectedRombel, tahun_ajaran: tahunAjaran, semester, jenis_kelamin: k13Jk },
        responseType: 'blob',
      })
      downloadBlob(new Blob([response.data], { type: 'application/pdf' }), `legger-k13-${tahunAjaran}-${semester}.pdf`)
      setMsg('✓ Legger K-13 siap cetak (PDF)')
    } catch (e: any) {
      let pesan = 'Gagal download legger'
      const data = e.response?.data
      if (data instanceof Blob) { try { pesan = JSON.parse(await data.text()).error || pesan } catch {} } else if (data?.error) pesan = data.error
      setMsg(`✗ ${pesan}`)
    }
  }
  const handleGenerate = async () => {
    if (!selectedRombel) return setMsg('Pilih kelas dulu')
    if (foundationTenantId) return setMsg('✗ Generate rapor hanya untuk data lembaga sendiri')
    setLoading(true); setMsg('')
    try {
      const { data } = await api.post('/rapor/generate', { rombel_id: selectedRombel, tahun_ajaran: tahunAjaran, semester, jenis })
      setMsg(`✓ ${data.message}`)
      if (selectedSiswa) await loadRapor()
    } catch (e: any) { setMsg(`✗ ${e.response?.data?.error || 'Gagal generate'}`) }
    finally { setLoading(false) }
  }
  const savePelengkap = async () => {
    if (!selectedSiswa || foundationTenantId) return
    setSaving(true); setMsg('')
    try {
      await api.put('/rapor/pelengkap', { siswa_id: selectedSiswa, tahun_ajaran: tahunAjaran, semester, jenis, ...pelengkap })
      setMsg('✓ Data pelengkap rapor tersimpan')
      await loadRapor()
    } catch (e: any) { setMsg(`✗ ${e.response?.data?.error || 'Gagal menyimpan pelengkap rapor'}`) }
    finally { setSaving(false) }
  }
  const exportPdf = async (bagian: BagianCetak = 'lengkap') => {
    if (!selectedSiswa) { setMsg('✗ Pilih siswa terlebih dahulu'); return }
    if (bagian === 'nilai' || bagian === 'lengkap') {
      if (rapor.length === 0) { setMsg('✗ Belum ada nilai untuk siswa ini. Input/import nilai dulu.'); return }
    }
    if (foundationTenantId) return setMsg('✗ Export PDF hanya untuk data lembaga sendiri')
    const label = { cover: 'Cover', identitas: 'Identitas', nilai: 'Nilai', lengkap: 'Rapor' }[bagian]
    try {
      const response = await api.get('/rapor/export/pdf', {
        params: { siswa_id: selectedSiswa, tahun_ajaran: tahunAjaran, semester, jenis, bagian, format: raporFormat },
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${label}-${siswa?.nama || selectedSiswa}-${tahunAjaran}-${semester}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.parentNode?.removeChild(link)
      window.URL.revokeObjectURL(url)
      setMsg(`✓ ${label} siap cetak (PDF)`)
    } catch (e: any) {
      // responseType 'blob' membuat badan error ikut jadi blob; baca ulang sebagai JSON.
      let pesan = 'Gagal download PDF'
      const data = e.response?.data
      if (data instanceof Blob) {
        try { pesan = JSON.parse(await data.text()).error || pesan } catch { /* biarkan pesan bawaan */ }
      } else if (data?.error) {
        pesan = data.error
      }
      setMsg(`✗ ${pesan}`)
    }
  }

  // Cetak MASSAL seluruh siswa satu kelas (format mtsplus) jadi SATU PDF.
  const exportPdfBulk = async (bagian: BagianCetak = 'lengkap') => {
    if (!selectedRombel) { setMsg('✗ Pilih kelas terlebih dahulu'); return }
    if (foundationTenantId) return setMsg('✗ Cetak massal hanya untuk data lembaga sendiri')
    if (raporFormat !== 'mtsplus') return setMsg('✗ Cetak massal tersedia pada layout "MTs Plus"')
    setMsg('⏳ Membuat PDF massal…')
    try {
      const response = await api.get('/rapor/export/pdf-bulk', {
        params: { rombel_id: selectedRombel, tahun_ajaran: tahunAjaran, semester, jenis, bagian },
        responseType: 'blob',
        timeout: 120000,
      })
      downloadBlob(new Blob([response.data], { type: 'application/pdf' }), `rapor-${bagian}-mtsplus-${rombel?.nama || selectedRombel}-${tahunAjaran}-${semester}.pdf`)
      setMsg('✓ PDF massal siap cetak (satu file untuk seluruh kelas)')
    } catch (e: any) {
      let pesan = 'Gagal membuat PDF massal'
      const data = e.response?.data
      if (data instanceof Blob) {
        try { pesan = JSON.parse(await data.text()).error || pesan } catch { /* biarkan */ }
      } else if (data?.error) pesan = data.error
      setMsg(`✗ ${pesan}`)
    }
  }

  // Cetak SEMUA kelas/tenant (tanpa rombel) jadi SATU PDF.
  const exportPdfBulkAll = async (bagian: BagianCetak = 'lengkap') => {
    if (foundationTenantId) return setMsg('✗ Cetak massal hanya untuk data lembaga sendiri')
    if (raporFormat !== 'mtsplus') return setMsg('✗ Cetak massal tersedia pada layout "MTs Plus"')
    setMsg('⏳ Membuat PDF seluruh siswa…')
    try {
      const response = await api.get('/rapor/export/pdf-bulk', {
        params: { tahun_ajaran: tahunAjaran, semester, jenis, bagian },
        responseType: 'blob',
        timeout: 300000,
      })
      downloadBlob(new Blob([response.data], { type: 'application/pdf' }), `rapor-${bagian}-mtsplus-semua-${tahunAjaran}-${semester}.pdf`)
      setMsg('✓ PDF seluruh siswa siap cetak (satu file)')
    } catch (e: any) {
      let pesan = 'Gagal membuat PDF massal'
      const data = e.response?.data
      if (data instanceof Blob) {
        try { pesan = JSON.parse(await data.text()).error || pesan } catch { /* biarkan */ }
      } else if (data?.error) pesan = data.error
      setMsg(`✗ ${pesan}`)
    }
  }

  // Pratinjau impor dari Google Sheets / CSV / Excel (server yang parse & cocokkan).
  const handleImportPreview = async (source: 'sheet' | 'csv', csvText?: string) => {
    if (foundationTenantId) return setMsg('✗ Impor nilai hanya untuk data lembaga sendiri')
    setImportLoading(true); setImportPreview(null); setMsg('')
    try {
      const payload: any = { jenis: importJenis }
      if (source === 'sheet') payload.sheet_url = sheetUrl
      else payload.csv_text = csvText
      const { data } = await api.post('/rapor/import/preview', payload)
      setImportPreview(data)
      setMsg(`✓ Preview: ${data.jumlah_cocok} nilai cocok, ${data.jumlah_tidak_cocok} tidak dikenali`)
    } catch (e: any) { setMsg(`✗ ${e.response?.data?.error || 'Gagal memproses sumber nilai'}`) }
    finally { setImportLoading(false) }
  }

  // Terapkan hasil preview ke DB (STS/SAS ke tabel rapor, harian ke penilaian_harian).
  const handleImportApply = async () => {
    if (!importPreview?.items?.length) return setMsg('✗ Tidak ada item valid untuk diimpor')
    setImportLoading(true); setMsg('')
    try {
      const { data } = await api.post('/rapor/import/apply', { jenis: importJenis, tahun_ajaran: tahunAjaran, semester, items: importPreview.items })
      setMsg(`✓ ${data.message}`)
      setImportPreview(null); setSheetUrl('')
      if (selectedSiswa) await loadRapor()
    } catch (e: any) { setMsg(`✗ ${e.response?.data?.error || 'Gagal mengimpor nilai'}`) }
    finally { setImportLoading(false) }
  }

  const siswa = ringkasan?.siswa || siswaList.find(s => s.id === selectedSiswa)
  const rombel = rombelList.find(r => r.id === selectedRombel)
  const rataAkhir = rapor.length ? Math.round(rapor.reduce((sum, row) => sum + (Number(row.nilai_akhir) || 0), 0) / rapor.length) : 0
  const jenisLabel = jenis === 'rapor_sas' ? 'AKHIR SEMESTER (SAS)' : 'TENGAH SEMESTER (STS)'
  const formulaLabel = jenis === 'rapor_sas'
    ? 'Nilai Akhir = (Nilai Harian × 40%) + (Asesmen STS × 20%) + (Asesmen SAS × 40%)'
    : 'Nilai Akhir = (Nilai Harian × 60%) + (Asesmen STS × 40%)'
  const tanggal = pelengkap.tanggal_pembagian ? new Date(`${pelengkap.tanggal_pembagian}T00:00:00`) : new Date()
  const tanggalCetak = `${settings.kota_cetak || 'Bondowoso'}, ${tanggal.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
  const attendance = ringkasan?.kehadiran || { hadir: 0, sakit: 0, izin: 0, alpa: 0 }
  const personality = ringkasan?.kepribadian || {}
  const prestasi = Array.isArray(pelengkap.prestasi) ? pelengkap.prestasi : []
  const identityRows = useMemo(() => [
    ['Nama Lengkap', siswa?.nama],
    ['NIS / NISN', [siswa?.nis, siswa?.nisn].filter(Boolean).join(' / ')],
    ['Tempat, Tanggal Lahir', [siswa?.tempat_lahir, siswa?.tanggal_lahir].filter(Boolean).join(', ')],
    ['Jenis Kelamin', siswa?.jenis_kelamin === 'L' ? 'Laki-laki' : siswa?.jenis_kelamin === 'P' ? 'Perempuan' : siswa?.jenis_kelamin],
    ['Agama', siswa?.agama],
    ['Status dalam Keluarga', siswa?.status_keluarga],
    ['Anak Ke', siswa?.anak_ke],
    ['Alamat Peserta Didik', siswa?.alamat],
    ['Nomor Telepon', siswa?.no_hp],
    ['Sekolah Asal (SD/MI)', siswa?.asal_sekolah],
    ['Kelas', siswa?.rombel_nama || rombel?.nama],
    ['Nama Ayah', siswa?.nama_ayah],
    ['Nama Ibu', siswa?.nama_ibu],
    ['Alamat Orang Tua', siswa?.alamat_ortu],
    ['Pekerjaan Ayah', siswa?.kerja_ayah],
    ['Pekerjaan Ibu', siswa?.kerja_ibu],
    ['Nama Wali', siswa?.nama_wali],
    ['Pekerjaan Wali', siswa?.kerja_wali],
  ], [siswa, rombel])
  const verificationText = `Rapor - ${siswa?.nama || '-'} - Kepsek: ${settings.kepala_sekolah || '-'} - Diverifikasi digital`

  // Pratinjau mengikuti bagian cetak terakhir yang dipilih. Cover dan identitas
  // hanya butuh data siswa, jadi tetap muncul walau rapor belum digenerate.
  const tampilCover = ['cover', 'lengkap'].includes(cetakBagian)
  const tampilIdentitas = ['identitas', 'lengkap'].includes(cetakBagian)
  const tampilNilai = ['nilai', 'lengkap'].includes(cetakBagian) && rapor.length > 0
  const tampilPratinjau = tampilCover || tampilIdentitas || tampilNilai

  return (
    <div className="space-y-6">
      <style>{`@media print { @page { size: A4 portrait; margin: 0; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } #rapor-print { margin: 0 !important; } .report-page { box-sizing: border-box; width: 210mm; height: 297mm; min-height: 297mm; margin: 0 !important; padding: 14mm !important; overflow: hidden; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; break-after: page; page-break-after: always; } .report-page:last-child { break-after: auto; page-break-after: auto; } }`}</style>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div><h1 className="text-2xl font-display font-bold text-gray-800">Rapor Siswa</h1><p className="text-sm text-gray-500 mt-1">Rapor akademik dan perkembangan peserta didik</p></div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className="block text-[11px] font-medium text-gray-500 mb-1">Kurikulum</span>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button onClick={() => setKurikulum('merdeka')} className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap ${kurikulum === 'merdeka' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Kurikulum Merdeka</button>
              <button onClick={() => setKurikulum('k13')} className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap ${kurikulum === 'k13' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>K-13</button>
            </div>
          </div>
          {!foundationTenantId && kurikulum === 'merdeka' && (
            <div>
              <span className="block text-[11px] font-medium text-gray-500 mb-1">Layout Cetak</span>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden" title="Layout cetak rapor Kurikulum Merdeka">
                <button onClick={() => setRaporFormat('rdm')} className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap ${raporFormat === 'rdm' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Layout RDM</button>
                <button onClick={() => setRaporFormat('mtsplus')} className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap ${raporFormat === 'mtsplus' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Layout MTs Plus</button>
              </div>
            </div>
          )}
          {selectedSiswa && !foundationTenantId && kurikulum === 'merdeka' && <button onClick={savePelengkap} disabled={saving} className="btn-secondary flex items-center gap-2"><Save className="w-4 h-4" />{saving ? 'Menyimpan...' : 'Simpan Pelengkap'}</button>}
          {selectedSiswa && !foundationTenantId && kurikulum === 'k13' && (
            <>
              <button onClick={() => exportK13Legger('legger')} disabled={!selectedRombel} className="btn-secondary flex items-center gap-2"><Printer className="w-4 h-4" />Legger</button>
              <div className="relative">
                <button onClick={() => setK13CetakOpen(!k13CetakOpen)} aria-haspopup="menu" aria-expanded={k13CetakOpen} className="btn-primary flex items-center gap-2"><Printer className="w-4 h-4" />Cetak K-13</button>
                {k13CetakOpen && (
                  <div role="menu" className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                    {K13_MENU.map(item => (
                      <button
                        key={item.bagian}
                        role="menuitem"
                        onClick={() => { setK13CetakOpen(false); void exportK13Pdf(item.bagian) }}
                        className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        <span className="font-medium text-gray-800">{item.label}</span>
                        <span className="block text-xs text-gray-500">{item.deskripsi}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          {selectedRombel && !foundationTenantId && kurikulum === 'merdeka' && raporFormat === 'mtsplus' && (
            <button onClick={() => void exportPdfBulk('lengkap')} disabled={!selectedRombel} title="Cetak seluruh siswa di kelas ini jadi satu PDF" className="btn-secondary flex items-center gap-2 whitespace-nowrap"><Printer className="w-4 h-4" />Cetak Massal (Kelas)</button>
          )}
          {!foundationTenantId && kurikulum === 'merdeka' && raporFormat === 'mtsplus' && (
            <button onClick={() => void exportPdfBulkAll('lengkap')} title="Cetak seluruh siswa semua kelas jadi satu PDF" className="btn-secondary flex items-center gap-2 whitespace-nowrap"><Printer className="w-4 h-4" />Cetak Semua Kelas</button>
          )}
          {selectedSiswa && !foundationTenantId && kurikulum === 'merdeka' && (
            <div className="relative">
              <button onClick={() => setCetakOpen(!cetakOpen)} aria-haspopup="menu" aria-expanded={cetakOpen} className="btn-primary flex items-center gap-2"><Printer className="w-4 h-4" />Cetak</button>
              {cetakOpen && (
                <div role="menu" className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                  {CETAK_MENU.map(item => (
                    <button
                      key={item.bagian}
                      role="menuitem"
                      onClick={() => { setCetakOpen(false); setCetakBagian(item.bagian); void exportPdf(item.bagian) }}
                      className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="font-medium text-gray-800">{item.label}</span>
                      <span className="block text-xs text-gray-500">{item.deskripsi}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="print:hidden"><FoundationTenantPicker selectedTenantId={foundationTenantId} onSelectTenant={setFoundationTenantId} /></div>
      <div className="card p-5 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
          <Select label="Kelas" value={selectedRombel} onChange={setSelectedRombel} options={rombelList.map(r => ({ value: r.id, label: r.nama }))} placeholder="Pilih Kelas" />
          <Select label="Siswa" value={selectedSiswa} onChange={setSelectedSiswa} options={siswaList.map(s => ({ value: s.id, label: s.nama }))} placeholder="Pilih Siswa" disabled={!selectedRombel} />
          <Field label="Tahun Ajaran"><input value={tahunAjaran} onChange={e => setTahunAjaran(e.target.value)} className="input" /></Field>
          <Select label="Semester" value={semester} onChange={setSemester} options={[{ value: 'ganjil', label: 'Ganjil' }, { value: 'genap', label: 'Genap' }]} />
          {kurikulum === 'k13' && <Select label="Jenis Kelamin" value={k13Jk} onChange={setK13Jk} options={[{ value: '', label: 'Semua' }, { value: 'L', label: 'Laki-laki' }, { value: 'P', label: 'Perempuan' }]} />}
          {kurikulum === 'merdeka' && <Field label="Jenis Rapor"><select value={jenis} onChange={e => setJenis(e.target.value as any)} className="input"><option value="rapor_sts">Rapor STS (Tengah Semester)</option><option value="rapor_sas">Rapor SAS (Akhir Semester)</option></select></Field>}
        </div>
        {msg && <p className={`mt-3 text-sm ${msg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{msg}</p>}
      </div>

      {kurikulum === 'k13' && selectedSiswa && !foundationTenantId && (
        <div className="card p-5 print:hidden space-y-6">
          <h2 className="font-semibold text-gray-800">Editor Rapor K-13</h2>
          {k13Loading ? <p className="text-sm text-gray-400">Memuat nilai...</p> : (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-700">Nilai Akhir per Mata Pelajaran</h3>
                  <button onClick={saveK13Nilai} disabled={saving || mapelList.length === 0} className="btn-primary flex items-center gap-2 text-sm"><Save className="w-4 h-4" />{saving ? 'Menyimpan...' : 'Simpan Nilai'}</button>
                </div>
                {mapelList.length === 0 ? <p className="text-sm text-gray-400">Belum ada mata pelajaran. Tambahkan di menu Mapel.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-100"><Th align="left">Mata Pelajaran</Th><Th>Nilai (0-100)</Th><Th>KKM</Th><Th>Predikat</Th></tr></thead>
                      <tbody>{mapelList.map(m => <tr key={m.id} className="border-t">
                        <Td align="left">{m.nama}</Td>
                        <Td><input type="number" min={0} max={100} value={k13Nilai[m.id] ?? 0} onChange={e => setK13Nilai({ ...k13Nilai, [m.id]: Number(e.target.value) || 0 })} className="input w-20 text-center" /></Td>
                        <Td><input type="number" min={0} max={100} value={k13Kkm[m.id] ?? 75} onChange={e => setK13Kkm({ ...k13Kkm, [m.id]: Number(e.target.value) || 0 })} className="input w-20 text-center" /></Td>
                        <Td bold>{k13Predikat(k13Nilai[m.id] ?? 0)}</Td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-700">Sikap Wali Kelas & Catatan</h3>
                  <button onClick={saveK13Sikap} disabled={saving} className="btn-secondary flex items-center gap-2 text-sm"><Save className="w-4 h-4" />Simpan Sikap</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[['kelakuan', 'Kelakuan'], ['kerajinan', 'Kerajinan'], ['kerapian', 'Kerapian'], ['kebersihan', 'Kebersihan'], ['kedisiplinan', 'Kedisiplinan'], ['ketaatan', 'Ketaatan']].map(([key, label]) => (
                    <Field key={key} label={label}><select value={k13Sikap[key] || ''} onChange={e => setK13Sikap({ ...k13Sikap, [key]: e.target.value })} className="input"><option value="">-</option>{['A', 'B', 'C', 'D', 'E'].map(g => <option key={g} value={g}>{g}</option>)}</select></Field>
                  ))}
                </div>
                <div className="grid gap-3 mt-3">
                  <TextArea label="Catatan Wali Kelas" value={k13Sikap.catatan || ''} onChange={(v: string) => setK13Sikap({ ...k13Sikap, catatan: v })} />
                  <Field label="Ekstrakurikuler (mis. Pramuka: A, Drumband: B)"><input value={k13Sikap.ekstrakurikuler || ''} onChange={e => setK13Sikap({ ...k13Sikap, ekstrakurikuler: e.target.value })} className="input" placeholder="Pramuka: A, Drumband: B" /></Field>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {kurikulum === 'merdeka' && !foundationTenantId && (
        <div className="card p-5 print:hidden">
          <div className="flex w-full items-center justify-between gap-3">
            <button type="button" onClick={() => setBobotOpen(!bobotOpen)} className="flex flex-1 items-center justify-between text-left">
              <span className="font-semibold text-gray-800">Bobot Nilai Rapor</span>
              <span className="text-sm text-gray-500">{bobotOpen ? 'Sembunyikan' : 'Atur'} {bobot && `· STS ${pct(bobot.sts?.harian)}/${pct(bobot.sts?.sts)}${bobot.sts?.sas ? `/${pct(bobot.sts.sas)}` : ''}`}</span>
            </button>
            <button onClick={handleGenerate} disabled={loading || !selectedRombel} title="Hitung & simpan nilai akhir ke tabel untuk Ledger/Rekap (cetak rapor tidak membutuhkannya)" className="btn-secondary flex items-center gap-2 text-xs"><Zap className="w-4 h-4" />{loading ? 'Memproses...' : 'Simpan ke Ledger'}</button>
          </div>
          {bobotOpen && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-gray-500">
                Bobot menentukan bagaimana Nilai Harian, STS, dan SAS digabung menjadi nilai akhir.
                Kosongkan mapel untuk aturan seluruh kelas, atau pilih mapel untuk aturan khusus mapel tersebut.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Berlaku untuk">
                  <select value={bobotMapel} onChange={e => setBobotMapel(e.target.value)} className="input">
                    <option value="">Seluruh mapel di kelas ini</option>
                    {mapelList.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                  </select>
                </Field>
                <div className="flex items-end gap-2">
                  <button onClick={simpanBobot} disabled={bobotSaving || !bobot} className="btn-primary flex items-center gap-2"><Save className="w-4 h-4" />{bobotSaving ? 'Menyimpan...' : 'Simpan Bobot'}</button>
                  <button onClick={hapusBobot} disabled={bobotSaving || !selectedRombel} className="btn-secondary">Kembalikan ke Bawaan</button>
                </div>
              </div>
              {bobot && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <BobotGroup title="Rapor STS (Tengah Semester)" jenis="sts" bobot={bobot.sts} defaults={bobotDefaults?.sts} onChange={(v: any) => setBobot({ ...bobot, sts: v })} />
                <BobotGroup title="Rapor SAS (Akhir Semester)" jenis="sas" bobot={bobot.sas} defaults={bobotDefaults?.sas} onChange={(v: any) => setBobot({ ...bobot, sas: v })} />
              </div>}
              {bobotMsg && <p className={`text-sm ${bobotMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{bobotMsg}</p>}
              {bobotRows.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Aturan yang sudah disimpan</p>
                  <table className="w-full text-xs">
                    <thead><tr className="bg-gray-100"><Th align="left">Kelas</Th><Th align="left">Mapel</Th><Th>STS (Harian/STS/SAS)</Th><Th>SAS (Harian/STS/SAS)</Th></tr></thead>
                    <tbody>{bobotRows.map((r, i) => <tr key={i}>
                      <Td align="left">{r.rombel_id ? (rombelList.find(x => x.id === r.rombel_id)?.nama || r.rombel_id) : 'Semua kelas'}</Td>
                      <Td align="left">{r.mapel_id ? (mapelList.find(x => x.id === r.mapel_id)?.nama || r.mapel_id) : 'Semua mapel'}</Td>
                      <Td>{pct(r.sts_harian)} / {pct(r.sts_sts)} / {pct(r.sts_sas)}</Td>
                      <Td>{pct(r.sas_harian)} / {pct(r.sas_sts)} / {pct(r.sas_sas)}</Td>
                    </tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {kurikulum === 'merdeka' && !foundationTenantId && (
        <div className="card p-5 print:hidden">
          <button type="button" onClick={() => setImportOpen(!importOpen)} className="flex w-full items-center justify-between text-left">
            <span className="font-semibold text-gray-800 flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" />Impor Nilai (Google Sheets / CSV)</span>
            <span className="text-sm text-gray-500">{importOpen ? 'Sembunyikan' : 'Buka'}</span>
          </button>
          {importOpen && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-gray-500">Input nilai massal lewat Google Sheets publik (&quot;siapa saja dengan link dapat melihat&quot;) atau tempel CSV. Kolom identitas (NIS/NISN/Nama) lalu kolom nilai per mapel, atau format panjang NIS/Mapel/Nilai. Admin & guru bisa mengisi; hasil sama.</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Jenis Nilai">
                  <select value={importJenis} onChange={e => setImportJenis(e.target.value as any)} className="input">
                    <option value="sts">STS (Tengah Semester)</option>
                    <option value="sas">SAS (Akhir Semester)</option>
                    <option value="harian">Nilai Harian</option>
                  </select>
                </Field>
                <Field label="URL Google Sheets">
                  <input value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className="input" />
                </Field>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => void handleImportPreview('sheet')} disabled={importLoading || !sheetUrl.trim()} className="btn-primary flex items-center gap-2"><Link2 className="w-4 h-4" />{importLoading ? 'Memproses…' : 'Pratinjau Google Sheets'}</button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Atau tempel CSV</label>
                <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={4} placeholder="NIS;Matematika;IPA\n101;85;78" className="input resize-y font-mono text-xs" />
                <div className="mt-2"><button onClick={() => void handleImportPreview('csv', csvText)} disabled={importLoading || !csvText.trim()} className="btn-secondary flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" />Pratinjau CSV</button></div>
              </div>
              {importPreview && (
                <div className="space-y-3">
                  {importPreview.sheets?.length > 0 && <div className="flex flex-wrap gap-2">{importPreview.sheets.map((s: any, i: number) => <span key={i} className="text-xs bg-gray-100 rounded px-2 py-1">{s.nama}: {s.jumlah_cocok} cocok / {s.jumlah_tidak_cocok} gagal</span>)}</div>}
                  <p className="text-sm">{importPreview.jumlah_cocok} nilai cocok, {importPreview.jumlah_tidak_cocok} tidak dikenali.</p>
                  {importPreview.tidak_cocok?.length > 0 && (
                    <div className="max-h-40 overflow-y-auto text-xs text-red-600 space-y-1">
                      {importPreview.tidak_cocok.slice(0, 50).map((t: any, i: number) => <p key={i}>• {t.ident || '-'} / {t.mapel || '-'}: {t.alasan}</p>)}
                      {importPreview.tidak_cocok.length > 50 && <p>… dan {importPreview.tidak_cocok.length - 50} lainnya</p>}
                    </div>
                  )}
                  <button onClick={handleImportApply} disabled={importLoading || !importPreview?.items?.length} className="btn-primary flex items-center gap-2"><Download className="w-4 h-4" />Terapkan Impor ({importPreview.items?.length || 0} nilai)</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {kurikulum === 'merdeka' && selectedSiswa && !foundationTenantId && (
        <div className="card p-5 print:hidden space-y-4">
          <h2 className="font-semibold text-gray-800">Data Pelengkap Rapor</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Tanggal Pembagian"><input type="date" value={pelengkap.tanggal_pembagian || ''} onChange={e => setPelengkap({ ...pelengkap, tanggal_pembagian: e.target.value })} className="input" /></Field>
            <Field label="Keputusan"><input value={pelengkap.keputusan || ''} onChange={e => setPelengkap({ ...pelengkap, keputusan: e.target.value })} placeholder="Naik ke kelas... / Lulus" className="input" /></Field>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <TextArea label="Catatan Wali Kelas" value={pelengkap.catatan_wali_kelas} onChange={(v: string) => setPelengkap({ ...pelengkap, catatan_wali_kelas: v })} />
            <TextArea label="Tanggapan Orang Tua/Wali" value={pelengkap.tanggapan_orang_tua} onChange={(v: string) => setPelengkap({ ...pelengkap, tanggapan_orang_tua: v })} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2"><label className="text-sm font-medium text-gray-700">Prestasi</label><button type="button" onClick={() => setPelengkap({ ...pelengkap, prestasi: [...prestasi, { jenis: '', keterangan: '' }] })} className="text-sm text-primary-600">+ Tambah Prestasi</button></div>
            <div className="space-y-2">{prestasi.map((p: any, i: number) => <div key={i} className="grid sm:grid-cols-[180px_1fr_auto] gap-2"><input value={p.jenis} onChange={e => { const next = [...prestasi]; next[i] = { ...p, jenis: e.target.value }; setPelengkap({ ...pelengkap, prestasi: next }) }} placeholder="Akademik/Nonakademik" className="input" /><input value={p.keterangan} onChange={e => { const next = [...prestasi]; next[i] = { ...p, keterangan: e.target.value }; setPelengkap({ ...pelengkap, prestasi: next }) }} placeholder="Nama dan tingkat prestasi" className="input" /><button onClick={() => setPelengkap({ ...pelengkap, prestasi: prestasi.filter((_: any, x: number) => x !== i) })} className="px-3 text-red-600">Hapus</button></div>)}</div>
          </div>
        </div>
      )}

      {kurikulum === 'merdeka' && !selectedSiswa && <div className="card py-16 text-center print:hidden"><FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">Pilih kelas dan siswa untuk melihat rapor.</p></div>}
      {kurikulum === 'merdeka' && selectedSiswa && !loading && rapor.length === 0 && <div className="card py-12 text-center print:hidden"><p className="text-gray-500">Belum ada nilai untuk siswa ini pada periode tersebut. Input/import nilai harian atau asesmen dulu. Cover dan identitas siswa tetap bisa dicetak lewat menu Cetak.</p></div>}
      {kurikulum === 'k13' && !selectedSiswa && <div className="card py-16 text-center print:hidden"><FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">Pilih kelas dan siswa, lalu isi nilai akhir per mapel dan sikap. Klik "Cetak K-13" untuk unduh PDF.</p></div>}

      {kurikulum === 'merdeka' && selectedSiswa && tampilPratinjau && <div id="rapor-print" className="space-y-6 print:space-y-0">
        {tampilCover && <section className="report-page relative bg-white rounded-xl shadow-sm border-2 border-black p-6 sm:p-12 text-center flex flex-col items-center justify-center print:p-0">
          <div className="absolute inset-2 border border-black pointer-events-none" />
          {settings.logo && <img src={settings.logo} alt="Logo lembaga" className="w-28 h-28 object-contain mb-8" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
          <h2 className="text-3xl font-bold tracking-wide">RAPOR PESERTA DIDIK</h2>
          <p className="mt-2 text-xl font-bold uppercase">{settings.jenjang || 'Satuan Pendidikan'}</p>
          <p className="mt-4 bg-black text-white px-5 py-2 font-bold">{jenisLabel}</p>
          <div className="mt-20 border border-black rounded-lg p-8 w-full max-w-lg text-left">
            <p className="text-sm">Nama Peserta Didik</p><p className="text-xl font-bold mt-1">{siswa?.nama || '—'}</p>
            <p className="text-sm mt-5">NIS / NISN</p><p className="font-semibold">{[siswa?.nis, siswa?.nisn].filter(Boolean).join(' / ') || '—'}</p>
          </div>
          <h3 className="mt-20 text-2xl font-bold uppercase">{settings.nama_lembaga || 'Nama Lembaga'}</h3>
          <p className="mt-3 font-semibold">Tahun Ajaran {tahunAjaran} · Semester <span className="capitalize">{semester}</span></p>
        </section>}

        {tampilIdentitas && <section className="report-page bg-white rounded-xl shadow-sm border p-6 sm:p-10 print:p-0">
          <ReportHeader settings={settings} title="BIODATA PESERTA DIDIK" compact />
          <h3 className="text-center font-bold text-lg mt-6 mb-4">IDENTITAS PESERTA DIDIK</h3>
          <div className="grid grid-cols-[1fr_110px] gap-6 items-start">
            <table className="w-full text-xs"><tbody>{identityRows.map(([label, value], index) => <tr key={label} className="align-top"><td className="py-1 w-6">{index + 1}.</td><td className="py-1 w-44 font-medium">{label}</td><td className="py-1 w-4">:</td><td className="py-1 border-b border-dotted border-gray-300">{value || '—'}</td></tr>)}</tbody></table>
            <div className="border border-black w-[95px] h-[125px] flex items-center justify-center overflow-hidden text-[10px] text-center">
              {siswa?.foto ? <img src={thumbUrl(siswa.foto, 300)} alt={`Foto ${siswa.nama}`} className="w-full h-full object-cover" /> : <span>PAS FOTO<br />3 × 4</span>}
            </div>
          </div>
          <div className="mt-6 ml-auto w-64 text-center text-xs break-inside-avoid">
            <p>{tanggalCetak}</p><p>Kepala Sekolah</p>
            <QRCodeSVG value={verificationText} size={70} className="mx-auto my-2" />
            <p className="font-bold underline">{settings.kepala_sekolah || '( .................................... )'}</p>
          </div>
        </section>}

        {tampilNilai && <section className="report-page bg-white rounded-xl shadow-sm border p-6 sm:p-8 print:p-0">
          <ReportHeader settings={settings} title={`HASIL BELAJAR ${jenisLabel}`} compact />
          <div className="grid grid-cols-2 text-sm gap-x-8 gap-y-1 my-4"><p>Nama: <strong>{siswa?.nama}</strong></p><p>Kelas: <strong>{siswa?.rombel_nama || rombel?.nama}</strong></p><p>NIS/NISN: <strong>{[siswa?.nis, siswa?.nisn].filter(Boolean).join(' / ')}</strong></p><p>Semester: <strong className="capitalize">{semester}</strong></p></div>
          <table className="w-full text-xs border-collapse"><thead><tr className="bg-gray-100"><Th>No</Th><Th align="left">Mata Pelajaran</Th><Th>Harian</Th><Th>STS</Th>{jenis === 'rapor_sas' && <Th>SAS</Th>}<Th>Akhir</Th><Th>Predikat</Th><Th align="left">Deskripsi</Th></tr></thead><tbody>{rapor.map((r, i) => <tr key={r.id}><Td>{i + 1}</Td><Td align="left" bold>{r.mapel_nama}</Td><Td>{r.nilai_harian ?? 0}</Td><Td>{r.nilai_sts ?? 0}</Td>{jenis === 'rapor_sas' && <Td>{r.nilai_sas ?? 0}</Td>}<Td bold>{r.nilai_akhir}</Td><Td bold>{r.predikat}</Td><Td align="left">{r.deskripsi || descriptionFor(r)}</Td></tr>)}</tbody><tfoot><tr className="bg-gray-50"><Td colSpan={jenis === 'rapor_sas' ? 5 : 4} align="right" bold>Rata-rata</Td><Td bold>{rataAkhir}</Td><Td colSpan={2} /></tr></tfoot></table>
          <p className="text-[10px] text-gray-500 mt-2">{formulaLabel}</p>

          <div className="grid md:grid-cols-2 gap-4 mt-5 text-xs">
            <ReportBox title="Sikap dan Kepribadian"><Info label="Spiritual" value={personality.sikap_spiritual || personality.sikap_umum} /><Info label="Sosial" value={personality.sikap_sosial || personality.sikap_umum} /><Info label="Kelakuan" value={personality.kelakuan} /><Info label="Kedisiplinan" value={personality.kedisiplinan} /></ReportBox>
            <ReportBox title="Kehadiran"><Info label="Hadir" value={`${attendance.hadir || 0} hari`} /><Info label="Sakit" value={`${attendance.sakit || 0} hari`} /><Info label="Izin" value={`${attendance.izin || 0} hari`} /><Info label="Tanpa Keterangan" value={`${attendance.alpa || 0} hari`} /></ReportBox>
            <ReportBox title="Ekstrakurikuler"><TableList empty="Belum ada data ekstrakurikuler" rows={(ringkasan?.ekstrakurikuler || []).map((e: any) => [e.nama, e.nilai == null ? '—' : `${e.nilai} / ${e.nilai >= 86 ? 'A' : e.nilai >= 76 ? 'B' : e.nilai >= 66 ? 'C' : 'D'}`])} /></ReportBox>
          </div>

          <div className="mt-4 text-xs space-y-3">
            <ReportBox title="Prestasi"><TableList empty="Belum ada prestasi yang dicatat" rows={prestasi.map((p: any) => [p.jenis, p.keterangan])} /></ReportBox>
            <ReportBox title="Catatan Wali Kelas"><p className="whitespace-pre-wrap">{pelengkap.catatan_wali_kelas || personality.catatan_wali_kelas || personality.saran || 'Tetap semangat belajar dan tingkatkan prestasi.'}</p></ReportBox>
            {pelengkap.keputusan && <ReportBox title="Keputusan"><p className="font-semibold">{pelengkap.keputusan}</p></ReportBox>}
            <ReportBox title="Tanggapan Orang Tua/Wali"><p className="min-h-8 whitespace-pre-wrap">{pelengkap.tanggapan_orang_tua || ''}</p></ReportBox>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center text-xs mt-8 break-inside-avoid">
            <Signature title="Orang Tua/Wali" name="_____________________" />
            <Signature title="Wali Kelas" name={siswa?.wali_kelas_nama || '_____________________'} subtitle={siswa?.wali_kelas_nip ? `NIP. ${siswa.wali_kelas_nip}` : undefined} />
            <Signature title={tanggalCetak} name={settings.kepala_sekolah || '_____________________'} subtitle={settings.kepala_sekolah ? `Kepala ${settings.nama_lembaga || 'Lembaga'}` : undefined} />
          </div>
        </section>}
      </div>}
    </div>
  )
}

function descriptionFor(row: any) {
  const score = Number(row.nilai_akhir) || 0
  if (score >= 90) return `Sangat menguasai kompetensi ${row.mapel_nama || ''}.`
  if (score >= 80) return `Menguasai kompetensi ${row.mapel_nama || ''} dengan baik.`
  if (score >= 70) return `Cukup menguasai kompetensi dan perlu penguatan pada beberapa materi.`
  return `Perlu bimbingan dan latihan lanjutan untuk meningkatkan penguasaan kompetensi.`
}
function k13Predikat(nilai: number) {
  const n = Number(nilai) || 0
  if (n >= 90) return 'A'
  if (n >= 80) return 'B'
  if (n >= 70) return 'C'
  if (n >= 60) return 'D'
  return 'E'
}
function Field({ label, children }: any) { return <div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>{children}</div> }
// Bobot disimpan sebagai pecahan 0..1; ditampilkan sebagai persen agar mudah diisi.
function pct(value: any) { return `${Math.round((Number(value) || 0) * 100)}%` }
// API mengembalikan bobot bersarang {sts:{harian,sts,sas}}; server menerima flat.
function flattenBobot(bobot: any) {
  const out: any = {}
  for (const jenis of ['sts', 'sas']) for (const key of ['harian', 'sts', 'sas']) out[`${jenis}_${key}`] = Number(bobot?.[jenis]?.[key]) || 0
  return out
}
function BobotGroup({ title, jenis, bobot, defaults, onChange }: any) {
  const fields: Array<[string, string]> = [['harian', 'Nilai Harian'], ['sts', 'STS'], ['sas', 'SAS']]
  const jumlah = fields.reduce((sum, [key]) => sum + (Number(bobot?.[key]) || 0), 0)
  const sah = Math.abs(jumlah - 1) <= 0.01
  const ubah = (key: string, raw: string) => onChange({ ...bobot, [key]: raw === '' ? 0 : Number(raw) / 100 })
  const pakaiBawaan = () => onChange(defaults ? { ...defaults } : bobot)
  return (
    <div className="border border-gray-300 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
        {defaults && <button type="button" onClick={pakaiBawaan} className="text-xs text-primary-600">Pakai bawaan ({pct(defaults.harian)}/{pct(defaults.sts)}/{pct(defaults.sas)})</button>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {fields.map(([key, label]) => <Field key={`${jenis}-${key}`} label={`${label} (%)`}>
          <input type="number" min={0} max={100} step={5} value={Math.round((Number(bobot?.[key]) || 0) * 100)}
            onChange={e => ubah(key, e.target.value)} className="input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
        </Field>)}
      </div>
      <p className={`text-xs ${sah ? 'text-gray-500' : 'text-red-600'}`}>
        {sah ? `Total ${pct(jumlah)} — nilai akhir = ${fields.filter(([k]) => (Number(bobot?.[k]) || 0) > 0).map(([k, l]) => `${pct(bobot?.[k])} ${l}`).join(' + ')}` : `Total ${pct(jumlah)} — harus berjumlah 100%`}
      </p>
    </div>
  )
}
function TextArea({ label, value, onChange }: any) { return <Field label={label}><textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={3} className="input resize-y" /></Field> }
function Select({ label, value, onChange, options, placeholder, disabled }: any) { return <Field label={label}><select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className="input"><option value="">{placeholder || `Pilih ${label}`}</option>{options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field> }
function ReportHeader({ settings, title, compact = false }: any) { return <div className={`flex items-center gap-4 border-b-2 border-black ${compact ? 'pb-3' : 'pb-5'}`}>{settings.logo && <img src={settings.logo} alt="Logo" className={compact ? 'w-14 h-14 object-contain' : 'w-20 h-20 object-contain'} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}<div className="flex-1 text-center"><p className="text-[10px] tracking-wide">{title}</p><h2 className={`${compact ? 'text-lg' : 'text-2xl'} font-bold`}>{settings.nama_lembaga || 'Nama Lembaga'}</h2><p className="text-xs">{[settings.alamat, settings.telepon && `Telp. ${settings.telepon}`, settings.email].filter(Boolean).join(' · ')}</p><p className="text-xs">{[settings.npsn && `NPSN: ${settings.npsn}`, settings.nsm && `NSM: ${settings.nsm}`].filter(Boolean).join(' · ')}</p></div>{settings.logo && <div className={compact ? 'w-14' : 'w-20'} />}</div> }
function Th({ children, align = 'center' }: any) { return <th className={`border border-gray-400 px-2 py-2 text-${align}`}>{children}</th> }
function Td({ children, align = 'center', bold = false, colSpan }: any) { return <td colSpan={colSpan} className={`border border-gray-400 px-2 py-1.5 text-${align} ${bold ? 'font-semibold' : ''}`}>{children}</td> }
function ReportBox({ title, children }: any) { return <div className="border border-gray-400 p-3 break-inside-avoid"><h4 className="font-bold mb-2">{title}</h4>{children}</div> }
function Info({ label, value }: any) { return <div className="grid grid-cols-[130px_10px_1fr] gap-1 py-0.5"><span>{label}</span><span>:</span><span>{value || '—'}</span></div> }
function TableList({ rows, empty }: any) { return rows.length ? <div className="space-y-1">{rows.map((r: any, i: number) => <div key={i} className="grid grid-cols-[1fr_1.5fr] gap-2 border-b border-gray-200 pb-1"><span>{r[0]}</span><span>{r[1]}</span></div>)}</div> : <p>{empty}</p> }
function Signature({ title, name, subtitle }: any) { return <div><p>{title}</p><div className="h-16" /><p className="font-semibold underline">{name}</p>{subtitle && <p>{subtitle}</p>}</div> }
