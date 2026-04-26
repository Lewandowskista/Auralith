import { z } from 'zod'
import { eq, sql, inArray, lt } from 'drizzle-orm'
import { registerTool } from '@auralith/core-tools'
import { hybridSearch } from '@auralith/core-retrieval'
import { ingestFile, embedChunks, summarizeDoc, PIPELINE_VERSION } from '@auralith/core-ingest'
import { docs as docsTable, spaces as spacesTable, chunks as chunksTable } from '@auralith/core-db'
import type { DbBundle } from '@auralith/core-db'
import type { OllamaClient, ModelRouter } from '@auralith/core-ai'
import { getAiQueue } from '@auralith/core-ai'
import type Database from 'better-sqlite3'

export function registerBrainTools(
  getBundle: () => DbBundle,
  getEmbedClient: () => OllamaClient,
  embedModel: string,
  getSqlite: () => Database.Database,
  getRouter?: () => ModelRouter,
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
    id: 'brain.listSpaces',
    tier: 'safe',
    paramsSchema: z.object({}),
    resultSchema: z.object({
      spaces: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          slug: z.string(),
          docCount: z.number(),
          chunkCount: z.number(),
          indexedDocCount: z.number(),
        }),
      ),
      totalDocs: z.number(),
    }),
    describeForModel:
      'List all knowledge spaces with document and chunk counts. Use this to answer questions about what is in the knowledge base.',
    execute: async () => {
      const bundle = getBundle()
      const allSpaces = bundle.db.select().from(spacesTable).all()

      const spaces = await Promise.all(
        allSpaces.map(async (space) => {
          const docRows = bundle.db
            .select()
            .from(docsTable)
            .where(eq(docsTable.spaceId, space.id))
            .all()

          const docIds = docRows.map((d) => d.id)
          let chunkCount = 0
          if (docIds.length > 0) {
            const result = bundle.db
              .select({ count: sql<number>`count(*)` })
              .from(chunksTable)
              .where(inArray(chunksTable.docId, docIds))
              .get()
            chunkCount = result?.count ?? 0
          }

          const indexedDocCount = docRows.filter((d) => d.indexedAt !== null).length

          return {
            id: space.id,
            name: space.name,
            slug: space.slug,
            docCount: docRows.length,
            chunkCount,
            indexedDocCount,
          }
        }),
      )

      return {
        spaces,
        totalDocs: spaces.reduce((sum, s) => sum + s.docCount, 0),
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

      const router = getRouter?.()
      let indexed = 0
      for (const doc of docRows) {
        try {
          const ingestOpts: Parameters<typeof ingestFile>[2] = {
            spaceId: params.spaceId,
            sqlite: getSqlite(),
            onChunksReady: async (docId, chunkTexts) => {
              const chunkIds = chunkTexts.map((_, i) => `${docId}-${i}`)
              await embedChunks(docId, chunkIds, chunkTexts, embedClient, embedModel, bundle.vec)
            },
          }
          if (router) {
            const capturedRouter = router
            ingestOpts.onSummarize = async (docId, text) => {
              const aiQueue = getAiQueue()
              await aiQueue.enqueueBackgroundAiTask(async () => {
                const summary = await summarizeDoc(text, capturedRouter, getEmbedClient())
                if (summary) {
                  bundle.db.update(docsTable).set({ summary }).where(eq(docsTable.id, docId)).run()
                  updateDocsFts(getSqlite(), docId, summary)
                }
              })
            }
          }
          const result = await ingestFile(doc.path, bundle.db, ingestOpts)
          if (result.status === 'indexed') indexed++
        } catch {
          /* skip failed docs */
        }
      }
      return { indexed }
    },
  })

  registerTool({
    id: 'brain.reindexStaleDocs',
    tier: 'confirm',
    paramsSchema: z.object({}),
    resultSchema: z.object({ reindexed: z.number(), skipped: z.number() }),
    describeForModel: 'Re-index documents whose pipeline version is outdated.',
    execute: async () => {
      const bundle = getBundle()
      const router = getRouter?.()
      const embedClient = getEmbedClient()

      const staleDocs = bundle.db
        .select()
        .from(docsTable)
        .where(lt(docsTable.pipelineVersion, PIPELINE_VERSION))
        .all()

      let reindexed = 0
      let skipped = 0
      for (const doc of staleDocs) {
        try {
          const reindexOpts: Parameters<typeof ingestFile>[2] = {
            sqlite: getSqlite(),
            onChunksReady: async (docId, chunkTexts) => {
              const chunkIds = chunkTexts.map((_, i) => `${docId}-${i}`)
              await embedChunks(docId, chunkIds, chunkTexts, embedClient, embedModel, bundle.vec)
            },
          }
          if (router) {
            const capturedRouter = router
            reindexOpts.onSummarize = async (docId, text) => {
              const aiQueue = getAiQueue()
              await aiQueue.enqueueBackgroundAiTask(async () => {
                const summary = await summarizeDoc(text, capturedRouter, embedClient)
                if (summary) {
                  bundle.db.update(docsTable).set({ summary }).where(eq(docsTable.id, docId)).run()
                  updateDocsFts(getSqlite(), docId, summary)
                }
              })
            }
          }
          const result = await ingestFile(doc.path, bundle.db, reindexOpts)
          if (result.status === 'indexed') reindexed++
          else skipped++
        } catch {
          skipped++
        }
      }
      return { reindexed, skipped }
    },
  })
}

function updateDocsFts(sqlite: Database.Database, docId: string, summary: string): void {
  try {
    const row = sqlite.prepare(`SELECT rowid FROM docs WHERE id = ?`).get(docId) as
      | { rowid: number }
      | undefined
    if (!row) return
    sqlite.prepare(`DELETE FROM docs_fts WHERE rowid = ?`).run(row.rowid)
    sqlite.prepare(`INSERT INTO docs_fts(rowid, summary) VALUES (?, ?)`).run(row.rowid, summary)
  } catch {
    // Non-fatal
  }
}
