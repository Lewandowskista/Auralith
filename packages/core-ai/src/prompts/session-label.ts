import { z } from 'zod'
import type { PromptContract } from '../runtime'

const SessionLabelSchema = z.object({
  label: z.string().max(60),
  category: z.enum([
    'coding',
    'writing',
    'research',
    'media',
    'downloads',
    'system',
    'mixed',
    'other',
  ]),
})

export type SessionLabelResult = z.infer<typeof SessionLabelSchema>

export const SESSION_LABEL_V1: PromptContract<SessionLabelResult> = {
  id: 'session.label.v1',
  role: 'classifier',
  system: 'You label file activity sessions with a short title. Reply with JSON only.',
  userTemplate: ({ events }) =>
    `File activity session:\n${events}\n\nProvide a short label (max 60 chars) and category.\nJSON: {"label":"...", "category":"..."}`,
  outputSchema: SessionLabelSchema,
  maxTokens: 80,
  temperature: 0,
}
