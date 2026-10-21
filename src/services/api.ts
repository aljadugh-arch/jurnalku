import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  // Tanpa timeout, axios menunggu SELAMANYA (default 0). Di koneksi lemah
  // (sinyal 1-2 bar, WiFi sekolah padat) permintaan menggantung tanpa batas:
  // spinner berputar terus, tidak pernah gagal, tidak pernah bisa dicoba lagi.
  // 90 detik cukup longgar untuk endpoint berat (generate PDF rapor massal),
  // sementara login memakai batas jauh lebih pendek di bawah.
  timeout: 90000,
})

/** Pesan error jaringan yang bisa dibaca pengguna, bukan "Network Error". */
export function pesanGagalJaringan(err: any): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Tidak ada koneksi internet. Periksa sinyal atau WiFi, lalu coba lagi.'
  }
  if (err?.code === 'ECONNABORTED' || /timeout/i.test(String(err?.message || ''))) {
    return 'Koneksi terlalu lambat — permintaan tidak selesai. Coba lagi di tempat dengan sinyal lebih baik.'
  }
  if (!err?.response) {
    return 'Koneksi terputus. Periksa jaringan, lalu coba lagi.'
  }
  return err?.response?.data?.error || 'Terjadi kesalahan. Coba lagi.'
}

/** Apakah kegagalan ini layak dicoba ulang (jaringan/timeout), bukan ditolak server? */
export function bisaDiulang(err: any): boolean {
  // 4xx = server sudah menjawab (sandi salah, akun tidak ada) — mengulang
  // hanya memperburuk hitungan percobaan dan tidak akan berubah hasilnya.
  if (err?.response?.status && err.response.status < 500) return false
  return true
}

// Interceptor to add auth token
api.interceptors.request.use((config) => {
  if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) delete config.headers['Content-Type']
  const token = localStorage.getItem('jurnalku_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (window.location.pathname.startsWith('/guru')) config.headers['X-Access-Mode'] = 'teacher'
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || ''
    // Hanya token yang benar-benar ditolak server yang mengakhiri sesi.
    // /auth/login dan /auth/me punya penanganan sendiri, dan kegagalan
    // jaringan/5xx (err.response undefined) tidak boleh memaksa logout.
    const authRoute = url.includes('/auth/login') || url.includes('/auth/me')
    if (err.response?.status === 401 && !authRoute && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('jurnalku_token')
      sessionStorage.removeItem('jurnalku_token')
      window.location.href = '/login'
    }
    // Lembaga dinonaktifkan saat pengguna masih punya sesi: akhiri sesi dan
    // tampilkan alasan. Tanpa ini pengguna hanya melihat halaman kosong tanpa
    // penjelasan, dan tokennya terus mencoba memanggil API yang menolak.
    if (err.response?.status === 403 && err.response?.data?.code === 'TENANT_INACTIVE') {
      localStorage.removeItem('jurnalku_token')
      sessionStorage.removeItem('jurnalku_token')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?alasan=lembaga-nonaktif'
      }
    }
    return Promise.reject(err)
  }
)

export default api
