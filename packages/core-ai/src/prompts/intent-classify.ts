import { z } from 'zod'
import type { PromptContract } from '../runtime'

const IntentSchema = z.object({
  intent: z.enum(['search', 'chat', 'summarize', 'action', 'unclear']),
  confidence: z.number().min(0).max(1),
})

export type IntentResult = z.infer<typeof IntentSchema>

export const INTENT_CLASSIFY_V1: PromptContract<IntentResult> = {
  id: 'intent.classify.v1',
  role: 'classifier',
  system: 'Classify the user message into exactly one intent. Reply with JSON only.',
  userTemplate: ({ message }) =>
    `Message: "${message}"\n\nClassify as one of: search (looking for information), chat (conversation/question), summarize (wants a summary), action (wants to do something), unclear.\n\nJSON: {"intent":"...", "confidence": 0.0-1.0}`,
  outputSchema: IntentSchema,
  maxTokens: 60,
  temperature: 0,
}
