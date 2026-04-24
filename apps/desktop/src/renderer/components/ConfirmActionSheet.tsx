import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Shield, ShieldAlert, X } from 'lucide-react'
import { useRef, useState } from 'react'

export type ConfirmActionRequest = {
  invocationId: string
  toolId: string
  params: Record<string, unknown>
  tier: 'confirm' | 'restricted'
  reversible: boolean
  rationale?: string
  source?: 'user' | 'suggestion' | 'scheduler'
}

type Props = {
  request: ConfirmActionRequest | null
  onConfirm: (invocationId: string) => void
  onCancel: (invocationId: string) => void
}

const BACKDROP = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } }
const SHEET = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] } },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.16 } },
}

export function ConfirmActionSheet({ request, onConfirm, onCancel }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const isRestricted = request?.tier === 'restricted'
  const canConfirm = isRestricted ? confirmText === 'CONFIRM' : true

  function handleConfirm() {
    if (!request || !canConfirm) return
    setConfirmText('')
    onConfirm(request.invocationId)
  }

  function handleCancel() {
    if (!request) return
    setConfirmText('')
    onCancel(request.invocationId)
  }

  return (
    <AnimatePresence>
      {request && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            variants={BACKDROP}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={handleCancel}
          />

          {/* Sheet */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg px-4 pb-6 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"
            variants={SHEET}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-sheet-title"
          >
            <div className="rounded-2xl border border-white/10 bg-[rgba(20,20,28,0.92)] p-6 shadow-2xl backdrop-blur-xl">
              {/* Header */}
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {isRestricted ? (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15">
                      <ShieldAlert className="h-5 w-5 text-red-400" />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/15">
                      <Shield className="h-5 w-5 text-violet-400" />
                    </div>
                  )}
                  <div>
                    <p id="confirm-sheet-title" className="text-sm font-semibold text-[#F4F4F8]">
                      {isRestricted ? 'Restricted action' : 'Confirm action'}
                    </p>
                    <p className="text-xs text-[#6F6F80]">
                      {request.source === 'suggestion'
                        ? 'Proposed by assistant'
                        : 'Requested by you'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCancel}
                  className="rounded-lg p-1.5 text-[#6F6F80] hover:bg-white/5 hover:text-[#A6A6B3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  aria-label="Cancel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Tool info */}
              <div className="mb-4 rounded-xl bg-white/[0.04] p-4">
                <p className="mb-2 font-mono text-xs text-violet-400">{request.toolId}</p>
                <div className="space-y-1">
                  {Object.entries(request.params).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-xs">
                      <span className="min-w-[80px] shrink-0 text-[#6F6F80]">{k}</span>
                      <span className="truncate text-[#A6A6B3]">{JSON.stringify(v)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rationale */}
              {request.rationale && (
                <p className="mb-4 text-sm text-[#A6A6B3]">{request.rationale}</p>
              )}

              {/* Reversibility notice */}
              {!request.reversible && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <p className="text-xs text-amber-300">This action cannot be undone.</p>
                </div>
              )}

              {/* Restricted: typed CONFIRM */}
              {isRestricted && (
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs text-[#6F6F80]">
                    Type <span className="font-mono text-red-400">CONFIRM</span> to proceed
                  </label>
                  <input
                    ref={inputRef}
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && canConfirm) handleConfirm()
                      if (e.key === 'Escape') handleCancel()
                    }}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-[#F4F4F8] placeholder-[#6F6F80] outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/30"
                    placeholder="CONFIRM"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-[#A6A6B3] transition hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className={[
                    'flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2',
                    isRestricted
                      ? 'bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-40'
                      : 'bg-violet-600 text-white hover:bg-violet-500 focus-visible:ring-violet-500',
                  ].join(' ')}
                >
                  {isRestricted ? 'Execute' : 'Confirm'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
