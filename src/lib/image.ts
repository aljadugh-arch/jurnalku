// Kompres + resize gambar di sisi klien sebelum upload (hemat bandwidth & storage).
// Foto siswa/GTK cuma tampil di avatar bulat kecil -> 512px lebih dari cukup.
// ponytail: default 512px / q0.82 / JPEG. Butuh lebih tajam? naikkan maxSize/quality saat panggil.
export async function compressImage(
  file: File,
  opts: { maxSize?: number; quality?: number; mime?: string } = {}
): Promise<File> {
  const maxSize = opts.maxSize ?? 512
  const quality = opts.quality ?? 0.82
  const mime = opts.mime ?? 'image/jpeg'

  // Bukan gambar / SVG (vektor) -> jangan diutak-atik.
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = dataUrl
  })

  let { width, height } = img
  if (width > maxSize || height > maxSize) {
    if (width >= height) { height = Math.round((height * maxSize) / width); width = maxSize }
    else { width = Math.round((width * maxSize) / height); height = maxSize }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file // fallback: tak bisa kompres -> pakai asli
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality))
  if (!blob) return file
  // Kalau hasil malah lebih besar (mis. foto sudah kecil), pakai asli.
  if (blob.size >= file.size) return file

  const ext = mime === 'image/webp' ? '.webp' : mime === 'image/png' ? '.png' : '.jpg'
  const name = file.name.replace(/\.\w+$/, '') + ext
  return new File([blob], name, { type: mime })
}

export function imageFileToDataUrl(
  file: File,
  opts: { maxSize?: number; quality?: number; mime?: string } = {}
): Promise<string> {
  return compressImage(file, { maxSize: 1600, quality: 0.78, mime: 'image/webp', ...opts }).then(compressed =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = reject
      reader.readAsDataURL(compressed)
    })
  )
}
