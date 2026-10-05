import { useEffect, useMemo, useState } from 'react'
import { Moon, Sun, Sunrise } from 'lucide-react'
import api from '../services/api'

// Urutan waktu sholat untuk kartu jadwal.
const SHOLAT: Array<[string, string]> = [
  ['subuh', 'Subuh'], ['syuruq', 'Terbit'], ['dzuhur', 'Dzuhur'],
  ['ashar', 'Ashar'], ['maghrib', 'Maghrib'], ['isya', 'Isya'],
]
const IKON_SHOLAT: Record<string, any> = {
  subuh: Sunrise, syuruq: Sun, dzuhur: Sun, ashar: Sun, maghrib: Moon, isya: Moon,
}

function menitSekarang(): number {
  const wib = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())
  const [h, m] = wib.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function keMenit(t?: string | null): number {
  if (!t) return -1
  const [h, m] = String(t).split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (m || 0) : -1
}

/**
 * Kartu Jadwal Sholat hari ini (koordinat lembaga dari Pengaturan).
 * Dipakai bersama oleh dashboard admin, guru, dan bendahara supaya tampilannya
 * identik. Jadwal dihitung di server — komponen ini hanya menampilkan.
 */
export default function JadwalSholatCard() {
  const [sholat, setSholat] = useState<any>(null)

  useEffect(() => {
    api.get('/jadwal-sholat').then(r => setSholat(r.data)).catch(() => setSholat(null))
  }, [])

  const berikutnya = useMemo(() => {
    if (!sholat) return null
    const cur = menitSekarang()
    for (const [key] of SHOLAT) {
      if (keMenit(sholat[key]) >= cur) return key
    }
    return null
  }, [sholat])

  return (
    <section data-jadwal-sholat-card="true" className="rounded-3xl bg-white p-4 shadow-sm dark:bg-gray-900">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Sunrise size={16} className="shrink-0 text-emerald-600" /> Jadwal Sholat
          </h2>
          <p className="mt-0.5 break-words text-[11px] text-slate-400">
            {sholat ? `${sholat.kota}${sholat.provinsi ? `, ${sholat.provinsi}` : ''} · ${sholat.hari}, ${sholat.tanggal}` : 'Memuat jadwal…'}
          </p>
        </div>
        {berikutnya && sholat?.[berikutnya] && (
          <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
            Berikutnya {String(sholat[berikutnya])}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {SHOLAT.map(([key, label]) => {
          const Icon = IKON_SHOLAT[key] || Sun
          const aktif = berikutnya === key
          return (
            <div
              key={key}
              className={`rounded-xl border px-2 py-2 text-center ${aktif ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-100 dark:border-gray-800'}`}
            >
              <Icon size={14} className={`mx-auto ${aktif ? 'text-emerald-600' : 'text-slate-400'}`} />
              <p className="mt-1 break-words text-[10px] font-medium uppercase text-slate-500">{label}</p>
              <p className={`text-sm font-bold tabular-nums ${aktif ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'}`}>
                {sholat?.[key] || '--:--'}
              </p>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">
        {sholat?.sumber ? 'Dihitung dari koordinat lembaga (atur kota di Pengaturan)' : 'Atur kota lembaga di Pengaturan untuk jadwal yang akurat'}
      </p>
    </section>
  )
}
