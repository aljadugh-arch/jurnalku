/**
 * Klien notifikasi perangkat (Web Push) untuk JURNALKU.
 *
 * Kenapa perlu: notifikasi adzan tidak boleh bergantung pada timer di halaman.
 * Begitu tab masuk latar atau layar HP terkunci, Chrome/Safari menangguhkan timer
 * sehingga adzan tidak pernah berbunyi. Service worker + langganan push membuat
 * server (server/adzan-push.cjs) yang membangunkan perangkat, jadi notifikasi
 * tetap masuk walau aplikasi tertutup.
 */
import api from '../services/api'

export type StatusPush = {
  didukung: boolean
  izin: NotificationPermission | 'tidak-didukung'
  terdaftar: boolean
}

/** Kunci publik VAPID (base64url) → Uint8Array untuk applicationServerKey. */
const urlBase64KeUint8 = (base64: string): Uint8Array<ArrayBuffer> => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const mentah = atob(b64)
  // Alokasi ArrayBuffer eksplisit: PushManager.subscribe tidak menerima
  // Uint8Array<ArrayBufferLike> (buffer bisa SharedArrayBuffer) menurut tipe TS.
  const keluaran = new Uint8Array(new ArrayBuffer(mentah.length))
  for (let i = 0; i < mentah.length; i++) keluaran[i] = mentah.charCodeAt(i)
  return keluaran
}

export const didukungPush = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export const izinNotifikasi = (): NotificationPermission | 'tidak-didukung' =>
  didukungPush() ? Notification.permission : 'tidak-didukung'

/** Daftarkan service worker. Selalu dipanggil (bukan hanya saat PWA aktif) karena
 *  notifikasi adzan memerlukannya di setiap lembaga. */
export async function daftarkanServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    await reg.update().catch(() => {})
    return reg
  } catch {
    return null
  }
}

async function registrasiSiap(): Promise<ServiceWorkerRegistration | null> {
  const reg = await daftarkanServiceWorker()
  if (!reg) return null
  if (reg.active) return reg
  await navigator.serviceWorker.ready
  return reg
}

/** Minta izin + daftarkan perangkat ini ke server. Dipanggil dari tombol di UI. */
export async function aktifkanPush(): Promise<{ ok: boolean; alasan?: string }> {
  if (!didukungPush()) return { ok: false, alasan: 'Perangkat/browser ini belum mendukung notifikasi web.' }
  const reg = await registrasiSiap()
  if (!reg) return { ok: false, alasan: 'Service worker gagal didaftarkan.' }
  const izin = await Notification.requestPermission()
  if (izin !== 'granted') {
    return { ok: false, alasan: izin === 'denied' ? 'Izin notifikasi diblokir. Buka pengaturan situs di browser lalu izinkan notifikasi.' : 'Izin notifikasi belum diberikan.' }
  }
  const { data } = await api.get('/push/public-key')
  const langganan = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64KeUint8(data.key) })
  const json = langganan.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys })
  return { ok: true }
}

/** Lepas langganan perangkat ini (server + browser). */
export async function matikanPush(): Promise<void> {
  if (!didukungPush()) return
  const reg = (await navigator.serviceWorker.getRegistration('/')) || (await navigator.serviceWorker.getRegistration())
  const langganan = await reg?.pushManager.getSubscription()
  if (!langganan) return
  try { await api.post('/push/unsubscribe', { endpoint: langganan.endpoint }) } catch { /* tetap lepas di sisi browser */ }
  await langganan.unsubscribe().catch(() => {})
}

export async function statusPush(): Promise<StatusPush> {
  const didukung = didukungPush()
  let terdaftar = false
  if (didukung) {
    try {
      const reg = (await navigator.serviceWorker.getRegistration('/')) || (await navigator.serviceWorker.getRegistration())
      terdaftar = !!(await reg?.pushManager.getSubscription())
    } catch {
      terdaftar = false
    }
  }
  return { didukung, izin: izinNotifikasi(), terdaftar }
}

/** Kirim-uji: server mengirim push ke perangkat pengguna ini. */
export async function kirimUjiLewatServer(): Promise<{ dikirim: number; gagal: number; reason?: string }> {
  const { data } = await api.post('/push/test', {})
  return data
}

/**
 * Notifikasi lokal lewat service worker — dipakai saat aplikasi sedang terbuka
 * (timer halaman sempat berjalan) supaya pesan adzan juga muncul di baki sistem,
 * bukan hanya di panel dalam aplikasi.
 */
export async function tampilkanNotifikasiLokal(judul: string, isi: string, opsi: { tag?: string; url?: string } = {}): Promise<boolean> {
  if (!didukungPush() || Notification.permission !== 'granted') return false
  try {
    const reg = (await navigator.serviceWorker.getRegistration('/')) || (await navigator.serviceWorker.getRegistration())
    if (reg?.active) {
      reg.active.postMessage({ type: 'adzan-show', title: judul, body: isi, tag: opsi.tag, url: opsi.url })
      return true
    }
    new Notification(judul, { body: isi, icon: '/icon-192.png', tag: opsi.tag })
    return true
  } catch {
    return false
  }
}
