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
        'group relative rounded-2xl border p-5 transition-all duration-200',
        colSpan === 2 ? 'xl:col-span-2' : '',
        className,
      )}
      style={{
        background: 'rgba(14,14,20,0.72)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.28), 0 1px 0 rgba(255,255,255,0.04) inset',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.border = '1px solid rgba(255,255,255,0.11)'
        e.currentTarget.style.boxShadow =
          '0 8px 32px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.04) inset'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.border = '1px solid rgba(255,255,255,0.07)'
        e.currentTarget.style.boxShadow =
          '0 4px 24px rgba(0,0,0,0.28), 0 1px 0 rgba(255,255,255,0.04) inset'
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold" style={{ color: '#F4F4F8' }}>
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-[11px]" style={{ color: '#6F6F80' }}>
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
