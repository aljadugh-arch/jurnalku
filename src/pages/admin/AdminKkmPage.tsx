import { useState, useEffect } from 'react'
import api from '../../services/api'
import { Save, RotateCcw, Info } from 'lucide-react'

type MapelKkm = {
  mapel_id: string
  mapel_nama: string
  mapel_kelompok: string
  kkm_umum: number | null
  per_tingkat: { tingkat: string; kkm: number | null }[]
}

type KkmData = {
  tingkat: string[]
  mapel: MapelKkm[]
  default: { merdeka: number; k13: number }
}

export default function AdminKkmPage() {
  const [data, setData] = useState<KkmData | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  // Draft edit lokal: key `${mapel_id}::${tingkat}` ('' untuk umum) -> string nilai.
  const [draft, setDraft] = useState<Record<string, string>>({})

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/rapor/kkm')
      setData(data)
      const d: Record<string, string> = {}
      for (const m of data.mapel) {
        if (m.kkm_umum != null) d[`${m.mapel_id}::`] = String(m.kkm_umum)
        for (const t of m.per_tingkat) {
          if (t.kkm != null) d[`${m.mapel_id}::${t.tingkat}`] = String(t.kkm)
        }
      }
      setDraft(d)
    } catch (e: any) {
      setMsg(`✗ ${e.response?.data?.error || 'Gagal memuat KKM'}`)
    } finally { setLoading(false) }
  }

  const nilaiDraft = (mapelId: string, tingkat: string, fallback: number) => {
    const v = draft[`${mapelId}::${tingkat}`]
    if (v === undefined || v === '') return String(fallback)
    return v
  }

  const simpan = async (mapelId: string, tingkat: string) => {
    const raw = draft[`${mapelId}::${tingkat}`]
    if (raw === undefined) return
    const kkm = Number(raw)
    if (!Number.isFinite(kkm) || kkm < 0 || kkm > 100) {
      setMsg(`✗ KKM harus angka 0-100 (${raw})`)
      return
    }
    setSaving(true); setMsg('')
    try {
      await api.put('/rapor/kkm', { mapel_id: mapelId, tingkat, kkm })
      setMsg(`✓ KKM tersimpan`)
    } catch (e: any) {
      setMsg(`✗ ${e.response?.data?.error || 'Gagal menyimpan KKM'}`)
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-800 dark:text-white">Atur KKM (Kriteria Ketuntasan Minimal)</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          Tetapkan batas tuntas per mata pelajaran. Nilai <b>Umum</b> berlaku ke semua tingkat; isi kolom
          tingkat (mis. VII, VIII) hanya bila KKM jenjang itu berbeda.
        </p>
      </div>

      {msg && (
        <div className={`rounded-lg p-4 text-sm ${msg.startsWith('✓') ? 'bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400'}`}>
          {msg}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        {loading && <div className="text-center py-12 text-gray-400">Memuat data...</div>}
        {!loading && data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Mata Pelajaran</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300 w-32">
                    KKM Umum
                    <div className="text-[11px] font-normal text-gray-400">semua tingkat</div>
                  </th>
                  {data.tingkat.map(t => (
                    <th key={t} className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300 w-28">KKM {t}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.mapel.map(m => (
                  <tr key={m.mapel_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{m.mapel_nama}</div>
                      <div className="text-[11px] text-gray-400">{m.mapel_kelompok}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <input
                          type="number" min={0} max={100}
                          value={nilaiDraft(m.mapel_id, '', data.default.merdeka)}
                          onChange={e => setDraft({ ...draft, [`${m.mapel_id}::`]: e.target.value })}
                          onBlur={() => simpan(m.mapel_id, '')}
                          className="w-20 px-2 py-1.5 text-center border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                    </td>
                    {data.tingkat.map(t => (
                      <td key={t} className="px-4 py-3 text-center">
                        <input
                          type="number" min={0} max={100}
                          placeholder={String(data.default.merdeka)}
                          value={nilaiDraft(m.mapel_id, t, data.default.merdeka)}
                          onChange={e => setDraft({ ...draft, [`${m.mapel_id}::${t}`]: e.target.value })}
                          onBlur={() => simpan(m.mapel_id, t)}
                          className="w-20 px-2 py-1.5 text-center border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 p-3 text-sm text-blue-700 dark:text-blue-400">
        <Info size={16} className="mt-0.5 flex-shrink-0" />
        <div>
          Nilai disimpan otomatis saat kolom kehilangan fokus. Bawaan bila kosong:
          Kurikulum Merdeka <b>{data?.default.merdeka ?? 70}</b>, K-13 <b>{data?.default.k13 ?? 75}</b>.
          Kolom tingkat yang dibiarkan kosong memakai nilai KKM Umum.
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={load} disabled={saving}
          className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50">
          <RotateCcw size={16} /> Muat Ulang
        </button>
      </div>
    </div>
  )
}
