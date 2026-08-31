import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Interceptor to add auth token
api.interceptors.request.use((config) => {
  if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) delete config.headers['Content-Type']
  const token = localStorage.getItem('jurnalku_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
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
    return Promise.reject(err)
  }
)

export default api
