import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { registerTool } from '@auralith/core-tools'
import { hybridSearch } from '@auralith/core-retrieval'
import { ingestFile, embedChunks } from '@auralith/core-ingest'
import { docs as docsTable } from '@auralith/core-db'
import type { DbBundle } from '@auralith/core-db'
import type { OllamaClient } from '@auralith/core-ai'
import type Database from 'better-sqlite3'

export function registerBrainTools(
  getBundle: () => DbBundle,
  getEmbedClient: () => OllamaClient,
  embedModel: string,
  getSqlite: () => Database.Database,
): void {
  registerTool({
    id: 'brain.search',
    tier: 'safe',
    paramsSchema: z.object({
      query: z.string(),
      limit: z.number().int().min(1).max(20).default(5),
    }),
    resultSchema: z.object({
      results: z.array(z.object({ docPath: z.string(), snippet: z.string(), score: z.number() })),
    }),
    describeForModel: 'Search the local knowledge base using hybrid FTS + vector search.',
    execute: async (params) => {
      const bundle = getBundle()
      const embedClient = getEmbedClient()
      const sqlite = getSqlite()
      const limit = params.limit ?? 5

      const hits = await hybridSearch(
        { query: params.query, topK: limit },
        bundle.db,
        sqlite,
        bundle.vec,
        embedClient,
        embedModel,
      )
      return {
        results: hits.map((h) => ({
          docPath: h.docPath,
          snippet: h.text.slice(0, 200),
          score: h.score,
        })),
      }
    },
  })

  registerTool({
    id: 'brain.reindexSpace',
    tier: 'confirm',
    paramsSchema: z.object({ spaceId: z.string() }),
    resultSchema: z.object({ indexed: z.number() }),
    describeForModel: 'Re-index all documents in a knowledge space.',
    execute: async (params) => {
      const bundle = getBundle()
      const embedClient = getEmbedClient()
      const docRows = bundle.db
        .select()
        .from(docsTable)
        .where(eq(docsTable.spaceId, params.spaceId))
        .all()

      let indexed = 0
      for (const doc of docRows) {
        try {
          const result = await ingestFile(doc.path, bundle.db, {
            spaceId: params.spaceId,
            onChunksReady: async (docId, chunkTexts) => {
              const chunkIds = chunkTexts.map((_, i) => `${docId}-${i}`)
              await embedChunks(docId, chunkIds, chunkTexts, embedClient, embedModel, bundle.vec)
            },
          })
          if (result.status === 'indexed') indexed++
        } catch {
          /* skip failed docs */
        }
      }
      return { indexed }
    },
  })
}
