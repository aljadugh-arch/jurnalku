import toast from 'react-hot-toast'
import api from '../services/api'

// Upload image to backend OCR endpoint (tesseract.js, ind+eng) and return recognized text.
export async function ocrScanImage(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('image', file)
  const { data } = await api.post('/ocr/scan', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
  return data.text as string
}

export async function handleOcrFile(file: File | undefined | null, onText: (text: string) => void, setLoading: (v: boolean) => void) {
  if (!file) return
  setLoading(true)
  try {
    const text = await ocrScanImage(file)
    if (!text) { toast.error('Tidak ada teks yang terdeteksi pada gambar'); return }
    onText(text)
    toast.success('Teks berhasil diambil dari gambar')
  } catch (error: any) {
    toast.error(error.response?.data?.error || 'Gagal memproses OCR')
  } finally { setLoading(false) }
}
