import { useState, useEffect } from 'react'
import { Plus, Trash2, X, ClipboardCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { PageHeader, Card, Button, Badge } from '../../components/ui'

interface JadwalUjian {
  id: string; template_id: string; mapel_id: string | null; rombel_id: string; gtk_id: string | null
  hari: string; jam_mulai: string; jam_selesai: string; ruangan: string
  mapel_nama?: string; rombel_nama?: string; guru_nama?: string; guru_valid: boolean | number
}

const SEMUA_HARI = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'] as const
const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'

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
    <div className="space-y-6">
      <PageHeader
        title="Jadwal Ujian"
        subtitle='Jadwal khusus mode ujian, terpisah dari Jadwal Pelajaran reguler dan tidak dicek bentrok terhadapnya. Saat Kalender KBM suatu tanggal diset jenis "ujian", jadwal hari itu otomatis memakai data dari sini.'
        actions={templates.length > 0 && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => openModal('senin')}>Tambah Slot</Button>
        )}
      />

      {templates.length === 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Belum ada Template Jadwal berjenis "ujian". Buat dulu di menu <strong>Jadwal Pelajaran &rarr; Kelola Jadwal &rarr; Template Jadwal</strong>.
          </p>
        </Card>
      )}

      {templates.length > 0 && (
        <>
          <Card>
            <div className="flex flex-wrap gap-3">
              <div className="min-w-[180px] flex-1">
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Template Ujian</label>
                <select className={inputCls} value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
                </select>
              </div>
              <div className="min-w-[180px] flex-1">
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Rombel</label>
                <select className={inputCls} value={selectedRombel} onChange={e => setSelectedRombel(e.target.value)}>
                  {rombels.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
                </select>
              </div>
            </div>
          </Card>

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="p-2.5 text-left font-semibold text-gray-600 dark:text-gray-300">Jam</th>
                  {SEMUA_HARI.map(h => <th key={h} className="p-2.5 text-left font-semibold capitalize text-gray-600 dark:text-gray-300">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {jamSet.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-400 dark:text-gray-500">Belum ada jadwal ujian untuk rombel ini. Klik "Tambah Slot".</td></tr>
                )}
                {jamSet.map(jam => (
                  <tr key={jam} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="p-2.5 font-medium text-gray-700 dark:text-gray-200">{jam}</td>
                    {SEMUA_HARI.map(h => {
                      const slot = getSlot(h, jam)
                      return (
                        <td key={h} className="p-2">
                          {slot ? (
                            <div className="group relative rounded-lg border border-primary/20 bg-primary/5 p-2 dark:border-primary-light/20 dark:bg-primary-light/10">
                              <div className="truncate text-[11px] font-semibold text-gray-800 dark:text-gray-100">{slot.mapel_nama || '-'}</div>
                              <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                                {slot.guru_nama || <Badge tone="red">Guru belum diisi</Badge>}
                              </div>
                              <button onClick={() => remove(slot.id)} className="absolute right-1 top-1 hidden rounded p-0.5 text-red-500 hover:bg-red-50 group-hover:block dark:hover:bg-red-900/30">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => openModal(h, jam)} className="flex h-full w-full items-center justify-center rounded-lg py-2 text-gray-300 hover:bg-primary/5 hover:text-primary dark:text-gray-600">
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
          </Card>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display font-bold text-gray-800 dark:text-gray-100">Tambah Slot Jadwal Ujian</h2>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Hari</label>
                <select className={inputCls} value={form.hari} onChange={e => setForm({ ...form, hari: e.target.value })}>
                  {SEMUA_HARI.map(h => <option key={h} value={h} className="capitalize">{h}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Jam Mulai</label>
                  <input type="time" className={inputCls} value={form.jam_mulai} onChange={e => setForm({ ...form, jam_mulai: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Jam Selesai</label>
                  <input type="time" className={inputCls} value={form.jam_selesai} onChange={e => setForm({ ...form, jam_selesai: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Mata Pelajaran (opsional)</label>
                <select className={inputCls} value={form.mapel_id} onChange={e => setForm({ ...form, mapel_id: e.target.value })}>
                  <option value="">- Tidak diisi -</option>
                  {mapels.map(m => <option key={m.id} value={m.id}>{m.nama}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Guru Pengawas (boleh beda dari guru mapel)</label>
                <select className={inputCls} value={form.gtk_id} onChange={e => setForm({ ...form, gtk_id: e.target.value })}>
                  <option value="">- Tidak diisi -</option>
                  {gtks.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Ruangan</label>
                <input className={inputCls} value={form.ruangan} onChange={e => setForm({ ...form, ruangan: e.target.value })} placeholder="Ruang I" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowModal(false)}>Batal</Button>
              <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
