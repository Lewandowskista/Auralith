import { z } from 'zod'

export const OllamaPingParamsSchema = z.object({ url: z.string().optional().default('') })
export const OllamaPingResultSchema = z.object({
  online: z.boolean(),
  modelCount: z.number(),
})

export const OllamaListModelsParamsSchema = z.object({ url: z.string() })
export const OllamaListModelsResultSchema = z.object({
  models: z.array(z.string()),
})

export const OllamaSaveConfigParamsSchema = z.object({
  url: z.string(),
  chatModel: z.string(),
  embedModel: z.string(),
  classifierModel: z.string(),
})
export const OllamaSaveConfigResultSchema = z.object({ saved: z.boolean() })

export const OllamaTestFeatureParamsSchema = z.object({
  url: z.string(),
  feature: z.enum(['chat', 'embed']),
  model: z.string(),
})
export const OllamaTestFeatureResultSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number(),
  error: z.string().optional(),
})

export const OllamaGetConfigParamsSchema = z.object({})
export const OllamaGetConfigResultSchema = z.object({
  url: z.string(),
  chatModel: z.string(),
  embedModel: z.string(),
  classifierModel: z.string(),
})
