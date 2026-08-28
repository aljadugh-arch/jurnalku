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
    if (err.response?.status === 401 && !url.includes('/auth/login')) {
      sessionStorage.removeItem('jurnalku_token')
      localStorage.removeItem('jurnalku_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
