import type { ReactElement, ReactNode } from 'react'
import { cn } from './utils'

export type DataTableColumn<T> = {
  id: string
  header: string
  className?: string
  render: (row: T) => ReactNode
}

type DataTableProps<T> = {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  emptyLabel?: string
  className?: string
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyLabel = 'No rows',
  className,
}: DataTableProps<T>): ReactElement {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03]',
        className,
      )}
    >
      <table className="min-w-full border-collapse">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            {columns.map((column) => (
              <th
                key={column.id}
                className={cn(
                  'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6F6F80]',
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-[#6F6F80]">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-white/[0.04] last:border-b-0">
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn('px-4 py-3 align-top text-sm text-[#E4E4EC]', column.className)}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
