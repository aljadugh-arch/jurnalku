/**
 * Sakelar on/off bersama — SATU-SATUNYA gaya toggle di aplikasi.
 *
 * Dipakai halaman Pengaturan (PWA, Perpustakaan Digital) dan Pengaturan
 * Notifikasi supaya bentuknya tidak pernah menyimpang antar halaman.
 * Ukuran: jalur 44x24 (w-11 h-6), kenop 20px (h-5 w-5), sisipan 2px di kedua
 * sisi sehingga terlihat sama saat hidup maupun mati.
 */
export default function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  className = '',
  toneClassName = 'bg-primary',
}: {
  checked: boolean
  onChange: (next: boolean) => void
  /** Nama untuk pembaca layar (aria-label). */
  label: string
  disabled?: boolean
  className?: string
  /** Warna saat aktif. Default `bg-primary`; halaman notifikasi memakai warna per bagian. */
  toneClassName?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onChange(!checked)
        }
      }}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? toneClassName : 'bg-gray-300 dark:bg-gray-600'
      } ${className}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
