import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Edit2, Heart, MessageCircle, Share2, Flag, MoreVertical, ThumbsUp, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import RichEditor from '../../components/RichEditor'

interface Post {
  id: string
  judul: string
  isi: string
  konten: string
  kategori: string
  penulis_id: string
  penulis_nama: string
  media: any[]
  activity_type: string
  location_lat: number | null
  location_lng: number | null
  location_name: string
  poll_data: any[]
  tags: string[]
  likes_count: number
  comments_count: number
  shares_count: number
  created_at: string
  user_liked?: boolean
}

export default function PostingPage() {
  const { user } = useAuthStore()
  const [posts, setPosts] = useState<Post[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editPost, setEditPost] = useState<Post | null>(null)
  const [form, setForm] = useState({
    judul: '',
    isi: '',
    konten: '',
    kategori: 'berita',
    media: [] as any[],
    activity_type: '',
    location_lat: null as number | null,
    location_lng: null as number | null,
    location_name: '',
    poll_data: [] as any[],
    tags: [] as string[]
  })
  const [loading, setLoading] = useState(false)
  const [expandedPost, setExpandedPost] = useState<string | null>(null)

  const canPost = ['admin', 'super_admin', 'guru', 'wali_kelas', 'kepala', 'operator'].includes(user?.role || '')
  const canDelete = (post: Post) => user?.id === post.penulis_id || ['admin', 'super_admin'].includes(user?.role || '')

  const fetchPosts = async () => {
    try {
      const res = await api.get('/posting')
      setPosts(res.data)
    } catch {
      toast.error('Gagal memuat posting')
    }
  }

  useEffect(() => { fetchPosts() }, [])

  const openCreate = () => {
    setEditPost(null)
    setForm({ judul: '', isi: '', konten: '', kategori: 'berita', media: [], activity_type: '', location_lat: null, location_lng: null, location_name: '', poll_data: [], tags: [] })
    setShowForm(true)
  }

  const openEdit = (post: Post) => {
    setEditPost(post)
    setForm({
      judul: post.judul,
      isi: post.isi,
      konten: post.konten || post.isi,
      kategori: post.kategori,
      media: post.media || [],
      activity_type: post.activity_type || '',
      location_lat: post.location_lat,
      location_lng: post.location_lng,
      location_name: post.location_name || '',
      poll_data: post.poll_data || [],
      tags: post.tags || []
    })
    setShowForm(true)
  }

  const handleEditorChange = (html: string, media: any[]) => {
    setForm(prev => ({ ...prev, konten: html, isi: html.replace(/<[^>]*>/g, ''), media }))
  }

  const handleSubmit = async () => {
    if (!form.judul.trim() || !form.konten.trim()) {
      toast.error('Judul dan isi wajib diisi')
      return
    }
    setLoading(true)
    try {
      const payload = {
        judul: form.judul.trim(),
        isi: form.isi.trim() || form.konten.replace(/<[^>]*>/g, '').trim(),
        konten: form.konten,
        kategori: form.kategori,
        media: form.media,
        activity_type: form.activity_type,
        location_lat: form.location_lat,
        location_lng: form.location_lng,
        location_name: form.location_name,
        poll_data: form.poll_data,
        tags: form.tags
      }
      if (editPost) {
        await api.put('/posting/' + editPost.id, payload)
        toast.success('Posting diperbarui')
      } else {
        await api.post('/posting', payload)
        toast.success('Posting diterbitkan')
      }
      setShowForm(false)
      setEditPost(null)
      setForm({ judul: '', isi: '', konten: '', kategori: 'berita', media: [], activity_type: '', location_lat: null, location_lng: null, location_name: '', poll_data: [], tags: [] })
      fetchPosts()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menerbitkan posting')
    } finally {
      setLoading(false)
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

  const handleLike = async (post: Post) => {
    try {
      await api.post(`/posting/${post.id}/like`)
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes_count: post.user_liked ? p.likes_count - 1 : p.likes_count + 1, user_liked: !post.user_liked } : p))
    } catch {
      toast.error('Gagal like posting')
    }
  }

  const handleShare = async (post: Post) => {
    try {
      await api.post(`/posting/${post.id}/share`)
      if (navigator.share) {
        await navigator.share({ title: post.judul, text: post.isi, url: window.location.href })
      } else {
        await navigator.clipboard.writeText(window.location.href)
        toast.success('Link disalin ke clipboard')
      }
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, shares_count: p.shares_count + 1 } : p))
    } catch {
      toast.error('Gagal bagikan posting')
    }
  }

  const renderMedia = (media: any[]) => {
    if (!media.length) return null
    return (
      <div className="mt-3 grid gap-2 grid-cols-2 md:grid-cols-3">
        {media.map((m, i) => (
          <div key={i} className="relative aspect-video rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
            {m.type === 'image' && <img src={m.url} alt={m.alt || ''} className="w-full h-full object-cover" />}
            {m.type === 'video' && <video src={m.url} controls className="w-full h-full" />}
          </div>
        ))}
      </div>
    )
  }

  const renderPoll = (pollData: any[]) => {
    if (!pollData.length) return null
    return (
      <div className="mt-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
        <h4 className="font-medium text-sm mb-2 flex items-center gap-1"><Flag size={14} /> Poling</h4>
        <ul className="space-y-1">
          {pollData.map((opt, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <input type="radio" name={`poll-${i}`} disabled />
              <span>{opt.text}</span>
              {opt.votes > 0 && <span className="text-xs text-gray-500">({opt.votes} suara)</span>}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const renderLocation = (loc: any) => {
    if (!loc?.name) return null
    return (
      <div className="mt-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center gap-2">
        <MapPin className="text-primary" size={18} />
        <span className="font-medium">{loc.name}</span>
        {loc.lat && loc.lng && <span className="text-xs text-gray-500 ml-auto">({loc.lat.toFixed(4)}, {loc.lng.toFixed(4)})</span>}
      </div>
    )
  }

  const renderActivity = (activityType: string) => {
    if (!activityType) return null
    const icons: Record<string, string> = { belajar: '📚', olahraga: '⚽', kegiatan: '🎪', liburan: '🏖️', ibadah: '🕌', lainnya: '📌' }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mt-2">
        <span>{icons[activityType] || '📌'}</span> {activityType}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Posting</h1>
          <p className="mt-1 text-sm text-gray-500">Berita dan pengumuman lembaga ({posts.length})</p>
        </div>
        {canPost && (
          <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary-dark">
            <Plus size={16} /> Buat Posting
          </button>
        )}
      </div>

      <div className="space-y-4">
        {posts.map(post => (
          <article key={post.id} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${
                post.kategori === 'pengumuman' ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                post.kategori === 'kegiatan' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}>
                {post.kategori}
              </span>
              <div className="flex gap-1">
                {canDelete(post) && (
                  <>
                    <button onClick={() => openEdit(post)} className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg" title="Edit"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(post.id)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg" title="Hapus"><Trash2 size={14} /></button>
                  </>
                )}
                <button onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" title={expandedPost === post.id ? 'Tutup' : 'Lihat selengkapnya'}><MoreVertical size={14} /></button>
              </div>
            </div>

            <h2 className="mt-3 font-bold text-gray-800 dark:text-gray-100">{post.judul}</h2>

            <div className="mt-2 prose prose-sm dark:prose-invert max-w-none">
              <div dangerouslySetInnerHTML={{ __html: post.konten || post.isi }} />
            </div>

            {renderMedia(post.media || [])}
            {renderPoll(post.poll_data || [])}
            {post.location_name && renderLocation({ name: post.location_name, lat: post.location_lat, lng: post.location_lng })}
            {renderActivity(post.activity_type)}

            {post.tags && post.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {post.tags.map((tag, i) => (
                  <span key={i} className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">#{tag}</span>
                ))}
              </div>
            )}

            <footer className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
              <span>{post.penulis_nama} · {new Date(post.created_at + 'Z').toLocaleString('id-ID')}</span>
              <div className="flex gap-4 ml-auto">
                <button onClick={() => handleLike(post)} className={`flex items-center gap-1 ${post.user_liked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}>
                  <Heart className={`${post.user_liked ? 'fill-current' : ''}`} size={16} /> {post.likes_count}
                </button>
                <button onClick={() => handleShare(post)} className="flex items-center gap-1 text-gray-500 hover:text-primary">
                  <Share2 size={16} /> {post.shares_count}
                </button>
                <span className="flex items-center gap-1 text-gray-500"><MessageCircle size={16} /> {post.comments_count}</span>
              </div>
            </footer>
          </article>
        ))}
        {!posts.length && (
          <div className="flex flex-col items-center py-16 text-gray-400">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
              <Plus size={28} className="text-gray-300" />
            </div>
            <p className="text-sm">Belum ada posting.</p>
            {canPost && <button onClick={openCreate} className="mt-3 text-sm text-primary hover:underline">+ Buat posting pertama</button>}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-4xl rounded-xl bg-white dark:bg-gray-900 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">{editPost ? 'Edit Posting' : 'Buat Posting'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Judul *</label>
                <input type="text" value={form.judul} onChange={e => setForm({ ...form, judul: e.target.value })} placeholder="Judul posting..." className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Kategori</label>
                <select value={form.kategori} onChange={e => setForm({ ...form, kategori: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800">
                  <option value="berita">Berita</option>
                  <option value="pengumuman">Pengumuman</option>
                  <option value="kegiatan">Kegiatan</option>
                  <option value="lainnya">Lainnya</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Isi *</label>
                <RichEditor content={form.konten} onChange={handleEditorChange} placeholder="Tulis isi posting..." disabled={loading} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} disabled={loading} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Batal</button>
              <button onClick={handleSubmit} disabled={loading} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50">{loading ? 'Menerbitkan...' : (editPost ? 'Simpan' : 'Terbitkan')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}