import { useEffect, useState } from 'react'
import PublicShell, { PublicPageHead } from '../components/PublicShell'
import api from '../services/api'

type Pengumuman = {
  id: string
  judul: string
  ringkas: string
  kategori: string
  penulis: string
  created_at: string
}

const tgl = (s: string) => {
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function PengumumanPage() {
  const [data, setData] = useState<Pengumuman[]>([])
  const [gagal, setGagal] = useState(false)

  useEffect(() => {
    let hidup = true
    api.get('/publik/pengumuman', { timeout: 10000 })
      .then(({ data }) => { if (hidup) setData(Array.isArray(data?.pengumuman) ? data.pengumuman : []) })
      .catch(() => { if (hidup) setGagal(true) })
    return () => { hidup = false }
  }, [])

  return (
    <PublicShell active="Pengumuman">
      <PublicPageHead
        eyebrow="Informasi"
        title="Pengumuman"
        desc="Informasi dan kabar terbaru dari lembaga."
      />
      <section className="mx-auto max-w-[1160px] px-5 pb-16 pt-6">
        {gagal ? (
          <div className="sk-card--flat p-8 text-center text-sm sk-txt-muted">
            Pengumuman sedang tidak dapat dimuat. Silakan coba lagi.
          </div>
        ) : data.length === 0 ? (
          <div className="sk-card--flat p-8 text-center text-sm sk-txt-muted">
            Belum ada pengumuman terbaru.
          </div>
        ) : (
          <div className="space-y-4">
            {data.map(p => (
              <article key={p.id} className="sk-card--flat p-5">
                <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide sk-txt-accent">
                  <span>{p.kategori}</span>
                  <span className="text-[#cbd5e1]">•</span>
                  <span className="sk-txt-muted">{tgl(p.created_at)}</span>
                </div>
                <h2 className="text-lg font-bold sk-txt">{p.judul}</h2>
                {p.ringkas && <p className="mt-1 text-sm leading-relaxed sk-txt-muted">{p.ringkas}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    </PublicShell>
  )
}
