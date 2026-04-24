import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Pause,
  Play,
} from 'lucide-react'

type AgentStep = {
  id: string
  toolId: string
  params: Record<string, unknown>
  description?: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  result?: unknown
  error?: string
  startedAt?: number
  endedAt?: number
}

type AgentRunState = {
  runId: string
  sessionId: string
  goal: string
  plan: { goal: string; steps: AgentStep[]; reasoning?: string } | null
  currentStepIndex: number
  status: 'planning' | 'running' | 'reflecting' | 'completed' | 'failed' | 'cancelled'
  finalAnswer?: string
  error?: string
}

type Props = {
  runId: string
  onCancel?: () => void
  onClose?: () => void
}

const STATUS_LABELS: Record<AgentRunState['status'], string> = {
  planning: 'Planning…',
  running: 'Running',
  reflecting: 'Reflecting…',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

function StepIcon({ status }: { status: AgentStep['status'] }) {
  if (status === 'done')
    return <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
  if (status === 'failed') return <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
  if (status === 'running')
    return <Loader2 size={14} className="text-violet-400 shrink-0 mt-0.5 animate-spin" />
  return (
    <span className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0 mt-0.5 inline-block" />
  )
}

function StepRow({ step, index }: { step: AgentStep; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = step.status === 'done' || step.status === 'failed'

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => hasDetail && setExpanded((v) => !v)}
        className="flex items-start gap-2 text-left w-full group"
      >
        <StepIcon status={step.status} />
        <span className="flex-1 min-w-0">
          <span className="text-xs text-white/70 font-mono">{index + 1}.</span>{' '}
          <span className="text-xs text-white/80">{step.description ?? step.toolId}</span>{' '}
          <span className="text-xs text-white/30 font-mono">{step.toolId}</span>
        </span>
        {hasDetail && (
          <span className="text-white/30 shrink-0">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
      </button>

      <AnimatePresence>
        {expanded && hasDetail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden ml-5"
          >
            {step.status === 'done' && step.result !== undefined && (
              <pre className="text-xs text-emerald-300/70 bg-emerald-950/20 rounded p-2 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                {JSON.stringify(step.result, null, 2).slice(0, 500)}
              </pre>
            )}
            {step.status === 'failed' && step.error && (
              <p className="text-xs text-red-400/80 bg-red-950/20 rounded p-2">{step.error}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function AgentThoughtsPanel({ runId, onCancel, onClose }: Props) {
  const [state, setState] = useState<AgentRunState | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const stepsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = window.auralith.on('agent:state-update', (data) => {
      const payload = data as { runId: string; state: AgentRunState }
      if (payload.runId !== runId) return
      setState(payload.state)
    })
    return () => {
      unsub()
    }
  }, [runId])

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state?.currentStepIndex])

  if (!state) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10">
        <Loader2 size={14} className="text-violet-400 animate-spin" />
        <span className="text-xs text-white/50">Starting agent…</span>
      </div>
    )
  }

  const isActive =
    state.status === 'planning' || state.status === 'running' || state.status === 'reflecting'
  const steps = state.plan?.steps ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl bg-white/[0.04] border border-white/10 overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.07] cursor-pointer"
        onClick={() => setCollapsed((v) => !v)}
      >
        <Brain size={14} className="text-violet-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white/80 truncate">{state.goal}</p>
          <p className="text-xs text-white/40">{STATUS_LABELS[state.status]}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {isActive && onCancel && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCancel()
              }}
              className="px-2 py-0.5 rounded text-xs text-red-400 hover:bg-red-400/10 transition-colors"
            >
              Cancel
            </button>
          )}
          {!isActive && onClose && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              className="p-0.5 rounded text-white/30 hover:text-white/60 transition-colors"
            >
              ×
            </button>
          )}
          <span className="text-white/30">
            {collapsed ? <Play size={12} /> : <Pause size={12} />}
          </span>
        </div>
      </div>

      {/* Body */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2 space-y-1.5 max-h-72 overflow-y-auto">
              {state.plan?.reasoning && (
                <p className="text-xs text-white/40 italic mb-2">{state.plan.reasoning}</p>
              )}

              {steps.length === 0 && isActive && (
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <Loader2 size={12} className="animate-spin" />
                  Building plan…
                </div>
              )}

              {steps.map((step, i) => (
                <StepRow key={step.id} step={step} index={i} />
              ))}

              <div ref={stepsEndRef} />
            </div>

            {(state.status === 'completed' || state.status === 'failed') && (
              <div
                className={`px-3 py-2 border-t border-white/[0.07] text-xs ${state.status === 'completed' ? 'text-emerald-300/80' : 'text-red-400/80'}`}
              >
                {state.finalAnswer ??
                  state.error ??
                  (state.status === 'completed' ? 'Done.' : 'Failed.')}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
