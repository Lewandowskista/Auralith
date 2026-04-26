import { useEffect, useRef, useState, useCallback } from 'react'
import type { ReactElement } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Zap } from 'lucide-react'

const AUTO_CONFIRM_MS = 3000

type TransientRequest = {
  invocationId: string
  toolId: string
  params: unknown
  reversible: boolean
}

function formatToolLabel(toolId: string): string {
  const labels: Record<string, string> = {
    'volume.set': 'Set volume',
    'volume.mute': 'Toggle mute',
    'media.play': 'Play/pause media',
    'media.next': 'Next track',
    'media.prev': 'Previous track',
    'window.minimize': 'Minimize window',
    'window.maximize': 'Maximize window',
    'window.restore': 'Restore window',
    'window.focus': 'Focus window',
    'clipboard.write': 'Write clipboard',
  }
  return labels[toolId] ?? toolId
}

function formatParamsSummary(toolId: string, params: unknown): string {
  if (!params || typeof params !== 'object') return ''
  const p = params as Record<string, unknown>
  const level = p['level']
  const mute = p['mute']
  const name = p['name']
  const text = p['text']
  if (toolId === 'volume.set' && typeof level === 'number') return `level ${level}%`
  if (toolId === 'volume.mute')
    return typeof mute === 'boolean' ? (mute ? 'mute' : 'unmute') : 'toggle'
  if (
    toolId === 'window.minimize' ||
    toolId === 'window.maximize' ||
    toolId === 'window.restore' ||
    toolId === 'window.focus'
  ) {
    return typeof name === 'string' ? name : 'active window'
  }
  if (toolId === 'clipboard.write' && typeof text === 'string') {
    const preview = text.slice(0, 40)
    return preview.length < text.length ? `"${preview}…"` : `"${preview}"`
  }
  return ''
}

export function TransientConfirmToast(): ReactElement {
  const [requests, setRequests] = useState<TransientRequest[]>([])

  useEffect(() => {
    const unsub = window.auralith.on('tool.confirmRequest', (data) => {
      const req = data as {
        invocationId: string
        toolId: string
        params: unknown
        tier: string
        reversible: boolean
      }
      if (req.tier !== 'confirm-transient') return
      setRequests((prev) => [...prev, req])
    })
    return unsub
  }, [])

  const resolve = useCallback((invocationId: string, confirmed: boolean) => {
    setRequests((prev) => prev.filter((r) => r.invocationId !== invocationId))
    void window.auralith.invoke('__internal.confirmationResolved', { invocationId, confirmed })
  }, [])

  return (
    <div className="fixed bottom-6 right-6 z-[300] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {requests.map((req) => (
          <ToastItem key={req.invocationId} req={req} onResolve={resolve} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function ToastItem({
  req,
  onResolve,
}: {
  req: TransientRequest
  onResolve: (id: string, confirmed: boolean) => void
}): ReactElement {
  const [allowAlways, setAllowAlways] = useState(false)
  const [progress, setProgress] = useState(1)
  const startRef = useRef(Date.now())
  const rafRef = useRef<number | null>(null)
  const resolvedRef = useRef(false)

  const confirm = useCallback(
    (confirmed: boolean) => {
      if (resolvedRef.current) return
      resolvedRef.current = true
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (allowAlways && confirmed) {
        void window.auralith.invoke('pccontrol.addAllowList', { toolId: req.toolId })
      }
      onResolve(req.invocationId, confirmed)
    },
    [allowAlways, onResolve, req.invocationId, req.toolId],
  )

  // Drive countdown ring
  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startRef.current
      const remaining = Math.max(0, 1 - elapsed / AUTO_CONFIRM_MS)
      setProgress(remaining)
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        confirm(true)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [confirm])

  const label = formatToolLabel(req.toolId)
  const summary = formatParamsSummary(req.toolId, req.params)
  const RADIUS = 10
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS

  return (
    <motion.div
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
      className="pointer-events-auto"
      style={{ width: 300 }}
    >
      <div
        className="flex items-start gap-3 rounded-xl px-4 py-3"
        style={{
          background: 'rgba(14,14,22,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(139,92,246,0.25)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* Countdown ring */}
        <div className="shrink-0 mt-0.5">
          <svg width={24} height={24} viewBox="0 0 24 24">
            <circle
              cx={12}
              cy={12}
              r={RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={2}
            />
            <circle
              cx={12}
              cy={12}
              r={RADIUS}
              fill="none"
              stroke="rgba(139,92,246,0.8)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
              transform="rotate(-90 12 12)"
            />
            <Zap size={10} x={7} y={7} color="rgba(139,92,246,0.9)" />
          </svg>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <p className="text-xs font-medium text-white/90 leading-tight">{label}</p>
          {summary && <p className="text-[11px] text-white/50 truncate leading-tight">{summary}</p>}

          {/* Always-allow checkbox */}
          <label className="flex items-center gap-1.5 mt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allowAlways}
              onChange={(e) => setAllowAlways(e.target.checked)}
              className="w-3 h-3 accent-violet-500"
            />
            <span className="text-[11px] text-white/40">Always allow</span>
          </label>
        </div>

        {/* Cancel button */}
        <button
          onClick={() => confirm(false)}
          className="shrink-0 mt-0.5 text-[11px] text-white/40 hover:text-white/70 transition-colors leading-tight"
          aria-label="Cancel action"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  )
}
