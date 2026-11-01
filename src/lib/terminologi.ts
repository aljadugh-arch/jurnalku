// Hook React + re-export peta terminologi (bagian murni ada di terminologi-peta.ts
// supaya bisa diuji tanpa React/zustand).
import { useSettingsStore } from '../stores/settingsStore'
import { deriveTipeInstitusi, terminologiUntuk, type Terminologi } from './terminologi-peta'
export * from './terminologi-peta'

/** React hook: terminologi aktif berdasarkan settings.tipe_institusi / jenjang. */
export function useTerminologi(): Terminologi {
  // Dibaca lewat getState(), bukan hook zustand: komponen uji dirender dengan
  // instance React terpisah dari node_modules aplikasi, dan hook zustand lintas
  // instance memicu "Cannot read properties of null (reading 'useCallback')".
  // Settings dimuat saat boot/login; perubahan tipe lembaga berlaku pada pemuatan
  // halaman berikutnya (memang perlu reload agar seluruh UI ikut berubah).
  const settings = useSettingsStore.getState().settings
  const tipe = (settings.tipe_institusi as string) || deriveTipeInstitusi(settings.jenjang as string)
  return terminologiUntuk(tipe)
}
