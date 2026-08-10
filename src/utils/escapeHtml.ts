/**
 * Helper escape HTML untuk pemakaian pada dokumen print/preview
 * yang dibentuk lewat `printWindow.document.write(...)`.
 *
 * Tanpa escape, nama rombel/mapel/guru yang berisi karakter
 * HTML (mis. `<img onerror=>`) akan dieksekusi di window popup.
 * Pada dasarnya self-XSS karena admin dapat input sendiri, tetapi
 * lebih aman untuk meloloskan semua output teks.
 */
export function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
