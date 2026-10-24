import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, type LucideIcon } from 'lucide-react'
import PublicShell, { PublicPageHead } from './PublicShell'

// Halaman detail layanan publik (diadopsi dari SISFO yang memberi tiap layanan
// halamannya sendiri, bukan menunjuk semua ke /login). Dipakai oleh Ujian Online,
// LMS, dan Notifikasi WhatsApp — menjelaskan fitur Jurnalku yang nyata lalu
// mengarahkan pengunjung masuk/daftar.

type Fitur = { judul: string; isi: string }

export default function LayananDetail({
  eyebrow, title, subtitle, desc, fitur, icon: Ikon, active,
}: {
  eyebrow: string
  title: string
  subtitle: string
  desc: string
  fitur: Fitur[]
  icon: LucideIcon
  active: string
}) {
  return (
    <PublicShell active={active}>
      <PublicPageHead eyebrow={eyebrow} title={title} desc={subtitle} />

      <section className="mx-auto max-w-[1160px] px-5 pb-16 pt-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="sk-card--flat p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full sk-bg-soft sk-txt-accent">
                  <Ikon size={24} />
                </span>
                <div>
                  <h2 className="text-lg font-bold sk-txt">{title}</h2>
                  <p className="text-sm sk-txt-muted">{subtitle}</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed sk-txt-muted">{desc}</p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {fitur.map(f => (
                <div key={f.judul} className="sk-card--flat p-5">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 sk-txt-accent" />
                    <div>
                      <p className="text-sm font-bold sk-txt">{f.judul}</p>
                      <p className="mt-0.5 text-xs leading-relaxed sk-txt-muted">{f.isi}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="sk-form-card text-center">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full sk-bg-soft sk-txt-accent">
                <Ikon size={24} />
              </span>
              <h2 className="text-lg font-bold sk-txt">Mulai {title}</h2>
              <p className="mt-1 text-sm sk-txt-muted">Masuk untuk mengakses fitur ini lewat akun lembaga Anda.</p>
              <Link to="/login" className="sk-btn mt-4 w-full">
                Masuk <ArrowRight size={16} />
              </Link>
              <Link to="/register" className="sk-btn sk-btn--ghost mt-2 w-full">
                Daftar Lembaga
              </Link>
            </div>

            <div className="sk-form-card">
              <h2>Butuh bantuan?</h2>
              <p className="text-sm sk-txt-muted">Kendala login atau akses? Hubungi Helpdesk kami.</p>
              <Link to="/helpdesk" className="sk-txt-accent mt-2 inline-flex items-center gap-1 text-sm font-semibold hover:underline">
                Buka Helpdesk →
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </PublicShell>
  )
}
