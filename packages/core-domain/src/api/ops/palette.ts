import { z } from 'zod'

export const PaletteOpenParamsSchema = z.object({
  prefill: z.string().optional(),
})
export const PaletteOpenResultSchema = z.object({ opened: z.boolean() })

export const PaletteCloseParamsSchema = z.object({})
export const PaletteCloseResultSchema = z.object({ closed: z.boolean() })

export const PaletteQueryParamsSchema = z.object({
  query: z.string(),
  limit: z.number().int().positive().default(10),
})
export const PaletteQueryResultSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      group: z.string(),
      icon: z.string().optional(),
      keywords: z.array(z.string()).optional(),
    }),
  ),
})
