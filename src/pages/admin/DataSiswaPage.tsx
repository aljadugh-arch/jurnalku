import { useState, useEffect } from 'react'
import { Search, Plus, Edit, Trash2, Download, Upload, X, Camera, ChevronRight, UsersRound, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import ImportExcel from '../../components/ImportExcel'
import FoundationTenantPicker from '../../components/FoundationTenantPicker'
import Modal from '../../components/ui/Modal'
import { thumbUrl } from '../../lib/thumbUrl'

interface Siswa {
  id: string
  nik: string
  nis: string
  nisn: string
  nama: string
  nama_panggilan?: string
  jenis_kelamin: string
  tempat_lahir: string
  tanggal_lahir: string
  alamat: string
  no_hp: string
  nama_ortu: string
  rombel_id: string
  rombel_nama?: string
  status: string
  foto?: string
  agama?: string
  status_keluarga?: string
  anak_ke?: string
  asal_sekolah?: string
  nama_ayah?: string
  nama_ibu?: string
  alamat_ortu?: string
  kerja_ayah?: string
  kerja_ibu?: string
  nama_wali?: string
  kerja_wali?: string
}

const emptyForm: Omit<Siswa, 'id'> = {
  nik: '', nis: '', nisn: '', nama: '', nama_panggilan: '', jenis_kelamin: 'L', tempat_lahir: '',
  tanggal_lahir: '', alamat: '', no_hp: '', nama_ortu: '', rombel_id: '',
  rombel_nama: '', status: 'aktif',
  agama: 'Islam', status_keluarga: 'Anak Kandung', anak_ke: '', asal_sekolah: '',
  nama_ayah: '', nama_ibu: '', alamat_ortu: '', kerja_ayah: '', kerja_ibu: '', nama_wali: '', kerja_wali: '',
}

function getInitials(nama: string): string {
  return nama
    .split(' ')
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
}

function SiswaPhoto({ foto, nama, size = 'w-12 h-12' }: { foto?: string; nama: string; size?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [foto])
  if (foto && !failed) return <img src={thumbUrl(foto, 96)} alt={nama} loading="lazy" onError={() => setFailed(true)} className={`${size} rounded-full object-cover border border-gray-200`} />
  return <div className={`${size} rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm`}>{getInitials(nama)}</div>
}

export default function DataSiswaPage() {
  const [data, setData] = useState<Siswa[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<Siswa, 'id'>>(emptyForm)
  const [rombels, setRombels] = useState<{ id: string; nama: string }[]>([])
  const [showImport, setShowImport] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [foundationTenantId, setFoundationTenantId] = useState<string | null>(null)
  const [selectedRombelId, setSelectedRombelId] = useState('')
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [bulkDeleteScope, setBulkDeleteScope] = useState<'rombel' | 'all'>('rombel')
  const [bulkDeleteCount, setBulkDeleteCount] = useState(0)
  const [bulkDeleteConfirmation, setBulkDeleteConfirmation] = useState('')
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [syncingAccounts, setSyncingAccounts] = useState(false)
  const [generatingKTS, setGeneratingKTS] = useState(false)
  const [selectedForKTS, setSelectedForKTS] = useState<Set<string>>(new Set())
  const isLocalTenant = !foundationTenantId

  // Detail panel
  const [selectedSiswa, setSelectedSiswa] = useState<Siswa | null>(null)

  const fetchData = async () => {
    try {
      const params: any = { search }
      if (selectedRombelId) params.rombel_id = selectedRombelId
      if (foundationTenantId && foundationTenantId !== 'all') {
        params.tenant_id = foundationTenantId
      }
      const rombelParams = foundationTenantId && foundationTenantId !== 'all' ? { tenant_id: foundationTenantId } : {}
      const [res, rombelRes] = await Promise.all([
        api.get(foundationTenantId ? '/foundation/students' : '/siswa', { params }),
        api.get(foundationTenantId ? '/foundation/rombels' : '/rombel', { params: rombelParams })
      ])
      setData(res.data)
      setRombels(rombelRes.data)
    } catch {
      toast.error('Gagal memuat data siswa')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [search, foundationTenantId, selectedRombelId])

  // Sync selected panel when data refreshes
  useEffect(() => {
    if (selectedSiswa) {
      const updated = data.find((s) => s.id === selectedSiswa.id)
      if (updated) setSelectedSiswa(updated)
    }
  }, [data])

  const handleSave = async () => {
    if (!form.nis || !form.nama || !form.jenis_kelamin) {
      toast.error('NIS, Nama, dan Jenis Kelamin wajib diisi')
      return
    }
    try {
      if (editId) {
        await api.put('/siswa/' + editId, form)
        toast.success('Data siswa berhasil diupdate')
      } else {
        await api.post('/siswa', form)
        toast.success('Siswa berhasil ditambahkan')
      }
      setShowModal(false)
      setEditId(null)
      setForm(emptyForm)
      fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan')
    }
  }

  const handleEdit = (siswa: Siswa) => {
    setForm({
      nik: siswa.nik || '',
      nis: siswa.nis, nisn: siswa.nisn, nama: siswa.nama, nama_panggilan: siswa.nama_panggilan || '',
      jenis_kelamin: siswa.jenis_kelamin, tempat_lahir: siswa.tempat_lahir,
      tanggal_lahir: siswa.tanggal_lahir, alamat: siswa.alamat,
      no_hp: siswa.no_hp, nama_ortu: siswa.nama_ortu,
      rombel_id: siswa.rombel_id || '', rombel_nama: siswa.rombel_nama || '',
      status: siswa.status,
      agama: siswa.agama || 'Islam', status_keluarga: siswa.status_keluarga || 'Anak Kandung',
      anak_ke: siswa.anak_ke || '', asal_sekolah: siswa.asal_sekolah || '',
      nama_ayah: siswa.nama_ayah || '', nama_ibu: siswa.nama_ibu || '', alamat_ortu: siswa.alamat_ortu || '',
      kerja_ayah: siswa.kerja_ayah || '', kerja_ibu: siswa.kerja_ibu || '',
      nama_wali: siswa.nama_wali || '', kerja_wali: siswa.kerja_wali || '',
    })
    setEditId(siswa.id)
    setShowModal(true)
  }

  const handleFoto = async (id: string, file?: File) => {
    if (!file) return
    const fd = new FormData()
    fd.append('foto', file)
    setUploadingFoto(true)
    try {
      await api.post('/siswa/' + id + '/foto', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Foto siswa berhasil diupload')
      fetchData()
    } catch { toast.error('Gagal upload foto') }
    finally { setUploadingFoto(false) }
  }

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm('Hapus siswa ' + nama + '?')) return
    try {
      await api.delete('/siswa/' + id)
      toast.success('Siswa berhasil dihapus')
      if (selectedSiswa?.id === id) setSelectedSiswa(null)
      fetchData()
    } catch (err: any) {
      if (err.response?.data?.code === 'SISWA_HAS_HISTORY' && confirm(`${err.response.data.error}\n\nLanjutkan hapus permanen?`)) {
        try {
          await api.delete('/siswa/' + id, { params: { force: 1 } })
          toast.success('Siswa dan seluruh data terkait berhasil dihapus')
          if (selectedSiswa?.id === id) setSelectedSiswa(null)
          fetchData()
          return
        } catch (forceErr: any) {
          toast.error(forceErr.response?.data?.error || 'Gagal menghapus permanen')
          return
        }
      }
      toast.error(err.response?.data?.error || 'Gagal menghapus')
    }
  }

  const openBulkDelete = async (scope: 'rombel' | 'all') => {
    if (scope === 'rombel' && !selectedRombelId) {
      toast.error('Pilih rombel/kelas yang akan dihapus')
      return
    }
    try {
      const params = scope === 'rombel' ? { rombel_id: selectedRombelId } : {}
      const response = await api.get('/siswa/bulk-delete/count', { params })
      setBulkDeleteScope(scope)
      setBulkDeleteCount(response.data.total || 0)
      setBulkDeleteConfirmation('')
      setShowBulkDelete(true)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menghitung data yang akan dihapus')
    }
  }

  const handleBulkDelete = async () => {
    const expected = bulkDeleteScope === 'rombel' ? 'HAPUS SISWA ROMBEL' : 'HAPUS SEMUA SISWA'
    if (bulkDeleteConfirmation !== expected) return
    setBulkDeleting(true)
    try {
      const body: Record<string, string> = { confirmation: expected }
      if (bulkDeleteScope === 'rombel') body.rombel_id = selectedRombelId
      const response = await api.post('/siswa/bulk-delete', body)
      toast.success(`${response.data.deleted || 0} siswa berhasil dihapus`)
      setShowBulkDelete(false)
      setSelectedSiswa(null)
      await fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menghapus data siswa')
    } finally {
      setBulkDeleting(false)
    }
  }

  const handleSyncStudentAccounts = async () => {
    if (!window.confirm('Buat akun yang belum tersedia dan reset password seluruh siswa aktif menjadi NISN masing-masing, atau NIS jika NISN belum tersedia?')) return
    setSyncingAccounts(true)
    try {
      const { data: result } = await api.post('/siswa/generate-akun', { reset_password: true })
      const failed = Array.isArray(result.gagal) ? result.gagal.length : 0
      toast.success(`${result.dibuat} akun dibuat, ${result.sinkron} akun direset ke NISN/NIS${failed ? `, ${failed} gagal` : ''}`)
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Gagal menyinkronkan akun siswa')
    } finally {
      setSyncingAccounts(false)
    }
  }

  const handleExport = () => {
    const header = 'NIK,NIS,NISN,Nama,Nama Panggilan,JK,Tempat Lahir,Tgl Lahir,Alamat,No HP,Nama Ortu,Status'
    const rows = data.map((s) =>
      [s.nik || '', s.nis, s.nisn, s.nama, s.nama_panggilan || '', s.jenis_kelamin, s.tempat_lahir, s.tanggal_lahir, s.alamat, s.no_hp, s.nama_ortu, s.status].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'data_siswa.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success('Export berhasil')
  }

  const handleGenerateKTS = async () => {
    const selected = Array.from(selectedForKTS)
    if (selected.length === 0) {
      toast.error('Pilih minimal satu siswa untuk generate KTS')
      return
    }
    setGeneratingKTS(true)
    try {
      const response = await api.post('/siswa/generate-kts', { siswa_ids: selected })
      toast.success(`KTS siap untuk ${response.data.count} siswa`)
      setSelectedForKTS(new Set())
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Generate KTS gagal')
    } finally {
      setGeneratingKTS(false)
    }
  }

  const statusBadge = (status: string) => {
    if (status === 'aktif') return 'bg-green-100 text-green-700'
    if (status === 'lulus') return 'bg-blue-100 text-blue-700'
    return 'bg-red-100 text-red-700'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Data Siswa</h1>
          <p className="text-gray-500 text-sm mt-1">Kelola data peserta didik ({data.length} siswa)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isLocalTenant && <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            <Upload size={16} /> Import Excel
          </button>}
          {isLocalTenant && <button disabled={syncingAccounts} onClick={handleSyncStudentAccounts} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 disabled:opacity-60">
            <KeyRound size={16} /> {syncingAccounts ? 'Memproses...' : 'Reset Password ke NISN/NIS'}
          </button>}
          {isLocalTenant && <button disabled={generatingKTS || selectedForKTS.size === 0} onClick={handleGenerateKTS} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-60">
            <Download size={16} /> {generatingKTS ? 'Memproses...' : `Generate KTS (${selectedForKTS.size})`}
          </button>}
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">
            <Download size={16} /> Export
          </button>
          {isLocalTenant && <button
            onClick={() => { setForm(emptyForm); setEditId(null); setShowModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark"
          >
            <Plus size={16} /> Tambah Siswa
          </button>}
        </div>
      </div>
      {/* Foundation Tenant Picker (Cross-tenant data) */}
      <FoundationTenantPicker
        selectedTenantId={foundationTenantId}
        onSelectTenant={(tenantId) => {
          setFoundationTenantId(tenantId)
          setSelectedRombelId('')
          setSelectedSiswa(null)
          setShowModal(false)
          setShowImport(false)
        }}
        placeholder="Data lokal (lembaga ini)"
        allOptionLabel="Semua lembaga yayasan (gabungan)"
      />

      {/* Search dan filter rombel aktual tenant */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Cari berdasarkan nama atau NIS..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select
            aria-label="Filter rombel atau kelas"
            value={selectedRombelId}
            onChange={(e) => { setSelectedRombelId(e.target.value); setSelectedSiswa(null) }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Semua rombel / kelas</option>
            {rombels.map((rombel) => <option key={rombel.id} value={rombel.id}>{rombel.nama}</option>)}
          </select>
        </div>
        {isLocalTenant && (
          <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => openBulkDelete('rombel')}
              disabled={!selectedRombelId}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <UsersRound size={16} /> Hapus Rombel
            </button>
            <button
              type="button"
              onClick={() => openBulkDelete('all')}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              <Trash2 size={16} /> Hapus Semua Siswa
            </button>
          </div>
        )}
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {loading ? (
          <p className="text-gray-400 col-span-4 text-center py-12">Memuat...</p>
        ) : data.length === 0 ? (
          <p className="text-gray-400 col-span-4 text-center py-12">Belum ada data siswa</p>
        ) : data.map((s) => {
          const isKTSSelected = selectedForKTS.has(s.id)
          return (
            <div
              key={s.id}
              onClick={() => setSelectedSiswa(s)}
              className={`relative bg-white rounded-xl p-4 shadow-sm border cursor-pointer transition-all hover:shadow-md hover:border-primary/40 ${selectedSiswa?.id === s.id ? 'border-primary ring-2 ring-primary/20' : 'border-gray-100'}`}
            >
              {/* KTS checkbox di top-right */}
              {isLocalTenant && (
                <div className="absolute top-2 right-2">
                  <input
                    type="checkbox"
                    checked={isKTSSelected}
                    onChange={(e) => {
                      e.stopPropagation()
                      const newSet = new Set(selectedForKTS)
                      if (isKTSSelected) newSet.delete(s.id)
                      else newSet.add(s.id)
                      setSelectedForKTS(newSet)
                    }}
                    className="w-4 h-4 cursor-pointer"
                    title="Pilih untuk Generate KTS"
                  />
                </div>
              )}
              {/* Avatar + nama */}
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <SiswaPhoto foto={s.foto} nama={s.nama} />
                {/* Upload foto overlay */}
                {isLocalTenant && <label
                  className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-white border border-gray-200 rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/10"
                  title="Upload foto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Camera size={11} className="text-primary" />
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingFoto}
                    onChange={(e) => handleFoto(s.id, e.target.files?.[0])}
                    className="hidden"
                  />
                </label>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-800 text-sm truncate">{s.nama}</p>
                <p className="text-xs text-gray-400 font-mono">{s.nis || '-'}</p>
              </div>
              <ChevronRight size={15} className="text-gray-300 flex-shrink-0" />
            </div>

            {/* Rombel + status */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
              <p className="text-xs text-gray-500 truncate">{s.rombel_nama || 'Belum ada rombel'}</p>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ml-2 ${statusBadge(s.status)}`}>
                {s.status}
              </span>
            </div>
          </div>
        )})}
      </div>

      {/* Detail popup */}
      {selectedSiswa && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <SiswaPhoto foto={selectedSiswa.foto} nama={selectedSiswa.nama} size="w-11 h-11" />
              <div>
                <h2 className="font-bold text-gray-800">{selectedSiswa.nama}</h2>
                <p className="text-xs text-gray-500">{selectedSiswa.nis || 'NIS belum diisi'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isLocalTenant && <>
                <button
                  onClick={() => handleEdit(selectedSiswa)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200"
                >
                  <Edit size={14} /> Edit
                </button>
                <button
                  onClick={() => handleDelete(selectedSiswa.id, selectedSiswa.nama)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg border border-red-200"
                >
                  <Trash2 size={14} /> Hapus
                </button>
              </>}
              <button
                onClick={() => setSelectedSiswa(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 ml-1"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Detail content */}
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
            <DetailRow label="NIK" value={selectedSiswa.nik || '-'} mono />
            <DetailRow label="NIS" value={selectedSiswa.nis || '-'} mono />
            <DetailRow label="NISN" value={selectedSiswa.nisn || '-'} mono />
            <DetailRow label="Nama Panggilan" value={selectedSiswa.nama_panggilan || '-'} />
            <DetailRow label="Jenis Kelamin" value={selectedSiswa.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'} />
            <DetailRow
              label="Tempat / Tgl Lahir"
              value={[selectedSiswa.tempat_lahir, selectedSiswa.tanggal_lahir].filter(Boolean).join(', ') || '-'}
            />
            <DetailRow label="Alamat" value={selectedSiswa.alamat || '-'} />
            <DetailRow label="No HP" value={selectedSiswa.no_hp || '-'} />
            <DetailRow label="Nama Orang Tua" value={selectedSiswa.nama_ortu || '-'} />
            <DetailRow label="Agama" value={selectedSiswa.agama || '-'} />
            <DetailRow label="Nama Ayah / Ibu" value={[selectedSiswa.nama_ayah, selectedSiswa.nama_ibu].filter(Boolean).join(' / ') || '-'} />
            <DetailRow label="Sekolah Asal" value={selectedSiswa.asal_sekolah || '-'} />
            <DetailRow label="Rombel" value={selectedSiswa.rombel_nama || 'Belum ada rombel'} />
            <div>
              <p className="text-xs text-gray-400 mb-1">Status</p>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge(selectedSiswa.status)}`}>
                {selectedSiswa.status}
              </span>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Modal Tambah/Edit — portal menjaga dialog aktif di atas popup detail */}
      {isLocalTenant && (
        <Modal
          open={showModal}
          onClose={() => setShowModal(false)}
          title={editId ? 'Edit Siswa' : 'Tambah Siswa'}
          maxWidth="md:max-w-2xl"
          footer={
            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Batal</button>
              <button onClick={handleSave} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">Simpan</button>
            </div>
          }
        >
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">NIK</label>
                  <input inputMode="numeric" maxLength={16} value={form.nik} onChange={(e) => setForm({...form, nik: e.target.value.replace(/\D/g, '')})} placeholder="16 digit" className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">NIS *</label>
                  <input value={form.nis} onChange={(e) => setForm({...form, nis: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">NISN</label>
                  <input value={form.nisn} onChange={(e) => setForm({...form, nisn: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nama Lengkap *</label>
                <input value={form.nama} onChange={(e) => setForm({...form, nama: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nama Panggilan <span className="text-gray-400 font-normal">(opsional, untuk suara TTS absensi)</span></label>
                <input value={form.nama_panggilan || ''} onChange={(e) => setForm({...form, nama_panggilan: e.target.value})} placeholder="mis. Azkayra" className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Jenis Kelamin *</label>
                  <select value={form.jenis_kelamin} onChange={(e) => setForm({...form, jenis_kelamin: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rombel</label>
                  <select value={form.rombel_id} onChange={(e) => setForm({...form, rombel_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">-- Pilih --</option>
                    {rombels.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tempat Lahir</label>
                  <input value={form.tempat_lahir} onChange={(e) => setForm({...form, tempat_lahir: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Lahir</label>
                  <input type="date" value={form.tanggal_lahir} onChange={(e) => setForm({...form, tanggal_lahir: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Alamat</label>
                <input value={form.alamat} onChange={(e) => setForm({...form, alamat: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">No HP</label>
                  <input value={form.no_hp} onChange={(e) => setForm({...form, no_hp: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nama Orang Tua</label>
                  <input value={form.nama_ortu} onChange={(e) => setForm({...form, nama_ortu: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>

              <div className="pt-2 border-t">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Biodata untuk Rapor</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Agama</label>
                    <select value={form.agama || 'Islam'} onChange={(e) => setForm({...form, agama: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                      {['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu'].map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Status Keluarga</label>
                    <select value={form.status_keluarga || 'Anak Kandung'} onChange={(e) => setForm({...form, status_keluarga: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                      {['Anak Kandung', 'Anak Angkat', 'Anak Tiri'].map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Anak Ke</label>
                    <input type="number" min={1} value={form.anak_ke || ''} onChange={(e) => setForm({...form, anak_ke: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sekolah Asal (SD/MI)</label>
                  <input value={form.asal_sekolah || ''} onChange={(e) => setForm({...form, asal_sekolah: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nama Ayah</label>
                    <input value={form.nama_ayah || ''} onChange={(e) => setForm({...form, nama_ayah: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Pekerjaan Ayah</label>
                    <input value={form.kerja_ayah || ''} onChange={(e) => setForm({...form, kerja_ayah: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nama Ibu</label>
                    <input value={form.nama_ibu || ''} onChange={(e) => setForm({...form, nama_ibu: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Pekerjaan Ibu</label>
                    <input value={form.kerja_ibu || ''} onChange={(e) => setForm({...form, kerja_ibu: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Alamat Orang Tua <span className="text-gray-400 font-normal">(kosongkan bila sama dengan alamat siswa)</span></label>
                  <input value={form.alamat_ortu || ''} onChange={(e) => setForm({...form, alamat_ortu: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nama Wali <span className="text-gray-400 font-normal">(bila ada)</span></label>
                    <input value={form.nama_wali || ''} onChange={(e) => setForm({...form, nama_wali: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Pekerjaan Wali</label>
                    <input value={form.kerja_wali || ''} onChange={(e) => setForm({...form, kerja_wali: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                  </div>
                </div>
              </div>

              {editId && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                    <option value="lulus">Lulus</option>
                  </select>
                </div>
              )}
            </div>
        </Modal>
      )}

      {isLocalTenant && (
        <Modal
          open={showBulkDelete}
          onClose={() => !bulkDeleting && setShowBulkDelete(false)}
          title={bulkDeleteScope === 'rombel' ? 'Hapus Siswa per Rombel' : 'Hapus Semua Siswa'}
          maxWidth="md:max-w-md"
          footer={
            <div className="flex gap-3">
              <button onClick={() => setShowBulkDelete(false)} disabled={bulkDeleting} className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Batal</button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting || bulkDeleteCount === 0 || bulkDeleteConfirmation !== (bulkDeleteScope === 'rombel' ? 'HAPUS SISWA ROMBEL' : 'HAPUS SEMUA SISWA')}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-40"
              >
                {bulkDeleting ? 'Menghapus...' : `Hapus ${bulkDeleteCount} Siswa`}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {bulkDeleteScope === 'rombel'
                ? <>Sebanyak <strong>{bulkDeleteCount}</strong> siswa dalam rombel <strong>{rombels.find((r) => r.id === selectedRombelId)?.nama || '-'}</strong> beserta data terkaitnya akan dihapus permanen.</>
                : <>Seluruh <strong>{bulkDeleteCount}</strong> siswa lembaga ini beserta data terkaitnya akan dihapus permanen. Tenant lain tidak disentuh.</>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ketik <code className="rounded bg-gray-100 px-1 text-red-600">{bulkDeleteScope === 'rombel' ? 'HAPUS SISWA ROMBEL' : 'HAPUS SEMUA SISWA'}</code> untuk konfirmasi
              </label>
              <input
                value={bulkDeleteConfirmation}
                onChange={(e) => setBulkDeleteConfirmation(e.target.value)}
                autoComplete="off"
                className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Import Excel */}
      {isLocalTenant && showImport && (
        <ImportExcel
          title="Import Data Siswa"
          templateName="template-import-siswa.xlsx"
          templateUrl="/templates/template-import-siswa.xlsx"
          headerRow={0}
          columnMap={{ 'Nama': 'nama', 'NAMA': 'nama', 'Nama Panggilan': 'nama_panggilan', 'NIK': 'nik', 'NIS': 'nis', 'NISN': 'nisn', 'JK': 'jenis_kelamin', 'Jenis Kelamin': 'jenis_kelamin', 'Tempat Lahir': 'tempat_lahir', 'Tanggal Lahir': 'tanggal_lahir', 'Alamat': 'alamat', 'No HP': 'no_hp', 'Nama Ortu': 'nama_ortu', 'Rombel': 'rombel_nama' }}
          onImport={async (rows) => {
            const studentData = rows.map(row => ({
              nama: row.nama,
              nama_panggilan: row.nama_panggilan || '',
              nik: String(row.nik || '').trim(),
              nis: String(row.nis || '').trim(),
              nisn: String(row.nisn || '').trim(),
              jenis_kelamin: (row.jenis_kelamin || 'L').toString().charAt(0).toUpperCase(),
              tempat_lahir: row.tempat_lahir || '',
              tanggal_lahir: row.tanggal_lahir || '',
              alamat: row.alamat || '',
              no_hp: String(row.no_hp || '').trim(),
              nama_ortu: row.nama_ortu || '',
              rombel_nama: row.rombel_nama || '',
              agama: row.agama || 'Islam',
              status_keluarga: row.status_keluarga || 'Anak Kandung',
              anak_ke: row.anak_ke || '',
              asal_sekolah: row.asal_sekolah || '',
              nama_ayah: row.nama_ayah || '',
              nama_ibu: row.nama_ibu || '',
              alamat_ortu: row.alamat_ortu || '',
              kerja_ayah: row.kerja_ayah || '',
              kerja_ibu: row.kerja_ibu || '',
              nama_wali: row.nama_wali || '',
              kerja_wali: row.kerja_wali || ''
            }))
            
            const { data } = await api.post('/api/siswa/bulk-import', { students: studentData })
            if (data.failed > 0) {
              const errorMsg = data.errors.map((e: any) => `${e.nama || e.nis}: ${e.error}`).join('; ')
              throw new Error(`${data.success}/${data.total} berhasil, ${data.failed} gagal. Detail: ${errorMsg}`)
            }
            await fetchData()
          }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm text-gray-800 font-medium ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}
