import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import api from '../../services/api'

interface Post {
  id: string
  judul: string
  isi: string
  kategori: string
  penulis_id: string
  penulis_nama: string
  created_at: string
}

export default function PostingPageSiswa() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/posting')
      .then(res => setPosts(res.data))
      .catch(() => toast.error('Gagal memuat posting'))
      .finally(() => setLoading(false))
  }, [])

  const kategoriColor: Record<string, string> = {
    berita: 'bg-blue-50 text-blue-700',
    pengumuman: 'bg-amber-50 text-amber-700',
    kegiatan: 'bg-green-50 text-green-700',
    lainnya: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Posting</h1>
        <p className="mt-1 text-sm text-gray-500">Berita dan pengumuman terbaru dari sekolah</p>
      </div>

      {loading ? (
        <p className="text-center text-sm text-gray-400 py-10">Memuat...</p>
      ) : posts.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">Belum ada posting.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {posts.map(post => (
            <article
              key={post.id}
              className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              <span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${kategoriColor[post.kategori] || kategoriColor.lainnya}`}>
                {post.kategori}
              </span>
              <h2 className="mt-3 font-bold text-gray-800">{post.judul}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{post.isi}</p>
              <footer className="mt-4 border-t pt-3 text-xs text-gray-400">
                {post.penulis_nama} · {new Date(post.created_at + 'Z').toLocaleString('id-ID')}
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
