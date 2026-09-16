import { useEffect, useState, Suspense, lazy, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './stores/authStore'
import { useSettingsStore } from './stores/settingsStore'
import DashboardLayout from './components/layout/DashboardLayout'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import SubscriptionGate from './components/SubscriptionGate'
import { useSubscriptionStore } from './stores/subscriptionStore'
import PwaInstallPrompt from './components/PwaInstallPrompt'
import api from './services/api'
import type { User } from './types'

// Lazy-loaded pages — setiap halaman jadi chunk terpisah
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const DataSiswaPage = lazy(() => import('./pages/admin/DataSiswaPage'))
const DataGTKPage = lazy(() => import('./pages/admin/DataGTKPage'))
const MapelPage = lazy(() => import('./pages/admin/MapelPage'))
const RombelPage = lazy(() => import('./pages/admin/RombelPage'))
const JadwalPage = lazy(() => import('./pages/admin/JadwalPage'))
const PengajarPage = lazy(() => import('./pages/admin/PengajarPage'))
const WaliKelasPage = lazy(() => import('./pages/admin/WaliKelasPage'))
const JurnalPage = lazy(() => import('./pages/admin/JurnalPage'))
const AbsensiSiswaPage = lazy(() => import('./pages/admin/AbsensiSiswaPage'))
const AbsensiEkskulPage = lazy(() => import('./pages/admin/AbsensiEkskulPage'))
const AbsensiKokurikulerPage = lazy(() => import('./pages/admin/AbsensiKokurikulerPage'))
const AbsensiKegiatanPage = lazy(() => import('./pages/admin/AbsensiKegiatanPage'))
const AbsensiJamaahPage = lazy(() => import('./pages/admin/AbsensiJamaahPage'))
const AbsensiGuruPage = lazy(() => import('./pages/admin/AbsensiGuruPage'))
const ModulAjarPage = lazy(() => import('./pages/admin/ModulAjarPage'))
const TahunAjaranPage = lazy(() => import('./pages/admin/TahunAjaranPage'))
const TagihanPage = lazy(() => import('./pages/admin/TagihanPage'))
const TabunganPage = lazy(() => import('./pages/admin/TabunganPage'))
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'))
const PerpustakaanPage = lazy(() => import('./pages/PerpustakaanPage'))
const WAGatewayPage = lazy(() => import('./pages/admin/WAGatewayPage'))
const BroadcastPage = lazy(() => import('./pages/admin/BroadcastPage'))
const KalenderKBMPage = lazy(() => import('./pages/admin/KalenderKBMPage'))
const RekapAbsensiPage = lazy(() => import('./pages/admin/RekapAbsensiPage'))
const NotifSettingsPage = lazy(() => import('./pages/admin/NotifSettingsPage'))
const TenantManagementPage = lazy(() => import('./pages/admin/TenantManagementPage'))
const RaporPage = lazy(() => import('./pages/admin/RaporPage'))
const UserManagementPage = lazy(() => import('./pages/admin/UserManagementPage'))
const PostingPage = lazy(() => import('./pages/admin/PostingPage'))
const CatatanKepribadianPage = lazy(() => import('./pages/admin/CatatanKepribadianPage'))
const SupervisiPage = lazy(() => import('./pages/admin/SupervisiPage'))
const BeasiswaPage = lazy(() => import('./pages/admin/BeasiswaPage'))
const CashlessPage = lazy(() => import('./pages/admin/CashlessPage'))
const BackupRestorePage = lazy(() => import('./pages/admin/BackupRestorePage'))
const CekLokAdminPage = lazy(() => import('./pages/admin/CekLokAdminPage'))
const GuruAbsensiPage = lazy(() => import('./pages/guru/GuruAbsensiPage'))
const BendaharaDashboard = lazy(() => import('./pages/admin/BendaharaDashboard'))
const LaporanKeuanganPage = lazy(() => import('./pages/admin/LaporanKeuanganPage'))
const BukuKasPage = lazy(() => import('./pages/admin/BukuKasPage'))
const EkskulPage = lazy(() => import('./pages/admin/EkskulPage'))
const GuruDashboard = lazy(() => import('./pages/guru/GuruDashboard'))
const GuruJurnalPage = lazy(() => import('./pages/guru/GuruJurnalPage'))
const GuruAbsensiSiswaPage = lazy(() => import('./pages/guru/GuruAbsensiSiswaPage'))
const GuruJadwalPage = lazy(() => import('./pages/guru/GuruJadwalPage'))
const GuruModulAjarPage = lazy(() => import('./pages/guru/GuruModulAjarPage'))
const GuruRombelPage = lazy(() => import('./pages/guru/GuruRombelPage'))
const GuruPenilaianHarianPage = lazy(() => import('./pages/guru/GuruPenilaianHarianPage'))
const GuruNilaiSTSPage = lazy(() => import('./pages/guru/GuruNilaiSTSPage'))
const GuruNilaiSASPage = lazy(() => import('./pages/guru/GuruNilaiSASPage'))
const GuruKoreksiJawabanPage = lazy(() => import('./pages/guru/GuruKoreksiJawabanPage'))
const GuruPostingPage = lazy(() => import('./pages/guru/GuruPostingPage'))
const GuruCatatanKepribadianPage = lazy(() => import('./pages/guru/GuruCatatanKepribadianPage'))
const GuruAbsensiEkskulPage = lazy(() => import('./pages/guru/GuruAbsensiEkskulPage'))
const GuruAbsensiSiswaQRPage = lazy(() => import('./pages/guru/GuruAbsensiSiswaQRPage'))
const SiswaDashboard = lazy(() => import('./pages/siswa/SiswaDashboard'))
const SiswaAbsensiPage = lazy(() => import('./pages/siswa/SiswaAbsensiPage'))
const SiswaJadwalPage = lazy(() => import('./pages/siswa/SiswaJadwalPage'))
const SiswaEkskulPage = lazy(() => import('./pages/siswa/SiswaEkskulPage'))
const SiswaPostingPage = lazy(() => import('./pages/siswa/SiswaPostingPage'))
const SiswaNilaiPage = lazy(() => import('./pages/siswa/SiswaNilaiPage'))
const SiswaKantinPage = lazy(() => import('./pages/siswa/SiswaKantinPage'))
const SiswaQrisTopupPage = lazy(() => import('./pages/siswa/SiswaQrisTopupPage'))
const SiswaSectionPage = lazy(() => import('./pages/siswa/SiswaSectionPage'))
const SiswaMenuPage = lazy(() => import('./pages/siswa/SiswaMenuPage'))
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const PanduanPage = lazy(() => import('./pages/PanduanPage'))
const ErkamPage = lazy(() => import('./pages/admin/ErkamPage'))
const SuperadminDashboard = lazy(() => import('./pages/admin/SuperadminDashboard'))
const KantinMenuPage = lazy(() => import('./pages/admin/KantinMenuPage'))
const KantinOrdersPage = lazy(() => import('./pages/admin/KantinOrdersPage'))
const CashlessTopupPage = lazy(() => import('./pages/admin/CashlessTopupPage'))
const CashlessBankConfigPage = lazy(() => import('./pages/admin/CashlessBankConfigPage'))
const KantinScannerPage = lazy(() => import('./pages/admin/KantinScannerPage'))
const DeveloperApiPage = lazy(() => import('./pages/admin/DeveloperApiPage'))
const MobileCeklok = lazy(() => import('./pages/admin/MobileCeklok'))
const BankSoalPage = lazy(() => import('./pages/admin/BankSoalPage'))
const KisiKisiPage = lazy(() => import('./pages/admin/KisiKisiPage'))
const PaketUjianPage = lazy(() => import('./pages/admin/PaketUjianPage'))
const SiswaUjianPage = lazy(() => import('./pages/siswa/SiswaUjianPage'))

/** Loading spinner untuk Suspense fallback */
function PageLoader() {
  return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
}

function canAccessRole(user: User, allowedRoles?: string[]) {
  if (!allowedRoles || allowedRoles.includes(user.role)) return true
  return user.role === 'kepala' && !!user.can_teach && allowedRoles.some(role => role === 'guru' || role === 'wali_kelas')
}

function AdminIndexRoute() {
  const { user } = useAuthStore()
  if (user?.role === 'super_admin') return <SuperadminDashboard />
  if (user?.role === 'bendahara') return <BendaharaDashboard />
  return <AdminDashboard />
}

function ProtectedRoute({ children, allowedRoles }: { children: ReactNode, allowedRoles?: string[] }) {
  const { isAuthenticated, user, authReady } = useAuthStore()
  // Tunggu hidrasi /auth/me selesai supaya refresh tidak melempar ke /login
  // dan halaman tidak memanggil API sebelum peran diketahui.
  if (!authReady || (isAuthenticated && !user)) return <div className="flex items-center justify-center py-20 text-sm text-gray-400">Memuat sesi...</div>
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (allowedRoles && user && !canAccessRole(user, allowedRoles)) {
    const path = user.role === 'admin' || user.role === 'super_admin' || user.role === 'kepala' || user.role === 'bendahara' || user.role === 'operator' || user.role === 'tata_usaha' || user.role === 'tu' ? '/admin' :
                 user.role === 'guru' || user.role === 'wali_kelas' ? '/guru' : '/siswa'
    return <Navigate to={path} replace />
  }
  return <>{children}</>
}

function RootRoute() {
  const { isAuthenticated, user, authReady } = useAuthStore()
  const [registeredHost, setRegisteredHost] = useState<boolean | null>(null)
  useEffect(() => {
    api.get('/tenant/info').then(({ data }) => setRegisteredHost(Boolean(data.registered_host))).catch(() => setRegisteredHost(false))
  }, [])
  if (!authReady || (isAuthenticated && !user)) return <div className="flex items-center justify-center py-20 text-sm text-gray-400">Memuat sesi...</div>
  if (registeredHost === null) return null
  if (!registeredHost) return <LandingPage />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  const role = user?.role || ''
  const destination = ['admin', 'super_admin', 'kepala', 'bendahara', 'operator', 'tata_usaha', 'tu'].includes(role) ? '/admin' : ['guru', 'wali_kelas'].includes(role) ? '/guru' : '/siswa'
  return <Navigate to={destination} replace />
}

export default function App() {
  const { checkAuth, isAuthenticated, authReady } = useAuthStore()
  const { loadSettings } = useSettingsStore()
  const { load: loadSubscription } = useSubscriptionStore()

  // Auth harus selesai dulu. Sebelumnya settings/subscription ikut menembak API
  // ketika user masih null; satu 401 dari request bootstrap itu menghapus token.
  useEffect(() => { checkAuth() }, [checkAuth])
  useEffect(() => {
    if (!authReady) return
    // Branding harus tersedia sebelum login: /api/settings bersifat publik dan
    // sudah tenant-aware dari hostname. Sebelumnya settings hanya dimuat
    // setelah autentikasi, sehingga LoginPage selalu memakai logo fallback.
    if (!isAuthenticated) useSettingsStore.setState({ settings: {} })
    void loadSettings()
    if (isAuthenticated) void loadSubscription()
  }, [authReady, isAuthenticated, loadSettings, loadSubscription])

  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <PwaInstallPrompt />
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/panduan" element={<PanduanPage />} />

        {/* Admin Routes */}
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['admin', 'super_admin', 'kepala', 'bendahara', 'operator', 'tata_usaha', 'tu']}>
            <SubscriptionGate>
              <DashboardLayout />
            </SubscriptionGate>
          </ProtectedRoute>
        }>
          <Route index element={<AdminIndexRoute />} />
          <Route path="siswa" element={<DataSiswaPage />} />
          <Route path="gtk" element={<DataGTKPage />} />
          <Route path="mapel" element={<MapelPage />} />
          <Route path="rombel" element={<RombelPage />} />
          <Route path="jadwal" element={<JadwalPage />} />
          <Route path="pengajar" element={<PengajarPage />} />
          <Route path="wali-kelas" element={<WaliKelasPage />} />
          <Route path="jurnal" element={<JurnalPage />} />
          <Route path="absensi-siswa" element={<AbsensiSiswaPage />} />
          <Route path="absensi-siswa/kelas/:rombelId" element={<AbsensiSiswaPage />} />
          <Route path="absensi-qr-siswa" element={<AbsensiSiswaPage qrMode />} />
          <Route path="absensi-ekskul" element={<AbsensiEkskulPage />} />
          <Route path="absensi-kokurikuler" element={<AbsensiKokurikulerPage />} />
          <Route path="absensi-kegiatan" element={<AbsensiKegiatanPage />} />
          <Route path="absensi-jamaah" element={<AbsensiJamaahPage />} />
          <Route path="absensi-guru" element={<AbsensiGuruPage />} />
          <Route path="modul-ajar" element={<ModulAjarPage />} />
          <Route path="tahun-ajaran" element={<TahunAjaranPage />} />
          <Route path="tagihan" element={<TagihanPage />} />
          <Route path="tabungan" element={<TabunganPage />} />
          <Route path="perpustakaan" element={<PerpustakaanPage />} />
          <Route path="settings" element={
            <ProtectedRoute allowedRoles={['admin', 'super_admin']}><SettingsPage /></ProtectedRoute>
          } />
          <Route path="developer-api" element={
            <ProtectedRoute allowedRoles={['admin', 'super_admin']}><DeveloperApiPage /></ProtectedRoute>
          } />
          <Route path="wa-gateway" element={
            <ProtectedRoute allowedRoles={['admin', 'super_admin']}><WAGatewayPage /></ProtectedRoute>
          } />
          <Route path="notif-settings" element={
            <ProtectedRoute allowedRoles={['admin', 'super_admin']}><NotifSettingsPage /></ProtectedRoute>
          } />
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
          {/* Halaman baru sesuai live */}
          <Route path="posting" element={<PostingPage />} />
          <Route path="catatan-kepribadian" element={<CatatanKepribadianPage />} />
          <Route path="supervisi" element={<SupervisiPage />} />
          <Route path="beasiswa" element={<BeasiswaPage />} />
          <Route path="cashless" element={<CashlessPage />} />
          <Route path="backup-restore" element={
            <ProtectedRoute allowedRoles={['admin', 'super_admin']}><BackupRestorePage /></ProtectedRoute>
          } />
          <Route path="ceklok" element={<CekLokAdminPage />} />
          <Route path="absensi-saya" element={<GuruAbsensiPage />} />
          <Route path="bendahara" element={<BendaharaDashboard />} />
          <Route path="bendahara/laporan" element={<LaporanKeuanganPage />} />
          <Route path="buku-kas" element={<BukuKasPage />} />
          <Route path="ekskul" element={<EkskulPage />} />
          {/* E-Kantin & Cashless Routes */}
          <Route path="kantin-menu" element={<KantinMenuPage />} />
          <Route path="kantin-orders" element={<KantinOrdersPage />} />
          <Route path="cashless-topup" element={<CashlessTopupPage />} />
          <Route path="cashless-bank-config" element={<CashlessBankConfigPage />} />
          <Route path="kantin-scanner" element={<KantinScannerPage />} />
          {/* Routes baru dari GitHub */}
          <Route path="erkam" element={<ErkamPage />} />
          <Route path="bank-soal" element={<BankSoalPage />} />
          <Route path="kisi-kisi" element={<KisiKisiPage />} />
          <Route path="paket-ujian" element={<PaketUjianPage />} />
          <Route path="superadmin" element={
            <ProtectedRoute allowedRoles={['super_admin']}><SuperadminDashboard /></ProtectedRoute>
          } />
        </Route>

        {/* Guru Routes */}
        <Route path="/guru" element={
          <ProtectedRoute allowedRoles={['guru', 'wali_kelas']}>
            <SubscriptionGate>
              <DashboardLayout />
            </SubscriptionGate>
          </ProtectedRoute>
        }>
          <Route index element={<GuruDashboard />} />
          <Route path="jurnal" element={<GuruJurnalPage />} />
          <Route path="jadwal" element={<GuruJadwalPage />} />
          <Route path="absensi-guru" element={<GuruAbsensiPage />} />
          <Route path="absensi-siswa" element={<GuruAbsensiSiswaQRPage />} />
          <Route path="absensi-mapel" element={<GuruAbsensiSiswaPage />} />
          <Route path="modul-ajar" element={<GuruModulAjarPage />} />
          <Route path="rombel" element={<GuruRombelPage />} />
          <Route path="penilaian-harian" element={<GuruPenilaianHarianPage />} />
          <Route path="nilai-sts" element={<GuruNilaiSTSPage />} />
          <Route path="nilai-sas" element={<GuruNilaiSASPage />} />
          <Route path="koreksi-jawaban" element={<GuruKoreksiJawabanPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="change-password" element={<ChangePasswordPage />} />
          {/* Halaman baru sesuai live */}
          <Route path="posting" element={<GuruPostingPage />} />
          <Route path="catatan-kepribadian" element={<GuruCatatanKepribadianPage />} />
          <Route path="absensi-ekskul" element={<GuruAbsensiEkskulPage />} />
          <Route path="perpustakaan" element={<PerpustakaanPage />} />
          <Route path="absensi-harian" element={<Navigate to="/guru/absensi-siswa" replace />} />
        </Route>

        {/* Siswa Routes */}
        <Route path="/siswa" element={
          <ProtectedRoute allowedRoles={['siswa', 'wali_murid']}>
            <SubscriptionGate>
              <DashboardLayout />
            </SubscriptionGate>
          </ProtectedRoute>
        }>
          <Route index element={<SiswaDashboard />} />
          <Route path="absensi" element={<SiswaAbsensiPage />} />
          <Route path="jadwal" element={<SiswaJadwalPage />} />
          <Route path="ekskul" element={<SiswaEkskulPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="change-password" element={<ChangePasswordPage />} />
          {/* Halaman baru sesuai live */}
          <Route path="posting" element={<SiswaPostingPage />} />
          <Route path="nilai" element={<SiswaNilaiPage />} />
          <Route path="kantin" element={<SiswaKantinPage />} />
          <Route path="qris-topup" element={<SiswaQrisTopupPage />} />
          <Route path="tugas" element={<SiswaSectionPage section="tugas" />} />
          <Route path="tagihan" element={<SiswaSectionPage section="tagihan" />} />
          <Route path="tabungan" element={<SiswaSectionPage section="tabungan" />} />
          <Route path="perpustakaan" element={<PerpustakaanPage />} />
          <Route path="ujian" element={<SiswaUjianPage />} />
          <Route path="menu" element={<SiswaMenuPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
