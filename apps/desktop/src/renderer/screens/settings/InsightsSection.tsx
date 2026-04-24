import { useState, useEffect, useCallback } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  RotateCcw,
  Pause,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Eye,
  EyeOff,
} from 'lucide-react'

type KindInsight = {
  kind: string
  acceptCount: number
  dismissCount: number
  acceptRate: number
  learnedWeight: number
  sampleCount: number
  acceptByHour: number[]
  dismissByHour: number[]
  pausedUntil?: number
}

type InsightsData = {
  byKind: KindInsight[]
  totalAccepted: number
  totalDismissed: number
}

type SignalStatus = {
  calendarPath?: string
  calendarEventCount: number
  focusAppEnabled: boolean
  idleMs: number
}

const KIND_LABELS: Record<string, string> = {
  'weather.alert': 'Weather Alert',
  'morning.brief': 'Morning Briefing',
  'eod.recap': 'End-of-Day Recap',
  'news.digest': 'News Digest',
  'downloads.cleanup': 'Downloads Cleanup',
  'session.recap': 'Session Recap',
  'work.resume': 'Resume Work',
  'leisure.weekend-brief': 'Weekend Briefing',
  'leisure.reading-resurfaced': 'Reading Resurfacing',
  'leisure.hobby-idea': 'Hobby Idea',
  'calendar.prep': 'Calendar Prep',
  'focus.resume': 'Focus Resume',
}

function WeightIndicator({ weight }: { weight: number }): ReactElement {
  if (weight > 0.1) return <TrendingUp size={13} className="text-emerald-400" />
  if (weight < -0.1) return <TrendingDown size={13} className="text-rose-400" />
  return <Minus size={13} className="text-[#6F6F80]" />
}

function MiniHeatmap({
  accepts,
  dismisses,
}: {
  accepts: number[]
  dismisses: number[]
}): ReactElement {
  const maxVal = Math.max(1, ...accepts.map((a, i) => a + (dismisses[i] ?? 0)))

  return (
    <div className="flex items-end gap-px h-6 w-full mt-2">
      {accepts.map((a, i) => {
        const d = dismisses[i] ?? 0
        const total = a + d
        const heightPct = total / maxVal
        const acceptPct = total > 0 ? a / total : 0
        return (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              height: `${Math.max(10, heightPct * 100)}%`,
              background:
                total === 0
                  ? 'rgba(255,255,255,0.05)'
                  : `linear-gradient(to top, rgba(239,68,68,${0.6 * (1 - acceptPct)}) 0%, rgba(139,92,246,${0.6 * acceptPct}) 100%)`,
            }}
            title={`${i}:00 — ${a} accepted, ${d} dismissed`}
          />
        )
      })}
    </div>
  )
}

export function InsightsSection(): ReactElement {
  const [insights, setInsights] = useState<InsightsData | null>(null)
  const [signals, setSignals] = useState<SignalStatus | null>(null)
  const [resetting, setResetting] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [calendarPath, setCalendarPath] = useState('')
  const [importingCalendar, setImportingCalendar] = useState(false)

  const loadInsights = useCallback(async () => {
    const res = await window.auralith.invoke('suggest.insights', {})
    if (res.ok) setInsights(res.data as InsightsData)
  }, [])

  const loadSignals = useCallback(async () => {
    const res = await window.auralith.invoke('signals.getStatus', {})
    if (res.ok) {
      const s = res.data as SignalStatus
      setSignals(s)
      if (s.calendarPath) setCalendarPath(s.calendarPath)
    }
  }, [])

  useEffect(() => {
    void loadInsights()
    void loadSignals()
  }, [loadInsights, loadSignals])

  async function handleResetLearning(): Promise<void> {
    setResetting(true)
    try {
      const res = await window.auralith.invoke('suggest.resetLearning', {})
      if (res.ok) {
        toast.success('Learning data reset')
        setShowResetConfirm(false)
        await loadInsights()
      } else {
        toast.error('Reset failed')
      }
    } finally {
      setResetting(false)
    }
  }

  async function handleImportCalendar(): Promise<void> {
    if (!calendarPath.trim()) return
    setImportingCalendar(true)
    try {
      const res = await window.auralith.invoke('signals.importCalendar', {
        path: calendarPath.trim(),
      })
      if (res.ok) {
        const data = res.data as { eventsImported: number }
        toast.success(`Imported ${data.eventsImported} calendar events`)
        await loadSignals()
      } else {
        toast.error('Failed to import calendar — check the file path')
      }
    } finally {
      setImportingCalendar(false)
    }
  }

  async function toggleFocusTracking(): Promise<void> {
    const next = !(signals?.focusAppEnabled ?? false)
    const res = await window.auralith.invoke('signals.setFocusAppTracking', { enabled: next })
    if (res.ok) {
      setSignals((s) => (s ? { ...s, focusAppEnabled: next } : s))
      toast.success(next ? 'Focus tracking enabled' : 'Focus tracking disabled')
    }
  }

  const now = Date.now()

  return (
    <div data-testid="insights-section" className="max-w-lg space-y-8">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-[#F4F4F8]">Suggestion Insights</h2>
        <p className="text-sm text-[#6F6F80]">
          Auralith learns from which suggestions you accept and dismiss, gradually adjusting their
          frequency.
        </p>
      </div>

      {/* Summary row */}
      {insights && (
        <div className="flex gap-4">
          <div className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center">
            <p className="text-2xl font-semibold text-emerald-400">{insights.totalAccepted}</p>
            <p className="text-xs text-[#6F6F80] mt-0.5">Accepted</p>
          </div>
          <div className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center">
            <p className="text-2xl font-semibold text-rose-400">{insights.totalDismissed}</p>
            <p className="text-xs text-[#6F6F80] mt-0.5">Dismissed</p>
          </div>
          <div className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center">
            <p className="text-2xl font-semibold text-[#F4F4F8]">{insights.byKind.length}</p>
            <p className="text-xs text-[#6F6F80] mt-0.5">Kinds tracked</p>
          </div>
        </div>
      )}

      {/* Per-kind cards */}
      {insights && insights.byKind.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6F6F80]">
            By suggestion type
          </p>
          <div className="space-y-2">
            {insights.byKind.map((k) => {
              const isPaused = k.pausedUntil !== undefined && k.pausedUntil > now
              const cooldownMins = isPaused ? Math.ceil(((k.pausedUntil ?? 0) - now) / 60_000) : 0
              return (
                <div
                  key={k.kind}
                  className={[
                    'rounded-xl border px-4 py-3',
                    isPaused
                      ? 'border-orange-500/30 bg-orange-500/5'
                      : 'border-white/[0.06] bg-white/[0.02]',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <WeightIndicator weight={k.learnedWeight} />
                        <span className="text-sm font-medium text-[#F4F4F8] truncate">
                          {KIND_LABELS[k.kind] ?? k.kind}
                        </span>
                        {isPaused && (
                          <span className="flex items-center gap-1 text-[10px] text-orange-400 font-medium shrink-0">
                            <Pause size={9} />
                            Paused {cooldownMins}m
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[#6F6F80]">
                        {k.acceptCount} accepted · {k.dismissCount} dismissed
                        {k.sampleCount > 0 && ` · ${Math.round(k.acceptRate * 100)}% rate`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className="h-1.5 w-16 rounded-full bg-white/10 overflow-hidden"
                        title={`Accept rate: ${Math.round(k.acceptRate * 100)}%`}
                      >
                        <div
                          className="h-full rounded-full bg-violet-500/80 transition-all"
                          style={{ width: `${k.acceptRate * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  {/* 24h heatmap */}
                  {k.acceptCount + k.dismissCount > 0 && (
                    <MiniHeatmap accepts={k.acceptByHour} dismisses={k.dismissByHour} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center text-sm text-[#6F6F80]">
          No suggestion history yet. Accept or dismiss suggestions to build learning data.
        </div>
      )}

      {/* Calendar import */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-violet-400" />
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6F6F80]">
            Calendar integration
          </p>
        </div>
        <p className="text-xs text-[#6F6F80]">
          Import a local ICS file to enable event-prep suggestions 45 minutes before upcoming
          events. No cloud access required.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={calendarPath}
            onChange={(e) => setCalendarPath(e.target.value)}
            placeholder="C:\Users\you\calendar.ics"
            className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-[#F4F4F8] placeholder-[#6F6F80] focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          <button
            onClick={() => void handleImportCalendar()}
            disabled={importingCalendar || !calendarPath.trim()}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition disabled:opacity-40"
          >
            {importingCalendar ? 'Importing…' : 'Import'}
          </button>
        </div>
        {signals?.calendarEventCount !== undefined && signals.calendarEventCount > 0 && (
          <p className="text-xs text-emerald-400">
            {signals.calendarEventCount} upcoming events loaded (refreshed every 15 min)
          </p>
        )}
      </div>

      {/* Focus-app tracking toggle */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {signals?.focusAppEnabled ? (
              <Eye size={14} className="text-violet-400" />
            ) : (
              <EyeOff size={14} className="text-[#6F6F80]" />
            )}
            <p className="text-sm font-medium text-[#F4F4F8]">Focus-app tracking</p>
          </div>
          <p className="text-xs text-[#6F6F80]">
            Records which app category is foregrounded (IDE, browser, explorer, or other) — never
            window titles or URLs. Used to improve Resume Work suggestions. Off by default.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={signals?.focusAppEnabled ?? false}
          onClick={() => void toggleFocusTracking()}
          className={[
            'mt-0.5 relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
            signals?.focusAppEnabled ? 'bg-violet-500' : 'bg-white/20',
          ].join(' ')}
        >
          <span
            className={[
              'block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform',
              signals?.focusAppEnabled ? 'translate-x-[18px]' : 'translate-x-0.5',
            ].join(' ')}
          />
        </button>
      </div>

      {/* Reset learning */}
      <div className="space-y-3 pt-2 border-t border-white/[0.06]">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6F6F80]">Reset</p>
        <p className="text-xs text-[#6F6F80]">
          Clears all learned weights, cooldown pauses, and imported calendar events. Suggestions
          will return to their default frequency. This cannot be undone.
        </p>

        <AnimatePresence>
          {!showResetConfirm ? (
            <motion.button
              key="reset-btn"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-white/[0.08] text-[#A6A6B3] hover:text-[#F4F4F8] hover:border-white/20 transition"
            >
              <RotateCcw size={12} />
              Reset learning data
            </motion.button>
          ) : (
            <motion.div
              key="reset-confirm"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3"
            >
              <span className="text-xs text-[#F4F4F8]">Are you sure?</span>
              <button
                onClick={() => void handleResetLearning()}
                disabled={resetting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition disabled:opacity-40"
              >
                {resetting ? 'Resetting…' : 'Yes, reset'}
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/[0.06] text-[#6F6F80] hover:text-[#A6A6B3] transition"
              >
                Cancel
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
