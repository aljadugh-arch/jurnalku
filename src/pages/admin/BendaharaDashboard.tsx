import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// Dashboard bendahara — langsung redirect ke laporan keuangan
// 3 menu utama: Laporan Keuangan, Tagihan & Pembayaran, Tabungan Siswa
export default function BendaharaDashboard() {
  const navigate = useNavigate()

  useEffect(() => {
    navigate('/admin/bendahara#laporan', { replace: true })
  }, [navigate])

  return null
}
