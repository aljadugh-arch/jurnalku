import { useState, useEffect } from 'react'
import { Heart, MessageCircle, Share2, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

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

export default function PostingPageSiswa() {
  const { user } = useAuthStore()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/posting')
      .then(res => setPosts(res.data))
      .catch(() => toast.error('Gagal memuat posting'))
      .finally(() => setLoading(false))
  }, [])

  const kategoriColor: Record<string, string> = {
    berita: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    pengumuman: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    kegiatan: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    lainnya: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
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
        <h4 className="font-medium text-sm mb-2 flex items-center gap-1">📊 Poling</h4>
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Posting</h1>
        <p className="mt-1 text-sm text-gray-500">Berita dan pengumuman terbaru dari sekolah</p>
      </div>

      {loading ? (
        <p className="text-center text-sm text-gray-400 py-10">Memuat...</p>
      ) : posts.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">Belum ada posting.</p>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <article key={post.id} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
              <span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${kategoriColor[post.kategori] || kategoriColor.lainnya}`}>
                {post.kategori}
              </span>
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
        </div>
      )}
    </div>
  )
}