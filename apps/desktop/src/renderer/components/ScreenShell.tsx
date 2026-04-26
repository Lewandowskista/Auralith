import type { ReactElement, ReactNode } from 'react'
import { motion } from 'framer-motion'
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
        className="shrink-0 px-8 py-4"
        style={{
          borderBottom: '1px solid var(--color-border-hairline)',
          background: 'rgba(10,10,16,0.82)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <FadeRise>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]">
                {title}
              </h1>
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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
      className="flex flex-1 flex-col items-center justify-center gap-5 px-8 py-20 text-center"
    >
      <motion.div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          background: 'rgba(139,92,246,0.08)',
          border: '1px solid rgba(139,92,246,0.16)',
          color: 'var(--color-text-tertiary)',
        }}
        animate={{
          boxShadow: [
            '0 0 0px rgba(139,92,246,0)',
            '0 0 20px rgba(139,92,246,0.12)',
            '0 0 0px rgba(139,92,246,0)',
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        {icon}
      </motion.div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</p>
        <p className="max-w-xs text-xs leading-relaxed text-[var(--color-text-tertiary)]">
          {description}
        </p>
      </div>
      {(action ?? secondaryAction) && (
        <div className="mt-1 flex items-center gap-2">
          {action && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={action.onClick}
              className="rounded-xl px-4 py-2 text-xs font-medium text-white"
              style={{
                background: 'var(--color-accent-gradient)',
                boxShadow: '0 2px 12px rgba(139,92,246,0.35)',
              }}
            >
              {action.label}
            </motion.button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="rounded-xl border border-[var(--color-border-hairline)] px-4 py-2 text-xs text-[var(--color-text-secondary)] transition hover:bg-white/[0.04] hover:text-[var(--color-text-primary)]"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </motion.div>
  )
}
