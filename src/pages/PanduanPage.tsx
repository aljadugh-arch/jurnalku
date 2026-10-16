import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  School, ChevronDown, ArrowLeft, PlayCircle, Shield, Globe, GraduationCap,
  Wallet, Users, BookOpen, ImageOff, ListChecks, StickyNote, Clapperboard
} from 'lucide-react'
import api from '../services/api'

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
      <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-8 text-xs text-gray-400">
        <ImageOff size={16} /> Gambar panduan belum tersedia
      </div>
    )
  }
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block">
      <img src={src} alt={alt} onError={() => setGagal(true)}
        className="w-full rounded-lg border border-gray-200 hover:border-primary/50 transition" />
    </a>
  )
}

function BagianItem({ b }: { b: Bagian }) {
  const [buka, setBuka] = useState(false)
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button onClick={() => setBuka(!buka)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <ListChecks size={16} className="text-primary shrink-0" /> {b.judul}
        </span>
        <ChevronDown size={17} className={`text-gray-400 shrink-0 transition-transform ${buka ? 'rotate-180' : ''}`} />
      </button>
      {buka && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-3">
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-600 marker:text-primary marker:font-semibold">
            {b.langkah.map((l, i) => <li key={i} className="leading-relaxed">{l}</li>)}
          </ol>
          {b.catatan && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <StickyNote size={14} className="mt-0.5 shrink-0" /> <span>{b.catatan}</span>
            </div>
          )}
          {b.video && (
            <div className="aspect-video rounded-lg overflow-hidden border border-gray-200">
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-gray-700 hover:text-primary font-semibold text-sm">
            <ArrowLeft size={18} /> Kembali ke Beranda
          </Link>
          <Link to="/register" className="px-4 py-1.5 bg-gray-900 text-white rounded-full text-xs font-semibold hover:bg-gray-800">
            Daftar Gratis
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-2">Panduan Pengguna Jurnalku</h1>
          <p className="text-gray-500 text-sm">
            Panduan lengkap {totalBagian} topik, dikelompokkan sesuai jenis pengguna — dari admin, guru, bendahara, kepala, sampai siswa.
          </p>
        </div>

        {memuat ? (
          <div className="text-center text-gray-400 py-16 text-sm">Memuat panduan…</div>
        ) : !kelompok.length ? (
          <div className="text-center text-gray-400 py-16 text-sm">Panduan sedang tidak tersedia. Coba muat ulang halaman.</div>
        ) : (
          <>
            {/* Tab jenis pengguna */}
            <div className="flex flex-wrap gap-2 mb-6 justify-center">
              {kelompok.map(k => {
                const Ikon = IKON[k.icon] || BookOpen
                const dipilih = k.key === aktif
                return (
                  <button key={k.key} onClick={() => setAktif(k.key)}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition ${dipilih ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'}`}>
                    <Ikon size={16} /> {k.nama}
                    <span className={`text-xs rounded-full px-1.5 ${dipilih ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>{k.bagian.length}</span>
                  </button>
                )
              })}
            </div>

            {kini && (
              <div className="mb-5">
                <h2 className="text-lg font-bold text-gray-800">{kini.nama}</h2>
                <p className="text-sm text-gray-500">{kini.ringkas}</p>
              </div>
            )}

            <div className="space-y-2.5">
              {kini?.bagian.map(b => <BagianItem key={b.id} b={b} />)}
            </div>
          </>
        )}

        <div className="mt-8 flex items-start gap-3 rounded-xl bg-gray-900 text-white p-5">
          <Clapperboard size={26} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Video Tutorial</p>
            <p className="text-gray-400 text-xs mt-1">
              Video panduan akan ditampilkan langsung di dalam tiap topik begitu kanal YouTube lembaga/platform menerbitkannya.
              Setiap topik sudah menyediakan tempat pemutar video — cukup tautkan alamat videonya.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-primary/5 border border-primary/20 p-6 text-center">
          <p className="text-sm text-gray-600">Masih ada pertanyaan atau butuh bantuan?</p>
          <p className="text-sm text-gray-500 mt-1">Coba akun demo di halaman utama untuk menjelajah semua fitur sebelum mendaftar.</p>
          <Link to="/register" className="inline-flex items-center gap-2 mt-4 rounded-full bg-primary px-5 py-2 text-sm text-white font-semibold hover:opacity-90">
            Mulai Sekarang
          </Link>
        </div>
      </div>
    </div>
  )
}
