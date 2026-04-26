import { z } from 'zod'

export const AssistantSendParamsSchema = z.object({
  message: z.string().min(1),
  messageId: z.string().optional(),
  sessionId: z.string().optional(),
  spaceId: z.string().optional(),
})
export const AssistantSendResultSchema = z.object({
  messageId: z.string(),
  sessionId: z.string(),
})

export const AssistantAbortParamsSchema = z.object({ messageId: z.string() })
export const AssistantAbortResultSchema = z.object({ aborted: z.boolean() })

export const AssistantInvokeToolParamsSchema = z.object({
  toolId: z.string(),
  params: z.record(z.unknown()),
  sessionId: z.string().optional(),
})
export const AssistantInvokeToolResultSchema = z.object({
  invocationId: z.string(),
  outcome: z.enum(['success', 'failure', 'cancelled']),
  result: z.unknown().optional(),
  error: z.string().optional(),
})

export const AssistantGetSessionParamsSchema = z.object({ sessionId: z.string() })
export const AssistantGetSessionResultSchema = z.object({
  sessionId: z.string(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      ts: z.number(),
      citations: z
        .array(
          z.object({
            chunkId: z.string(),
            docPath: z.string(),
            headingPath: z.string(),
            charStart: z.number(),
            charEnd: z.number(),
            page: z.number().optional(),
          }),
        )
        .optional(),
    }),
  ),
})

export const AssistantDeleteSessionParamsSchema = z.object({ sessionId: z.string() })
export const AssistantDeleteSessionResultSchema = z.object({ deleted: z.boolean() })

export const AssistantListSessionsParamsSchema = z.object({
  limit: z.number().int().positive().default(20),
  offset: z.number().int().min(0).default(0),
})
export const AssistantListSessionsResultSchema = z.object({
  sessions: z.array(
    z.object({
      id: z.string(),
      startedAt: z.number(),
      endedAt: z.number().optional(),
      lastMessageAt: z.number().optional(),
      title: z.string().optional(),
      summary: z.string().optional(),
      messageCount: z.number().optional(),
    }),
  ),
})
