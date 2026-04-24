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
          <motion.div
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center px-4"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className={cn(
                'w-full max-w-[720px] rounded-[28px] border border-white/[0.08] bg-[rgba(16,16,22,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl',
                className,
              )}
              style={contentStyle}
            >
              {(title || description) && (
                <div className="relative border-b border-white/[0.06] px-6 py-5 pr-14">
                  {title && <h2 className="text-xl font-semibold text-[#F4F4F8]">{title}</h2>}
                  {description && <p className="mt-1 text-sm text-[#6F6F80]">{description}</p>}
                  <button
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg text-[#6F6F80] transition hover:bg-white/[0.06] hover:text-[#F4F4F8]"
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
