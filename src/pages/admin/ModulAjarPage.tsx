import { useState, useEffect } from 'react'
import { BookOpen, Sparkles, FileText, Download, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

const faseOptions = [
  'Fase Fondasi (PAUD/TK)',
  'Kelas 1 SD/MI (Fase A)', 'Kelas 2 SD/MI (Fase A)',
  'Kelas 3 SD/MI (Fase B)', 'Kelas 4 SD/MI (Fase B)',
  'Kelas 5 SD/MI (Fase C)', 'Kelas 6 SD/MI (Fase C)',
  'Kelas 7 SMP/MTs (Fase D)', 'Kelas 8 SMP/MTs (Fase D)', 'Kelas 9 SMP/MTs (Fase D)',
  'Kelas 10 SMA/MA/SMK (Fase E)',
  'Kelas 11 SMA/MA/SMK (Fase F)', 'Kelas 12 SMA/MA/SMK (Fase F)',
]

const modelPembelajaran = [
  'Problem Based Learning (PBL)',
  'Project Based Learning (PjBL)',
  'Discovery Learning',
  'Inquiry Learning',
  'Kooperatif (Cooperative Learning)',
  'Tatap Muka / Luring',
  'Blended Learning',
]

const targetPeserta = [
  'Peserta didik reguler/tipikal (umum)',
  'Peserta didik dengan kesulitan belajar',
  'Peserta didik dengan pencapaian tinggi',
  'Heterogen (Diferensiasi Penuh)',
]

const dimensiProfil = [
  { id: 'iman', label: 'Keimanan/ketakwaan terhadap Tuhan YME', icon: '🕌' },
  { id: 'warga', label: 'Kewarganegaraan', icon: '🏛️' },
  { id: 'nalar', label: 'Penalaran kritis', icon: '🧠' },
  { id: 'kreatif', label: 'Kreativitas', icon: '💡' },
  { id: 'kolaborasi', label: 'Kolaborasi', icon: '🤝' },
  { id: 'mandiri', label: 'Kemandirian', icon: '🎯' },
  { id: 'sehat', label: 'Kesehatan', icon: '❤️' },
  { id: 'komunikasi', label: 'Komunikasi', icon: '💬' },
]

export default function ModulAjarPage() {
  const [form, setForm] = useState({
    kurikulum: 'merdeka',
    mapel: '',
    fase: '',
    materi_pokok: '',
    dimensi: [] as string[],
    model_pembelajaran: 'Problem Based Learning (PBL)',
    target_peserta: 'Peserta didik reguler/tipikal (umum)',
    tujuan_pembelajaran: '',
    alokasi_waktu: '2 x 45 Menit',
  })
  const [loading, setLoading] = useState(false)
  const [hasil, setHasil] = useState('')
  const [riwayat, setRiwayat] = useState<any[]>([])

  useEffect(() => { loadRiwayat() }, [])

  const loadRiwayat = async () => {
    try {
      const res = await api.get('/modul-ajar')
      setRiwayat(res.data)
    } catch {}
  }

  const toggleDimensi = (id: string) => {
    setForm(prev => ({
      ...prev,
      dimensi: prev.dimensi.includes(id)
        ? prev.dimensi.filter(d => d !== id)
        : [...prev.dimensi, id]
    }))
  }

  const handleGenerate = async () => {
    setLoading(true)
    try {
      // Generate modul (simpan ke DB, hasilnya simulasi template)
      // Generate modul (simpan ke DB, hasilnya simulasi template)
      const tp = form.tujuan_pembelajaran || ('Peserta didik mampu memahami dan menerapkan konsep ' + form.materi_pokok + ' dalam kehidupan sehari-hari.')
      const dimensiList = form.dimensi.map(d => '- ' + (dimensiProfil.find(x => x.id === d)?.label || d)).join('\n')
      let generatedText = ''
      if (form.kurikulum === 'kbc') {
        // KBC (Kurikulum Berbasis Cinta) + Deep Learning - Kemenag
        const L = []
        L.push('# MODUL AJAR - KURIKULUM BERBASIS CINTA (KBC)')
        L.push('_Pendekatan Deep Learning: Mindful, Meaningful, Joyful Learning_')
        L.push('')
        L.push('## I. IDENTITAS')
        L.push('- Mata Pelajaran: ' + form.mapel)
        L.push('- Fase/Kelas: ' + form.fase)
        L.push('- Materi Pokok: ' + form.materi_pokok)
        L.push('- Alokasi Waktu: ' + form.alokasi_waktu)
        L.push('- Pendekatan: ' + form.model_pembelajaran)
        L.push('')
        L.push('## II. TIGA DIMENSI CINTA (KBC)')
        L.push('1. Cinta kepada Allah dan Rasul-Nya')
        L.push('2. Cinta kepada sesama manusia dan lingkungan')
        L.push('3. Cinta kepada tanah air dan kemajuan bangsa')
        L.push('')
        L.push('## III. TUJUAN PEMBELAJARAN')
        L.push(tp)
        L.push('')
        L.push('## IV. DIMENSI PROFIL LULUSAN')
        L.push(dimensiList || '- (belum dipilih)')
        L.push('')
        L.push('## V. KEGIATAN PEMBELAJARAN (DEEP LEARNING)')
        L.push('')
        L.push('### A. Mindful Learning - Berkesadaran (15 menit)')
        L.push('1. Membuka dengan doa dan refleksi kesadaran diri')
        L.push('2. Apersepsi bermakna terkait ' + form.materi_pokok)
        L.push('3. Menyampaikan tujuan dengan penuh kehangatan')
        L.push('')
        L.push('### B. Meaningful Learning - Bermakna (60 menit)')
        L.push('- Mengaitkan ' + form.materi_pokok + ' dengan nilai cinta & kehidupan nyata')
        L.push('- Eksplorasi kolaboratif dan penyelidikan mendalam')
        L.push('- Refleksi nilai dan presentasi hasil')
        L.push('')
        L.push('### C. Joyful Learning - Menggembirakan (15 menit)')
        L.push('1. Perayaan hasil belajar (celebration of learning)')
        L.push('2. Refleksi rasa syukur dan umpan balik positif')
        L.push('3. Tindak lanjut dan penutup penuh cinta')
        L.push('')
        L.push('## VI. ASESMEN')
        L.push('- Asesmen Sikap (spiritual & sosial): observasi nilai cinta')
        L.push('- Asesmen Formatif: portofolio & refleksi')
        L.push('- Asesmen Sumatif: proyek bermakna')
        L.push('')
        L.push('## VII. MEDIA & SUMBER BELAJAR')
        L.push('- Buku paket ' + form.mapel + ' & sumber keislaman relevan')
        L.push('- Media digital dan lingkungan sekitar')
        generatedText = L.join('\n')
      } else {
        // Kurikulum Merdeka (default)
        const L = []
        L.push('# MODUL AJAR - KURIKULUM MERDEKA')
        L.push('')
        L.push('## I. INFORMASI UMUM')
        L.push('- Mata Pelajaran: ' + form.mapel)
        L.push('- Fase/Kelas: ' + form.fase)
        L.push('- Materi Pokok: ' + form.materi_pokok)
        L.push('- Alokasi Waktu: ' + form.alokasi_waktu)
        L.push('- Model Pembelajaran: ' + form.model_pembelajaran)
        L.push('- Target Peserta Didik: ' + form.target_peserta)
        L.push('')
        L.push('## II. TUJUAN PEMBELAJARAN')
        L.push(tp)
        L.push('')
        L.push('## III. PROFIL PELAJAR PANCASILA')
        L.push(dimensiList || '- (belum dipilih)')
        L.push('')
        L.push('## IV. KEGIATAN PEMBELAJARAN')
        L.push('')
        L.push('### A. Pendahuluan (15 menit)')
        L.push('1. Guru membuka pelajaran dengan salam dan doa')
        L.push('2. Apersepsi dan motivasi terkait ' + form.materi_pokok)
        L.push('3. Menyampaikan tujuan pembelajaran')
        L.push('')
        L.push('### B. Inti (60 menit)')
        L.push('- Orientasi masalah terkait ' + form.materi_pokok)
        L.push('- Diskusi kelompok dan penyelidikan')
        L.push('- Presentasi hasil dan klarifikasi')
        L.push('')
        L.push('### C. Penutup (15 menit)')
        L.push('1. Refleksi pembelajaran')
        L.push('2. Evaluasi formatif')
        L.push('3. Tindak lanjut dan penutup')
        L.push('')
        L.push('## V. ASESMEN')
        L.push('- Asesmen Formatif: Observasi dan kuis')
        L.push('- Asesmen Sumatif: Tugas/laporan')
        L.push('')
        L.push('## VI. MEDIA & SUMBER BELAJAR')
        L.push('- Buku paket ' + form.mapel)
        L.push('- Media digital dan alat peraga')
        generatedText = L.join('\n')
      }

      await api.post('/modul-ajar', {
        mapel: form.mapel,
        fase: form.fase,
        materi_pokok: form.materi_pokok,
        dimensi_profil: form.dimensi,
        model_pembelajaran: form.model_pembelajaran,
        target_peserta: form.target_peserta,
        tujuan_pembelajaran: form.tujuan_pembelajaran,
        alokasi_waktu: form.alokasi_waktu,
        kurikulum: form.kurikulum,
        hasil: generatedText
      })
      setHasil(generatedText)
      toast.success('Modul ajar berhasil digenerate dan disimpan')
      loadRiwayat()
    } catch { toast.error('Gagal generate modul') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Generator Modul Ajar AI</h1>
          <p className="text-gray-500 text-sm mt-1">Buat modul ajar standar nasional dengan teknologi AI &mdash; Referensi: ai.jurnale.id</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Input */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="flex items-center gap-2 font-semibold text-gray-800 mb-5">
              <BookOpen size={18} className="text-primary" />
              I. Informasi Umum
            </h3>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Kurikulum</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({...form, kurikulum: 'merdeka'})}
                  className={`px-3 py-2.5 rounded-lg text-xs font-medium border transition-all ${form.kurikulum === 'merdeka' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  Kurikulum Merdeka
                </button>
                <button
                  type="button"
                  onClick={() => setForm({...form, kurikulum: 'kbc'})}
                  className={`px-3 py-2.5 rounded-lg text-xs font-medium border transition-all ${form.kurikulum === 'kbc' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  KBC / Deep Learning
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Mata Pelajaran</label>
                <input
                  type="text"
                  placeholder="Contoh: Fisika"
                  value={form.mapel}
                  onChange={(e) => setForm({...form, mapel: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Fase / Kelas</label>
                <select
                  value={form.fase}
                  onChange={(e) => setForm({...form, fase: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">Pilih Jenjang</option>
                  {faseOptions.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Materi Pokok / Topik</label>
              <input
                type="text"
                placeholder="Contoh: Hukum Newton tentang Gerak"
                value={form.materi_pokok}
                onChange={(e) => setForm({...form, materi_pokok: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          {/* Dimensi Profil Pelajar Pancasila */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-3">{form.kurikulum === 'kbc' ? 'Dimensi Profil Lulusan (KBC)' : 'Dimensi Profil Pelajar Pancasila'}</h3>
            <p className="text-xs text-gray-400 mb-4">Pilih dimensi yang relevan dengan materi</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {dimensiProfil.map(d => (
                <button
                  key={d.id}
                  onClick={() => toggleDimensi(d.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border transition-all ${
                    form.dimensi.includes(d.id)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span>{d.icon}</span>
                  <span>{d.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Kompetensi */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="flex items-center gap-2 font-semibold text-gray-800 mb-5">
              <FileText size={18} className="text-primary" />
              II. Kompetensi Inti
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Model Pembelajaran</label>
                <select
                  value={form.model_pembelajaran}
                  onChange={(e) => setForm({...form, model_pembelajaran: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  {modelPembelajaran.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Target Peserta Didik</label>
                <select
                  value={form.target_peserta}
                  onChange={(e) => setForm({...form, target_peserta: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  {targetPeserta.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Tujuan Pembelajaran (TP)</label>
              <textarea
                placeholder="Isi TP atau biarkan AI merumuskan..."
                value={form.tujuan_pembelajaran}
                onChange={(e) => setForm({...form, tujuan_pembelajaran: e.target.value})}
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Alokasi Waktu</label>
                <input
                  type="text"
                  value={form.alokasi_waktu}
                  onChange={(e) => setForm({...form, alokasi_waktu: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !form.mapel || !form.fase || !form.materi_pokok}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-primary to-blue-700 text-white rounded-xl text-sm font-medium hover:from-primary-dark hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Memproses dengan AI...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Buat Modul Ajar
              </>
            )}
          </button>

          {/* Hasil */}
          {hasil && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b">
                <h3 className="font-medium text-gray-700">Hasil Modul Ajar</h3>
                <button className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700">
                  <Download size={14} /> Export DOCX
                </button>
              </div>
              <div className="p-6 prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">{hasil}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Riwayat */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-3">Riwayat Generate</h3>
            <div className="space-y-2">
              {riwayat.map(r => (
                <div key={r.id} className="p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setHasil(r.hasil || '')}>
                  <p className="text-sm font-medium text-gray-800">{r.mapel}</p>
                  <p className="text-xs text-gray-500">{r.materi_pokok}</p>
                  <p className="text-xs text-gray-400 mt-1">{r.created_at?.split('T')[0] || '-'}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-primary/10 to-blue-50 rounded-xl p-5 border border-primary/20">
            <Sparkles size={24} className="text-primary mb-2" />
            <h4 className="font-medium text-gray-800 text-sm">{form.kurikulum === 'kbc' ? 'Template KBC / Deep Learning' : 'Template Kurikulum Merdeka'}</h4>
            <p className="text-xs text-gray-600 mt-1">
              {form.kurikulum === 'kbc'
                ? 'Menyusun modul ajar Kurikulum Berbasis Cinta dengan pendekatan Deep Learning (mindful, meaningful, joyful).'
                : 'Menyusun modul ajar lengkap sesuai format Kurikulum Merdeka dari data yang Anda isi.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
