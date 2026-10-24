import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  School, ChevronDown, PlayCircle, Shield, Globe, GraduationCap,
  Wallet, Users, BookOpen, ImageOff, ListChecks, StickyNote, Clapperboard
} from 'lucide-react'
import api from '../services/api'
import PublicShell from '../components/PublicShell'

interface Bagian {
  id: string
  judul: string
  langkah: string[]
  catatan?: string
  gambar?: string
  video?: string
}
interface Kelompok {
  key: string
  nama: string
  icon: string
  ringkas: string
  bagian: Bagian[]
}

const IKON: Record<string, any> = {
  School, Shield, Globe, GraduationCap, Wallet, Users, BookOpen,
}

/** Ubah tautan YouTube apa pun (watch/short/embed) menjadi URL embed. */
function embedYoutube(url: string): string {
  if (!url) return ''
  const cocok = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/)
  return cocok ? `https://www.youtube.com/embed/${cocok[1]}` : url
}

/** Gambar panduan dengan penanganan berkas belum tersedia. */
function GambarPanduan({ src, alt }: { src?: string; alt: string }) {
  const [gagal, setGagal] = useState(false)
  if (!src || gagal) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed sk-border-soft sk-bg-subtle py-8 text-xs sk-txt-muted">
        <ImageOff size={16} /> Gambar panduan belum tersedia
      </div>
    )
  }
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block">
      <img src={src} alt={alt} onError={() => setGagal(true)}
        className="w-full rounded-lg border sk-border-soft hover:border-[#f47b20]/50 transition" />
    </a>
  )
}

function BagianItem({ b }: { b: Bagian }) {
  const [buka, setBuka] = useState(false)
  return (
    <div className="rounded-xl border sk-border-soft sk-card overflow-hidden">
      <button onClick={() => setBuka(!buka)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:sk-bg-subtle">
        <span className="flex items-center gap-2 text-sm font-semibold sk-txt">
          <ListChecks size={16} className="sk-txt-accent shrink-0" /> {b.judul}
        </span>
        <ChevronDown size={17} className={`sk-txt-muted shrink-0 transition-transform ${buka ? 'rotate-180' : ''}`} />
      </button>
      {buka && (
        <div className="px-4 pb-4 pt-1 border-t sk-border-soft space-y-3">
          <ol className="list-decimal list-inside space-y-1.5 text-sm sk-txt-muted marker:sk-txt-accent marker:font-semibold">
            {b.langkah.map((l, i) => <li key={i} className="leading-relaxed">{l}</li>)}
          </ol>
          {b.catatan && (
            <div className="flex items-start gap-2 rounded-lg sk-bg-soft border sk-border-accent px-3 py-2 text-xs sk-txt">
              <StickyNote size={14} className="mt-0.5 shrink-0" /> <span>{b.catatan}</span>
            </div>
          )}
          {b.video && (
            <div className="aspect-video rounded-lg overflow-hidden border sk-border-soft">
              <iframe src={embedYoutube(b.video)} title={`Video: ${b.judul}`} allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                className="w-full h-full" />
            </div>
          )}
          <GambarPanduan src={b.gambar} alt={b.judul} />
        </div>
      )}
    </div>
  )
}

export default function PanduanPage() {
  const [kelompok, setKelompok] = useState<Kelompok[]>([])
  const [aktif, setAktif] = useState('')
  const [memuat, setMemuat] = useState(true)

  useEffect(() => {
    api.get('/panduan')
      .then(({ data }) => {
        const k = data.kelompok || []
        setKelompok(k)
        setAktif(k[0]?.key || '')
      })
      .catch(() => setKelompok([]))
      .finally(() => setMemuat(false))
  }, [])

  const kini = kelompok.find(k => k.key === aktif)
  const totalBagian = kelompok.reduce((s, k) => s + k.bagian.length, 0)

  return (
    <PublicShell active="">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="text-center mb-8">
          <h1 className="mb-2 text-2xl font-extrabold tracking-tight sk-txt sm:text-3xl">Panduan Pengguna Jurnalku</h1>
          <p className="text-sm sk-txt-muted">
            Panduan lengkap {totalBagian} topik, dikelompokkan sesuai jenis pengguna — dari admin, guru, bendahara, kepala, sampai siswa.
          </p>
        </div>

        {memuat ? (
          <div className="py-16 text-center text-sm sk-txt-muted">Memuat panduan…</div>
        ) : !kelompok.length ? (
          <div className="py-16 text-center text-sm sk-txt-muted">Panduan sedang tidak tersedia. Coba muat ulang halaman.</div>
        ) : (
          <>
            {/* Menu kategori: GRID kartu (1 kolom HP, 2 kolom tablet, 3 kolom desktop).
                Sebelumnya pill `flex-wrap` sehingga menumpuk tak beraturan dan
                sulit dipindai. `items-stretch` + `h-full` membuat semua kartu dalam
                satu baris sama tinggi walau panjang ringkasnya berbeda. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-stretch gap-3 mb-8">
              {kelompok.map(k => {
                const Ikon = IKON[k.icon] || BookOpen
                const dipilih = k.key === aktif
                return (
                  <button
                    key={k.key}
                    onClick={() => setAktif(k.key)}
                    aria-pressed={dipilih}
                    className={`group flex h-full min-h-[112px] items-start gap-3 rounded-xl border p-4 text-left transition ${
                      dipilih
                        ? 'sk-border-accent sk-bg-soft shadow-sm'
                        : 'sk-border-soft sk-card hover:sk-border-accent hover:shadow-sm'
                    }`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${dipilih ? 'sk-bg-soft sk-txt-accent' : 'sk-bg-subtle sk-txt-muted group-hover:sk-txt-accent'}`}>
                      <Ikon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-bold ${dipilih ? 'sk-txt-accent' : 'sk-txt'}`}>{k.nama}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug sk-txt-muted line-clamp-2">{k.ringkas}</span>
                      <span className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${dipilih ? 'sk-bg-soft sk-txt-accent' : 'sk-bg-subtle sk-txt-muted'}`}>
                        {k.bagian.length} topik
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            {kini && (
              <div className="mb-5">
                <h2 className="text-lg font-bold sk-txt">{kini.nama}</h2>
                <p className="text-sm sk-txt-muted">{kini.ringkas}</p>
              </div>
            )}

            <div className="space-y-2.5">
              {kini?.bagian.map(b => <BagianItem key={b.id} b={b} />)}
            </div>
          </>
        )}

        <div className="mt-8 flex items-start gap-3 rounded-xl p-5 sk-txt" style={{ background: 'var(--sk-gradient)' }}>
          <Clapperboard size={26} className="shrink-0 mt-0.5 text-white" />
          <div>
            <p className="font-semibold text-sm text-white">Video Tutorial</p>
            <p className="text-xs text-white/85 mt-1">
              Video panduan akan ditampilkan langsung di dalam tiap topik begitu kanal YouTube lembaga/platform menerbitkannya.
              Setiap topik sudah menyediakan tempat pemutar video — cukup tautkan alamat videonya.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl sk-bg-soft border sk-border-accent p-6 text-center">
          <p className="text-sm sk-txt">Masih ada pertanyaan atau butuh bantuan?</p>
          <p className="text-sm sk-txt-muted mt-1">Coba akun demo di halaman utama untuk menjelajah semua fitur sebelum mendaftar.</p>
          <Link to="/register" className="sk-btn mt-4">
            Mulai Sekarang
          </Link>
        </div>
      </div>
    </PublicShell>
  )
}
