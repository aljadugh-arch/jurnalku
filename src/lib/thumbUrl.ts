/**
 * Konversi URL /uploads/xxx.jpg → /api/thumb/xxx.jpg?s=200
 * Untuk foto kecil di grid/list. Full-size tetap pakai URL asli.
 */
export function thumbUrl(uploadUrl?: string, size = 200): string {
  if (!uploadUrl) return ''
  // Extract filename dari /uploads/filename.jpg
  const match = uploadUrl.match(/\/uploads\/(.+)$/)
  if (!match) return uploadUrl
  return `/api/thumb/${encodeURIComponent(match[1])}?s=${size}`
}
