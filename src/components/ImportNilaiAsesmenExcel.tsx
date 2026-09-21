import { useState, useRef } from 'react'
import api from '../../services/api'
import { Upload, Download, AlertCircle, CheckCircle } from 'lucide-react'
import Papa from 'papaparse'
import type { ParseResult } from 'papaparse'

interface ImportNilaiAsesmenExcelProps {
  jenis: 'sts' | 'sas'
  rombel_id: string
  selectedMapel: string
  tahunAjaran: string
  semester: string
  onSuccess?: () => void
}

export default function ImportNilaiAsesmenExcel({
  jenis,
  rombel_id,
  selectedMapel,
  tahunAjaran,
  semester,
  onSuccess
}: ImportNilaiAsesmenExcelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  const generateTemplate = () => {
    const template = [
      ['NIS', 'Nama', 'Nilai'],
      ['001', 'Ahmad Rizki', '85'],
      ['002', 'Siti Nurhaliza', '90']
    ]
    
    const csv = template.map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `template-nilai-${jenis.toUpperCase()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const parseFile = (file: File) => {
    return new Promise<any[]>((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results: ParseResult<any>) => {
          resolve(results.data)
        },
        error: (error: Error) => {
          reject(error)
        }
      })
    })
  }

  const validateRow = (row: any, rowIndex: number): { valid: boolean; error?: string; item?: any } => {
    const nis = String(row.NIS || '').trim()
    const nama = String(row.Nama || '').trim()
    const nilaiStr = String(row.Nilai || '').trim()

    if (!nis) return { valid: false, error: `Row ${rowIndex}: NIS kosong` }
    if (!nama) return { valid: false, error: `Row ${rowIndex}: Nama kosong` }
    if (!nilaiStr) return { valid: false, error: `Row ${rowIndex}: Nilai kosong` }

    const nilai = Number(nilaiStr)
    if (isNaN(nilai)) return { valid: false, error: `Row ${rowIndex}: Nilai harus angka` }
    if (nilai < 0 || nilai > 100) return { valid: false, error: `Row ${rowIndex}: Nilai harus 0-100` }

    return {
      valid: true,
      item: { nis, nama, nilai }
    }
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setLoading(true)
    setMessage('')
    setErrors([])

    try {
      const rows = await parseFile(file)
      const validationErrors: string[] = []
      const items: any[] = []

      for (let i = 0; i < rows.length; i++) {
        const result = validateRow(rows[i], i + 2)
        if (!result.valid) {
          validationErrors.push(result.error!)
        } else {
          items.push(result.item)
        }
      }

      if (validationErrors.length > 0) {
        setErrors(validationErrors)
        setMessage(`✗ ${validationErrors.length} error(s) dalam file`)
        setLoading(false)
        return
      }

      if (items.length === 0) {
        setMessage('✗ Tidak ada data valid dalam file')
        setLoading(false)
        return
      }

      // POST to API with rombel_id
      const payload = {
        jenis,
        tahun_ajaran: tahunAjaran,
        semester,
        rombel_id,
        items: items.map(item => ({
          siswa_id: item.nis, // API will resolve siswa by NIS or ID
          mapel_id: selectedMapel,
          nilai: item.nilai
        }))
      }

      const { data } = await api.post('/rapor/asesmen', payload)
      setMessage(`✓ ${data.message || `${data.count || items.length} nilai berhasil disimpan`}`)
      
      if (onSuccess) {
        onSuccess()
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || 'Gagal mengimpor file'
      setMessage(`✗ ${errorMsg}`)
      setErrors([errorMsg])
    } finally {
      setLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={generateTemplate}
          disabled={loading}
          className="px-3 py-2 text-sm bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-950/60 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <Download size={16} />
          Download Template CSV
        </button>

        <div className="relative">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileSelect}
            disabled={loading}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || !rombel_id || !selectedMapel}
            className="px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Upload size={16} />
            {loading ? 'Mengimpor...' : 'Impor Excel'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`rounded-lg p-3 text-sm flex items-start gap-2 ${
          message.startsWith('✓')
            ? 'bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-400'
            : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400'
        }`}>
          {message.startsWith('✓') ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
          <span>{message}</span>
        </div>
      )}

      {errors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3 space-y-1 max-h-48 overflow-y-auto">
          {errors.map((err, idx) => (
            <div key={idx} className="text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
              <span className="flex-shrink-0 mt-0.5">•</span>
              <span>{err}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
