import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, TrendingUp, RefreshCw, AlertTriangle, CheckCircle2, ArrowRight, ExternalLink
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import api from '../../services/api'
import { PageHeader, Card, Badge, Button } from '../../components/ui'

/**
 * Halaman khusus monitoring kelengkapan data lembaga.
 *
 * Sengaja dipisah dari dashboard supaya dashboard tetap jadi ringkasan
 * operasional harian, sedangkan halaman ini fokus ke "data apa yang belum
 * diisi" plus tautan langsung ke menu pengisiannya.
 */

type Item = {
  key: string
  label: string
  filled: number
  total: number
  persen: number
  status: string
  detail?: string
  tautan?: string
  tautan_label?: string
  perlu_tindakan?: boolean
  entri?: number
  entri_kosong?: number
  tindakan_lain?: { label: string; tautan: string; jumlah: number }[]
}

type Prioritas = {
  key: string
  label: string
  persen: number
  detail: string
  tautan: string
  tautan_label: string
}

type Kelengkapan = {
  items: Item[]
  skor_keseluruhan: number
  status_keseluruhan: string
  jumlah_lengkap: number
  jumlah_item: number
  jumlah_perlu_tindakan?: number
  prioritas?: Prioritas[]
  dihitung_pada?: string
}

const STATUS_META: Record<string, { badge: 'green' | 'blue' | 'yellow' | 'red' | 'gray'; bar: string; teks: string }> = {
  lengkap: { badge: 'green', bar: 'bg-emerald-500', teks: 'Lengkap' },
  hampir: { badge: 'blue', bar: 'bg-blue-500', teks: 'Hampir lengkap' },
  belum_lengkap: { badge: 'yellow', bar: 'bg-amber-500', teks: 'Belum lengkap' },
  kosong: { badge: 'red', bar: 'bg-red-500', teks: 'Kosong' },
}

const meta = (status: string) => STATUS_META[status] || STATUS_META.kosong

const CHART_COLORS: Record<string, string> = {
  lengkap: '#10b981',
  hampir: '#3b82f6',
  belum_lengkap: '#f59e0b',
  kosong: '#ef4444',
}

const formatTanggal = (iso?: string) => {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

export default function MonitoringDataPage() {
  const [data, setData] = useState<Kelengkapan | null>(null)
  const [loading, setLoading] = useState(true)
  const [gagal, setGagal] = useState(false)

  const muat = useCallback(() => {
    setLoading(true)
    setGagal(false)
    api.get('/dashboard/kelengkapan')
      .then(res => setData(res.data))
      .catch(() => setGagal(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { muat() }, [muat])

  const items = data?.items || []
  const prioritas = (data?.prioritas || []).filter(p => p.tautan)
  const belum = data?.jumlah_perlu_tindakan ?? items.filter(i => i.perlu_tindakan !== false && i.persen < 100).length
  const skor = data?.skor_keseluruhan ?? 0
  const skorMeta = meta(data?.status_keseluruhan || 'kosong')

  const chartData = items.map(i => ({ nama: i.label, persen: i.persen, status: i.status }))

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        title="Monitoring Kelengkapan Data"
        subtitle="Pantau data lembaga yang sudah terisi dan mana yang masih kosong"
        actions={
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={muat} disabled={loading}>
            {loading ? 'Memuat…' : 'Muat ulang'}
          </Button>
        }
      />

      {loading && !data && (
        <Card><p className="text-sm text-gray-500 py-6 text-center">Menghitung kelengkapan data…</p></Card>
      )}

      {!loading && gagal && (
        <Card>
          <div className="py-6 text-center">
            <p className="text-sm text-gray-600">Gagal memuat data kelengkapan.</p>
            <Button className="mt-3" icon={<RefreshCw size={16} />} onClick={muat}>Coba lagi</Button>
          </div>
        </Card>
      )}

      {!loading && !gagal && data && (
        <>
          {/* Ringkasan skor keseluruhan */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Card>
              <p className="text-xs text-gray-500 mb-1">Skor Kelengkapan</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-gray-800 dark:text-gray-100">{skor}%</span>
                <Badge tone={skorMeta.badge}>{skorMeta.teks}</Badge>
              </div>
              <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full ${skorMeta.bar}`} style={{ width: `${skor}%` }} />
              </div>
            </Card>
            <Card>
              <p className="text-xs text-gray-500 mb-1">Komponen Lengkap</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-gray-800 dark:text-gray-100">
                  {data.jumlah_lengkap}<span className="text-lg text-gray-400">/{data.jumlah_item}</span>
                </span>
                <CheckCircle2 size={20} className="text-emerald-600 mb-1" />
              </div>
              <p className="text-xs text-gray-500 mt-3">Komponen data yang sudah 100% terisi</p>
            </Card>
            <Card>
              <p className="text-xs text-gray-500 mb-1">Perlu Tindakan</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-gray-800 dark:text-gray-100">{belum}</span>
                <AlertTriangle size={20} className={belum > 0 ? 'text-amber-500 mb-1' : 'text-emerald-600 mb-1'} />
              </div>
              <p className="text-xs text-gray-500 mt-3">
                {belum > 0 ? 'Komponen yang masih perlu dilengkapi' : 'Semua komponen sudah lengkap'}
              </p>
            </Card>
          </div>

          {/* Daftar prioritas: yang paling tertinggal di atas */}
          {prioritas.length > 0 && (
            <Card
              title="Perlu Tindakan — urut dari yang paling tertinggal"
              icon={<AlertTriangle size={18} className="text-amber-500" />}
              className="mb-4"
            >
              <div className="space-y-2">
                {prioritas.map(p => {
                  const m = meta(p.persen === 0 ? 'kosong' : p.persen >= 75 ? 'hampir' : p.persen >= 25 ? 'belum_lengkap' : 'kosong')
                  return (
                    <div
                      key={p.key}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-lg border border-gray-100 dark:border-gray-800 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{p.label}</span>
                          <span className={`text-xs font-semibold ${p.persen === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                            {p.persen}%
                          </span>
                          {m.badge === 'red' && <Badge tone="red">Kosong</Badge>}
                        </div>
                        {p.detail && <p className="text-xs text-gray-500 mt-0.5">{p.detail}</p>}
                      </div>
                      <Link
                        to={p.tautan}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-white text-sm font-medium px-3 py-2 shrink-0 active:scale-95 transition"
                      >
                        {p.tautan_label || 'Buka menu'}
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Grafik batang semua komponen */}
          <Card
            title="Kelengkapan per Komponen"
            icon={<TrendingUp size={18} className="text-indigo-600" />}
            className="mb-4"
          >
            <div style={{ width: '100%', height: Math.max(220, chartData.length * 34) }}>
              <ResponsiveContainer>
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="nama" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => `${v}%`} />
                  <Bar dataKey="persen" radius={[0, 4, 4, 0]}>
                    {chartData.map(entry => (
                      <Cell key={entry.nama} fill={CHART_COLORS[entry.status] || '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Rincian semua komponen + tautan pengisian */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map(item => {
              const m = meta(item.status)
              return (
                <Card key={item.key}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{item.label}</p>
                      <p className="text-xs text-gray-500">
                        {item.filled} dari {item.total}
                      </p>
                    </div>
                    <Badge tone={m.badge}>{m.teks}</Badge>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full ${m.bar}`} style={{ width: `${item.persen}%` }} />
                  </div>
                  {item.detail && <p className="text-xs text-gray-500 mt-2">{item.detail}</p>}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {item.tautan && (
                      <Link
                        to={item.tautan}
                        className={
                          'inline-flex items-center gap-1.5 rounded-lg text-sm font-medium px-3 py-2 active:scale-95 transition ' +
                          (item.persen < 100
                            ? 'bg-primary text-white'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50')
                        }
                      >
                        {item.tautan_label || 'Buka menu'}
                        <ExternalLink size={14} />
                      </Link>
                    )}
                    {item.tindakan_lain?.map(t => (
                      <Link
                        key={t.tautan}
                        to={t.tautan}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-sm font-medium px-3 py-2 active:scale-95 transition"
                      >
                        {t.label}{t.jumlah ? ` (${t.jumlah})` : ''}
                        <ArrowRight size={14} />
                      </Link>
                    ))}
                  </div>
                </Card>
              )
            })}
          </div>

          <p className="text-xs text-gray-400 mt-4 flex items-center gap-1.5">
            <Activity size={13} />
            Dihitung {formatTanggal(data.dihitung_pada) || 'baru saja'} · Absensi dihitung untuk hari berjalan (WIB)
          </p>
        </>
      )}
    </div>
  )
}