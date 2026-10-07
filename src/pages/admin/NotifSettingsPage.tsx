import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellRing, MessageSquare, Save, Loader2, AlertTriangle, Volume2, Square, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import Toggle from '../../components/ui/Toggle'

export default function NotifSettingsPage() {
  const [settings, setSettings] = useState({
    absensi_siswa_ke_wali: false,
    guru_belum_ceklok: false,
    batas_ceklok_guru: '07:30',
    template_absensi_wali: '',
    template_guru_ceklok: '',
    notif_jadwal_guru: false,
    template_jadwal_guru: '',
    notif_ujian_guru: false,
    template_ujian_guru: '',
    notif_ekskul_guru: false,
    template_ekskul_guru: '',
    notif_cs_bot: false,
    notif_keuangan_wali: false,
    keuangan_frekuensi: 'bulanan',
    keuangan_hari: '',
    keuangan_jam: '08:00',
    template_keuangan_wali: '',
    notif_adzan: false,
    adzan_waktu: 'subuh,dzuhur,ashar,maghrib,isya',
    adzan_menit_awal: 0,
    adzan_target: 'gtk',
    template_adzan: '',
    adzan_suara: true,
    adzan_suara_url: '',
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [tahunAktif, setTahunAktif] = useState<any>(null)
  const [cekTahunAjaran, setCekTahunAjaran] = useState(false)
  const [whitelist, setWhitelist] = useState<any[]>([])
  const [whiteForm, setWhiteForm] = useState({ target_type: 'phone', phone: '', target_id: '', reason: '' })
  // Uji suara adzan langsung di peramban admin — supaya bisa dipastikan berbunyi
  // tanpa harus menunggu waktu sholat tiba.
  const audioContohRef = useRef<HTMLAudioElement | null>(null)
  const [memutarContoh, setMemutarContoh] = useState(false)
  const [jadwalSholat, setJadwalSholat] = useState<any>(null)

  useEffect(() => {
    api.get('/notif-whitelist').then(r => setWhitelist(r.data)).catch(() => {})
    api.get('/notif-settings').then(res => {
      const d = res.data
      setSettings({
        absensi_siswa_ke_wali: !!d.absensi_siswa_ke_wali,
        guru_belum_ceklok: !!d.guru_belum_ceklok,
        batas_ceklok_guru: d.batas_ceklok_guru || '07:30',
        template_absensi_wali: d.template_absensi_wali || '',
        template_guru_ceklok: d.template_guru_ceklok || '',
        notif_jadwal_guru: !!d.notif_jadwal_guru,
        template_jadwal_guru: d.template_jadwal_guru || '',
        notif_ujian_guru: !!d.notif_ujian_guru,
        template_ujian_guru: d.template_ujian_guru || '',
        notif_ekskul_guru: !!d.notif_ekskul_guru,
        template_ekskul_guru: d.template_ekskul_guru || '',
        notif_cs_bot: !!d.notif_cs_bot,
        notif_keuangan_wali: !!d.notif_keuangan_wali,
        keuangan_frekuensi: d.keuangan_frekuensi || 'bulanan',
        keuangan_hari: d.keuangan_hari || '',
        keuangan_jam: d.keuangan_jam || '08:00',
        template_keuangan_wali: d.template_keuangan_wali || '',
        notif_adzan: !!d.notif_adzan,
        adzan_waktu: d.adzan_waktu || 'subuh,dzuhur,ashar,maghrib,isya',
        adzan_menit_awal: Number(d.adzan_menit_awal) || 0,
        adzan_target: d.adzan_target || 'gtk',
        template_adzan: d.template_adzan || '',
        adzan_suara: d.adzan_suara === undefined ? true : !!d.adzan_suara,
        adzan_suara_url: d.adzan_suara_url || '',
      })
    })
    // Peringatan dini: pengingat jadwal guru hanya terbit bila lembaga punya
    // tahun ajaran aktif yang mencakup tanggal hari ini (lihat queueDueSchedules
    // di server/wa-queue.cjs). Tanpa itu, centangnya menyala tapi tidak berkirim.
    api.get('/tahun-ajaran').then(res => {
      const rows = Array.isArray(res.data) ? res.data : []
      const hariIniWIB = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
      setTahunAktif(rows.find((t: any) => t.aktif && t.tanggal_mulai <= hariIniWIB && hariIniWIB <= t.tanggal_selesai) || null)
    }).catch(() => {}).finally(() => setCekTahunAjaran(true))
    // Waktu sholat hari ini (dihitung server dari kota/koordinat lembaga) supaya
    // admin melihat kapan adzan berikutnya akan berbunyi.
    api.get('/jadwal-sholat').then(r => setJadwalSholat(r.data || null)).catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/notif-settings', settings)
      toast.success('Pengaturan notifikasi berhasil disimpan')
    } catch { toast.error('Gagal menyimpan') }
    finally { setSaving(false) }
  }

  // Pemilih waktu adzan: minimal satu harus tetap tercentang supaya tidak
  // kosong (kalau kosong server mengirim semuanya, itu mengejutkan admin).
  const URUT_WAKTU = ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya']
  const LABEL_WAKTU: Record<string, string> = { subuh: 'Subuh', dzuhur: 'Dzuhur', ashar: 'Ashar', maghrib: 'Maghrib', isya: 'Isya' }
  const waktuAdzanTerpilih = String(settings.adzan_waktu || '').split(',').map(v => v.trim()).filter(v => URUT_WAKTU.includes(v))
  const toggleWaktuAdzan = (k: string) => {
    const dipilih = waktuAdzanTerpilih.includes(k)
      ? waktuAdzanTerpilih.filter(x => x !== k)
      : [...waktuAdzanTerpilih, k]
    if (!dipilih.length) return toast.error('Minimal satu waktu harus dipilih')
    setSettings({ ...settings, adzan_waktu: URUT_WAKTU.filter(x => dipilih.includes(x)).join(',') })
  }
  const ujiAdzan = async (waktu: string) => {
    setTesting(true)
    try {
      const r = await api.post('/notif/adzan', { waktu })
      toast.success(`Adzan ${LABEL_WAKTU[waktu] || waktu} diantrekan ke ${r.data.queued || 0} penerima`)
    } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal uji kirim') }
    finally { setTesting(false) }
  }

  // Putar berkas suara yang akan dipakai (URL lembaga bila diisi, kalau tidak
  // /adhan.mp3). Tombol ini ada karena fitur adzan tidak bisa "dicoba" tanpa
  // menunggu waktu sholat — dulu admin hanya bisa menebak apakah suaranya jalan.
  const putarContohSuara = async () => {
    const a = audioContohRef.current
    if (!a) return
    if (!a.paused) { a.pause(); a.currentTime = 0; setMemutarContoh(false); return }
    a.currentTime = 0
    try { await a.play(); setMemutarContoh(true) }
    catch { setMemutarContoh(false); toast.error('Peramban menolak memutar suara. Coba klik lagi.') }
  }

  // Adzan berikutnya hari ini menurut jadwal server (untuk ditampilkan).
  const adzanBerikutnya = (() => {
    if (!jadwalSholat) return null
    const menit = (j?: string) => /^\d{2}:\d{2}$/.test(String(j || '')) ? Number(String(j).slice(0, 2)) * 60 + Number(String(j).slice(3)) : -1
    const sekarang = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(':', ''))
    const nowMenit = Math.floor(sekarang / 100) * 60 + (sekarang % 100)
    const daftar = URUT_WAKTU.filter(k => waktuAdzanTerpilih.includes(k))
      .map(k => ({ k, m: menit(jadwalSholat[k]) })).filter(x => x.m >= 0).sort((a, b) => a.m - b.m)
    return daftar.find(x => x.m >= nowMenit) || daftar[0] || null
  })()

  const addWhitelist = async () => { try { await api.post('/notif-whitelist', whiteForm); const r = await api.get('/notif-whitelist'); setWhitelist(r.data); setWhiteForm({ target_type: 'phone', phone: '', target_id: '', reason: '' }); toast.success('Whitelist ditambah') } catch { toast.error('Gagal whitelist') } }
  const delWhitelist = async (id: string) => { try { await api.delete('/notif-whitelist/' + id); setWhitelist(whitelist.filter(w => w.id !== id)) } catch { toast.error('Gagal hapus') } }
  const handleTestJadwalGuru = async () => { setTesting(true); try { const r = await api.post('/notif/jadwal-guru'); toast.success(`Antrean notif jadwal: ${r.data.queued || 0}`) } catch { toast.error('Gagal test jadwal') } finally { setTesting(false) } }
  const handleTestUjianGuru = async () => { setTesting(true); try { const r = await api.post('/notif/ujian-guru'); toast.success(`Antrean notif ujian: ${r.data.queued || 0}`) } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal test ujian — pastikan hari ini ditandai hari ujian di Kalender KBM') } finally { setTesting(false) } }
  const handleTestEkskulGuru = async () => { setTesting(true); try { const r = await api.post('/notif/ekskul-guru'); toast.success(`Antrean notif ekskul: ${r.data.queued || 0}`) } catch (e: any) { toast.error(e.response?.data?.error || 'Gagal test ekskul') } finally { setTesting(false) } }

  const handleTestGuruCeklok = async () => {
    setTesting(true)
    try {
      const res = await api.post('/notif/cek-guru-ceklok')
      if (res.data.skipped) {
        toast.error('Notifikasi guru nonaktif, aktifkan dulu')
      } else {
        toast.success(`Notifikasi terkirim ke ${res.data.sent} guru`)
      }
    } catch { toast.error('Gagal mengirim notifikasi') }
    finally { setTesting(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 font-display">Pengaturan Notifikasi WA</h1>
          <p className="text-gray-500 text-sm mt-1">Atur notifikasi otomatis via WhatsApp</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
        </button>
      </div>

      {cekTahunAjaran && !tahunAktif && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Tahun ajaran aktif belum diisi — pengingat jadwal guru tidak akan terkirim</p>
            <p className="mt-1">
              Pengingat jadwal mengajar hanya dibuat bila lembaga punya tahun ajaran berstatus aktif yang
              mencakup tanggal hari ini. Saat ini syarat itu belum terpenuhi, jadi centang di bawah belum
              berpengaruh. Notifikasi absensi (ke wali murid dan ceklok guru) tidak terpengaruh.
            </p>
            <Link to="/admin/tahun-ajaran" className="inline-block mt-2 font-semibold underline">Buka menu Tahun Ajaran →</Link>
          </div>
        </div>
      )}

      {/* Toggle Notifikasi */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Notif Absensi Siswa -> Wali */}
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="w-10 h-10 shrink-0 bg-green-100 rounded-lg flex items-center justify-center">
                <Bell size={20} className="text-green-600" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-800">Notifikasi Absensi ke Wali Murid</h3>
                <p className="break-words text-xs text-gray-500 mt-0.5">Kirim WA otomatis ke wali saat siswa diabsen</p>
              </div>
            </div>
            <Toggle
              checked={settings.absensi_siswa_ke_wali}
              onChange={next => setSettings({ ...settings, absensi_siswa_ke_wali: next })}
              label="Notifikasi Absensi ke Wali Murid"
              toneClassName="bg-green-600"
            />
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">Template Pesan</label>
            <textarea
              value={settings.template_absensi_wali}
              onChange={e => setSettings({...settings, template_absensi_wali: e.target.value})}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="Gunakan variable: {nama_ortu}, {nama}, {status}, {tanggal}, {lembaga}"
            />
            <p className="text-xs text-gray-400 mt-1">Variable: {'{nama_ortu}'}, {'{nama}'}, {'{status}'}, {'{tanggal}'}, {'{lembaga}'}</p>
          </div>
        </div>

        {/* Notif Guru Belum Ceklok */}
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="w-10 h-10 shrink-0 bg-orange-100 rounded-lg flex items-center justify-center">
                <MessageSquare size={20} className="text-orange-600" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-800">Notifikasi Guru Belum Ceklok</h3>
                <p className="break-words text-xs text-gray-500 mt-0.5">Kirim WA ke guru yang belum absen</p>
              </div>
            </div>
            <Toggle
              checked={settings.guru_belum_ceklok}
              onChange={next => setSettings({ ...settings, guru_belum_ceklok: next })}
              label="Notifikasi Guru Belum Ceklok"
              toneClassName="bg-green-600"
            />
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Batas Waktu Ceklok</label>
              <input type="time" value={settings.batas_ceklok_guru} onChange={e => setSettings({...settings, batas_ceklok_guru: e.target.value})} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <p className="text-xs text-gray-400 mt-1">Guru akan dinotif jika belum ceklok setelah jam ini</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Template Pesan</label>
              <textarea
                value={settings.template_guru_ceklok}
                onChange={e => setSettings({...settings, template_guru_ceklok: e.target.value})}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Gunakan variable: {nama}, {tanggal}, {lembaga}"
              />
              <p className="text-xs text-gray-400 mt-1">Variable: {'{nama}'}, {'{tanggal}'}, {'{lembaga}'}</p>
            </div>
            <button onClick={handleTestGuruCeklok} disabled={testing} className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-lg text-sm hover:bg-orange-200 disabled:opacity-50">
              {testing ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
              Test Kirim Notifikasi Sekarang
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 space-y-4">
        <h3 className="font-semibold text-gray-800">Notifikasi Jadwal Guru Mapel</h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.notif_jadwal_guru} onChange={e => setSettings({...settings, notif_jadwal_guru: e.target.checked})} /> Aktifkan pengingat 5 menit sebelum jam mapel</label>
        {cekTahunAjaran && !tahunAktif && (
          <p className="text-xs text-amber-700">Belum ada tahun ajaran aktif — centang ini belum akan mengirim apa pun.</p>
        )}
        <textarea value={settings.template_jadwal_guru} onChange={e => setSettings({...settings, template_jadwal_guru: e.target.value})} rows={3} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="{nama_guru}, {mapel}, {rombel}, {jam_mulai}, {jam_selesai}, {tanggal}, {lembaga}" />
        <button onClick={handleTestJadwalGuru} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Test Notif Jadwal Sekarang</button>
      </div>

      {/* Notif Jadwal Ujian -> Guru Pengawas (hanya saat mode ujian aktif) */}
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 space-y-4">
        <h3 className="font-semibold text-gray-800">Notifikasi Jadwal Ujian Guru</h3>
        <p className="text-xs text-gray-500 -mt-2">Kirim WA pengingat 5 menit sebelum jadwal ujian ke guru pengawas, hanya pada tanggal yang ditandai sebagai hari ujian di Kalender KBM.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.notif_ujian_guru} onChange={e => setSettings({...settings, notif_ujian_guru: e.target.checked})} /> Aktifkan pengingat 5 menit sebelum jam ujian</label>
        <textarea value={settings.template_ujian_guru} onChange={e => setSettings({...settings, template_ujian_guru: e.target.value})} rows={3} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="{nama_guru}, {mapel}, {rombel}, {jam_mulai}, {jam_selesai}, {tanggal}, {lembaga}" />
        <button onClick={handleTestUjianGuru} className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Test Notif Ujian Sekarang</button>
      </div>

      {/* Notif Jadwal Ekskul/Peminatan -> Guru Pembina */}
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 shrink-0 bg-violet-100 rounded-lg flex items-center justify-center">
              <Bell size={20} className="text-violet-600" />
            </div>
              <div className="min-w-0">
              <h3 className="font-semibold text-gray-800">Notifikasi Jadwal Ekskul / Peminatan</h3>
              <p className="break-words text-xs text-gray-500 mt-0.5">Kirim WA pengingat ke guru pembina 5 menit sebelum jadwal ekskul/peminatan dimulai</p>
            </div>
          </div>
          <Toggle
              checked={settings.notif_ekskul_guru}
              onChange={next => setSettings({ ...settings, notif_ekskul_guru: next })}
              label="Notifikasi Jadwal Ekskul / Peminatan"
              toneClassName="bg-violet-600"
            />
        </div>
        <textarea value={settings.template_ekskul_guru} onChange={e => setSettings({...settings, template_ekskul_guru: e.target.value})} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="{nama_guru}, {ekskul}, {jam_mulai}, {jam_selesai}, {tanggal}, {lembaga}" />
        <button onClick={handleTestEkskulGuru} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm">Test Notif Ekskul Sekarang</button>
      </div>

      {/* Bot CS WhatsApp -> jawab otomatis pesan masuk sesuai peran */}
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 shrink-0 bg-sky-100 rounded-lg flex items-center justify-center">
              <MessageSquare size={20} className="text-sky-600" />
            </div>
              <div className="min-w-0">
              <h3 className="font-semibold text-gray-800">Bot CS WhatsApp</h3>
              <p className="break-words text-xs text-gray-500 mt-0.5">Jawab otomatis pesan masuk: wali murid lihat tagihan/tabungan/nilai/absensi/jadwal anak, guru lihat jadwal mengajarnya</p>
            </div>
          </div>
          <Toggle
              checked={settings.notif_cs_bot}
              onChange={next => setSettings({ ...settings, notif_cs_bot: next })}
              label="Bot CS WhatsApp"
              toneClassName="bg-sky-600"
            />
        </div>
        <p className="break-words text-xs text-gray-500">Kata kunci yang dikenali: <span className="font-mono">menu/halo, jadwal, nilai, tagihan, tabungan, absensi, info</span>. Hanya nomor terdaftar (guru/wali) yang mendapat data pribadi; nomor asing hanya menerima info lembaga.</p>
      </div>

      {/* Notif Laporan Keuangan -> Wali Murid */}
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 shrink-0 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Bell size={20} className="text-emerald-600" />
            </div>
              <div className="min-w-0">
              <h3 className="font-semibold text-gray-800">Notifikasi Laporan Keuangan ke Wali Murid</h3>
              <p className="break-words text-xs text-gray-500 mt-0.5">Kirim WA ringkasan tabungan, tagihan & pembayaran siswa secara terjadwal</p>
            </div>
          </div>
          <Toggle
              checked={settings.notif_keuangan_wali}
              onChange={next => setSettings({ ...settings, notif_keuangan_wali: next })}
              label="Notifikasi Laporan Keuangan ke Wali Murid"
              toneClassName="bg-emerald-600"
            />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Frekuensi</label>
            <select value={settings.keuangan_frekuensi} onChange={e => setSettings({...settings, keuangan_frekuensi: e.target.value, keuangan_hari: ''})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="mingguan">Mingguan</option>
              <option value="bulanan">Bulanan</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{settings.keuangan_frekuensi === 'mingguan' ? 'Hari Kirim' : 'Tanggal Kirim'}</label>
            {settings.keuangan_frekuensi === 'mingguan' ? (
              <select value={settings.keuangan_hari} onChange={e => setSettings({...settings, keuangan_hari: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">-- Pilih --</option>
                {['senin','selasa','rabu','kamis','jumat','sabtu','minggu'].map(d => <option key={d} value={d} className="capitalize">{d.charAt(0).toUpperCase()+d.slice(1)}</option>)}
              </select>
            ) : (
              <select value={settings.keuangan_hari} onChange={e => setSettings({...settings, keuangan_hari: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">-- Pilih --</option>
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>Tanggal {d}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Jam Kirim</label>
            <input type="time" value={settings.keuangan_jam} onChange={e => setSettings({...settings, keuangan_jam: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Template Pesan</label>
          <textarea value={settings.template_keuangan_wali} onChange={e => setSettings({...settings, template_keuangan_wali: e.target.value})} rows={5} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="{nama_ortu}, {nama}, {tagihan}, {pembayaran}, {saldo_tabungan}, {lembaga}" />
          <p className="text-xs text-gray-400 mt-1">Variable: {'{nama_ortu}'}, {'{nama}'}, {'{tagihan}'}, {'{pembayaran}'}, {'{saldo_tabungan}'}, {'{lembaga}'}</p>
        </div>
        <button
          onClick={async () => {
            if (!settings.notif_keuangan_wali) return toast.error('Aktifkan dulu notifikasi keuangan')
            setTesting(true)
            try {
              const r = await api.post('/notif/keuangan-wali')
              toast.success(`Laporan keuangan diantrekan ke ${r.data.queued || 0} wali murid`)
            } catch (err: any) { toast.error(err.response?.data?.error || 'Gagal uji kirim') }
            finally { setTesting(false) }
          }}
          disabled={testing}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-50"
        >Test Kirim Sekarang</button>
      </div>

      {/* ===== Notifikasi Adzan ===== */}
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-semibold text-gray-800">
              <BellRing size={18} className="shrink-0 text-emerald-600" /> Notifikasi Adzan
            </h3>
            <p className="mt-0.5 break-words text-xs text-gray-500">
              Pesan WA dan suara adzan saat masuk waktu sholat. Waktu dihitung dari kota/koordinat lembaga di menu Pengaturan.
            </p>
          </div>
          <Toggle
            checked={settings.notif_adzan}
            onChange={next => setSettings({ ...settings, notif_adzan: next })}
            label="Notifikasi Adzan"
          />
        </div>

        <div className={'space-y-4 ' + (settings.notif_adzan ? '' : 'opacity-60')}>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Waktu yang dinotifikasi</label>
            <div className="flex flex-wrap gap-2">
              {URUT_WAKTU.map(k => {
                const aktif = waktuAdzanTerpilih.includes(k)
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={aktif}
                    onClick={() => toggleWaktuAdzan(k)}
                    className={'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ' + (aktif
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50')}
                  >
                    {LABEL_WAKTU[k]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-1 block text-sm font-medium text-gray-700">Kirim berapa menit sebelum adzan</label>
              <input
                type="number" min={0} max={120}
                value={settings.adzan_menit_awal}
                onChange={e => setSettings({ ...settings, adzan_menit_awal: Math.max(0, Math.min(120, Number(e.target.value) || 0)) })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
              <p className="mt-1 text-xs text-gray-400">0 = tepat saat adzan. Suara di aplikasi selalu tepat waktu.</p>
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-sm font-medium text-gray-700">Penerima pesan WA</label>
              <select
                value={settings.adzan_target}
                onChange={e => setSettings({ ...settings, adzan_target: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="gtk">Semua GTK yang punya nomor HP</option>
                <option value="admin">Hanya admin / kepala / bendahara / TU</option>
              </select>
              <p className="mt-1 text-xs text-gray-400">Pilih yang kedua untuk menghemat kuota WA di lembaga besar.</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700">Suara adzan di aplikasi</p>
                <p className="mt-0.5 break-words text-xs text-gray-400">
                  Diputar di peramban saat waktu sholat masuk (peran staf). Pastikan volume perangkat tidak senyap.
                </p>
              </div>
              <Toggle
                checked={settings.adzan_suara}
                onChange={next => setSettings({ ...settings, adzan_suara: next })}
                label="Suara adzan di aplikasi"
              />
            </div>
            <div className="mt-3 min-w-0">
              <label className="mb-1 block text-xs font-medium text-gray-600">URL suara adzan sendiri <span className="text-gray-400">(opsional)</span></label>
              <input
                value={settings.adzan_suara_url}
                onChange={e => setSettings({ ...settings, adzan_suara_url: e.target.value })}
                placeholder="Kosongkan untuk memakai adzan bawaan (/adhan.mp3)"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>

            {/* Uji langsung: dulu satu-satunya cara memastikan suara berbunyi
                adalah menunggu waktu sholat — sehingga fitur terasa "tidak
                bekerja" padahal hanya belum waktunya. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <audio
                ref={audioContohRef}
                src={(settings.adzan_suara_url || '').trim() || '/adhan.mp3'}
                preload="auto"
                data-adzan-contoh="true"
                onEnded={() => setMemutarContoh(false)}
                onPause={() => setMemutarContoh(false)}
              />
              <button
                type="button"
                data-adzan-uji-suara="true"
                onClick={putarContohSuara}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                {memutarContoh ? <Square size={13} /> : <Volume2 size={13} />}
                {memutarContoh ? 'Hentikan' : 'Coba suara'}
              </button>
              {adzanBerikutnya && (
                <span className="inline-flex min-w-0 items-center gap-1.5 break-words text-xs text-gray-500">
                  <Clock size={13} className="shrink-0" />
                  Adzan berikutnya: {LABEL_WAKTU[adzanBerikutnya.k]} {jadwalSholat[adzanBerikutnya.k]} WIB
                  {jadwalSholat?.kota ? ` · ${jadwalSholat.kota}` : ''}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Isi pesan WA</label>
            <textarea
              value={settings.template_adzan}
              onChange={e => setSettings({ ...settings, template_adzan: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="Assalamualaikum, waktu {waktu} telah masuk untuk wilayah {kota} pukul {jam}. - {lembaga}"
            />
            <p className="mt-1 break-words text-xs text-gray-400">Boleh memakai: {'{nama}'}, {'{waktu}'}, {'{jam}'}, {'{kota}'}, {'{tanggal}'}, {'{lembaga}'}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-600">Uji kirim:</span>
            {URUT_WAKTU.map(k => (
              <button
                key={k}
                type="button"
                disabled={testing}
                onClick={() => ujiAdzan(k)}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
              >
                {LABEL_WAKTU[k]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 space-y-4">
        <h3 className="font-semibold text-gray-800">Whitelist Notifikasi WA</h3>
        <p className="break-words text-xs text-gray-500">Nomor/target di daftar ini dikecualikan dari antrean WA.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2"><select value={whiteForm.target_type} onChange={e=>setWhiteForm({...whiteForm,target_type:e.target.value})} className="px-3 py-2 border rounded-lg text-sm"><option value="phone">Nomor</option><option value="siswa">Siswa</option><option value="gtk">GTK</option></select><input value={whiteForm.phone} onChange={e=>setWhiteForm({...whiteForm,phone:e.target.value})} placeholder="Nomor WA" className="px-3 py-2 border rounded-lg text-sm" /><input value={whiteForm.target_id} onChange={e=>setWhiteForm({...whiteForm,target_id:e.target.value})} placeholder="ID target opsional" className="px-3 py-2 border rounded-lg text-sm" /><button onClick={addWhitelist} className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm">Tambah</button></div>
        <div className="divide-y">{whitelist.map(w=><div key={w.id} className="py-2 flex justify-between text-sm"><span>{w.target_type} {w.phone || w.target_id} {w.reason ? '· '+w.reason : ''}</span><button onClick={()=>delWhitelist(w.id)} className="text-red-600">Hapus</button></div>)}</div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h4 className="font-medium text-blue-800 mb-2">Cara Kerja Notifikasi</h4>
        <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
          <li><strong>Absensi Siswa:</strong> Otomatis kirim WA ke nomor wali murid setiap kali absensi siswa disimpan (hadir/sakit/izin/alpha)</li>
          <li><strong>Guru Belum Ceklok:</strong> Kirim WA pengingat ke guru yang belum melakukan ceklok kehadiran setelah batas waktu</li>
          <li>Pastikan WhatsApp Gateway sudah terkoneksi di menu Pengaturan WhatsApp</li>
          <li>Nomor HP siswa (wali) dan guru harus terisi di data master</li>
        </ul>
      </div>
    </div>
  )
}
