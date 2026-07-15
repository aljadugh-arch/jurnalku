import type { ReactNode } from 'react'

// ResponsiveTable: renders a real <table> on md+ screens, and stacked cards on
// mobile — driven by a column config so pages don't hand-roll two layouts.
//
// Usage:
//   <ResponsiveTable
//     columns={[{key:'nama',header:'Nama'},{key:'nis',header:'NIS'}]}
//     rows={siswaList}
//     rowKey={(r)=>r.id}
//     actions={(r)=><button onClick={()=>edit(r)}>Edit</button>}
//   />
// Each column may supply render(row) for custom cells.

export interface Column<T> {
  key: string
  header: string
  render?: (row: T) => ReactNode
  className?: string      // extra cell classes (e.g. text-right)
  hideOnMobile?: boolean  // omit from mobile card view
}

export default function ResponsiveTable<T>({ columns, rows, rowKey, actions, empty = 'Belum ada data' }: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  actions?: (row: T) => ReactNode
  empty?: string
}) {
  if (!rows || rows.length === 0) {
    return <p className="text-gray-400 text-sm text-center py-8">{empty}</p>
  }

  const cell = (row: T, col: Column<T>) => (col.render ? col.render(row) : (row as any)[col.key])

  return (
    <>
      {/* Desktop / tablet: real table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              {columns.map((c) => (
                <th key={c.key} className={'py-2.5 px-3 font-semibold ' + (c.className || '')}>{c.header}</th>
              ))}
              {actions && <th className="py-2.5 px-3 font-semibold text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-gray-100 hover:bg-gray-50 transition">
                {columns.map((c) => (
                  <td key={c.key} className={'py-2.5 px-3 text-gray-700 ' + (c.className || '')}>{cell(row, c)}</td>
                ))}
                {actions && <td className="py-2.5 px-3 text-right whitespace-nowrap">{actions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="md:hidden space-y-2.5">
        {rows.map((row) => {
          const cols = columns.filter((c) => !c.hideOnMobile)
          const [first, ...rest] = cols
          return (
            <div key={rowKey(row)} className="bg-white rounded-xl p-3.5 border border-gray-100 shadow-sm">
              {/* Primary field as card title */}
              {first && (
                <div className="font-semibold text-gray-800 text-sm break-words mb-2">{cell(row, first)}</div>
              )}
              {/* Remaining fields as label:value rows, left-aligned */}
              <div className="space-y-1">
                {rest.map((c) => (
                  <div key={c.key} className="flex items-baseline gap-2 text-xs">
                    <span className="text-gray-400 w-24 shrink-0">{c.header}</span>
                    <span className="text-gray-700 font-medium break-words min-w-0">{cell(row, c)}</span>
                  </div>
                ))}
              </div>
              {actions && <div className="flex justify-end gap-2 mt-3 pt-2.5 border-t border-gray-100">{actions(row)}</div>}
            </div>
          )
        })}
      </div>
    </>
  )
}
