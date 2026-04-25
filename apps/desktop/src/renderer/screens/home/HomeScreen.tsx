import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ReactElement } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  FadeRise,
  WidgetGrid,
  WidgetCard,
  Dialog,
  BarChart,
  type BarChartDatum,
} from '@auralith/design-system'
import {
  Bell,
  BookOpen,
  Camera,
  CheckCircle,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clipboard,
  CloudSun,
  Coffee,
  MessageSquare,
  Monitor,
  RefreshCw,
  Sparkles,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { EventPrepCard } from '../../components/EventPrepCard'
import type { EventPrepPayload } from '../../components/EventPrepCard'
import { loadPromptPresets, type PromptPreset } from '../../lib/prompt-presets'
import { navigateTo } from '../../lib/navigate'
import { renderMarkdown } from '../../lib/markdown'

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
  weather?: {
    summary: string
    alertLevel: string
  }
  newsClusters: Array<{ topicName: string; summary: string; itemCount: number }>
  generatedAt: number
}

type ActivityRow = {
  id: string
  ts: number
  kind: string
  path: string
}

type ClipboardRow = {
  id: string
  ts: number
  textValue?: string
  charCount?: number
  redacted: boolean
}

type AppUsageRow = {
  id: string
  bucket: 'ide' | 'browser' | 'explorer' | 'media' | 'productivity' | 'other'
  processName: string
  durationMs?: number
}

type WidgetId =
  | 'briefing'
  | 'suggestions'
  | 'quick-actions'
  | 'recent-activity'
  | 'clipboard'
  | 'app-usage'
  | 'prompt-library'
  | 'custom-note'

const DEFAULT_WIDGETS: WidgetId[] = [
  'briefing',
  'suggestions',
  'quick-actions',
  'recent-activity',
  'clipboard',
  'app-usage',
  'prompt-library',
  'custom-note',
]

const LEISURE_KINDS = new Set([
  'leisure.weekend-brief',
  'leisure.reading-resurfaced',
  'leisure.hobby-idea',
])

function isWeekend(): boolean {
  const d = new Date().getDay()
  return d === 0 || d === 6
}

function greeting(): string {
  const h = new Date().getHours()
  if (isWeekend()) {
    if (h < 12) return 'Good morning.'
    if (h < 17) return 'Enjoy your afternoon.'
    return 'Good evening.'
  }
  if (h < 12) return 'Good morning.'
  if (h < 17) return 'Good afternoon.'
  return 'Good evening.'
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function describeSuggestedAction(json: string): string | null {
  try {
    const parsed = JSON.parse(json) as { toolId?: string; params?: Record<string, unknown> }
    if (!parsed.toolId) return null
    const label = parsed.toolId.replace(/\./g, ' › ')
    const paramStr =
      parsed.params && Object.keys(parsed.params).length > 0
        ? Object.entries(parsed.params)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join(', ')
        : null
    return paramStr ? `${label} (${paramStr})` : label
  } catch {
    return null
  }
}

function formatDuration(ms?: number): string {
  if (!ms) return '0m'
  const minutes = Math.max(1, Math.round(ms / 60000))
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

function readWidgetOrder(value: unknown): WidgetId[] {
  if (!Array.isArray(value)) return DEFAULT_WIDGETS
  const ids = value.filter(
    (entry): entry is WidgetId =>
      typeof entry === 'string' && DEFAULT_WIDGETS.includes(entry as WidgetId),
  )
  return ids.length > 0 ? ids : DEFAULT_WIDGETS
}

// ─── Row style helpers ────────────────────────────────────────────────────────

const ROW_CLS =
  'flex w-full items-center justify-between rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/40 px-4 py-3 text-left transition hover:bg-[var(--color-bg-2)]/60'

const ROW_BTN_CLS =
  'flex w-full items-start gap-3 rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/40 px-4 py-3 text-left transition hover:bg-[var(--color-bg-2)]/60'

export function HomeScreen(): ReactElement {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [briefing, setBriefing] = useState<BriefingPayload | null>(null)
  const [briefingOpen, setBriefingOpen] = useState(true)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [eventPrep, setEventPrep] = useState<EventPrepPayload | null>(null)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [recentActivity, setRecentActivity] = useState<ActivityRow[]>([])
  const [clipboardItems, setClipboardItems] = useState<ClipboardRow[]>([])
  const [appUsageRows, setAppUsageRows] = useState<AppUsageRow[]>([])
  const [promptPresets, setPromptPresets] = useState<PromptPreset[]>([])
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>(DEFAULT_WIDGETS)
  const [customNote, setCustomNote] = useState('')
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [draftNote, setDraftNote] = useState(customNote)

  // Setup checklist state
  const [watchedFolders, setWatchedFolders] = useState<string[]>([])
  const [clipboardEnabled, setClipboardEnabled] = useState(false)
  const [appUsageEnabled, setAppUsageEnabled] = useState(false)
  const [checklistDismissed, setChecklistDismissed] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  const loadDashboard = useCallback(async () => {
    const [
      suggestRes,
      activityRes,
      clipboardRes,
      appUsageRes,
      presets,
      widgetsRes,
      noteRes,
      briefingRes,
      foldersRes,
      clipSettingsRes,
      appSettingsRes,
      checklistDismissRes,
    ] = await Promise.all([
      window.auralith.invoke('suggest.list', { status: 'open', limit: 5 }),
      window.auralith.invoke('activity.query', { limit: 5, offset: 0 }),
      window.auralith.invoke('clipboard.list', { limit: 3, offset: 0 }),
      window.auralith.invoke('appUsage.listSessions', { limit: 12, offset: 0 }),
      loadPromptPresets(),
      window.auralith.invoke('settings.get', { key: 'home.widgets' }),
      window.auralith.invoke('settings.get', { key: 'home.customNote' }),
      window.auralith.invoke('briefing.getLastBriefing', {}),
      window.auralith.invoke('settings.get', { key: 'activity.watchedFolders' }),
      window.auralith.invoke('clipboard.getSettings', {}),
      window.auralith.invoke('appUsage.getSettings', {}),
      window.auralith.invoke('settings.get', { key: 'home.setupChecklistDismissed' }),
    ])

    if (suggestRes.ok) {
      setSuggestions((suggestRes.data as { suggestions: Suggestion[] }).suggestions)
    }
    if (activityRes.ok) {
      setRecentActivity((activityRes.data as { events: ActivityRow[] }).events)
    }
    if (clipboardRes.ok) {
      setClipboardItems((clipboardRes.data as { items: ClipboardRow[] }).items)
    }
    if (appUsageRes.ok) {
      setAppUsageRows((appUsageRes.data as { sessions: AppUsageRow[] }).sessions)
    }
    setPromptPresets(presets)
    if (widgetsRes.ok) {
      setWidgetOrder(readWidgetOrder((widgetsRes.data as { value: unknown }).value))
    }
    if (noteRes.ok) {
      const value = (noteRes.data as { value: unknown }).value
      if (typeof value === 'string' && value.trim()) {
        setCustomNote(value)
        setDraftNote(value)
      }
    }
    if (briefingRes.ok) {
      const { payload } = briefingRes.data as { payload: BriefingPayload | null }
      if (payload) setBriefing(payload)
    }
    if (foldersRes.ok) {
      const v = (foldersRes.data as { value: unknown }).value
      setWatchedFolders(Array.isArray(v) ? (v as string[]) : [])
    }
    if (clipSettingsRes.ok) {
      setClipboardEnabled((clipSettingsRes.data as { enabled: boolean }).enabled)
    }
    if (appSettingsRes.ok) {
      setAppUsageEnabled((appSettingsRes.data as { enabled: boolean }).enabled)
    }
    if (checklistDismissRes.ok) {
      const v = (checklistDismissRes.data as { value: unknown }).value
      setChecklistDismissed(v === true)
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
      setBriefingOpen(true)
    })
    const offShow = window.auralith.on('briefing:show', (data) => {
      const payload = data as {
        type: string
        eventTitle?: string
        startAt?: number
        location?: string
      }
      if (payload.type === 'morning' || payload.type === 'leisure') {
        setBriefingOpen(true)
      } else if (payload.type === 'event-prep' && payload.eventTitle && payload.startAt) {
        const nextPayload: EventPrepPayload = {
          type: 'event-prep',
          eventTitle: payload.eventTitle,
          startAt: payload.startAt,
          ...(payload.location ? { location: payload.location } : {}),
        }
        setEventPrep(nextPayload)
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
      setSuggestions((prev) => prev.filter((suggestion) => suggestion.id !== id))
      toast.success('Action completed')
    } finally {
      setActingOn(null)
    }
  }

  async function dismissSuggestion(id: string): Promise<void> {
    const res = await window.auralith.invoke('suggest.dismiss', { id })
    if (res.ok) setSuggestions((prev) => prev.filter((suggestion) => suggestion.id !== id))
  }

  async function dismissChecklist(): Promise<void> {
    await window.auralith.invoke('settings.set', {
      key: 'home.setupChecklistDismissed',
      value: true,
    })
    setChecklistDismissed(true)
  }

  async function saveDashboardPreferences(
    nextWidgets: WidgetId[],
    nextNote: string,
  ): Promise<void> {
    const [widgetsRes, noteRes] = await Promise.all([
      window.auralith.invoke('settings.set', { key: 'home.widgets', value: nextWidgets }),
      window.auralith.invoke('settings.set', { key: 'home.customNote', value: nextNote }),
    ])
    if (!widgetsRes.ok || !noteRes.ok) {
      toast.error('Failed to save dashboard layout')
      return
    }
    setWidgetOrder(nextWidgets)
    setCustomNote(nextNote)
    toast.success('Dashboard updated')
  }

  function moveWidget(id: WidgetId, direction: -1 | 1): void {
    const index = widgetOrder.indexOf(id)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= widgetOrder.length) return
    const next = [...widgetOrder]
    const [entry] = next.splice(index, 1)
    if (!entry) return
    next.splice(nextIndex, 0, entry)
    setWidgetOrder(next)
  }

  function toggleWidget(id: WidgetId): void {
    if (widgetOrder.includes(id)) {
      setWidgetOrder((prev) => prev.filter((entry) => entry !== id))
      return
    }
    setWidgetOrder((prev) => [...prev, id])
  }

  function openAssistantPrompt(prompt: string): void {
    navigateTo('assistant')
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('auralith:assistant-prefill', { detail: prompt }))
    })
  }

  const appUsageChart = useMemo<BarChartDatum[]>(() => {
    const buckets = new Map<AppUsageRow['bucket'], number>()
    for (const row of appUsageRows.slice(0, 8)) {
      buckets.set(row.bucket, (buckets.get(row.bucket) ?? 0) + (row.durationMs ?? 0))
    }
    return Array.from(buckets.entries()).map(([bucket, value]) => ({
      id: bucket,
      label: bucket === 'productivity' ? 'Work' : bucket,
      value,
      tone:
        bucket === 'browser'
          ? 'info'
          : bucket === 'productivity'
            ? 'success'
            : bucket === 'media'
              ? 'warning'
              : 'accent',
    }))
  }, [appUsageRows])

  // ─── Setup checklist (pre-widget, dismissed by user) ───────────────────────

  const showChecklist =
    !checklistDismissed && (watchedFolders.length === 0 || !clipboardEnabled || !appUsageEnabled)

  const checklistItems = [
    ...(watchedFolders.length === 0
      ? [
          {
            label: 'Set up file watching',
            description: 'Track file changes and build your activity timeline.',
            onClick: () => navigateTo('settings'),
          },
        ]
      : []),
    ...(!clipboardEnabled
      ? [
          {
            label: 'Enable clipboard history',
            description: 'Keep a private log of recent copied text.',
            onClick: () => navigateTo('settings'),
          },
        ]
      : []),
    ...(!appUsageEnabled
      ? [
          {
            label: 'Enable app usage tracking',
            description: 'See how you spend your focus time by app category.',
            onClick: () => navigateTo('settings'),
          },
        ]
      : []),
  ]

  // ─── Widget cards ──────────────────────────────────────────────────────────

  const widgetCards: Record<WidgetId, ReactElement> = {
    briefing: (
      <WidgetCard
        key="briefing"
        title="Morning briefing"
        subtitle={
          briefing
            ? new Date(briefing.generatedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Generated when available'
        }
        action={
          briefing ? (
            <button
              onClick={() => setBriefingOpen((prev) => !prev)}
              className="rounded-lg border border-[var(--color-border-subtle)] px-2 py-1 text-xs text-[var(--color-text-secondary)] transition hover:bg-white/[0.04]"
            >
              {briefingOpen ? 'Collapse' : 'Expand'}
            </button>
          ) : (
            <button
              onClick={() => void generateBriefing()}
              disabled={briefingLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-subtle)] px-2 py-1 text-xs text-[var(--color-text-secondary)] transition hover:bg-white/[0.04] disabled:opacity-50"
            >
              {briefingLoading ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
              Generate
            </button>
          )
        }
        colSpan={2}
      >
        {briefing ? (
          <div className="space-y-4">
            {briefing.weather && (
              <div className="rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/40 px-4 py-3 text-sm text-[var(--color-text-primary)]">
                <div className="flex items-center gap-2">
                  <CloudSun className="h-4 w-4 text-sky-300 shrink-0" />
                  <span>{briefing.weather.summary}</span>
                  {briefing.tone === 'leisure' && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-200">
                      <Coffee className="h-3 w-3" />
                      Leisure
                    </span>
                  )}
                </div>
              </div>
            )}
            {briefingOpen && (
              <div className="grid gap-3 xl:grid-cols-2">
                {briefing.newsClusters.map((cluster, index) => (
                  <div
                    key={`${cluster.topicName}-${index}`}
                    className="rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/40 px-4 py-4"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
                      {cluster.topicName}
                    </p>
                    <div className="mt-2">{renderMarkdown(cluster.summary)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-tertiary)]">
            No briefing yet. Click Generate to build one from your news and weather data.
          </p>
        )}
      </WidgetCard>
    ),

    suggestions: (
      <WidgetCard
        key="suggestions"
        title="Suggestions"
        subtitle={`${suggestions.length} open suggestion${suggestions.length === 1 ? '' : 's'}`}
        action={
          <button
            onClick={() => void loadDashboard()}
            className="rounded-lg border border-[var(--color-border-subtle)] p-2 text-[var(--color-text-secondary)] transition hover:bg-white/[0.04]"
            aria-label="Refresh dashboard"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        }
        colSpan={2}
      >
        {suggestions.length === 0 ? (
          <p className="text-sm text-[var(--color-text-tertiary)]">Nothing pending right now.</p>
        ) : (
          <div className="space-y-3">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/40 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 shrink-0 text-violet-300" />
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {suggestion.title}
                      </p>
                      {LEISURE_KINDS.has(suggestion.kind) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-200">
                          <Coffee className="h-3 w-3" />
                          Weekend
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-tertiary)]">
                      {suggestion.rationale}
                    </p>
                    {(() => {
                      const desc = describeSuggestedAction(suggestion.proposedActionJson)
                      return desc ? (
                        <span className="mt-1.5 inline-block text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-accent-low)]/10 text-[var(--color-accent-mid)] border border-[var(--color-accent-low)]/20">
                          {desc}
                        </span>
                      ) : null
                    })()}
                  </div>
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">
                    {formatTime(suggestion.createdAt)}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => void acceptSuggestion(suggestion.id)}
                    disabled={actingOn === suggestion.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent-low)] px-3 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {actingOn === suggestion.id ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle className="h-3 w-3" />
                    )}
                    {suggestion.tier === 'safe' ? 'Do it' : 'Review'}
                  </button>
                  <button
                    onClick={() => void dismissSuggestion(suggestion.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-xs text-[var(--color-text-secondary)] transition hover:bg-white/[0.04]"
                  >
                    <X className="h-3 w-3" />
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </WidgetCard>
    ),

    'quick-actions': (
      <WidgetCard key="quick-actions" title="Quick actions" subtitle="Command deck shortcuts">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            {
              label: 'Capture screen',
              icon: <Camera className="h-4 w-4" />,
              onClick: () => window.dispatchEvent(new CustomEvent('auralith:run-capture')),
            },
            {
              label: 'Open notifications',
              icon: <Bell className="h-4 w-4" />,
              onClick: () => window.dispatchEvent(new CustomEvent('auralith:notifications-open')),
            },
            {
              label: 'Ask assistant',
              icon: <MessageSquare className="h-4 w-4" />,
              onClick: () => navigateTo('assistant'),
            },
            {
              label: 'Spotlight',
              icon: <WandSparkles className="h-4 w-4" />,
              onClick: () => window.dispatchEvent(new CustomEvent('auralith:spotlight-open')),
            },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className="flex items-center gap-2 rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/40 px-4 py-3 text-left text-sm text-[var(--color-text-primary)] transition hover:bg-[var(--color-bg-2)]/60"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </WidgetCard>
    ),

    'recent-activity': (
      <WidgetCard key="recent-activity" title="Recent activity" subtitle="Latest timeline events">
        <div className="space-y-3">
          {recentActivity.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-[var(--color-text-tertiary)]">No tracked activity yet.</p>
              <button
                onClick={() => navigateTo('settings')}
                className="self-start text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                Set up file watching →
              </button>
            </div>
          ) : (
            recentActivity.map((event) => (
              <button key={event.id} onClick={() => navigateTo('activity')} className={ROW_CLS}>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
                    {event.kind}
                  </p>
                  <p className="mt-1 truncate text-sm text-[var(--color-text-primary)]">
                    {basename(event.path)}
                  </p>
                </div>
                <span className="ml-3 text-xs text-[var(--color-text-tertiary)]">
                  {formatTime(event.ts)}
                </span>
              </button>
            ))
          )}
        </div>
      </WidgetCard>
    ),

    clipboard: (
      <WidgetCard key="clipboard" title="Clipboard" subtitle="Recent copied text">
        <div className="space-y-3">
          {clipboardItems.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-[var(--color-text-tertiary)]">
                Clipboard history is empty or disabled.
              </p>
              <button
                onClick={() => navigateTo('settings')}
                className="self-start text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                Enable clipboard history →
              </button>
            </div>
          ) : (
            clipboardItems.map((item) => (
              <button key={item.id} onClick={() => navigateTo('activity')} className={ROW_BTN_CLS}>
                <Clipboard className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm text-[var(--color-text-primary)]">
                    {item.redacted ? 'Sensitive content was redacted.' : item.textValue}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                    {item.charCount ?? 0} chars · {formatTime(item.ts)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </WidgetCard>
    ),

    'app-usage': (
      <WidgetCard key="app-usage" title="Focus mix" subtitle="Recent app categories">
        {appUsageChart.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-[var(--color-text-tertiary)]">
              App usage tracking is empty or disabled.
            </p>
            <button
              onClick={() => navigateTo('settings')}
              className="self-start text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              Enable app tracking →
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <BarChart data={appUsageChart} />
            <div className="space-y-2">
              {appUsageRows.slice(0, 4).map((row) => (
                <button key={row.id} onClick={() => navigateTo('activity')} className={ROW_CLS}>
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-violet-300" />
                    <span className="text-sm text-[var(--color-text-primary)]">
                      {row.processName}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    {formatDuration(row.durationMs)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </WidgetCard>
    ),

    'prompt-library': (
      <WidgetCard key="prompt-library" title="Prompt library" subtitle="Reusable assistant starts">
        <div className="space-y-3">
          {promptPresets.slice(0, 4).map((preset) => (
            <button
              key={preset.id}
              onClick={() => openAssistantPrompt(preset.prompt)}
              className={ROW_BTN_CLS}
            >
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  {preset.name}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--color-text-tertiary)]">
                  {preset.prompt}
                </p>
              </div>
            </button>
          ))}
        </div>
      </WidgetCard>
    ),

    'custom-note': (
      <WidgetCard key="custom-note" title="Pinned note" subtitle="A lightweight home note">
        <p
          className={[
            'whitespace-pre-wrap text-sm leading-relaxed',
            customNote
              ? 'text-[var(--color-text-primary)]'
              : 'italic text-[var(--color-text-tertiary)]',
          ].join(' ')}
        >
          {customNote || 'Pin a note here to turn Home into a lightweight command deck.'}
        </p>
      </WidgetCard>
    ),
  }

  if (initialLoading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="mx-auto w-full max-w-[1240px] px-8 pb-12 pt-16">
          <div className="mb-10 h-12 w-64 animate-pulse rounded-xl bg-white/[0.04]" />
          <WidgetGrid>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />
            ))}
          </WidgetGrid>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-full flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-[1240px] px-8 pb-12">
          {/* Hero header */}
          <FadeRise>
            <div className="flex items-end justify-between gap-6 pb-10 pt-16">
              <div>
                <h1 className="text-[36px] font-semibold tracking-tight text-[var(--color-text-primary)]">
                  {greeting()}
                </h1>
                <p className="mt-2 text-sm text-[var(--color-text-tertiary)]">
                  {new Date().toLocaleDateString([], {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <button
                onClick={() => setCustomizeOpen(true)}
                className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-2)]/40 px-4 py-2.5 text-sm text-[var(--color-text-primary)] transition hover:bg-[var(--color-bg-2)]/60"
              >
                Customize dashboard
              </button>
            </div>
          </FadeRise>

          {/* Event prep card */}
          <AnimatePresence>
            {eventPrep && (
              <EventPrepCard payload={eventPrep} onDismiss={() => setEventPrep(null)} />
            )}
          </AnimatePresence>

          {/* Setup checklist — pre-widget, not part of customizable order */}
          <AnimatePresence>
            {showChecklist && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="mb-5 rounded-2xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/50 p-5"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-violet-300" />
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Finish setup
                    </p>
                  </div>
                  <button
                    onClick={() => void dismissChecklist()}
                    className="rounded-md p-1 text-[var(--color-text-tertiary)] transition hover:bg-white/[0.06]"
                    aria-label="Dismiss checklist"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="space-y-2">
                  {checklistItems.map((item) => (
                    <button
                      key={item.label}
                      onClick={item.onClick}
                      className="flex w-full items-center justify-between rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/40 px-4 py-3 text-left transition hover:bg-[var(--color-bg-2)]/60"
                    >
                      <div>
                        <p className="text-sm text-[var(--color-text-primary)]">{item.label}</p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">
                          {item.description}
                        </p>
                      </div>
                      <span className="ml-3 text-xs text-violet-400">Go to Settings →</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <FadeRise delay={80}>
            <WidgetGrid>{widgetOrder.map((widgetId) => widgetCards[widgetId])}</WidgetGrid>
          </FadeRise>
        </div>
      </div>

      {/* Customize dialog */}
      <Dialog
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        title="Customize dashboard"
        description="Choose which widgets stay on Home and set their order."
      >
        <div className="px-6 py-5">
          <div className="space-y-3">
            {DEFAULT_WIDGETS.map((widgetId) => {
              const enabled = widgetOrder.includes(widgetId)
              return (
                <div
                  key={widgetId}
                  className="flex items-center justify-between rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/40 px-4 py-3"
                >
                  <div>
                    <p className="text-sm text-[var(--color-text-primary)]">
                      {widgetId.replace(/-/g, ' ')}
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      {enabled ? 'Visible on the dashboard' : 'Hidden from the dashboard'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => moveWidget(widgetId, -1)}
                      disabled={!enabled}
                      className="rounded-lg border border-[var(--color-border-subtle)] p-2 text-[var(--color-text-secondary)] transition hover:bg-white/[0.04] disabled:opacity-40"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => moveWidget(widgetId, 1)}
                      disabled={!enabled}
                      className="rounded-lg border border-[var(--color-border-subtle)] p-2 text-[var(--color-text-secondary)] transition hover:bg-white/[0.04] disabled:opacity-40"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => toggleWidget(widgetId)}
                      className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm text-[var(--color-text-primary)] transition hover:bg-white/[0.04]"
                    >
                      {enabled ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-5 rounded-xl border border-[var(--color-border-hairline)] bg-[var(--color-bg-2)]/40 p-4">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Pinned note</p>
            <textarea
              value={draftNote}
              onChange={(event) => setDraftNote(event.target.value)}
              rows={5}
              placeholder="Pin a note here to turn Home into a lightweight command deck."
              className="mt-3 w-full resize-y rounded-xl border border-[var(--color-border-subtle)] bg-white/[0.04] px-3 py-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-border-accent)] placeholder:text-[var(--color-text-tertiary)]"
            />
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button
              onClick={() => setCustomizeOpen(false)}
              className="rounded-xl border border-[var(--color-border-subtle)] px-4 py-2 text-sm text-[var(--color-text-secondary)] transition hover:bg-white/[0.04]"
            >
              Close
            </button>
            <button
              onClick={() => {
                void saveDashboardPreferences(widgetOrder, draftNote)
                setCustomizeOpen(false)
              }}
              className="rounded-xl bg-[var(--color-accent-low)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Save layout
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
