import { z } from 'zod'
import { ActivityEventKindSchema } from '../types'

const EventSchema = z.object({
  id: z.string(),
  ts: z.number(),
  kind: ActivityEventKindSchema,
  source: z.enum(['watcher', 'assistant', 'user', 'signal']),
  path: z.string(),
  prevPath: z.string().optional(),
  spaceId: z.string().optional(),
  actor: z.string(),
  payloadJson: z.string(),
  sessionId: z.string().optional(),
})

const SessionSchema = z.object({
  id: z.string(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  summary: z.string().optional(),
  eventCount: z.number(),
})

export const ActivityQueryParamsSchema = z.object({
  after: z.number().optional(),
  before: z.number().optional(),
  kind: ActivityEventKindSchema.optional(),
  spaceId: z.string().optional(),
  path: z.string().optional(),
  sessionId: z.string().optional(),
  limit: z.number().int().positive().default(100),
  offset: z.number().int().min(0).default(0),
})
export const ActivityQueryResultSchema = z.object({
  events: z.array(EventSchema),
  total: z.number(),
})

export const ActivityGetSessionParamsSchema = z.object({ sessionId: z.string() })
export const ActivityGetSessionResultSchema = z.object({ session: SessionSchema })

export const ActivityListSessionsParamsSchema = z.object({
  after: z.number().optional(),
  before: z.number().optional(),
  limit: z.number().int().positive().default(20),
  offset: z.number().int().min(0).default(0),
})
export const ActivityListSessionsResultSchema = z.object({
  sessions: z.array(SessionSchema),
  total: z.number(),
})

export const ActivitySetRetentionParamsSchema = z.object({
  days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(180), z.literal(-1)]),
})
export const ActivitySetRetentionResultSchema = z.object({ updated: z.boolean() })
