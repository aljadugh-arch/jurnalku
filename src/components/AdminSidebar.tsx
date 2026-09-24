import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useSubscriptionStore } from '../stores/subscriptionStore'
import { pathEnabled } from '../lib/featureAccess'
import { adminMenuItems, type MenuItem } from '../lib/menuItems'

// Grouping menu untuk admin (sesuai referensi)
const menuGroups = [
  {
    name: 'DASHBOARD',
    items: ['Dashboard'],
  },
  {
    name: 'MASTER DATA',
    items: ['Data Siswa', 'Data GTK', 'Mata Pelajaran', 'Rombongan Belajar', 'Kalender KBM', 'Tahun Ajaran'],
  },
  {
    name: 'AKADEMIK',
    items: ['Jadwal Pelajaran', 'Absensi', 'Ceklok & Rekap', 'Absensi Saya', 'Jurnal Mengajar', 'Rapor Siswa', 
            'Ledger Nilai', 'Rekap Nilai per Mapel', 'Ujian & Bank Soal', 'Catatan Kepribadian'],
  },
  {
    name: 'LAYANAN',
    items: ['Perpustakaan Digital', 'Generator AI Guru', 'Posting'],
  },
  {
    name: 'KEUANGAN & OPERASIONAL',
    items: ['Keuangan', 'E-Kantin & Cashless'],
  },
  {
    name: 'KOMUNIKASI',
    items: ['WhatsApp'],
  },
  {
    name: 'MANAJEMEN LEMBAGA',
    items: ['Pengaturan', 'Manajemen Pengguna', 'Manajemen Lembaga', 'Backup & Restore', 'REST API Developer', 'Kelola Website'],
  },
]

interface SidebarMenuItem extends MenuItem {
  isExpanded?: boolean
  isActive?: boolean
}

export default function AdminSidebar() {
  const location = useLocation()
  const { user } = useAuthStore()
  const features = useSubscriptionStore(s => s.subscription?.features)
  
  // Expand submenu yang sedang aktif
  const [expandedMenus, setExpandedMenus] = useState<string[]>(() => {
    const expanded: string[] = []
    adminMenuItems.forEach(item => {
      if (item.children) {
        const isActive = item.children.some(child => child.path === location.pathname)
        if (isActive) expanded.push(item.label)
      }
    })
    return expanded
  })

  const toggleMenu = (label: string) => {
    setExpandedMenus(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    )
  }

  const isPathActive = (path?: string, children?: MenuItem['children']): boolean => {
    if (path && path === location.pathname) return true
    if (children) return children.some(child => child.path === location.pathname)
    return false
  }

  const getMenuItemByLabel = (label: string): SidebarMenuItem | undefined => {
    return adminMenuItems.find(item => item.label === label)
  }

  return (
    <aside className="hidden lg:flex lg:flex-col w-80 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 h-screen overflow-y-auto">
      <div className="p-6 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Jurnalku</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Admin Dashboard</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {menuGroups.map(group => {
          const groupMenus = group.items
            .map(getMenuItemByLabel)
            .filter((item): item is MenuItem => {
              if (!item) return false
              // Check if item or its children are enabled
              if (item.path) return pathEnabled(item.path, features)
              if (item.children) return item.children.some(child => pathEnabled(child.path, features))
              return true
            })

          if (groupMenus.length === 0) return null

          return (
            <div key={group.name}>
              <p className="px-3 mb-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {group.name}
              </p>
              <div className="space-y-0.5">
                {groupMenus.map(item => {
                  const isActive = isPathActive(item.path, item.children)
                  const isExpanded = expandedMenus.includes(item.label)
                  const hasChildren = !!item.children

                  return (
                    <div key={item.label}>
                      {hasChildren ? (
                        <button
                          onClick={() => toggleMenu(item.label)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            isActive
                              ? 'bg-primary/10 text-primary dark:bg-primary/20'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="flex-shrink-0">{item.icon}</span>
                            <span className="truncate">{item.label}</span>
                          </div>
                          <ChevronDown
                            size={16}
                            className={`flex-shrink-0 transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      ) : (
                        <Link
                          to={item.path || '#'}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            isActive
                              ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                          }`}
                        >
                          <span className="flex-shrink-0">{item.icon}</span>
                          <span className="truncate">{item.label}</span>
                        </Link>
                      )}

                      {/* Submenu */}
                      {hasChildren && isExpanded && (
                        <div className="mt-1 ml-3 pl-3 border-l border-gray-200 dark:border-gray-700 space-y-0.5">
                          {item.children
                            ?.filter(child => pathEnabled(child.path, features))
                            .map(child => {
                              const isChildActive = child.path === location.pathname
                              return (
                                <Link
                                  key={child.path}
                                  to={child.path}
                                  className={`flex items-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                    isChildActive
                                      ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary'
                                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                                  }`}
                                >
                                  <span className="truncate">{child.label}</span>
                                </Link>
                              )
                            })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
