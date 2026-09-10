import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'

export default function SiswaPerpustakaanPage() {
  const [content] = useState({
    name: 'Perpustakaan Digital',
    description: 'Perpustakaan digital sekolah belum diaktifkan oleh lembaga.',
    drive_folder_url: null
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 font-display">Perpustakaan Digital</h1>
        <p className="text-gray-500 text-sm mt-1">Akses koleksi buku dan referensi digital</p>
      </div>

      <div className="mx-auto max-w-2xl rounded-2xl border border-gray-100 bg-white p-8 shadow-sm text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 mx-auto mb-4">
          <BookOpen size={32} />
        </div>
        <h2 className="text-lg font-semibold text-gray-800">{content.name}</h2>
        <p className="mt-2 text-sm text-gray-600">{content.description}</p>
        {content.drive_folder_url && (
          <a
            href={content.drive_folder_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            <BookOpen size={16} />
            Buka Perpustakaan
          </a>
        )}
      </div>
    </div>
  )
}
