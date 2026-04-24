import { z } from 'zod'

export const SignalsImportCalendarParamsSchema = z.object({
  path: z.string(),
})
export const SignalsImportCalendarResultSchema = z.object({
  eventsImported: z.number(),
  lookaheadDays: z.number(),
})

export const SignalsSetFocusAppTrackingParamsSchema = z.object({
  enabled: z.boolean(),
})
export const SignalsSetFocusAppTrackingResultSchema = z.object({ ok: z.boolean() })

export const SignalsGetStatusParamsSchema = z.object({})
export const SignalsGetStatusResultSchema = z.object({
  calendarPath: z.string().optional(),
  calendarEventCount: z.number(),
  focusAppEnabled: z.boolean(),
  idleMs: z.number(),
})
