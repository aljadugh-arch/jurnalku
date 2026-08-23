import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Building2, Users, Search } from 'lucide-react'
import api from '../services/api'

interface FoundationTenant {
  id: string
  slug: string
  nama: string
  domain_custom: string | null
  aktif: number
}

interface FoundationTenantPickerProps {
  selectedTenantId: string | null
  onSelectTenant: (tenantId: string | null) => void
  placeholder?: string
  showAllOption?: boolean
  allOptionLabel?: string
}

export default function FoundationTenantPicker({
  selectedTenantId,
  onSelectTenant,
  placeholder = 'Pilih lembaga...',
  showAllOption = true,
  allOptionLabel = 'Semua lembaga (gabungan)'
}: FoundationTenantPickerProps) {
  const [tenants, setTenants] = useState<FoundationTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get('/foundations/tenants')
      .then(res => {
        setTenants(res.data)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [])

  const filteredTenants = tenants.filter(t =>
    t.nama.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase())
  )

  const handleSelect = (tenantId: string | null) => {
    onSelectTenant(tenantId)
    setOpen(false)
    setSearch('')
  }

  const currentTenant = tenants.find(t => t.id === selectedTenantId)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Building2 className="text-gray-400" size={16} />
          <span className={`truncate ${!currentTenant && !selectedTenantId ? 'text-gray-400' : 'text-gray-800 dark:text-gray-100'}`}>
            {currentTenant?.nama || (selectedTenantId === 'all' ? allOptionLabel : placeholder)}
          </span>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
          {showAllOption && (
            <button
              onClick={() => handleSelect('all')}
              className={`w-full px-3 py-2 text-left flex items-center gap-2 text-sm ${
                selectedTenantId === 'all'
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Users className={selectedTenantId === 'all' ? 'text-primary' : 'text-gray-400'} size={16} />
              <span>{allOptionLabel}</span>
            </button>
          )}
          <div className="px-2 py-1 border-b border-gray-100 dark:border-gray-800">
            <div className="relative">
              <Search size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Cari lembaga..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          {loading ? (
            <div className="px-3 py-4 text-center text-sm text-gray-500">Memuat...</div>
          ) : filteredTenants.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-gray-500">Tidak ada lembaga ditemukan</div>
          ) : (
            <ul className="py-1" role="listbox">
              {filteredTenants.map(tenant => (
                <li key={tenant.id} role="option" aria-selected={selectedTenantId === tenant.id}>
                  <button
                    onClick={() => handleSelect(tenant.id)}
                    className={`w-full px-3 py-2 text-left flex items-center gap-2 text-sm ${
                      selectedTenantId === tenant.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Building2 className={selectedTenantId === tenant.id ? 'text-primary' : 'text-gray-400'} size={16} />
                    <span className="truncate">{tenant.nama}</span>
                    {tenant.domain_custom && (
                      <span className="text-xs text-gray-400 ml-auto">{tenant.domain_custom}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}