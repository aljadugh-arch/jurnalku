import { useState } from 'react'
import { ScanText, Sparkles, Loader2, CheckCircle2, ClipboardCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { handleOcrFile } from '../../lib/ocr'

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

  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Koreksi Jawaban Otomatis (AI + OCR)</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Scan foto lembar jawaban siswa (tulisan tangan/cetak) atau ketik manual, lalu biarkan AI menilai berdasarkan soal dan kunci jawaban.</p>
    </div>

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
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-gray-800 dark:text-slate-100"><ClipboardCheck size={18} className="text-primary" /> Cara Pakai</h2>
        <ol className="list-decimal space-y-2 pl-4 text-sm text-gray-600 dark:text-slate-300">
          <li>Isi soal dan/atau kunci jawaban (ketik langsung atau scan foto).</li>
          <li>Foto atau ketik jawaban siswa — mendukung tulisan tangan.</li>
          <li>Klik "Nilai Jawaban dengan AI" untuk mendapat skor otomatis.</li>
          <li>Hasil bisa jadi acuan nilai harian/STS/SAS; tetap boleh disesuaikan manual jika perlu.</li>
        </ol>
      </aside>
    </div>
  </div>
}
