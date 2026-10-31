import { Link } from 'react-router-dom'
import { Moon, Sun, Menu, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { useThemeStore } from '../stores/themeStore'

// Cangkang halaman publik situs lembaga (design system SISFO): navbar krem +
// aksen oranye, footer, dan heading halaman. Dipakai oleh Beranda, Pengumuman,
// FAQ, Kontak, dan Helpdesk supaya kelima halaman konsisten.

const navLinks = [
  { label: 'Beranda', to: '/' },
  { label: 'Pengumuman', to: '/pengumuman' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Kontak', to: '/kontak' },
]

export default function PublicShell({ children, active }: { children: ReactNode; active?: string }) {
  const { settings } = useSettingsStore()
  const { dark, toggle: toggleDark } = useThemeStore()
  const logo = settings.logo || (dark ? '/favicon-dark.png' : '/favicon-light.png')
  const namaLembaga = settings.nama_lembaga || 'JURNALKU'
  const [buka, setBuka] = useState(false)

  return (
    <div className="sk-root flex min-h-screen flex-col">
      <nav className="sk-nav">
        <div className="sk-nav-inner">
          <Link to="/" className="sk-nav-brand">
            <img src={logo} alt={`Logo ${namaLembaga}`} />
            <span className="whitespace-nowrap">{namaLembaga}</span>
          </Link>

          <div className="sk-nav-menu">
            {navLinks.map(n => (
              <Link
                key={n.to}
                to={n.to}
                className={`sk-nav-link ${active === n.label ? 'sk-active' : ''}`}
              >
                {n.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleDark}
              className="rounded-full p-2 text-slate-400 transition hover:bg-black/5"
              aria-label={dark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
              title={dark ? 'Mode Terang' : 'Mode Gelap'}
            >
              {dark ? <Sun size={17} className="text-amber-500" /> : <Moon size={17} />}
            </button>
            <button
              onClick={() => setBuka(v => !v)}
              className="rounded-lg p-2 text-slate-500 hover:bg-black/5 lg:hidden"
              aria-label="Menu"
            >
              {buka ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {buka && (
          <div className="border-t border-[#e7e4df] px-5 py-2 lg:hidden">
            {navLinks.map(n => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setBuka(false)}
                className={`block rounded-lg px-3 py-2.5 text-sm font-medium ${active === n.label ? 'text-[var(--sk-orange)]' : 'text-[#6f7785]'}`}
              >
                {n.label}
              </Link>
            ))}
            <Link to="/login" onClick={() => setBuka(false)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-[var(--sk-orange)]">
              Masuk
            </Link>
          </div>
        )}
      </nav>

      <main className="flex-1">{children}</main>

      <footer className="sk-footer">
        <div className="sk-footer-inner">
          <span>Sistem aman &amp; terintegrasi</span>
          <div className="sk-footer-links">
            <Link to="/faq">Bantuan</Link>
            <Link to="/kontak">Kontak</Link>
            <Link to="/login">Masuk</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

export function PublicPageHead({ eyebrow, title, desc }: { eyebrow: string; title: string; desc: string }) {
  return (
    <div className="sk-page-head">
      <span className="sk-eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{desc}</p>
    </div>
  )
}
