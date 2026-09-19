import { useState, useEffect } from 'react'
import { Plus, Trash2, X, ClipboardCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface JadwalUjian {
  id: string; template_id: string; mapel_id: string | null; rombel_id: string; gtk_id: string | null
  hari: string; jam_mulai: string; jam_selesai: string; ruangan: string
  mapel_nama?: string; rombel_nama?: string; guru_nama?: string; guru_valid: boolean | number
}

const SEMUA_HARI = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'] as const

export default function JadwalUjianPage() {
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [rombels, setRombels] = useState<any[]>([])
  const [selectedRombel, setSelectedRombel] = useState('')
  const [mapels, setMapels] = useState<any[]>([])
  const [gtks, setGtks] = useState<any[]>([])
  const [jadwal, setJadwal] = useState<JadwalUjian[]>([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ mapel_id: '', gtk_id: '', hari: 'senin', jam_mulai: '07:30', jam_selesai: '08:15', ruangan: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/template-jadwal'),
      api.get('/rombel'),
      api.get('/mapel'),
      api.get('/gtk'),
    ]).then(([t, r, m, g]) => {
      const ujianTemplates = t.data.filter((x: any) => x.jenis === 'ujian')
      setTemplates(ujianTemplates)
      if (ujianTemplates.length > 0) setSelectedTemplate(ujianTemplates[0].id)
      setRombels(r.data)
      if (r.data.length > 0) setSelectedRombel(r.data[0].id)
      setMapels(m.data)
      setGtks(g.data)
    }).catch(() => toast.error('Gagal memuat data jadwal ujian'))
  }, [])

  useEffect(() => { if (selectedTemplate) loadJadwal() }, [selectedTemplate, selectedRombel])

  const loadJadwal = async () => {
    const params: any = { template_id: selectedTemplate }
    if (selectedRombel) params.rombel_id = selectedRombel
    const res = await api.get('/jadwal-ujian', { params })
    setJadwal(res.data)
  }

  const getSlot = (h: string, jam: string) => jadwal.find(j => j.hari === h && j.jam_mulai === jam)

  const jamSet = Array.from(new Set(jadwal.map(j => j.jam_mulai))).sort()

  const openModal = (hari: string, jamMulai?: string) => {
    setForm({ mapel_id: '', gtk_id: '', hari, jam_mulai: jamMulai || '07:30', jam_selesai: '08:15', ruangan: '' })
    setShowModal(true)
  }

  const save = async () => {
    if (!selectedTemplate) return toast.error('Pilih template ujian dulu')
    if (!selectedRombel) return toast.error('Pilih rombel dulu')
    setSaving(true)
    try {
      await api.post('/jadwal-ujian', {
        template_id: selectedTemplate, rombel_id: selectedRombel,
        mapel_id: form.mapel_id || null, gtk_id: form.gtk_id || null,
        hari: form.hari, jam_mulai: form.jam_mulai, jam_selesai: form.jam_selesai, ruangan: form.ruangan,
      })
      toast.success('Jadwal ujian tersimpan')
      setShowModal(false)
      loadJadwal()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan jadwal ujian')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Hapus slot jadwal ujian ini?')) return
    try {
      await api.delete(`/jadwal-ujian/${id}`)
      toast.success('Terhapus')
      loadJadwal()
    } catch { toast.error('Gagal menghapus') }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <ClipboardCheck className="text-amber-600" size={24} />
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Jadwal Ujian</h1>
          <p className="text-xs text-slate-500">Jadwal khusus mode ujian &mdash; terpisah dari Jadwal Pelajaran reguler, tidak dicek bentrok terhadapnya. Saat Kalender KBM tanggal tertentu diset jenis "ujian", jadwal hari itu otomatis memakai data dari sini.</p>
        </div>
      </div>

      {templates.length === 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          Belum ada Template Jadwal berjenis "ujian". Buat dulu di menu Jadwal Pelajaran &rarr; Template Jadwal.
        </div>
      )}

      {templates.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <select className="input" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
              {templates.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
            </select>
            <select className="input" value={selectedRombel} onChange={e => setSelectedRombel(e.target.value)}>
              {rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
            </select>
            <button onClick={() => openModal('senin')} className="btn-primary flex items-center gap-1">
              <Plus size={16} /> Tambah Slot
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th className="p-2 text-left">Jam</th>
                  {SEMUA_HARI.map(h => <th key={h} className="p-2 text-left capitalize">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {jamSet.length === 0 && (
                  <tr><td colSpan={8} className="p-4 text-center text-slate-400">Belum ada jadwal ujian untuk rombel ini. Klik "Tambah Slot".</td></tr>
                )}
                {jamSet.map(jam => (
                  <tr key={jam} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="p-2 font-medium">{jam}</td>
                    {SEMUA_HARI.map(h => {
                      const slot = getSlot(h, jam)
                      return (
                        <td key={h} className="p-2">
                          {slot ? (
                            <div className="group relative rounded bg-amber-50 p-1.5 dark:bg-amber-900/20">
                              <div className="font-semibold">{slot.mapel_nama || '-'}</div>
                              <div className="text-slate-500">{slot.guru_nama || <span className="text-red-500">Guru belum diisi</span>}</div>
                              <button onClick={() => remove(slot.id)} className="absolute right-1 top-1 hidden text-red-500 group-hover:block">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => openModal(h, jam)} className="text-slate-300 hover:text-amber-600">
                              <Plus size={14} />
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Tambah Slot Jadwal Ujian</h2>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Hari</label>
                <select className="input w-full" value={form.hari} onChange={e => setForm({ ...form, hari: e.target.value })}>
                  {SEMUA_HARI.map(h => <option key={h} value={h} className="capitalize">{h}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium">Jam Mulai</label>
                  <input type="time" className="input w-full" value={form.jam_mulai} onChange={e => setForm({ ...form, jam_mulai: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Jam Selesai</label>
                  <input type="time" className="input w-full" value={form.jam_selesai} onChange={e => setForm({ ...form, jam_selesai: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Mata Pelajaran (opsional)</label>
                <select className="input w-full" value={form.mapel_id} onChange={e => setForm({ ...form, mapel_id: e.target.value })}>
                  <option value="">- Tidak diisi -</option>
                  {mapels.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Guru Pengawas (boleh beda dari guru mapel)</label>
                <select className="input w-full" value={form.gtk_id} onChange={e => setForm({ ...form, gtk_id: e.target.value })}>
                  <option value="">- Tidak diisi -</option>
                  {gtks.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Ruangan</label>
                <input className="input w-full" value={form.ruangan} onChange={e => setForm({ ...form, ruangan: e.target.value })} placeholder="Ruang I" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Batal</button>
              <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Menyimpan...' : 'Simpan'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
