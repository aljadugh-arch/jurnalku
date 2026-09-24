import { useState, useEffect } from 'react'
import { MessageCircle, Trash2, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'

interface Comment {
  id: string
  user_id: string
  user_name: string
  user_role: string
  isi: string
  created_at: string
}

interface PostingCommentsProps {
  postId: string
  commentsCount: number
  onCommentAdded?: () => void
}

export default function PostingComments({ postId, commentsCount, onCommentAdded }: PostingCommentsProps) {
  const { user } = useAuthStore()
  const [comments, setComments] = useState<Comment[]>([])
  const [showComments, setShowComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchComments = async () => {
    try {
      const res = await api.get(`/posting/${postId}/comments`)
      setComments(res.data || [])
    } catch {
      toast.error('Gagal memuat komentar')
    }
  }

  useEffect(() => {
    if (showComments) {
      fetchComments()
    }
  }, [showComments, postId])

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    
    setLoading(true)
    try {
      const res = await api.post(`/posting/${postId}/comments`, { isi: newComment })
      setComments([res.data, ...comments])
      setNewComment('')
      onCommentAdded?.()
      toast.success('Komentar ditambahkan')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Gagal menambah komentar')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('Hapus komentar?')) return
    
    try {
      await api.delete(`/posting/${postId}/comments/${commentId}`)
      setComments(comments.filter(c => c.id !== commentId))
      onCommentAdded?.()
      toast.success('Komentar dihapus')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Gagal menghapus komentar')
    }
  }

  const roleColors: Record<string, string> = {
    admin: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    super_admin: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    guru: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    kepala: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    siswa: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    bendahara: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    operator: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
      <button
        onClick={() => setShowComments(!showComments)}
        className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 text-sm font-medium mb-3"
      >
        <MessageCircle size={16} />
        {commentsCount} Komentar
      </button>

      {showComments && (
        <div className="space-y-3">
          {/* Input komentar */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
              placeholder="Tulis komentar..."
              disabled={loading}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={handleAddComment}
              disabled={loading || !newComment.trim()}
              className="px-3 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
            >
              <Send size={14} />
            </button>
          </div>

          {/* Daftar komentar */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-3">Belum ada komentar</p>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="text-sm bg-gray-50 dark:bg-gray-800 p-2.5 rounded-lg group">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{comment.user_name}</span>
                        <span className={`px-1.5 py-0.5 text-xs rounded-full ${roleColors[comment.user_role] || roleColors.siswa}`}>
                          {comment.user_role}
                        </span>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 break-words">{comment.isi}</p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 block">
                        {new Date(comment.created_at + 'Z').toLocaleString('id-ID')}
                      </span>
                    </div>
                    {(user?.id === comment.user_id || ['admin', 'super_admin'].includes(user?.role || '')) && (
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                        title="Hapus komentar"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
