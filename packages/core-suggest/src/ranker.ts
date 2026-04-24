import type { SuggestionCandidate } from './types'
import type { SuggestionWeightRow } from '@auralith/core-db'

// Intrinsic priority per kind — higher = more valuable to surface first
const KIND_PRIORITY: Record<string, number> = {
  'weather.alert': 100,
  'morning.brief': 90,
  'eod.recap': 80,
  'news.digest': 60,
  'downloads.cleanup': 50,
  'session.recap': 40,
  'work.resume': 30,
  // Leisure suggestions — shown on weekends, lower than work-critical signals
  'leisure.weekend-brief': 85,
  'leisure.reading-resurfaced': 55,
  'leisure.hobby-idea': 25,
  // M11 adaptive signals
  'calendar.prep': 88,
  'focus.resume': 35,
}

// Penalty by tier — confirm-tier candidates are slightly less auto-pressing
const TIER_PENALTY: Record<string, number> = {
  safe: 0,
  confirm: 5,
  restricted: 50,
}

// EMA decay constant — controls how fast new evidence overwrites old
// α = 0.15 → ~6-sample half-life; conservative to avoid thrashing
const EMA_ALPHA = 0.15

// Hard clamp — learning can never fully silence or over-amplify a kind
const WEIGHT_CLAMP = 0.5

// Minimum sample count before learned weight is applied
const MIN_SAMPLES = 5

export type RankedCandidate = SuggestionCandidate & { score: number }

export function rankCandidates(
  candidates: SuggestionCandidate[],
  weightRows: SuggestionWeightRow[] = [],
): RankedCandidate[] {
  const weightMap = new Map(weightRows.map((r) => [r.kind, r]))

  const scored = candidates.map((c) => {
    const base = (KIND_PRIORITY[c.kind] ?? 20) - (TIER_PENALTY[c.tier] ?? 0)
    const w = weightMap.get(c.kind)
    // Only apply learned boost/penalty once there are enough samples
    const learnedMultiplier =
      w && w.sampleCount >= MIN_SAMPLES
        ? 1 + Math.max(-WEIGHT_CLAMP, Math.min(WEIGHT_CLAMP, w.weight))
        : 1
    return { ...c, score: base * learnedMultiplier }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored
}

// At most MAX_ACTIVE open suggestions shown on home at a time
export const MAX_ACTIVE_SUGGESTIONS = 3

export function selectTopCandidates(
  candidates: SuggestionCandidate[],
  currentOpenCount: number,
  pausedKinds: Set<string> = new Set(),
  weightRows: SuggestionWeightRow[] = [],
): SuggestionCandidate[] {
  const slots = Math.max(0, MAX_ACTIVE_SUGGESTIONS - currentOpenCount)
  if (slots === 0) return []

  // Filter out paused kinds before ranking
  const eligible = candidates.filter((c) => !pausedKinds.has(c.kind))
  const ranked = rankCandidates(eligible, weightRows)
  return ranked.slice(0, slots)
}

// Compute updated EMA weight given an observed outcome (+1 accept / -1 dismiss)
// Returns the new weight clamped to ±WEIGHT_CLAMP
export function computeNextWeight(
  currentWeight: number,
  currentSamples: number,
  outcome: 'accept' | 'dismiss',
): { weight: number; sampleCount: number } {
  const signal = outcome === 'accept' ? 1 : -1
  const newWeight = currentWeight + EMA_ALPHA * (signal - currentWeight)
  const clamped = Math.max(-WEIGHT_CLAMP, Math.min(WEIGHT_CLAMP, newWeight))
  return { weight: clamped, sampleCount: currentSamples + 1 }
}

// Check cooldown: 3+ consecutive dismissals in the last 48h for a kind
export function shouldPauseKind(
  kind: string,
  recentHistory: Array<{ kind: string; status: string; decidedAt?: Date }>,
  now: Date,
): boolean {
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000)
  const recent = recentHistory.filter(
    (h) => h.kind === kind && h.decidedAt !== undefined && h.decidedAt >= fortyEightHoursAgo,
  )

  // Walk backwards through recent decisions; count consecutive dismissals from the end
  const decided = recent
    .filter((h) => h.status === 'dismissed' || h.status === 'accepted')
    .sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0))

  let consecutive = 0
  for (const h of decided) {
    if (h.status === 'dismissed') {
      consecutive++
    } else {
      break
    }
  }

  return consecutive >= 3
}
