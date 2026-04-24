import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { cn } from './utils'

type WidgetGridProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

type WidgetCardProps = {
  children: ReactNode
  title: string
  subtitle?: string
  action?: ReactNode
  colSpan?: 1 | 2
  className?: string
}

export function WidgetGrid({ children, className, style }: WidgetGridProps): ReactElement {
  return (
    <div className={cn('grid grid-cols-1 gap-4 xl:grid-cols-2', className)} style={style}>
      {children}
    </div>
  )
}

export function WidgetCard({
  children,
  title,
  subtitle,
  action,
  colSpan = 1,
  className,
}: WidgetCardProps): ReactElement {
  return (
    <section
      className={cn(
        'rounded-[24px] border border-white/[0.06] bg-[rgba(16,16,22,0.78)] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl',
        colSpan === 2 ? 'xl:col-span-2' : '',
        className,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#F4F4F8]">{title}</h3>
          {subtitle && <p className="mt-1 text-xs text-[#6F6F80]">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
