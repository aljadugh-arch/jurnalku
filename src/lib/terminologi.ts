// Hook React + re-export peta terminologi (bagian murni ada di terminologi-peta.ts
// supaya bisa diuji tanpa React/zustand).
import { useSettingsStore } from '../stores/settingsStore'
import { deriveTipeInstitusi, terminologiUntuk } from './terminologi-peta'
export * from './terminologi-peta'

/** React hook: terminologi aktif berdasarkan settings.tipe_institusi / jenjang. */
export function useTerminologi() {
  const settings = useSettingsStore(s => s.settings)
  const tipe = (settings.tipe_institusi as string) || deriveTipeInstitusi(settings.jenjang as string)
  return terminologiUntuk(tipe)
}
