import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, X, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

interface ImportExcelProps {
  title: string
  templateUrl?: string
  templateName?: string
  headerRow: number // 0-indexed row where headers are
  columnMap: Record<string, string> // excel column name -> api field name
  onImport: (data: Record<string, any>[]) => Promise<void>
  onClose: () => void
}

export default function ImportExcel({ title, templateUrl, templateName, headerRow, columnMap, onImport, onClose }: ImportExcelProps) {
  const [preview, setPreview] = useState<Record<string, any>[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const sh = wb.Sheets[wb.SheetNames[0]]
      const rows: any[][] = XLSX.utils.sheet_to_json(sh, { header: 1 })
      
      if (rows.length <= headerRow) { toast.error('File kosong atau format tidak sesuai'); return }
      
      const hdrs = (rows[headerRow] as string[]).map(h => (h || '').toString().trim())
      setHeaders(hdrs)
      
      const mapped: Record<string, any>[] = []
      for (let i = headerRow + 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.every(c => !c)) continue // skip empty rows
        const obj: Record<string, any> = {}
        hdrs.forEach((h, idx) => {
          const field = columnMap[h]
          if (field && row[idx] !== undefined && row[idx] !== null) {
            obj[field] = row[idx].toString().trim()
          }
        })
        if (Object.keys(obj).length > 0) mapped.push(obj)
      }
      setPreview(mapped)
    }
    reader.readAsArrayBuffer(file)
  }

  const handleImport = async () => {
    if (preview.length === 0) { toast.error('Tidak ada data untuk diimport'); return }
    setLoading(true)
    try {
      await onImport(preview)
      toast.success(`${preview.length} data berhasil diimport`)
      onClose()
    } catch (err: any) { toast.error(err.message || 'Gagal import') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2"><FileSpreadsheet size={20} /> {title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={20} /></button>
        </div>

        {(templateUrl || templateName) && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-blue-700">Template: <strong>{templateName || 'Excel'}</strong></p>
              <p className="text-xs text-blue-500 mt-1">Download template, isi data, lalu upload kembali.</p>
            </div>
            {templateUrl && (
              <a href={templateUrl} download className="shrink-0 inline-flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                <Download size={16} /> Download
              </a>
            )}
          </div>
        )}

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center mb-4">
          <Upload size={32} className="mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-500 mb-2">Pilih file Excel (.xls, .xlsx)</p>
          <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" onChange={handleFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">
            Pilih File
          </button>
        </div>

        {preview.length > 0 && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-gray-600">{preview.length} data siap diimport</p>
              <button onClick={handleImport} disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                {loading ? 'Mengimport...' : 'Import Sekarang'}
              </button>
            </div>
            <div className="overflow-x-auto border rounded-lg max-h-60 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">No</th>
                    {Object.values(columnMap).map(f => <th key={f} className="px-2 py-1 text-left">{f}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.slice(0, 20).map((row, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1">{i + 1}</td>
                      {Object.values(columnMap).map(f => <td key={f} className="px-2 py-1">{row[f] || '-'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 20 && <p className="text-xs text-gray-400 p-2 text-center">...dan {preview.length - 20} data lainnya</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
