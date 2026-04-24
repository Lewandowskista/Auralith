export type RoutineCondition =
  | { type: 'time.between'; startHour: number; endHour: number }
  | { type: 'weekday.in'; days: number[] }
  | { type: 'setting.eq'; key: string; value: string | number | boolean }

export type RoutineTrigger =
  | { type: 'schedule'; cronHour: number; cronMinute: number }
  | { type: 'event'; eventKind: string }
  | { type: 'suggestion.accepted'; suggestionKind: string }
  | { type: 'app.startup' }
  | { type: 'on.idle'; idleMinutes: number }
  | { type: 'webhook'; path: string; secret?: string }
  | { type: 'ai'; description: string }

/** Single step in a multi-step routine. May reference prior step results via {{step0.result}}. */
export type RoutineStep = {
  toolId: string
  /** Params may contain {{trigger.eventKind}}, {{step0.result}}, etc. — interpolated at runtime. */
  params: Record<string, unknown>
  label?: string
}

export type RoutineAction = {
  toolId: string
  params: Record<string, unknown>
}

/** Context available to variable interpolation. */
export type InterpolationContext = {
  trigger?: Record<string, unknown>
  steps?: Array<{ result?: unknown; error?: string }>
  settings?: Record<string, unknown>
}

export type EvalContext = {
  now: Date
  eventKind?: string
  eventPath?: string
  suggestionKind?: string
  idleMs?: number
  isStartup?: boolean
  webhookPath?: string
  webhookPayload?: Record<string, unknown>
  aiTriggered?: boolean
  getSetting?: (key: string) => unknown
}

export function evaluateConditions(conditions: RoutineCondition[], ctx: EvalContext): boolean {
  return conditions.every((c) => evaluateCondition(c, ctx))
}

function evaluateCondition(c: RoutineCondition, ctx: EvalContext): boolean {
  if (c.type === 'time.between') {
    const h = ctx.now.getHours()
    if (c.startHour <= c.endHour) return h >= c.startHour && h < c.endHour
    return h >= c.startHour || h < c.endHour
  }
  if (c.type === 'weekday.in') {
    return c.days.includes(ctx.now.getDay())
  }
  // setting.eq
  const val = ctx.getSetting?.(c.key)
  return val === c.value
}

export function triggerMatches(trigger: RoutineTrigger, ctx: EvalContext): boolean {
  if (trigger.type === 'schedule') return true
  if (trigger.type === 'event') return ctx.eventKind === trigger.eventKind
  if (trigger.type === 'suggestion.accepted') return ctx.suggestionKind === trigger.suggestionKind
  if (trigger.type === 'app.startup') return ctx.isStartup === true
  if (trigger.type === 'webhook') return ctx.webhookPath === trigger.path
  if (trigger.type === 'ai') return ctx.aiTriggered === true
  // on.idle
  return (ctx.idleMs ?? 0) >= trigger.idleMinutes * 60_000
}

/** Interpolate {{variable}} tokens in a string value. */
export function interpolate(value: string, ctx: InterpolationContext): string {
  return value.replace(/\{\{([^}]+)\}\}/g, (_match, key) => {
    const parts = key.trim().split('.')
    let current: unknown = ctx
    for (const part of parts) {
      if (current === null || current === undefined) return ''
      current = (current as Record<string, unknown>)[part]
    }
    if (current === null || current === undefined) return ''
    return String(current)
  })
}

/** Recursively interpolate all string values in a params object. */
export function interpolateParams(
  params: Record<string, unknown>,
  ctx: InterpolationContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string') {
      out[k] = interpolate(v, ctx)
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = interpolateParams(v as Record<string, unknown>, ctx)
    } else {
      out[k] = v
    }
  }
  return out
}
