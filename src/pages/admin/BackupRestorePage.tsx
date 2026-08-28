import { useState, useEffect } from 'react'
import { Download, Upload, Cloud, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { todayWib } from '../../lib/dateFormat'

interface Section {
  key: string
  label: string
  count: number
}

interface PreviewResult {
  total: number
  sections: Array<{ key: string; label: string; count: number }>
}

interface DriveStatus { connected: boolean; email?: string; folder_id?: string | null; folder_ok?: boolean; error?: string; auth_type?: 'oauth2' | 'service_account' }
interface DriveDiagnostics { credential_dir: string; auth_mode: string; files: { service_account: boolean; oauth_client: boolean; oauth_token_shared: boolean; oauth_token_tenant: boolean } }
interface BackupLog { id: string; filename: string; drive_file_id: string | null; size: number; status: string; error: string | null; created_at: string }

const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`

export default function BackupRestorePage() {
  const [sections, setSections] = useState<Section[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [loading, setLoading] = useState(false)

  // Google Drive
  const [drive, setDrive] = useState<DriveStatus | null>(null)
  const [diag, setDiag] = useState<DriveDiagnostics | null>(null)
  const [driveLoading, setDriveLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<BackupLog[]>([])
  const [cfg, setCfg] = useState({ folder_id: '', auto_enabled: false, retention_days: 14 })

  const loadDrive = () => {
    setDriveLoading(true)
    Promise.all([
      api.get('/google-drive/status').then(({ data }) => setDrive(data)).catch(() => setDrive({ connected: false })),
      api.get('/google-drive/diagnostics').then(({ data }) => setDiag(data)).catch(() => setDiag(null)),
    ]).finally(() => setDriveLoading(false))
  }
  const loadLogs = () => { api.get('/backup/log').then(({ data }) => setLogs(data)).catch(() => {}) }
  const loadCfg = () => {
    api.get('/backup/config').then(({ data }) => setCfg({
      folder_id: data.folder_id || '', auto_enabled: !!data.auto_enabled, retention_days: data.retention_days || 14,
    })).catch(() => {})
  }

  useEffect(() => {
    api.get('/backup-restore/sections')
      .then(({ data }) => {
        setSections(data)
        setSelected(data.map((s: Section) => s.key))
      })
      .catch(() => toast.error('Gagal memuat bagian backup'))
    loadDrive(); loadLogs(); loadCfg()
  }, [])

  const connectDrive = async () => {
    try {
      const { data } = await api.get('/google-drive/oauth/start')
      window.location.assign(data.authorization_url)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Tidak dapat memulai koneksi Google Drive')
    }
  }

  const runDriveBackup = async () => {
    setRunning(true)
    try {
      const { data } = await api.post('/backup/run')
      toast.success(`Backup ke Drive berhasil (${fmtSize(data.size)})`)
      loadLogs()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Backup ke Drive gagal')
    } finally { setRunning(false) }
  }

  const saveCfg = async () => {
    try {
      await api.put('/backup/config', cfg)
      toast.success('Pengaturan backup disimpan')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan pengaturan')
    }
  }

  const handleExport = async () => {
    if (!selected.length) { toast.error('Pilih minimal satu bagian'); return }
    setLoading(true)
    try {
      const res = await api.post('/backup-restore/export', { sections: selected }, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `jurnalku-backup-${todayWib()}.json`
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
      const res = await api.post('/backup-restore/preview', fd, { headers: { 'Content-Type': undefined } })
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
      const { data } = await api.post('/backup-restore/restore', fd, { headers: { 'Content-Type': undefined } })
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

      {/* Google Drive section */}
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-gray-800"><Cloud size={18} className="text-primary" /> Backup ke Google Drive</h2>
          <div className="flex items-center gap-3">
            <button onClick={connectDrive} className="text-sm text-primary hover:underline">Hubungkan Google</button>
            <button onClick={loadDrive} className="flex items-center gap-1 text-sm text-primary hover:underline" title="Cek ulang koneksi">
              <RefreshCw size={14} className={driveLoading ? 'animate-spin' : ''} /> Cek
            </button>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2 text-sm">
          {driveLoading ? (
            <span className="flex items-center gap-2 text-gray-500"><Loader2 size={16} className="animate-spin" /> Memeriksa koneksi…</span>
          ) : drive?.connected ? (
            <span className="flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-green-700"><CheckCircle2 size={16} /> Terhubung via {drive.auth_type === 'service_account' ? 'Service Account' : 'OAuth'}{drive.email ? ` (${drive.email})` : ''}{drive.folder_ok === false ? ' — folder belum bisa diakses' : ''}</span>
          ) : (
            <span className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-red-700"><XCircle size={16} /> Tidak terhubung{drive?.error ? `: ${drive.error}` : ''}</span>
          )}
        </div>

        {!drive?.connected && !driveLoading && diag && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
            <p className="font-semibold">Cara mengaktifkan Google Drive untuk aplikasi ini</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Unduh kredensial dari Google Cloud Console (OAuth client bertipe Web, atau Service Account JSON) milik proyek aplikasi ini — jangan memakai kredensial aplikasi lain.</li>
              <li>Simpan ke folder server: <code className="rounded bg-amber-100 px-1 break-all">{diag.credential_dir}</code></li>
              <li>OAuth: simpan sebagai <code className="rounded bg-amber-100 px-1">oauth-client.json</code>, lalu tekan <b>Hubungkan Google</b> di atas dan selesaikan persetujuan. Token disimpan otomatis per-tenant.</li>
              <li>Service Account: simpan sebagai <code className="rounded bg-amber-100 px-1">service-account.json</code> dan bagikan folder Drive ke email service account tersebut.</li>
            </ol>
            <p className="text-amber-800">
              Status file: service-account.json {diag.files.service_account ? 'ada' : 'belum ada'} · oauth-client.json {diag.files.oauth_client ? 'ada' : 'belum ada'} · token tenant {diag.files.oauth_token_tenant ? 'ada' : 'belum ada'}
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Folder ID Google Drive (opsional)</label>
            <input value={cfg.folder_id} onChange={e => setCfg({ ...cfg, folder_id: e.target.value })} placeholder="ID folder tujuan (kosongkan = folder default)" className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Simpan berapa hari</label>
            <input type="number" min={1} max={365} value={cfg.retention_days} onChange={e => setCfg({ ...cfg, retention_days: parseInt(e.target.value) || 14 })} className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={cfg.auto_enabled} onChange={e => setCfg({ ...cfg, auto_enabled: e.target.checked })} />
          Aktifkan backup otomatis
        </label>

        <div className="mt-4 flex flex-wrap gap-3">
          <button disabled={running} onClick={runDriveBackup} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-primary-dark">
            {running ? <Loader2 size={16} className="animate-spin" /> : <Cloud size={16} />}
            Backup Sekarang ke Drive
          </button>
          <button onClick={saveCfg} className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Simpan Pengaturan</button>
        </div>

        {logs.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-gray-500">
                <tr><th className="py-2">File</th><th className="py-2">Ukuran</th><th className="py-2">Status</th><th className="py-2">Waktu</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(l => (
                  <tr key={l.id}>
                    <td className="py-2">
                      {l.drive_file_id
                        ? <a href={`https://drive.google.com/file/d/${l.drive_file_id}/view`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{l.filename}</a>
                        : <span className="text-gray-700">{l.filename}</span>}
                    </td>
                    <td className="py-2 text-gray-600">{l.size ? fmtSize(l.size) : '-'}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${l.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`} title={l.error || ''}>{l.status === 'ok' ? 'Sukses' : 'Gagal'}</span>
                    </td>
                    <td className="py-2 text-gray-500">{new Date(l.created_at + 'Z').toLocaleString('id-ID')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
          {file?.name || 'Pilih file backup JSON / JSON.GZ'}
          <input
            type="file"
            accept=".json,.gz,.json.gz,application/json,application/gzip"
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
