import type { AppContextProvider, AppContextRequest, AppContextProviderResult } from '../types'

// ── Types mirrored from core-routines / core-db ───────────────────────────────

type RoutineRow = {
  id: string
  name: string
  description?: string
  triggerKind: string
  enabled: boolean
  createdAt: number
  lastRunAt?: number
  lastRunStatus?: string
}

// ── Provider deps ─────────────────────────────────────────────────────────────

export type RoutinesContextDeps = {
  list: () => Promise<RoutineRow[]>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_ROUTINES = 8

// ── Provider ──────────────────────────────────────────────────────────────────

export function createRoutinesContextProvider(deps: RoutinesContextDeps): AppContextProvider {
  return {
    capability: 'routines',

    canHandle(req: AppContextRequest): boolean {
      return req.requestedCapabilities.includes('routines')
    },

    async getContext(req: AppContextRequest): Promise<AppContextProviderResult> {
      if (req.isCloudModel) {
        return {
          capability: 'routines',
          promptText: '',
          charCount: 0,
          freshness: 'missing',
          warnings: ['Routines context excluded — cloud model restriction.'],
          source: 'core-routines',
        }
      }

      const warnings: string[] = []
      let routines: RoutineRow[] = []

      try {
        routines = await deps.list()
      } catch (err) {
        warnings.push(`Routines fetch failed: ${err instanceof Error ? err.message : 'error'}`)
      }

      if (routines.length === 0) {
        return {
          capability: 'routines',
          promptText: '',
          charCount: 0,
          freshness: 'fresh',
          warnings: [...warnings, 'No routines configured yet.'],
          source: 'core-routines',
        }
      }

      const top = routines.slice(0, MAX_ROUTINES)

      const lines = top.map((r) => {
        const status = r.enabled ? 'enabled' : 'disabled'
        const lastRun = r.lastRunAt
          ? `last run: ${new Date(r.lastRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${r.lastRunStatus ?? 'unknown'})`
          : 'never run'
        const desc = r.description ? ` — ${r.description.slice(0, 50)}` : ''
        return `  [${r.id.slice(0, 8)}] ${r.name}${desc} | trigger: ${r.triggerKind} | ${status} | ${lastRun}`
      })

      // Modification reminder — routines are not trivially reversible
      warnings.push('Routine modifications require user confirmation before execution.')

      const promptText = [
        '### Routines',
        `source: core-routines | total: ${routines.length}`,
        ...lines,
        'Note: To run or modify a routine, use routines.run / routines.update (confirmation required).',
      ].join('\n')

      return {
        capability: 'routines',
        promptText,
        charCount: promptText.length,
        freshness: 'fresh',
        warnings,
        source: 'core-routines',
      }
    },
  }
}
