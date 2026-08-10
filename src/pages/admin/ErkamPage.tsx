import { Wallet, Clock } from 'lucide-react'

export default function ErkamPage() {
  const fitur = [
    'Penyusunan RKAM (Rencana Kegiatan dan Anggaran Madrasah)',
    'Realisasi anggaran dan pelaporan BOS',
    'Buku kas umum dan pembantu',
    'Sinkronisasi dengan data keuangan sekolah',
  ]
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">ERKAM</h1>
        <p className="text-gray-500 text-sm mt-1">Elektronik Rencana Kerja dan Anggaran Madrasah</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
          <Wallet size={36} className="text-primary" />
        </div>
        <div className="inline-flex items-center gap-2 mt-6 px-4 py-1.5 rounded-full bg-amber-100 text-amber-700 text-sm font-medium">
          <Clock size={16} /> Segera Hadir
        </div>
        <h2 className="text-xl font-bold text-gray-800 mt-4 font-display">Modul ERKAM sedang dikembangkan</h2>
        <p className="text-gray-500 text-sm mt-2 max-w-md mx-auto">
          Kelola perencanaan dan anggaran madrasah secara digital, terintegrasi dengan sistem keuangan JURNALKU.
        </p>

        <div className="max-w-md mx-auto mt-8 text-left space-y-2">
          {fitur.map((f, i) => (
            <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-lg px-4 py-3">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              <span className="text-sm text-gray-700">{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
