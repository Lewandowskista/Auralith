import type { ReactElement, ReactNode } from 'react'
import { cn } from './utils'

export type TabItem = {
  id: string
  label: string
  icon?: ReactNode
}

type TabsProps = {
  items: TabItem[]
  value: string
  onValueChange: (value: string) => void
  className?: string
}

export function Tabs({ items, value, onValueChange, className }: TabsProps): ReactElement {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-1',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            onClick={() => onValueChange(item.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
              active
                ? 'border border-violet-500/20 bg-violet-500/15 text-violet-200'
                : 'border border-transparent text-[#A6A6B3] hover:bg-white/[0.04] hover:text-[#F4F4F8]',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
