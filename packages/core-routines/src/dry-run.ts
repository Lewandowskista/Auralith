import type { RoutineRow } from '@auralith/core-db'
import {
  evaluateConditions,
  triggerMatches,
  type EvalContext,
  type RoutineTrigger,
  type RoutineCondition,
} from './evaluator'

type DryRunSample = { ts: number; reason: string }

export type DryRunResult = {
  matchCount: number
  samples: DryRunSample[]
}

export function dryRunRoutine(
  routine: RoutineRow,
  eventHistory: Array<{ ts: Date; kind: string }>,
  lookbackHours: number,
  getSetting?: (key: string) => unknown,
): DryRunResult {
  const trigger = JSON.parse(routine.triggerJson) as RoutineTrigger
  const conditions = JSON.parse(routine.conditionsJson) as RoutineCondition[]

  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000)
  const relevant = eventHistory.filter((e) => e.ts >= since)

  // For schedule triggers simulate ticks hourly across the lookback window
  if (trigger.type === 'schedule') {
    const ticks: DryRunSample[] = []
    const start = new Date(since)
    start.setMinutes(0, 0, 0)
    const now = new Date()
    let cursor = new Date(start)
    while (cursor <= now) {
      if (cursor.getHours() === trigger.cronHour && cursor.getMinutes() === 0) {
        const ctx: EvalContext = {
          now: cursor,
          ...(getSetting !== undefined ? { getSetting } : {}),
        }
        if (evaluateConditions(conditions, ctx)) {
          ticks.push({ ts: cursor.getTime(), reason: `scheduled at ${cursor.toISOString()}` })
        }
      }
      cursor = new Date(cursor.getTime() + 60 * 60 * 1000)
    }
    return { matchCount: ticks.length, samples: ticks.slice(0, 10) }
  }

  const samples: DryRunSample[] = []
  for (const event of relevant) {
    const ctx: EvalContext = {
      now: event.ts,
      eventKind: event.kind,
      ...(getSetting !== undefined ? { getSetting } : {}),
    }
    if (triggerMatches(trigger, ctx) && evaluateConditions(conditions, ctx)) {
      samples.push({
        ts: event.ts.getTime(),
        reason: `event ${event.kind} at ${event.ts.toISOString()}`,
      })
      if (samples.length >= 10) break
    }
  }

  return { matchCount: samples.length, samples }
}

export { dryRunRoutine as runDryRun }
