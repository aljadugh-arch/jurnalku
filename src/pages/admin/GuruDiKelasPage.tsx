import { useCallback, useEffect, useState } from 'react'
import { Search, MapPin, Clock, UserCheck, AlertCircle, BookOpen, Loader2 } from 'lucide-react'
import api from '../../services/api'

type Slot = {
  id: string
  jam_mulai: string
  jam_selesai: string
  mapel: string | null
  rombel: string | null
  ruangan: string | null
  status: 'berlangsung' | 'selesai' | 'akan_datang'
  terkonfirmasi: boolean
  sesi: {
    waktu_masuk: string; waktu_selesai: string | null; status: string; menit_terlambat: number;
    geo_scope: string; jarak_meter: number | null; akurasi_meter: number | null;
    qr_verified: boolean; qr_at: string | null;
  } | null
  jurnal_terisi: boolean
}

type Guru = {
  gtk_id: string
  nama: string
  nip: string
  kehadiran: { status: string; jam_masuk: string | null; jam_pulang: string | null }
  sedang_mengajar: Slot | null
  berikutnya: Slot | null
  jumlah_jam: number
  jadwal: Slot[]
}

type Jawaban = { tanggal: string; hari: string; jam_sekarang: string; hasil: Guru[] }

const statusKelas = (s: Slot['status']) =>
  s === 'berlangsung' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : s === 'selesai' ? 'bg-gray-100 text-gray-500 border-gray-200'
      : 'bg-sky-50 text-sky-700 border-sky-200'

const labelKelas = (s: Slot['status']) => s === 'berlangsung' ? 'Sedang berlangsung' : s === 'selesai' ? 'Selesai' : 'Akan datang'

const statusHadir = (k: string) =>
  k === 'hadir' ? 'bg-emerald-50 text-emerald-700'
    : k === 'terlambat' ? 'bg-amber-50 text-amber-700'
      : 'bg-rose-50 text-rose-700'

const labelHadir = (k: string) => k === 'hadir' ? 'Sudah ceklok' : k === 'terlambat' ? 'Ceklok terlambat' : 'Belum ceklok'

export default function GuruDiKelasPage() {
  const [q, setQ] = useState('')
  const [tanggal, setTanggal] = useState('')
  const [data, setData] = useState<Jawaban | null>(null)
  const [memuat, setMemuat] = useState(false)
  const [galat, setGalat] = useState('')

  const cari = useCallback(async (nama: string, tgl: string) => {
    setMemuat(true); setGalat('')
    try {
      const r = await api.get('/monitoring/guru-di-kelas', { params: { q: nama, ...(tgl ? { tanggal: tgl } : {}) }, timeout: 20000 })
      setData(r.data)
    } catch (e: any) {
      setGalat(e.response?.data?.error || 'Gagal memuat data guru.')
    } finally { setMemuat(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { void cari(q.trim(), tanggal) }, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [q, tanggal, cari])

  const hasil = data?.hasil || []

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-gray-900">Guru di Kelas</h1>
        <p className="text-sm text-gray-500">
          Cari nama guru untuk melihat kelas yang sedang diampu, jadwal hari ini, kehadiran, dan status jurnal.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Ketik nama guru…"
              className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
              autoFocus
            />
          </div>
          <input
            type="date"
            value={tanggal || data?.tanggal || ''}
            onChange={e => setTanggal(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm sm:w-44"
            title="Tanggal (kosongkan untuk hari ini)"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1"><Clock size={12} /> Sekarang {data?.jam_sekarang || '—'} WIB</span>
          <span className="capitalize">{data?.hari || ''}{data?.tanggal ? `, ${data.tanggal}` : ''}</span>
          {memuat && <span className="inline-flex items-center gap-1 text-gray-400"><Loader2 size={12} className="animate-spin" /> mencari…</span>}
        </div>
      </div>

      {galat && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle size={15} /> {galat}
        </div>
      )}

      {!galat && hasil.length === 0 && !memuat && (
        <p className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
          {q ? `Tidak ada guru bernama "${q}" pada tanggal ini.` : 'Belum ada guru yang mengajar pada tanggal ini.'}
        </p>
      )}

      <div className="space-y-3">
        {hasil.map(g => (
          <div key={g.gtk_id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{g.nama}</p>
                <p className="text-xs text-gray-400">{g.nip ? `NIP ${g.nip}` : 'Tanpa NIP'} · {g.jumlah_jam} jam hari ini</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusHadir(g.kehadiran.status)}`}>
                {labelHadir(g.kehadiran.status)}{g.kehadiran.jam_masuk ? ` · ${g.kehadiran.jam_masuk.slice(0, 5)}` : ''}
              </span>
            </div>

            {g.sedang_mengajar ? (
              <div className={`mt-3 rounded-lg border px-3 py-2 ${g.sedang_mengajar.terkonfirmasi ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                <p className={`text-[11px] font-bold uppercase tracking-wide ${g.sedang_mengajar.terkonfirmasi ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {g.sedang_mengajar.terkonfirmasi ? 'Sedang di kelas · terkonfirmasi' : 'Menurut jadwal · belum konfirmasi masuk kelas'}
                </p>
                <p className={`mt-0.5 text-sm font-semibold ${g.sedang_mengajar.terkonfirmasi ? 'text-emerald-900' : 'text-amber-900'}`}>
                  {g.sedang_mengajar.rombel || 'Tanpa rombel'} · {g.sedang_mengajar.mapel || 'Kegiatan'}
                </p>
                <p className={`mt-0.5 flex flex-wrap items-center gap-2 text-xs ${g.sedang_mengajar.terkonfirmasi ? 'text-emerald-800' : 'text-amber-800'}`}>
                  <span className="inline-flex items-center gap-1"><Clock size={12} /> {g.sedang_mengajar.jam_mulai}–{g.sedang_mengajar.jam_selesai}</span>
                  {g.sedang_mengajar.ruangan && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {g.sedang_mengajar.ruangan}</span>}
                  <span className={g.sedang_mengajar.jurnal_terisi ? 'text-emerald-700' : 'text-amber-700'}>
                    {g.sedang_mengajar.jurnal_terisi ? 'Jurnal sudah diisi' : 'Jurnal belum diisi'}
                  </span>
                  {g.sedang_mengajar.terkonfirmasi && g.sedang_mengajar.sesi && (
                    <span className="rounded bg-white/70 px-1.5 py-0.5 font-semibold">
                      Masuk {String(g.sedang_mengajar.sesi.waktu_masuk).slice(0, 5)}
                      {g.sedang_mengajar.sesi.qr_verified ? ' · QR ruang ✓' : ''}
                      {!g.sedang_mengajar.sesi.qr_verified && g.sedang_mengajar.sesi.geo_scope ? ` · ${g.sedang_mengajar.sesi.geo_scope}` : ''}
                      {!g.sedang_mengajar.sesi.qr_verified && g.sedang_mengajar.sesi.jarak_meter != null ? ` · ${g.sedang_mengajar.sesi.jarak_meter} m` : ''}
                      {!g.sedang_mengajar.sesi.qr_verified && g.sedang_mengajar.sesi.akurasi_meter != null ? ` (±${g.sedang_mengajar.sesi.akurasi_meter} m)` : ''}
                    </span>
                  )}
                </p>
              </div>
            ) : g.berikutnya ? (
              <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                Berikutnya: {g.berikutnya.jam_mulai}–{g.berikutnya.jam_selesai} · {g.berikutnya.rombel || '—'} · {g.berikutnya.mapel || 'Kegiatan'}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                Tidak ada jam mengajar pada tanggal ini.
              </div>
            )}

            {g.jadwal.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {g.jadwal.map(s => (
                  <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5">
                    <span className="w-[92px] shrink-0 text-xs font-semibold tabular-nums text-gray-600">{s.jam_mulai}–{s.jam_selesai}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                      {s.rombel || '—'} · {s.mapel || 'Kegiatan'}
                    </span>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusKelas(s.status)}`}>{labelKelas(s.status)}</span>
                    <span className={`shrink-0 text-[10px] font-semibold ${s.terkonfirmasi ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {s.terkonfirmasi
                        ? `${s.sesi?.qr_verified ? '✓ QR' : '✓ masuk'} ${String(s.sesi?.waktu_masuk || '').slice(0, 5)}`
                        : 'belum masuk kelas'}
                    </span>
                    {s.status !== 'akan_datang' && (
                      <span className={`shrink-0 text-[10px] font-medium ${s.jurnal_terisi ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {s.jurnal_terisi ? '✓ jurnal' : 'jurnal belum'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="px-1 text-[11px] leading-5 text-gray-400">
        "Terkonfirmasi" berarti guru sudah menekan tombol Masuk Kelas untuk jam itu. Bukti bisa berupa pindai QR ruang (paling kuat)
        atau GPS (jarak + akurasi yang dilaporkan perangkat).
        Tanpa konfirmasi, status hanya perkiraan dari jam jadwal. Kehadiran diambil dari ceklok guru pada tanggal tersebut.
      </p>
    </div>
  )
}
