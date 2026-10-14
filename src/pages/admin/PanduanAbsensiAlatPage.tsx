import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QrCode, CreditCard, Cpu, Camera, Keyboard, KeyRound, BookOpen, ChevronDown, Copy, Check } from 'lucide-react'

type Step = { title: string; body: string; link?: { label: string; to: string } }
type Section = { id: string; icon: any; title: string; subtitle: string; badge?: string; steps: Step[] }

const sections: Section[] = [
  {
    id: 'qr-kamera', icon: Camera, title: 'QR — HP / Tablet / Kamera', badge: 'Tanpa alat tambahan',
    subtitle: 'Cara tercepat. Tidak perlu beli alat apa pun.',
    steps: [
      { title: '1. Cetak kartu QR siswa', body: 'Admin: menu Absensi → "Absensi QR Siswa" → pilih rombel → cetak atau unduh (bisa ZIP per rombel). QR juga tercetak pada Kartu Pelajar (Data Siswa → Cetak KTS).', link: { label: 'Buka Absensi QR Siswa', to: '/admin/absensi-qr-siswa' } },
      { title: '2. Guru buka halaman Absensi Harian', body: 'Pilih rombel dan tanggal. Tab "QR" aktif secara default.', link: { label: 'Buka Absensi Harian', to: '/guru/absensi-siswa' } },
      { title: '3. Arahkan kamera ke QR tiap siswa', body: 'Sesi masuk/pulang ditentukan otomatis dari jam. Notifikasi WhatsApp ke wali terkirim otomatis.' },
    ],
  },
  {
    id: 'qr-usb', icon: Keyboard, title: 'QR — Scanner USB (meja/piket)',
    subtitle: 'Scanner 2D USB bertindak seperti keyboard: memindai lalu "mengetik" token + Enter.',
    steps: [
      { title: '1. Cetak kartu QR siswa', body: 'Sama seperti cara kamera (menu Absensi QR Siswa).' },
      { title: '2. Buka tab "Manual"', body: 'Guru/admin: halaman Absensi Harian → tab "Manual" (kolom input token).', link: { label: 'Buka Absensi Harian', to: '/guru/absensi-siswa' } },
      { title: '3. Colok scanner & klik kolom input', body: 'Scan kartu satu per satu. Tiap scan otomatis terkirim — tidak perlu tekan apa pun.' },
    ],
  },
  {
    id: 'rfid-usb', icon: CreditCard, title: 'RFID — Reader USB / Bluetooth', badge: 'Termurah',
    subtitle: 'Reader RFID mode keyboard (HID). Tap kartu → UID terkirim otomatis. Tanpa firmware.',
    steps: [
      { title: '1. Siapkan reader & kartu', body: 'Reader RFID mode keyboard (HID). Kartu EM4100 (125kHz) atau Mifare Classic (13.56MHz). Set reader ke mode "HID/keyboard" lewat barcode konfigurasi bawaannya.' },
      { title: '2. Petakan UID kartu ke siswa', body: 'Menu "Kartu RFID" → cari siswa → klik kolom UID → tap kartu (UID terisi otomatis) → Simpan. Anti-duplikat: satu UID hanya untuk satu siswa. Bisa juga massal lewat kolom "RFID UID" di impor Excel data siswa.', link: { label: 'Buka Kartu RFID', to: '/admin/rfid' } },
      { title: '3. Absen tap kartu', body: 'Guru: halaman Absensi Harian → tab "RFID" → klik kolom UID → tap kartu. Reader "mengetik" UID + Enter → absensi terkirim. Sesi & notif WA otomatis.', link: { label: 'Buka Absensi Harian', to: '/guru/absensi-siswa' } },
    ],
  },
  {
    id: 'device', icon: Cpu, title: 'Alat Mandiri (ESP32 / Gate / Kiosk)', badge: 'Via REST API',
    subtitle: 'Alat berjalan sendiri tanpa login staf, memakai API key. Cocok untuk gerbang/pintu.',
    steps: [
      { title: '1. Buat API key', body: 'Menu "REST API Developer" → isi nama → centang "Tulis absensi (absensi:write)" → Buat Key → salin key (hanya tampil sekali).', link: { label: 'Buka REST API Developer', to: '/admin/developer-api' } },
      { title: '2. Petakan kartu (bila RFID)', body: 'Menu "Kartu RFID" atau impor Excel (kolom RFID UID). Alat akan mengirim UID ini.', link: { label: 'Buka Kartu RFID', to: '/admin/rfid' } },
      { title: '3. Flash firmware ESP32 + RC522', body: 'Sketch & wiring lengkap ada di folder firmware/esp32-rfid-attendance pada repo. Isi WIFI_SSID, WIFI_PASS, SERVER, dan API_KEY.' },
      { title: '4. Uji tap', body: 'Tap kartu → buzzer 2× pendek + LED hijau = tercatat. Buzzer panjang + LED merah = kartu belum dipetakan (balasan 404 UNMAPPED_RFID).' },
    ],
  },
]

const curl = (origin: string) => `curl -X POST "${origin}/api/external/v1/absensi/scan" \\
  -H "x-api-key: API_KEY_ANDA" \\
  -H "Content-Type: application/json" \\
  -d '{"rfid_uid":"04A2B1C3"}'   # atau {"token":"<ID SISWA dari QR>"}`

export default function PanduanAbsensiAlatPage() {
  const [open, setOpen] = useState<string>('qr-kamera')
  const [copied, setCopied] = useState(false)
  const origin = window.location.origin
  const copy = async () => { await navigator.clipboard.writeText(curl(origin)); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-display font-bold text-gray-800 dark:text-white"><BookOpen className="text-primary" /> Panduan Alat Absensi</h1>
        <p className="mt-1 text-sm text-gray-500">Cara memasang & memakai absensi QR/RFID siswa — dari HP sampai alat mandiri (ESP32).</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map(s => (
          <button key={s.id} onClick={() => setOpen(s.id)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${open === s.id ? 'border-primary bg-primary/5' : 'border-gray-100 bg-white hover:border-gray-200 dark:border-gray-800 dark:bg-gray-900'}`}>
            <s.icon className={open === s.id ? 'text-primary' : 'text-gray-400'} size={22} />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{s.title}</span>
          </button>
        ))}
      </div>

      {sections.filter(s => s.id === open).map(s => (
        <section key={s.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-center gap-2">
            <s.icon className="text-primary" size={20} />
            <h2 className="font-semibold text-gray-800 dark:text-white">{s.title}</h2>
            {s.badge && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">{s.badge}</span>}
          </div>
          <p className="mt-1 text-sm text-gray-500">{s.subtitle}</p>
          <ol className="mt-4 space-y-3">
            {s.steps.map((st, i) => (
              <li key={i} className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{st.title}</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{st.body}</p>
                {st.link && <Link to={st.link.to} className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">{st.link.label} →</Link>}
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="flex items-center gap-2 font-semibold text-gray-800 dark:text-white"><KeyRound size={18} className="text-primary" /> Referensi endpoint alat</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Alat mandiri memanggil satu endpoint ini (butuh API key ber-izin <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">absensi:write</code>):</p>
        <div className="mt-3 flex items-start gap-2">
          <pre className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-gray-950 p-4 text-xs leading-6 text-emerald-300"><code>{curl(origin)}</code></pre>
          <button onClick={copy} aria-label="Salin contoh curl" className="rounded-lg border p-3 text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800">{copied ? <Check size={16} /> : <Copy size={16} />}</button>
        </div>
        <p className="mt-3 text-xs text-gray-500">Balasan: <code>{'{ ok, nama, sesi, already }'}</code> — <code>already:true</code> berarti sudah tercatat. Endpoint daftar/endpoint lain (siswa, nilai, jadwal, dll.) ada di menu REST API Developer.</p>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="flex items-center gap-2 font-semibold text-gray-800 dark:text-white"><ChevronDown size={18} className="text-primary" /> Pilih alat mana?</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-gray-500"><tr><th className="py-2">Kebutuhan</th><th>Alat</th><th>Biaya</th><th>Firmware</th></tr></thead>
            <tbody className="divide-y">
              <tr><td className="py-2">Cepat, tanpa beli alat</td><td>HP/tablet kamera</td><td>Rp0</td><td>Tidak</td></tr>
              <tr><td className="py-2">Absen di meja piket</td><td>Scanner QR USB 2D</td><td>Murah</td><td>Tidak</td></tr>
              <tr><td className="py-2">Tap kartu, tanpa firmware</td><td>Reader RFID USB (HID)</td><td>Murah</td><td>Tidak</td></tr>
              <tr><td className="py-2">Gerbang/pintu otomatis</td><td>ESP32 + RC522 / kamera</td><td>Sedang</td><td>Ya</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-500 flex items-center gap-1"><QrCode size={13} /> Semua jalur memakai mesin absensi yang sama: sesi masuk/pulang otomatis dari jam + notifikasi WhatsApp ke wali.</p>
      </section>
    </div>
  )
}
