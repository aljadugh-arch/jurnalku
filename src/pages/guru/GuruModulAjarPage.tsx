import { useState, useEffect } from 'react'
import { BookOpen, Sparkles, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

export default function GuruModulAjarPage() {
  const [form, setForm] = useState({ mapel: '', materi_pokok: '', fase: '', alokasi_waktu: '2 x 45 Menit' })
  const [loading, setLoading] = useState(false)
  const [hasil, setHasil] = useState('')
  const [riwayat, setRiwayat] = useState<any[]>([])

  useEffect(() => {
    api.get('/modul-ajar').then(res => setRiwayat(res.data)).catch(() => {})
  }, [])

  const handleGenerate = async () => {
    if (!form.mapel || !form.materi_pokok) return toast.error('Isi mata pelajaran dan materi')
    setLoading(true)
    try {
      const text = `# MODUL AJAR\n\n## I. INFORMASI UMUM\n- **Mata Pelajaran:** ${form.mapel}\n- **Fase/Kelas:** ${form.fase}\n- **Materi Pokok:** ${form.materi_pokok}\n- **Alokasi Waktu:** ${form.alokasi_waktu}\n\n## II. TUJUAN PEMBELAJARAN\nPeserta didik mampu memahami dan menerapkan konsep ${form.materi_pokok} dalam konteks kehidupan sehari-hari.\n\n## III. KEGIATAN PEMBELAJARAN\n\n### A. Pendahuluan (15 menit)\n1. Salam, doa, dan presensi\n2. Apersepsi terkait ${form.materi_pokok}\n3. Menyampaikan tujuan pembelajaran\n\n### B. Inti (60 menit)\n- Stimulasi dan orientasi masalah\n- Diskusi kelompok\n- Presentasi dan klarifikasi\n\n### C. Penutup (15 menit)\n1. Refleksi\n2. Evaluasi formatif\n3. Tindak lanjut\n\n## IV. ASESMEN\n- Formatif: observasi, kuis\n- Sumatif: tugas tertulis`

      await api.post('/modul-ajar', { mapel: form.mapel, materi_pokok: form.materi_pokok, fase: form.fase, alokasi_waktu: form.alokasi_waktu, hasil: text })
      setHasil(text)
      toast.success('Modul ajar berhasil digenerate')
      const res = await api.get('/modul-ajar')
      setRiwayat(res.data)
    } catch { toast.error('Gagal generate') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Generator Modul Ajar</h1>
        <p className="text-gray-500 text-sm mt-1">Buat modul ajar dengan bantuan AI</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="flex items-center gap-2 font-semibold text-gray-800 mb-4">
              <BookOpen size={18} className="text-primary" /> Informasi Modul
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Mata Pelajaran</label>
                <input value={form.mapel} onChange={e => setForm({...form, mapel: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm" placeholder="Matematika" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Fase / Kelas</label>
                <input value={form.fase} onChange={e => setForm({...form, fase: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm" placeholder="Fase E / Kelas X" />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Materi Pokok</label>
              <input value={form.materi_pokok} onChange={e => setForm({...form, materi_pokok: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm" placeholder="Persamaan Kuadrat" />
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Alokasi Waktu</label>
              <input value={form.alokasi_waktu} onChange={e => setForm({...form, alokasi_waktu: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>

          <button onClick={handleGenerate} disabled={loading} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-primary to-blue-700 text-white rounded-xl text-sm font-medium hover:from-primary-dark hover:to-blue-800 disabled:opacity-50 shadow-lg">
            {loading ? <><Loader2 size={18} className="animate-spin" /> Memproses...</> : <><Sparkles size={18} /> Buat Modul Ajar</>}
          </button>

          {hasil && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b">
                <h3 className="font-medium text-gray-700">Hasil Modul Ajar</h3>
              </div>
              <div className="p-6">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">{hasil}</pre>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-3">Riwayat Generate</h3>
          <div className="space-y-2">
            {riwayat.length === 0 && <p className="text-sm text-gray-400">Belum ada riwayat</p>}
            {riwayat.map(r => (
              <div key={r.id} className="p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setHasil(r.hasil || '')}>
                <p className="text-sm font-medium text-gray-800">{r.mapel}</p>
                <p className="text-xs text-gray-500">{r.materi_pokok}</p>
                <p className="text-xs text-gray-400 mt-1">{r.created_at?.split('T')[0] || '-'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
