import type { AppContextProvider, AppContextRequest, AppContextProviderResult } from '../types'

// ── Types mirrored from core-suggest / core-db ────────────────────────────────

type SuggestionRow = {
  id: string
  kind: string
  title: string
  body?: string
  rationale?: string
  status: string
  createdAt: number
  expiresAt?: number
}

// ── Provider deps ─────────────────────────────────────────────────────────────

export type SuggestionsContextDeps = {
  listOpen: () => Promise<SuggestionRow[]>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STALE_AFTER_MS = 10 * 60 * 1000 // 10 minutes
const MAX_SUGGESTIONS = 5

// ── Kind labels ───────────────────────────────────────────────────────────────

const KIND_LABELS: Record<string, string> = {
  morning_brief: 'Morning Brief',
  session_recap: 'Session Recap',
  resume_work: 'Resume Work',
  news_digest: 'News Digest',
  weather_alert: 'Weather Alert',
  end_of_day_recap: 'End-of-Day Recap',
  weekend_briefing: 'Weekend Briefing',
  reading_resurface: 'Reading Resurface',
  hobby_idea: 'Hobby Idea',
  calendar_prep: 'Calendar Prep',
  downloads_cleanup: 'Downloads Cleanup',
  focus_aligned_resume: 'Focus Resume',
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function createSuggestionsContextProvider(deps: SuggestionsContextDeps): AppContextProvider {
  return {
    capability: 'suggestions',

    canHandle(req: AppContextRequest): boolean {
      return req.requestedCapabilities.includes('suggestions')
    },

    async getContext(req: AppContextRequest): Promise<AppContextProviderResult> {
      if (req.isCloudModel) {
        return {
          capability: 'suggestions',
          promptText: '',
          charCount: 0,
          freshness: 'missing',
          warnings: ['Suggestions context excluded — cloud model restriction.'],
          source: 'core-suggest',
        }
      }

      const warnings: string[] = []
      let suggestions: SuggestionRow[] = []

      try {
        suggestions = await deps.listOpen()
      } catch (err) {
        warnings.push(`Suggestions fetch failed: ${err instanceof Error ? err.message : 'error'}`)
      }

      const open = suggestions.filter((s) => s.status === 'open').slice(0, MAX_SUGGESTIONS)

      if (open.length === 0) {
        return {
          capability: 'suggestions',
          promptText: '',
          charCount: 0,
          freshness: 'fresh',
          warnings,
          source: 'core-suggest',
        }
      }

      const latestTs = Math.max(...open.map((s) => s.createdAt))
      const isStale = Date.now() - latestTs > STALE_AFTER_MS

      const lines = open.map((s) => {
        const label = KIND_LABELS[s.kind] ?? s.kind
        const body = s.body ? ` — ${s.body.slice(0, 80)}` : ''
        return `  [${s.id.slice(0, 8)}] ${label}: ${s.title.slice(0, 60)}${body}`
      })

      const promptText = [
        '### Suggestions',
        `source: core-suggest | open: ${open.length} | freshness: ${isStale ? 'stale' : 'fresh'}`,
        ...lines,
      ].join('\n')

      return {
        capability: 'suggestions',
        promptText,
        charCount: promptText.length,
        freshness: isStale ? 'stale' : 'fresh',
        dataTimestamp: new Date(latestTs).toISOString(),
        warnings,
        source: 'core-suggest' as const,
      }
    },
  }
}
