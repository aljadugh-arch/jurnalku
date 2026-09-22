import { useEffect, useMemo, useState } from 'react'
import api from '../../services/api'
import { Download, FileText, Printer, Save, Zap } from 'lucide-react'
import FoundationTenantPicker from '../../components/FoundationTenantPicker'
import { QRCodeSVG } from 'qrcode.react'
import { thumbUrl } from '../../lib/thumbUrl'

const emptyPelengkap = {
  tinggi_badan: '', berat_badan: '', kondisi_kesehatan: '', prestasi: [] as Array<{ jenis: string; keterangan: string }>,
  catatan_wali_kelas: '', tanggapan_orang_tua: '', keputusan: '', tanggal_pembagian: '',
}

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
  const exportPdf = async () => {
    if (!selectedSiswa || rapor.length === 0) { setMsg('✗ Tidak ada data untuk diekspor'); return }
    if (foundationTenantId) return setMsg('✗ Export PDF hanya untuk data lembaga sendiri')
    try {
      const response = await api.get('/rapor/export/pdf', {
        params: { siswa_id: selectedSiswa, tahun_ajaran: tahunAjaran, semester, jenis },
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `Rapor-${siswa?.nama || selectedSiswa}-${tahunAjaran}-${semester}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.parentNode?.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (e: any) {
      setMsg(`✗ ${e.response?.data?.error || 'Gagal download PDF'}`)
    }
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

  return (
    <div className="space-y-6">
      <style>{`@media print { @page { size: A4 portrait; margin: 0; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } #rapor-print { margin: 0 !important; } .report-page { box-sizing: border-box; width: 210mm; height: 297mm; min-height: 297mm; margin: 0 !important; padding: 14mm !important; overflow: hidden; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; break-after: page; page-break-after: always; } .report-page:last-child { break-after: auto; page-break-after: auto; } }`}</style>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div><h1 className="text-2xl font-display font-bold text-gray-800">Rapor Siswa</h1><p className="text-sm text-gray-500 mt-1">Rapor akademik dan perkembangan peserta didik</p></div>
        <div className="flex gap-2">
          {selectedSiswa && !foundationTenantId && <button onClick={savePelengkap} disabled={saving} className="btn-secondary flex items-center gap-2"><Save className="w-4 h-4" />{saving ? 'Menyimpan...' : 'Simpan Pelengkap'}</button>}
          {selectedSiswa && rapor.length > 0 && !foundationTenantId && <button onClick={exportPdf} className="btn-secondary flex items-center gap-2"><Download className="w-4 h-4" />Download PDF (Siap Cetak)</button>}
          {selectedSiswa && rapor.length > 0 && <button onClick={() => window.print()} className="btn-primary flex items-center gap-2"><Printer className="w-4 h-4" />Cetak / PDF</button>}
        </div>
      </div>

      <div className="print:hidden"><FoundationTenantPicker selectedTenantId={foundationTenantId} onSelectTenant={setFoundationTenantId} /></div>
      <div className="card p-5 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
          <Select label="Kelas" value={selectedRombel} onChange={setSelectedRombel} options={rombelList.map(r => ({ value: r.id, label: r.nama }))} placeholder="Pilih Kelas" />
          <Select label="Siswa" value={selectedSiswa} onChange={setSelectedSiswa} options={siswaList.map(s => ({ value: s.id, label: s.nama }))} placeholder="Pilih Siswa" disabled={!selectedRombel} />
          <Field label="Tahun Ajaran"><input value={tahunAjaran} onChange={e => setTahunAjaran(e.target.value)} className="input" /></Field>
          <Select label="Semester" value={semester} onChange={setSemester} options={[{ value: 'ganjil', label: 'Ganjil' }, { value: 'genap', label: 'Genap' }]} />
          <Field label="Jenis Rapor"><select value={jenis} onChange={e => setJenis(e.target.value as any)} className="input"><option value="rapor_sts">Rapor STS (Tengah Semester)</option><option value="rapor_sas">Rapor SAS (Akhir Semester)</option></select></Field>
          <div className="flex items-end"><button onClick={handleGenerate} disabled={loading || !selectedRombel || !!foundationTenantId} className="btn-primary w-full flex justify-center items-center gap-2"><Zap className="w-4 h-4" />{loading ? 'Memproses...' : 'Generate'}</button></div>
        </div>
        {msg && <p className={`mt-3 text-sm ${msg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{msg}</p>}
      </div>

      {selectedSiswa && !foundationTenantId && (
        <div className="card p-5 print:hidden space-y-4">
          <h2 className="font-semibold text-gray-800">Data Pelengkap Rapor</h2>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Field label="Tinggi Badan (cm)"><input type="number" value={pelengkap.tinggi_badan ?? ''} onChange={e => setPelengkap({ ...pelengkap, tinggi_badan: e.target.value })} className="input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></Field>
            <Field label="Berat Badan (kg)"><input type="number" value={pelengkap.berat_badan ?? ''} onChange={e => setPelengkap({ ...pelengkap, berat_badan: e.target.value })} className="input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" /></Field>
            <Field label="Tanggal Pembagian"><input type="date" value={pelengkap.tanggal_pembagian || ''} onChange={e => setPelengkap({ ...pelengkap, tanggal_pembagian: e.target.value })} className="input" /></Field>
            <Field label="Keputusan"><input value={pelengkap.keputusan || ''} onChange={e => setPelengkap({ ...pelengkap, keputusan: e.target.value })} placeholder="Naik ke kelas... / Lulus" className="input" /></Field>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <TextArea label="Kondisi Kesehatan" value={pelengkap.kondisi_kesehatan} onChange={(v: string) => setPelengkap({ ...pelengkap, kondisi_kesehatan: v })} />
            <TextArea label="Catatan Wali Kelas" value={pelengkap.catatan_wali_kelas} onChange={(v: string) => setPelengkap({ ...pelengkap, catatan_wali_kelas: v })} />
            <TextArea label="Tanggapan Orang Tua/Wali" value={pelengkap.tanggapan_orang_tua} onChange={(v: string) => setPelengkap({ ...pelengkap, tanggapan_orang_tua: v })} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2"><label className="text-sm font-medium text-gray-700">Prestasi</label><button type="button" onClick={() => setPelengkap({ ...pelengkap, prestasi: [...prestasi, { jenis: '', keterangan: '' }] })} className="text-sm text-primary-600">+ Tambah Prestasi</button></div>
            <div className="space-y-2">{prestasi.map((p: any, i: number) => <div key={i} className="grid sm:grid-cols-[180px_1fr_auto] gap-2"><input value={p.jenis} onChange={e => { const next = [...prestasi]; next[i] = { ...p, jenis: e.target.value }; setPelengkap({ ...pelengkap, prestasi: next }) }} placeholder="Akademik/Nonakademik" className="input" /><input value={p.keterangan} onChange={e => { const next = [...prestasi]; next[i] = { ...p, keterangan: e.target.value }; setPelengkap({ ...pelengkap, prestasi: next }) }} placeholder="Nama dan tingkat prestasi" className="input" /><button onClick={() => setPelengkap({ ...pelengkap, prestasi: prestasi.filter((_: any, x: number) => x !== i) })} className="px-3 text-red-600">Hapus</button></div>)}</div>
          </div>
        </div>
      )}

      {!selectedSiswa && <div className="card py-16 text-center print:hidden"><FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">Pilih kelas dan siswa untuk melihat rapor.</p></div>}
      {selectedSiswa && !loading && rapor.length === 0 && <div className="card py-12 text-center print:hidden"><p className="text-gray-500">Nilai rapor belum tersedia. Klik Generate setelah nilai harian dan asesmen diisi.</p></div>}

      {selectedSiswa && rapor.length > 0 && <div id="rapor-print" className="space-y-6 print:space-y-0">
        <section className="report-page relative bg-white rounded-xl shadow-sm border-2 border-black p-6 sm:p-12 text-center flex flex-col items-center justify-center print:p-0">
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
        </section>

        <section className="report-page bg-white rounded-xl shadow-sm border p-6 sm:p-10 print:p-0">
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
        </section>

        <section className="report-page bg-white rounded-xl shadow-sm border p-6 sm:p-8 print:p-0">
          <ReportHeader settings={settings} title={`HASIL BELAJAR ${jenisLabel}`} compact />
          <div className="grid grid-cols-2 text-sm gap-x-8 gap-y-1 my-4"><p>Nama: <strong>{siswa?.nama}</strong></p><p>Kelas: <strong>{siswa?.rombel_nama || rombel?.nama}</strong></p><p>NIS/NISN: <strong>{[siswa?.nis, siswa?.nisn].filter(Boolean).join(' / ')}</strong></p><p>Semester: <strong className="capitalize">{semester}</strong></p></div>
          <table className="w-full text-xs border-collapse"><thead><tr className="bg-gray-100"><Th>No</Th><Th align="left">Mata Pelajaran</Th><Th>Harian</Th><Th>STS</Th>{jenis === 'rapor_sas' && <Th>SAS</Th>}<Th>Akhir</Th><Th>Predikat</Th><Th align="left">Deskripsi</Th></tr></thead><tbody>{rapor.map((r, i) => <tr key={r.id}><Td>{i + 1}</Td><Td align="left" bold>{r.mapel_nama}</Td><Td>{r.nilai_harian ?? 0}</Td><Td>{r.nilai_sts ?? 0}</Td>{jenis === 'rapor_sas' && <Td>{r.nilai_sas ?? 0}</Td>}<Td bold>{r.nilai_akhir}</Td><Td bold>{r.predikat}</Td><Td align="left">{r.deskripsi || descriptionFor(r)}</Td></tr>)}</tbody><tfoot><tr className="bg-gray-50"><Td colSpan={jenis === 'rapor_sas' ? 5 : 4} align="right" bold>Rata-rata</Td><Td bold>{rataAkhir}</Td><Td colSpan={2} /></tr></tfoot></table>
          <p className="text-[10px] text-gray-500 mt-2">{formulaLabel}</p>

          <div className="grid md:grid-cols-2 gap-4 mt-5 text-xs">
            <ReportBox title="Sikap dan Kepribadian"><Info label="Spiritual" value={personality.sikap_spiritual || personality.sikap_umum} /><Info label="Sosial" value={personality.sikap_sosial || personality.sikap_umum} /><Info label="Kelakuan" value={personality.kelakuan} /><Info label="Kedisiplinan" value={personality.kedisiplinan} /></ReportBox>
            <ReportBox title="Kehadiran"><Info label="Hadir" value={`${attendance.hadir || 0} hari`} /><Info label="Sakit" value={`${attendance.sakit || 0} hari`} /><Info label="Izin" value={`${attendance.izin || 0} hari`} /><Info label="Tanpa Keterangan" value={`${attendance.alpa || 0} hari`} /></ReportBox>
            <ReportBox title="Ekstrakurikuler"><TableList empty="Belum ada data ekstrakurikuler" rows={(ringkasan?.ekstrakurikuler || []).map((e: any) => [e.nama, e.nilai == null ? '—' : `${e.nilai} / ${e.nilai >= 86 ? 'A' : e.nilai >= 76 ? 'B' : e.nilai >= 66 ? 'C' : 'D'}`])} /></ReportBox>
            <ReportBox title="Pertumbuhan dan Kesehatan"><Info label="Tinggi Badan" value={pelengkap.tinggi_badan ? `${pelengkap.tinggi_badan} cm` : '—'} /><Info label="Berat Badan" value={pelengkap.berat_badan ? `${pelengkap.berat_badan} kg` : '—'} /><p className="mt-2 whitespace-pre-wrap">{pelengkap.kondisi_kesehatan || 'Tidak ada catatan kesehatan.'}</p></ReportBox>
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
        </section>
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
function Field({ label, children }: any) { return <div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>{children}</div> }
function TextArea({ label, value, onChange }: any) { return <Field label={label}><textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={3} className="input resize-y" /></Field> }
function Select({ label, value, onChange, options, placeholder, disabled }: any) { return <Field label={label}><select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className="input"><option value="">{placeholder || `Pilih ${label}`}</option>{options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field> }
function ReportHeader({ settings, title, compact = false }: any) { return <div className={`flex items-center gap-4 border-b-2 border-black ${compact ? 'pb-3' : 'pb-5'}`}>{settings.logo && <img src={settings.logo} alt="Logo" className={compact ? 'w-14 h-14 object-contain' : 'w-20 h-20 object-contain'} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}<div className="flex-1 text-center"><p className="text-[10px] tracking-wide">{title}</p><h2 className={`${compact ? 'text-lg' : 'text-2xl'} font-bold`}>{settings.nama_lembaga || 'Nama Lembaga'}</h2><p className="text-xs">{[settings.alamat, settings.telepon && `Telp. ${settings.telepon}`, settings.email].filter(Boolean).join(' · ')}</p><p className="text-xs">{[settings.npsn && `NPSN: ${settings.npsn}`, settings.nsm && `NSM: ${settings.nsm}`].filter(Boolean).join(' · ')}</p></div>{settings.logo && <div className={compact ? 'w-14' : 'w-20'} />}</div> }
function Th({ children, align = 'center' }: any) { return <th className={`border border-gray-400 px-2 py-2 text-${align}`}>{children}</th> }
function Td({ children, align = 'center', bold = false, colSpan }: any) { return <td colSpan={colSpan} className={`border border-gray-400 px-2 py-1.5 text-${align} ${bold ? 'font-semibold' : ''}`}>{children}</td> }
function ReportBox({ title, children }: any) { return <div className="border border-gray-400 p-3 break-inside-avoid"><h4 className="font-bold mb-2">{title}</h4>{children}</div> }
function Info({ label, value }: any) { return <div className="grid grid-cols-[130px_10px_1fr] gap-1 py-0.5"><span>{label}</span><span>:</span><span>{value || '—'}</span></div> }
function TableList({ rows, empty }: any) { return rows.length ? <div className="space-y-1">{rows.map((r: any, i: number) => <div key={i} className="grid grid-cols-[1fr_1.5fr] gap-2 border-b border-gray-200 pb-1"><span>{r[0]}</span><span>{r[1]}</span></div>)}</div> : <p>{empty}</p> }
function Signature({ title, name, subtitle }: any) { return <div><p>{title}</p><div className="h-16" /><p className="font-semibold underline">{name}</p>{subtitle && <p>{subtitle}</p>}</div> }
