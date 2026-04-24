import type { DbBundle } from '@auralith/core-db'
import { createSuggestionsRepo, createSuggestionWeightsRepo } from '@auralith/core-db'
import { computeNextWeight } from '@auralith/core-suggest'
import { getScheduler } from '@auralith/core-scheduler'

let _bundle: DbBundle | null = null

export function initLearningJob(bundle: DbBundle): void {
  _bundle = bundle
}

export function setupLearningRecomputeScheduler(onComplete?: () => void): void {
  const scheduler = getScheduler()

  // Nightly at 03:00 — recompute EMA weights from decided suggestions
  scheduler.register({
    name: 'learning-recompute',
    cronHour: 3,
    cronMinute: 0,
    jitterMs: 5 * 60 * 1000,
    quietStart: 0,
    quietEnd: 0,
    run: async () => {
      if (!_bundle) return
      recomputeWeights(_bundle)
      onComplete?.()
    },
  })
}

// Can be called directly (e.g. after reset)
export function recomputeWeights(bundle: DbBundle): void {
  try {
    const { db } = bundle
    const suggestionsRepo = createSuggestionsRepo(db)
    const weightsRepo = createSuggestionWeightsRepo(db)

    // Look at the last 30 days of decided suggestions
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const history = suggestionsRepo
      .list({ limit: 5000 })
      .filter(
        (s) =>
          (s.status === 'accepted' || s.status === 'dismissed') &&
          s.decidedAt !== undefined &&
          s.decidedAt >= thirtyDaysAgo,
      )

    // Group by kind, ordered by decidedAt ascending so EMA runs chronologically
    const byKind = new Map<string, typeof history>()
    for (const s of history) {
      const arr = byKind.get(s.kind) ?? []
      arr.push(s)
      byKind.set(s.kind, arr)
    }

    for (const [kind, records] of byKind) {
      // Sort oldest first for chronological EMA
      records.sort((a, b) => (a.decidedAt?.getTime() ?? 0) - (b.decidedAt?.getTime() ?? 0))

      const current = weightsRepo.get(kind)
      let weight = current?.weight ?? 0
      let samples = current?.sampleCount ?? 0

      for (const record of records) {
        const outcome = record.status === 'accepted' ? 'accept' : 'dismiss'
        const next = computeNextWeight(weight, samples, outcome)
        weight = next.weight
        samples = next.sampleCount
      }

      weightsRepo.upsert(kind, weight, samples)
    }
  } catch (err) {
    console.error('[learning-job] recompute error:', err)
  }
}
