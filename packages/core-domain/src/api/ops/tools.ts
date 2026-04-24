import { z } from 'zod'

export const ToolsListParamsSchema = z.object({})
export const ToolsListResultSchema = z.object({
  tools: z.array(
    z.object({
      id: z.string(),
      tier: z.enum(['safe', 'confirm', 'restricted']),
      description: z.string(),
    }),
  ),
})

export const ToolsInvokeParamsSchema = z.object({
  toolId: z.string(),
  params: z.record(z.unknown()).optional(),
})
export const ToolsInvokeResultSchema = z.object({
  outcome: z.enum(['success', 'failure', 'cancelled']),
  invocationId: z.string(),
  result: z.unknown().optional(),
  error: z.string().optional(),
})
