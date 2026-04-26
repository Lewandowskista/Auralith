import { useEffect, useCallback, useState, useMemo } from 'react'
import type { ReactElement } from 'react'
import { Command } from 'cmdk'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, ArrowRight, Clock } from 'lucide-react'
import { KeyHint } from '@auralith/design-system'
import { motionDuration, motionEasing } from '@auralith/design-system'

export type PaletteItem = {
  id: string
  label: string
  description?: string
  icon?: ReactElement
  group: string
  shortcut?: string[]
  onSelect: () => void
}

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  items?: PaletteItem[]
  prefill?: string
}

export function CommandPalette({
  open,
  onClose,
  items = [],
  prefill = '',
}: CommandPaletteProps): ReactElement | null {
  const [query, setQuery] = useState('')

  // Reset query when closed
  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    setQuery(prefill)
  }, [open, prefill])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Group items by group label — memoized so re-renders from parent don't recompute
  const grouped = useMemo(
    () =>
      items.reduce<Record<string, PaletteItem[]>>((acc, item) => {
        const g = item.group
        if (!acc[g]) acc[g] = []
        acc[g]?.push(item)
        return acc
      }, {}),
    [items],
  )

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="palette-backdrop"
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-soft"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionDuration.fast / 1000, ease: motionEasing.standard }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            data-testid="command-palette"
            key="palette-panel"
            className="fixed left-1/2 top-[22%] z-50 w-full max-w-[560px] -translate-x-1/2"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{
              duration: motionDuration.standard / 1000,
              ease: motionEasing.decelerate,
            }}
          >
            <Command
              className="rounded-xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.6),0_2px_8px_rgba(0,0,0,0.4)] border border-white/[0.12]"
              style={{ background: 'rgba(20,20,28,0.85)', backdropFilter: 'blur(24px)' }}
              shouldFilter={true}
              label="Command palette"
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
                <Search
                  size={16}
                  className="shrink-0"
                  style={{ color: 'var(--color-text-tertiary)' }}
                />
                <Command.Input
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{
                    color: 'var(--color-text-primary)',
                    caretColor: 'var(--color-accent-mid)',
                    fontFamily: 'var(--font-sans)',
                  }}
                  placeholder="Search or type a command…"
                  value={query}
                  onValueChange={setQuery}
                  autoFocus
                />
                <KeyHint keys={['Esc']} />
              </div>

              {/* Results */}
              <Command.List className="max-h-[340px] overflow-y-auto py-2">
                <Command.Empty
                  className="py-8 text-center text-sm"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  No results for &ldquo;{query}&rdquo;
                </Command.Empty>

                {Object.entries(grouped).map(([group, groupItems]) => (
                  <Command.Group key={group}>
                    <div
                      className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {group}
                    </div>
                    {groupItems.map((item) => (
                      <Command.Item
                        key={item.id}
                        value={`${item.label} ${item.description ?? ''}`}
                        onSelect={() => {
                          item.onSelect()
                          onClose()
                        }}
                        className="group flex items-center gap-3 px-4 py-2 mx-1 rounded-lg cursor-default transition-colors aria-selected:bg-white/[0.06]"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {item.icon && (
                          <span
                            className="shrink-0 transition-colors"
                            style={{ color: 'var(--color-text-tertiary)' }}
                          >
                            {item.icon}
                          </span>
                        )}
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.description && (
                          <span
                            className="text-xs truncate max-w-[140px]"
                            style={{ color: 'var(--color-text-tertiary)' }}
                          >
                            {item.description}
                          </span>
                        )}
                        {item.shortcut ? (
                          <KeyHint keys={item.shortcut} />
                        ) : (
                          <ArrowRight
                            size={12}
                            className="opacity-0 group-aria-selected:opacity-100 transition-opacity"
                            style={{ color: 'var(--color-text-tertiary)' }}
                          />
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </Command.List>

              {/* Footer */}
              <div
                className="flex items-center gap-4 px-4 py-2.5 border-t border-white/[0.06] text-[11px]"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <span className="flex items-center gap-1.5">
                  <Clock size={11} /> Recent
                </span>
                <span className="ml-auto flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <KeyHint keys={['↑', '↓']} /> Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <KeyHint keys={['↵']} /> Select
                  </span>
                </span>
              </div>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
