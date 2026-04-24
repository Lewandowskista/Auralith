import type { ReactElement, ReactNode } from 'react'
import { motion } from 'framer-motion'

type Props = {
  icon: ReactNode
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
  secondaryAction?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
}: Props): ReactElement {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="flex flex-col items-center justify-center gap-4 py-20 px-8 text-center"
    >
      <div
        className="flex items-center justify-center w-14 h-14 rounded-2xl"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--color-border-hairline)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {icon}
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {title}
        </p>
        <p
          className="text-xs max-w-xs leading-relaxed"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          {description}
        </p>
      </div>
      {(action ?? secondaryAction) && (
        <div className="flex items-center gap-2 mt-1">
          {action && (
            <button
              onClick={action.onClick}
              className="px-4 py-2 rounded-lg text-xs font-medium text-white transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              style={{
                background: 'var(--color-accent-gradient)',
                border: 'none',
                cursor: 'default',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.9'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1'
              }}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="px-4 py-2 rounded-lg text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              style={{
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-hairline)',
                background: 'transparent',
                cursor: 'default',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </motion.div>
  )
}
