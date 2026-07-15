import { useState } from 'react'
import { Trash2, AlertTriangle, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'

interface BulkDeleteButtonProps {
  kategori: string       // 'siswa' | 'gtk' | 'mapel' | 'rombel' | 'jadwal' | ...
  label: string          // 'Siswa', 'GTK', dst — untuk teks tombol & dialog
  onDone?: () => void     // callback refresh data setelah hapus
}

export default function BulkDeleteButton({ kategori, label, onDone }: BulkDeleteButtonProps) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState<number | null>(null)

  const openDialog = async () => {
    setOpen(true)
    setConfirm('')
    try {
      const { data } = await api.get(`/bulk-delete/${kategori}/count`)
      setCount(data.count)
    } catch {
      setCount(null)
    }
  }

  const handleDelete = async () => {
    if (confirm !== 'HAPUS SEMUA') return toast.error('Ketik HAPUS SEMUA dulu')
    setBusy(true)
    try {
      await api.post(`/bulk-delete/${kategori}`, { confirm })
      toast.success(`Semua data ${label} berhasil dihapus`)
      setOpen(false)
      onDone?.()
    } catch (e: any) {
      toast.error(e.response?.data?.error || `Gagal hapus semua ${label}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
      >
        <Trash2 size={16} /> Hapus Semua
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-red-600" size={24} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-red-800">Hapus Semua {label}</h3>
                  <button onClick={() => !busy && setOpen(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
                    <X size={18} />
                  </button>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Tindakan ini menghapus <b>SELURUH data {label}</b>
                  {count !== null && <> (<b>{count}</b> baris)</>} beserta data turunan yang bergantung padanya.
                  Tindakan <b>tidak bisa dibatalkan</b>.
                </p>
                <p className="mt-3 text-sm font-medium text-gray-700">Ketik <code className="rounded bg-gray-100 px-1.5 py-0.5 text-red-600">HAPUS SEMUA</code> untuk konfirmasi:</p>
                <input
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="HAPUS SEMUA"
                  className="mt-2 w-full rounded-lg border border-red-300 px-4 py-2 text-sm focus:border-red-500 focus:outline-none"
                  autoFocus
                />
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    disabled={busy}
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={busy || confirm !== 'HAPUS SEMUA'}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    <Trash2 size={16} /> {busy ? 'Menghapus...' : 'Hapus Semua'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
