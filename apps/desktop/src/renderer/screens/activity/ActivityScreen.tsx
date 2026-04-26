import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { ReactElement } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TabContent } from '@auralith/design-system'
import {
  FilePlus,
  FileEdit,
  FileMinus,
  FolderOpen,
  Download,
  Bot,
  ChevronDown,
  ChevronRight,
  X,
  MessageSquare,
  Clock,
  Filter,
  Activity,
  Clipboard,
  Monitor,
  ShieldCheck,
  ShieldOff,
  CheckCircle2,
  AlertCircle,
  Camera,
  Sparkles,
  Mic,
} from 'lucide-react'
import { EmptyState } from '../../components/EmptyState'

// ── Types ────────────────────────────────────────────────────────────────────

type EventKind =
  | 'file.create'
  | 'file.edit'
  | 'file.move'
  | 'file.rename'
  | 'file.delete'
  | 'file.download'
  | 'assistant.action'
  | 'app.focus'

type EventRow = {
  id: string
  ts: number
  kind: EventKind
  source: string
  path: string
  prevPath?: string
  spaceId?: string
  actor: string
  payloadJson: string
  sessionId?: string
}

type SessionRow = {
  id: string
  startedAt: number
  endedAt?: number
  summary?: string
  eventCount: number
}

type ClipboardItem = {
  id: string
  ts: number
  kind: 'text' | 'image' | 'file'
  textValue?: string
  charCount?: number
  redacted: boolean
  sessionId?: string
}

type AppUsageRow = {
  id: string
  startedAt: number
  endedAt?: number
  bucket: 'ide' | 'browser' | 'explorer' | 'media' | 'productivity' | 'other'
  processName: string
  durationMs?: number
}

type ActiveView = 'timeline' | 'clipboard' | 'appusage'

// ── Constants ────────────────────────────────────────────────────────────────

const KIND_LABELS: Record<EventKind, string> = {
  'file.create': 'Created',
  'file.edit': 'Edited',
  'file.move': 'Moved',
  'file.rename': 'Renamed',
  'file.delete': 'Deleted',
  'file.download': 'Downloaded',
  'assistant.action': 'AI action',
  'app.focus': 'App focus',
}

const KIND_ICONS: Record<EventKind, ReactElement> = {
  'file.create': <FilePlus className="h-3.5 w-3.5" />,
  'file.edit': <FileEdit className="h-3.5 w-3.5" />,
  'file.move': <FolderOpen className="h-3.5 w-3.5" />,
  'file.rename': <FolderOpen className="h-3.5 w-3.5" />,
  'file.delete': <FileMinus className="h-3.5 w-3.5" />,
  'file.download': <Download className="h-3.5 w-3.5" />,
  'assistant.action': <Bot className="h-3.5 w-3.5" />,
  'app.focus': <Monitor className="h-3.5 w-3.5" />,
}

const KIND_COLORS: Record<EventKind, string> = {
  'file.create': 'text-emerald-400',
  'file.edit': 'text-violet-400',
  'file.move': 'text-blue-400',
  'file.rename': 'text-blue-400',
  'file.delete': 'text-red-400',
  'file.download': 'text-amber-400',
  'assistant.action': 'text-violet-400',
  'app.focus': 'text-sky-400',
}

const KIND_BADGE_COLORS: Record<EventKind, { bg: string; color: string }> = {
  'file.create': { bg: 'rgba(52,211,153,0.12)', color: '#34d399' },
  'file.edit': { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa' },
  'file.move': { bg: 'rgba(96,165,250,0.12)', color: '#60a5fa' },
  'file.rename': { bg: 'rgba(96,165,250,0.12)', color: '#60a5fa' },
  'file.delete': { bg: 'rgba(248,113,113,0.12)', color: '#f87171' },
  'file.download': { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24' },
  'assistant.action': { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa' },
  'app.focus': { bg: 'rgba(56,189,248,0.12)', color: '#38bdf8' },
}

const ALL_KINDS: EventKind[] = [
  'file.create',
  'file.edit',
  'file.move',
  'file.rename',
  'file.delete',
  'file.download',
  'assistant.action',
  'app.focus',
]

const BUCKET_LABELS: Record<AppUsageRow['bucket'], string> = {
  ide: 'IDE',
  browser: 'Browser',
  explorer: 'Files',
  media: 'Media',
  productivity: 'Productivity',
  other: 'Other',
}

const BUCKET_COLORS: Record<AppUsageRow['bucket'], string> = {
  ide: 'text-violet-400',
  browser: 'text-blue-400',
  explorer: 'text-amber-400',
  media: 'text-pink-400',
  productivity: 'text-emerald-400',
  other: 'text-zinc-400',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

function sessionLabel(s: SessionRow): string {
  if (s.summary) return s.summary
  const start = new Date(s.startedAt)
  const end = s.endedAt ? new Date(s.endedAt) : new Date()
  const dur = Math.round((end.getTime() - start.getTime()) / 60000)
  return `${s.eventCount} event${s.eventCount !== 1 ? 's' : ''} · ${dur}m session`
}

function formatDuration(ms?: number): string {
  if (!ms) return '—'
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

// ── Grouped timeline types ────────────────────────────────────────────────────

type GroupedItem =
  | { type: 'date-header'; label: string; ts: number }
  | { type: 'session-header'; session: SessionRow; collapsed: boolean }
  | { type: 'event'; event: EventRow }

// ── Mini sparkline ────────────────────────────────────────────────────────────

function Sparkline({
  values,
  color = '#8b5cf6',
  height = 28,
}: {
  values: number[]
  color?: string
  height?: number
}): ReactElement {
  if (!values.length) return <div style={{ height }} />
  const max = Math.max(...values, 1)
  const w = 100
  const h = height
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - (v / max) * (h - 4) - 2])
  const line = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const fill = `${line} L${w},${h} L0,${h} Z`
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#sg-${color.replace('#', '')})`} />
      <path
        d={line}
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}
      />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const TAB_ORDER: ActiveView[] = ['timeline', 'clipboard', 'appusage']

export function ActivityScreen(): ReactElement {
  const [view, setView] = useState<ActiveView>('timeline')
  const prevViewRef = useRef<ActiveView>('timeline')
  const [totalEvents, setTotalEvents] = useState(0)
  const [kindFilter, setKindFilter] = useState<EventKind | null>(null)
  const [dateFilter, setDateFilter] = useState<'today' | null>(null)
  const [timelinePage, setTimelinePage] = useState(0)
  const [summarizing, setSummarizing] = useState(false)
  const [eventCount, setEventCount] = useState(0)

  const handleSummarize = useCallback(async () => {
    if (summarizing || eventCount === 0) return
    setSummarizing(true)
    try {
      const today = dateFilter === 'today'
      const prompt = today
        ? 'Please summarize what I did today based on my recent activity.'
        : 'Please summarize my recent desktop activity — what files I worked on, what sessions stand out, and anything worth remembering.'
      window.dispatchEvent(
        new CustomEvent('auralith:navigate', { detail: { section: 'assistant' } }),
      )
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('auralith:assistant-prefill', { detail: prompt }))
      }, 300)
    } finally {
      setSummarizing(false)
    }
  }, [summarizing, eventCount, dateFilter])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Narrative header ──────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        className="shrink-0 px-8 pt-7 pb-5"
        style={{ borderBottom: '1px solid var(--color-border-hairline)' }}
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 32,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                color: 'var(--color-text-primary)',
                lineHeight: 1.1,
                marginBottom: 6,
              }}
            >
              Your <em style={{ fontStyle: 'italic', color: 'var(--color-accent-mid)' }}>day</em>,
              replayed
            </h1>
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
              {totalEvents > 0
                ? `${totalEvents.toLocaleString()} event${totalEvents !== 1 ? 's' : ''} captured silently on-device`
                : 'Events from your watched folders will appear here'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setKindFilter(null)
                setTimelinePage(0)
              }}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition"
              style={{
                border: `1px solid ${kindFilter === null ? 'var(--color-border-accent)' : 'var(--color-border-hairline)'}`,
                background: kindFilter === null ? 'rgba(139,92,246,0.12)' : 'transparent',
                color:
                  kindFilter === null ? 'var(--color-accent-mid)' : 'var(--color-text-secondary)',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={(e) => {
                if (kindFilter !== null) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              }}
              onMouseLeave={(e) => {
                if (kindFilter !== null) e.currentTarget.style.background = 'transparent'
              }}
            >
              <Filter className="h-3.5 w-3.5" />
              All kinds
            </button>
            <button
              onClick={() => {
                setDateFilter(dateFilter === 'today' ? null : 'today')
                setTimelinePage(0)
              }}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition"
              style={{
                border: `1px solid ${dateFilter === 'today' ? 'var(--color-border-accent)' : 'var(--color-border-hairline)'}`,
                background: dateFilter === 'today' ? 'rgba(139,92,246,0.12)' : 'transparent',
                color:
                  dateFilter === 'today'
                    ? 'var(--color-accent-mid)'
                    : 'var(--color-text-secondary)',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={(e) => {
                if (dateFilter !== 'today')
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              }}
              onMouseLeave={(e) => {
                if (dateFilter !== 'today') e.currentTarget.style.background = 'transparent'
              }}
            >
              <Clock className="h-3.5 w-3.5" />
              Today
            </button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => void handleSummarize()}
              disabled={summarizing || eventCount === 0}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{
                background: 'var(--color-accent-gradient)',
                boxShadow: '0 2px 10px rgba(139,92,246,0.3)',
              }}
            >
              <Sparkles className={`h-3.5 w-3.5 ${summarizing ? 'animate-pulse' : ''}`} />
              {summarizing ? 'Summarizing…' : 'Summarize'}
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ── View tab bar ─────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 items-center gap-1 px-8 py-2"
        style={{
          borderBottom: '1px solid var(--color-border-hairline)',
          background: 'rgba(14,14,20,0.40)',
        }}
      >
        {[
          {
            id: 'timeline' as const,
            label: 'Timeline',
            icon: <Activity className="h-3.5 w-3.5" />,
          },
          {
            id: 'clipboard' as const,
            label: 'Clipboard',
            icon: <Clipboard className="h-3.5 w-3.5" />,
          },
          {
            id: 'appusage' as const,
            label: 'App Usage',
            icon: <Monitor className="h-3.5 w-3.5" />,
          },
        ].map(({ id, label, icon }) => {
          const active = view === id
          return (
            <button
              key={id}
              onClick={() => {
                prevViewRef.current = view
                setView(id)
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500"
              style={{
                background: active ? 'rgba(139,92,246,0.15)' : 'transparent',
                color: active ? 'var(--color-accent-mid)' : 'var(--color-text-secondary)',
                border: `1px solid ${active ? 'var(--color-border-accent)' : 'transparent'}`,
              }}
            >
              {icon}
              {label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-hidden">
        <TabContent
          tabKey={view}
          direction={TAB_ORDER.indexOf(view) - TAB_ORDER.indexOf(prevViewRef.current) >= 0 ? 1 : -1}
        >
          {view === 'timeline' && (
            <TimelineView
              onTotalChange={(n) => {
                setTotalEvents(n)
                setEventCount(n)
              }}
              kindFilter={kindFilter}
              onKindFilterChange={(k) => {
                setKindFilter(k)
              }}
              dateFilter={dateFilter}
              page={timelinePage}
              onPageChange={setTimelinePage}
            />
          )}
          {view === 'clipboard' && <ClipboardView />}
          {view === 'appusage' && <AppUsageView />}
        </TabContent>
      </div>
    </div>
  )
}

// ── Timeline view ──────────────────────────────────────────────────────────────

function TimelineView({
  onTotalChange,
  kindFilter,
  onKindFilterChange,
  dateFilter,
  page,
  onPageChange,
}: {
  onTotalChange?: (n: number) => void
  kindFilter: EventKind | null
  onKindFilterChange: (k: EventKind | null) => void
  dateFilter: 'today' | null
  page: number
  onPageChange: (p: number) => void
}): ReactElement {
  const setPage = onPageChange
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null)
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set())
  const [watchedFolders, setWatchedFolders] = useState<string[]>([])
  const PAGE_SIZE = 100
  const listRef = useRef<HTMLDivElement>(null)

  const todayStart = dateFilter === 'today' ? new Date().setHours(0, 0, 0, 0) : null

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [evRes, sessRes] = await Promise.all([
        window.auralith.invoke('activity.query', {
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          ...(kindFilter ? { kind: kindFilter } : {}),
          ...(todayStart ? { since: todayStart } : {}),
        }),
        window.auralith.invoke('activity.listSessions', { limit: 50, offset: 0 }),
      ])
      if (evRes.ok) {
        const d = evRes.data as { events: EventRow[]; total: number }
        setEvents(d.events)
        setTotal(d.total)
        onTotalChange?.(d.total)
      }
      if (sessRes.ok) {
        const d = sessRes.data as { sessions: SessionRow[]; total: number }
        setSessions(d.sessions)
      }
    } finally {
      setLoading(false)
    }
  }, [kindFilter, page, todayStart, onTotalChange])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    const unsub = window.auralith.on('activity:updated', () => void load())
    const id = setInterval(() => void load(), 30_000)
    return () => {
      unsub()
      clearInterval(id)
    }
  }, [load])
  useEffect(() => {
    void window.auralith.invoke('activity.getWatchedFolders', {}).then((res) => {
      if (res.ok) setWatchedFolders((res.data as { folders: string[] }).folders)
    })
  }, [])

  function toggleSessionCollapse(id: string) {
    setCollapsedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const grouped = useMemo(
    () => buildGroupedList(events, sessions, collapsedSessions),
    [events, sessions, collapsedSessions],
  )

  function handleAskAssistant(session: SessionRow) {
    const prompt = `Summarize what I was working on during this session: ${sessionLabel(session)} (started ${new Date(session.startedAt).toLocaleString()})`
    window.dispatchEvent(new CustomEvent('auralith:navigate', { detail: { section: 'assistant' } }))
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('auralith:assistant-prefill', { detail: prompt }))
    }, 300)
  }

  // Derive bucket breakdown from events for focus widget
  const bucketCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const ev of events) {
      counts[ev.kind] = (counts[ev.kind] ?? 0) + 1
    }
    return counts
  }, [events])

  const sparkValues = useMemo(() => {
    const byHour: number[] = Array(8).fill(0)
    const now = Date.now()
    for (const ev of events) {
      const hoursAgo = Math.floor((now - ev.ts) / 3600000)
      if (hoursAgo < 8) byHour[7 - hoursAgo]++
    }
    return byHour
  }, [events])

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Stat widgets */}
        {!loading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) 240px',
              gap: 14,
              padding: '16px 20px',
              borderBottom: '1px solid var(--color-border-hairline)',
            }}
          >
            {/* Focus card */}
            <div
              style={{
                borderRadius: 14,
                border: '1px solid var(--color-border-hairline)',
                background: 'rgba(18,18,26,0.72)',
                backdropFilter: 'blur(12px)',
                padding: 16,
              }}
            >
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
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}
                  >
                    Activity, last 8 hours
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    events per hour
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: 99,
                    background: 'rgba(52,211,153,0.12)',
                    border: '1px solid rgba(52,211,153,0.2)',
                    color: '#34d399',
                  }}
                >
                  {total.toLocaleString()} total
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(80px,1fr))',
                  gap: 6,
                  marginBottom: 12,
                }}
              >
                {Object.entries(bucketCounts)
                  .slice(0, 6)
                  .map(([kind, count]) => {
                    const badge = KIND_BADGE_COLORS[kind as EventKind] ?? {
                      bg: 'rgba(255,255,255,0.06)',
                      color: 'var(--color-text-secondary)',
                    }
                    return (
                      <div
                        key={kind}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 8,
                          background: badge.bg,
                          border: `1px solid ${badge.color}30`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: badge.color,
                            marginBottom: 2,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                          }}
                        >
                          {KIND_LABELS[kind as EventKind] ?? kind}
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 18,
                            fontWeight: 500,
                            color: 'var(--color-text-primary)',
                            lineHeight: 1,
                          }}
                        >
                          {count}
                        </div>
                      </div>
                    )
                  })}
              </div>
              <Sparkline values={sparkValues} color="#8b5cf6" height={32} />
            </div>

            {/* Captures widget */}
            <div
              style={{
                borderRadius: 14,
                border: '1px solid var(--color-border-hairline)',
                background: 'rgba(18,18,26,0.72)',
                backdropFilter: 'blur(12px)',
                padding: 16,
              }}
            >
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
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}
                  >
                    Captures
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    since session start
                  </div>
                </div>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: 'rgba(56,189,248,0.12)',
                    border: '1px solid rgba(56,189,248,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Camera style={{ width: 14, height: 14, color: '#38bdf8' }} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 36,
                    fontWeight: 500,
                    lineHeight: 1,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {
                    events.filter((e) => e.kind === 'file.create' || e.kind === 'file.download')
                      .length
                  }
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  files + downloads
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 10,
                  color: 'var(--color-text-tertiary)',
                  marginBottom: 10,
                }}
              >
                <Mic style={{ width: 10, height: 10 }} />
                {sessions.length} session{sessions.length !== 1 ? 's' : ''} tracked
              </div>
              <Sparkline
                values={sparkValues.map((v) => Math.round(v * 0.4))}
                color="#38bdf8"
                height={28}
              />
            </div>
          </motion.div>
        )}

        {/* Watching status bar */}
        <div
          className="flex shrink-0 items-center gap-2 px-6 py-2"
          style={{
            borderBottom: '1px solid var(--color-border-hairline)',
            background: 'rgba(10,10,16,0.35)',
          }}
        >
          {watchedFolders.length > 0 ? (
            <>
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
              <span className="text-[11px] text-[var(--color-text-secondary)]">
                Watching {watchedFolders.length} folder{watchedFolders.length !== 1 ? 's' : ''}
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="h-3 w-3 shrink-0 text-amber-400" />
              <span className="text-[11px] text-[var(--color-text-secondary)]">
                File watching inactive —{' '}
                <button
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent('auralith:navigate', { detail: { section: 'settings' } }),
                    )
                  }
                  className="text-violet-400 underline-offset-2 hover:underline focus-visible:outline-none"
                >
                  Configure in Settings
                </button>
              </span>
            </>
          )}

          <div className="flex-1" />

          {/* Kind filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="h-3 w-3 text-[var(--color-text-tertiary)]" />
            {[null, ...ALL_KINDS].map((k) => {
              const isActive = kindFilter === k
              const label = k === null ? 'All' : KIND_LABELS[k as EventKind]
              return (
                <button
                  key={k ?? 'all'}
                  onClick={() => {
                    onKindFilterChange(k as EventKind | null)
                    setPage(0)
                  }}
                  className="transition-all focus-visible:outline-none"
                  style={{
                    padding: '2px 8px',
                    borderRadius: 99,
                    fontSize: 10,
                    fontWeight: 500,
                    border: `1px solid ${isActive ? 'var(--color-border-accent)' : 'var(--color-border-hairline)'}`,
                    background: isActive ? 'rgba(139,92,246,0.15)' : 'transparent',
                    color: isActive ? 'var(--color-accent-mid)' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Vertical timeline */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-6 py-4">
          {loading && events.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-[var(--color-text-tertiary)]">Loading…</p>
            </div>
          ) : events.length === 0 ? (
            <EmptyState
              icon={<Activity size={22} />}
              title="No activity yet"
              description="Files created, edited, moved, or downloaded in your watched folders will appear here, grouped into sessions."
            />
          ) : (
            /* Vertical timeline with left rail */
            <div style={{ position: 'relative' }}>
              {/* Vertical rail line */}
              <div
                style={{
                  position: 'absolute',
                  left: 17,
                  top: 28,
                  bottom: 28,
                  width: 2,
                  background:
                    'linear-gradient(180deg, rgba(139,92,246,0.4) 0%, transparent 60%, var(--color-border-hairline) 100%)',
                  borderRadius: 1,
                }}
              />

              <div className="space-y-0.5" style={{ paddingLeft: 48 }}>
                {grouped.map((item, i) => {
                  if (item.type === 'date-header') {
                    return (
                      <div
                        key={`dh-${item.ts}`}
                        className="sticky top-0 z-10 flex items-center gap-2 py-2 pt-4"
                        style={{
                          background: 'rgba(7,7,11,0.88)',
                          backdropFilter: 'blur(8px)',
                          marginLeft: -48,
                        }}
                      >
                        <div style={{ width: 36, display: 'flex', justifyContent: 'center' }}>
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: 'var(--color-border-subtle)',
                              border: '2px solid rgba(7,7,11,0.88)',
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">
                          {item.label}
                        </span>
                        <div
                          className="flex-1"
                          style={{ height: 1, background: 'var(--color-border-hairline)' }}
                        />
                      </div>
                    )
                  }
                  if (item.type === 'session-header') {
                    const collapsed = item.collapsed
                    return (
                      <div
                        key={`sh-${item.session.id}`}
                        style={{ position: 'relative', marginLeft: -48 }}
                      >
                        {/* Session icon badge on rail */}
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 8,
                            width: 36,
                            display: 'flex',
                            justifyContent: 'center',
                          }}
                        >
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              background: 'rgba(139,92,246,0.12)',
                              border: '1px solid rgba(139,92,246,0.22)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 0 0 3px rgba(7,7,11,0.9)',
                            }}
                          >
                            <Clock style={{ width: 12, height: 12, color: '#a78bfa' }} />
                          </div>
                        </div>
                        <button
                          onClick={() => toggleSessionCollapse(item.session.id)}
                          className="flex w-full items-center gap-2 rounded-lg py-2 text-left hover:bg-white/[0.03] transition focus-visible:outline-none"
                          style={{ paddingLeft: 44, paddingRight: 12 }}
                        >
                          {collapsed ? (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-tertiary)]" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-tertiary)]" />
                          )}
                          <span className="flex-1 text-xs text-[var(--color-text-secondary)]">
                            {sessionLabel(item.session)}
                          </span>
                          <span className="text-[10px] text-[var(--color-text-tertiary)]">
                            {formatTime(item.session.startedAt)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAskAssistant(item.session)
                            }}
                            className="ml-1 flex items-center gap-1 rounded-lg border border-white/[0.08] px-2 py-0.5 text-[10px] text-[var(--color-text-tertiary)] hover:bg-white/5 hover:text-violet-400 transition"
                            aria-label="Ask assistant about this session"
                          >
                            <MessageSquare className="h-2.5 w-2.5" /> Ask
                          </button>
                        </button>
                      </div>
                    )
                  }
                  const ev = item.event
                  const kind = ev.kind as EventKind
                  const badge = KIND_BADGE_COLORS[kind] ?? {
                    bg: 'rgba(255,255,255,0.06)',
                    color: 'var(--color-text-secondary)',
                  }
                  return (
                    <div key={ev.id} style={{ position: 'relative', marginLeft: -48 }}>
                      {/* Icon badge on rail */}
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 6,
                          width: 36,
                          display: 'flex',
                          justifyContent: 'center',
                        }}
                      >
                        <div
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 10,
                            background: badge.bg,
                            border: `1px solid ${badge.color}40`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 0 0 3px rgba(7,7,11,0.9)',
                            color: badge.color,
                            flexShrink: 0,
                          }}
                        >
                          {KIND_ICONS[kind]}
                        </div>
                      </div>

                      <motion.button
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.12, delay: Math.min(i * 0.008, 0.12) }}
                        onClick={() => setSelectedEvent(selectedEvent?.id === ev.id ? null : ev)}
                        className={[
                          'flex w-full items-start gap-3 rounded-xl text-left transition focus-visible:outline-none',
                          selectedEvent?.id === ev.id
                            ? 'bg-violet-500/10 border border-violet-500/20'
                            : 'hover:bg-white/[0.025] border border-transparent',
                        ].join(' ')}
                        style={{
                          paddingLeft: 44,
                          paddingRight: 12,
                          paddingTop: 10,
                          paddingBottom: 10,
                        }}
                      >
                        <div
                          style={{
                            borderRadius: 10,
                            background: 'rgba(18,18,26,0.72)',
                            border: '1px solid var(--color-border-hairline)',
                            padding: '10px 14px',
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
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
                                fontSize: 10,
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                color: badge.color,
                                padding: '2px 7px',
                                borderRadius: 99,
                                background: badge.bg,
                              }}
                            >
                              {KIND_LABELS[kind]}
                            </span>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 10,
                                color: 'var(--color-text-tertiary)',
                              }}
                            >
                              {formatTime(ev.ts)}
                            </span>
                          </div>
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 12,
                              color: 'var(--color-text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              marginBottom: 2,
                            }}
                          >
                            {basename(ev.path)}
                          </div>
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 10,
                              color: 'var(--color-text-tertiary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {ev.path}
                          </div>
                          {ev.prevPath && (
                            <div
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 10,
                                color: 'var(--color-text-tertiary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              ← {ev.prevPath}
                            </div>
                          )}
                        </div>
                      </motion.button>
                    </div>
                  )
                })}
                {total > PAGE_SIZE && (
                  <div className="flex items-center justify-center gap-4 py-4">
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0 || loading}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-white/5 disabled:opacity-40 transition"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-[var(--color-text-tertiary)]">
                      {page + 1} / {Math.ceil(total / PAGE_SIZE)}
                    </span>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={(page + 1) * PAGE_SIZE >= total || loading}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-white/5 disabled:opacity-40 transition"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Event detail panel */}
      <AnimatePresence>
        {selectedEvent && (
          <EventDetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

// Need useState for selectedEvent hoisted out — fix: keep it inside TimelineView (already there above)
// The EventDetailPanel component:

function EventDetailPanel({
  event: selectedEvent,
  onClose,
}: {
  event: EventRow
  onClose: () => void
}): ReactElement {
  return (
    <motion.aside
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.18 }}
      className="w-80 shrink-0 overflow-y-auto border-l border-white/[0.06] bg-[var(--color-bg-1)] p-5"
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className={KIND_COLORS[selectedEvent.kind as EventKind]}>
              {KIND_ICONS[selectedEvent.kind as EventKind]}
            </span>
            <span
              className={[
                'text-[10px] font-semibold uppercase tracking-wide',
                KIND_COLORS[selectedEvent.kind as EventKind],
              ].join(' ')}
            >
              {KIND_LABELS[selectedEvent.kind as EventKind]}
            </span>
          </div>
          <p className="break-all font-mono text-xs text-[var(--color-text-primary)]">
            {selectedEvent.path}
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-lg p-1 text-[var(--color-text-tertiary)] hover:bg-white/5 hover:text-[var(--color-text-secondary)] focus-visible:outline-none"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-3">
        <DetailRow label="Time" value={new Date(selectedEvent.ts).toLocaleString()} />
        <DetailRow label="Source" value={selectedEvent.source} />
        <DetailRow label="Actor" value={selectedEvent.actor} />
        {selectedEvent.prevPath && (
          <DetailRow label="Previous path" value={selectedEvent.prevPath} mono />
        )}
        {selectedEvent.spaceId && <DetailRow label="Space" value={selectedEvent.spaceId} />}
        {selectedEvent.sessionId && (
          <DetailRow label="Session" value={selectedEvent.sessionId.slice(0, 8) + '…'} mono />
        )}
        {selectedEvent.payloadJson !== '{}' && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
              Payload
            </p>
            <PayloadDetailView raw={selectedEvent.payloadJson} />
          </div>
        )}
      </div>
    </motion.aside>
  )
}

// ── Clipboard view ────────────────────────────────────────────────────────────

function ClipboardView(): ReactElement {
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    const [listRes, settingsRes] = await Promise.all([
      window.auralith.invoke('clipboard.list', { limit: 200, offset: 0 }),
      window.auralith.invoke('clipboard.getSettings', {}),
    ])
    if (listRes.ok) setItems((listRes.data as { items: ClipboardItem[] }).items)
    if (settingsRes.ok) setEnabled((settingsRes.data as { enabled: boolean }).enabled)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    const id = setInterval(() => void load(), 15_000)
    return () => clearInterval(id)
  }, [load])

  async function deleteItem(id: string) {
    await window.auralith.invoke('clipboard.delete', { id })
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  if (loading)
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[var(--color-text-tertiary)]">Loading…</p>
      </div>
    )

  if (enabled === false)
    return (
      <div className="flex h-full items-center justify-center px-8">
        <EmptyState
          icon={<Clipboard size={22} />}
          title="Clipboard history is off"
          description="Enable it in Settings → Activity to start capturing text copies."
        />
      </div>
    )

  if (items.length === 0)
    return (
      <div className="flex h-full items-center justify-center px-8">
        <EmptyState
          icon={<Clipboard size={22} />}
          title="No clipboard entries yet"
          description="Text you copy will appear here."
        />
      </div>
    )

  let lastDate = ''
  return (
    <div className="h-full overflow-y-auto px-4 py-2 space-y-0.5">
      {items.map((item) => {
        const dateLabel = formatDate(item.ts)
        const showDate = dateLabel !== lastDate
        lastDate = dateLabel
        return (
          <div key={item.id}>
            {showDate && (
              <div
                className="sticky top-0 z-10 flex items-center gap-2 py-2 pt-4"
                style={{ background: 'rgba(7,7,11,0.88)', backdropFilter: 'blur(8px)' }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">
                  {dateLabel}
                </span>
                <div
                  className="flex-1"
                  style={{ height: 1, background: 'var(--color-border-hairline)' }}
                />
              </div>
            )}
            <motion.div
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.12 }}
              className="group flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-white/[0.03] border border-transparent hover:border-white/[0.04] transition"
            >
              <span className="mt-0.5 shrink-0">
                {item.redacted ? (
                  <ShieldOff className="h-3.5 w-3.5 text-amber-400" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                {item.redacted ? (
                  <p className="text-xs text-amber-400/80 italic">
                    Redacted — sensitive content detected ({item.charCount ?? '?'} chars)
                  </p>
                ) : (
                  <p className="text-xs text-[var(--color-text-primary)] line-clamp-3 break-words">
                    {item.textValue}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-2">
                  {item.charCount !== undefined && (
                    <span className="text-[10px] text-[var(--color-text-tertiary)]">
                      {item.charCount.toLocaleString()} chars
                    </span>
                  )}
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">
                    {formatTime(item.ts)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => void deleteItem(item.id)}
                className="shrink-0 rounded p-1 text-[var(--color-text-tertiary)] opacity-0 group-hover:opacity-100 hover:bg-white/5 hover:text-red-400 transition focus-visible:opacity-100 focus-visible:outline-none"
                aria-label="Delete entry"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          </div>
        )
      })}
    </div>
  )
}

// ── App Usage view ────────────────────────────────────────────────────────────

function AppUsageView(): ReactElement {
  const [sessions, setSessions] = useState<AppUsageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    const [listRes, settingsRes] = await Promise.all([
      window.auralith.invoke('appUsage.listSessions', { limit: 200, offset: 0 }),
      window.auralith.invoke('appUsage.getSettings', {}),
    ])
    if (listRes.ok) setSessions((listRes.data as { sessions: AppUsageRow[] }).sessions)
    if (settingsRes.ok) setEnabled((settingsRes.data as { enabled: boolean }).enabled)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    const id = setInterval(() => void load(), 30_000)
    return () => clearInterval(id)
  }, [load])

  if (loading)
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[var(--color-text-tertiary)]">Loading…</p>
      </div>
    )
  if (enabled === false)
    return (
      <div className="flex h-full items-center justify-center px-8">
        <EmptyState
          icon={<Monitor size={22} />}
          title="App usage tracking is off"
          description="Enable it in Settings → Activity to start recording which app category you're focused on."
        />
      </div>
    )
  if (sessions.length === 0)
    return (
      <div className="flex h-full items-center justify-center px-8">
        <EmptyState
          icon={<Monitor size={22} />}
          title="No app sessions yet"
          description="App focus sessions will appear here once you've used the computer for a while."
        />
      </div>
    )

  let lastDate = ''
  return (
    <div className="h-full overflow-y-auto px-4 py-2 space-y-0.5">
      {sessions.map((row) => {
        const dateLabel = formatDate(row.startedAt)
        const showDate = dateLabel !== lastDate
        lastDate = dateLabel
        return (
          <div key={row.id}>
            {showDate && (
              <div
                className="sticky top-0 z-10 flex items-center gap-2 py-2 pt-4"
                style={{ background: 'rgba(7,7,11,0.88)', backdropFilter: 'blur(8px)' }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">
                  {dateLabel}
                </span>
                <div
                  className="flex-1"
                  style={{ height: 1, background: 'var(--color-border-hairline)' }}
                />
              </div>
            )}
            <motion.div
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.12 }}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 border border-transparent"
            >
              <Monitor className={['h-3.5 w-3.5 shrink-0', BUCKET_COLORS[row.bucket]].join(' ')} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className={[
                      'text-[10px] font-semibold uppercase tracking-wide',
                      BUCKET_COLORS[row.bucket],
                    ].join(' ')}
                  >
                    {BUCKET_LABELS[row.bucket]}
                  </span>
                  <span className="truncate text-xs text-[var(--color-text-secondary)]">
                    {row.processName}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">
                    {formatTime(row.startedAt)}
                  </span>
                  {row.endedAt && (
                    <span className="text-[10px] text-[var(--color-text-tertiary)]">
                      → {formatTime(row.endedAt)}
                    </span>
                  )}
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">
                    · {formatDuration(row.durationMs)}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        )
      })}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed))
      return parsed as Record<string, unknown>
    return null
  } catch {
    return null
  }
}

function formatPayloadValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'number') return v.toLocaleString()
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

function PayloadDetailView({ raw }: { raw: string }) {
  const parsed = safeParseJson(raw)
  if (!parsed)
    return (
      <p className="text-[11px] italic text-[var(--color-text-tertiary)]">(malformed payload)</p>
    )
  const entries = Object.entries(parsed)
  if (entries.length === 0) return null
  return (
    <div className="space-y-2">
      {entries.map(([key, val]) => {
        const isComplex = val !== null && typeof val === 'object'
        return (
          <div key={key}>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
              {key
                .replace(/([A-Z])/g, ' $1')
                .replace(/_/g, ' ')
                .trim()}
            </p>
            {isComplex ? (
              <pre className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2 text-[10px] leading-relaxed text-[var(--color-text-secondary)] overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(val, null, 2)}
              </pre>
            ) : (
              <p className="break-all text-xs text-[var(--color-text-secondary)]">
                {formatPayloadValue(val)}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
        {label}
      </p>
      <p
        className={[
          'break-all text-xs text-[var(--color-text-secondary)]',
          mono ? 'font-mono' : '',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  )
}

// selectedEvent needs to be in TimelineView scope — it is declared there but used in EventDetailPanel which is separate.
// Fix: declare selectedEvent state inside TimelineView and pass to EventDetailPanel as prop (already done above).

function buildGroupedList(
  events: EventRow[],
  sessions: SessionRow[],
  collapsedSessions: Set<string>,
): GroupedItem[] {
  if (events.length === 0) return []
  const items: GroupedItem[] = []
  let lastDateLabel = ''
  const sessionMap = new Map(sessions.map((s) => [s.id, s]))
  const emittedSessions = new Set<string>()

  for (const ev of events) {
    const dateLabel = formatDate(ev.ts)
    if (dateLabel !== lastDateLabel) {
      items.push({ type: 'date-header', label: dateLabel, ts: ev.ts })
      lastDateLabel = dateLabel
    }
    if (ev.sessionId && !emittedSessions.has(ev.sessionId)) {
      const session = sessionMap.get(ev.sessionId)
      if (session) {
        emittedSessions.add(ev.sessionId)
        items.push({
          type: 'session-header',
          session,
          collapsed: collapsedSessions.has(ev.sessionId),
        })
      }
    }
    if (ev.sessionId && collapsedSessions.has(ev.sessionId)) continue
    items.push({ type: 'event', event: ev })
  }

  return items
}
