import { z } from 'zod'

const SpaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.number(),
})

const DocSchema = z.object({
  id: z.string(),
  path: z.string(),
  kind: z.enum(['md', 'txt', 'pdf']),
  title: z.string(),
  size: z.number(),
  mtime: z.number(),
  indexedAt: z.number().optional(),
  spaceId: z.string().optional(),
})

const CitationSchema = z.object({
  chunkId: z.string(),
  docPath: z.string(),
  headingPath: z.string(),
  charStart: z.number(),
  charEnd: z.number(),
  page: z.number().optional(),
  text: z.string(),
})

export const BrainSearchParamsSchema = z.object({
  query: z.string().min(1),
  spaceId: z.string().optional(),
  topK: z.number().int().positive().default(8),
  mode: z.enum(['hybrid', 'fts', 'vector']).default('hybrid'),
})
export const BrainSearchResultSchema = z.object({
  results: z.array(
    z.object({
      doc: DocSchema,
      citation: CitationSchema,
      score: z.number(),
    }),
  ),
})

export const BrainGetChunkParamsSchema = z.object({ chunkId: z.string() })
export const BrainGetChunkResultSchema = z.object({
  chunk: z.object({
    id: z.string(),
    docId: z.string(),
    seq: z.number(),
    headingPath: z.string(),
    charStart: z.number(),
    charEnd: z.number(),
    page: z.number().optional(),
    text: z.string(),
    tokens: z.number(),
  }),
})

export const BrainListSpacesParamsSchema = z.object({})
export const BrainListSpacesResultSchema = z.object({ spaces: z.array(SpaceSchema) })

export const BrainCreateSpaceParamsSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
})
export const BrainCreateSpaceResultSchema = z.object({ space: SpaceSchema })

export const BrainUpdateSpaceParamsSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  slug: z.string().optional(),
})
export const BrainUpdateSpaceResultSchema = z.object({ space: SpaceSchema })

export const BrainDeleteSpaceParamsSchema = z.object({ id: z.string() })
export const BrainDeleteSpaceResultSchema = z.object({ deleted: z.boolean() })

export const BrainReindexParamsSchema = z.object({
  spaceId: z.string().optional(),
  force: z.boolean().default(false),
})
export const BrainReindexResultSchema = z.object({ queued: z.number() })

export const BrainListDocsParamsSchema = z.object({
  spaceId: z.string().optional(),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().min(0).default(0),
})
export const BrainListDocsResultSchema = z.object({ docs: z.array(DocSchema), total: z.number() })
