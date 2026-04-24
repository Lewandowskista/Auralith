import { z } from 'zod'

export const ClipboardKindSchema = z.enum(['text', 'image', 'file'])

export const ClipboardRowSchema = z.object({
  id: z.string(),
  ts: z.number(),
  kind: ClipboardKindSchema,
  textValue: z.string().optional(),
  charCount: z.number().optional(),
  redacted: z.boolean(),
  sessionId: z.string().optional(),
})

export const ClipboardListParamsSchema = z.object({
  limit: z.number().int().positive().default(100),
  offset: z.number().int().min(0).default(0),
})
export const ClipboardListResultSchema = z.object({
  items: z.array(ClipboardRowSchema),
})

export const ClipboardDeleteParamsSchema = z.object({ id: z.string() })
export const ClipboardDeleteResultSchema = z.object({ deleted: z.boolean() })

export const ClipboardClearParamsSchema = z.object({})
export const ClipboardClearResultSchema = z.object({ deleted: z.number() })
