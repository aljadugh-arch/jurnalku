import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import PublicShell, { PublicPageHead } from '../components/PublicShell'
import api from '../services/api'

type Faq = { id: string; pertanyaan: string; jawaban: string }

export default function FaqPage() {
  const [faq, setFaq] = useState<Faq[]>([])
  const [buka, setBuka] = useState<string | null>(null)
  const [gagal, setGagal] = useState(false)

  useEffect(() => {
    let hidup = true
    api.get('/publik/faq', { timeout: 10000 })
      .then(({ data }) => { if (hidup) setFaq(Array.isArray(data?.faq) ? data.faq : []) })
      .catch(() => { if (hidup) setGagal(true) })
    return () => { hidup = false }
  }, [])

  return (
    <PublicShell active="FAQ">
      <PublicPageHead
        eyebrow="Bantuan"
        title="FAQ"
        desc="Jawaban cepat untuk pertanyaan umum seputar akun dan layanan."
      />
      <section className="mx-auto max-w-3xl px-5 pb-16 pt-6">
        {gagal ? (
          <div className="sk-card--flat p-8 text-center text-sm text-[#6f7785]">FAQ sedang tidak dapat dimuat.</div>
        ) : faq.length === 0 ? (
          <div className="sk-card--flat p-8 text-center text-sm text-[#6f7785]">FAQ belum tersedia.</div>
        ) : (
          <div className="space-y-2.5">
            {faq.map(f => {
              const terbuka = buka === f.id
              return (
                <div key={f.id} className="sk-card--flat overflow-hidden">
                  <button
                    onClick={() => setBuka(terbuka ? null : f.id)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                    aria-expanded={terbuka}
                  >
                    <span className="font-semibold text-sm text-[#24262d]">{f.pertanyaan}</span>
                    <ChevronDown size={18} className={`shrink-0 text-[#6f7785] transition-transform ${terbuka ? 'rotate-180' : ''}`} />
                  </button>
                  {terbuka && (
                    <div className="px-5 pb-4">
                      <p className="text-sm leading-relaxed text-[#6f7785]">{f.jawaban}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </PublicShell>
  )
}
