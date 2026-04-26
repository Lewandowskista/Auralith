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
  Headphones,
  Image,
  FileText,
  Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Routine } from '@auralith/core-domain'
import { FadeRise } from '@auralith/design-system'
import { RoutineEditor } from './RoutineEditor'
import { RoutineHistoryPanel } from './RoutineHistoryPanel'

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

function GhostBtn({
  children,
  icon,
  onClick,
  disabled,
  active,
}: {
  children?: React.ReactNode
  icon?: ReactElement
  onClick?: () => void
  disabled?: boolean
  active?: boolean
}): ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: children ? '6px 12px' : '6px 8px',
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 500,
        border: `1px solid ${active ? 'var(--color-border-accent)' : 'var(--color-border-hairline)'}`,
        background: active ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.04)',
        color: active ? 'var(--color-accent-mid)' : 'var(--color-text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 140ms ease',
        fontFamily: 'var(--font-sans)',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
          e.currentTarget.style.color = 'var(--color-text-primary)'
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = active
            ? 'rgba(139,92,246,0.12)'
            : 'rgba(255,255,255,0.04)'
          e.currentTarget.style.color = active
            ? 'var(--color-accent-mid)'
            : 'var(--color-text-secondary)'
        }
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function StatTile({
  label,
  value,
  sub,
  accent,
  chip,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  accent?: boolean
  chip?: React.ReactNode
}): ReactElement {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        border: `1px solid ${accent ? 'rgba(139,92,246,0.2)' : 'var(--color-border-hairline)'}`,
        background: accent ? 'rgba(139,92,246,0.06)' : 'rgba(18,18,26,0.72)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase' as const,
          color: 'var(--color-text-tertiary)',
          fontFamily: 'var(--font-mono)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 30,
            fontWeight: 500,
            lineHeight: 1,
            color: accent ? 'var(--color-accent-high)' : 'var(--color-text-primary)',
          }}
        >
          {value}
        </span>
        {chip}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--color-text-tertiary)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}

const GALLERY_RECIPES = [
  {
    id: 'focus-winddown',
    title: 'Focus wind-down',
    sub: 'When focus session ends, dim ether and queue a 2-minute voice summary.',
    icon: <Headphones size={14} />,
    color: '#8b5cf6',
  },
  {
    id: 'photo-sort',
    title: 'Photo sort',
    sub: 'New screenshots → OCR, tag, and file under a best-guess project.',
    icon: <Image size={14} />,
    color: '#38bdf8',
  },
  {
    id: 'eod-snapshot',
    title: 'End-of-day snapshot',
    sub: 'At 18:00, capture unresolved threads, TODOs, and open tabs into a note.',
    icon: <FileText size={14} />,
    color: '#34d399',
  },
]

export function AutomationsScreen(): ReactElement {
  const [tab, setTab] = useState<'mine' | 'browse'>('mine')
  const prevTabRef = useRef<'mine' | 'browse'>('mine')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null)
  const [historyFor, setHistoryFor] = useState<Routine | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [routineFilter, setRoutineFilter] = useState<'all' | 'enabled' | 'disabled'>('all')

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

  const activeCount = routines.filter((r) => r.enabled).length
  const totalRuns = routines.reduce((s, r) => s + (r.runCount ?? 0), 0)
  const pendingConfirm = routines.filter((r) => r.lastStatus === 'blocked').length

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        padding: '28px 28px 0',
      }}
    >
      {/* Narrative header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        style={{ marginBottom: 20, flexShrink: 0 }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 32,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
                marginBottom: 6,
                color: 'var(--color-text-primary)',
              }}
            >
              Quiet{' '}
              <em style={{ fontStyle: 'italic', color: 'var(--color-accent-mid)' }}>helpers</em>
            </h1>
            <p
              style={{
                fontSize: 13,
                color: 'var(--color-text-tertiary)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {activeCount} of {routines.length} enabled
              {totalRuns > 0 ? ` · ${totalRuns.toLocaleString()} total runs` : ''}
              {' · all local'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 4 }}>
            <GhostBtn
              icon={<History size={12} />}
              onClick={() => {
                const mostRecent = routines.find((r) => r.lastRunAt)
                if (mostRecent) setHistoryFor(mostRecent)
                else toast.info('No run history yet — trigger a routine first')
              }}
            >
              History
            </GhostBtn>
            <GhostBtn
              icon={<Store size={12} />}
              onClick={() => setTab('browse')}
              active={tab === 'browse'}
            >
              Gallery
            </GhostBtn>
            <motion.button
              data-testid="routine-create-btn"
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setEditingRoutine(null)
                setEditorOpen(true)
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid rgba(139,92,246,0.35)',
                background: 'var(--color-accent-gradient)',
                color: '#fff',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <Plus size={12} />
              New automation
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Stat tiles */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: 0.06, ease: [0.2, 0.8, 0.2, 1] }}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 20,
          flexShrink: 0,
        }}
      >
        <StatTile
          label="Active"
          value={
            <>
              {activeCount}
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 16,
                  color: 'var(--color-text-tertiary)',
                  fontWeight: 400,
                }}
              >
                /{routines.length}
              </span>
            </>
          }
          sub="automations running"
        />
        <StatTile label="Runs today" value={Math.min(totalRuns, 99)} sub="across all routines" />
        <StatTile label="Time saved" value="—" sub="est. this week" />
        <StatTile
          label="Awaiting you"
          value={pendingConfirm}
          sub={pendingConfirm === 1 ? 'needs confirmation' : 'nothing pending'}
          accent={pendingConfirm > 0}
          chip={
            pendingConfirm > 0 ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'rgba(251,191,36,0.15)',
                  border: '1px solid rgba(251,191,36,0.3)',
                  color: '#fbbf24',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                confirm
              </span>
            ) : undefined
          }
        />
      </motion.div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          borderBottom: '1px solid var(--color-border-hairline)',
          background: 'rgba(14,14,20,0.40)',
          flexShrink: 0,
          marginLeft: -28,
          marginRight: -28,
          paddingLeft: 28,
        }}
      >
        {(['mine', 'browse'] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              prevTabRef.current = tab
              setTab(t)
            }}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 500,
              fontFamily: 'var(--font-sans)',
              color: tab === t ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'color 140ms ease',
            }}
          >
            {t === 'mine' ? <Zap size={14} /> : <Store size={14} />}
            {t === 'mine' ? 'My Routines' : 'Browse'}
            {tab === t && (
              <motion.div
                layoutId="routines-tab-underline"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  borderRadius: 999,
                  background: 'var(--color-accent-gradient)',
                }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <TabContent tabKey={tab} direction={tab === 'browse' ? 1 : -1}>
          <div style={{ padding: '24px 0 28px' }}>
            {tab === 'browse' ? (
              <MarketplacePanel
                onInstalled={() => {
                  prevTabRef.current = 'browse'
                  void loadRoutines()
                  setTab('mine')
                }}
              />
            ) : (
              /* Mine tab — 2-col layout */
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)',
                  gap: 20,
                  alignItems: 'start',
                }}
              >
                {/* Left: routines list */}
                <div>
                  {/* Section header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: 'var(--color-text-tertiary)',
                          fontFamily: 'var(--font-mono)',
                          marginBottom: 2,
                        }}
                      >
                        Your automations
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--color-text-primary)',
                          fontFamily: 'var(--font-sans)',
                        }}
                      >
                        Enabled first
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <GhostBtn
                        icon={<Filter size={11} />}
                        active={routineFilter !== 'all'}
                        onClick={() =>
                          setRoutineFilter((f) =>
                            f === 'all' ? 'enabled' : f === 'enabled' ? 'disabled' : 'all',
                          )
                        }
                      >
                        {routineFilter === 'all'
                          ? 'All'
                          : routineFilter === 'enabled'
                            ? 'Active'
                            : 'Disabled'}
                      </GhostBtn>
                    </div>
                  </div>

                  {loading ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: 128,
                      }}
                    >
                      <div
                        style={{
                          height: 4,
                          width: 64,
                          overflow: 'hidden',
                          borderRadius: 999,
                          background: 'rgba(255,255,255,0.08)',
                        }}
                      >
                        <motion.div
                          style={{
                            height: '100%',
                            borderRadius: 999,
                            background: 'rgba(139,92,246,0.6)',
                          }}
                          animate={{ x: ['-100%', '100%'] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      </div>
                    </div>
                  ) : routines.length === 0 ? (
                    <AutomationsEmpty onNew={() => setEditorOpen(true)} />
                  ) : (
                    <FadeRise>
                      <div
                        data-testid="routines-list"
                        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                      >
                        {[...routines]
                          .filter(
                            (r) =>
                              routineFilter === 'all' ||
                              (routineFilter === 'enabled' ? r.enabled : !r.enabled),
                          )
                          .sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0))
                          .map((r) => (
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

                {/* Right: recent runs + gallery */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Recent runs */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: 'var(--color-text-tertiary)',
                            fontFamily: 'var(--font-mono)',
                            marginBottom: 2,
                          }}
                        >
                          Recent runs
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--color-text-primary)',
                            fontFamily: 'var(--font-sans)',
                          }}
                        >
                          Last 7 days
                        </div>
                      </div>
                      <GhostBtn
                        onClick={() => {
                          const r = routines.find((x) => x.lastRunAt)
                          if (r) setHistoryFor(r)
                          else toast.info('No run history yet')
                        }}
                      >
                        See all
                      </GhostBtn>
                    </div>
                    <div
                      style={{
                        borderRadius: 14,
                        border: '1px solid var(--color-border-hairline)',
                        background: 'rgba(18,18,26,0.72)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        overflow: 'hidden',
                      }}
                    >
                      {routines.length === 0 ? (
                        <div
                          style={{
                            padding: '16px 16px',
                            textAlign: 'center',
                            fontSize: 12,
                            color: 'var(--color-text-tertiary)',
                            fontFamily: 'var(--font-sans)',
                          }}
                        >
                          No runs yet
                        </div>
                      ) : (
                        routines.slice(0, 5).map((r, i) => (
                          <div
                            key={r.id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '10px minmax(0, 1fr) 60px',
                              alignItems: 'center',
                              gap: 12,
                              padding: '10px 16px',
                              borderBottom:
                                i < Math.min(routines.length, 5) - 1
                                  ? '1px solid var(--color-border-hairline)'
                                  : 'none',
                              fontSize: 12,
                            }}
                          >
                            <div
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background:
                                  r.lastStatus === 'success'
                                    ? '#34d399'
                                    : r.lastStatus === 'failure'
                                      ? '#f87171'
                                      : 'rgba(255,255,255,0.2)',
                                boxShadow:
                                  r.lastStatus === 'success'
                                    ? '0 0 8px rgba(52,211,153,0.55)'
                                    : r.lastStatus === 'failure'
                                      ? '0 0 8px rgba(248,113,113,0.55)'
                                      : 'none',
                                flexShrink: 0,
                              }}
                            />
                            <div
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: 'var(--color-text-primary)',
                                fontWeight: 500,
                                fontFamily: 'var(--font-sans)',
                              }}
                            >
                              {r.name}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--color-text-tertiary)',
                                textAlign: 'right',
                              }}
                            >
                              {r.runCount ?? 0} runs
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Gallery */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: 'var(--color-text-tertiary)',
                            fontFamily: 'var(--font-mono)',
                            marginBottom: 2,
                          }}
                        >
                          Gallery
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--color-text-primary)',
                            fontFamily: 'var(--font-sans)',
                          }}
                        >
                          Ideas to add
                        </div>
                      </div>
                      <GhostBtn onClick={() => setTab('browse')}>Browse</GhostBtn>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {GALLERY_RECIPES.map((recipe) => (
                        <button
                          key={recipe.id}
                          onClick={() => setTab('browse')}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: 14,
                            borderRadius: 12,
                            border: '1px solid var(--color-border-hairline)',
                            background: 'rgba(18,18,26,0.72)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                            transition: 'border-color 140ms ease, background 140ms ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
                            e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--color-border-hairline)'
                            e.currentTarget.style.background = 'rgba(18,18,26,0.72)'
                          }}
                        >
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 10,
                              background: `${recipe.color}18`,
                              border: `1px solid ${recipe.color}30`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: recipe.color,
                              flexShrink: 0,
                            }}
                          >
                            {recipe.icon}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: 'var(--color-text-primary)',
                                fontFamily: 'var(--font-sans)',
                                marginBottom: 2,
                              }}
                            >
                              {recipe.title}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: 'var(--color-text-tertiary)',
                                fontFamily: 'var(--font-sans)',
                                lineHeight: 1.4,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {recipe.sub}
                            </div>
                          </div>
                          <Plus
                            size={14}
                            style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
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
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function AutomationsEmpty({ onNew }: { onNew: () => void }): ReactElement {
  return (
    <div
      data-testid="routines-empty"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: 256,
        textAlign: 'center',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          background: 'rgba(139,92,246,0.10)',
          border: '1px solid rgba(139,92,246,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-accent-mid)',
        }}
      >
        <Zap size={24} />
      </div>
      <div>
        <p
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-sans)',
            marginBottom: 4,
          }}
        >
          No automations yet
        </p>
        <p
          style={{
            fontSize: 13,
            color: 'var(--color-text-tertiary)',
            fontFamily: 'var(--font-sans)',
            maxWidth: 280,
          }}
        >
          Create a routine to automatically run actions when conditions are met.
        </p>
      </div>
      <button
        onClick={onNew}
        style={{
          padding: '8px 18px',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
          border: '1px solid rgba(139,92,246,0.35)',
          background: 'rgba(139,92,246,0.15)',
          color: 'var(--color-accent-mid)',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          transition: 'all 140ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(139,92,246,0.25)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(139,92,246,0.15)'
        }}
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
      className="group"
      style={{
        borderRadius: 14,
        border: '1px solid var(--color-border-hairline)',
        background: 'rgba(18,18,26,0.72)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '14px 16px',
        opacity: routine.enabled ? 1 : 0.72,
        transition: 'border-color 140ms ease, opacity 200ms ease',
      }}
      onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
        e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
      }}
      onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
        e.currentTarget.style.borderColor = 'var(--color-border-hairline)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Enable toggle */}
        <button
          onClick={onToggle}
          style={{
            flexShrink: 0,
            marginTop: 2,
            width: 32,
            height: 32,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${routine.enabled ? 'rgba(139,92,246,0.3)' : 'var(--color-border-hairline)'}`,
            background: routine.enabled ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.04)',
            color: routine.enabled ? 'var(--color-accent-mid)' : 'var(--color-text-tertiary)',
            cursor: 'pointer',
            transition: 'all 140ms ease',
          }}
          title={routine.enabled ? 'Disable' : 'Enable'}
        >
          <Zap size={14} strokeWidth={routine.enabled ? 2 : 1.5} />
        </button>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 4,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-sans)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {routine.name}
            </span>
            {lastStatus && STATUS_ICON[lastStatus]}
            {!routine.enabled && (
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 5,
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--color-text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                disabled
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
                fontFamily: 'var(--font-sans)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Clock size={11} />
              {triggerLabel(routine.trigger)}
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              → {routine.action.toolId}
            </span>
          </div>
          {routine.lastRunAt && (
            <p
              style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.3)',
                marginTop: 4,
                fontFamily: 'var(--font-sans)',
              }}
            >
              Last run {new Date(routine.lastRunAt).toLocaleString()} · {routine.runCount} runs
            </p>
          )}
        </div>

        {/* Actions — visible on hover */}
        <div
          className="opacity-0 group-hover:opacity-100"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'opacity 140ms ease',
          }}
        >
          <ActionBtn
            data-testid="routine-run-btn"
            title="Run now"
            onClick={onRun}
            disabled={running}
          >
            {running ? (
              <motion.div
                style={{
                  width: 14,
                  height: 14,
                  border: '1.5px solid rgba(139,92,246,0.6)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              />
            ) : (
              <Play size={13} />
            )}
          </ActionBtn>
          <ActionBtn title="History" onClick={onHistory}>
            <History size={13} />
          </ActionBtn>
          <ActionBtn title="Edit" onClick={onEdit}>
            <Pencil size={13} />
          </ActionBtn>
          <ActionBtn title="Delete" onClick={onDelete} danger>
            <Trash2 size={13} />
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
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 8,
        border: '1px solid transparent',
        background: 'transparent',
        color: danger ? 'rgba(248,113,113,0.7)' : 'var(--color-text-tertiary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all 140ms ease',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = danger
            ? 'rgba(239,68,68,0.10)'
            : 'rgba(255,255,255,0.08)'
          e.currentTarget.style.borderColor = danger
            ? 'rgba(239,68,68,0.2)'
            : 'var(--color-border-hairline)'
          e.currentTarget.style.color = danger ? '#f87171' : 'var(--color-text-primary)'
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.borderColor = 'transparent'
          e.currentTarget.style.color = danger
            ? 'rgba(248,113,113,0.7)'
            : 'var(--color-text-tertiary)'
        }
      }}
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 128 }}>
        <div
          style={{
            height: 4,
            width: 64,
            overflow: 'hidden',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.08)',
          }}
        >
          <motion.div
            style={{ height: '100%', borderRadius: 999, background: 'rgba(139,92,246,0.6)' }}
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    )
  }

  if (examples.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 256,
          gap: 12,
          textAlign: 'center',
        }}
      >
        <Store size={32} style={{ color: 'rgba(255,255,255,0.2)' }} />
        <p
          style={{
            fontSize: 13,
            color: 'var(--color-text-tertiary)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          No example routines found
        </p>
      </div>
    )
  }

  return (
    <FadeRise>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Category filter chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              style={{
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 500,
                textTransform: 'capitalize',
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                transition: 'all 140ms ease',
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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 12,
          }}
        >
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
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    borderRadius: 14,
                    border: '1px solid var(--color-border-hairline)',
                    background: 'rgba(18,18,26,0.72)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    padding: '16px 18px',
                    transition: 'border-color 140ms ease',
                  }}
                  onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
                    e.currentTarget.style.borderColor = 'var(--color-border-subtle)'
                  }}
                  onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
                    e.currentTarget.style.borderColor = 'var(--color-border-hairline)'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--color-text-primary)',
                            fontFamily: 'var(--font-sans)',
                          }}
                        >
                          {ex.name}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded capitalize font-medium ${colorClass}`}
                        >
                          {ex.category}
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: 12,
                          color: 'var(--color-text-tertiary)',
                          fontFamily: 'var(--font-sans)',
                          lineHeight: 1.5,
                        }}
                      >
                        {ex.description}
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 'auto',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.3)',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {ex.actions.length} {ex.actions.length === 1 ? 'action' : 'actions'}
                    </span>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => void handleInstall(ex)}
                      disabled={isInstalled || isInstalling}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 12px',
                        borderRadius: 7,
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: 'var(--font-sans)',
                        cursor: isInstalled ? 'default' : 'pointer',
                        opacity: isInstalling ? 0.7 : 1,
                        transition: 'all 140ms ease',
                        background: isInstalled ? 'rgba(16,185,129,0.12)' : 'rgba(139,92,246,0.15)',
                        border: `1px solid ${isInstalled ? 'rgba(16,185,129,0.25)' : 'rgba(139,92,246,0.20)'}`,
                        color: isInstalled ? '#34d399' : 'var(--color-accent-mid)',
                      }}
                    >
                      {isInstalling ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : isInstalled ? (
                        <CheckCircle size={12} />
                      ) : (
                        <Download size={12} />
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
