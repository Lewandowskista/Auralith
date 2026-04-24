import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Keyboard, Mic, Search, MessageSquare, Camera, X } from 'lucide-react'
import { KeyHint } from '@auralith/design-system'

type ShortcutItem = {
  id: string
  label: string
  description: string
  keys: string[]
  icon: ReactElement
}

type Props = {
  open: boolean
  onClose: () => void
}

const STATIC_SHORTCUTS: ShortcutItem[] = [
  {
    id: 'palette',
    label: 'Command palette',
    description: 'Open the app-wide command palette.',
    keys: ['Ctrl', 'K'],
    icon: <Search className="h-4 w-4" />,
  },
  {
    id: 'capture',
    label: 'Quick capture',
    description: 'Reserved global shortcut for screen capture workflows.',
    keys: ['Ctrl', 'Shift', 'N'],
    icon: <Camera className="h-4 w-4" />,
  },
  {
    id: 'shortcuts',
    label: 'Shortcut reference',
    description: 'Open this keyboard reference when no input is focused.',
    keys: ['?'],
    icon: <Keyboard className="h-4 w-4" />,
  },
  {
    id: 'assistant-send',
    label: 'Send message',
    description: 'Send the current assistant message.',
    keys: ['Enter'],
    icon: <MessageSquare className="h-4 w-4" />,
  },
  {
    id: 'assistant-newline',
    label: 'New line',
    description: 'Insert a line break in the assistant composer.',
    keys: ['Shift', 'Enter'],
    icon: <MessageSquare className="h-4 w-4" />,
  },
]

export function ShortcutsDialog({ open, onClose }: Props): ReactElement | null {
  const [pttBinding, setPttBinding] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    void window.auralith.invoke('settings.get', { key: 'voice.pttBinding' }).then((res) => {
      if (!res.ok) return
      const data = res.data as { value: unknown }
      if (typeof data.value === 'string' && data.value.trim()) {
        setPttBinding(normalizeBinding(data.value))
      }
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) return null

  const items = pttBinding
    ? [
        ...STATIC_SHORTCUTS.slice(0, 2),
        {
          id: 'ptt',
          label: 'Push to talk',
          description: 'Start or stop voice capture.',
          keys: pttBinding.split('+'),
          icon: <Mic className="h-4 w-4" />,
        },
        ...STATIC_SHORTCUTS.slice(2),
      ]
    : STATIC_SHORTCUTS

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed left-1/2 top-1/2 z-[60] w-full max-w-[680px] -translate-x-1/2 -translate-y-1/2 px-4"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
          >
            <div
              className="overflow-hidden rounded-3xl border border-white/[0.08]"
              style={{
                background: 'rgba(16,16,22,0.96)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
              }}
            >
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 py-5">
                <div>
                  <p
                    className="text-[11px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    Keyboard
                  </p>
                  <h2 id="shortcuts-title" className="mt-1 text-xl font-semibold text-[#F4F4F8]">
                    Shortcut reference
                  </h2>
                  <p className="mt-1 text-sm text-[#6F6F80]">
                    Quick access for the actions currently wired into Auralith.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-xl p-2 text-[#6F6F80] transition hover:bg-white/5 hover:text-[#F4F4F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  aria-label="Close shortcuts reference"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-4"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          background: 'rgba(139,92,246,0.12)',
                          color: 'var(--color-accent-mid)',
                        }}
                      >
                        {item.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-[#F4F4F8]">{item.label}</p>
                          <div className="flex flex-wrap gap-1">
                            <KeyHint keys={item.keys} />
                          </div>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-[#6F6F80]">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function normalizeBinding(binding: string): string {
  return binding
    .replace(/CommandOrControl/g, 'Ctrl')
    .replace(/ArrowUp/g, 'Up')
    .replace(/ArrowDown/g, 'Down')
    .replace(/ArrowLeft/g, 'Left')
    .replace(/ArrowRight/g, 'Right')
}
