import { useState, useEffect } from 'react'
import { Download, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface Section {
  key: string
  label: string
  count: number
}

interface PreviewResult {
  total: number
  sections: string[]
}

export default function BackupRestorePage() {
  const [sections, setSections] = useState<Section[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/backup-restore/sections')
      .then(({ data }) => {
        setSections(data)
        setSelected(data.map((s: Section) => s.key))
      })
      .catch(() => toast.error('Gagal memuat bagian backup'))
  }, [])

  const handleExport = async () => {
    if (!selected.length) { toast.error('Pilih minimal satu bagian'); return }
    setLoading(true)
    try {
      const res = await api.post('/backup-restore/export', { sections: selected }, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `jurnalku-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Backup berhasil diunduh')
    } catch {
      toast.error('Backup gagal')
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = async (f: File | null) => {
    setFile(f)
    setPreview(null)
    if (!f) return
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('backup', f)
      const res = await api.post('/backup-restore/preview', fd)
      setPreview(res.data)
      toast.success('File backup valid')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'File backup tidak valid')
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async () => {
    if (!file || !preview) { toast.error('Pilih dan validasi file backup'); return }
    const msg = mode === 'replace'
      ? 'Ganti data terpilih dengan isi backup? Snapshot otomatis dibuat sebelum restore.'
      : 'Gabungkan isi backup ke data sekarang?'
    if (!confirm(msg)) return
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('backup', file)
      fd.append('mode', mode)
      fd.append('confirmation', 'RESTORE')
      if (mode === 'replace') fd.append('replace_confirmation', 'REPLACE DATA')
      const { data } = await api.post('/backup-restore/restore', fd)
      toast.success(`Restore selesai: ${data.inserted} ditambahkan, ${data.skipped} dilewati`)
      setFile(null)
      setPreview(null)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Restore gagal')
    } finally {
      setLoading(false)
    }
  }

  const toggleAll = () => {
    setSelected(selected.length === sections.length ? [] : sections.map(s => s.key))
  }

  const toggleSection = (key: string) => {
    setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Backup &amp; Restore</h1>
        <p className="mt-1 text-sm text-gray-500">Cadangkan dan pulihkan data lembaga. Akun serta kredensial tidak disertakan.</p>
      </div>

      {/* Export section */}
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Buat Backup</h2>
          <button onClick={toggleAll} className="text-sm text-primary">
            {selected.length === sections.length ? 'Kosongkan' : 'Pilih semua'}
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map(s => (
            <label key={s.key} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm hover:bg-gray-50">
              <input
                type="checkbox"
                checked={selected.includes(s.key)}
                onChange={() => toggleSection(s.key)}
              />
              <span className="flex-1">{s.label}</span>
              <span className="text-gray-400">{s.count}</span>
            </label>
          ))}
        </div>
        <button
          disabled={loading}
          onClick={handleExport}
          className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-primary-dark"
        >
          <Download size={16} />
          Unduh Backup
        </button>
      </section>

      {/* Restore section */}
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-gray-800">Restore Backup</h2>
        <p className="mb-4 mt-1 text-sm text-gray-500">
          Hanya file JSON hasil backup Jurnalku dari lembaga ini yang diterima.
        </p>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-sm text-gray-600 hover:border-primary hover:text-primary">
          <Upload size={18} />
          {file?.name || 'Pilih file backup JSON'}
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={e => handleFileChange(e.target.files?.[0] || null)}
          />
        </label>

        {preview && (
          <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
            File valid: {preview.total} baris dalam {preview.sections.length} bagian.
          </div>
        )}

        <div className="mt-4 flex gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} />
            Gabungkan data
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            Ganti data terpilih
          </label>
        </div>

        <button
          disabled={loading || !preview}
          onClick={handleRestore}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-red-700"
        >
          Pulihkan Data
        </button>
      </section>
    </div>
  )
}
