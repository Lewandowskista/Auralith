import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TabContent } from '@auralith/design-system'
import {
  Plus,
  Play,
  Pencil,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  SkipForward,
  History,
  Zap,
  Store,
  Download,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Routine } from '@auralith/core-domain'
import { FadeRise } from '@auralith/design-system'
import { RoutineEditor } from './RoutineEditor'
import { RoutineHistoryPanel } from './RoutineHistoryPanel'
import { ScreenShell } from '../../components/ScreenShell'

type ExampleRoutine = {
  id: string
  name: string
  description: string
  category: string
  trigger: unknown
  conditions: unknown[]
  actions: unknown[]
}

const CATEGORY_COLORS: Record<string, string> = {
  productivity: 'text-violet-400 bg-violet-500/10',
  privacy: 'text-emerald-400 bg-emerald-500/10',
  activity: 'text-blue-400 bg-blue-500/10',
  knowledge: 'text-amber-400 bg-amber-500/10',
  system: 'text-slate-400 bg-slate-500/10',
  leisure: 'text-pink-400 bg-pink-500/10',
}

type RoutineStatus = 'success' | 'failure' | 'blocked' | 'skipped'

const STATUS_ICON: Record<RoutineStatus, ReactElement> = {
  success: <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />,
  failure: <XCircle className="h-3.5 w-3.5 text-red-400" />,
  blocked: <XCircle className="h-3.5 w-3.5 text-amber-400" />,
  skipped: <SkipForward className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />,
}

function triggerLabel(trigger: Routine['trigger']): string {
  switch (trigger.type) {
    case 'schedule':
      return `Daily at ${String(trigger.cronHour).padStart(2, '0')}:${String(trigger.cronMinute).padStart(2, '0')}`
    case 'event':
      return `On event: ${trigger.eventKind}`
    case 'suggestion.accepted':
      return `When suggestion accepted: ${trigger.suggestionKind}`
    case 'app.startup':
      return 'On app startup'
    case 'on.idle':
      return `After ${trigger.idleMinutes} min idle`
    case 'webhook':
      return `Webhook: ${(trigger as { type: string; path: string }).path}`
    case 'ai':
      return 'AI-triggered'
    default:
      return (trigger as { type: string }).type
  }
}

export function AutomationsScreen(): ReactElement {
  const [tab, setTab] = useState<'mine' | 'browse'>('mine')
  const prevTabRef = useRef<'mine' | 'browse'>('mine')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null)
  const [historyFor, setHistoryFor] = useState<Routine | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)

  const loadRoutines = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.auralith.invoke('routines.list', { includeDisabled: true })
      if (res.ok) {
        const data = res.data as { routines: Routine[] }
        setRoutines(data.routines)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRoutines()
  }, [loadRoutines])

  const handleToggleEnabled = useCallback(async (r: Routine) => {
    setRoutines((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: !r.enabled } : x)))
    const op = r.enabled ? 'routines.disable' : 'routines.enable'
    try {
      const res = await window.auralith.invoke(op, { id: r.id })
      if (!res.ok) {
        setRoutines((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: r.enabled } : x)))
        toast.error('Failed to toggle routine')
      }
    } catch {
      setRoutines((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: r.enabled } : x)))
      toast.error('Failed to toggle routine')
    }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    const res = await window.auralith.invoke('routines.delete', { id })
    if (res.ok) {
      setRoutines((prev) => prev.filter((x) => x.id !== id))
      toast.success('Routine deleted')
    }
  }, [])

  const handleRun = useCallback(
    async (r: Routine) => {
      setRunningId(r.id)
      try {
        const res = await window.auralith.invoke('routines.run', { id: r.id })
        if (res.ok) {
          const data = res.data as { outcome: string }
          if (data.outcome === 'success') toast.success(`"${r.name}" ran successfully`)
          else if (data.outcome === 'blocked')
            toast.error(`"${r.name}" was blocked (confirm required)`)
          else toast.error(`"${r.name}" failed`)
          void loadRoutines()
        }
      } finally {
        setRunningId(null)
      }
    },
    [loadRoutines],
  )

  const handleSaved = useCallback(() => {
    setEditorOpen(false)
    setEditingRoutine(null)
    void loadRoutines()
  }, [loadRoutines])

  return (
    <ScreenShell
      title="Automations"
      {...(routines.length > 0 && {
        subtitle: `${routines.filter((r) => r.enabled).length} active`,
      })}
      variant="split"
      actions={
        <motion.button
          data-testid="routine-create-btn"
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setEditingRoutine(null)
            setEditorOpen(true)
          }}
          className="flex items-center gap-2 rounded-xl border border-[var(--color-border-accent)] bg-[var(--color-accent-low)]/20 px-3.5 py-1.5 text-sm font-medium text-[var(--color-accent-mid)] transition-colors hover:bg-[var(--color-accent-low)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-low)]"
        >
          <Plus className="h-3.5 w-3.5" />
          New routine
        </motion.button>
      }
    >
      {/* Tab bar */}
      <div
        className="flex items-center gap-1 px-8 py-0"
        style={{
          borderBottom: '1px solid var(--color-border-hairline)',
          background: 'rgba(14,14,20,0.40)',
        }}
      >
        {(['mine', 'browse'] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              prevTabRef.current = tab
              setTab(t)
            }}
            className="relative flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors"
            style={{
              color: tab === t ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
            }}
          >
            {t === 'mine' ? <Zap className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}
            {t === 'mine' ? 'My Routines' : 'Browse'}
            {tab === t && (
              <motion.div
                layoutId="routines-tab-underline"
                className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-violet-500"
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <TabContent tabKey={tab} direction={tab === 'browse' ? 1 : -1}>
          <div className="px-8 py-6">
            {tab === 'browse' ? (
              <MarketplacePanel
                onInstalled={() => {
                  prevTabRef.current = 'browse'
                  void loadRoutines()
                  setTab('mine')
                }}
              />
            ) : loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-violet-500/60"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
              </div>
            ) : routines.length === 0 ? (
              <EmptyState onNew={() => setEditorOpen(true)} />
            ) : (
              <FadeRise>
                <div data-testid="routines-list" className="space-y-3">
                  {routines.map((r) => (
                    <RoutineCard
                      key={r.id}
                      routine={r}
                      running={runningId === r.id}
                      onToggle={() => void handleToggleEnabled(r)}
                      onRun={() => void handleRun(r)}
                      onEdit={() => {
                        setEditingRoutine(r)
                        setEditorOpen(true)
                      }}
                      onDelete={() => void handleDelete(r.id)}
                      onHistory={() => setHistoryFor(r)}
                    />
                  ))}
                </div>
              </FadeRise>
            )}
          </div>
        </TabContent>
      </div>

      {/* Routine editor sheet */}
      <AnimatePresence>
        {editorOpen && (
          <RoutineEditor
            routine={editingRoutine}
            onSave={handleSaved}
            onClose={() => {
              setEditorOpen(false)
              setEditingRoutine(null)
            }}
          />
        )}
      </AnimatePresence>

      {/* History panel */}
      <AnimatePresence>
        {historyFor && (
          <RoutineHistoryPanel routine={historyFor} onClose={() => setHistoryFor(null)} />
        )}
      </AnimatePresence>
    </ScreenShell>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }): ReactElement {
  return (
    <div
      data-testid="routines-empty"
      className="flex flex-col items-center justify-center h-64 text-center gap-4"
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-violet-500/10 text-violet-400">
        <Zap className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">No automations yet</p>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-1 max-w-xs">
          Create a routine to automatically run actions when conditions are met.
        </p>
      </div>
      <button
        onClick={onNew}
        className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors"
      >
        Create your first routine
      </button>
    </div>
  )
}

type RoutineCardProps = {
  routine: Routine
  running: boolean
  onToggle: () => void
  onRun: () => void
  onEdit: () => void
  onDelete: () => void
  onHistory: () => void
}

function RoutineCard({
  routine,
  running,
  onToggle,
  onRun,
  onEdit,
  onDelete,
  onHistory,
}: RoutineCardProps): ReactElement {
  const lastStatus = routine.lastStatus as RoutineStatus | undefined

  return (
    <motion.div
      data-testid="routine-row"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.015, y: -1 }}
      whileTap={{ scale: 0.98 }}
      className="group relative"
      style={{
        borderRadius: 14,
        border: '1px solid var(--color-border-hairline)',
        background: 'rgba(20,20,28,0.80)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: '16px 20px',
      }}
      onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
        e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
      }}
      onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
        e.currentTarget.style.borderColor = 'var(--color-border-hairline)'
      }}
    >
      <div className="flex items-start gap-4">
        {/* Enable toggle */}
        <button
          onClick={onToggle}
          className={[
            'mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
            routine.enabled
              ? 'bg-violet-500/15 text-violet-400 hover:bg-violet-500/25'
              : 'bg-white/5 text-[var(--color-text-tertiary)] hover:bg-white/10',
          ].join(' ')}
          title={routine.enabled ? 'Disable' : 'Enable'}
        >
          <Zap className="h-4 w-4" strokeWidth={routine.enabled ? 2 : 1.5} />
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {routine.name}
            </span>
            {lastStatus && STATUS_ICON[lastStatus]}
            {!routine.enabled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-[var(--color-text-tertiary)]">
                disabled
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {triggerLabel(routine.trigger)}
            </span>
            <span className="text-xs text-[var(--color-text-tertiary)]">
              → {routine.action.toolId}
            </span>
          </div>
          {routine.lastRunAt && (
            <p className="text-[11px] text-[var(--color-text-tertiary)]/60 mt-1">
              Last run {new Date(routine.lastRunAt).toLocaleString()} · {routine.runCount} runs
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionBtn
            data-testid="routine-run-btn"
            title="Run now"
            onClick={onRun}
            disabled={running}
          >
            {running ? (
              <motion.div
                className="h-3.5 w-3.5 border border-violet-400/60 border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </ActionBtn>
          <ActionBtn title="History" onClick={onHistory}>
            <History className="h-3.5 w-3.5" />
          </ActionBtn>
          <ActionBtn title="Edit" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </ActionBtn>
          <ActionBtn title="Delete" onClick={onDelete} danger>
            <Trash2 className="h-3.5 w-3.5" />
          </ActionBtn>
        </div>
      </div>
    </motion.div>
  )
}

function ActionBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
  'data-testid': testId,
}: {
  children: ReactElement
  title: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  'data-testid'?: string
}): ReactElement {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={[
        'flex items-center justify-center w-7 h-7 rounded-lg transition-colors disabled:opacity-40',
        danger
          ? 'text-red-400/70 hover:bg-red-500/10'
          : 'text-[var(--color-text-tertiary)] hover:bg-white/[0.08] hover:text-[var(--color-text-primary)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// ── Marketplace panel ────────────────────────────────────────────────────────

function MarketplacePanel({ onInstalled }: { onInstalled: () => void }): ReactElement {
  const [examples, setExamples] = useState<ExampleRoutine[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    void (async () => {
      try {
        const res = await window.auralith.invoke('routines.listExamples', {})
        if (res.ok) {
          const data = res.data as { examples: ExampleRoutine[] }
          setExamples(data.examples)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const categories = ['all', ...Array.from(new Set(examples.map((e) => e.category))).sort()]

  const filtered = filter === 'all' ? examples : examples.filter((e) => e.category === filter)

  const handleInstall = async (ex: ExampleRoutine) => {
    setInstalling(ex.id)
    try {
      const res = await window.auralith.invoke('routines.installExample', { exampleId: ex.id })
      if (res.ok) {
        setInstalledIds((prev) => new Set([...prev, ex.id]))
        toast.success(`"${ex.name}" installed`)
        onInstalled()
      } else {
        toast.error('Failed to install routine')
      }
    } catch {
      toast.error('Failed to install routine')
    } finally {
      setInstalling(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-violet-500/60"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    )
  }

  if (examples.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <Store className="h-8 w-8 text-[var(--color-text-tertiary)]/60" />
        <p className="text-sm text-[var(--color-text-tertiary)]">No example routines found</p>
      </div>
    )
  }

  return (
    <FadeRise>
      <div className="space-y-5">
        {/* Category filter */}
        <div className="flex items-center gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize"
              style={{
                background: filter === cat ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${filter === cat ? 'rgba(139,92,246,0.35)' : 'var(--color-border-hairline)'}`,
                color: filter === cat ? 'var(--color-accent-mid)' : 'var(--color-text-tertiary)',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {filtered.map((ex) => {
              const colorClass = CATEGORY_COLORS[ex.category] ?? 'text-slate-400 bg-slate-500/10'
              const isInstalled = installedIds.has(ex.id)
              const isInstalling = installing === ex.id
              return (
                <motion.div
                  key={ex.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="group relative flex flex-col gap-3 transition-colors"
                  style={{
                    borderRadius: 14,
                    border: '1px solid var(--color-border-hairline)',
                    background: 'rgba(20,20,28,0.80)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    padding: '16px 18px',
                  }}
                  onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
                    e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
                  }}
                  onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
                    e.currentTarget.style.borderColor = 'var(--color-border-hairline)'
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">
                          {ex.name}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded capitalize font-medium ${colorClass}`}
                        >
                          {ex.category}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text-tertiary)] mt-1 leading-relaxed">
                        {ex.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-[11px] text-[var(--color-text-tertiary)]/60">
                      {ex.actions.length} {ex.actions.length === 1 ? 'action' : 'actions'}
                    </span>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => void handleInstall(ex)}
                      disabled={isInstalled || isInstalling}
                      className="flex items-center gap-1.5 text-xs font-medium transition-colors disabled:opacity-60"
                      style={{
                        padding: '4px 12px',
                        borderRadius: 7,
                        background: isInstalled ? 'rgba(16,185,129,0.12)' : 'rgba(139,92,246,0.15)',
                        border: `1px solid ${isInstalled ? 'rgba(16,185,129,0.25)' : 'rgba(139,92,246,0.20)'}`,
                        color: isInstalled ? '#34d399' : 'var(--color-accent-mid)',
                      }}
                    >
                      {isInstalling ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isInstalled ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )}
                      {isInstalled ? 'Installed' : 'Install'}
                    </motion.button>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    </FadeRise>
  )
}
