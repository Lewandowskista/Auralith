import { z } from 'zod'

export const AppUsageBucketSchema = z.enum([
  'ide',
  'browser',
  'explorer',
  'media',
  'productivity',
  'other',
])

export const AppUsageRowSchema = z.object({
  id: z.string(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  bucket: AppUsageBucketSchema,
  processName: z.string(),
  durationMs: z.number().optional(),
})

export const AppUsageListParamsSchema = z.object({
  after: z.number().optional(),
  before: z.number().optional(),
  limit: z.number().int().positive().default(100),
  offset: z.number().int().min(0).default(0),
})
export const AppUsageListResultSchema = z.object({
  sessions: z.array(AppUsageRowSchema),
})

export const AppUsageClearBeforeParamsSchema = z.object({ before: z.number() })
export const AppUsageClearBeforeResultSchema = z.object({ deleted: z.number() })
