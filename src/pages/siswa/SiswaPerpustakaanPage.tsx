import { useEffect, useState } from 'react'
import { BookOpen, ExternalLink } from 'lucide-react'
import api from '../../services/api'

export default function SiswaPerpustakaanPage() {
  const [library, setLibrary] = useState<any>(undefined)
  useEffect(() => { api.get('/library').then(response => setLibrary(response.data)).catch(() => setLibrary(null)) }, [])
  if (library === undefined) return <div className="py-10 text-center text-sm text-gray-400">Memuat...</div>
  return <div className="mx-auto max-w-2xl rounded-2xl border bg-white p-6 shadow-sm">
    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><BookOpen/></span>
    <h1 className="mt-4 text-2xl font-bold text-gray-800">{library?.name || 'Perpustakaan Digital'}</h1>
    <p className="mt-2 text-sm text-gray-600">{library?.description || 'Perpustakaan digital belum diaktifkan oleh lembaga.'}</p>
    {library?.drive_folder_url && <a href={library.drive_folder_url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"><ExternalLink size={17}/>Buka Perpustakaan</a>}
  </div>
}
