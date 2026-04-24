import { z } from 'zod'

// ── Shared sub-schemas ──────────────────────────────────────────────────────

const TriggerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('schedule'),
    cronHour: z.number().int().min(0).max(23),
    cronMinute: z.number().int().min(0).max(59),
  }),
  z.object({ type: z.literal('event'), eventKind: z.string() }),
  z.object({ type: z.literal('suggestion.accepted'), suggestionKind: z.string() }),
  z.object({ type: z.literal('app.startup') }),
  z.object({ type: z.literal('on.idle'), idleMinutes: z.number().int().min(1) }),
  z.object({ type: z.literal('webhook'), path: z.string() }),
  z.object({ type: z.literal('ai'), prompt: z.string().optional() }),
])

const ConditionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('time.between'),
    startHour: z.number().int(),
    endHour: z.number().int(),
  }),
  z.object({ type: z.literal('weekday.in'), days: z.array(z.number().int().min(0).max(6)) }),
  z.object({
    type: z.literal('setting.eq'),
    key: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
])

const ActionBindingSchema = z.object({
  toolId: z.string(),
  params: z.record(z.unknown()),
})

export const RoutineSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  trigger: TriggerSchema,
  conditions: z.array(ConditionSchema),
  action: ActionBindingSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
  lastRunAt: z.number().optional(),
  lastStatus: z.enum(['success', 'failure', 'blocked', 'skipped']).optional(),
  runCount: z.number().int(),
})

export type Routine = z.infer<typeof RoutineSchema>
export type RoutineTrigger = z.infer<typeof TriggerSchema>
export type RoutineCondition = z.infer<typeof ConditionSchema>
export type RoutineAction = z.infer<typeof ActionBindingSchema>

const RoutineRunSchema = z.object({
  id: z.string(),
  routineId: z.string(),
  ts: z.number(),
  outcome: z.enum(['success', 'failure', 'blocked', 'skipped']),
  traceId: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
})

export type RoutineRun = z.infer<typeof RoutineRunSchema>

// ── IPC op schemas ──────────────────────────────────────────────────────────

export const RoutinesListParamsSchema = z.object({ includeDisabled: z.boolean().optional() })
export const RoutinesListResultSchema = z.object({ routines: z.array(RoutineSchema) })

export const RoutinesGetParamsSchema = z.object({ id: z.string() })
export const RoutinesGetResultSchema = z.object({ routine: RoutineSchema })

export const RoutinesCreateParamsSchema = z.object({
  name: z.string(),
  trigger: TriggerSchema,
  conditions: z.array(ConditionSchema).default([]),
  action: ActionBindingSchema,
})
export const RoutinesCreateResultSchema = z.object({ routine: RoutineSchema })

export const RoutinesUpdateParamsSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  trigger: TriggerSchema.optional(),
  conditions: z.array(ConditionSchema).optional(),
  action: ActionBindingSchema.optional(),
})
export const RoutinesUpdateResultSchema = z.object({ routine: RoutineSchema })

export const RoutinesDeleteParamsSchema = z.object({ id: z.string() })
export const RoutinesDeleteResultSchema = z.object({ ok: z.boolean() })

export const RoutinesEnableParamsSchema = z.object({ id: z.string() })
export const RoutinesEnableResultSchema = z.object({ ok: z.boolean() })

export const RoutinesDisableParamsSchema = z.object({ id: z.string() })
export const RoutinesDisableResultSchema = z.object({ ok: z.boolean() })

export const RoutinesDryRunParamsSchema = z.object({
  id: z.string(),
  lookbackHours: z.number().int().min(1).max(168).default(24),
})
export const RoutinesDryRunResultSchema = z.object({
  matchCount: z.number(),
  samples: z.array(z.object({ ts: z.number(), reason: z.string() })),
})

export const RoutinesRunParamsSchema = z.object({ id: z.string() })
export const RoutinesRunResultSchema = z.object({
  outcome: z.string(),
  invocationId: z.string().optional(),
})

export const RoutinesHistoryParamsSchema = z.object({
  id: z.string(),
  limit: z.number().int().min(1).max(100).default(50),
})
export const RoutinesHistoryResultSchema = z.object({ runs: z.array(RoutineRunSchema) })
