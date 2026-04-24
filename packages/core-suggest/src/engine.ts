import type { DbBundle } from '@auralith/core-db'
import {
  createSuggestionsRepo,
  createEventsRepo,
  createSettingsRepo,
  createSuggestionWeightsRepo,
  createSuggestionPausesRepo,
} from '@auralith/core-db'
import {
  generateDownloadsCleanup,
  generateSessionRecap,
  generateResumeWork,
  generateNewsDigest,
  generateWeatherAlert,
  generateMorningBrief,
  generateEndOfDayRecap,
  generateWeekendBriefing,
  generateReadingResurface,
  generateHobbyIdea,
  generateCalendarPrep,
  generateFocusAlignedResume,
} from './generators'
import { selectTopCandidates, shouldPauseKind } from './ranker'
import type { SuggestionCandidate } from './types'
import type { SignalProviders } from './signals'
import type { SuggestionWeightRow } from '@auralith/core-db'

export type SuggestionEngineSignals = {
  getUnreadClusterCount?: () => number
  getWeatherAlertLevel?: () => 'none' | 'watch' | 'warning'
  getWeatherSummary?: () => string
  getSavedOldNewsItemCount?: () => number
  // M11 adaptive signals
  signalProviders?: SignalProviders
}

export class SuggestionEngine {
  private readonly bundle: DbBundle
  private signals: SuggestionEngineSignals = {}
  private intervalHandle: ReturnType<typeof setInterval> | null = null
  private readonly intervalMs: number
  private weightsCache: SuggestionWeightRow[] | null = null

  constructor(bundle: DbBundle, intervalMs = 60_000) {
    this.bundle = bundle
    this.intervalMs = intervalMs
  }

  setSignals(signals: SuggestionEngineSignals): void {
    this.signals = signals
  }

  invalidateWeightsCache(): void {
    this.weightsCache = null
  }

  start(): void {
    void this.tick()
    this.intervalHandle = setInterval(() => void this.tick(), this.intervalMs)
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
  }

  async tick(): Promise<void> {
    try {
      const { db } = this.bundle
      const suggestionsRepo = createSuggestionsRepo(db)
      const eventsRepo = createEventsRepo(db)
      const settingsRepo = createSettingsRepo(db)
      const weightsRepo = createSuggestionWeightsRepo(db)
      const pausesRepo = createSuggestionPausesRepo(db)

      // Expire stale + wake snoozed + clean expired pauses
      suggestionsRepo.expireStale()
      pausesRepo.expireStale(new Date())

      const now = new Date()
      const ctx = { now }

      // How many open suggestions do we already have?
      const openCount = suggestionsRepo.listOpen(MAX_OPEN_LIMIT).length

      if (openCount >= 3) return // rail is full

      const isWeekend = [0, 6].includes(now.getDay())
      const sp = this.signals.signalProviders ?? {}

      const allCandidates: SuggestionCandidate[] = []

      // Run all generators concurrently
      const results = await Promise.allSettled([
        generateDownloadsCleanup(eventsRepo, suggestionsRepo, ctx),
        generateSessionRecap(eventsRepo, suggestionsRepo, ctx),
        generateResumeWork(eventsRepo, suggestionsRepo, ctx),
        generateNewsDigest(suggestionsRepo, this.signals.getUnreadClusterCount ?? (() => 0), ctx),
        generateWeatherAlert(
          suggestionsRepo,
          this.signals.getWeatherAlertLevel ?? (() => 'none'),
          this.signals.getWeatherSummary ?? (() => ''),
          ctx,
        ),
        // Skip weekday-specific briefing and EOD on weekends when leisure mode is active
        isWeekend ? Promise.resolve([]) : generateMorningBrief(suggestionsRepo, settingsRepo, ctx),
        isWeekend ? Promise.resolve([]) : generateEndOfDayRecap(eventsRepo, suggestionsRepo, ctx),
        // Leisure generators — only fire on weekends (or when mode forced to 'always')
        generateWeekendBriefing(suggestionsRepo, settingsRepo, ctx),
        generateReadingResurface(
          suggestionsRepo,
          settingsRepo,
          this.signals.getSavedOldNewsItemCount ?? (() => 0),
          ctx,
        ),
        generateHobbyIdea(suggestionsRepo, settingsRepo, ctx),
        // M11: calendar prep
        generateCalendarPrep(suggestionsRepo, sp.getNextCalendarEvent ?? (() => null), ctx),
        // M11: focus-aligned resume (only when focus tracking opted in)
        sp.getFocusAppBucket
          ? generateFocusAlignedResume(
              eventsRepo,
              suggestionsRepo,
              sp.getIdleMs ?? (() => 0),
              sp.getFocusAppBucket,
              ctx,
            )
          : Promise.resolve([]),
      ])

      for (const r of results) {
        if (r.status === 'fulfilled') {
          allCandidates.push(...r.value)
        }
      }

      // Build paused-kinds set
      const recentHistory = suggestionsRepo
        .list({ limit: 200 })
        .filter((s) => s.status === 'dismissed' || s.status === 'accepted')

      const allKinds = new Set(allCandidates.map((c) => c.kind))
      const pausedKinds = new Set<string>()

      for (const kind of allKinds) {
        if (pausesRepo.isKindPaused(kind, now)) {
          pausedKinds.add(kind)
          continue
        }
        // Check if it should be newly paused
        if (shouldPauseKind(kind, recentHistory, now)) {
          const pauseUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000)
          pausesRepo.pause(kind, pauseUntil)
          pausedKinds.add(kind)
        }
      }

      // Auto-lift escape hatch: if too many kinds are paused simultaneously the rail
      // goes permanently dark. Lift the oldest pause so at least one kind can surface.
      const ALL_GENERATOR_KINDS = 12
      if (pausedKinds.size >= Math.max(3, ALL_GENERATOR_KINDS - 2)) {
        pausesRepo.liftOldest()
      }

      // Load learned weights — use cache to avoid 60 DB reads/hour
      if (this.weightsCache === null) {
        this.weightsCache = weightsRepo.getAll()
      }
      const weightRows = this.weightsCache

      const toCreate = selectTopCandidates(allCandidates, openCount, pausedKinds, weightRows)

      for (const candidate of toCreate) {
        const expiresAt = new Date(now.getTime() + candidate.ttlMs)
        suggestionsRepo.create({
          kind: candidate.kind,
          title: candidate.title,
          rationale: candidate.rationale,
          proposedActionJson: JSON.stringify(candidate.proposedAction),
          tier: candidate.tier,
          expiresAt,
        })
      }
    } catch (err) {
      console.error('[suggest] engine tick error:', err)
    }
  }
}

const MAX_OPEN_LIMIT = 10
