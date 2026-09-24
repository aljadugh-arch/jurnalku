import { useState } from 'react'
import { ScanText, Sparkles, Loader2, CheckCircle2, ClipboardCheck, Upload, FileText, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { handleOcrFile } from '../../lib/ocr'

interface BulkScanResult {
  file: string
  text: string
  status: 'success' | 'processing' | 'error'
  error?: string
}

export default function GuruKoreksiJawabanPage() {
  const [soal, setSoal] = useState('')
  const [kunciJawaban, setKunciJawaban] = useState('')
  const [jawabanSiswa, setJawabanSiswa] = useState('')
  const [skalaMax, setSkalaMax] = useState(100)
  const [scanningSoal, setScanningSoal] = useState(false)
  const [scanningKunci, setScanningKunci] = useState(false)
  const [scanningJawaban, setScanningJawaban] = useState(false)
  const [koreksi, setKoreksi] = useState<{ skor: number; alasan: string; saran: string } | null>(null)
  const [loading, setLoading] = useState(false)
  
  // Bulk upload state
  const [bulkScanResults, setBulkScanResults] = useState<BulkScanResult[]>([])
  const [bulkScanning, setBulkScanning] = useState(false)
  const [showBulkTab, setShowBulkTab] = useState(false)

  const nilai = async () => {
    if (!jawabanSiswa.trim()) return toast.error('Jawaban siswa wajib diisi (ketik atau scan foto)')
    if (!soal.trim() && !kunciJawaban.trim()) return toast.error('Isi soal atau kunci jawaban sebagai acuan koreksi')
    setLoading(true)
    setKoreksi(null)
    try {
      const { data } = await api.post('/ai-koreksi/nilai', { soal, kunciJawaban, jawabanSiswa, skalaMax })
      setKoreksi(data)
      toast.success('Koreksi selesai')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Gagal mengoreksi jawaban')
    } finally { setLoading(false) }
  }

  const inputClass = 'w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400'

  const scanButton = (scanning: boolean, setScanning: (v: boolean) => void, onText: (t: string) => void, label: string) => (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:border-slate-700 dark:text-slate-300">
      {scanning ? <Loader2 size={14} className="animate-spin" /> : <ScanText size={14} />} {scanning ? 'Memindai...' : label}
      <input type="file" accept="image/*" className="hidden" disabled={scanning} onChange={e => handleOcrFile(e.target.files?.[0], text => onText(text), setScanning)} />
    </label>
  )

  const handleBulkUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    
    const results: BulkScanResult[] = Array.from(files).map(f => ({
      file: f.name,
      text: '',
      status: 'processing' as const
    }))
    setBulkScanResults(results)
    setBulkScanning(true)

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        try {
          const formData = new FormData()
          formData.append('image', file)
          const { data } = await api.post('/ocr/scan', formData, { 
            headers: { 'Content-Type': 'multipart/form-data' } 
          })
          
          results[i] = {
            file: file.name,
            text: data.text || '',
            status: data.text ? 'success' : 'error',
            error: data.text ? undefined : 'Tidak ada teks yang terdeteksi'
          }
        } catch (error: any) {
          results[i] = {
            file: file.name,
            text: '',
            status: 'error',
            error: error.response?.data?.error || 'Gagal memproses OCR'
          }
        }
        setBulkScanResults([...results])
      }
      
      const successCount = results.filter(r => r.status === 'success').length
      toast.success(`${successCount}/${files.length} file berhasil di-scan`)
    } finally {
      setBulkScanning(false)
    }
  }

  const downloadBulkResults = () => {
    const csv = ['File,Status,Teks\n', ...bulkScanResults.map(r => 
      `"${r.file}","${r.status}","${r.text.replace(/"/g, '""')}"`
    )].join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ljk-scan-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const clearBulkResults = () => {
    setBulkScanResults([])
  }

  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Koreksi Jawaban Otomatis (AI + OCR)</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Scan foto lembar jawaban siswa (tulisan tangan/cetak) atau ketik manual, lalu biarkan AI menilai berdasarkan soal dan kunci jawaban.</p>
    </div>

    {/* Tabs */}
    <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700">
      <button
        onClick={() => setShowBulkTab(false)}
        className={`px-4 py-2 font-semibold text-sm transition-colors ${!showBulkTab ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700 dark:text-slate-400'}`}
      >
        Koreksi Manual
      </button>
      <button
        onClick={() => setShowBulkTab(true)}
        className={`px-4 py-2 font-semibold text-sm transition-colors flex items-center gap-2 ${showBulkTab ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700 dark:text-slate-400'}`}
      >
        <Upload size={16} /> Bulk Scan LJK ({bulkScanResults.length})
      </button>
    </div>

    {showBulkTab ? (
      /* Bulk Upload Tab */
      <div className="space-y-4">
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-gray-800 dark:text-slate-100">
            <Upload size={20} className="text-primary" /> Upload Banyak File LJK
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-slate-300">Upload multiple file gambar LJK sekaligus, sistem akan otomatis scan semua file dan ekstrak teks menggunakan OCR.</p>
          
          <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-8 transition-colors hover:border-primary hover:bg-primary/5 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="text-center">
              <Upload size={32} className="mx-auto mb-2 text-primary" />
              <p className="font-semibold text-gray-700 dark:text-slate-100">Klik atau drag gambar di sini</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Dukung PNG, JPG, WebP (max 10 file sekaligus)</p>
            </div>
            <input 
              type="file" 
              multiple 
              accept="image/*" 
              className="hidden" 
              disabled={bulkScanning}
              onChange={e => handleBulkUpload(e.target.files)}
            />
          </label>

          {bulkScanResults.length > 0 && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 dark:text-slate-100">
                  Hasil Scan ({bulkScanResults.filter(r => r.status === 'success').length}/{bulkScanResults.length})
                </h3>
                <div className="flex gap-2">
                  {bulkScanResults.some(r => r.status === 'success') && (
                    <button
                      onClick={downloadBulkResults}
                      className="flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300"
                    >
                      <FileText size={14} /> Download CSV
                    </button>
                  )}
                  <button
                    onClick={clearBulkResults}
                    className="flex items-center gap-2 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300"
                  >
                    <Trash2 size={14} /> Hapus
                  </button>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {bulkScanResults.map((result, idx) => (
                  <div key={idx} className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="truncate font-medium text-sm text-gray-800 dark:text-slate-100">{result.file}</span>
                          {result.status === 'success' && <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />}
                          {result.status === 'error' && <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded dark:bg-red-900/30 dark:text-red-300">Error</span>}
                          {result.status === 'processing' && <Loader2 size={16} className="text-blue-600 animate-spin flex-shrink-0" />}
                        </div>
                        {result.text && (
                          <p className="text-xs text-gray-600 dark:text-slate-400 line-clamp-2">{result.text}</p>
                        )}
                        {result.error && (
                          <p className="text-xs text-red-600 dark:text-red-400">{result.error}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    ) : (
      /* Manual Correction Tab */
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6 space-y-5">
          <div>
            <span className={labelClass}>Soal (opsional jika kunci jawaban sudah lengkap)</span>
            <textarea className={inputClass} rows={3} value={soal} onChange={e => setSoal(e.target.value)} placeholder="Tuliskan atau scan soal ujian" />
            <div className="mt-2">{scanButton(scanningSoal, setScanningSoal, text => setSoal(prev => prev ? `${prev}\n${text}` : text), 'Scan Foto Soal')}</div>
          </div>
          <div>
            <span className={labelClass}>Kunci Jawaban / Rubrik Penilaian</span>
            <textarea className={inputClass} rows={3} value={kunciJawaban} onChange={e => setKunciJawaban(e.target.value)} placeholder="Tuliskan atau scan kunci jawaban" />
            <div className="mt-2">{scanButton(scanningKunci, setScanningKunci, text => setKunciJawaban(prev => prev ? `${prev}\n${text}` : text), 'Scan Foto Kunci Jawaban')}</div>
          </div>
          <div>
            <span className={labelClass}>Jawaban Siswa</span>
            <textarea className={inputClass} rows={5} value={jawabanSiswa} onChange={e => setJawabanSiswa(e.target.value)} placeholder="Tuliskan atau scan lembar jawaban siswa (mendukung tulisan tangan)" />
            <div className="mt-2">{scanButton(scanningJawaban, setScanningJawaban, text => setJawabanSiswa(prev => prev ? `${prev}\n${text}` : text), 'Scan Foto Jawaban Siswa')}</div>
          </div>
          <label className="block max-w-[200px]"><span className={labelClass}>Skala Nilai Maksimal</span><input type="number" min={1} max={1000} className={inputClass} value={skalaMax} onChange={e => setSkalaMax(Number(e.target.value))} /></label>
        </section>

        <button onClick={nilai} disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-blue-700 px-6 py-3.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50">
          {loading ? <><Loader2 size={18} className="animate-spin" /> AI sedang mengoreksi...</> : <><Sparkles size={18} /> Nilai Jawaban dengan AI</>}
        </button>

        {koreksi && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/30 sm:p-6">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={20} /><h2 className="font-semibold">Hasil Koreksi</h2></div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-emerald-700 dark:text-emerald-300">{koreksi.skor}</span>
            <span className="text-sm text-emerald-600 dark:text-emerald-400">/ {skalaMax}</span>
          </div>
          <div className="mt-4 space-y-3">
            <div><h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Alasan Penilaian</h3><p className="mt-1 text-sm text-gray-700 dark:text-slate-200">{koreksi.alasan}</p></div>
            {koreksi.saran && <div><h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Saran Perbaikan untuk Siswa</h3><p className="mt-1 text-sm text-gray-700 dark:text-slate-200">{koreksi.saran}</p></div>}
          </div>
        </section>}
      </div>

      <aside className="h-fit rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:sticky xl:top-4">
      </aside>
    </div>
    )}
  </div>
}
