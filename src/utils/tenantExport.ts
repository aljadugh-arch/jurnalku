export type TenantExportSettings = {
  nama_lembaga?: unknown
  alamat?: unknown
  logo?: unknown
}

export function exportSafeName(value: unknown, fallback = 'Tenant') {
  const safe = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return safe || fallback
}

export function tenantExportFilename(kind: string, tenantName: unknown, period: string, extension: 'xlsx' | 'pdf') {
  return `${exportSafeName(kind, 'Laporan')}_${exportSafeName(tenantName)}_${exportSafeName(period, 'periode')}.${extension}`
}

export function tenantIdentity(settings: TenantExportSettings) {
  return {
    name: String(settings.nama_lembaga || 'Lembaga'),
    address: String(settings.alamat || ''),
    logo: String(settings.logo || ''),
  }
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
