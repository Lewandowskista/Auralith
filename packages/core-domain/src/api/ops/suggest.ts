import { z } from 'zod'
import { PermissionTierSchema } from '../types'

const SuggestionSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  rationale: z.string(),
  proposedActionJson: z.string(),
  tier: PermissionTierSchema,
  status: z.enum(['open', 'accepted', 'dismissed', 'snoozed', 'expired']),
  createdAt: z.number(),
  decidedAt: z.number().optional(),
  expiresAt: z.number().optional(),
})

export const SuggestListParamsSchema = z.object({
  status: z.enum(['open', 'accepted', 'dismissed', 'snoozed', 'expired']).optional(),
  limit: z.number().int().positive().default(20),
})
export const SuggestListResultSchema = z.object({ suggestions: z.array(SuggestionSchema) })

export const SuggestAcceptParamsSchema = z.object({ id: z.string() })
export const SuggestAcceptResultSchema = z.object({
  invocationId: z.string().optional(),
  accepted: z.boolean(),
})

export const SuggestDismissParamsSchema = z.object({ id: z.string() })
export const SuggestDismissResultSchema = z.object({ dismissed: z.boolean() })

export const SuggestSnoozeParamsSchema = z.object({ id: z.string(), until: z.number() })
export const SuggestSnoozeResultSchema = z.object({ snoozed: z.boolean() })

// M11: analytics insights
export const SuggestInsightsParamsSchema = z.object({})

const KindInsightSchema = z.object({
  kind: z.string(),
  acceptCount: z.number(),
  dismissCount: z.number(),
  acceptRate: z.number(),
  learnedWeight: z.number(),
  sampleCount: z.number(),
  // 24-bucket histogram (0=midnight, 23=11pm) — accept and dismiss counts per hour
  acceptByHour: z.array(z.number()).length(24),
  dismissByHour: z.array(z.number()).length(24),
  pausedUntil: z.number().optional(),
})

export const SuggestInsightsResultSchema = z.object({
  byKind: z.array(KindInsightSchema),
  totalAccepted: z.number(),
  totalDismissed: z.number(),
  resetAt: z.number().optional(),
})

export type KindInsight = z.infer<typeof KindInsightSchema>

export const SuggestResetLearningParamsSchema = z.object({})
export const SuggestResetLearningResultSchema = z.object({ ok: z.boolean() })
