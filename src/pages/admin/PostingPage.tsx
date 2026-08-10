import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Edit2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

interface Post {
  id: string
  judul: string
  isi: string
  kategori: string
  penulis_id: string
  penulis_nama: string
  created_at: string
}

export default function PostingPage() {
  const { user } = useAuthStore()
  const [posts, setPosts] = useState<Post[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editPost, setEditPost] = useState<Post | null>(null)
  const [form, setForm] = useState({ judul: '', isi: '', kategori: 'berita' })

  const canPost = ['admin', 'super_admin', 'guru', 'wali_kelas', 'kepala', 'operator'].includes(user?.role || '')
  const canDelete = (post: Post) => user?.id === post.penulis_id || ['admin', 'super_admin'].includes(user?.role || '')

  const fetchPosts = () => {
    api.get('/posting')
      .then(res => setPosts(res.data))
      .catch(() => toast.error('Gagal memuat posting'))
  }

  useEffect(() => { fetchPosts() }, [])

  const openCreate = () => {
    setEditPost(null)
    setForm({ judul: '', isi: '', kategori: 'berita' })
    setShowForm(true)
  }

  const openEdit = (post: Post) => {
    setEditPost(post)
    setForm({ judul: post.judul, isi: post.isi, kategori: post.kategori })
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!form.judul.trim() || !form.isi.trim()) {
      toast.error('Judul dan isi wajib diisi')
      return
    }
    try {
      if (editPost) {
        await api.put('/posting/' + editPost.id, form)
        toast.success('Posting diperbarui')
      } else {
        await api.post('/posting', form)
        toast.success('Posting diterbitkan')
      }
      setShowForm(false)
      setEditPost(null)
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
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Posting</h1>
          <p className="mt-1 text-sm text-gray-500">Berita dan pengumuman lembaga ({posts.length})</p>
        </div>
        {canPost && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary-dark"
          >
            <Plus size={16} />
            Buat Posting
          </button>
        )}
      </div>

      {/* Posts grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {posts.map(post => (
          <article
            key={post.id}
            className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm flex flex-col"
          >
            <div className="flex items-start justify-between gap-2">
              <span className={'rounded-full px-2 py-1 text-xs font-medium capitalize ' + (
                post.kategori === 'pengumuman' ? 'bg-yellow-50 text-yellow-700' :
                post.kategori === 'kegiatan' ? 'bg-green-50 text-green-700' :
                'bg-blue-50 text-blue-700'
              )}>
                {post.kategori}
              </span>
              <div className="flex gap-1">
                {canDelete(post) && (
                  <>
                    <button onClick={() => openEdit(post)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg" title="Edit">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(post.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="Hapus">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
            <h2 className="mt-3 font-bold text-gray-800">{post.judul}</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 flex-1 line-clamp-4">{post.isi}</p>
            <footer className="mt-4 border-t pt-3 text-xs text-gray-400">
              {post.penulis_nama} · {new Date(post.created_at + 'Z').toLocaleString('id-ID')}
            </footer>
          </article>
        ))}
        {!posts.length && (
          <div className="col-span-3 flex flex-col items-center py-16 text-gray-400">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <Plus size={28} className="text-gray-300" />
            </div>
            <p className="text-sm">Belum ada posting.</p>
            {canPost && (
              <button onClick={openCreate} className="mt-3 text-sm text-primary hover:underline">
                + Buat posting pertama
              </button>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">{editPost ? 'Edit Posting' : 'Buat Posting'}</h2>
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
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark"
              >
                {editPost ? 'Simpan' : 'Terbitkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
