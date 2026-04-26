import type { AppContextProvider, AppContextRequest, AppContextProviderResult } from '../types'

// ── Types mirrored from core-events / core-db ─────────────────────────────────

type ActivityEvent = {
  id: string
  ts: number
  kind: string
  path?: string
  prevPath?: string
  actor?: string
}

type ActivitySession = {
  id: string
  startedAt: number
  endedAt?: number
  summary?: string
}

// ── Provider deps ─────────────────────────────────────────────────────────────

export type ActivityContextDeps = {
  queryEvents: (opts: { fromTs: number; limit: number }) => Promise<ActivityEvent[]>
  listSessions: (opts: { limit: number }) => Promise<ActivitySession[]>
  /** Sanitize file paths to remove home dir prefix etc. */
  sanitizePath?: (path: string) => string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STALE_AFTER_MS = 5 * 60 * 1000 // 5 minutes
const LOOKBACK_MS = 4 * 60 * 60 * 1000 // 4 hours
const MAX_EVENTS = 12
const MAX_SESSIONS = 3

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitize(path: string, sanitizer?: (p: string) => string): string {
  if (sanitizer) return sanitizer(path)
  // Default: strip common home dir patterns
  return path
    .replace(/^[A-Z]:\\Users\\[^\\]+\\/i, '~/')
    .replace(/^\/home\/[^/]+\//, '~/')
    .replace(/^\/Users\/[^/]+\//, '~/')
}

function kindLabel(kind: string): string {
  const labels: Record<string, string> = {
    'file.create': 'created',
    'file.edit': 'edited',
    'file.move': 'moved',
    'file.rename': 'renamed',
    'file.delete': 'deleted',
    'file.download': 'downloaded',
    'assistant.action': 'assistant',
    'app.focus': 'focused',
  }
  return labels[kind] ?? kind
}

function formatEvent(ev: ActivityEvent, sanitizer?: (p: string) => string): string {
  const time = new Date(ev.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const label = kindLabel(ev.kind)
  if (ev.path) {
    const p = sanitize(ev.path, sanitizer)
    const prev = ev.prevPath ? ` ← ${sanitize(ev.prevPath, sanitizer)}` : ''
    return `  ${time} ${label}: ${p}${prev}`
  }
  return `  ${time} ${label}`
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function createActivityContextProvider(deps: ActivityContextDeps): AppContextProvider {
  return {
    capability: 'activity',

    canHandle(req: AppContextRequest): boolean {
      return req.requestedCapabilities.includes('activity')
    },

    async getContext(req: AppContextRequest): Promise<AppContextProviderResult> {
      if (req.isCloudModel) {
        return {
          capability: 'activity',
          promptText: '',
          charCount: 0,
          freshness: 'missing',
          warnings: ['Activity context excluded — cloud model restriction (high privacy).'],
          source: 'core-events',
        }
      }

      const warnings: string[] = []
      let events: ActivityEvent[] = []
      let sessions: ActivitySession[] = []

      const fromTs = Date.now() - LOOKBACK_MS

      try {
        ;[events, sessions] = await Promise.all([
          deps.queryEvents({ fromTs, limit: MAX_EVENTS }),
          deps.listSessions({ limit: MAX_SESSIONS }),
        ])
      } catch (err) {
        warnings.push(`Activity fetch failed: ${err instanceof Error ? err.message : 'error'}`)
      }

      // Paths are high-sensitivity — always sanitize
      warnings.push('File paths sanitized for privacy.')

      if (events.length === 0 && sessions.length === 0) {
        return {
          capability: 'activity',
          promptText: '',
          charCount: 0,
          freshness: 'missing',
          warnings: [...warnings, 'No recent activity events found.'],
          source: 'core-events',
        }
      }

      const latestTs = events.length > 0 ? Math.max(...events.map((e) => e.ts)) : 0
      const isStale = latestTs > 0 && Date.now() - latestTs > STALE_AFTER_MS

      const sessionLines = sessions
        .map((s) => {
          const start = new Date(s.startedAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
          const end = s.endedAt
            ? new Date(s.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'ongoing'
          return `  ${start}–${end}${s.summary ? `: ${s.summary.slice(0, 60)}` : ''}`
        })
        .join('\n')

      const eventLines = events.map((ev) => formatEvent(ev, deps.sanitizePath)).join('\n')

      const promptText = [
        '### Activity',
        `source: core-events | window: last 4h | freshness: ${isStale ? 'stale' : 'fresh'}`,
        sessions.length > 0 ? `recent sessions:\n${sessionLines}` : '',
        events.length > 0 ? `recent events:\n${eventLines}` : '',
      ]
        .filter(Boolean)
        .join('\n')

      return {
        capability: 'activity',
        promptText,
        charCount: promptText.length,
        freshness: isStale ? 'stale' : 'fresh',
        ...(latestTs ? { dataTimestamp: new Date(latestTs).toISOString() } : {}),
        warnings,
        source: 'core-events',
      }
    },
  }
}
