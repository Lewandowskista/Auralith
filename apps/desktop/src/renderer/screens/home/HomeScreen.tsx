import { useState, useEffect, useCallback } from 'react'
import type { ReactElement } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  Newspaper,
  Plus,
  Play,
  RefreshCw,
  Sparkles,
  Mic,
  ExternalLink,
  Coffee,
  CheckCircle,
  X,
  Clock,
  MessageSquare,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { EventPrepCard } from '../../components/EventPrepCard'
import type { EventPrepPayload } from '../../components/EventPrepCard'
import { navigateTo } from '../../lib/navigate'
import { renderMarkdown } from '../../lib/markdown'

// ─── Types ────────────────────────────────────────────────────────────────────

type Suggestion = {
  id: string
  kind: string
  title: string
  rationale: string
  proposedActionJson: string
  tier: 'safe' | 'confirm' | 'restricted'
  status: 'open' | 'accepted' | 'dismissed' | 'snoozed' | 'expired'
  createdAt: number
  expiresAt?: number
}

type BriefingPayload = {
  tone?: 'default' | 'leisure'
  weather?: { summary: string; alertLevel: string }
  newsClusters: Array<{ topicName: string; summary: string; itemCount: number }>
  generatedAt: number
}

type Thread = {
  id: string
  title?: string
  lastMessageAt?: number
  messageCount?: number
}

type NewsItem = {
  id: string
  headline: string
  sourceName?: string
  topicName?: string
  fetchedAt: number
}

type ActivityRow = {
  id: string
  ts: number
  kind: string
  path: string
}

const LEISURE_KINDS = new Set([
  'leisure.weekend-brief',
  'leisure.reading-resurfaced',
  'leisure.hobby-idea',
])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours()
  const d = new Date().getDay()
  const weekend = d === 0 || d === 6
  if (weekend) {
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Enjoy your afternoon'
    return 'Good evening'
  }
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function fmtAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(diff / 3_600_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

function tierColor(tier: string): { bg: string; dot: string; label: string } {
  if (tier === 'confirm') return { bg: 'rgba(251,191,36,0.12)', dot: '#fbbf24', label: 'confirm' }
  if (tier === 'restricted')
    return { bg: 'rgba(248,113,113,0.12)', dot: '#f87171', label: 'restricted' }
  return { bg: 'rgba(52,211,153,0.10)', dot: '#34d399', label: 'safe' }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHead({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string
  title: string
  right?: ReactElement
}): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: 14,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)',
            marginBottom: 4,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </div>
      </div>
      {right}
    </div>
  )
}

function GhostBtn({
  icon,
  children,
  onClick,
}: {
  icon?: ReactElement
  children?: ReactElement | string
  onClick?: () => void
}): ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0)',
        color: 'var(--color-text-secondary)',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'background 120ms, color 120ms, border-color 120ms',
        fontFamily: 'var(--font-sans)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
        e.currentTarget.style.color = 'var(--color-text-primary)'
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0)'
        e.currentTarget.style.color = 'var(--color-text-secondary)'
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function PrimaryBtn({
  icon,
  children,
  onClick,
  disabled,
}: {
  icon?: ReactElement
  children?: ReactElement | string
  onClick?: () => void
  disabled?: boolean
}): ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        borderRadius: 8,
        border: 'none',
        background: disabled ? 'rgba(139,92,246,0.4)' : 'var(--color-accent-low)',
        color: 'white',
        fontSize: 12,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'opacity 120ms',
        fontFamily: 'var(--font-sans)',
        opacity: disabled ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.opacity = '0.88'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '1'
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function Card({
  children,
  onClick,
  style,
  className,
}: {
  children: ReactElement | ReactElement[] | string
  onClick?: () => void
  style?: React.CSSProperties
  className?: string
}): ReactElement {
  const isBtn = !!onClick
  const base: React.CSSProperties = {
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(20,20,30,0.46)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
    transition: isBtn ? 'border-color 150ms, background 150ms' : undefined,
    cursor: isBtn ? 'pointer' : undefined,
    textAlign: isBtn ? 'left' : undefined,
    width: isBtn ? '100%' : undefined,
    ...style,
  }
  if (isBtn) {
    return (
      <button
        className={className}
        onClick={onClick}
        style={base}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'
          e.currentTarget.style.background = 'rgba(20,20,30,0.64)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
          e.currentTarget.style.background = 'rgba(20,20,30,0.46)'
        }}
      >
        {children as ReactElement | ReactElement[]}
      </button>
    )
  }
  return (
    <div className={className} style={base}>
      {children}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function HomeScreen(): ReactElement {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [briefing, setBriefing] = useState<BriefingPayload | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [eventPrep, setEventPrep] = useState<EventPrepPayload | null>(null)
  const [recentActivity, setRecentActivity] = useState<ActivityRow[]>([])
  const [threads, setThreads] = useState<Thread[]>([])
  const [topNews, setTopNews] = useState<NewsItem | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [currentWeather, setCurrentWeather] = useState<{
    temp: number
    description: string
  } | null>(null)

  const loadDashboard = useCallback(async () => {
    const [suggestRes, activityRes, threadRes, newsRes, briefingRes, weatherRes] =
      await Promise.all([
        window.auralith.invoke('suggest.list', { status: 'open', limit: 4 }),
        window.auralith.invoke('activity.query', { limit: 5, offset: 0 }),
        window.auralith.invoke('assistant.listSessions', { limit: 4, offset: 0 }),
        window.auralith.invoke('news.listItems', { limit: 1, offset: 0 }),
        window.auralith.invoke('briefing.getLastBriefing', {}),
        window.auralith.invoke('weather.getCurrent', {}),
      ])

    if (suggestRes.ok) {
      setSuggestions((suggestRes.data as { suggestions: Suggestion[] }).suggestions)
    }
    if (activityRes.ok) {
      setRecentActivity((activityRes.data as { events: ActivityRow[] }).events)
    }
    if (threadRes.ok) {
      setThreads((threadRes.data as { sessions: Thread[] }).sessions)
    }
    if (newsRes.ok) {
      const items = (newsRes.data as { items: NewsItem[] }).items
      if (items.length > 0) setTopNews(items[0] ?? null)
    }
    if (briefingRes.ok) {
      const { payload } = briefingRes.data as { payload: BriefingPayload | null }
      if (payload) setBriefing(payload)
    }
    if (weatherRes.ok) {
      const w = weatherRes.data as { temp: number; description: string }
      setCurrentWeather({ temp: Math.round(w.temp), description: w.description })
    }
    setInitialLoading(false)
  }, [])

  useEffect(() => {
    void loadDashboard()
    const interval = setInterval(() => void loadDashboard(), 30_000)
    return () => clearInterval(interval)
  }, [loadDashboard])

  useEffect(() => {
    const offMorning = window.auralith.on('briefing:morning', (data) => {
      setBriefing(data as BriefingPayload)
    })
    const offShow = window.auralith.on('briefing:show', (data) => {
      const payload = data as {
        type: string
        eventTitle?: string
        startAt?: number
        location?: string
      }
      if (payload.type === 'event-prep' && payload.eventTitle && payload.startAt) {
        setEventPrep({
          type: 'event-prep',
          eventTitle: payload.eventTitle,
          startAt: payload.startAt,
          ...(payload.location ? { location: payload.location } : {}),
        })
      }
    })
    return () => {
      offMorning()
      offShow()
    }
  }, [])

  async function generateBriefing(): Promise<void> {
    setBriefingLoading(true)
    try {
      await window.auralith.invoke('briefing.triggerNow', {})
      toast.success('Briefing generated')
    } catch {
      toast.error('Failed to generate briefing')
    } finally {
      setBriefingLoading(false)
    }
  }

  async function acceptSuggestion(id: string): Promise<void> {
    setActingOn(id)
    try {
      const res = await window.auralith.invoke('suggest.accept', { id })
      if (!res.ok) {
        toast.error('Could not complete action')
        return
      }
      setSuggestions((prev) => prev.filter((s) => s.id !== id))
      toast.success('Action completed')
    } finally {
      setActingOn(null)
    }
  }

  async function dismissSuggestion(id: string): Promise<void> {
    const res = await window.auralith.invoke('suggest.dismiss', { id })
    if (res.ok) setSuggestions((prev) => prev.filter((s) => s.id !== id))
  }

  if (initialLoading) {
    return (
      <div style={{ display: 'flex', height: '100%', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', padding: '64px 40px 48px' }}>
          <div
            className="skeleton"
            style={{ height: 40, width: 240, borderRadius: 12, marginBottom: 8 }}
          />
          <div
            className="skeleton"
            style={{ height: 14, width: 160, borderRadius: 8, marginBottom: 40 }}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1.4fr) minmax(260px,1fr)',
              gap: 18,
            }}
          >
            <div className="skeleton" style={{ height: 260, borderRadius: 16 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 80, borderRadius: 14 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', padding: '0 40px 48px' }}>
        {/* ── Hero header ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            padding: '64px 0 28px',
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 36,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
                color: 'var(--color-text-primary)',
                margin: 0,
              }}
            >
              {greeting()}.
            </h1>
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
              {new Date().toLocaleDateString([], {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
              {briefing ? ` · briefing refreshed ${fmtAgo(briefing.generatedAt)}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <GhostBtn icon={<RefreshCw size={13} />} onClick={() => void loadDashboard()}>
              Refresh
            </GhostBtn>
            <GhostBtn
              icon={<Mic size={13} />}
              onClick={() => window.dispatchEvent(new CustomEvent('auralith:voice-open'))}
            >
              Voice
            </GhostBtn>
            <PrimaryBtn icon={<Sparkles size={13} />} onClick={() => navigateTo('assistant')}>
              Ask Auralith
            </PrimaryBtn>
          </div>
        </motion.div>

        {/* ── Event prep ──────────────────────────────────────────────────── */}
        <AnimatePresence>
          {eventPrep && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ marginBottom: 18, overflow: 'hidden' }}
            >
              <EventPrepCard payload={eventPrep} onDismiss={() => setEventPrep(null)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Top grid: hero briefing + suggestions ───────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.06, ease: [0.2, 0.8, 0.2, 1] }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1.4fr) minmax(260px,1fr)',
            gap: 18,
            alignItems: 'start',
            marginBottom: 36,
          }}
        >
          {/* Hero briefing card */}
          <Card style={{ padding: 24 }}>
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 18,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--color-accent-high)',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--color-accent-high)',
                  }}
                >
                  Your briefing
                </span>
              </div>
              {briefing && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 10px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: 10,
                    color: 'var(--color-text-secondary)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <Clock size={10} />
                  {briefing.newsClusters.length > 0
                    ? `${briefing.newsClusters.length} clusters`
                    : '—'}
                </span>
              )}
            </div>

            {briefing ? (
              <div>
                {/* Play row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 1fr',
                    gap: 18,
                    alignItems: 'center',
                    marginBottom: 20,
                  }}
                >
                  <button
                    onClick={() => void generateBriefing()}
                    disabled={briefingLoading}
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 20,
                      background:
                        'var(--color-accent-gradient, linear-gradient(135deg,#7c3aed,#6366f1))',
                      border: 0,
                      cursor: 'pointer',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow:
                        '0 8px 28px rgba(124,58,237,0.32), inset 0 0 0 1px rgba(255,255,255,0.18)',
                      transition: 'transform 160ms',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)'
                    }}
                    title="Re-generate briefing"
                  >
                    {briefingLoading ? (
                      <RefreshCw size={24} className="animate-spin" />
                    ) : (
                      <Play size={26} strokeWidth={2.5} style={{ marginLeft: 3 }} />
                    )}
                  </button>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 20,
                        fontWeight: 500,
                        letterSpacing: '-0.01em',
                        lineHeight: 1.25,
                        marginBottom: 6,
                      }}
                    >
                      {new Date().toLocaleDateString([], { weekday: 'long' })} morning brief.
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--color-text-secondary)',
                        marginBottom: 10,
                      }}
                    >
                      {briefing.weather?.summary ?? 'No weather data.'}{' '}
                      {briefing.tone === 'leisure' && '· leisure mode'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {briefing.newsClusters.slice(0, 3).map((c) => (
                        <span
                          key={c.topicName}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 10px',
                            borderRadius: 999,
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            fontSize: 10,
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          <span
                            style={{
                              width: 4,
                              height: 4,
                              borderRadius: '50%',
                              background: 'var(--color-accent-mid)',
                              display: 'inline-block',
                            }}
                          />
                          {c.topicName} ·{' '}
                          <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.7 }}>
                            {c.itemCount}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div
                  style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 0 16px' }}
                />

                {/* Cluster summaries */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {briefing.newsClusters.slice(0, 2).map((c) => (
                    <div
                      key={c.topicName}
                      style={{
                        fontSize: 13,
                        color: 'var(--color-text-secondary)',
                        lineHeight: 1.55,
                      }}
                    >
                      <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                        {c.topicName}.{' '}
                      </span>
                      <span className="prose-auralith">{renderMarkdown(c.summary)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* No briefing yet */
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 14,
                  padding: '24px 0',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 18,
                    background:
                      'var(--color-accent-gradient, linear-gradient(135deg,#7c3aed,#6366f1))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 28px rgba(124,58,237,0.28)',
                    cursor: 'pointer',
                  }}
                  onClick={() => void generateBriefing()}
                >
                  {briefingLoading ? (
                    <RefreshCw size={22} color="white" className="animate-spin" />
                  ) : (
                    <Play size={22} color="white" strokeWidth={2.5} style={{ marginLeft: 2 }} />
                  )}
                </div>
                <div>
                  <p
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      marginBottom: 4,
                    }}
                  >
                    No briefing yet
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    Generate one from your news and weather data.
                  </p>
                </div>
                <PrimaryBtn
                  icon={<Sparkles size={13} />}
                  onClick={() => void generateBriefing()}
                  disabled={briefingLoading}
                >
                  {briefingLoading ? 'Generating…' : 'Generate briefing'}
                </PrimaryBtn>
              </div>
            )}
          </Card>

          {/* Suggestions rail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--color-text-tertiary)',
                padding: '2px 4px 6px',
              }}
            >
              Might want to act on
            </div>
            <AnimatePresence initial={false}>
              {suggestions.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    padding: '20px 16px',
                    borderRadius: 14,
                    textAlign: 'center',
                    border: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(20,20,30,0.32)',
                    color: 'var(--color-text-tertiary)',
                    fontSize: 13,
                  }}
                >
                  Nothing pending right now.
                </motion.div>
              ) : (
                suggestions.map((s, i) => {
                  const tc = tierColor(s.tier)
                  const isLeisure = LEISURE_KINDS.has(s.kind)
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.22, delay: i * 0.04, ease: [0.2, 0.8, 0.2, 1] }}
                      style={{
                        padding: 16,
                        borderRadius: 14,
                        border: '1px solid rgba(255,255,255,0.07)',
                        background: 'rgba(20,20,30,0.46)',
                      }}
                    >
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: tc.bg,
                            fontSize: 10,
                            fontWeight: 500,
                            color: tc.dot,
                          }}
                        >
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: '50%',
                              background: 'currentColor',
                              display: 'inline-block',
                            }}
                          />
                          {tc.label}
                        </span>
                        {isLeisure && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: 'rgba(139,92,246,0.15)',
                              fontSize: 10,
                              color: 'var(--color-accent-high)',
                            }}
                          >
                            <Coffee size={9} />
                            weekend
                          </span>
                        )}
                        <span
                          style={{
                            marginLeft: 'auto',
                            fontSize: 10,
                            color: 'var(--color-text-tertiary)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {fmtAgo(s.createdAt)}
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--color-text-primary)',
                          marginBottom: 4,
                          lineHeight: 1.4,
                        }}
                      >
                        {s.title}
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          color: 'var(--color-text-tertiary)',
                          lineHeight: 1.5,
                          marginBottom: 12,
                        }}
                      >
                        {s.rationale}
                      </p>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <PrimaryBtn
                          icon={
                            actingOn === s.id ? (
                              <RefreshCw size={12} className="animate-spin" />
                            ) : (
                              <CheckCircle size={12} />
                            )
                          }
                          onClick={() => void acceptSuggestion(s.id)}
                          disabled={actingOn === s.id}
                        >
                          {s.tier === 'confirm' ? 'Review & send' : isLeisure ? 'Resume' : 'Run'}
                        </PrimaryBtn>
                        <GhostBtn onClick={() => void dismissSuggestion(s.id)}>
                          <X size={12} />
                          Dismiss
                        </GhostBtn>
                      </div>
                    </motion.div>
                  )
                })
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── Ambient section ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <SectionHead
            eyebrow="Ambient"
            title="What's happening around you"
            right={
              <GhostBtn icon={<ExternalLink size={12} />} onClick={() => navigateTo('activity')}>
                Open activity
              </GhostBtn>
            }
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))',
              gap: 18,
              marginBottom: 36,
            }}
          >
            {/* Activity pulse */}
            <Card style={{ padding: 20 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  marginBottom: 14,
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}
                  >
                    Activity pulse
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    last 12 hours
                  </div>
                </div>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: 'rgba(139,92,246,0.18)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-accent-high)',
                  }}
                >
                  <Activity size={15} />
                </div>
              </div>
              {recentActivity.length === 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-tertiary)',
                    textAlign: 'center',
                    padding: '16px 0',
                  }}
                >
                  No tracked activity yet.
                  <br />
                  <button
                    onClick={() => navigateTo('settings')}
                    style={{
                      color: 'var(--color-accent-mid)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 11,
                      marginTop: 6,
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    Set up file watching →
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {recentActivity.slice(0, 4).map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => navigateTo('activity')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.05)',
                        background: 'rgba(255,255,255,0.025)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 120ms, border-color 120ms',
                        fontFamily: 'var(--font-sans)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.025)'
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: 9,
                            fontWeight: 600,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: 'var(--color-text-tertiary)',
                          }}
                        >
                          {ev.kind}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--color-text-primary)',
                            marginTop: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {basename(ev.path)}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--color-text-tertiary)',
                          fontFamily: 'var(--font-mono)',
                          flexShrink: 0,
                          marginLeft: 8,
                        }}
                      >
                        {fmtAgo(ev.ts)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {/* Top news teaser */}
            {topNews ? (
              <Card
                onClick={() => navigateTo('news')}
                style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div
                      style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}
                    >
                      {topNews.topicName ?? 'Top story'}
                    </div>
                    <div
                      style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}
                    >
                      {topNews.sourceName ?? 'News'} · {fmtAgo(topNews.fetchedAt)}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '2px 10px',
                      borderRadius: 999,
                      background: 'rgba(96,165,250,0.12)',
                      color: '#60a5fa',
                      fontSize: 10,
                      fontWeight: 500,
                    }}
                  >
                    Story
                  </span>
                </div>
                <div
                  style={{
                    height: 80,
                    borderRadius: 10,
                    background: 'rgba(96,165,250,0.06)',
                    border: '1px solid rgba(96,165,250,0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(96,165,250,0.4)',
                  }}
                >
                  <Newspaper size={28} />
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    lineHeight: 1.4,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {topNews.headline}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    color: 'var(--color-accent-mid)',
                  }}
                >
                  Open in News <ChevronRight size={12} />
                </div>
              </Card>
            ) : (
              <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                  }}
                >
                  <div
                    style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}
                  >
                    News
                  </div>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      background: 'rgba(96,165,250,0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#60a5fa',
                    }}
                  >
                    <Newspaper size={15} />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                  No news loaded yet.
                </div>
                <GhostBtn icon={<ExternalLink size={12} />} onClick={() => navigateTo('news')}>
                  Open News
                </GhostBtn>
              </Card>
            )}

            {/* Weather quick card */}
            <Card onClick={() => navigateTo('weather')} style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 38,
                    lineHeight: 1,
                    fontWeight: 300,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {currentWeather ? `${currentWeather.temp}°` : '—'}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Weather</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {currentWeather ? currentWeather.description : 'Set up your location'}
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--color-accent-mid)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                Open Weather <ChevronRight size={11} />
              </div>
            </Card>
          </div>
        </motion.div>

        {/* ── Recent threads ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <SectionHead
            eyebrow="Assistant"
            title="Recent threads"
            right={
              <GhostBtn icon={<Plus size={12} />} onClick={() => navigateTo('assistant')}>
                New thread
              </GhostBtn>
            }
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))',
              gap: 12,
            }}
          >
            {threads.length === 0 ? (
              <Card style={{ padding: 20, gridColumn: '1/-1' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: 'rgba(139,92,246,0.14)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-accent-high)',
                    }}
                  >
                    <MessageSquare size={16} />
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--color-text-primary)',
                        marginBottom: 2,
                      }}
                    >
                      No threads yet
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                      Start a conversation with Auralith.
                    </p>
                  </div>
                  <button
                    onClick={() => navigateTo('assistant')}
                    style={{
                      marginLeft: 'auto',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 14px',
                      borderRadius: 8,
                      background: 'var(--color-accent-low)',
                      border: 'none',
                      color: 'white',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    <Plus size={12} />
                    New thread
                  </button>
                </div>
              </Card>
            ) : (
              threads.map((t, i) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: i * 0.04, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <Card
                    onClick={() => {
                      navigateTo('assistant')
                      requestAnimationFrame(() => {
                        window.dispatchEvent(
                          new CustomEvent('auralith:assistant-open-thread', { detail: t.id }),
                        )
                      })
                    }}
                    style={{ padding: 14 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'rgba(139,92,246,0.6)',
                          display: 'inline-block',
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--color-text-tertiary)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {t.lastMessageAt ? fmtAgo(t.lastMessageAt) : '—'}
                      </span>
                      {t.messageCount != null && (
                        <span
                          style={{
                            marginLeft: 'auto',
                            fontSize: 10,
                            color: 'var(--color-text-tertiary)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {t.messageCount} msgs
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        lineHeight: 1.35,
                        color: 'var(--color-text-primary)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {t.title ?? 'Untitled thread'}
                    </div>
                  </Card>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
