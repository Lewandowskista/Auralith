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
} from 'lucide-react'
import { EmptyState } from '../../components/EmptyState'
import { ScreenShell } from '../../components/ScreenShell'

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

// ── Main component ────────────────────────────────────────────────────────────

const TAB_ORDER: ActiveView[] = ['timeline', 'clipboard', 'appusage']

export function ActivityScreen(): ReactElement {
  const [view, setView] = useState<ActiveView>('timeline')
  const prevViewRef = useRef<ActiveView>('timeline')

  return (
    <ScreenShell title="Activity" variant="split">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* View switcher tab bar */}
        <div
          className="flex shrink-0 items-center gap-1 px-4 py-2"
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
            direction={
              TAB_ORDER.indexOf(view) - TAB_ORDER.indexOf(prevViewRef.current) >= 0 ? 1 : -1
            }
          >
            {view === 'timeline' && <TimelineView />}
            {view === 'clipboard' && <ClipboardView />}
            {view === 'appusage' && <AppUsageView />}
          </TabContent>
        </div>
      </div>
    </ScreenShell>
  )
}

// ── Timeline view (unchanged logic from M4) ───────────────────────────────────

function TimelineView(): ReactElement {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [kindFilter, setKindFilter] = useState<EventKind | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null)
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const [watchedFolders, setWatchedFolders] = useState<string[]>([])
  const PAGE_SIZE = 100
  const listRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [evRes, sessRes] = await Promise.all([
        window.auralith.invoke('activity.query', {
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          ...(kindFilter ? { kind: kindFilter } : {}),
        }),
        window.auralith.invoke('activity.listSessions', { limit: 50, offset: 0 }),
      ])
      if (evRes.ok) {
        const d = evRes.data as { events: EventRow[]; total: number }
        setEvents(d.events)
        setTotal(d.total)
      }
      if (sessRes.ok) {
        const d = sessRes.data as { sessions: SessionRow[]; total: number }
        setSessions(d.sessions)
      }
    } finally {
      setLoading(false)
    }
  }, [kindFilter, page])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    // Push-driven reload when the file watcher writes a new event
    const unsub = window.auralith.on('activity:updated', () => void load())
    // Fallback poll at 30s in case a push event is missed
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
    void window.auralith.invoke('assistant.send', {
      message: `Summarize what I was working on during this session: ${sessionLabel(session)} (started ${new Date(session.startedAt).toLocaleString()})`,
    })
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Watching status bar */}
        <div
          className="flex shrink-0 items-center gap-2 px-4 py-2"
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
        </div>

        {/* Filter chips */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 flex-wrap"
          style={{
            borderBottom: '1px solid var(--color-border-hairline)',
            background: 'rgba(10,10,16,0.5)',
          }}
        >
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {total.toLocaleString()} events
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="h-3 w-3 mr-0.5 text-[var(--color-text-tertiary)]" />
            {[null, ...ALL_KINDS].map((k) => {
              const isActive = kindFilter === k
              const label = k === null ? 'All' : KIND_LABELS[k as EventKind]
              return (
                <button
                  key={k ?? 'all'}
                  onClick={() => {
                    setKindFilter(k)
                    setPage(0)
                  }}
                  className="transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500"
                  style={{
                    padding: '3px 10px',
                    borderRadius: 99,
                    fontSize: 11,
                    fontWeight: 500,
                    border: `1px solid ${isActive ? 'var(--color-border-accent)' : 'var(--color-border-hairline)'}`,
                    background: isActive ? 'rgba(139,92,246,0.15)' : 'transparent',
                    color: isActive ? 'var(--color-accent-mid)' : 'var(--color-text-secondary)',
                    cursor: 'default',
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

        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-2">
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
            <div className="space-y-0.5">
              {grouped.map((item, i) => {
                if (item.type === 'date-header') {
                  return (
                    <div
                      key={`dh-${item.ts}`}
                      className="sticky top-0 z-10 flex items-center gap-2 py-2 pt-4"
                      style={{ background: 'rgba(7,7,11,0.88)', backdropFilter: 'blur(8px)' }}
                    >
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
                    <button
                      key={`sh-${item.session.id}`}
                      onClick={() => toggleSessionCollapse(item.session.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/[0.03] transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500"
                    >
                      {collapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-tertiary)]" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-tertiary)]" />
                      )}
                      <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-tertiary)]" />
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
                  )
                }
                const ev = item.event
                const kind = ev.kind as EventKind
                return (
                  <motion.button
                    key={ev.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.12, delay: Math.min(i * 0.01, 0.15) }}
                    onClick={() => setSelectedEvent(selectedEvent?.id === ev.id ? null : ev)}
                    className={[
                      'flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500',
                      selectedEvent?.id === ev.id
                        ? 'bg-violet-500/10 border border-violet-500/20'
                        : 'hover:bg-white/[0.03] border border-transparent',
                    ].join(' ')}
                  >
                    <span className={['mt-0.5 shrink-0', KIND_COLORS[kind]].join(' ')}>
                      {KIND_ICONS[kind]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={[
                            'text-[10px] font-medium uppercase tracking-wide',
                            KIND_COLORS[kind],
                          ].join(' ')}
                        >
                          {KIND_LABELS[kind]}
                        </span>
                        <span className="truncate text-xs text-[var(--color-text-primary)]">
                          {basename(ev.path)}
                        </span>
                      </div>
                      <p className="truncate font-mono text-[10px] text-[var(--color-text-tertiary)]">
                        {ev.path}
                      </p>
                      {ev.prevPath && (
                        <p className="truncate font-mono text-[10px] text-[var(--color-text-tertiary)]">
                          ← {ev.prevPath}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] text-[var(--color-text-tertiary)]">
                      {formatTime(ev.ts)}
                    </span>
                  </motion.button>
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
          )}
        </div>
      </div>

      {/* Event detail panel */}
      <AnimatePresence>
        {selectedEvent && (
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
                onClick={() => setSelectedEvent(null)}
                className="shrink-0 rounded-lg p-1 text-[var(--color-text-tertiary)] hover:bg-white/5 hover:text-[var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
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
        )}
      </AnimatePresence>
    </div>
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
    const id = setInterval(() => {
      void load()
    }, 15_000)
    return () => clearInterval(id)
  }, [load])

  async function deleteItem(id: string) {
    await window.auralith.invoke('clipboard.delete', { id })
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[var(--color-text-tertiary)]">Loading…</p>
      </div>
    )
  }

  if (enabled === false) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <EmptyState
          icon={<Clipboard size={22} />}
          title="Clipboard history is off"
          description="Enable it in Settings → Activity to start capturing text copies. Sensitive content is redacted by default."
        />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <EmptyState
          icon={<Clipboard size={22} />}
          title="No clipboard entries yet"
          description="Text you copy will appear here. Images and files are not captured."
        />
      </div>
    )
  }

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
                className="shrink-0 rounded p-1 text-[var(--color-text-tertiary)] opacity-0 group-hover:opacity-100 hover:bg-white/5 hover:text-red-400 transition focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
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
    const id = setInterval(() => {
      void load()
    }, 30_000)
    return () => clearInterval(id)
  }, [load])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[var(--color-text-tertiary)]">Loading…</p>
      </div>
    )
  }

  if (enabled === false) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <EmptyState
          icon={<Monitor size={22} />}
          title="App usage tracking is off"
          description="Enable it in Settings → Activity to start recording which app category you're focused on. Only bucket categories are stored, never window titles."
        />
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <EmptyState
          icon={<Monitor size={22} />}
          title="No app sessions yet"
          description="App focus sessions will appear here once you've used the computer for a while."
        />
      </div>
    )
  }

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
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
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
  if (!parsed) {
    return (
      <p className="text-[11px] italic text-[var(--color-text-tertiary)]">(malformed payload)</p>
    )
  }
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
