import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Typography from '@tiptap/extension-typography'
import Gapcursor from '@tiptap/extension-gapcursor'
import Focus from '@tiptap/extension-focus'
import CharacterCount from '@tiptap/extension-character-count'
import EmojiPicker from 'emoji-picker-react'
import { useState, useRef, useEffect } from 'react'
import {
  Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Image as ImageIcon, Link as LinkIcon,
  Undo, Redo, Smile, Camera, Video, MapPin, Hash, Circle, Plus,
  Minus, CheckSquare, X, Loader2, Type, Superscript as SuperscriptIcon, Subscript as SubscriptIcon, Underline as UnderlineIcon
} from 'lucide-react'

interface RichEditorProps {
  content: string
  onChange: (content: string, media: any[]) => void
  placeholder?: string
  disabled?: boolean
  maxChars?: number
}

export default function RichEditor({ content, onChange, placeholder = 'Tulis posting...', disabled = false, maxChars = 5000 }: RichEditorProps) {
  const [showEmoji, setShowEmoji] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [showImage, setShowImage] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [imageAlt, setImageAlt] = useState('')
  const [showPoll, setShowPoll] = useState(false)
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [showLocation, setShowLocation] = useState(false)
  const [locationName, setLocationName] = useState('')
  const [locationLat, setLocationLat] = useState('')
  const [locationLng, setLocationLng] = useState('')
  const [showActivity, setShowActivity] = useState(false)
  const [activityType, setActivityType] = useState('')
  const [charCount, setCharCount] = useState(0)
  const [media, setMedia] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder }),
      Image.configure({ HTMLAttributes: { class: 'rounded-lg max-w-full h-auto' } }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-primary underline', target: '_blank', rel: 'noopener noreferrer' } }),
      TaskList, TaskItem,
      Highlight.configure({ multicolor: true }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color.configure({ types: ['textStyle'] }),
      Subscript, Superscript, Typography, Gapcursor, Focus,
      CharacterCount.configure({ limit: maxChars, mode: 'textSize' })
    ],
    content,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      const text = editor.getText()
      setCharCount(text.length)
      const images = [...editor.view.dom.querySelectorAll('img')].map(img => ({
        url: img.src,
        alt: img.alt || '',
        width: img.width,
        height: img.height
      }))
      onChange(html, images)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-xl max-w-none focus:outline-none min-h-[200px] p-3 bg-white dark:bg-gray-800 rounded-lg',
        spellcheck: 'true'
      }
    }
  })

  const addImage = () => {
    if (imageUrl.trim()) {
      editor?.chain().focus().setImage({ src: imageUrl.trim(), alt: imageAlt.trim() }).run()
      setMedia(prev => [...prev, { url: imageUrl.trim(), alt: imageAlt.trim(), type: 'image' }])
      setImageUrl('')
      setImageAlt('')
      setShowImage(false)
    }
  }

  const addLink = () => {
    if (linkUrl.trim()) {
      editor?.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.trim() }).run()
      setLinkUrl('')
      setLinkText('')
      setShowLink(false)
    }
  }

  const addPoll = () => {
    const validOptions = pollOptions.filter(o => o.trim())
    if (validOptions.length >= 2) {
      const pollData = { options: validOptions.map(o => ({ text: o.trim(), votes: 0 })), multiple: false }
      editor?.chain().focus().insertContent(`<div data-poll='${JSON.stringify(pollData)}' class="poll-card border rounded-lg p-3 my-2"><h4 class="font-medium mb-2">Poling</h4><ul class="space-y-1">${validOptions.map(o => `<li class="flex items-center gap-2"><input type="radio" name="poll" disabled /> ${o.trim()}</li>`).join('')}</ul></div>`).run()
      setPollOptions(['', ''])
      setShowPoll(false)
    }
  }

  const addLocation = () => {
    if (locationName.trim()) {
      const locData = { name: locationName.trim(), lat: parseFloat(locationLat) || 0, lng: parseFloat(locationLng) || 0 }
      editor?.chain().focus().insertContent(`<div data-location='${JSON.stringify(locData)}' class="location-card border rounded-lg p-3 my-2 flex items-center gap-2"><MapPin class="text-primary" size={20} /> <span>${locationName.trim()}</span></div>`).run()
      setLocationName('')
      setLocationLat('')
      setLocationLng('')
      setShowLocation(false)
    }
  }

  const addActivity = () => {
    if (activityType.trim()) {
      editor?.chain().focus().insertContent(`<span data-activity="${activityType.trim()}" class="activity-badge inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium"><Circle class="w-1.5 h-1.5" /> ${activityType.trim()}</span> `).run()
      setActivityType('')
      setShowActivity(false)
    }
  }

  const handleFileUpload = async (files: FileList) => {
    if (!files.length) return
    setUploading(true)
    const formData = new FormData()
    Array.from(files).forEach(f => formData.append('file', f))
    try {
      const res = await fetch('/api/posting/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.media_url) {
        if (data.media_type === 'image') {
          editor?.chain().focus().setImage({ src: data.media_url, alt: data.filename }).run()
        } else if (data.media_type === 'video') {
          editor?.chain().focus().insertContent(`<video src="${data.media_url}" controls class="max-w-full rounded-lg my-2" />`).run()
        }
        setMedia(prev => [...prev, { url: data.media_url, type: data.media_type, filename: data.filename }])
      }
    } catch (e) {
      console.error('Upload failed', e)
    } finally {
      setUploading(false)
    }
  }

  const handleEmojiClick = (emoji: any) => {
    editor?.chain().focus().insertContent(emoji.native).run()
    setShowEmoji(false)
  }

  if (!editor) return <div className="animate-pulse h-[200px] bg-gray-100 rounded-lg" />

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 overflow-hidden">
      <div className="flex flex-wrap gap-1 p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Heading 1"><Heading1 size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Heading 2"><Heading2 size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Heading 3"><Heading3 size={16} /></button>
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Bold (Ctrl+B)"><Bold size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Italic (Ctrl+I)"><Italic size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Strikethrough"><Strikethrough size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleCode().run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Inline Code"><Code size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleHighlight().run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Highlight"><span className="text-xs font-bold bg-yellow-200 px-1 rounded">ab</span></button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Underline (Ctrl+U)"><UnderlineIcon size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleSubscript().run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Subscript"><SubscriptIcon size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleSuperscript().run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Superscript"><SuperscriptIcon size={16} /></button>
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Bullet List"><List size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Numbered List"><ListOrdered size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleTaskList().run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Task List"><CheckSquare size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Quote"><Quote size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('left').run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Align Left"><span className="text-xs">⬛</span></button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('center').run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Align Center"><span className="text-xs">⬜</span></button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('right').run()} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Align Right"><span className="text-xs">▪️</span></button>
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
        <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={disabled || !editor.can().undo()} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Undo (Ctrl+Z)"><Undo size={16} /></button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={disabled || !editor.can().redo()} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Redo (Ctrl+Y)"><Redo size={16} /></button>
        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1 ml-auto" />
        <button type="button" onClick={() => setShowEmoji(!showEmoji)} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Emoji"><Smile size={18} /></button>
        <button type="button" onClick={() => setShowLink(true)} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Insert Link"><LinkIcon size={16} /></button>
        <button type="button" onClick={() => { fileInputRef.current?.click() }} disabled={disabled || uploading} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Upload Image/Video"><Camera size={16} /></button>
        <input type="file" ref={fileInputRef} accept="image/*,video/*" multiple onChange={e => e.target.files && handleFileUpload(e.target.files)} className="hidden" />
        <button type="button" onClick={() => setShowImage(true)} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Insert Image by URL"><ImageIcon size={16} /></button>
        <button type="button" onClick={() => setShowPoll(true)} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Insert Poll"><Hash size={16} /></button>
        <button type="button" onClick={() => setShowLocation(true)} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Insert Location"><MapPin size={16} /></button>
        <button type="button" onClick={() => setShowActivity(true)} disabled={disabled} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="Insert Activity"><Plus size={16} /></button>
        <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 flex items-center px-2">{charCount}/{maxChars}</span>
      </div>

      <EditorContent editor={editor} className="p-2" />

      {showEmoji && (
        <div className="absolute z-50 mt-1 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg" style={{ width: '320px' }}>
          <EmojiPicker onEmojiClick={handleEmojiClick} searchPlaceholder="Cari emoji..." categoryIcons={{ smileys_people: '😀', animals_nature: '🌿', food_drink: '🍔', travel_places: '🌍', activities: '⚽', objects: '💡', symbols: '✨', flags: '🏁' }} />
        </div>
      )}

      {showLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 shadow-xl">
            <h3 className="font-bold text-lg mb-4">Sisipkan Link</h3>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium mb-1">Teks link</label><input type="text" value={linkText} onChange={e => setLinkText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" placeholder="Teks yang ditampilkan" /></div>
              <div><label className="block text-sm font-medium mb-1">URL *</label><input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" placeholder="https://example.com" /></div>
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <button onClick={() => { setShowLink(false); setLinkUrl(''); setLinkText('') }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">Batal</button>
              <button onClick={addLink} className="px-4 py-2 bg-primary text-white rounded-lg">Sisipkan</button>
            </div>
          </div>
        </div>
      )}

      {showImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 shadow-xl">
            <h3 className="font-bold text-lg mb-4">Sisipkan Gambar via URL</h3>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium mb-1">URL Gambar *</label><input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" placeholder="https://example.com/image.jpg" /></div>
              <div><label className="block text-sm font-medium mb-1">Alt Text</label><input type="text" value={imageAlt} onChange={e => setImageAlt(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" placeholder="Deskripsi gambar" /></div>
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <button onClick={() => { setShowImage(false); setImageUrl(''); setImageAlt('') }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">Batal</button>
              <button onClick={addImage} className="px-4 py-2 bg-primary text-white rounded-lg">Sisipkan</button>
            </div>
          </div>
        </div>
      )}

      {showPoll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 shadow-xl">
            <h3 className="font-bold text-lg mb-4">Buat Poling</h3>
            <div className="space-y-2 mb-4">
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input type="text" value={opt} onChange={e => { const arr = [...pollOptions]; arr[i] = e.target.value; setPollOptions(arr) }} className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" placeholder={`Opsi ${i + 1}`} />
                  {pollOptions.length > 2 && <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))} className="p-2 text-red-500 hover:bg-red-50 rounded"><X size={16} /></button>}
                </div>
              ))}
            </div>
            <button onClick={() => setPollOptions([...pollOptions, ''])} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm mb-4">+ Tambah Opsi</button>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowPoll(false); setPollOptions(['', '']) }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">Batal</button>
              <button onClick={addPoll} className="px-4 py-2 bg-primary text-white rounded-lg">Sisipkan Poling</button>
            </div>
          </div>
        </div>
      )}

      {showLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 shadow-xl">
            <h3 className="font-bold text-lg mb-4">Sisipkan Lokasi</h3>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium mb-1">Nama Tempat *</label><input type="text" value={locationName} onChange={e => setLocationName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" placeholder="Nama tempat (mis. Sekolah, Kantin)" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Latitude</label><input type="number" step="any" value={locationLat} onChange={e => setLocationLat(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" placeholder="-6.123456" /></div>
                <div><label className="block text-sm font-medium mb-1">Longitude</label><input type="number" step="any" value={locationLng} onChange={e => setLocationLng(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700" placeholder="106.123456" /></div>
              </div>
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <button onClick={() => { setShowLocation(false); setLocationName(''); setLocationLat(''); setLocationLng('') }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">Batal</button>
              <button onClick={addLocation} className="px-4 py-2 bg-primary text-white rounded-lg">Sisipkan Lokasi</button>
            </div>
          </div>
        </div>
      )}

      {showActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-6 shadow-xl">
            <h3 className="font-bold text-lg mb-4">Sisipkan Aktivitas</h3>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium mb-1">Tipe Aktivitas *</label>
                <select value={activityType} onChange={e => setActivityType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                  <option value="">Pilih aktivitas</option>
                  <option value="belajar">📚 Belajar</option>
                  <option value="olahraga">⚽ Olahraga</option>
                  <option value="kegiatan">🎪 Kegiatan</option>
                  <option value="liburan">🏖️ Liburan</option>
                  <option value="ibadah">🕌 Ibadah</option>
                  <option value="lainnya">📌 Lainnya</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-4 justify-end">
              <button onClick={() => { setShowActivity(false); setActivityType('') }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">Batal</button>
              <button onClick={addActivity} className="px-4 py-2 bg-primary text-white rounded-lg">Sisipkan</button>
            </div>
          </div>
        </div>
      )}

      {uploading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="flex items-center gap-3 px-6 py-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl"><Loader2 className="animate-spin text-primary" size={24} /> Mengunggah media...</div>
        </div>
      )}
    </div>
  )
}