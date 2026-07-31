import { useEffect, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './stores/authStore'
import { useSettingsStore } from './stores/settingsStore'
import DashboardLayout from './components/layout/DashboardLayout'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import AdminDashboard from './pages/admin/AdminDashboard'
import DataSiswaPage from './pages/admin/DataSiswaPage'
import DataGTKPage from './pages/admin/DataGTKPage'
import MapelPage from './pages/admin/MapelPage'
import RombelPage from './pages/admin/RombelPage'
import JadwalPage from './pages/admin/JadwalPage'
import PengajarPage from './pages/admin/PengajarPage'
import WaliKelasPage from './pages/admin/WaliKelasPage'
import JurnalPage from './pages/admin/JurnalPage'
import AbsensiSiswaPage from './pages/admin/AbsensiSiswaPage'
import AbsensiEkskulPage from './pages/admin/AbsensiEkskulPage'
import AbsensiKokurikulerPage from './pages/admin/AbsensiKokurikulerPage'
import AbsensiKegiatanPage from './pages/admin/AbsensiKegiatanPage'
import AbsensiGuruPage from './pages/admin/AbsensiGuruPage'
import ModulAjarPage from './pages/admin/ModulAjarPage'
import TahunAjaranPage from './pages/admin/TahunAjaranPage'
import TagihanPage from './pages/admin/TagihanPage'
import TabunganPage from './pages/admin/TabunganPage'
import SettingsPage from './pages/admin/SettingsPage'
import WAGatewayPage from './pages/admin/WAGatewayPage'
import BroadcastPage from './pages/admin/BroadcastPage'
import KalenderKBMPage from './pages/admin/KalenderKBMPage'
import RekapAbsensiPage from './pages/admin/RekapAbsensiPage'
import NotifSettingsPage from './pages/admin/NotifSettingsPage'
import TenantManagementPage from './pages/admin/TenantManagementPage'
import RaporPage from './pages/admin/RaporPage'
import GuruDashboard from './pages/guru/GuruDashboard'
import GuruJurnalPage from './pages/guru/GuruJurnalPage'
import GuruAbsensiPage from './pages/guru/GuruAbsensiPage'
import GuruAbsensiSiswaPage from './pages/guru/GuruAbsensiSiswaPage'
import GuruJadwalPage from './pages/guru/GuruJadwalPage'
import GuruModulAjarPage from './pages/guru/GuruModulAjarPage'
import GuruRombelPage from './pages/guru/GuruRombelPage'
import GuruPenilaianHarianPage from './pages/guru/GuruPenilaianHarianPage'
import SiswaDashboard from './pages/siswa/SiswaDashboard'
import SiswaAbsensiPage from './pages/siswa/SiswaAbsensiPage'
import SiswaJadwalPage from './pages/siswa/SiswaJadwalPage'
import SiswaEkskulPage from './pages/siswa/SiswaEkskulPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import ProfilePage from './pages/ProfilePage'
import UserManagementPage from './pages/admin/UserManagementPage'

function ProtectedRoute({ children, allowedRoles }: { children: ReactNode, allowedRoles?: string[] }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    const path = user.role === 'admin' || user.role === 'super_admin' || user.role === 'kepala' ? '/admin' :
                 user.role === 'guru' || user.role === 'wali_kelas' ? '/guru' : '/siswa'
    return <Navigate to={path} replace />
  }
  return <>{children}</>
}

export default function App() {
  const { checkAuth, isAuthenticated } = useAuthStore()
  const { loadSettings } = useSettingsStore()
  useEffect(() => { checkAuth() }, [])
  useEffect(() => { loadSettings() }, [])

  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        {/* Admin Routes */}
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['admin', 'super_admin', 'kepala']}>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route index element={<AdminDashboard />} />
          <Route path="siswa" element={<DataSiswaPage />} />
          <Route path="gtk" element={<DataGTKPage />} />
          <Route path="mapel" element={<MapelPage />} />
          <Route path="rombel" element={<RombelPage />} />
          <Route path="jadwal" element={<JadwalPage />} />
          <Route path="pengajar" element={<PengajarPage />} />
          <Route path="wali-kelas" element={<WaliKelasPage />} />
          <Route path="jurnal" element={<JurnalPage />} />
          <Route path="absensi-siswa" element={<AbsensiSiswaPage />} />
          <Route path="absensi-ekskul" element={<AbsensiEkskulPage />} />
          <Route path="absensi-kokurikuler" element={<AbsensiKokurikulerPage />} />
          <Route path="absensi-kegiatan" element={<AbsensiKegiatanPage />} />
          <Route path="absensi-guru" element={<AbsensiGuruPage />} />
          <Route path="ceklok" element={<GuruAbsensiPage />} />
          <Route path="modul-ajar" element={<ModulAjarPage />} />
          <Route path="tahun-ajaran" element={<TahunAjaranPage />} />
          <Route path="tagihan" element={<TagihanPage />} />
          <Route path="tabungan" element={<TabunganPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="wa-gateway" element={<WAGatewayPage />} />
          <Route path="notif-settings" element={<NotifSettingsPage />} />
          <Route path="tenants" element={
            <ProtectedRoute allowedRoles={['super_admin']}><TenantManagementPage /></ProtectedRoute>
          } />
          <Route path="rapor" element={<RaporPage />} />
          <Route path="change-password" element={<ChangePasswordPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="users" element={
            <ProtectedRoute allowedRoles={['admin', 'super_admin']}><UserManagementPage /></ProtectedRoute>
          } />
          <Route path="broadcast" element={<BroadcastPage />} />
          <Route path="kalender-kbm" element={<KalenderKBMPage />} />
          <Route path="rekap-absensi" element={<RekapAbsensiPage />} />
        </Route>

        {/* Guru Routes */}
        <Route path="/guru" element={
          <ProtectedRoute allowedRoles={['guru', 'wali_kelas']}>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route index element={<GuruDashboard />} />
          <Route path="jurnal" element={<GuruJurnalPage />} />
          <Route path="jadwal" element={<GuruJadwalPage />} />
          <Route path="absensi-guru" element={<GuruAbsensiPage />} />
          <Route path="absensi-siswa" element={<GuruAbsensiSiswaPage />} />
          <Route path="modul-ajar" element={<GuruModulAjarPage />} />
          <Route path="rombel" element={<GuruRombelPage />} />
          <Route path="penilaian-harian" element={<GuruPenilaianHarianPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="change-password" element={<ChangePasswordPage />} />
        </Route>

        {/* Siswa Routes */}
        <Route path="/siswa" element={
          <ProtectedRoute allowedRoles={['siswa']}>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route index element={<SiswaDashboard />} />
          <Route path="absensi" element={<SiswaAbsensiPage />} />
          <Route path="jadwal" element={<SiswaJadwalPage />} />
          <Route path="ekskul" element={<SiswaEkskulPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="change-password" element={<ChangePasswordPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
