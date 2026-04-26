import { useEffect } from 'react'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from './utils'

type DialogProps = {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  className?: string
  contentStyle?: CSSProperties
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  contentStyle,
}: DialogProps): ReactElement | null {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  return (
    <AnimatePresence>
      {open ? (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              background: 'rgba(0,0,0,0.52)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center px-4"
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className={cn('w-full max-w-[720px] rounded-[24px] overflow-hidden', className)}
              style={{
                background: 'rgba(12,12,18,0.96)',
                border: '1px solid rgba(255,255,255,0.09)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.06) inset',
                backdropFilter: 'blur(32px)',
                WebkitBackdropFilter: 'blur(32px)',
                ...contentStyle,
              }}
            >
              {(title || description) && (
                <div
                  className="relative px-6 py-5 pr-14"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
                >
                  {title && (
                    <h2
                      className="text-[17px] font-semibold tracking-tight"
                      style={{ color: '#F4F4F8' }}
                    >
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="mt-1 text-sm" style={{ color: '#6F6F80' }}>
                      {description}
                    </p>
                  )}
                  <button
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl transition"
                    style={{ color: '#6F6F80' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                      e.currentTarget.style.color = '#F4F4F8'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = '#6F6F80'
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
              {children}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
