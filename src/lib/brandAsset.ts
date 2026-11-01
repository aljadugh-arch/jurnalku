// Aset brand default: logo default HARUS sama dengan favicon default.
// Dulu logo jatuh ke /logo-jurnalku-256.png sementara favicon memakai
// /favicon-light.png, sehingga keduanya terlihat berbeda (dan logo lama lebih
// besar/mepet). Satu sumber kebenaran di sini.
export const DEFAULT_LOGO_LIGHT = '/favicon-light.png'
export const DEFAULT_LOGO_DARK = '/favicon-dark.png'

export function defaultLogo(dark?: boolean): string {
  return dark ? DEFAULT_LOGO_DARK : DEFAULT_LOGO_LIGHT
}
