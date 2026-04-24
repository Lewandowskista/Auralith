import { registerHandler } from '../router'
import type { DbBundle } from '@auralith/core-db'
import {
  createSuggestionsRepo,
  createSuggestionWeightsRepo,
  createSuggestionPausesRepo,
  createCalendarEventsRepo,
  createSettingsRepo,
  createAuditRepo,
} from '@auralith/core-db'
import {
  SignalsImportCalendarParamsSchema,
  SignalsSetFocusAppTrackingParamsSchema,
  SignalsGetStatusParamsSchema,
  SuggestInsightsParamsSchema,
  SuggestResetLearningParamsSchema,
} from '@auralith/core-domain'
import { recomputeWeights } from '../../signals/learning-job'
import type { CalendarIcsImporter } from '../../signals/calendar-importer'
import type { FocusAppTracker } from '../../signals/focus-app-tracker'

type SignalDeps = {
  bundle: DbBundle
  calendarImporter: CalendarIcsImporter
  focusTracker: FocusAppTracker
  getIdleMs: () => number
}

let _deps: SignalDeps | null = null

export function initSignalsDeps(deps: SignalDeps): void {
  _deps = deps
}

function getDeps(): SignalDeps {
  if (!_deps) throw new Error('Signals deps not initialized')
  return _deps
}

export function registerSignalsHandlers(): void {
  registerHandler('signals.importCalendar', async (params) => {
    const { path } = SignalsImportCalendarParamsSchema.parse(params)
    const { bundle, calendarImporter } = getDeps()

    calendarImporter.setFilePath(path)
    const eventsImported = calendarImporter.importNow()
    calendarImporter.startPolling()

    // Persist the chosen path in settings
    const settings = createSettingsRepo(bundle.db)
    settings.set('signals.calendarPath', path)

    const audit = createAuditRepo(bundle.db)
    audit.write({
      kind: 'signals.calendar.imported',
      actor: 'user',
      subject: path,
      meta: { eventsImported },
    })

    return { eventsImported, lookaheadDays: 7 }
  })

  registerHandler('signals.setFocusAppTracking', async (params) => {
    const { enabled } = SignalsSetFocusAppTrackingParamsSchema.parse(params)
    const { bundle, focusTracker } = getDeps()

    const audit = createAuditRepo(bundle.db)
    focusTracker.setEnabled(enabled, audit)

    const settings = createSettingsRepo(bundle.db)
    settings.set('signals.focusAppEnabled', enabled)

    return { ok: true }
  })

  registerHandler('signals.getStatus', async (params) => {
    SignalsGetStatusParamsSchema.parse(params)
    const { bundle, calendarImporter, focusTracker, getIdleMs } = getDeps()

    const calendarPath = calendarImporter.getFilePath() ?? undefined
    const calendarRepo = createCalendarEventsRepo(bundle.db)
    const calendarEventCount = calendarRepo.listUpcoming(
      new Date(),
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ).length

    return {
      calendarPath,
      calendarEventCount,
      focusAppEnabled: focusTracker.isEnabled(),
      idleMs: getIdleMs(),
    }
  })

  registerHandler('suggest.insights', async (params) => {
    SuggestInsightsParamsSchema.parse(params)
    const { bundle } = getDeps()
    const { db } = bundle

    const suggestionsRepo = createSuggestionsRepo(db)
    const weightsRepo = createSuggestionWeightsRepo(db)
    const pausesRepo = createSuggestionPausesRepo(db)

    const history = suggestionsRepo
      .list({ limit: 10000 })
      .filter((s) => s.status === 'accepted' || s.status === 'dismissed')

    const weightMap = new Map(weightsRepo.getAll().map((w) => [w.kind, w]))
    const pauseMap = new Map(pausesRepo.getAll().map((p) => [p.kind, p]))

    // Aggregate per kind
    const kindMap = new Map<
      string,
      {
        acceptCount: number
        dismissCount: number
        acceptByHour: number[]
        dismissByHour: number[]
      }
    >()

    for (const s of history) {
      if (!kindMap.has(s.kind)) {
        kindMap.set(s.kind, {
          acceptCount: 0,
          dismissCount: 0,
          acceptByHour: Array(24).fill(0) as number[],
          dismissByHour: Array(24).fill(0) as number[],
        })
      }
      const k = kindMap.get(s.kind)
      if (!k) continue
      const hour = s.decidedAt ? s.decidedAt.getHours() : 0
      if (s.status === 'accepted') {
        k.acceptCount++
        if (k.acceptByHour[hour] !== undefined) k.acceptByHour[hour]++
      } else {
        k.dismissCount++
        if (k.dismissByHour[hour] !== undefined) k.dismissByHour[hour]++
      }
    }

    const byKind = Array.from(kindMap.entries()).map(([kind, data]) => {
      const total = data.acceptCount + data.dismissCount
      const acceptRate = total > 0 ? data.acceptCount / total : 0
      const w = weightMap.get(kind)
      const pause = pauseMap.get(kind)
      return {
        kind,
        acceptCount: data.acceptCount,
        dismissCount: data.dismissCount,
        acceptRate,
        learnedWeight: w?.weight ?? 0,
        sampleCount: w?.sampleCount ?? 0,
        acceptByHour: data.acceptByHour,
        dismissByHour: data.dismissByHour,
        pausedUntil: pause?.pausedUntil.getTime(),
      }
    })

    // Sort by total interactions descending
    byKind.sort((a, b) => b.acceptCount + b.dismissCount - (a.acceptCount + a.dismissCount))

    const totalAccepted = history.filter((s) => s.status === 'accepted').length
    const totalDismissed = history.filter((s) => s.status === 'dismissed').length

    return { byKind, totalAccepted, totalDismissed }
  })

  registerHandler('suggest.resetLearning', async (params) => {
    SuggestResetLearningParamsSchema.parse(params)
    const { bundle } = getDeps()
    const { db } = bundle

    const weightsRepo = createSuggestionWeightsRepo(db)
    const pausesRepo = createSuggestionPausesRepo(db)
    const calendarRepo = createCalendarEventsRepo(db)

    weightsRepo.clear()
    pausesRepo.clear()
    calendarRepo.clear()

    // Recompute from scratch immediately (will produce zero weights)
    recomputeWeights(bundle)

    return { ok: true }
  })
}
