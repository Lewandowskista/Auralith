import type { ReactElement, ReactNode } from 'react'
import { FadeRise } from '@auralith/design-system'
import { LoadingRows } from './LoadingRows'

type EmptyStateProps = {
  icon: ReactNode
  title: string
  description: string
  action?: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
}

type ScreenShellProps = {
  title: string
  subtitle?: string
  actions?: ReactNode
  /** "padded" = single scrollable column (Home, Weather, Automations, Settings)
   *  "split"  = fills height without outer scroll (Assistant, News, Knowledge, Activity) */
  variant?: 'padded' | 'split'
  loading?: boolean
  loadingRows?: number
  emptyState?: EmptyStateProps
  children: ReactNode
}

export function ScreenShell({
  title,
  subtitle,
  actions,
  variant = 'padded',
  loading = false,
  loadingRows = 4,
  emptyState,
  children,
}: ScreenShellProps): ReactElement {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sticky header band */}
      <div
        className="shrink-0 border-b border-[var(--color-border-hairline)] px-8 py-5"
        style={{ background: 'rgba(14,14,20,0.80)', backdropFilter: 'blur(12px)' }}
      >
        <FadeRise>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h1>
              {subtitle && (
                <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{subtitle}</p>
              )}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        </FadeRise>
      </div>

      {/* Body */}
      {loading ? (
        <div
          className={variant === 'padded' ? 'overflow-y-auto px-8 py-6' : 'flex-1 overflow-hidden'}
        >
          <LoadingRows count={loadingRows} />
        </div>
      ) : emptyState ? (
        <EmptyStateBlock {...emptyState} />
      ) : variant === 'padded' ? (
        <div className="flex-1 overflow-y-auto">{children}</div>
      ) : (
        <div className="flex flex-1 overflow-hidden">{children}</div>
      )}
    </div>
  )
}

function EmptyStateBlock({
  icon,
  title,
  description,
  action,
  secondaryAction,
}: EmptyStateProps): ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-20 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--color-border-hairline)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {icon}
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{title}</p>
        <p className="max-w-xs text-xs leading-relaxed text-[var(--color-text-tertiary)]">
          {description}
        </p>
      </div>
      {(action ?? secondaryAction) && (
        <div className="mt-1 flex items-center gap-2">
          {action && (
            <button
              onClick={action.onClick}
              className="rounded-lg px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-low)]"
              style={{ background: 'var(--color-accent-gradient)' }}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="rounded-lg border border-[var(--color-border-hairline)] px-4 py-2 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-low)]"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
