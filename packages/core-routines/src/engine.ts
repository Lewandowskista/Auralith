import { randomUUID } from 'crypto'
import type { RoutinesRepo, AuditRepo } from '@auralith/core-db'
import type { ExecutorDeps } from '@auralith/core-tools'
import {
  evaluateConditions,
  triggerMatches,
  interpolateParams,
  type EvalContext,
  type RoutineTrigger,
  type RoutineCondition,
  type RoutineAction,
  type RoutineStep,
  type InterpolationContext,
} from './evaluator'
import { executeTool } from '@auralith/core-tools'
import type { RoutineRow } from '@auralith/core-db'

const MAX_RUNS_PER_HOUR = 20
const ONE_HOUR_MS = 60 * 60 * 1000

export type EngineEventPayload = {
  kind: string
  path?: string
  ts?: Date
}

export type WebhookPayload = {
  path: string
  secret?: string
  body: Record<string, unknown>
}

export type EngineDeps = {
  routinesRepo: RoutinesRepo
  auditRepo: AuditRepo
  executorDeps: ExecutorDeps
  getSetting?: (key: string) => unknown
  getIdleMs?: () => number
}

export class RoutineEngine {
  private deps: EngineDeps
  private idleTimer: ReturnType<typeof setInterval> | null = null

  constructor(deps: EngineDeps) {
    this.deps = deps
  }

  async onEvent(payload: EngineEventPayload): Promise<void> {
    const base: EvalContext = {
      now: payload.ts ?? new Date(),
      eventKind: payload.kind,
      ...(payload.path !== undefined ? { eventPath: payload.path } : {}),
    }
    const ctx =
      this.deps.getSetting !== undefined ? { ...base, getSetting: this.deps.getSetting } : base
    await this.evaluateAll(ctx)
  }

  async onSuggestionAccepted(kind: string): Promise<void> {
    const base: EvalContext = { now: new Date(), suggestionKind: kind }
    const ctx =
      this.deps.getSetting !== undefined ? { ...base, getSetting: this.deps.getSetting } : base
    await this.evaluateAll(ctx)
  }

  async onStartup(): Promise<void> {
    const base: EvalContext = { now: new Date(), isStartup: true }
    const ctx =
      this.deps.getSetting !== undefined ? { ...base, getSetting: this.deps.getSetting } : base
    await this.evaluateAll(ctx)
  }

  async onWebhook(payload: WebhookPayload): Promise<void> {
    const base: EvalContext = {
      now: new Date(),
      webhookPath: payload.path,
      webhookPayload: payload.body,
    }
    const ctx =
      this.deps.getSetting !== undefined ? { ...base, getSetting: this.deps.getSetting } : base
    await this.evaluateWebhook(ctx, payload.secret)
  }

  async forceRun(routineId: string): Promise<{ outcome: string; stepResults?: unknown[] }> {
    const routine = this.deps.routinesRepo.get(routineId)
    if (!routine) return { outcome: 'failure' }
    return this.executeRoutine(routine, randomUUID(), {})
  }

  start(idlePollMs = 60_000): void {
    this.idleTimer = setInterval(() => {
      const idleMs = this.deps.getIdleMs?.() ?? 0
      const base: EvalContext = { now: new Date(), idleMs }
      const ctx =
        this.deps.getSetting !== undefined ? { ...base, getSetting: this.deps.getSetting } : base
      void this.evaluateIdle(ctx)
    }, idlePollMs)
  }

  stop(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer)
      this.idleTimer = null
    }
  }

  private async evaluateAll(ctx: EvalContext): Promise<void> {
    const routines = this.deps.routinesRepo.list()
    for (const routine of routines) {
      const trigger = JSON.parse(routine.triggerJson) as RoutineTrigger
      if (trigger.type === 'schedule' || trigger.type === 'webhook') continue
      if (triggerMatches(trigger, ctx)) {
        const conditions = JSON.parse(routine.conditionsJson) as RoutineCondition[]
        if (evaluateConditions(conditions, ctx)) {
          await this.maybeExecute(routine, ctx)
        }
      }
    }
  }

  private async evaluateIdle(ctx: EvalContext): Promise<void> {
    const routines = this.deps.routinesRepo.list()
    for (const routine of routines) {
      const trigger = JSON.parse(routine.triggerJson) as RoutineTrigger
      if (trigger.type !== 'on.idle') continue
      if (triggerMatches(trigger, ctx)) {
        const conditions = JSON.parse(routine.conditionsJson) as RoutineCondition[]
        if (evaluateConditions(conditions, ctx)) {
          await this.maybeExecute(routine, ctx)
        }
      }
    }
  }

  private async evaluateWebhook(ctx: EvalContext, incomingSecret?: string): Promise<void> {
    const routines = this.deps.routinesRepo.list()
    for (const routine of routines) {
      const trigger = JSON.parse(routine.triggerJson) as RoutineTrigger
      if (trigger.type !== 'webhook') continue
      if (trigger.secret && trigger.secret !== incomingSecret) continue
      if (triggerMatches(trigger, ctx)) {
        const conditions = JSON.parse(routine.conditionsJson) as RoutineCondition[]
        if (evaluateConditions(conditions, ctx)) {
          await this.maybeExecute(routine, ctx)
        }
      }
    }
  }

  private async maybeExecute(routine: RoutineRow, ctx: EvalContext): Promise<void> {
    const now = ctx.now
    const since = new Date(now.getTime() - ONE_HOUR_MS)
    const recent = this.deps.routinesRepo.countRunsInWindow(routine.id, since)
    if (recent >= MAX_RUNS_PER_HOUR) {
      this.deps.routinesRepo.recordRun({
        routineId: routine.id,
        outcome: 'skipped',
        meta: { reason: 'rate-cap' },
      })
      return
    }

    const triggerCtx: Record<string, unknown> = {
      eventKind: ctx.eventKind ?? '',
      eventPath: ctx.eventPath ?? '',
      webhookPath: ctx.webhookPath ?? '',
      ...(ctx.webhookPayload ?? {}),
    }

    await this.executeRoutine(routine, randomUUID(), triggerCtx)
  }

  private async executeRoutine(
    routine: RoutineRow,
    traceId: string,
    triggerCtx: Record<string, unknown>,
  ): Promise<{ outcome: string; stepResults?: unknown[] }> {
    // Support both legacy single-action and new multi-step actions[]
    const steps = this.resolveSteps(routine)

    const stepResults: Array<{ result?: unknown; error?: string }> = []
    let overallOutcome: 'success' | 'failure' | 'blocked' = 'success'
    let lastInvocationId: string | undefined

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      if (!step) continue
      const interpCtx: InterpolationContext = {
        trigger: triggerCtx,
        steps: stepResults,
      }
      const resolvedParams = interpolateParams(step.params, interpCtx)

      const result = await executeTool(
        step.toolId,
        resolvedParams,
        { actor: 'scheduler', traceId },
        this.deps.executorDeps,
      )

      if (result.outcome === 'success') {
        stepResults.push({ result: result.result })
        lastInvocationId = result.invocationId
      } else if (result.outcome === 'cancelled') {
        stepResults.push({ error: 'cancelled' })
        overallOutcome = 'blocked'
        break
      } else {
        const err = (result as { error?: string }).error ?? 'tool failed'
        stepResults.push({ error: err })
        overallOutcome = 'failure'
        break
      }
    }

    this.deps.routinesRepo.recordRun({
      routineId: routine.id,
      outcome: overallOutcome,
      traceId,
      meta: {
        steps: stepResults.length,
        ...(overallOutcome !== 'success' ? { error: stepResults.at(-1)?.error } : {}),
      },
    })

    await this.deps.auditRepo.write({
      kind: 'routine.run',
      actor: 'scheduler',
      subject: routine.id,
      meta: {
        routineName: routine.name,
        outcome: overallOutcome,
        traceId,
        invocationId: lastInvocationId,
      },
    })

    return { outcome: overallOutcome, stepResults: stepResults.map((s) => s.result) }
  }

  private resolveSteps(routine: RoutineRow): RoutineStep[] {
    // If actions_json column is populated (v2 routines), use it
    const raw = (routine as RoutineRow & { actionsJson?: string | null }).actionsJson
    if (raw) {
      try {
        const steps = JSON.parse(raw) as RoutineStep[]
        if (Array.isArray(steps) && steps.length > 0) return steps
      } catch {
        // fallthrough to legacy
      }
    }
    // Legacy: single action
    const action = JSON.parse(routine.actionJson) as RoutineAction
    return [{ toolId: action.toolId, params: action.params }]
  }
}

// Re-export types used by consumers
export type { RoutineAction, RoutineStep }
