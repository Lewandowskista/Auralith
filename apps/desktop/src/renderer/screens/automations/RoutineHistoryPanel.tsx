import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { motion } from 'framer-motion'
import { X, CheckCircle, XCircle, SkipForward } from 'lucide-react'
import type { Routine, RoutineRun } from '@auralith/core-domain'

type Props = {
  routine: Routine
  onClose: () => void
}

const OUTCOME_ICON: Record<RoutineRun['outcome'], ReactElement> = {
  success: <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />,
  failure: <XCircle className="h-3.5 w-3.5 text-red-400" />,
  blocked: <XCircle className="h-3.5 w-3.5 text-amber-400" />,
  skipped: <SkipForward className="h-3.5 w-3.5 text-[#6F6F80]" />,
}

const OUTCOME_LABEL: Record<RoutineRun['outcome'], string> = {
  success: 'Success',
  failure: 'Failure',
  blocked: 'Blocked',
  skipped: 'Skipped',
}

export function RoutineHistoryPanel({ routine, onClose }: Props): ReactElement {
  const [runs, setRuns] = useState<RoutineRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void window.auralith.invoke('routines.history', { id: routine.id, limit: 50 }).then((res) => {
      if (res.ok) {
        const d = res.data as { runs: RoutineRun[] }
        setRuns(d.runs)
      }
      setLoading(false)
    })
  }, [routine.id])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-end bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 360, damping: 36 }}
        className="h-full w-80 flex flex-col border-l border-white/[0.08] bg-[#0A0A10]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h3 className="text-sm font-semibold text-[#F4F4F8]">Run history</h3>
            <p className="text-xs text-[#6F6F80] mt-0.5 truncate max-w-[180px]">{routine.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[#6F6F80] hover:text-[#F4F4F8] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-white/[0.04]">
          <Stat label="Total" value={String(routine.runCount)} />
          <Stat
            label="Success"
            value={String(runs.filter((r) => r.outcome === 'success').length)}
            color="text-emerald-400"
          />
          <Stat
            label="Failed"
            value={String(runs.filter((r) => r.outcome === 'failure').length)}
            color="text-red-400"
          />
        </div>

        {/* Runs list */}
        <div className="flex-1 overflow-y-auto py-3">
          {loading ? (
            <div className="flex items-center justify-center h-20 text-[#4A4A5A] text-xs">
              Loading…
            </div>
          ) : runs.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-[#4A4A5A] text-xs">
              No runs yet
            </div>
          ) : (
            runs.map((run) => (
              <div
                key={run.id}
                className="flex items-start gap-3 px-5 py-2.5 hover:bg-white/[0.02] transition-colors"
              >
                <div className="mt-0.5">{OUTCOME_ICON[run.outcome]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[#A6A6B3]">
                      {OUTCOME_LABEL[run.outcome]}
                    </span>
                    <span className="text-[10px] text-[#4A4A5A] shrink-0">
                      {new Date(run.ts).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#4A4A5A] mt-0.5">
                    {new Date(run.ts).toLocaleDateString()}
                  </p>
                  {run.meta && typeof run.meta === 'object' && 'error' in run.meta && (
                    <p className="text-[10px] text-red-400/70 mt-0.5 truncate">
                      {String((run.meta as { error: string }).error)}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </motion.aside>
    </motion.div>
  )
}

function Stat({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: string
}): ReactElement {
  return (
    <div className="text-center">
      <p className={`text-sm font-semibold ${color ?? 'text-[#F4F4F8]'}`}>{value}</p>
      <p className="text-[10px] text-[#4A4A5A]">{label}</p>
    </div>
  )
}
