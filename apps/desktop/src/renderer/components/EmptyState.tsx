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
      transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
      className="flex flex-col items-center justify-center gap-5 py-20 px-8 text-center"
    >
      <motion.div
        className="flex items-center justify-center w-14 h-14 rounded-2xl"
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
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
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
        <div className="flex items-center gap-2.5 mt-1">
          {action && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={action.onClick}
              className="px-4 py-2 rounded-xl text-xs font-medium text-white transition-opacity"
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
              className="px-4 py-2 rounded-xl text-xs transition-all"
              style={{
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-hairline)',
                background: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.color = 'var(--color-text-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--color-text-secondary)'
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
