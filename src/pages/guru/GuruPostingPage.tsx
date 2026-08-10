import { useState, useEffect } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
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

export default function PostingPageGuru() {
  const [posts, setPosts] = useState<Post[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ judul: '', isi: '', kategori: 'berita' })
  const [userId, setUserId] = useState<string>('')

  const fetchPosts = () => {
    api.get('/posting')
      .then(res => setPosts(res.data))
      .catch(() => toast.error('Gagal memuat posting'))
  }

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || 'null')
      if (u?.id) setUserId(u.id)
    } catch {}
    fetchPosts()
  }, [])

  const handleSubmit = async () => {
    if (!form.judul.trim() || !form.isi.trim()) {
      toast.error('Judul dan isi wajib diisi')
      return
    }
    try {
      await api.post('/posting', form)
      toast.success('Posting diterbitkan')
      setShowForm(false)
      setForm({ judul: '', isi: '', kategori: 'berita' })
      fetchPosts()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menerbitkan posting')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus posting ini?')) return
    try {
      await api.delete('/posting/' + id)
      toast.success('Posting dihapus')
      fetchPosts()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menghapus posting')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Posting</h1>
          <p className="mt-1 text-sm text-gray-500">Berita dan pengumuman lembaga</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary-dark"
        >
          <Plus size={16} />
          Buat Posting
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {posts.map(post => (
          <article key={post.id} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium capitalize text-blue-700">
                {post.kategori}
              </span>
              {post.penulis_id === userId && (
                <button
                  onClick={() => handleDelete(post.id)}
                  className="text-red-500 hover:text-red-700"
                  title="Hapus"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <h2 className="mt-3 font-bold text-gray-800">{post.judul}</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{post.isi}</p>
            <footer className="mt-4 border-t pt-3 text-xs text-gray-400">
              {post.penulis_nama} · {new Date(post.created_at + 'Z').toLocaleString('id-ID')}
            </footer>
          </article>
        ))}
        {!posts.length && (
          <p className="py-10 text-center text-sm text-gray-400 md:col-span-2 xl:col-span-3">
            Belum ada posting.
          </p>
        )}
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowForm(false)}
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-6" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">Buat Posting</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Judul *</label>
                <input
                  type="text"
                  value={form.judul}
                  onChange={e => setForm({ ...form, judul: e.target.value })}
                  placeholder="Judul posting..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kategori</label>
                <select
                  value={form.kategori}
                  onChange={e => setForm({ ...form, kategori: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="berita">Berita</option>
                  <option value="pengumuman">Pengumuman</option>
                  <option value="kegiatan">Kegiatan</option>
                  <option value="lainnya">Lainnya</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Isi *</label>
                <textarea
                  value={form.isi}
                  onChange={e => setForm({ ...form, isi: e.target.value })}
                  placeholder="Tulis isi posting..."
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700"
              >
                Batal
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark"
              >
                Terbitkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
